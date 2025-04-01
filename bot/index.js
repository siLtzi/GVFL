const {
  Client,
  Collection,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
} = require("discord.js");
const { DateTime } = require("luxon");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const db = require("./utils/firebase");

const HLTV = require("hltv");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();
client.autocompleteHandlers = new Collection();

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  console.log("Loading command:", command);
  client.commands.set(command.data.name, command);

  // Register autocomplete if defined
  if (command.autocomplete) {
    client.autocompleteHandlers.set(command.data.name, command.autocomplete);
  }

  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log("Refreshing slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("Slash commands registered.");
  } catch (error) {
    console.error(error);
  }
})();

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    const handler = client.autocompleteHandlers.get(interaction.commandName);
    if (!handler) return;

    try {
      await handler(interaction);
    } catch (err) {
      console.error("Autocomplete handler failed:", err);
    }
    return; // Skip rest
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, db);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "There was an error executing that command.",
      ephemeral: true,
    });
  }
});

// 🔔 HLTV event check logic
async function checkForUpcomingEvents(client, db) {
  try {
    const events = await HLTV.HLTV.getEvents();
    const now = DateTime.now();

    const blacklist = [
      "qualifier",
      "academy",
      "cup",
      "weekly",
      "monthly",
      "open",
      "local",
      "masters",
    ];

    const parsePrize = (prize) => {
      if (typeof prize !== "string") return 0;
      const match = prize.match(/\$([\d,.]+)/);
      if (!match) return 0;
      return parseInt(match[1].replace(/,/g, ""));
    };

    const upcoming = events.filter((event) => {
      const startTime = DateTime.fromMillis(event.dateStart);
      const hoursUntilEvent = startTime.diff(now, "hours").hours;
      const isBlacklisted = blacklist.some((word) =>
        event.name.toLowerCase().includes(word)
      );
      const prizeValue = parsePrize(event.prizePool);

      return (
        hoursUntilEvent > 0 &&
        hoursUntilEvent <= 72 && // 3 days ahead just to ensure coverage
        !isBlacklisted &&
        event.online !== true &&
        prizeValue >= 500000
      );
    });

    if (upcoming.length === 0) return;

    const channel = await client.channels.fetch(process.env.FANTASY_CHANNEL_ID);
    if (!channel) return;

    for (const event of upcoming) {
      const eventRef = db.collection('eventReminders').doc(event.id.toString());
      const eventDoc = await eventRef.get();

      const startTime = DateTime.fromMillis(event.dateStart);
      const hoursUntilEvent = Math.floor(startTime.diff(now, "hours").hours);

      if (!eventDoc.exists) {
        // New event, create doc
        await eventRef.set({
          name: event.name,
          dateStart: startTime.toJSDate(),
          remindedAt48h: false,
          remindedAt24h: false,
        });
      }

      const reminderData = eventDoc.exists ? eventDoc.data() : { remindedAt48h: false, remindedAt24h: false };

      const sendEmbed = async (hoursLeft) => {
        const detailedEvent = await HLTV.HLTV.getEvent({ id: event.id });
        const embed = new EmbedBuilder()
          .setTitle(`⏰ ${hoursLeft}h Reminder: ${event.name}`)
          .setDescription(`**${event.name}** starts in ${hoursLeft / 24} days!`)
          .setURL(`https://www.hltv.org/events/${event.id}/${event.name.toLowerCase().replace(/\s+/g, "-")}`)
          .setColor(hoursLeft === 48 ? 0xffaa00 : 0xff0000)
          .addFields(
            { name: "📍 Location", value: event.location?.name || "TBA" },
            { name: "🕒 Starts (FI)", value: startTime.setZone("Europe/Helsinki").toFormat("cccc, dd LLL yyyy 'at' HH:mm") },
            { name: "💰 Prize Pool", value: event.prizePool || "Unknown" },
            { name: "👥 Teams Attending", value: detailedEvent.teams?.length ? `${detailedEvent.teams.length}` : "TBA" }
          );

        await channel.send({ embeds: [embed] });
      };

      // Exactly 48-hour reminder
      if (hoursUntilEvent <= 48 && hoursUntilEvent > 24 && !reminderData.remindedAt48h) {
        await sendEmbed(48);
        await eventRef.update({ remindedAt48h: true });
      }

      // Exactly 24-hour reminder
      if (hoursUntilEvent <= 24 && hoursUntilEvent > 0 && !reminderData.remindedAt24h) {
        await sendEmbed(24);
        await eventRef.update({ remindedAt24h: true });
      }
    }
  } catch (err) {
    console.error("HLTV Event Fetch Error:", err);
  }
}


client.once("ready", () => {
  console.log(`Bot is online as ${client.user.tag}`);

  // Run immediately at startup
  checkForUpcomingEvents(client, db);

  // Schedule every hour to ensure precise reminders
  setInterval(() => checkForUpcomingEvents(client, db), 1000 * 60 * 60);
});

client.login(process.env.DISCORD_TOKEN);
