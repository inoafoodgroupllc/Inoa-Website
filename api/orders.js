// GET /api/orders — lists all paid orders from Firestore, newest first.
// Protected by ADMIN_KEY env var. Hit: /api/orders?key=YOUR_ADMIN_KEY

const FIREBASE_PROJECT_ID = 'inoa-times';
const FIREBASE_API_KEY    = 'AIzaSyCRMeTQKvGhRpPsSAXF69EZAdYYGths';

export default async function handler(req, res) {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/orders?key=${FIREBASE_API_KEY}&pageSize=100`;
  const r   = await fetch(url);
  const body = await r.json();

  if (!r.ok) return res.status(500).json(body);

  const orders = (body.documents || []).map(doc => {
    const f = doc.fields || {};
    return {
      squareOrderId:   f.squareOrderId?.stringValue,
      squarePaymentId: f.squarePaymentId?.stringValue,
      slotDocId:       f.slotDocId?.stringValue,
      customerName:    f.customerName?.stringValue,
      customerPhone:   f.customerPhone?.stringValue,
      customerEmail:   f.customerEmail?.stringValue,
      fulfillmentDate: f.fulfillmentDate?.stringValue,
      fulfillmentTime: f.fulfillmentTime?.stringValue,
      orderItems:      f.orderItems?.stringValue,
      orderTotal:      f.orderTotal?.stringValue,
      paidAt:          f.paidAt?.timestampValue,
      emailSent:       f.emailSent?.booleanValue,
    };
  }).sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));

  return res.status(200).json({ count: orders.length, orders });
}
