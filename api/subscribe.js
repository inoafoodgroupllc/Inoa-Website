// Vercel serverless function — /api/subscribe
// Proxies newsletter signup to Mailchimp Marketing API server-side.
// Set MC_API_KEY, MC_LIST_ID, MC_DC in your Vercel environment variables.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { email } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid email' });
  }

  const MC_API_KEY = process.env.MC_API_KEY;
  const MC_LIST_ID = process.env.MC_LIST_ID;
  const MC_DC      = process.env.MC_DC || 'us6';
  const MC_AUTH    = 'Basic ' + Buffer.from('anystring:' + MC_API_KEY).toString('base64');

  const mcRes = await fetch(`https://${MC_DC}.api.mailchimp.com/3.0/lists/${MC_LIST_ID}/members`, {
    method: 'POST',
    headers: { 'Authorization': MC_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_address: email, status: 'subscribed' }),
  });

  const data = await mcRes.json();

  if (mcRes.ok || data.title === 'Member Exists') {
    return res.status(200).json({ ok: true, already: data.title === 'Member Exists' });
  }

  return res.status(200).json({ error: data.detail || 'subscription failed' });
}
