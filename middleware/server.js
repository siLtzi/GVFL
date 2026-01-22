// server.js (migrated from Venom to whatsapp-web.js)
require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const { DateTime } = require("luxon");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const fs = require("fs");
const path = require("path");

// --- WhatsApp (wwebjs) ---
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const puppeteer = require("puppeteer");

// Log which Chromium we’ll use
const exePath =
  process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();
console.log("Using Chromium at:", exePath);

const app = express();
app.use(bodyParser.json());

/* -------------------- state -------------------- */
let waClient = null;
let ready = false;

/* -------------------- utils -------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeSendMessage(client, to, text, retries = 6) {
  for (let i = 0; i < retries; i++) {
    try {
      if (!ready) throw new Error("Not ready yet");
      await sleep(150); // small settle delay
      await client.sendMessage(to, text);
      return;
    } catch (e) {
      const delay = Math.min(500 * (i + 1), 3000);
      console.warn(
        `⚠️ sendMessage blocked (attempt ${i + 1}/${retries}): ${e?.message || e}. Retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }
  throw new Error("sendMessage failed after retries");
}

/* -------------------- WhatsApp init (wwebjs) -------------------- */
const TOKENS_DIR = path.join(__dirname, "tokens", "gvfl-bot");

waClient = new Client({
  authStrategy: new LocalAuth({
    clientId: "gvfl-bot",
    dataPath: TOKENS_DIR, // persists under ./tokens/gvfl-bot/.wwebjs_auth
  }),
  puppeteer: {
    headless: true,
    executablePath: exePath, // ✅ cross-platform chromium path
    args:
      process.platform === "linux"
        ? ["--no-sandbox", "--disable-dev-shm-usage"]
        : [],
  },
});

waClient.on("qr", (qr) => {
  console.log(
    "📲 Scan this QR with your WhatsApp app (WhatsApp → Linked devices → Link a device):"
  );
  qrcode.generate(qr, { small: true }); // terminal-friendly QR only
});

waClient.on("authenticated", () => console.log("🔐 Authenticated"));
waClient.on("auth_failure", (m) => console.error("❌ Auth failure:", m));
waClient.on("ready", () => {
  ready = true;
  console.log("✅ WhatsApp ready");
  console.log("📂 Tokens directory:", TOKENS_DIR);
});
waClient.on("disconnected", (reason) => {
  ready = false;
  console.warn("⚠️ Disconnected:", reason);
  // Auto-reconnect after 5 seconds
  setTimeout(() => {
    console.log("🔄 Attempting to reconnect...");
    waClient.initialize().catch((err) =>
      console.error("❌ Reconnection failed:", err)
    );
  }, 5000);
});

waClient.initialize().catch((err) =>
  console.error("❌ wwebjs init error:", err)
);

/* ---- inbound messages from WhatsApp (ported from Venom version) ---- */
waClient.on("message", async (message) => {
  try {
    if (message.from !== process.env.WHATSAPP_GROUP_ID) return;
    if (!ready) {
      console.warn("↪︎ Message ignored: session not ready yet");
      return;
    }

    console.log(`[📨] Message received from group: ${message.body}`);

    // Parse fantasy link
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
      let timestamp = "Unknown";

      if (json.startDate && typeof json.startDate === "number" && json.startDate > 0) {
        const start = DateTime.fromMillis(json.startDate).setZone("Europe/Helsinki");
        timestamp = start.toFormat("cccc, dd LLL yyyy 'at' HH:mm");
      }

      const hltvLink = json.eventPageLink
        ? `https://hltv.org${json.eventPageLink}`
        : "https://hltv.org";

      let eventTeams = "Unknown";
      if (Array.isArray(json.topRatedPlayers)) {
        const uniqueTeams = new Set();
        json.topRatedPlayers.forEach((p) => p.team?.name && uniqueTeams.add(p.team.name));
        eventTeams = `${uniqueTeams.size}`;
      }

      const payload = {
        embeds: [
          {
            title: `🎮 ${eventName}`,
            description: `[JOIN THE LEAGUE](${fantasyLink})`,
            color: 0x00b894,
            thumbnail: { url: "https://i.imgur.com/STR5Ww3.png" },
            fields: [
              { name: "🕒 Starts", value: timestamp || "Unknown", inline: true },
              { name: "🏆 Teams Attending", value: eventTeams, inline: true },
              { name: "🌐 Event Page", value: `[View](${hltvLink})`, inline: false },
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
  } catch (e) {
    console.error("on message error:", e?.message || e);
  }
});

/* -------------------- helpers & routes -------------------- */
function extractIdsFromLink(url) {
  const fantasyMatch = url.match(/fantasy\/(\d+)\//);
  const leagueMatch = url.match(/league\/(\d+)/);
  if (!fantasyMatch || !leagueMatch) throw new Error("Invalid HLTV join link");
  return { fantasyId: Number(fantasyMatch[1]), leagueId: Number(leagueMatch[1]) };
}

// Health check for Discord command retry logic
app.get("/wa-ready", (_req, res) => {
  res.json({ ready, hasClient: !!waClient, me: waClient?.info?.wid?._serialized || null });
});

// General health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    whatsapp: { ready, connected: !!waClient?.info?.wid },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Discord ➜ WhatsApp
app.post("/send-whatsapp", async (req, res) => {
  if (!waClient) return res.status(503).send("WhatsApp client not initialized");
  if (!ready) return res.status(503).send("WhatsApp not connected. Scan QR first.");

  const { message, event, fantasyLink, hltvLink, timestamp, to } = req.body;
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
    const target = to || process.env.WHATSAPP_GROUP_ID;
    if (!target) return res.status(400).send("Missing target (to) and WHATSAPP_GROUP_ID not set");

    await safeSendMessage(waClient, target, finalMessage);
    console.log("✅ WhatsApp message sent");
    res.send("ok");
  } catch (err) {
    console.error("❌ Failed to send WhatsApp message:", err.message);
    res.status(500).send("fail");
  }
});

// Discord ➜ Trigger season leaderboard (kept intact)
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
        if (b.points !== a.points) return b.points - a.points;
        if ((b.first || 0) !== (a.first || 0)) return (b.first || 0) - (a.first || 0);
        if ((b.second || 0) !== (a.second || 0)) return (b.second || 0) - (a.second || 0);
        if ((b.third || 0) !== (a.third || 0)) return (b.third || 0) - (a.third || 0);
        if ((b.fourth || 0) !== (a.fourth || 0)) return (b.fourth || 0) - (a.fourth || 0);
        if ((b.fifth || 0) !== (a.fifth || 0)) return (b.fifth || 0) - (a.fifth || 0);
        if ((b.sixth || 0) !== (a.sixth || 0)) return (b.sixth || 0) - (a.sixth || 0);
        return 0;
      });

    const spacer = "\u2003";
    const lines = sorted.slice(0, 10).map((entry, i) => {
      const first = entry.first || 0;
      const second = entry.second || 0;
      const third = entry.third || 0;
      const fourth = entry.fourth || 0;
      const fifth = entry.fifth || 0;
      const sixth = entry.sixth || 0;

      return `*#${i + 1}*${spacer}**${entry.username}** – \`${entry.points} pts\`\n${spacer}${spacer}🥇${first} 🥈${second} 🥉${third} 4️⃣${fourth} 5️⃣${fifth} 6️⃣${sixth}`;
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

/* -------------------- start server -------------------- */
const PORT = process.env.WA_PORT || 3001;
app.listen(PORT, () => console.log(`🌐 WhatsApp middleware listening on port ${PORT}`));
