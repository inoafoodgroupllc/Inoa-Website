// Exposes public Square credentials to the client-side Web Payments SDK.
// applicationId and locationId are safe to expose (equivalent to a publishable key).
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    applicationId: process.env.SQUARE_APPLICATION_ID || '',
    locationId:    process.env.SQUARE_LOCATION_ID    || '',
    env:           process.env.SQUARE_ENV            || 'sandbox',
  });
}
