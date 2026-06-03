const STANDARD_SHIFT_MS = 8 * 60 * 60 * 1000;

function toDateKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function calculateLeaveDays(startDate, endDate, leaveType) {
  if (leaveType === 'Half Day Leave') {
    return 0.5;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(days, 1);
}

function calculateSessionMetrics(session, checkoutAt = new Date()) {
  const startedAt = session.startedAt || session.attendanceTime;
  const totalWorkingMs = startedAt ? Math.max(new Date(checkoutAt).getTime() - new Date(startedAt).getTime(), 0) : 0;
  const overtimeMs = Math.max(totalWorkingMs - STANDARD_SHIFT_MS, 0);
  const day = new Date(session.dateKey || checkoutAt).getDay();
  const weekendMs = day === 0 || day === 6 ? totalWorkingMs : 0;

  return {
    totalWorkingMs,
    activeMs: Number(session.activeMs || 0),
    idleMs: Number(session.idleMs || 0),
    overtimeMs,
    weekendMs,
    holidayMs: 0,
    standardShiftMs: STANDARD_SHIFT_MS,
  };
}

function formatDuration(ms) {
  const totalMinutes = Math.max(Math.round(Number(ms || 0) / 60000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function escapeCsv(value) {
  const text = String(value == null ? '' : value);
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows, headers) {
  return [
    headers.map((header) => escapeCsv(header.label)).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(header.value(row))).join(',')),
  ].join('\n');
}

module.exports = {
  STANDARD_SHIFT_MS,
  calculateLeaveDays,
  calculateSessionMetrics,
  escapeCsv,
  formatDuration,
  rowsToCsv,
  toDateKey,
};
