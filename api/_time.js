export function hoursBetween(a, b) {
  const start = new Date(a).getTime();
  const end = new Date(b || Date.now()).getTime();
  return Math.max(0, (end - start) / 3600000);
}

export function overlapHours(a, b, start, end) {
  const s = Math.max(new Date(a).getTime(), new Date(start).getTime());
  const e = Math.min(new Date(b || Date.now()).getTime(), new Date(end).getTime());
  return Math.max(0, (e - s) / 3600000);
}

export function clockOutRule(note, actualHours, minimum = 8, reviewStatus = null) {
  const reason = String(note || 'Ending shift');
  if (reviewStatus === 'approved_actual') return { paidHours: actualHours, needsReview: false, status: 'approved_actual' };
  if (reviewStatus === 'approved_full') return { paidHours: Math.max(actualHours, minimum), needsReview: false, status: 'approved_full' };
  if (['Project completed', 'Client request', 'Manager approval'].includes(reason)) {
    return { paidHours: Math.max(actualHours, minimum), needsReview: true, status: reviewStatus || 'pending' };
  }
  if (reason === 'Ending shift' && actualHours >= 7.75) {
    return { paidHours: Math.max(actualHours, minimum), needsReview: false, status: 'not_required' };
  }
  return { paidHours: actualHours, needsReview: false, status: 'not_required' };
}

export function normalizeDayStarts(raw, fallbackStart, fallbackEnd) {
  const parts = String(raw || '').split(',').filter(Boolean);
  const parsed = parts.map(x => new Date(x)).filter(d => !Number.isNaN(d.getTime()));
  if (parsed.length >= 2 && parsed.length <= 8) return parsed;
  return [new Date(fallbackStart), new Date(fallbackEnd)];
}

export function effectiveShiftPay(shift, minimum = 8) {
  const actual = hoursBetween(shift.clock_in, shift.clock_out);
  return clockOutRule(shift.clock_out_note, actual, minimum, shift.manager_review_status).paidHours;
}

export function allocatePaidHours(shift, dayStarts, minimum = 8) {
  const actual = hoursBetween(shift.clock_in, shift.clock_out);
  if (!actual) return Array(Math.max(0, dayStarts.length - 1)).fill(0);
  const spans = [];
  let totalSegment = 0;
  for (let i = 0; i < dayStarts.length - 1; i++) {
    const h = overlapHours(shift.clock_in, shift.clock_out, dayStarts[i], dayStarts[i + 1]);
    spans.push(h);
    totalSegment += h;
  }
  if (!totalSegment) return spans;
  const paidTotal = effectiveShiftPay(shift, minimum);
  const result = spans.slice();
  const extra = Math.max(0, paidTotal - totalSegment);
  const ci = new Date(shift.clock_in).getTime();
  let first = 0;
  for (let i = 0; i < dayStarts.length - 1; i++) {
    if (ci >= dayStarts[i].getTime() && ci < dayStarts[i + 1].getTime()) { first = i; break; }
  }
  result[first] += extra;
  return result;
}
