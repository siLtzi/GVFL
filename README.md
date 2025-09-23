# GVFL Fantasy Bot 

This project is a custom fantasy league tracker for CS2, built using:
- Discord bot (via Discord.js)
- WhatsApp automation (via Venom)
- Firebase Firestore
- HLTV fantasy league scraping
- Cron jobs to automate everything

It tracks fantasy placements, awards points to players, and posts rich updates to both Discord and WhatsApp — all hands-free.

---

##  Features

- Slash commands: `/addplacement`, `/leaderboard`, `/season`, etc.
- Automated fantasy league tracking every 6–12 hours
- WhatsApp middleware that listens for HLTV fantasy links
- Firebase integration for storing scores, placements, season settings, and logs
- Discord webhooks for rich embedded updates
- Live fantasy standings updates every 12 hours

---

##  Quickstart (Local Development)

> ⚠️ You **must run the bot locally first** to scan the WhatsApp QR code before moving to server deployment.

##  Setup

### 1. Clone and install
```bash
git clone https://github.com/siLtzi/GVFL.git
cd GVFL
npm install
```

### 2. Configure `.env`
Create a `.env` file in the root directory:

```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
ADMIN_ID=
FANTASY_CHANNEL_ID= The channel where you want automated messages to appear
ALLOWED_USERS=
FIREWORKS_EMOJI= USE ANY CUSTOM EMOJI FROM YOUR SERVER, I USED FIREWORKS (eg. <a:emoji:1234567>)
DISCORD_WEBHOOK_URL= Fantasy channel -> Edit channel -> Integrations
WHATSAPP_GROUP_ID= You get the WhatsApp group token when someone sends a message to the group while the bot is running.
FIREBASE_SERVICE_ACCOUNT= base64encoded firebase-service-account.json
```

Set your Firebase service account details and webhook IDs here.

---

##  Development (VSCode/Local)

Before deploying to a VPS, run the bot locally to scan the WhatsApp QR code:

### In `server.js`, update:
```js
venom.create({
  headless: "false", // ✅ Show browser for QR scanning locally
  ...
});
```

### Then run:
```bash
node middleware/server.js
```
Scan the QR code that appears in the browser window.

---

##  Deploy to VPS

1. **Copy `tokens/` folder** from your local machine to the VPS after scanning the QR:
```bash
scp -r tokens/ root@your-vps-ip:/root/GVFL/tokens/
```

2. **Edit `server.js` on the VPS**:
```js
venom.create({
  headless: "new", // ✅ Use headless mode on servers
  ...
});
```

3. **Use PM2 to keep it running:**
```bash
npm install -g pm2

# Run both the Discord bot and WhatsApp middleware:
pm2 start start.js --name gvfl-bot
pm2 save

```
4 **Start/stop the whole system**
```bash
pm2 restart gvfl-bot
pm2 logs gvfl-bot
pm2 stop gvfl-bot

```


---

## ⏱️ Automation with Cron
Fantasy leagues are checked every 12 hours, and standings are posted every 6 hours.

To enable automation:
```bash
chmod +x setup-cron.sh
./setup-cron.sh
```

This sets up cron entries for:
- `/jobs/runFantasyCheck.js` → awards placements if leagues end
- `/jobs/runPostStandings.js` → posts the fantasy leaderboard

---

##  Commands
All slash commands are located in `/bot/commands`.

### Example commands:
- `/season` — View current season leaderboard
- `/leaderboard` — View all-time points
- `/addplacement` — Manually add points
- `/newseason` — Start a new season
- `/selectseason` — Choose the active season
- `/undo` — Revert last action

---

##  Folders
- `bot/commands` — Discord slash commands
- `bot/utils` — Core logic: placements, standings
- `jobs/` — Scheduled automation tasks
- `middleware/` — WhatsApp + QR scanner server

---

## Credits
Inspired by the need to track HLTV fantasy placements without manual effort.

---

##  Notes
- Always run the bot locally **first** to generate `tokens/`.
- Store `.env` and `tokens/` securely (never commit them).
- Works with WhatsApp groups and Discord webhooks.
- After everything is setup, you just need to use /fantasylink [https://www.hltv.org/fantasy/69/league/69696969/join?secret=12313123123123123123123 for example], and everything starts tracking
> ⚠️ This project scrapes HLTV fantasy data for personal and educational purposes only. HLTV is not affiliated with this tool in any way.


---

Enjoy automated HLTV fantasy tracking!
