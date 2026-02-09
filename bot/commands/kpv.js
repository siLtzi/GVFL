const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const http = require('http');
require('dotenv').config();

const ALLOWED_USERS = process.env.ALLOWED_USERS?.split(',') || [];

// Finnish day names for nice formatting
const FI_DAYS = ['maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai', 'sunnuntai'];
const FI_MONTHS = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];

function formatDateFi(dt) {
  const day = FI_DAYS[dt.weekday - 1]; // luxon: 1=mon..7=sun
  const dayNum = dt.day;
  const month = FI_MONTHS[dt.month - 1];
  return `${day} ${dayNum}. ${month}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kpv')
    .setDescription('🎮 Send a game night reservation poll to WhatsApp')
    .addStringOption(option =>
      option
        .setName('when')
        .setDescription('When? (default: tänään)')
        .addChoices(
          { name: '📅 Tänään', value: 'today' },
          { name: '📅 Huomenna', value: 'tomorrow' },
        )
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('game')
        .setDescription('What game? (shown in the poll)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('time')
        .setDescription('Start time, e.g. 18:00 (shown in the poll)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('extra')
        .setDescription('Extra info to include in the poll question')
        .setRequired(false)
    ),

  async execute(interaction, db) {
    if (interaction.deferred || interaction.replied) return;

    let canReply = true;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (deferErr) {
      canReply = false;
      console.warn('[kpv] Defer failed:', deferErr.message);
    }

    const userId = interaction.user.id;
    if (!ALLOWED_USERS.includes(userId)) {
      if (canReply) {
        await interaction.editReply({ content: '❌ You are not authorized to run this command.' });
      }
      return;
    }

    // --- Build the poll ---
    const when = interaction.options.getString('when') || 'today';
    const game = interaction.options.getString('game');
    const time = interaction.options.getString('time');
    const extra = interaction.options.getString('extra');

    const now = DateTime.now().setZone('Europe/Helsinki');
    const targetDate = when === 'tomorrow' ? now.plus({ days: 1 }) : now;
    const dateFi = formatDateFi(targetDate);
    const dateShort = targetDate.toFormat('dd.MM.');

    // Build question
    let question = `🎮 Pelit ${dateFi} ${dateShort}`;
    if (game) question += ` — ${game}`;
    if (time) question += ` klo ${time}`;
    question += '\n🙋 Varaa paikkasi!';
    if (extra) question += `\n📝 ${extra}`;

    // Reservation-style options
    const pollOptions = [
      '✅ Olen mukana!',
      '🕐 Tulen myöhemmin',
      '🤔 Ehkä',
      '❌ En pääse',
    ];

    try {
      const waPort = process.env.WA_PORT || 3001;

      const request = (options, body) => new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, text: data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
      });

      const postData = JSON.stringify({
        question,
        options: pollOptions,
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

      if (canReply) {
        if (result.ok) {
          const embed = new EmbedBuilder()
            .setTitle('📊 Poll sent to WhatsApp!')
            .setColor(0x25D366) // WhatsApp green
            .setThumbnail('https://i.imgur.com/STR5Ww3.png')
            .addFields(
              { name: '📋 Question', value: question },
              { name: '📅 Date', value: `${dateFi} (${dateShort})`, inline: true },
              { name: '🎮 Game', value: game || 'Any', inline: true },
              { name: '🕐 Time', value: time || 'TBD', inline: true },
              { name: '🗳️ Options', value: pollOptions.map((o, i) => `${o}`).join('\n') },
            )
            .setFooter({ text: `Sent by ${interaction.user.displayName}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply({
            content: `❌ Failed to send poll: ${result.text}`,
          });
        }
      }
    } catch (err) {
      console.error('[KPV ERROR]', err);
      if (canReply) {
        await interaction.editReply({
          content: `❌ Error connecting to WhatsApp middleware: ${err.message}\n\nMake sure the WhatsApp server is running.`,
        });
      }
    }
  },
};
