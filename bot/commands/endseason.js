require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const ALLOWED_USERS = process.env.ALLOWED_USERS.split(',');
const FIREWORKS_EMOJI = process.env.FIREWORKS_EMOJI;

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
      return await interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true,
      });
    }

    const seasonName = interaction.options.getString('season');
    const scoresSnap = await db.collection(`seasons/${seasonName}/scores`).get();

    if (scoresSnap.empty) {
      return await interaction.reply({
        content: `❌ No scores found for season \`${seasonName}\`.`,
        ephemeral: true,
      });
    }

    // Load users for preferred names
    const usersSnap = await db.collection('users').get();
    const userMap = {};
    usersSnap.forEach(doc => {
      const data = doc.data();
      const preferred = data.preferredName || doc.id;
      if (data.hltvName) userMap[data.hltvName.toLowerCase()] = preferred;
      if (data.discordName) userMap[data.discordName.toLowerCase()] = preferred;
      userMap[doc.id.toLowerCase()] = preferred;
      userMap[preferred.toLowerCase()] = preferred;
    });

    const standings = [];

    scoresSnap.forEach(doc => {
      const data = doc.data();
      const rawName = data.username || doc.id || 'Unknown';
      const displayName = userMap[rawName.toLowerCase()] || rawName;
      standings.push({
        userId: data.userId || 'unknown',
        username: displayName,
        points: data.points || 0,
        first: data.first || 0,
        second: data.second || 0,
        third: data.third || 0,
      });
    });

    standings.sort((a, b) => b.points - a.points);
    const topUser = standings[0];

    // Write to winners/{seasonName}
    await db.collection('winners').doc(seasonName).set({
      userId: topUser.userId,
      username: topUser.username,
    });

    // Mark season as ended in seasons collection
    await db.collection('seasons').doc(seasonName).set({
      endedAt: new Date(),
      active: false
    }, { merge: true });

    // Log the action
    await db.collection('logs').add({
      type: 'endseason',
      season: seasonName,
      winner: topUser.username,
      userId: topUser.userId,
      by: interaction.user.username,
      timestamp: new Date(),
    });

    const spacer = '\u2003';

    const winnerText =
      `${FIREWORKS_EMOJI}  **${topUser.username}** wins **${seasonName}** with **${topUser.points}** points!  ${FIREWORKS_EMOJI}\n` +
      `${FIREWORKS_EMOJI} 🥇${topUser.first}${spacer}🥈${topUser.second}${spacer}🥉${topUser.third} ${FIREWORKS_EMOJI}`;

    const divider = '\n\n---------------------------------------\n\n';

    const standingsText = standings.slice(1).map((entry, index) => {
      return `#${index + 2}${spacer}${entry.username} – ${entry.points} points\n` +
             `${spacer}${spacer}🥇${entry.first} 🥈${entry.second} 🥉${entry.third}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`✅ Season ${seasonName} has ended!`)
      .setColor(0x00cc66)
      .setThumbnail("https://i.imgur.com/STR5Ww3.png")
      .setDescription(`${winnerText}${divider}${standingsText}`);

    await interaction.reply({ embeds: [embed] });
  }
};
