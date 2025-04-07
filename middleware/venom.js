const venom = require('venom-bot');

venom.create({
  session: 'gvfl-bot',
  multidevice: true,
  headless: true,
  useChrome: true,
  folderNameToken: 'tokens', // <--- matches GVFL/tokens
  disableWelcome: true,
  logQR: false,
  autoClose: false,
  })
  .then((client) => {
    console.log('✅ Venom bot is ready!');

    // Try to dump session tokens manually
    client.getSessionTokenBrowser().then((token) => {
      const fs = require('fs');
      fs.writeFileSync(
        './tokens/gvfl-bot/session.browser.json',
        JSON.stringify(token, null, 2)
      );
      console.log('📦 Session token saved manually!');
    });

    start(client);
  })
  .catch((err) => {
    console.error('❌ Venom error:', err);
  });

function start(client) {
  client.onMessage(async (message) => {
    console.log(`[${message.chatId}] ${message.sender.pushname}: ${message.body}`);
  });
}
