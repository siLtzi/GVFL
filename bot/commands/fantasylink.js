const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");

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
    const matches = fantasyLink.match(/fantasy\/(\d+)\/league\/(\d+)/);

    if (!matches) {
      return await interaction.reply({
        content: "❌ Invalid fantasy league link.",
        ephemeral: true,
      });
    }

    const fantasyId = Number(matches[1]);
    const leagueId = Number(matches[2]);

    // Get HLTV event info from the fantasy overview endpoint
    const overviewUrl = `https://www.hltv.org/fantasy/${fantasyId}/overview/json`;
    let eventName = "Unknown Event";
    let isGameFinished = false;
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
      console.log("Status code:", res.status);
      console.log("Raw response (first 300 chars):", text.slice(0, 300));

      let json;
      try {
        json = JSON.parse(text);
      } catch (err) {
        console.error("❌ Failed to parse JSON:", err.message);
        return await interaction.reply({
          content:
            "❌ HLTV returned unexpected data (possibly blocked or down).",
          flags: 64, // ephemeral
        });
      }

      eventName = json.eventName;
      isGameFinished = json.gameFinished === true;

      if (json.eventPageLink) {
        const eventId = Number(json.eventPageLink.split("/")[2]);
        const slug =
          json.eventPageLink.split("/")[3] ||
          eventName.toLowerCase().replace(/\s+/g, "-");
        hltvLink = `https://hltv.org/events/${eventId}/${slug}`;
      }

      if (json.startDate && typeof json.startDate === "number" && json.startDate > 0) {
        const start = DateTime.fromMillis(json.startDate).setZone("Europe/Helsinki");
        startTimeText = `<t:${Math.floor(start.toSeconds())}:R>`;
        timestamp = start.toFormat("cccc, dd LLL yyyy 'at' HH:mm");
      } else {
        console.warn("⚠️ No valid startDate found in HLTV overview JSON.");
        startTimeText = "TBA";
      }
      

      if (Array.isArray(json.topRatedPlayers)) {
        const uniqueTeams = new Set();
        json.topRatedPlayers.forEach((p) => {
          if (p.team?.name) uniqueTeams.add(p.team.name);
        });
        eventTeams = `${uniqueTeams.size}`;
      }
    } catch (err) {
      console.error("❌ Failed to fetch fantasy overview:", err.message);
      return await interaction.reply({
        content: "Failed to fetch HLTV data from link.",
        ephemeral: true,
      });
    }

    // Save to Firestore
    try {
      await db.collection("fantasyLinks").doc(eventName).set({
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

    // Discord embed
    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${eventName}`)
      .setColor(0x0099ff)
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setDescription(`🔗 [JOIN THE LEAGUE](${fantasyLink})`)
      .addFields(
        { name: "🕒 Starts", value: startTimeText },
        { name: "🏆 Teams Attending", value: eventTeams }
      );

    await interaction.reply({ embeds: [embed] });

    // Optional: send to WhatsApp middleware
    try {
      await require("axios").post("http://localhost:3001/send-whatsapp", {
        event: eventName,
        fantasyLink,
        hltvLink,
        timestamp,
      });
    } catch (err) {
      console.error(
        "❌ Failed to send to WhatsApp:",
        err.response?.data || err.message
      );
    }
  },
};
