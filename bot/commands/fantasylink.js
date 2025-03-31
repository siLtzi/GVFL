const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { HLTV } = require('hltv');
const axios = require('axios');
const { DateTime } = require('luxon');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fantasylink")
    .setDescription("Add a fantasy league link for an event")
    .addStringOption(option =>
      option.setName("event")
        .setDescription("Name of the HLTV event")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName("link")
        .setDescription("Full link to the fantasy league")
        .setRequired(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    try {
      const events = await HLTV.getEvents();
      const now = Date.now();
      const fiveDaysFromNow = now + 5 * 24 * 60 * 60 * 1000;

      const filtered = events
        .filter(e =>
          e.dateStart &&
          new Date(e.dateStart).getTime() >= now &&
          new Date(e.dateStart).getTime() <= fiveDaysFromNow
        )
        .filter(e => e.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(e => ({ name: e.name, value: e.name }));

      await interaction.respond(filtered);
    } catch (err) {
      console.error("Autocomplete error:", err);
      await interaction.respond([]);
    }
  },

  async execute(interaction, db) {
    const eventName = interaction.options.getString("event");
    const fantasyLink = interaction.options.getString("link");

    let startTimeText = "Unknown";
    let hltvLink = "https://hltv.org";
    let timestamp = null;

    try {
      const events = await HLTV.getEvents();
      const now = Date.now();

      const upcomingEvents = events.filter(e => e.dateStart && new Date(e.dateStart).getTime() >= now);
      const event = upcomingEvents.find(
        e => e.name.toLowerCase() === eventName.toLowerCase()
      );

      if (event?.dateStart) {
        const start = DateTime.fromMillis(event.dateStart).setZone("Europe/Helsinki");
        startTimeText = `<t:${Math.floor(start.toSeconds())}:R>`;
        timestamp = start.toFormat("cccc, dd LLL yyyy 'at' HH:mm");
      }

      if (event?.id && event?.name) {
        const slug = event.name.toLowerCase().replace(/\s+/g, "-");
        hltvLink = `https://hltv.org/events/${event.id}/${slug}`;
      }
    } catch (err) {
      console.error("Failed to fetch HLTV info:", err);
    }

    // Save to Firebase
    await db.collection("fantasyLinks").doc(eventName).set({
      eventName,
      fantasyLink,
      addedBy: interaction.user.id,
      timestamp: Date.now(),
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${eventName}`)
      .setColor(0x0099ff)
      .setDescription(`🔗 [JOIN THE LEAGUE](${fantasyLink})`)
      .addFields({ name: "🕒 Starts", value: startTimeText });

    await interaction.reply({ embeds: [embed] });

    // Send to WhatsApp
    try {
      await axios.post('http://localhost:3001/send-whatsapp', {
        event: eventName,
        fantasyLink,
        hltvLink,
        timestamp
      });
    } catch (err) {
      console.error("❌ Failed to send to WhatsApp:", err.response?.data || err.message);
    }
  },
};
