/*
    AUTOHUE
    A daylight harvester for Hue, to automate light

    Taco Ekkel, Chris Waalberg
    
    NOTES
    - set the timezone on your beaglebone using `dpkg-reconfigure tzdata`
    - npm install packages: q, moment
    - change the DESIRED based on your situation. Look at the 'act' value in the logging for the current value; 
      derive your 'desired' from that.
*/

var b = require('bonescript');
var q = require('q');
var request = require('request');
var moment = require('moment');

// 'desired' needs very careful calibration based on location and all light sources. 
// moving the sensor, changing a lamp, etc all imply recalibrating.
var DESIRED = 0.30;

// max is absolute, i.e. when the schedule says 100%
var MAX = 0.95;

// this prevents the lights from continously shifting a little bit, 
// caused by fluctuation in the sensor reading
var THRESHOLD = 0.02;

var LIGHTS = [ 1, 2, 3 ];        // 'ardcode me lites, matey
var LIGHTFACTORS = [ 1, 1, 0.5 ]; // use values < 1 to scale down global max per light

var BRIDGEIP = null;
var CURRENTBRI = null;
var USERNAME = "newdeveloper";
var PININ = "P9_40"; // AIN1
var INTERVAL = 2 * 1000; // every 10 seconds

// setup: get bridge IP and start main loop with setInterval
getBridgeIP()
.then(function() {
    setInterval(mainLoop, INTERVAL);
}).fail(function(error) {
    console.log(" -- ERROR: " + error);
}).done();

function mainLoop() {
    getHueBrightness()
    .then(function() { 
        b.analogRead(PININ, calculateAction)
    }).fail(function(error) {
        console.log(" -- ERROR: " + error)
    }).done();
}

// given input x.value = light level between 0 and 1, what's the action the lights should take
// to get to the desired light level?
function calculateAction(analogReading) {
    if (CURRENTBRI == null) return;

    var now = moment();
    var actual = analogReading.value; 0.3
    var delta = CalcDesiredLightLevel(DESIRED, now) - actual; 
    var huecurrent = CURRENTBRI;
    var huetarget = huecurrent + delta;
    if (huetarget < 0) huetarget = 0;
    if (huetarget > MAX) huetarget = MAX;
    var colortemptarget = CalcDesiredColorTemperature(now);

    console.log('hue=' + huecurrent + ',act=' + actual + ',d=' + delta + ',tgt=' + huetarget + ',ct=' + colortemptarget);

    // TODO make threshold check work with color temp changes
    // if (Math.abs(delta) > THRESHOLD) 
    setHueBrightnessAndCT(huetarget, colortemptarget);
}

// in: calibrated desired brightness, current time
// out: brightness compensated down for time of day
function CalcDesiredLightLevel(targetValue, currentTime) {
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
            factor = 100; // normal daytime
            break;
        case (mins < 24 * 60): // fade down to 50% between dinner and midnight
            factor = 1.0 - (((mins/60)-19)/5) * 0.6; 
            break;
        default:
            console.log(" -- WARNING: unexpected minute count " + mins);
    }
    console.log("Brightness multiplier: " + factor)
    targetValue *= factor;
    // TODO: override to 0 if Nest set to away
    return targetValue;
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
            colorTemp = 2700 - (((mins/60)-19)/5) * (dayTemp-nightTemp);
            break;
        default:
            console.log(" -- WARNING: unexpected minute count " + mins);
    }
    //console.log("Color temperature: " + colorTemp);
    return colorTemp;
}

function getHueBrightness() {
    var deferred = q.defer();
    var light = 2;
    var url = 'http://' + BRIDGEIP + '/api/' + USERNAME + '/lights/' + light;
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
    // console.log(' -- setLightState: ' + url, JSON.stringify(state));
    request.put({
        url: url,
        json: state
    }, function(error, response, body) {
        if (response.statusCode != 200) {
            console.log(' -- ERROR: Light state not set: ' + response.statusCode, body);
        }
    });
}

function getBridgeIP() {
    var deferred = q.defer();
    request('http://www.meethue.com/api/nupnp', function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var json = JSON.parse(body);
            if (!json || !json[0] || !json[0].internalipaddress) {
                deferred.reject(' -- ERROR: No bridge found.');
            }
            else {
                BRIDGEIP = json[0].internalipaddress;
                console.log(' -- BridgeIP found: ' + BRIDGEIP);
                deferred.resolve();
            }
        }
        else {
            deferred.reject(' -- ERROR: cannot reach hue NUPNP');
        }
    });
    return deferred.promise;
}

