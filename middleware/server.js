const express = require("express");
const bodyParser = require("body-parser");
const venom = require("venom-bot");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const { HLTV } = require("hltv");
require("dotenv").config();

let venomClient = null;

venom.create({ session: "gvfl-bot", multidevice: true }).then((client) => {
  venomClient = client;
  console.log("✅ Venom client ready");

  // 🔁 WhatsApp ➜ Discord
  client.onMessage(async (message) => {
    console.log(
      `[📨] Message received from ${message.chatId}: ${message.body}`
    );

    const fantasyRegex = /(https?:\/\/www\.hltv\.org\/fantasy\/[^\s]+)/i;
    const match = message.body.match(fantasyRegex);

    if (match) {
      const fantasyLink = match[1];

      // Try to get event info using HLTV
      let eventName = "Unknown Event";
      let startsIn = "Unknown";

      try {
        const events = await HLTV.getEvents();
        const now = Date.now();

        const upcoming = events.find((e) =>
          fantasyLink
            .toLowerCase()
            .includes(e.name.toLowerCase().replace(/\s+/g, "-"))
        );

        if (upcoming && upcoming.dateStart) {
          eventName = upcoming.name;

          const seconds = Math.floor(
            new Date(upcoming.dateStart).getTime() / 1000
          );
          startsIn = `<t:${seconds}:R>`;
        }
      } catch (err) {
        console.error("Couldn't fetch HLTV event info:", err.message);
      }

      const embedPayload = {
        embeds: [
          {
            description:
              `🎮 ${eventName}\n` +
              `🔗 [JOIN THE LEAGUE](${fantasyLink})\n` +
              `🕒 Starts\n${startsIn}`,
            color: 0x00ccff,
          },
        ],
      };

      try {
        await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(embedPayload),
        });

        console.log("✅ Forwarded fantasy link to Discord");
      } catch (err) {
        console.error("❌ Failed to send to Discord:", err.message);
      }
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
