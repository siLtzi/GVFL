const {
  Client,
  Collection,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { DateTime } = require("luxon");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const db = require("./utils/firebase");
const { HLTV } = require("hltv");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: ['MESSAGE', 'REACTION', 'USER'],
});
client.commands = new Collection();
client.autocompleteHandlers = new Collection();

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
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
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
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
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, db);
  } catch (error) {
    console.error(`[${interaction.commandName}] Error:`, error);
    const errorMessage = "There was an error executing that command.";
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError.message);
    }
  }
});

// 🔔 HLTV event check logic (unchanged)
async function checkForUpcomingEvents(client, db) {
  try {
    const events = await HLTV.getEvents();
    const now = DateTime.now();

    const blacklist = [
      "qualifier", "academy", "cup", "weekly", "monthly", "open", "local", "masters"
    ];

    const parsePrize = (prize) => {
      if (typeof prize !== "string") return 0;
      const match = prize.match(/\$([\d,.]+)/);
      if (!match) return 0;
      return parseInt(match[1].replace(/,/g, ""));
    };

    const upcoming = events.filter(event => {
      const startTime = DateTime.fromMillis(event.dateStart);
      const hoursUntilEvent = startTime.diff(now, "hours").hours;
      const isBlacklisted = blacklist.some(word =>
        event.name.toLowerCase().includes(word)
      );
      const prizeValue = parsePrize(event.prizePool);

      return (
        hoursUntilEvent > 0 &&
        hoursUntilEvent <= 72 &&
        !isBlacklisted &&
        event.online !== true &&
        prizeValue >= 500000
      );
    });

    if (upcoming.length === 0) return;

    const channel = await client.channels.fetch(process.env.FANTASY_CHANNEL_ID);
    if (!channel) return;

    for (const event of upcoming) {
      const eventRef = db.collection("eventReminders").doc(event.id.toString());
      const eventDoc = await eventRef.get();

      const startTime = DateTime.fromMillis(event.dateStart);
      const hoursUntilEvent = Math.floor(startTime.diff(now, "hours").hours);

      if (!eventDoc.exists) {
        await eventRef.set({
          name: event.name,
          dateStart: startTime.toJSDate(),
          remindedAt48h: false,
          remindedAt24h: false,
        });
      }

      const reminderData = eventDoc.exists ? eventDoc.data() : { remindedAt48h: false, remindedAt24h: false };

      const sendEmbed = async (hoursLeft) => {
        const detailedEvent = await HLTV.getEvent({ id: event.id });
        const embed = new EmbedBuilder()
          .setTitle(`⏰ ${hoursLeft}h Reminder: ${event.name}`)
          .setDescription(`**${event.name}** starts in ${hoursLeft / 24} days!`)
          .setURL(`https://www.hltv.org/events/${event.id}/${event.name.toLowerCase().replace(/\s+/g, "-")}`)
          .setColor(hoursLeft === 48 ? 0xffaa00 : 0xff0000)
          .setThumbnail("https://i.imgur.com/STR5Ww3.png")
          .addFields(
            { name: "📍 Location", value: event.location?.name || "TBA" },
            { name: "🕒 Starts (FI)", value: startTime.setZone("Europe/Helsinki").toFormat("cccc, dd LLL yyyy 'at' HH:mm") },
            { name: "💰 Prize Pool", value: event.prizePool || "Unknown" },
            { name: "👥 Teams Attending", value: detailedEvent.teams?.length ? `${detailedEvent.teams.length}` : "TBA" }
          );

        await channel.send({ embeds: [embed] });
      };

      if (hoursUntilEvent <= 48 && hoursUntilEvent > 24 && !reminderData.remindedAt48h) {
        await sendEmbed(48);
        await eventRef.update({ remindedAt48h: true });
      }

      if (hoursUntilEvent <= 24 && hoursUntilEvent > 0 && !reminderData.remindedAt24h) {
        await sendEmbed(24);
        await eventRef.update({ remindedAt24h: true });
      }
    }
  } catch (err) {
    console.error("HLTV Event Fetch Error:", err);
  }
}

/* -------------------- KPV reaction voting -------------------- */
const { POLL_OPTIONS } = require('./commands/kpv');

