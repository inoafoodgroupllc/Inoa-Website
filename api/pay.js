// POST /api/pay
// Creates a Square Order then charges the card token from the Web Payments SDK.
// Prices are authoritative on the server — never trust the client.

import crypto from 'crypto';
import SCHEDULE from './_schedule.js';

// ── Authoritative price catalogue (cents) ────────────────────────────
const CATALOG = {
  // POKE BOX
  101: { name: 'Poke + Rice',             cents: 1600 },
  102: { name: 'Regular Size Poke Box',   cents: 1850 },
  103: { name: 'Large Size Poke Box',     cents: 2350 },
  104: { name: 'Handroll Box',            cents: 2500 },
  // POKE ½LB
  201: { name: 'Shoyu Ahi',               cents: 1700 },
  202: { name: 'Spicy Ahi',               cents: 1700 },
  203: { name: 'Hawaiian Ahi',            cents: 1700 },
  204: { name: 'Spicy Salmon',            cents: 1600 },
  205: { name: 'Sweet Unagi Salmon',      cents: 1600 },
  206: { name: 'Chili Garlic Salmon',     cents: 1600 },
  207: { name: 'Tobiko Scallop',          cents: 1600 },
  208: { name: 'Kimchi Tako',             cents: 1600 },
  209: { name: 'Garlic Shrimp',           cents: 1500 },
  // COMBOS
  301: { name: 'Salmon Belly Combo',      cents: 1850 },
  302: { name: 'Ahi Combo',               cents: 2000 },
  // SPECIALS
  401: { name: 'Poke Nachos',             cents: 1650 },
  402: { name: 'Poke Bombs',              cents: 1200 },
  403: { name: 'Spicy Tuna Bowl',         cents: 1200 },
  404: { name: 'Sushi Bake',              cents: 1200 },
  // SIDES
  501: { name: 'Crab Mac Salad',          cents:  600 },
  502: { name: 'Seaweed Salad',           cents:  500 },
  503: { name: 'Kimchi Cucumber',         cents:  500 },
  504: { name: 'Cold Roasted Sweet Potato', cents: 500 },
  // MUSUBI
  601: { name: 'Single Musubi',           cents:  400 },
  602: { name: 'Triple Pack',             cents: 1000 },
  // ADD-ONS (standalone orderable)
  701: { name: 'Wasabi',                  cents:   75 },
  702: { name: 'Side of Spicy Mayo',      cents:  150 },
  703: { name: 'Side of Sweet Soy',       cents:  150 },
  704: { name: 'Side of Pickled Fresno Chili', cents: 200 },
  705: { name: 'Side of Takuan',          cents:  200 },
  706: { name: 'Roasted Nori Pack',       cents:  250 },
  707: { name: 'Seasoned Sushi Rice',     cents:  400 },
  // DRINKS
  801: { name: 'Hawaiian Sun',            cents:  300 },
  // HAWAII AHI DROP (one-time)
  1001: { name: 'Hawaiian Ahi ½lb',       cents: 2000 },
  1002: { name: 'Shoyu Ahi ½lb',          cents: 2000 },
  1003: { name: 'Spicy Ahi ½lb',          cents: 2000 },
  1004: { name: 'Seasoned Sushi Rice',    cents:  500 },
  1005: { name: 'Seaweed Salad',          cents:  500 },
  1006: { name: 'Hawaii Ahi Bundle',      cents: 2800 },
  // KANPACHI DROP
  210:  { name: 'Kanpachi Jalapeño Ponzu (½ lb)', cents: 2000 },
  901:  { name: "ʻEkolu Set",               cents: 2450 },
};

const ADDON_PRICES = {
  'Sliced Avocado':      100,
  'Roasted Nori Pack':   250,
  'Spicy Mayo Drizzle':   50,
  'Sweet Soy Drizzle':    50,
  'Wasabi':               75,
};

const PREMIUM_FLAVOR_PRICES = {
  'Kanpachi Jalapeño Ponzu': 250,
};

const PROTEIN_PRICES = {
  'Salmon':  300,
  'Shrimp':  300,
  'Ahi':     500,
  'Scallop': 500,
};

// ── LA timezone helpers ───────────────────────────────────────────────
function getLANow() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  return {
    hour: +p.hour,
    minute: +p.minute,
    dateKey: `${p.year}-${p.month}-${p.day}`,
    dow: new Date(+p.year, +p.month - 1, +p.day).getDay(),
  };
}

