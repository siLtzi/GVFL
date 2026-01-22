const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { DateTime } = require("luxon");
const db = require("../bot/utils/firebase");
require("dotenv").config();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const fantasyJsonUrl = "https://www.hltv.org/fantasy/json"; // Update if needed

async function checkForNewFantasyLeagues() {
  try {
    const res = await fetch(fantasyJsonUrl, {
      headers: {
        "User-Agent":
          "curl/8.12.1",
        Accept: "application/json",
      },
    });
    console.log("📡 Fetched fantasy JSON from HLTV");

    const json = await res.json();
    console.log("🧩 Parsed JSON keys:", Object.keys(json));

    const now = Date.now();

    for (const month of json.monthlyEvents) {
      if (month.monthState === "ENDED") continue;

      for (const event of month.events) {
        const fantasyId = event.fantasyId?.id;
        const name = event.name;
        const state = event.state?.type;

        if (!fantasyId || !name || !state) continue;

        console.log(`🔍 Found: ${name} | state: ${state}`);

        if (
          state !== "org.hltv.jscommon.fantasy.dto.EventState.LiveEvent" &&
          state !== "org.hltv.jscommon.fantasy.dto.EventState.DraftEvent"
        ) {
          console.log(`⏩ Skipping ${name} (not live or draft)`);
          continue;
        }

        const existsSnap = await db
          .collection("fantasyLinks")
          .where("fantasyId", "==", fantasyId)
          .get();
        if (!existsSnap.empty) {
          console.log(`🔁 Already processed: ${name}`);
          continue;
        }

        console.log(`📦 Queuing new: ${name}`);

        await db.collection("detectedFantasyLeagues").doc(name).set({
          eventName: name,
          fantasyId,
          detectedAt: Date.now(),
          processed: false,
          state,
        });
      }
    }
  } catch (err) {
    console.error("❌ Failed to check fantasy leagues:", err.message);
  }
}

module.exports = checkForNewFantasyLeagues;

// Run manually or on interval:
checkForNewFantasyLeagues();
