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
let lastState = null;

/* -------------------- utils -------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeSendMessage(client, to, text, retries = 6) {
  for (let i = 0; i < retries; i++) {
    try {
      if (!ready) throw new Error("Not ready yet");

      const state = await client.getState().catch(() => null);
      if (state && state !== "CONNECTED") {
        throw new Error(`Client state: ${state}`);
      }
      
      await sleep(150); // small settle delay
      await client.sendMessage(to, text);
      return;
    } catch (e) {
      const errorMsg = e?.message || String(e);
      
      // If frame is detached or page closed, don't retry - wait for reconnect
      if (errorMsg.includes("detached") || errorMsg.includes("closed") || errorMsg.includes("Target closed")) {
        console.error("❌ Browser frame/page is detached. Waiting for reconnect...");
        throw new Error("Client needs reconnection - frame detached");
      }
      
      const delay = Math.min(500 * (i + 1), 3000);
      console.warn(
        `⚠️ sendMessage blocked (attempt ${i + 1}/${retries}): ${errorMsg}. Retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }
  throw new Error("sendMessage failed after retries");
}

/* -------------------- WhatsApp init (wwebjs) -------------------- */
// Use a dedicated directory for wwebjs session (separate from old Venom tokens)
const TOKENS_DIR = path.join(__dirname, "..", "wwebjs_session");

// Ensure directory exists
if (!fs.existsSync(TOKENS_DIR)) {
  fs.mkdirSync(TOKENS_DIR, { recursive: true });
}

console.log("📂 WhatsApp session directory:", TOKENS_DIR);

