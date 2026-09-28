// All times are America/Los_Angeles
// Edit this file to change the schedule without touching any logic.
var INOA_SCHEDULE = {
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
    startHour: 16,             // 4:00 PM
    endHour: 18,               // 6:00 PM
    // Cutoff for delivery orders — null = use same orderCutoffHour above
    cutoffHour: null,
    cutoffMinute: null,
    minimum: 25,               // $25 subtotal minimum for delivery
    fee: 4,                    // $4 delivery fee
    freeThreshold: 40,         // fee waived when subtotal >= $40
    dailyCap: 20,
    zones: [
      { id: 'porter',    name: 'Colleges 9/10 & Porter',   dropStart: '16:15', dropEnd: '16:45', cap: null },
      { id: 'on-campus', name: 'Other on-campus colleges', dropStart: '16:45', dropEnd: '17:15', cap: null },
      { id: 'westside',  name: 'Westside off-campus',      dropStart: '17:15', dropEnd: '17:45', cap: null },
    ],
  },
};

// Node.js / CommonJS support (api/pay.js, api/schedule.js use createRequire)
if (typeof module !== 'undefined') module.exports = INOA_SCHEDULE;
