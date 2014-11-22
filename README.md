Hue Daylight Harvester
======================

Full-automatic day-round control of hue lights using light sensors on a Beaglebone Black. (A bit like what Stack Lighting's upcoming Alba light promises to do). Started with the question: can't we just get rid of light controls altogether? Hue Daylight Harvester does the following continuously:
 * measure ambient light (daylight + artificial light) and fluidly adjusts hue light to come as close as possible to a 'desired' light level. This means turning down or off when the sun shines, turning back on when it suddenly gets cloudy, etc.
 * provide normal light level from breakfast throughout day; gradual dimming between dinner and midnight, fading out after midnight, off at night
 * set neutral color temperature during the day, fading to a warm and cozy temperature throughout the evening.

Notes
==
 * Only for test use, this stuff is wildly pre-alpha

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

Todo
====
 * Fix how scheduled fade-out interferes with harvesting behavior
 * Add script to install into systemd (cloud9 autorun folder is insecure and starts it before wifi is up, failing bridge connection)

Taco Ekkel & Chris Waalberg
