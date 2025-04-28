const express = require("express");
const bodyParser = require("body-parser");
const venom = require("venom-bot");
const { DateTime } = require("luxon");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

let venomClient = null;

venom
  .create({
    session: "gvfl-bot",
    multidevice: true,
    headless: "new", //Change to false when starting in VSCode/local, "new" when deploying to server
    useChrome: true,
    folderNameToken: "tokens",
    disableWelcome: true,
    logQR: false,
    autoClose: false,
  })
  .then((client) => {
    venomClient = client;
    console.log("✅ Venom client ready");

    app.listen(3001, () => {
      console.log("🌐 WhatsApp middleware listening on port 3001");
    });

    client.onMessage(async (message) => {
      // Only listen to your fantasy group
      if (message.chatId !== process.env.WHATSAPP_GROUP_ID) return;
    
      console.log(`[📨] Message received from group: ${message.body}`);

      const fantasyRegex =
        /(https?:\/\/www\.hltv\.org\/fantasy\/\d+\/league\/\d+\/join\?secret=[^\s]+)/i;
      const match = message.body.match(fantasyRegex);
      if (!match) return;

      const fantasyLink = match[1];
      const { fantasyId, leagueId } = extractIdsFromLink(fantasyLink);
      const overviewUrl = `https://www.hltv.org/fantasy/${fantasyId}/overview/json`;

      try {
        const res = await fetch(overviewUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: `https://www.hltv.org/fantasy/${fantasyId}/league/${leagueId}`,
          },
        });

        const text = await res.text();
        const json = JSON.parse(text);

        const eventName = json.eventName || "Unknown Event";
        let startTimeText = "TBA";
        let timestamp = "Unknown";

        if (
          json.startDate &&
          typeof json.startDate === "number" &&
          json.startDate > 0
        ) {
          const start = DateTime.fromMillis(json.startDate).setZone(
            "Europe/Helsinki"
          );
          startTimeText = `<t:${Math.floor(start.toSeconds())}:R>`;
          timestamp = start.toFormat("cccc, dd LLL yyyy 'at' HH:mm");
        }

        const hltvLink = json.eventPageLink
          ? `https://hltv.org${json.eventPageLink}`
          : "https://hltv.org";

        let eventTeams = "Unknown";
        if (Array.isArray(json.topRatedPlayers)) {
          const uniqueTeams = new Set();
          json.topRatedPlayers.forEach((p) => {
            if (p.team?.name) uniqueTeams.add(p.team.name);
          });
          eventTeams = `${uniqueTeams.size}`;
        }

        // Send to Discord webhook
        const payload = {
          embeds: [
            {
              title: `🎮 ${eventName}`,
              description: `[JOIN THE LEAGUE](${fantasyLink})`,
              color: 0x00b894,
              thumbnail: {
                url: "https://i.imgur.com/STR5Ww3.png",
              },
              fields: [
                {
                  name: "🕒 Starts",
                  value: timestamp || "Unknown",
                  inline: true,
                },
                { name: "🏆 Teams Attending", value: eventTeams, inline: true },
                {
                  name: "🌐 Event Page",
                  value: `[View](${hltvLink})`,
                  inline: false,
                },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        };

        await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        console.log("✅ Fantasy league link forwarded to Discord");
      } catch (err) {
        console.error("❌ Failed to process fantasy link:", err.message);
      }
    });
  })
  .catch((err) => {
    console.error("❌ Venom error:", err);
  });

const extractIdsFromLink = (url) => {
  const fantasyMatch = url.match(/fantasy\/(\d+)\//);
  const leagueMatch = url.match(/league\/(\d+)/);
  if (!fantasyMatch || !leagueMatch) throw new Error("Invalid HLTV join link");
  return {
    fantasyId: Number(fantasyMatch[1]),
    leagueId: Number(leagueMatch[1]),
  };
};

// Discord ➜ WhatsApp
app.post("/send-whatsapp", async (req, res) => {
  if (!venomClient) return res.status(500).send("Venom not ready");

  const { message, event, fantasyLink, hltvLink, timestamp } = req.body;

  let finalMessage = "";

  if (message) {
    finalMessage = message;
  } else if (event && fantasyLink && hltvLink) {
    finalMessage =
      `🎮 *${event}*\n` +
      `🕒 Starts: ${timestamp || "Unknown"}\n` +
      `🔗 Fantasy League: ${fantasyLink}\n` +
      `🌐 Event Page: ${hltvLink}`;
  } else {
    return res.status(400).send("❌ Invalid payload");
  }

  try {
    await venomClient.sendText(process.env.WHATSAPP_GROUP_ID, finalMessage);
    console.log("✅ WhatsApp message sent");
    res.send("ok");
  } catch (err) {
    console.error("❌ Failed to send WhatsApp message:", err.message);
    res.status(500).send("fail");
  }
});

// Discord ➜ Trigger season leaderboard
app.post("/trigger-season", async (req, res) => {
  const admin = require("firebase-admin");
  const db = require("../bot/utils/firebase");

  const { EmbedBuilder } = require("discord.js");

  try {
    const settingsSnap = await db.collection("settings").doc("config").get();
    if (!settingsSnap.exists) return res.status(400).send("No active season");

    const season = settingsSnap.data().currentSeason;
    const scoresSnap = await db.collection(`seasons/${season}/scores`).get();
    if (scoresSnap.empty) return res.status(400).send("No scores yet");

    const sorted = scoresSnap.docs
      .map((doc) => doc.data())
      .sort((a, b) => {
        if (b.points !== a.points) {
          return b.points - a.points; // Higher points first
        }
        if ((b.first || 0) !== (a.first || 0)) {
          return (b.first || 0) - (a.first || 0); // More 1st places wins
        }
        if ((b.second || 0) !== (a.second || 0)) {
          return (b.second || 0) - (a.second || 0); // More 2nd places wins
        }
        if ((b.third || 0) !== (a.third || 0)) {
          return (b.third || 0) - (a.third || 0); // More 3rd places wins
        }
        return 0; // Stay tied otherwise
      });

    const spacer = "\u2003";
    const lines = sorted.slice(0, 10).map((entry, i) => {
      const first = entry.first || 0;
      const second = entry.second || 0;
      const third = entry.third || 0;

      return `*#${i + 1}*${spacer}**${entry.username}** – \`${
        entry.points
      } pts\`\n${spacer}${spacer}🥇${first} 🥈${second} 🥉${third}`;
    });

    const embed = {
      title: `${season.toUpperCase()} Leaderboard`,
      description: lines.join("\n\n"),
      color: 0x2b2d31,
      thumbnail: { url: "https://i.imgur.com/STR5Ww3.png" },
      timestamp: new Date().toISOString(),
    };

    await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    console.log("✅ Season leaderboard embed sent");
    res.send("OK");
  } catch (err) {
    console.error("❌ Failed to send season leaderboard:", err.message);
    res.status(500).send("fail");
  }
});
