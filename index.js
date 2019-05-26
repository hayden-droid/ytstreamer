const fetch = require("node-fetch");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const CHANNEL_ID = process.env.CHANNEL_ID;
const YT_API_KEY = process.env.YT_API_KEY;
const STREAMER = process.env.STREAMER;

async function checkIfChannelIsLive(channelId) {
  try {
    const resp = await fetch(`
        https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&type=video&eventType=live&key=${YT_API_KEY}
        `);
    const json = await resp.json();
    console.log(json);
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

let streamerProcess = null;
let lastStart = 0;
let lastLive = 0;
let isLive = false;

async function startStreamer() {
  if (streamerProcess) {
    try {
      await exec("kill -9 " + streamerProcess.pid);
      streamerProcess = null;
      console.log("Killed old streamer process.");
    } catch (err) {}
  }
  try {
    streamerProcess = await exec(STREAMER);
  } catch (err) {
    console.error("Failed to start streamer:", err);
    return;
  }
  lastStart = Date.now();
  console.info("Streamer started.");
}

async function loop() {
  while (true) {
    let wasLive = isLive;
    isLive = await checkIfChannelIsLive(CHANNEL_ID);
    if (!streamerProcess) {
      await startStreamer();
    } else {
      if (isLive) {
        if (!wasLive) {
          console.info("YT stream is online.");
        }
        lastLive = Date.now();
      } else {
        if (wasLive) {
          console.warn(
            "YT stream went offline. Will restart streamer in 5 minutes."
          );
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
    await sleep(1000 * 30);
  }
}

loop();
