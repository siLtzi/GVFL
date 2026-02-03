const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const http = require('http');
require('dotenv').config();

const ALLOWED_USERS = process.env.ALLOWED_USERS?.split(',') || [];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testwhatsapp')
    .setDescription('📲 Admin-only: Send a test message to WhatsApp')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Custom message to send (optional)')
        .setRequired(false)
    ),

  async execute(interaction, db) {
    // Defer IMMEDIATELY - Discord only gives 3 seconds
    // Check state first to avoid race conditions
    if (interaction.deferred || interaction.replied) {
      console.warn('[testwhatsapp] Interaction already handled, skipping');
      return;
    }

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (deferErr) {
      console.warn('[testwhatsapp] Defer failed:', deferErr.message);
      return;
    }

    const userId = interaction.user.id;

    if (!ALLOWED_USERS.includes(userId)) {
      return interaction.editReply({
        content: '❌ You are not authorized to run this command.',
      });
    }

    const customMessage = interaction.options.getString('message');
    const testMessage = customMessage || `🧪 Test message from Discord!\n\nSent by: ${interaction.user.tag}\nTime: ${new Date().toISOString()}`;

    try {
      const waPort = process.env.WA_PORT || 3001;
      
      // Use native http instead of dynamic import for speed
      const result = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({ message: testMessage });
        const req = http.request({
          hostname: 'localhost',
          port: waPort,
          path: '/send-whatsapp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, text: data }));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      if (result.ok) {
        await interaction.editReply({
          content: `✅ Test message sent to WhatsApp!\n\n**Message:**\n\`\`\`${testMessage}\`\`\``,
        });
      } else {
        await interaction.editReply({
          content: `❌ Failed to send message: ${result.text}`,
