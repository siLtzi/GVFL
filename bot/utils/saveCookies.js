// saveCookies.js
const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
  const browser = await puppeteer.launch({
  headless: false,
  args: ["--start-maximized"],
});

  const page = await browser.newPage();
  await page.setUserAgent(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
);

  await page.goto("https://www.hltv.org/login");

  console.log("🔐 Log into HLTV manually… (you have ~60 seconds)");
  await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 min
const client = await page.target().createCDPSession();
await client.send("Network.clearBrowserCookies");

  const cookies = await page.cookies();
  fs.writeFileSync("cookies.json", JSON.stringify(cookies, null, 2));
  console.log("✅ Cookies saved to cookies.json");

  await browser.close();
})();
