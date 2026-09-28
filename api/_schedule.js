// ── SERVER-SIDE SCHEDULE CONFIG ──────────────────────────────────────────────
// Static ES module — imported by api/schedule.js and api/pay.js.
// Vercel bundles this automatically because it's a static import in the same dir.
//
// ⚠️  When you change the schedule, edit BOTH this file AND schedule.config.js
//     (root). schedule.config.js is loaded by prep.html as a browser script tag.

export default {
  formEnabled: true,           // set false to kill the order form site-wide

  timezone: 'America/Los_Angeles',

  // Days pickup is available (0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat)
  openDays: [0, 2, 4, 5, 6],  // Sun, Tue, Thu, Fri, Sat

  // One-off full closures — add YYYY-MM-DD strings (LA date) here
  closureDates: [],

  // How far ahead customers can book (in days)
  maxDaysAhead: 6,

  // Night-before cutoff: orders for tomorrow disappear after this LA time
  orderCutoffHour: 20,         // 8:00 PM
  orderCutoffMinute: 0,

  pickup: {
    startHour: 12,             // 12:00 PM
    endHour: 15,               // up to (not including) 3:00 PM
    slotMinutes: 5,
    dailyCap: 36,              // (3h × 60min) / 5min = 36 slots max
  },

  delivery: {
    enabled: true,
    deliveryDays: [2, 4, 5],   // Tue, Thu, Fri
    startHour: 17,             // 5:00 PM
    endHour: 19,               // 7:00 PM
    cutoffHour: null,          // null = use same orderCutoffHour above
    cutoffMinute: null,
    minimum: 25,               // $25 subtotal minimum for delivery
    fee: 5,                    // $5 delivery fee
    freeThreshold: null,       // no free threshold — fee always applies
    dailyCap: 20,
    deliveryTimeSlots: [
      { id: '17-18', label: '5–6 PM' },
      { id: '18-19', label: '6–7 PM' },
    ],
    zones: [
      { id: 'ucsc',      name: 'UCSC',             minimum: 25 },
      { id: 'offcampus', name: 'Santa Cruz County', minimum: 30 },
    ],
  },
};
