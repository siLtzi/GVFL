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

    let canReply = true;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (deferErr) {
      canReply = false;
      console.warn('[testwhatsapp] Defer failed:', deferErr.message);
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

      let health = null;
      try {
        const healthRes = await request({
          hostname: 'localhost',
          port: waPort,
          path: '/health',
          method: 'GET',
        });
        if (healthRes.ok) health = JSON.parse(healthRes.text);
      } catch (healthErr) {
        console.warn('[testwhatsapp] Health check failed:', healthErr.message);
      }

      const postData = JSON.stringify({ message: testMessage });
      let result = await request({
        hostname: 'localhost',
        port: waPort,
        path: '/send-whatsapp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, postData);

      // If health says connected but send failed, retry once
      if (!result.ok && health?.whatsapp?.ready) {
        await new Promise(r => setTimeout(r, 1500));
        result = await request({
          hostname: 'localhost',
          port: waPort,
          path: '/send-whatsapp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        }, postData);
      }

      if (canReply) {
        if (result.ok) {
          await interaction.editReply({
            content: `✅ Test message sent to WhatsApp!\n\n**Message:**\n\`\`\`${testMessage}\`\`\``,
          });
        } else {
          const stateInfo = health?.whatsapp
            ? `\n\nState: ${health.whatsapp.state || 'unknown'} (ready=${health.whatsapp.ready})`
            : '';
          await interaction.editReply({
            content: `❌ Failed to send message: ${result.text}${stateInfo}`,
          });
        }
      }
    } catch (err) {
      console.error('[TESTWHATSAPP ERROR]', err);
      if (canReply) {
        await interaction.editReply({
          content: `❌ Error connecting to WhatsApp middleware: ${err.message}\n\nMake sure the WhatsApp server is running.`,
        });
      }
    }
  },
};