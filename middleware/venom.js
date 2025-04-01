const venom = require('venom-bot');

venom
venom.create({
  session: "gvfl-bot",
  multidevice: true,
  headless: false,
  useChrome: true
})

  .then((client) => start(client))
  .catch((err) => {
    console.error('❌ Venom error:', err);
  });

function start(client) {
  console.log('✅ Venom bot is ready!');

  client.onMessage(async (message) => {
    console.log(`[${message.chatId}] ${message.sender.pushname}: ${message.body}`);

    // Example trigger
    if (message.body.toLowerCase().includes('fantasy')) {
      console.log('🎯 Fantasy message detected!');
      // You could send this to Discord or save it somewhere
    }
  });
}
