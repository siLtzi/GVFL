require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('standings')
    .setDescription('Show current fantasy league standings'),

  async execute(interaction, db) {
    await interaction.deferReply();

    try {
      // Get active fantasy leagues
      const snapshot = await db.collection('fantasyLinks').get();
      const activeLeagues = snapshot.docs.filter(d => !d.data().processed);

      if (!activeLeagues.length) {
        return await interaction.editReply('📭 No active fantasy leagues at the moment.');
      }

      const embeds = [];

      for (const doc of activeLeagues) {
        const { eventName } = doc.data();
        const cacheRef = db.collection('standings').doc(eventName);
        const cacheDoc = await cacheRef.get();

        const cacheData = cacheDoc.exists ? cacheDoc.data() : null;
        const placements = cacheData?.placements || [];
        const status = cacheData?.status || null;

        const spacer = '\u2003';
        const pointsMap = { 1: 10, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };

        const lines = placements.length
          ? placements.slice(0, 10).map((p, i) => {
              const placement = i + 1;
              let medal = '';
              if (placement === 1) medal = '🥇';
              else if (placement === 2) medal = '🥈';
              else if (placement === 3) medal = '🥉';
              else if (placement <= 6) medal = `${placement}.`;
              else medal = `${placement}.`;

              const gvflPoints = pointsMap[placement] || 0;
              const pointsInfo = placement <= 6 ? ` → \`+${gvflPoints} GVFL\`` : '';

              return `${medal}${spacer}**${p.username}** • \`${p.totalPoints} pts\`${pointsInfo}`;
            })
          : ['⚠️ No cached standings yet.'];

        let statusText = '⏳ Status unknown';
        if (status) {
          statusText = status.isGameFinished
            ? '✅ Event finished'
            : `🎮 ${status.isGameStarted ? 'In progress' : 'Not started'}`;
        }

        const updatedAt = cacheData?.updatedAt?.toDate?.()
          ? cacheData.updatedAt.toDate().toLocaleString()
          : 'Unknown';
        const lastError = cacheData?.lastError ? `\n\nLast error: ${cacheData.lastError}` : '';

        const embed = new EmbedBuilder()
          .setTitle(`📊 ${eventName}`)
          .setColor(status?.isGameFinished ? 0x00cc99 : 0x5865f2)
          .setThumbnail('https://i.imgur.com/STR5Ww3.png')
          .setDescription(lines.join('\n\n'))
          .addFields(
            { name: 'Status', value: statusText, inline: true },
            { name: 'Last update', value: `${updatedAt}${lastError}`, inline: true }
          )
          .setFooter({ text: 'GVFL Fantasy Tracker' })
          .setTimestamp();

        embeds.push(embed);
      }

      if (embeds.length === 0) {
        return await interaction.editReply('❌ Failed to fetch standings for any active leagues.');
      }

      await interaction.editReply({ embeds });

    } catch (err) {
      console.error('❌ Standings command failed:', err);
      await interaction.editReply('❌ Failed to fetch standings. Try again later.');
    }
  }
};
