require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const puppeteer = require('puppeteer');

const TOKENS_DIR = path.join(__dirname, '..', 'tokens', 'gvfl-bot');
const GROUP_ID = process.env.WHATSAPP_GROUP_ID; // e.g., ...@g.us

const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'gvfl-bot', dataPath: TOKENS_DIR }),
  puppeteer: {
    headless: true,
    executablePath: puppeteer.executablePath(),
    args: isLinux ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
  },
});

client.on('qr', qr => {
  console.log('Scan this QR in your WhatsApp app:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('✅ WhatsApp ready');
  if (GROUP_ID) {
    await client.sendMessage(GROUP_ID, 'GVFL online ✅ (wwebjs)');
  }
});

client.on('disconnected', (reason) => {
  console.error("❌ WhatsApp disconnected:", reason);
  // Try to reconnect automatically
  client.initialize();
});

client.on('auth_failure', (msg) => {
  console.error("⚠️ WhatsApp auth failure:", msg);
  // In case of expired session, you might need to delete tokens dir and rescan
});

client.on('change_state', state => {
  console.log("🔄 WhatsApp state changed:", state);
});


client.on('message', async (msg) => {
  if (msg.body === '!ping') await msg.reply('pong');
});

client.initialize();
