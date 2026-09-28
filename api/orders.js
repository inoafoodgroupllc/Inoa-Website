// GET /api/orders — lists paid orders from Firestore.
// Protected by ADMIN_KEY env var. Hit: /api/orders?key=YOUR_ADMIN_KEY&date=YYYY-MM-DD

const FIREBASE_PROJECT_ID = 'inoa-times';
const FIREBASE_API_KEY    = 'AIzaSyCRMeTQKvGhRpPsSAXF69EZAdYYGths';

export default async function handler(req, res) {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const dateFilter = req.query.date || null;

  // Build structured query to filter by date if provided
  let firestoreUrl;
  let body;

  if (dateFilter) {
    firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIREBASE_API_KEY}`;
    body = JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'fulfillmentDate' },
            op: 'EQUAL',
            value: { stringValue: dateFilter },
          },
        },
        orderBy: [{ field: { fieldPath: 'slotKey' }, direction: 'ASCENDING' }],
      },
    });
  } else {
    firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/orders?key=${FIREBASE_API_KEY}&pageSize=100`;
  }

  const r = await fetch(firestoreUrl, dateFilter
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    : { method: 'GET' });

  const responseBody = await r.json();
  if (!r.ok) return res.status(500).json(responseBody);

  // runQuery returns array of {document: {...}} objects; list returns {documents: [...]}
  const rawDocs = dateFilter
    ? (responseBody || []).map(item => item.document).filter(Boolean)
    : (responseBody.documents || []);

  const orders = rawDocs.map(doc => {
    const f = doc.fields || {};
    return {
      squareOrderId:    f.squareOrderId?.stringValue,
      squarePaymentId:  f.squarePaymentId?.stringValue,
      slotDocId:        f.slotDocId?.stringValue,
      slotKey:          f.slotKey?.stringValue,
      fulfillmentType:  f.fulfillmentType?.stringValue || 'pickup',
      customerName:     f.customerName?.stringValue,
      customerPhone:    f.customerPhone?.stringValue,
      customerEmail:    f.customerEmail?.stringValue,
      fulfillmentDate:  f.fulfillmentDate?.stringValue,
      fulfillmentTime:  f.fulfillmentTime?.stringValue,
      orderItems:       f.orderItems?.stringValue,
      orderTotal:       f.orderTotal?.stringValue,
      paidAt:           f.paidAt?.timestampValue,
      emailSent:        f.emailSent?.booleanValue,
      zone:             f.zone?.stringValue,
      zoneName:         f.zoneName?.stringValue,
      dropWindow:       f.dropWindow?.stringValue,
      deliveryAddress:  f.deliveryAddress?.stringValue,
      deliveryApt:      f.deliveryApt?.stringValue,
      deliveryNotes:    f.deliveryNotes?.stringValue,
      deliveryFeeCents: f.deliveryFeeCents?.integerValue ? Number(f.deliveryFeeCents.integerValue) : 0,
    };
  });

  // When no date filter, sort by paidAt descending (newest first)
  if (!dateFilter) {
    orders.sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
  }

  return res.status(200).json({ count: orders.length, orders });
}
