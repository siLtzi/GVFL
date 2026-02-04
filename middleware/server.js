// server.js (clean rebuild for whatsapp-web.js)
require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const { DateTime } = require("luxon");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const fs = require("fs");
const path = require("path");

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const puppeteer = require("puppeteer");

const app = express();
app.use(bodyParser.json());

const WA_DEBUG = process.env.WHATSAPP_DEBUG === "1" || process.env.WHATSAPP_DEBUG === "true";

/* -------------------- state -------------------- */
let waClient = null;
let ready = false;
let lastState = null;
let statePoll = null;

/* -------------------- setup -------------------- */
const TOKENS_DIR = path.join(__dirname, "..", "wwebjs_session");
if (!fs.existsSync(TOKENS_DIR)) {
  fs.mkdirSync(TOKENS_DIR, { recursive: true });
}
console.log("📂 WhatsApp session directory:", TOKENS_DIR);

const exePath = process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();
console.log("Using Chromium at:", exePath);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const startStatePolling = (reason) => {
  if (statePoll) clearInterval(statePoll);
  const startedAt = Date.now();
  statePoll = setInterval(async () => {
    try {
      const state = await waClient.getState();
      lastState = state;
      if (state === "CONNECTED") {
        ready = true;
        console.log("✅ WhatsApp connected (state polling)");
        console.log("👤 Logged in as:", waClient.info?.pushname || waClient.info?.wid?.user || "unknown");
        clearInterval(statePoll);
        statePoll = null;
      }
    } catch (err) {
      console.warn("⚠️  State poll failed:", err?.message || err);
    }

    if (Date.now() - startedAt > 60000) {
      console.warn(`⚠️  State poll timeout (${reason}) - still not CONNECTED`);
      clearInterval(statePoll);
      statePoll = null;
    }
  }, 3000);
};

const createClient = () =>
  new Client({
    authStrategy: new LocalAuth({
      clientId: "gvfl-bot",
      dataPath: TOKENS_DIR,
    }),
    puppeteer: {
      headless: true,
      executablePath: exePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
      ],
    },
  });

const attachHandlers = (client) => {
  client.on("qr", (qr) => {
    console.log(
      "📲 Scan this QR with your WhatsApp app (WhatsApp → Linked devices → Link a device):"
    );
    qrcode.generate(qr, { small: true });
  });

  client.on("authenticated", () => {
    console.log("🔐 Authenticated - session saved");
    startStatePolling("post-auth");
  });

  client.on("auth_failure", (m) => {
    console.error("❌ Auth failure:", m);
  });

  client.on("ready", () => {
    ready = true;
    console.log("✅ WhatsApp ready and connected!");
    console.log("👤 Logged in as:", client.info?.pushname || client.info?.wid?.user || "unknown");
  });

  client.on("change_state", (state) => {
    lastState = state;
    console.log("🔄 WhatsApp state:", state);
    ready = state === "CONNECTED";
  });

  client.on("disconnected", (reason) => {
    ready = false;
    if (statePoll) clearInterval(statePoll);
    console.warn("⚠️ Disconnected:", reason);
  });

  client.on("message", async (message) => {
    try {
      if (WA_DEBUG) {
        console.log("📥 WA message", {
          from: message.from,
          isGroup: message.isGroup,
          fromMe: message.fromMe,
          body: message.body?.slice?.(0, 200),
        });
      }

      if (message.isGroup && message.from !== process.env.WHATSAPP_GROUP_ID) {
        console.log("ℹ️ Incoming group message from:", message.from, "(not configured group)");
        return;
      }

      if (message.from !== process.env.WHATSAPP_GROUP_ID) return;
      if (!ready) {
        console.warn("↪︎ Message ignored: session not ready yet");
        return;
      }

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
            "User-Agent": "curl/8.12.1",
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

  client.on("message_create", (message) => {
    if (!WA_DEBUG) return;
    console.log("📤 WA message_create", {
      from: message.from,
      isGroup: message.isGroup,
      fromMe: message.fromMe,
      body: message.body?.slice?.(0, 200),
    });
  });
};

waClient = createClient();
attachHandlers(waClient);
waClient.initialize().catch((err) => console.error("❌ wwebjs init error:", err));

/* -------------------- helpers & routes -------------------- */
function extractIdsFromLink(url) {
  const fantasyMatch = url.match(/fantasy\/(\d+)\//);
  const leagueMatch = url.match(/league\/(\d+)/);
  if (!fantasyMatch || !leagueMatch) throw new Error("Invalid HLTV join link");
  return { fantasyId: Number(fantasyMatch[1]), leagueId: Number(leagueMatch[1]) };
}

async function ensureConnected() {
  const state = await waClient.getState().catch(() => null);
  lastState = state || lastState;
  ready = state === "CONNECTED";
  return ready;
}

async function safeSendMessage(to, text, retries = 4) {
  for (let i = 0; i < retries; i++) {
    const ok = await ensureConnected();
    if (!ok) throw new Error(`WhatsApp not connected (state: ${lastState || "unknown"})`);

    try {
      await sleep(150);
      await waClient.sendMessage(to, text);
      return;
    } catch (err) {
      const delay = Math.min(500 * (i + 1), 2500);
      console.warn(`⚠️ sendMessage failed (attempt ${i + 1}/${retries}): ${err.message}`);
      await sleep(delay);
    }
  }
  throw new Error("sendMessage failed after retries");
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    whatsapp: { ready, connected: !!waClient?.info?.wid, state: lastState || null },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/wa-debug", async (_req, res) => {
  const state = await waClient?.getState().catch(() => null);
  lastState = state || lastState;
  if (state === "CONNECTED") ready = true;
  res.json({
    ready,
    hasClient: !!waClient,
    state: state || null,
    me: waClient?.info?.wid?._serialized || null,
    pushname: waClient?.info?.pushname || null,
  });
});

// Health check for Discord command retry logic
app.get("/wa-ready", (_req, res) => {
  res.json({
    ready,
    hasClient: !!waClient,
    me: waClient?.info?.wid?._serialized || null,
    state: lastState || null,
  });
});

app.post("/send-whatsapp", async (req, res) => {
  if (!waClient) return res.status(503).send("WhatsApp client not initialized");

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

  const target = to || process.env.WHATSAPP_GROUP_ID;
  if (!target) return res.status(400).send("Missing target (to) and WHATSAPP_GROUP_ID not set");
  if (!target.includes("@")) {
    return res.status(400).send(
      "Invalid WhatsApp target. Must be a full chat id like 12345@g.us or 1234567890@c.us"
    );
  }

  try {
    await safeSendMessage(target, finalMessage);
    console.log("✅ WhatsApp message sent");
    res.send("ok");
  } catch (err) {
    console.error("❌ Failed to send WhatsApp message:", err.message);
    res.status(500).send(err.message || "fail");
  }
});

// Discord ➜ Trigger season leaderboard (kept intact)
app.post("/trigger-season", async (req, res) => {
  const db = require("../bot/utils/firebase");

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

      return `*#${i + 1}*${spacer}**${entry.username}** – \`${entry.points} pts\`\n${spacer}${spacer}🥇${first} 🥈${second} 🥉${third}`;
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
