// order-schedule.js — LA timezone helpers and schedule-driven date/slot logic.
// Loaded as a plain <script> before React; all exports are plain globals.

var DAY_ABBR = ['sun','mon','tue','wed','thu','fri','sat'];
var DAY_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function getLANow() {
  var fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  var p = {};
  fmt.formatToParts(new Date()).forEach(function(x) { p[x.type] = x.value; });
  var hour = +p.hour;
  // Intl hour12:false returns '24' for midnight — normalise
  if (hour === 24) hour = 0;
  var y = +p.year, m = +p.month, d = +p.day;
  return {
    hour: hour,
    minute: +p.minute,
    dateKey: p.year + '-' + p.month + '-' + p.day,
    dow: new Date(y, m - 1, d).getDay(),
  };
}

function shiftDateKey(dateKey, n) {
  var parts = dateKey.split('-').map(Number);
  var dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + n);
  return {
    dateKey: dt.getFullYear() + '-' +
             String(dt.getMonth() + 1).padStart(2, '0') + '-' +
             String(dt.getDate()).padStart(2, '0'),
    dow: dt.getDay(),
  };
}

// Returns array of available booking dates from the schedule config.
function getAvailableDates(S) {
  var la = getLANow();
  var cutH = S.orderCutoffHour;
  var cutM = S.orderCutoffMinute || 0;
  var pastCutoff = la.hour > cutH || (la.hour === cutH && la.minute >= cutM);
  var results = [];
  for (var off = 1; off <= S.maxDaysAhead; off++) {
    var c = shiftDateKey(la.dateKey, off);
    if (!S.openDays.includes(c.dow)) continue;
    if (S.closureDates && S.closureDates.includes(c.dateKey)) continue;
    if (off === 1 && pastCutoff) continue;
    var parts = c.dateKey.split('-').map(Number);
    results.push({
      dateKey: c.dateKey,
      dow:     c.dow,
      day:     DAY_ABBR[c.dow],
      full:    DAY_FULL[c.dow],
      num:     parts[2],
      month:   parts[1],
      isDeliveryDay: !!(S.delivery && S.delivery.enabled && S.delivery.deliveryDays.includes(c.dow)),
    });
  }
  return results;
}

// Returns array of {label, key} pickup time slots from the schedule config.
function getPickupSlots(S) {
  var startHour  = S.pickup.startHour;
  var endHour    = S.pickup.endHour;
  var slotMins   = S.pickup.slotMinutes;
  var totalMins  = (endHour - startHour) * 60;
  function fmt(h, m) {
    return (h > 12 ? h - 12 : h) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  var out = [];
  for (var min = 0; min < totalMins; min += slotMins) {
    var h  = startHour + Math.floor(min / 60),          m  = min % 60;
    var eh = startHour + Math.floor((min + slotMins) / 60), em = (min + slotMins) % 60;
    out.push({ label: fmt(h, m) + ' – ' + fmt(eh, em), key: String(h).padStart(2,'0') + String(m).padStart(2,'0') });
  }
  return out;
}

// Returns number of hour-columns for the pickup slot grid.
function getPickupHourCount(S) {
  return S.pickup.endHour - S.pickup.startHour;
}
