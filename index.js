const fetch = require("node-fetch");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const spawn = require("child_process").spawn;

const CHANNEL_ID = process.env.CHANNEL_ID;
const YT_API_KEY = process.env.YT_API_KEY;
const STREAMER = process.env.STREAMER;
const DEBUG = false;
const CHECK_INTERVAL = 60;

let streamerProcess = null;
let lastStart = 0;
let lastLive = 0;
let isLive = false;

let uptime = 0;
let downtime = 0;
let runtime = 0;

let lastLoopTime = null;

async function checkIfChannelIsLive(channelId) {
  try {
    const resp = await fetch(`
        https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live&key=${YT_API_KEY}
        `);
    const json = await resp.json();
    if (DEBUG) {
      console.log(json);
    }
    const items = json.items;
    if (items.length > 0) {
      return true;
    }
    return false;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startStreamer() {
  if (streamerProcess) {
    try {
      await exec("kill -9 " + streamerProcess.pid);
      streamerProcess = null;
      console.log("Killed old streamer process.");
    } catch (err) {}
  }
  try {
    if (STREAMER.includes("bash")) {
      const scriptPath = STREAMER.split("bash ")[1];
      streamerProcess = spawn("/bin/bash", [scriptPath]);
    } else if (STREAMER.includes(".sh")) {
      streamerProcess = spawn("/bin/bash", [STREAMER]);
    } else {
      streamerProcess = spawn(STREAMER);
    }
    if (DEBUG) {
      streamerProcess.stdout.on("data", data => {
        console.log(`stdout: ${data}`);
      });

      streamerProcess.stderr.on("data", data => {
        console.log(`stderr: ${data}`);
      });
    }
    streamerProcess.on("close", code => {
      console.log(`Streamer process exited with code ${code}`);
      streamerProcess = null;
    });
  } catch (err) {
    console.error("Failed to start streamer:", err);
    return;
  }
  lastStart = Date.now();
  console.info("Streamer started.");
}

function printUptime() {
  if (uptime <= 0 || runtime <= 0) {
    return;
  }
  const uptimePercent = Math.round((uptime / runtime) * 10000) / 100;
  console.log(`Uptime: ${uptimePercent}%`);
}

async function loop() {
  while (true) {
    if (!streamerProcess) {
      await startStreamer();
    } else {
      let wasLive = isLive;
      isLive = await checkIfChannelIsLive(CHANNEL_ID);
      if (isLive) {
        if (!wasLive) {
          console.info("YT stream is online.");
          printUptime();
        }
        lastLive = Date.now();
      } else {
        if (wasLive) {
          console.warn(
            "YT stream is offline. Will restart streamer if it won't go back online in 5 minutes."
          );
          printUptime();
        }
      }

      let timeFromLastLive = Date.now() - lastLive;
      let timeFromLastStart = Date.now() - lastStart;
      if (
        timeFromLastStart / 1000 > 1000 * 60 * 5 &&
        timeFromLastLive / 1000 > 1000 * 60 * 5
      ) {
        console.warn("Restarting streamer.");
        await startStreamer();
      }
    }
    let timeProgression = 0;
    if (lastLoopTime) {
      timeProgression = Date.now() - lastLoopTime;
    }
    if (isLive) {
      uptime += timeProgression;
    } else {
      downtime += timeProgression;
    }
    runtime += timeProgression;
    lastLoopTime = Date.now();
    await sleep(1000 * CHECK_INTERVAL);
  }
}

loop();
