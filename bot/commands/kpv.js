const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const http = require('http');
require('dotenv').config();

const ALLOWED_USERS = process.env.ALLOWED_USERS?.split(',') || [];

const POLL_OPTIONS = [
  '✅ Olen mukana!',
  '🕐 Tulen myöhemmin',
  '🤔 Ehkä',
  '❌ En pääse',
];

function buildKpvEmbed(question, game, date, time, votes) {
  const embed = new EmbedBuilder()
    .setTitle(question)
    .setColor(0x25D366)
    .setThumbnail('https://i.imgur.com/STR5Ww3.png');

  const fields = [];
  for (const opt of POLL_OPTIONS) {
    const voters = votes?.[opt] || [];
    const count = voters.length;
    const names = count > 0 ? voters.join(', ') : '—';
    fields.push({ name: `${opt} (${count})`, value: names, inline: false });
  }
  embed.addFields(fields);

  const infoParts = [];
  if (date) infoParts.push(`📅 ${date}`);
  if (game) infoParts.push(`🎮 ${game}`);
  if (time) infoParts.push(`🕐 ${time}`);
  if (infoParts.length) {
    embed.setDescription(infoParts.join('  •  '));
  }

  embed.setFooter({ text: '📲 Äänestä WhatsAppissa! • Päivittyy automaattisesti' });
  embed.setTimestamp();
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kpv')
    .setDescription('🎮 Send a game night reservation poll to WhatsApp')
    .addStringOption(option =>
      option
        .setName('date')
        .setDescription('Date, e.g. 11.1 (default: today)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('game')
        .setDescription('What game? e.g. CS2')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('time')
        .setDescription('Start time, e.g. 18:00')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('extra')
        .setDescription('Extra info to add to the poll')
        .setRequired(false)
    ),

  // Export for use by the vote update webhook
  buildKpvEmbed,
  POLL_OPTIONS,

  async execute(interaction, db) {
    if (interaction.deferred || interaction.replied) return;

    try {
      await interaction.deferReply();
    } catch (deferErr) {
      console.warn('[kpv] Defer failed:', deferErr.message);
      return;
    }

    const userId = interaction.user.id;
    if (!ALLOWED_USERS.includes(userId)) {
      return interaction.editReply({ content: '❌ You are not authorized to run this command.' });
    }

    // --- Build date string ---
    const dateInput = interaction.options.getString('date');
    let dateStr;
    if (dateInput) {
      dateStr = dateInput.trim();
    } else {
      const now = DateTime.now().setZone('Europe/Helsinki');
      dateStr = `${now.day}.${now.month}`;
    }

    const game = interaction.options.getString('game');
    const time = interaction.options.getString('time');
    const extra = interaction.options.getString('extra');

    // --- Build poll question ---
    let question = `🎮 KPV ${dateStr}`;
    if (game) question += ` — ${game}`;
    if (time) question += ` klo ${time}`;
    question += '\n🙋 Varaa paikkasi!';
    if (extra) question += `\n📝 ${extra}`;

    try {
      const waPort = process.env.WA_PORT || 3001;

      const request = (options, body) => new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            let parsed;
            try { parsed = JSON.parse(data); } catch { parsed = { text: data }; }
            resolve({ ok: res.statusCode === 200, status: res.statusCode, data: parsed, text: data });
          });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
      });

      const postData = JSON.stringify({
        question,
        options: POLL_OPTIONS,
        allowMultiSelect: false,
      });

      const result = await request({
        hostname: 'localhost',
        port: waPort,
        path: '/send-poll',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, postData);

      if (!result.ok) {
        return interaction.editReply({ content: `❌ Failed to send poll: ${result.text}` });
      }

      const waMessageId = result.data?.messageId;

      // Post the live-updating embed in Discord
      const embed = buildKpvEmbed(question, game, dateStr, time, {});
      const discordMsg = await interaction.editReply({ embeds: [embed] });

      // Save poll tracking data to Firebase
      if (waMessageId) {
        try {
          await db.collection('kpvPolls').doc(waMessageId).set({
            waMessageId,
            discordMessageId: discordMsg.id,
            discordChannelId: interaction.channelId,
            question,
            game: game || null,
            date: dateStr,
            time: time || null,
            extra: extra || null,
            votes: {},
            createdBy: interaction.user.displayName,
            createdAt: Date.now(),
          });
          console.log(`✅ KPV poll tracked: ${waMessageId} → Discord ${discordMsg.id}`);
        } catch (fbErr) {
          console.error('❌ Failed to save KPV poll to Firebase:', fbErr.message);
        }
      }
    } catch (err) {
      console.error('[KPV ERROR]', err);
      try {
        await interaction.editReply({
          content: `❌ Error connecting to WhatsApp middleware: ${err.message}\n\nMake sure the WhatsApp server is running.`,
        });
      } catch {}
    }
  },
};
