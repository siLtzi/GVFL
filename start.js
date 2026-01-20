// start.js
require("dotenv").config();
const { fork } = require("child_process");
const path = require("path");

// Handle uncaught errors to prevent silent crashes
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
});

const options = {
  env: {
    ...process.env, // Pass current env vars
  },
  stdio: "inherit", // forward child process logs to main console
};

// Paths
const botPath = path.join(__dirname, "bot", "index.js");
const middlewarePath = path.join(__dirname, "middleware", "server.js");

// Fork Discord bot
const bot = fork(botPath, [], options);
bot.on("close", (code) => {
  console.log(`💀 Discord bot exited with code ${code}`);
});

// Fork WhatsApp middleware
const middleware = fork(middlewarePath, [], options);
middleware.on("close", (code) => {
  console.log(`💀 WhatsApp middleware exited with code ${code}`);
});

// Graceful shutdown handler
process.on("SIGINT", () => {
  console.log("👋 Shutting down processes...");
  bot.kill("SIGINT");
  middleware.kill("SIGINT");
  process.exit(0);
});
