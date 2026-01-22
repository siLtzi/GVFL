const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--start-maximized"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
  );

  await page.goto("https://www.hltv.org/fantasy");

  console.log("🔐 Browse HLTV to pass Cloudflare check... (you have ~60 seconds)");
  console.log("   Navigate to a fantasy league page if possible.");
  await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 min

  const cookies = await page.cookies();
  const cookiesPath = path.join(__dirname, "../../jobs/cookies.json");
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  console.log(`✅ Cookies saved to ${cookiesPath}`);
  console.log(`   Saved ${cookies.length} cookies`);

  await browser.close();
})();