function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
}

function daysAheadFromLA(laDateKey, targetDateKey) {
  const la = parseDateKey(laDateKey);
  const tg = parseDateKey(targetDateKey);
  return Math.round((new Date(tg.y, tg.m - 1, tg.d) - new Date(la.y, la.m - 1, la.d)) / 86400000);
}

// ── Slot helpers ──────────────────────────────────────────────────────
function pickupAtISO(date, timeLabel) {
  const start = timeLabel.split('–')[0].trim();
  const m = start.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return `${date}T12:00:00-07:00`;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${date}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00-07:00`;
}

function deriveSlotKey(timeLabel) {
  const start = timeLabel.split('–')[0].trim();
  const m = start.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return '1200';
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}${String(min).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { cartItems, details, sourceId, tipCents = 0 } = req.body || {};
  const isDelivery = details?.fulfillmentType === 'delivery';

  if (!cartItems?.length || !details?.date || !details?.firstName || !sourceId) {
    return res.status(400).json({ error: 'missing required fields' });
  }
  if (!isDelivery && !details.time) {
    return res.status(400).json({ error: 'missing required fields' });
  }
  if (isDelivery && (!details.zone || !details.deliveryAddress)) {
    return res.status(400).json({ error: 'missing required fields' });
  }

  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
    console.error('[inoa] Missing Square env vars');
    return res.status(500).json({ error: 'server configuration error' });
  }

  try {
    // ── Schedule validations ───────────────────────────────────────
    const la = getLANow();
    const requestedDate = details.date;
    const { dow: requestedDow } = parseDateKey(requestedDate);
    const daysAhead = daysAheadFromLA(la.dateKey, requestedDate);

    if (daysAhead < 1 || daysAhead > SCHEDULE.maxDaysAhead) {
      return res.status(400).json({ error: 'invalid_date', detail: 'Date is outside the booking window.' });
    }
    if (!SCHEDULE.openDays.includes(requestedDow) || SCHEDULE.closureDates.includes(requestedDate)) {
      return res.status(400).json({ error: 'closed_day', detail: 'Orders are not available on that date.' });
    }

    const cutH = SCHEDULE.orderCutoffHour;
    const cutM = SCHEDULE.orderCutoffMinute ?? 0;
    const pastCutoff = la.hour > cutH || (la.hour === cutH && la.minute >= cutM);
    if (daysAhead === 1 && pastCutoff) {
      return res.status(400).json({ error: 'past_cutoff', detail: 'Orders for tomorrow are closed after 8 PM. Please choose a later date.' });
    }

    if (isDelivery) {
      if (!SCHEDULE.delivery.enabled) {
        return res.status(400).json({ error: 'delivery_disabled', detail: 'Delivery is not currently available.' });
      }
      if (!SCHEDULE.delivery.deliveryDays.includes(requestedDow)) {
        return res.status(400).json({ error: 'not_delivery_day', detail: 'Delivery is not available on that day.' });
      }
    }

    // ── Build line items ───────────────────────────────────────────
    const line_items = [];
    let subtotalCents = 0;

    for (const ci of cartItems) {
      const catalogItem = CATALOG[ci.itemId];
      if (!catalogItem) continue;

      let totalCents = catalogItem.cents;
      for (const addon of (ci.modifiers?.addOns || [])) {
        const addonCents = ADDON_PRICES[addon.name];
        if (addonCents !== undefined) totalCents += addonCents;
      }
      if (ci.modifiers?.protein?.name) {
        totalCents += PROTEIN_PRICES[ci.modifiers.protein.name] ?? 0;
      }
      for (const f of (ci.modifiers?.flavors || [])) {
        totalCents += PREMIUM_FLAVOR_PRICES[f] ?? 0;
      }

      const qty = ci.quantity || 1;
      subtotalCents += totalCents * qty;

      const modParts = [];
      if (ci.modifiers?.protein?.name && ci.modifiers.protein.name !== 'Regular (crab)') modParts.push(ci.modifiers.protein.name);
      if (ci.modifiers?.flavors?.length)  modParts.push(ci.modifiers.flavors.join(' + '));
      if (ci.modifiers?.sides?.length)    modParts.push(ci.modifiers.sides.join(', '));
      if (ci.modifiers?.fish)             modParts.push(ci.modifiers.fish);
      if (ci.modifiers?.addOns?.length)   modParts.push(ci.modifiers.addOns.map(a => `+${a.name}`).join(', '));
      const name = modParts.length > 0
        ? `${catalogItem.name} (${modParts.join(' · ')})`
        : catalogItem.name;

      line_items.push({
        name,
        quantity:         String(qty),
        base_price_money: { amount: totalCents, currency: 'USD' },
      });
    }

    if (details.promoFreeMusubi) {
      line_items.push({
        name:             'Spam Musubi (TANIKA — complimentary)',
        quantity:         '1',
        base_price_money: { amount: 0, currency: 'USD' },
      });
    }

    if (!line_items.length) return res.status(400).json({ error: 'empty cart' });

    // ── Delivery-specific validations ──────────────────────────────
    let foundZone = null;
    let deliveryFeeCents = 0;

    if (isDelivery) {
      foundZone = SCHEDULE.delivery.zones.find(z => z.id === details.zone);
      if (!foundZone) {
        return res.status(400).json({ error: 'invalid_zone', detail: 'Unknown delivery zone.' });
      }
      const zoneMinimum = foundZone.minimum ?? SCHEDULE.delivery.minimum;
      if (subtotalCents < zoneMinimum * 100) {
        return res.status(400).json({ error: 'below_minimum', detail: `Delivery requires a $${zoneMinimum} minimum order.` });
      }
      deliveryFeeCents = SCHEDULE.delivery.fee * 100;

      // Delivery cap check (non-atomic, acceptable for low-volume)
      try {
        const capQueryBody = {
          structuredQuery: {
            from: [{ collectionId: 'slots' }],
            where: {
              compositeFilter: {
                op: 'AND',
                filters: [
                  { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: requestedDate } } },
                  { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'paid' } } },
                ],
              },
            },
            select: { fields: [{ fieldPath: 'slotKey' }] },
          },
        };
        const capRes = await fetch(
          `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIREBASE_API_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(capQueryBody) }
        );
        const capDocs = await capRes.json();
        const deliveryPaidCount = capDocs.filter(d => d.document?.fields?.slotKey?.stringValue?.startsWith('delivery_')).length;
        console.log('[inoa] Delivery paid count for', requestedDate, ':', deliveryPaidCount);
        if (deliveryPaidCount >= SCHEDULE.delivery.dailyCap) {
          return res.status(409).json({ error: 'sold_out', detail: 'Delivery is sold out for that date.' });
        }
      } catch (capErr) {
        console.error('[inoa] Delivery cap check error (proceeding):', capErr?.message);
      }

      if (deliveryFeeCents > 0) {
        line_items.push({
          name:             'Delivery fee',
          quantity:         '1',
          base_price_money: { amount: deliveryFeeCents, currency: 'USD' },
        });
      }
    }

    // ── Discounts ──────────────────────────────────────────────────
    const discounts = [];
    if (details.ucscStudent) {
      discounts.push({ uid: 'ucsc', name: 'UCSC Student Discount (10%)', type: 'FIXED_PERCENTAGE', percentage: '10', scope: 'ORDER' });
    }
    if (details.promoDiscount && details.promoCode) {
      const pct = String(Math.round(details.promoDiscount * 100));
      discounts.push({ uid: 'promo', name: `${details.promoCode.toUpperCase()} Promo (${pct}% off)`, type: 'FIXED_PERCENTAGE', percentage: pct, scope: 'ORDER' });
    }

    const baseUrl = process.env.SQUARE_ENV === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';

    const FIREBASE_PROJECT_ID = 'inoa-times';
    const FIREBASE_API_KEY    = 'AIzaSyCRMeTQKvGhRpPsSAXF69EZAdYYGths';

    // ── Slot ID & pickup-specific pre-check ────────────────────────
    let slotDocId;
    let slotUpdateTime = null;

    if (isDelivery) {
      slotDocId = `${requestedDate}_delivery_${details.zone}_${crypto.randomUUID().slice(0, 8)}`;
    } else {
      slotDocId = `${requestedDate}_${deriveSlotKey(details.time)}`;
      // Pre-check: reject if pickup slot already paid
      const slotBaseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/slots/${encodeURIComponent(slotDocId)}?key=${FIREBASE_API_KEY}`;
      try {
        const slotRead = await fetch(slotBaseUrl);
        if (slotRead.ok) {
          const slotDoc = await slotRead.json();
          const status = slotDoc.fields?.status?.stringValue;
          slotUpdateTime = slotDoc.updateTime || null;
          console.log('[inoa] Slot pre-check:', slotDocId, '| status:', status);
          if (status === 'paid') {
            console.warn('[inoa] Slot already paid — rejecting charge:', slotDocId);
            return res.status(409).json({ error: 'slot_taken', detail: 'That pickup time was just booked by someone else. Please go back and choose a different slot.' });
          }
        }
      } catch (preCheckErr) {
        console.error('[inoa] Slot pre-check error (proceeding anyway):', preCheckErr?.message);
      }
    }

    // ── Kanpachi inventory check ───────────────────────────────────
    const KANPACHI_FLAVOR = 'Kanpachi Jalapeño Ponzu';
    let totalKanpachiOz = 0;
    for (const ci of cartItems) {
      const qty = ci.quantity || 1;
      if (ci.itemId === 210) {
        totalKanpachiOz += (SCHEDULE.kanpachi.ozPerItem[210] ?? 6) * qty;
      } else if (ci.itemId === 901) {
        const hasUpgrade = (ci.modifiers?.flavors || []).includes(KANPACHI_FLAVOR);
        const ozBase     = SCHEDULE.kanpachi.ozPerItem[901] ?? 1;
        const ozUpgrade  = hasUpgrade ? (SCHEDULE.kanpachi.ekoluUpgradeOz ?? 3) : 0;
        totalKanpachiOz += (ozBase + ozUpgrade) * qty;
      } else {
        const flavorCount = (ci.modifiers?.flavors || []).filter(f => f === KANPACHI_FLAVOR).length;
        if (flavorCount > 0) {
          totalKanpachiOz += (SCHEDULE.kanpachi.ozPerFlavor[ci.itemId] ?? 2) * flavorCount * qty;
        }
      }
    }

    let kanpachiUpdateTime = null;
    let kanpachiRemainingOz = 0;
    if (totalKanpachiOz > 0) {
      try {
        const kUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/kanpachi/current?key=${FIREBASE_API_KEY}`;
        const kRes = await fetch(kUrl);
        if (kRes.ok) {
          const kDoc = kRes.status === 404 ? null : await kRes.json();
          if (!kDoc || kDoc.fields?.enabled?.booleanValue === false) {
            return res.status(409).json({ error: 'kanpachi_sold_out', detail: 'Kanpachi is no longer available. Please remove kanpachi items and try again.' });
          }
          kanpachiRemainingOz = kDoc.fields?.remainingOz?.integerValue
            ? parseInt(kDoc.fields.remainingOz.integerValue)
            : (kDoc.fields?.remainingOz?.doubleValue ?? 0);
          kanpachiUpdateTime  = kDoc.updateTime || null;
          if (kanpachiRemainingOz < totalKanpachiOz) {
            return res.status(409).json({ error: 'kanpachi_sold_out', detail: 'Not enough kanpachi remaining. Please remove kanpachi items and try again.' });
          }
        } else if (kRes.status === 404) {
          return res.status(409).json({ error: 'kanpachi_sold_out', detail: 'Kanpachi is no longer available.' });
        }
      } catch (kErr) {
        console.error('[inoa] Kanpachi pre-check error (proceeding):', kErr?.message);
      }
    }

    // ── Create Square Order ────────────────────────────────────────
    let pickupAtValue;
    let fulfillmentNote = '';
    if (isDelivery) {
      const slotStartHour = details.deliverySlot
        ? parseInt(details.deliverySlot.split('-')[0], 10)
        : SCHEDULE.delivery.startHour;
      pickupAtValue = `${requestedDate}T${String(slotStartHour).padStart(2, '0')}:00:00-07:00`;
      fulfillmentNote = `DELIVERY — ${foundZone.name} · ${details.dropWindow || ''} · ${details.deliveryAddress}${details.deliveryApt ? ' ' + details.deliveryApt : ''}`;
    } else {
      pickupAtValue = pickupAtISO(requestedDate, details.time);
    }

    const recipientName = `${details.firstName}${details.lastName ? ' ' + details.lastName : ''}`;

    const orderBody = {
      idempotency_key: crypto.randomUUID(),
      order: {
        reference_id: slotDocId,
        location_id:  process.env.SQUARE_LOCATION_ID,
        line_items,
        taxes: [{
          uid:        'sales_tax',
          name:       'Santa Cruz County Sales Tax (9.75%)',
          type:       'ADDITIVE',
          percentage: '9.75',
          scope:      'ORDER',
        }],
        ...(discounts.length > 0 ? { discounts } : {}),
        fulfillments: [{
          type: 'PICKUP',
          pickup_details: {
            schedule_type: 'SCHEDULED',
            pickup_at: pickupAtValue,
            ...(fulfillmentNote ? { note: fulfillmentNote } : {}),
            recipient: {
              display_name: recipientName,
              ...(details.phone ? { phone_number: details.phone } : {}),
              ...(details.email ? { email_address: details.email } : {}),
            },
            ...(details.notes ? { note: details.notes } : {}),
          },
        }],
        metadata: {
          slot_doc_id: slotDocId,
          ...(details.voucher ? { voucher:        details.voucher } : {}),
          ...(details.phone   ? { customer_phone: details.phone   } : {}),
        },
      },
    };

    console.log('[inoa] Creating Square order...', isDelivery ? '(delivery)' : '(pickup)');
    const orderRes = await fetch(`${baseUrl}/v2/orders`, {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        'Content-Type':   'application/json',
        'Square-Version': '2025-01-23',
      },
      body: JSON.stringify(orderBody),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      console.error('[inoa] Square order error:', JSON.stringify(orderData.errors));
      return res.status(500).json({
        error:  'failed to create order',
        detail: orderData.errors?.map(e => `[${e.code}] ${e.field}: ${e.detail}`).join(' | ') || JSON.stringify(orderData),
      });
    }

    const order = orderData.order;
    const orderAmountCents = order.total_money.amount;

    // ── Charge card ────────────────────────────────────────────────
    const paymentBody = {
      idempotency_key: crypto.randomUUID(),
      source_id:       sourceId,
      amount_money:    { amount: orderAmountCents, currency: 'USD' },
      order_id:        order.id,
      ...(tipCents > 0 ? { tip_money: { amount: tipCents, currency: 'USD' } } : {}),
    };

    console.log('[inoa] Charging card for order:', order.id, 'amount:', orderAmountCents, 'tip:', tipCents);
    const paymentRes = await fetch(`${baseUrl}/v2/payments`, {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        'Content-Type':   'application/json',
        'Square-Version': '2025-01-23',
      },
      body: JSON.stringify(paymentBody),
    });

    const paymentData = await paymentRes.json();
    if (!paymentRes.ok) {
      console.error('[inoa] Square payment error:', JSON.stringify(paymentData.errors));
      return res.status(500).json({
        error:  'payment failed',
        detail: paymentData.errors?.map(e => `[${e.code}] ${e.field}: ${e.detail}`).join(' | ') || JSON.stringify(paymentData),
      });
    }

    const payment = paymentData.payment;
    const meta     = order.metadata || {};
    const customer = order.fulfillments?.[0]?.pickup_details?.recipient || {};
    const rawPickupAt = order.fulfillments?.[0]?.pickup_details?.pickup_at;

    const formattedPickupAt = rawPickupAt ? (() => {
      try {
        return new Date(rawPickupAt).toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        });
      } catch (_) { return rawPickupAt; }
    })() : '—';

    const fulfillmentTime = isDelivery
      ? `${foundZone.name} — ${details.dropWindow || ''}`
      : formattedPickupAt;

    const lineItemsText = (() => {
      const lines = (order.line_items || []).map(li =>
        `${li.name} ×${li.quantity} — $${((Number(li.base_price_money?.amount) || 0) / 100 * parseInt(li.quantity)).toFixed(2)}`
      );
      // Append packing notes for ʻEkolu Set
      for (const ci of cartItems) {
        if (ci.itemId === 901) {
          const hasKanpachi = (ci.modifiers?.flavors || []).includes(KANPACHI_FLAVOR);
          lines.push('  → PACK: Sashimi trio (kanpachi, ahi, salmon) fanned on top · Takuan + pickled fresno in separate cup');
          if (hasKanpachi && isDelivery) {
            lines.push('  → DELIVERY: Ponzu in 1 oz side cup · Fried garlic packed separately');
          }
        }
      }
      return lines.join('\n');
    })();
    const orderTotalStr = `$${(Number(order.total_money?.amount || 0) / 100).toFixed(2)}`;

    const paidAt = new Date().toISOString();

    // ── Write full order record to Firestore ───────────────────────
    try {
      const orderDocUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/orders/${encodeURIComponent(order.id)}?key=${FIREBASE_API_KEY}`;
      await fetch(orderDocUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            squareOrderId:    { stringValue: order.id },
            squarePaymentId:  { stringValue: payment.id },
            slotDocId:        { stringValue: slotDocId },
            slotKey:          { stringValue: isDelivery ? `delivery_${details.zone}` : deriveSlotKey(details.time) },
            fulfillmentType:  { stringValue: isDelivery ? 'delivery' : 'pickup' },
            customerName:     { stringValue: customer.display_name || '' },
            customerPhone:    { stringValue: meta.customer_phone || customer.phone_number || '' },
            customerEmail:    { stringValue: customer.email_address || '' },
            fulfillmentDate:  { stringValue: requestedDate },
            fulfillmentTime:  { stringValue: fulfillmentTime },
            orderItems:       { stringValue: lineItemsText },
            orderTotal:       { stringValue: orderTotalStr },
            paidAt:           { timestampValue: paidAt },
            emailSent:        { booleanValue: false },
            ...(totalKanpachiOz > 0 ? { kanpachiOz: { integerValue: totalKanpachiOz } } : {}),
            ...(isDelivery ? {
              zone:             { stringValue: details.zone },
              zoneName:         { stringValue: foundZone.name },
              dropWindow:       { stringValue: details.dropWindow || '' },
              deliveryAddress:  { stringValue: details.deliveryAddress || '' },
              deliveryApt:      { stringValue: details.deliveryApt || '' },
              deliveryNotes:    { stringValue: details.deliveryNotes || '' },
              deliveryFeeCents: { integerValue: deliveryFeeCents },
            } : {}),
          },
        }),
      });
      console.log('[inoa] Order record saved to Firestore:', order.id);
    } catch (orderErr) {
      console.error('[inoa] Firestore order save error:', orderErr?.message);
    }

    // ── Write slot doc ─────────────────────────────────────────────
    try {
      if (isDelivery) {
        // Create delivery slot doc (new, unique ID — triggers Firestore 'create' rule)
        const deliverySlotUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/slots/${encodeURIComponent(slotDocId)}?key=${FIREBASE_API_KEY}`;
        const dsRes = await fetch(deliverySlotUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              date:            { stringValue: requestedDate },
              slotKey:         { stringValue: `delivery_${details.zone}` },
              fulfillmentType: { stringValue: 'delivery' },
              zone:            { stringValue: details.zone },
              zoneName:        { stringValue: foundZone.name },
              dropWindow:      { stringValue: details.dropWindow || '' },
              status:          { stringValue: 'paid' },
              paidAt:          { timestampValue: paidAt },
              squarePaymentId: { stringValue: payment.id },
            },
          }),
        });
        if (!dsRes.ok) console.error('[inoa] Delivery slot write failed:', await dsRes.text());
        else console.log('[inoa] Delivery slot written:', slotDocId);
      } else {
        // Update pickup slot doc to 'paid' (conditional write on updateTime)
        let slotPatchUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/slots/${encodeURIComponent(slotDocId)}`
          + `?key=${FIREBASE_API_KEY}`
          + `&updateMask.fieldPaths=status&updateMask.fieldPaths=paidAt&updateMask.fieldPaths=squarePaymentId`;
        if (slotUpdateTime) {
          slotPatchUrl += `&currentDocument.updateTime=${encodeURIComponent(slotUpdateTime)}`;
        }
        const fsSlotRes = await fetch(slotPatchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              status:          { stringValue: 'paid' },
              paidAt:          { timestampValue: paidAt },
              squarePaymentId: { stringValue: payment.id },
            },
          }),
        });
        if (fsSlotRes.status === 412) {
          console.error(`[CRITICAL] DOUBLE CHARGE POSSIBLE — slot ${slotDocId} modified between pre-check and paid-mark. Order: ${order.id}, Payment: ${payment.id}. Manual review required.`);
        } else if (!fsSlotRes.ok) {
          console.error('[inoa] Firestore slot update failed:', await fsSlotRes.text());
        } else {
          console.log('[inoa] Slot marked paid (conditional):', slotDocId);
        }
      }
    } catch (slotErr) {
      console.error('[inoa] Firestore slot write error:', slotErr?.message);
    }

    // ── Kanpachi inventory deduction (atomic conditional write) ───────
    if (totalKanpachiOz > 0) {
      try {
        let kPatchUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/kanpachi/current`
          + `?key=${FIREBASE_API_KEY}`
          + `&updateMask.fieldPaths=remainingOz`;
        if (kanpachiUpdateTime) {
          kPatchUrl += `&currentDocument.updateTime=${encodeURIComponent(kanpachiUpdateTime)}`;
        }
        const newOz = Math.max(0, kanpachiRemainingOz - totalKanpachiOz);
        const kPatchRes = await fetch(kPatchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { remainingOz: { integerValue: newOz } } }),
        });
        if (kPatchRes.status === 412) {
          console.error(`[CRITICAL] KANPACHI RACE — inventory doc modified between pre-check and deduction. Order: ${order.id}, Payment: ${payment.id}, oz: ${totalKanpachiOz}. Manual review required.`);
        } else if (!kPatchRes.ok) {
          console.error('[inoa] Kanpachi inventory deduction failed:', await kPatchRes.text());
        } else {
          console.log(`[inoa] Kanpachi deducted ${totalKanpachiOz} oz (remaining: ${newOz})`);
        }
      } catch (kDeductErr) {
        console.error('[inoa] Kanpachi deduction error:', kDeductErr?.message);
      }
    }

    // ── Send order confirmation email (with one retry) ─────────────
    const formspreeId = process.env.FORMSPREE_ORDER_ID || 'mkoqdyzy';
    const deliveryFeeStr = isDelivery
      ? (deliveryFeeCents === 0 ? 'Free' : `$${(deliveryFeeCents / 100).toFixed(2)}`)
      : '';

    const emailPayload = {
      _subject:            `✅ Paid inoa Pre-Order — ${customer.display_name}`,
      customer_name:       customer.display_name,
      customer_phone:      meta.customer_phone || customer.phone_number,
      customer_email:      customer.email_address,
      fulfillment_type:    isDelivery ? 'Delivery' : 'Pickup',
      fulfillment_date:    requestedDate,
      fulfillment_time:    fulfillmentTime,
      ...(isDelivery ? {
        zone_name:           foundZone.name,
        drop_window:         details.dropWindow || '',
        delivery_address:    details.deliveryAddress || '',
        delivery_apt:        details.deliveryApt || '',
        delivery_notes:      details.deliveryNotes || '',
        delivery_fee:        deliveryFeeStr,
      } : {
        pickup_address:      '100 Enterprise Way, Scotts Valley, CA 95066',
      }),
      voucher_number:      meta.voucher || 'none',
      special_instructions: details.notes || 'none',
      order_items:         lineItemsText,
      order_total:         orderTotalStr,
      square_order_id:     order.id,
      square_payment_id:   payment.id,
    };

    let emailSent = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[inoa] Email attempt ${attempt} for:`, customer.display_name);
        const fsRes  = await fetch(`https://formspree.io/f/${formspreeId}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body:    JSON.stringify(emailPayload),
        });
        const fsBody = await fsRes.json().catch(() => ({}));
        if (fsRes.ok) {
          emailSent = true;
          console.log('[inoa] Confirmation email sent OK on attempt', attempt);
          break;
        }
        console.error(`[inoa] Formspree attempt ${attempt} failed:`, fsRes.status, JSON.stringify(fsBody));
      } catch (emailErr) {
        console.error(`[inoa] Email attempt ${attempt} threw:`, emailErr?.message);
      }
    }

    // Update Firestore order record with email status
    try {
      const orderDocUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/orders/${encodeURIComponent(order.id)}`
        + `?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=emailSent`;
      await fetch(orderDocUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { emailSent: { booleanValue: emailSent } } }),
      });
    } catch (_) {}

    if (!emailSent) {
      console.error('[inoa] EMAIL FAILED FOR ORDER:', order.id, '| customer:', customer.display_name, '| total:', orderTotalStr);
    }

    return res.status(200).json({
      success:   true,
      orderId:   order.id,
      paymentId: payment.id,
      slotDocId,
    });

  } catch (err) {
    console.error('[inoa] Unexpected error:', err);
    return res.status(500).json({ error: 'unexpected error', detail: err?.message });
  }
}
