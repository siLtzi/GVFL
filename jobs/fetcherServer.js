require('dotenv').config();
const express = require('express');
const { fetchJsonWithFallback } = require('./hltvApi');

const app = express();
const port = process.env.HLTV_FETCHER_PORT || 8787;

function isAllowedUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('hltv.org');
  } catch (err) {
    return false;
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/raw', async (req, res) => {
  const { url } = req.query;
  if (!url || !isAllowedUrl(url)) {
    return res.status(400).json({ error: 'Invalid url' });
  }

  try {
    const json = await fetchJsonWithFallback(url);
    return res.json(json);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`🛰️  HLTV fetcher listening on :${port}`);
});
