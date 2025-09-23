/*const venom = require("venom-bot");
const fs = require("fs");
const path = require("path");

const TOKENS_DIR = path.join(__dirname, "..", "tokens", "gvfl-bot");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntilConnected(client, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await client.isConnected()) return true; } catch {}
    await sleep(800);
  }
  return false;
}
async function waitUntilWapiReady(client, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { await client.getHostDevice(); return true; } catch {}
    await sleep(800);
  }
  return false;
}

venom.create(
  {
    session: "gvfl-bot",
    multidevice: true,
    headless: true,                 // set false locally if you want a window
    useChrome: true,
    folderNameToken: "tokens",       // let venom manage ./tokens/<session>
    disableWelcome: true,
    logQR: false,
    autoClose: false,

    // Ensure Chromium + exact profile path (so tokens land in TOKENS_DIR)
    browserPathExecutable: "/usr/bin/chromium-browser", // adjust on Windows if needed
    browserArgs: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--user-data-dir=${TOKENS_DIR}`, // force profile location
      "--profile-directory=Default",
    ],
  },
  // optional: QR callback; write to disk for remote scan if needed
  (base64Qr) => {
    try {
      const out = path.join(__dirname, "..", "qr.png");
      fs.writeFileSync(out, Buffer.from(base64Qr.split(",")[1], "base64"));
      console.log("💾 QR saved:", out);
    } catch (e) {
      console.warn("QR save failed:", e?.message || e);
    }
  }
)
.then(async (client) => {
  console.log("✅ Venom bot started");
  console.log("📂 Tokens directory:", TOKENS_DIR);
  fs.mkdirSync(TOKENS_DIR, { recursive: true });

  // Wait for full readiness before dumping portable session
  process.stdout.write("⌛ Waiting for WhatsApp to connect… ");
  const okConn = await waitUntilConnected(client);
  const okWapi = okConn && (await waitUntilWapiReady(client));
  console.log(okConn && okWapi ? "OK" : "not ready (will still run)");

  // Try to dump a portable session (cross-OS) once ready
  if (okConn && okWapi) {
    try {
      const token = await client.getSessionTokenBrowser();
      const out = path.join(TOKENS_DIR, "session.browser.json");
      fs.writeFileSync(out, JSON.stringify(token, null, 2));
      console.log("📦 Portable session saved:", out);
    } catch (err) {
      console.warn("⚠️ Could not dump portable session:", err?.message || err);
    }
  }

  start(client);
})
.catch((err) => {
  console.error("❌ Venom error:", err);
});

function start(client) {
  client.onMessage(async (message) => {
    console.log(`[${message.chatId}] ${message.sender?.pushname || message.from}: ${message.body}`);
  });
}*/