waClient = new Client({
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

waClient.on("qr", (qr) => {
  console.log(
    "📲 Scan this QR with your WhatsApp app (WhatsApp → Linked devices → Link a device):"
  );
  console.log("⚠️  WhatsApp session not found - QR code generated. Please scan to authenticate.");
  qrcode.generate(qr, { small: true }); // terminal-friendly QR only
});

// Workaround for WhatsApp A/B testing bug where "ready" event never fires
let authTimeout = null;
let statePoll = null;

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

waClient.on("authenticated", () => {
  console.log("🔐 Authenticated - session saved");

  // If ready doesn't fire, rely on state polling instead of forcing ready
  if (authTimeout) clearTimeout(authTimeout);
  authTimeout = setTimeout(() => {
    if (!ready) {
      console.log("⚠️  Ready event didn't fire (WhatsApp A/B bug), starting state polling...");
      startStatePolling("post-auth");
    }
  }, 10000);
});

waClient.on("auth_failure", (m) => {
  if (authTimeout) clearTimeout(authTimeout);
  console.error("❌ Auth failure:", m);
});

waClient.on("change_state", (state) => {
  lastState = state;
  console.log("🔄 WhatsApp state:", state);
  if (state === "CONNECTED") {
    ready = true;
  }
  if (["UNPAIRED", "UNPAIRED_IDLE", "CONFLICT", "DEPRECATED_VERSION", "TOS_BLOCK", "TIMEOUT"].includes(state)) {
    ready = false;
  }
});

waClient.on("ready", () => {
  if (authTimeout) clearTimeout(authTimeout);
  ready = true;
  console.log("✅ WhatsApp ready and connected!");
  console.log("📂 Session stored in:", TOKENS_DIR);
  console.log("👤 Logged in as:", waClient.info?.pushname || waClient.info?.wid?.user || "unknown");
});
waClient.on("disconnected", async (reason) => {
  if (authTimeout) clearTimeout(authTimeout);
  if (statePoll) clearInterval(statePoll);
  ready = false;
  console.warn("⚠️ Disconnected:", reason);
  
  // Destroy the old client to clean up any stale browser frames
  try {
    await waClient.destroy();
    console.log("🧹 Old client destroyed");
  } catch (e) {
    console.warn("⚠️ Could not destroy old client:", e?.message);
  }

  // Recreate and reinitialize after a delay
  setTimeout(async () => {
    console.log("🔄 Attempting to reconnect with fresh client...");
    try {
      waClient = new Client({
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

      // Re-attach event handlers
      waClient.on("qr", (qr) => {
        console.log("📲 Scan this QR with your WhatsApp app:");
        qrcode.generate(qr, { small: true });
      });
      waClient.on("authenticated", () => console.log("🔐 Authenticated"));
      waClient.on("auth_failure", (m) => console.error("❌ Auth failure:", m));
      waClient.on("ready", () => {
        ready = true;
        console.log("✅ WhatsApp ready (reconnected)");
      });
      waClient.on("change_state", (state) => {
        lastState = state;
        console.log("🔄 WhatsApp state:", state);
        if (state === "CONNECTED") ready = true;
        if (["UNPAIRED", "UNPAIRED_IDLE", "CONFLICT", "DEPRECATED_VERSION", "TOS_BLOCK", "TIMEOUT"].includes(state)) ready = false;
      });
      waClient.on("disconnected", arguments.callee); // Recursively attach this handler

      await waClient.initialize();
    } catch (err) {
      console.error("❌ Reconnection failed:", err?.message || err);
      // Retry again after 30 seconds
      setTimeout(() => waClient.initialize().catch(console.error), 30000);
    }
  }, 10000); // Wait 10s before reconnecting
});

waClient.initialize().catch((err) =>
  console.error("❌ wwebjs init error:", err)
);

/* ---- inbound messages from WhatsApp (ported from Venom version) ---- */
waClient.on("message", async (message) => {
  try {
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

/* -------------------- helpers & routes -------------------- */
function extractIdsFromLink(url) {
  const fantasyMatch = url.match(/fantasy\/(\d+)\//);
  const leagueMatch = url.match(/league\/(\d+)/);
  if (!fantasyMatch || !leagueMatch) throw new Error("Invalid HLTV join link");
  return { fantasyId: Number(fantasyMatch[1]), leagueId: Number(leagueMatch[1]) };
}

// Health check for Discord command retry logic
app.get("/wa-ready", (_req, res) => {
  res.json({ ready, hasClient: !!waClient, me: waClient?.info?.wid?._serialized || null, state: lastState || null });
});

// General health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    whatsapp: { ready, connected: !!waClient?.info?.wid, state: lastState || null },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Debug endpoint for WhatsApp client status
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

// List WhatsApp groups for troubleshooting
app.get("/wa-groups", async (_req, res) => {
  try {
    const state = await waClient?.getState().catch(() => null);
    lastState = state || lastState;
    if (state !== "CONNECTED") {
      return res.status(503).send(`Client not connected (state: ${state || "unknown"})`);
    }
    ready = true;

    let groups = [];
    try {
      const chats = await waClient.getChats();
      groups = chats
        .filter((c) => c.isGroup)
        .map((c) => ({ id: c.id?._serialized, name: c.name }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } catch (err) {
      console.warn("⚠️ getChats failed, trying Store fallback:", err?.message || err);
      groups = await waClient.pupPage.evaluate(() => {
        try {
          const chats = window.Store?.Chat?.getModelsArray?.() || [];
          return chats
            .filter((c) => c.isGroup)
            .map((c) => ({ id: c.id?._serialized, name: c.name || c.formattedTitle || null }));
        } catch (e) {
          return { __error: e?.message || String(e) };
        }
      });
      if (groups && groups.__error) {
        return res.status(500).send(groups.__error);
      }
      groups = groups.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    res.json({ count: groups.length, groups });
  } catch (err) {
    res.status(500).send(err?.message || String(err));
  }
});

// Discord ➜ WhatsApp
app.post("/send-whatsapp", async (req, res) => {
  if (!waClient) {
    console.error("❌ WhatsApp client not initialized");
    return res.status(503).send("WhatsApp client not initialized");
  }
  if (!ready) {
    const state = await waClient.getState().catch(() => null);
    lastState = state;
    if (state === "CONNECTED") {
      ready = true;
    } else {
      console.error("❌ WhatsApp not ready. Check PM2 logs for QR code to scan.");
      return res.status(503).send("WhatsApp not connected. Check PM2 logs for QR code.");
    }
  }

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

    if (!target.includes("@")) {
      console.error("❌ Invalid WhatsApp target (missing @):", target);
      return res.status(400).send(
        "Invalid WhatsApp target. Must be a full chat id like 12345@g.us or 1234567890@c.us"
      );
    }

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
