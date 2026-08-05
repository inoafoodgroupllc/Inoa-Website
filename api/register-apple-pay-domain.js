// One-shot: registers inoa.kitchen with Square for Apple Pay.
// Call once: GET /api/register-apple-pay-domain
// Safe to call multiple times — Square returns 200 if already registered.

export default async function handler(req, res) {
  const baseUrl = process.env.SQUARE_ENV === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

  const domain = (process.env.SITE_URL || 'https://inoa.kitchen').replace(/^https?:\/\//, '');

  const r = await fetch(`${baseUrl}/v2/apple-pay/domains`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      'Square-Version': '2025-01-23',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domain_name: domain }),
  });

  const body = await r.json();
  return res.status(r.status).json(body);
}
