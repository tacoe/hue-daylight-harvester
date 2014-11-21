Hue Daylight Harvester
======================

Full-automatic day-round control of hue lights using light sensors on a Beaglebone Black. (A bit like what we think Stack Lighting's upcoming Alba light)

Usage
==
* Wire up a light sensor (photosensor) to a beaglebone black (be sure to use a pullup resistor). Use Analog In 1 (P9_40). Be sure to use the Analog VDC and Analog GND lines!
* Put the beaglebone and light sensor in a place where they see indirect light on a bright surface. Make sure your hue lights are close enough to the surface to noticably influence its perceived brightness.
* If not yet done, set the timezone on your beaglebone using `dpkg-reconfigure tzdata`
* npm install packages: q, moment
* In autohue.js, set the USERNAME property to an approved developer name on your bridge (see Hue API site)
* In autohue.js, change the LIGHTS and LIGHTFACTORS arrays to match your setup
* Turn everything on: `node autohue.js` in a SSH console on the beaglebone
* In autohue.js, change the DESIRED based on your situation. Look at the 'act' value in the logging for the current value;
  derive your 'desired' from that.
* Once everything is set, autorun the script (Cloud9 IDE's autorun folder, or a systemd service)

Taco Ekkel & Chris Waalberg
