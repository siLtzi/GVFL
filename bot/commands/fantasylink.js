// bot/commands/fantasylink.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const { HLTV } = require("hltv");
const axios = require("axios");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fantasylink")
    .setDescription("Add a fantasy league link to be tracked")
    .addStringOption((option) =>
      option
        .setName("link")
        .setDescription("Full link to the fantasy league")
        .setRequired(true)
    ),

  async execute(interaction, db) {
    const fantasyLink = interaction.options.getString("link");

    // 🔒 Only if there is an ongoing season
    const settingsSnap = await db.collection("settings").doc("config").get();
    if (!settingsSnap.exists) {
      return await interaction.reply({
        content: "❌ No settings found. A season must be configured first.",
        ephemeral: true,
      });
    }

    const settings = settingsSnap.data();
    const currentSeason = settings.currentSeason;
    const isActive = settings.active ?? true;

    if (!currentSeason || isActive === false) {
      return await interaction.reply({
        content:
          "🛑 There is no active GVFL season right now — cannot add a fantasy league.",
        ephemeral: true,
      });
    }

    const matches = fantasyLink.match(/fantasy\/(\d+)\/league\/(\d+)/);
    if (!matches) {
      return await interaction.reply({
        content: "❌ Invalid fantasy league link.",
        ephemeral: true,
      });
    }

    const fantasyId = Number(matches[1]);
    const leagueId = Number(matches[2]);

    const overviewUrl = `https://www.hltv.org/fantasy/${fantasyId}/overview/json`;
    let eventName = "Unknown Event";
    let startTimeText = "Unknown";
    let timestamp = null;
    let eventTeams = "Unknown";
    let hltvLink = "https://hltv.org";

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
      let json;
      try {
        json = JSON.parse(text);
      } catch (err) {
        console.error("❌ Failed to parse HLTV JSON:", err.message);
        return await interaction.reply({
          content:
            "❌ HLTV returned unexpected data (possibly blocked or down).",
          ephemeral: true,
        });
      }

      eventName = json.eventName;

      if (json.eventPageLink) {
        const eventId = Number(json.eventPageLink.split("/")[2]);
        const slug =
          json.eventPageLink.split("/")[3] ||
          eventName.toLowerCase().replace(/\s+/g, "-");
        hltvLink = `https://hltv.org/events/${eventId}/${slug}`;

        try {
          console.log("🆔 Event ID parsed from eventPageLink:", eventId);
          const eventData = await HLTV.getEvent({ id: eventId });
          if (eventData?.dateStart) {
            const start = DateTime.fromMillis(eventData.dateStart).setZone(
              "Europe/Helsinki"
            );
            startTimeText = `<t:${Math.floor(start.toSeconds())}:R>`;
            timestamp = start.toFormat("cccc, dd LLL yyyy 'at' HH:mm");
          } else {
            startTimeText = "TBA";
          }
          if (Array.isArray(eventData?.teams)) {
            eventTeams = `${eventData.teams.length}`;
          }
        } catch (e) {
          console.warn("⚠️ HLTV.getEvent failed:", e.message || e);
          startTimeText = "TBA";
        }
      }
    } catch (err) {
      console.error("❌ Failed to fetch fantasy overview:", err.message);
      return await interaction.reply({
        content: "Failed to fetch HLTV data from link.",
        ephemeral: true,
      });
    }

    try {
      const docId = `${fantasyId}_${leagueId}`;
      await db.collection("fantasyLinks").doc(docId).set({
        eventName,
        fantasyLink,
        fantasyId,
        leagueId,
        hltvLink,
        readableTime: timestamp,
        teams: eventTeams,
        addedBy: interaction.user.id,
        timestamp: Date.now(),
        processed: false,
      });
    } catch (err) {
      console.error("❌ Error saving to Firebase:", err.message);
      return await interaction.reply({
        content: "Failed to save to database.",
        ephemeral: true,
      });
    }

    const gvflRoleMention = "<@&1026082306844282881>";
    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${eventName}`)
      .setColor(0x0099ff)
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setDescription(`🔗 [JOIN THE LEAGUE](${fantasyLink})`)
      .addFields(
        { name: "🕒 Starts", value: startTimeText },
        { name: "🏆 Teams Attending", value: eventTeams }
      );

    await interaction.reply({ content: `${gvflRoleMention}`, embeds: [embed] });

    // ---- WhatsApp send with readiness retry ----
    async function sendToWhatsAppWithRetry(payload, maxAttempts = 8) {
      for (let i = 1; i <= maxAttempts; i++) {
        try {
          const health = await axios.get("http://localhost:3001/wa-ready", {
            timeout: 3000,
          });
          if (!health.data?.ready) throw new Error("WA not ready yet");
          await axios.post("http://localhost:3001/send-whatsapp", payload, {
            timeout: 10000,
          });
          return;
        } catch (err) {
          const status = err.response?.status;
          const msg = err.response?.data || err.message || String(err);
          if (
            status === 503 ||
            /not ready/i.test(msg) ||
            /WA not ready/i.test(msg)
          ) {
            const delay = Math.min(1000 * i, 5000);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }
      throw new Error("Gave up waiting for WhatsApp readiness");
    }

    try {
      await sendToWhatsAppWithRetry({
        event: eventName,
        fantasyLink,
        hltvLink,
        timestamp,
      });
    } catch (err) {
      console.error(
        "❌ Failed to send to WhatsApp after retries:",
        err.response?.data || err.message
      );
    }
  },
};
