import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.pdf':  'application/pdf',
};

// Load .env for local dev (Node 20+ built-in flag: node --env-file=.env serve.mjs)
// Falls back to process.env for production environments
const MC_API_KEY  = process.env.MC_API_KEY;
const MC_LIST_ID  = process.env.MC_LIST_ID;
const MC_DC       = process.env.MC_DC || 'us6';
const MC_AUTH     = 'Basic ' + Buffer.from('anystring:' + MC_API_KEY).toString('base64');

async function handleSubscribe(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;

  let email;
  try { email = JSON.parse(body).email; } catch { /* ignore */ }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'invalid email' }));
  }

  const mcRes = await fetch(`https://${MC_DC}.api.mailchimp.com/3.0/lists/${MC_LIST_ID}/members`, {
    method: 'POST',
    headers: { 'Authorization': MC_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_address: email, status: 'subscribed' }),
  });

  const data = await mcRes.json();

  if (mcRes.ok || data.title === 'Member Exists') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, already: data.title === 'Member Exists' }));
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: data.detail || 'subscription failed' }));
  }
}

http.createServer(async (req, res) => {
  // Newsletter subscribe API
  if (req.method === 'POST' && req.url === '/api/subscribe') {
    return handleSubscribe(req, res);
  }

  let url = req.url.split('?')[0];

  // Clean URL routing (mirrors vercel.json)
  if (url === '/' || url === '/home' || url === '/index.html') url = '/index.html';
  else if (url === '/order'   || url === '/order.html')   url = '/order.html';
  else if (url === '/privacy' || url === '/privacy.html') url = '/privacy.html';
  else if (url === '/refund'  || url === '/refund.html')  url = '/refund.html';
  else if (url === '/terms'   || url === '/terms.html')   url = '/terms.html';

  const filePath = path.join(__dirname, decodeURIComponent(url));
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + url);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
}).listen(PORT, () => {
  console.log(`inoa dev server → http://localhost:${PORT}`);
});
