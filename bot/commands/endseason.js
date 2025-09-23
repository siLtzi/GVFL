require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { FieldValue } = require('firebase-admin/firestore');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');
const FIREWORKS_EMOJI = process.env.FIREWORKS_EMOJI || '🎆';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('endseason')
    .setDescription('Ends a season by declaring the winner and showing final standings.')
    .addStringOption(option =>
      option.setName('season')
        .setDescription('The season name to finalize (e.g. SPRING2025)')
        .setRequired(true)
    ),

  async execute(interaction, db) {
    const userId = interaction.user.id;
    if (!ALLOWED_USERS.includes(userId)) {
      return await interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
    }

    const seasonName = interaction.options.getString('season');
    const scoresSnap = await db.collection(`seasons/${seasonName}/scores`).get();

    if (scoresSnap.empty) {
      return await interaction.reply({ content: `❌ No scores found for season \`${seasonName}\`.`, ephemeral: true });
    }

    const standings = [];
    scoresSnap.forEach(doc => {
      const d = doc.data();
      standings.push({
        userId: d.userId || 'unknown',
        username: d.username || 'Unknown',
        points: d.points || 0,
        first: d.first || 0,
        second: d.second || 0,
        third: d.third || 0,
      });
    });
    standings.sort((a, b) => b.points - a.points);
    const topUser = standings[0];

    // winners/{seasonName}
    await db.collection('winners').doc(seasonName).set({
      userId: topUser.userId,
      username: topUser.username,
      points: topUser.points,
      endedAt: new Date(),
    });

    // log
    await db.collection('logs').add({
      type: 'endseason',
      season: seasonName,
      winner: topUser.username,
      userId: topUser.userId,
      by: interaction.user.username,
      timestamp: new Date(),
    });

    // 🔧 Flip settings/config.active to false (and optionally keep lastSeason)
    await db.collection('settings').doc('config').set({
      active: false,
      lastSeason: seasonName,
      updatedAt: FieldValue.serverTimestamp(),
      // Optionally clear currentSeason:
      // currentSeason: FieldValue.delete(),
    }, { merge: true });

    const spacer = '\u2003';
    const winnerText =
      `${FIREWORKS_EMOJI}  **${topUser.username}** wins **${seasonName}** with **${topUser.points}** points!  ${FIREWORKS_EMOJI}\n` +
      `${FIREWORKS_EMOJI} 🥇${topUser.first}${spacer}🥈${topUser.second}${spacer}🥉${topUser.third} ${FIREWORKS_EMOJI}`;
    const divider = '\n\n---------------------------------------\n\n';
    const standingsText = standings.slice(1).map((e, i) =>
      `#${i + 2}${spacer}${e.username} – ${e.points} points\n${spacer}${spacer}🥇${e.first} 🥈${e.second} 🥉${e.third}`
    ).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`✅ Season ${seasonName} has ended!`)
      .setColor(0x00cc66)
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setDescription(`${winnerText}${divider}${standingsText}`);

    await interaction.reply({ embeds: [embed] });
  }
};
