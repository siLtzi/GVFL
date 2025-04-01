const express = require("express");
const bodyParser = require("body-parser");
const venom = require("venom-bot");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

require("dotenv").config();

let venomClient = null;

venom.create({ session: "gvfl-bot", multidevice: true }).then((client) => {
  venomClient = client;
  console.log("✅ Venom client ready");

  // 🔁 WhatsApp ➜ Discord
  client.onMessage(async (message) => {
    console.log(`[📨] Message received from ${message.chatId}: ${message.body}`);

    const fantasyRegex = /(https?:\/\/www\.hltv\.org\/fantasy\/\d+\/league\/\d+\/join\?secret=[^\s]+)/i;
    const match = message.body.match(fantasyRegex);

    if (!match) return;

    const fantasyLink = match[1];

    const payload = {
      content: `🟢 New fantasy league posted on WhatsApp\n🔗 [JOIN THE LEAGUE](${fantasyLink})`,
    };

    try {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("✅ Fantasy league link forwarded to Discord");
    } catch (err) {
      console.error("❌ Failed to send to Discord:", err.message);
    }
  });
});

const app = express();
app.use(bodyParser.json());

// Discord ➜ WhatsApp
app.post("/send-whatsapp", async (req, res) => {
  const { event, fantasyLink, hltvLink, timestamp } = req.body;

  if (!venomClient) return res.status(500).send("Venom not ready");

  const message =
    `🎮 *${event}*\n` +
    `🕒 Starts: ${timestamp || "Unknown"}\n` +
    `🔗 Fantasy League: ${fantasyLink}\n` +
    `🌐 Event Page: ${hltvLink}`;

  try {
    await venomClient.sendText(process.env.WHATSAPP_GROUP_ID, message);
    console.log("✅ WhatsApp message sent");
    res.send("ok");
  } catch (err) {
    console.error("❌ Failed to send message:", err);
    res.status(500).send("fail");
  }
});

app.listen(3001, () => {
  console.log("🌐 WhatsApp middleware listening on port 3001");
});
