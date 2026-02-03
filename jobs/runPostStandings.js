// Load environment variables first
require("dotenv").config({ path: require('path').join(__dirname, '..', '.env') });

const { Client, GatewayIntentBits } = require("discord.js");
const sendFantasyStandings = require("../bot/utils/sendFantasyStandings");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
  await sendFantasyStandings(client);
  console.log("👋 Exiting bot...");
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