// Map reaction emoji to poll option
const REACTION_TO_OPTION = {
  '✅': POLL_OPTIONS[0],  // ✅ Olen mukana!
  '🕐': POLL_OPTIONS[1],  // 🕐 Tulen myöhemmin
  '🤔': POLL_OPTIONS[2],  // 🤔 Ehkä
  '❌': POLL_OPTIONS[3],  // ❌ En pääse
};
const KPV_REACTION_EMOJIS = Object.keys(REACTION_TO_OPTION);

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  // Handle partial reactions (from uncached messages)
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }

  const emoji = reaction.emoji.name;
  const option = REACTION_TO_OPTION[emoji];
  if (!option) return;

  const messageId = reaction.message.id;

  // Check if this Discord message is a tracked KPV poll
  try {
    const pollSnap = await db.collection('kpvPolls')
      .where('discordMessageId', '==', messageId)
      .limit(1)
      .get();

    if (pollSnap.empty) return;

    const pollDoc = pollSnap.docs[0];
    const pollData = pollDoc.data();
    if (pollData.closed === true) return;

    const votes = pollData.votes || {};
    const userMention = `<@${user.id}>`;

    // Check if this user already voted in ANY option (WA or Discord)
    let alreadyInOption = null;
    for (const [opt, voters] of Object.entries(votes)) {
      if (voters.includes(userMention)) {
        alreadyInOption = opt;
        break;
      }
    }

    if (alreadyInOption === option) {
      // Already voted for this exact option — do nothing
      return;
    }

    // Remove from old option if switching vote
    if (alreadyInOption && votes[alreadyInOption]) {
      votes[alreadyInOption] = votes[alreadyInOption].filter(v => v !== userMention);
      if (votes[alreadyInOption].length === 0) delete votes[alreadyInOption];
    }

    // Remove their reactions from other options
    for (const otherEmoji of KPV_REACTION_EMOJIS) {
      if (otherEmoji === emoji) continue;
      const otherReaction = reaction.message.reactions.cache.get(otherEmoji);
      if (otherReaction) {
        try { await otherReaction.users.remove(user.id); } catch {}
      }
    }

    // Add to the new option
    if (!votes[option]) votes[option] = [];
    if (!votes[option].includes(userMention)) {
      votes[option].push(userMention);
    }

    // Save to Firebase
    await pollDoc.ref.update({ votes, lastVoteAt: Date.now() });

    // Update the embed
    const { buildKpvEmbed } = require('./commands/kpv');
    const embed = buildKpvEmbed(pollData.question, pollData.game, pollData.date, pollData.time, votes);
    try {
      await reaction.message.edit({ embeds: [embed] });
      console.log(`✅ KPV embed updated via Discord reaction by ${user.tag}`);
    } catch (editErr) {
      console.error('❌ Failed to edit KPV embed:', editErr.message);
    }
  } catch (err) {
    console.error('❌ KPV reaction handler error:', err.message);
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }

  const emoji = reaction.emoji.name;
  const option = REACTION_TO_OPTION[emoji];
  if (!option) return;

  const messageId = reaction.message.id;

  try {
    const pollSnap = await db.collection('kpvPolls')
      .where('discordMessageId', '==', messageId)
      .limit(1)
      .get();

    if (pollSnap.empty) return;

    const pollDoc = pollSnap.docs[0];
    const pollData = pollDoc.data();
    if (pollData.closed === true) return;

    const votes = pollData.votes || {};
    const userMention = `<@${user.id}>`;

    // Remove from this option if present
    if (votes[option] && votes[option].includes(userMention)) {
      votes[option] = votes[option].filter(v => v !== userMention);
      if (votes[option].length === 0) delete votes[option];

      await pollDoc.ref.update({ votes, lastVoteAt: Date.now() });

      const { buildKpvEmbed } = require('./commands/kpv');
      const embed = buildKpvEmbed(pollData.question, pollData.game, pollData.date, pollData.time, votes);
      try {
        await reaction.message.edit({ embeds: [embed] });
        console.log(`✅ KPV embed updated via reaction removal by ${user.tag}`);
      } catch (editErr) {
        console.error('❌ Failed to edit KPV embed:', editErr.message);
      }
    }
  } catch (err) {
    console.error('❌ KPV reaction remove handler error:', err.message);
  }
});

client.once("ready", () => {
  console.log(`✅ Discord bot is online as ${client.user.tag}`);
  checkForUpcomingEvents(client, db);
  setInterval(() => checkForUpcomingEvents(client, db), 1000 * 60 * 60);
});

client.login(process.env.DISCORD_TOKEN);
