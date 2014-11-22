/*
    AUTOHUE
    A daylight harvester for Hue. Why use a button or app in the first place? Light should just be there, and be right.

    Taco Ekkel, Chris Waalberg
    
    See README for instructions
*/

var b = require('bonescript');
var q = require('q');
var request = require('request');
var moment = require('moment');

// 'desired' needs very careful calibration based on location and all light sources.
// moving the sensor, changing a lamp, etc all imply recalibrating.
var DESIRED = 0.50;

// max is absolute, i.e. when the schedule says 100%
var MAX = 0.95;

// this prevents the lights from continously shifting a little bit,
// caused by fluctuation in the sensor reading
var THRESHOLD = 0.02;

var USERNAME = "newdeveloper";
var LIGHTS = [ 1, 2, 3 ];        // 'ardcode me lites, matey
var LIGHTFACTORS = [ 1, 1, 0.5 ]; // use values < 1 to scale down global max per light
var MEASURELIGHT = 2;               // what light to use as the reference (make sure its LIGHTFACTOR is 1)

var BRIDGEIP = null;
var CURRENTBRI = null;
var PININ = "P9_40"; // AIN1
var INTERVAL = 10 * 1000; // 

// setup: get bridge IP and start main loop with setInterval
log("AUTOHUE: Desired light level: " + DESIRED);
log("AUTOHUE: Measuring interval: " + INTERVAL/1000 + "s");
log("Connecting to bridge...");
getBridgeIP()
.then(function() {
    setInterval(mainLoop, INTERVAL);
}).fail(function(error) {
    log(" -- ERROR: " + error);
}).done();

function mainLoop() {
    getHueBrightness()
    .then(function() {
        b.analogRead(PININ, calculateAction)
    }).fail(function(error) {
        log(" -- ERROR: " + error)
    }).done();
}

// given input x.value = light level between 0 and 1, what's the action the lights should take
// to get to the desired light level?
function calculateAction(analogReading) {
    if (CURRENTBRI == null) return;

    var now = moment();
    var factor = GetTimeBasedFactor(now);
    
    var actual = analogReading.value;
    var delta = DESIRED - actual; 
    
    var huecurrent = CURRENTBRI;
    var huetarget = huecurrent + delta;
    if (huetarget < 0) huetarget = 0;
    if (huetarget > MAX * factor) huetarget = MAX * factor; // clamp down here to prevent interference with sensor reading
    var colortemptarget = CalcDesiredColorTemperature(now);

    function fn(f) { return Math.round(f*1000)/1000; }
    log('Sensor: ' + fn(actual) + ', hue: ' + fn(huecurrent) + '. Brightfactor: ' + fn(factor) +
                ', new hue: ' + fn(huetarget) + ' ' + Math.round(colortemptarget) + 'K');

    // TODO make threshold check work with color temp changes
    // if (Math.abs(delta) > THRESHOLD)
    setHueBrightnessAndCT(huetarget, colortemptarget);
}

// in: current time
// out: factor for multiplying target brightness compensated for time of day
function GetTimeBasedFactor(currentTime) {
    var mins = currentTime.hours() * 60 + currentTime.minutes();
    var factor = 1.0;
    switch(true) {
        case (mins < 60):
            factor = 0.4 - 0.4*(mins/60); // slow fade from midnight to 1am
            break;
        case (mins < 6 * 60):
            factor = 0; // night time, 1am to 6am
            break;
        case (mins < 19 * 60):
            factor = 1; // normal daytime
            break;
        case (mins < 24 * 60): // fade down to 40% between dinner and midnight
            factor = 1.0 - (((mins/60)-19)/5) * 0.6;
            break;
        default:
            log(" -- WARNING: unexpected minute count " + mins);
    }
    return factor;
}

function CalcDesiredColorTemperature(currentTime) {
    var mins = currentTime.hours() * 60 + currentTime.minutes();
    var dayTemp = 2800 // more or less incandescent
    var nightTemp = 2000; // warmest white available
    var colorTemp = dayTemp;
    switch(true) {
        case (mins < 6 * 60):
            colorTemp = nightTemp;
            break;
        case (mins < 19 * 60):
            colorTemp = dayTemp;
            break;
        case (mins < 24 * 60): //warm up between dinner (7pm) and midnight
            colorTemp = dayTemp - (((mins/60)-19)/5) * (dayTemp-nightTemp);
            break;
        default:
            log(" -- WARNING: unexpected minute count " + mins);
    }
    //log("Color temperature: " + colorTemp);
    return colorTemp;
}

function getHueBrightness() {
    var deferred = q.defer();
    var url = 'http://' + BRIDGEIP + '/api/' + USERNAME + '/lights/' + MEASURELIGHT;
    request(url, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var json = JSON.parse(body);
            if (!json || !json.state || !json.state.hasOwnProperty("bri")) {
                deferred.reject(' -- ERROR: No brightness value found.');
            } else {
                CURRENTBRI = json.state.bri / 255;
                deferred.resolve();
            }
        }
    });
    return deferred.promise;
}

function setHueBrightnessAndCT(brightness, colortemp) {
    var bri = brightness * 255;    // from [0..1] to [0..255]
    var ct = 1000000 / colortemp;  // convert color temperature to Mired
    for (var i = 0; i < LIGHTS.length; i++) {
        setHueLightBrightnessAndCT(LIGHTS[i], bri * LIGHTFACTORS[i], ct);
    }
}

function setHueLightBrightnessAndCT(light, bri, ct) {
    var url = 'http://' + BRIDGEIP + '/api/' + USERNAME + '/lights/' + light + '/state';
    var lampstate = (bri > 3.0);
    var state = { "bri": Math.round(bri), "ct": Math.round(ct), "on": lampstate };
    // log(' -- setLightState: ' + url, JSON.stringify(state));
    request.put({
        url: url,
        json: state
    }, function(error, response, body) {
        if (response.statusCode != 200) {
            log(' -- ERROR: Light state not set: ' + response.statusCode, body);
        }
    });
}

// get bridge, with retry (for use at system boot, when wifi may not yet be up)
function getBridgeIP(deferred) {
    var deferred = deferred || q.defer();
    request('http://www.meethue.com/api/nupnp', function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var json = JSON.parse(body);
            if (!json || !json[0] || !json[0].internalipaddress) {
                deferred.reject(' -- ERROR: No bridge registered in this network.');
            }
            else {
                BRIDGEIP = json[0].internalipaddress;
                log(' -- BridgeIP found: ' + BRIDGEIP);
                deferred.resolve();
            }
        }
        else {
            log(' -- Cannot connect to the network (http://www.meethue.com/api/nupnp). Retrying in 10.');
    		setTimeout(function() {
    			getBridgeIP(deferred);
    		}, 10 * 1000);
        }
    });
    return deferred.promise;
}

function log(s) {
    console.log(moment().format() + " " + s);
}