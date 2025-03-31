require("dotenv").config();
const { fork } = require("child_process");
const path = require("path");

const options = {
  env: {
    ...process.env, // Pass current env vars
  },
};

const bot = fork(path.join(__dirname, "bot", "index.js"), [], options);
const middleware = fork(path.join(__dirname, "middleware", "server.js"), [], options);

bot.on("close", (code) => {
  console.log(`Discord bot exited with code ${code}`);
});

middleware.on("close", (code) => {
  console.log(`WhatsApp middleware exited with code ${code}`);
});
