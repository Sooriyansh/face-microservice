const WorkSession = require('../models/WorkSession');

const TRACKING_START_HOUR = 8;
const CHECKED_OUT_STATUSES = new Set(['checked_out']);

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getTrackingStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(TRACKING_START_HOUR, 0, 0, 0);
  return start;
}

function formatDeviceInfo(event = {}) {
  return [event.computer, event.provider, event.sourceLog].filter(Boolean).join(' / ');
}

function mapEventCategory(type) {
  if (['Attendance Started', 'Face Attendance Marked', 'Late Login', 'Early Logout', 'Check-Out Completed'].includes(type)) {
    return 'attendance';
  }

  if (
    [
      'App Opened',
      'App Closed',
      'Website Visited',
      'Active Window',
      'Keyboard Activity',
      'Mouse Activity',
      'Active Usage',
      'Active State',
      'Idle Time',
      'Idle State',
      'Inactive Duration',
    ].includes(type)
  ) {
    return 'productivity';
  }

  if (['Session Started', 'Session Incomplete', 'Session Closed'].includes(type)) {
    return 'session';
  }

  return 'system';
}

function normalizeEventType(type) {
  const eventMap = {
    Startup: 'Laptop Startup',
    Shutdown: 'Shutdown',
    'Unexpected Shutdown': 'Abrupt Shutdown',
    Restart: 'Restart',
    Sleep: 'Sleep Mode',
    Wakeup: 'Wakeup',
    Lock: 'Screen Lock',
    Unlock: 'Screen Unlock',
    Login: 'Login',
    Logout: 'Logout',
  };

  return eventMap[type] || type || 'Activity';
}

function calculateProductivityScore(session) {
  if (session.monitoringPermission === 'denied') {
    return 0;
  }

  const events = session.events || [];
  const productiveEvents = events.filter((event) => event.category === 'productivity' || event.category === 'system').length;
  const idleEvents = events.filter((event) => ['Idle Time', 'Inactive Duration', 'Sleep Mode', 'Screen Lock'].includes(event.type)).length;
  const score = Math.round(Math.min(100, Math.max(0, 72 + productiveEvents * 2 - idleEvents * 5)));
  return Number.isFinite(score) ? score : 0;
}

function deriveSessionStatus(session, now = new Date()) {
  if (!session) {
    return 'offline';
  }

  if (session.status === 'checked_out' || session.status === 'incomplete') {
    return session.status;
  }

  const lastActivityAt = session.lastActivityAt ? new Date(session.lastActivityAt) : null;
  if (!lastActivityAt) {
    return 'active';
  }

  const idleMinutes = (now.getTime() - lastActivityAt.getTime()) / 60000;
  if (idleMinutes >= 15) {
    return 'idle';
  }

  if (session.deviceState === 'Sleep Mode') {
    return 'sleep';
  }

  return session.status === 'break' ? 'break' : 'active';
}

async function startSessionAfterAttendance({ employee, attendance, attendanceTime = new Date() }) {
  const dateKey = getDateKey(attendanceTime);
  const trackingStart = getTrackingStart(attendanceTime);
  const startedAt = attendanceTime > trackingStart ? attendanceTime : trackingStart;
  const isLate = attendanceTime > trackingStart;

  const existing = await WorkSession.findOne({ employee: employee._id, dateKey });
  if (existing) {
    if (CHECKED_OUT_STATUSES.has(existing.status)) {
      return existing;
    }

    existing.attendance = attendance?._id || existing.attendance;
    existing.attendanceTime = attendanceTime;
    existing.startedAt = existing.startedAt || startedAt;
    existing.status = deriveSessionStatus(existing);
    existing.deviceState = existing.deviceState || 'Monitoring Active';
    existing.lastActivityAt = existing.lastActivityAt || attendanceTime;
    existing.events.push({
      type: 'Face Attendance Marked',
      category: 'attendance',
      message: 'Attendance verified by face recognition. Monitoring session remains active.',
      occurredAt: attendanceTime,
      deviceInfo: 'Face Recognition',
      metadata: { duplicate: true },
    });
    await existing.save();
    return existing;
  }

  const events = [
    {
      type: 'Attendance Started',
      category: 'attendance',
      message: 'Face attendance marked. Real-time activity monitoring is active.',
      occurredAt: attendanceTime,
      deviceInfo: 'Face Recognition',
    },
    {
      type: 'Session Started',
      category: 'session',
      message: `Tracking window opened at ${trackingStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      occurredAt: startedAt,
      deviceInfo: 'Smart Work Session',
    },
  ];

  if (isLate) {
    events.push({
      type: 'Late Login',
      category: 'attendance',
      message: 'Attendance was marked after the 08:00 AM tracking window.',
      occurredAt: attendanceTime,
      deviceInfo: 'Attendance Policy',
    });
  }

  return WorkSession.create({
    employee: employee._id,
    attendance: attendance?._id || null,
    dateKey,
    status: 'active',
    deviceState: 'Monitoring Active',
    monitoringPermission: 'pending',
    attendanceTime,
    startedAt,
    lastActivityAt: attendanceTime,
    productivityScore: 78,
    events,
  });
}

async function recordTrackingEvent(rawEvent) {
  const occurredAt = rawEvent.occurredAt ? new Date(rawEvent.occurredAt) : new Date();
  const dateKey = getDateKey(occurredAt);
  const type = normalizeEventType(rawEvent.event || rawEvent.type);
  const userPattern = rawEvent.user ? new RegExp(String(rawEvent.user).split(/[\\/@]/).pop(), 'i') : null;
  const query = {
    dateKey,
    status: { $nin: ['checked_out'] },
  };

  if (rawEvent.employee) {
    query.employee = rawEvent.employee;
  }

  let session = await WorkSession.findOne(query).populate('employee');
  if ((!session || !session.employee) && userPattern) {
    const candidates = await WorkSession.find(query).populate('employee');
    session = candidates.find((candidate) => candidate.employee && userPattern.test(candidate.employee.name || '')) || null;
  }

  if (!session || !session.employee) {
    return null;
  }

  if (session.checkoutAt) {
    return null;
  }

  if (session.monitoringPermission === 'denied') {
    return null;
  }

  const isAbruptShutdown = ['Shutdown', 'Unexpected Shutdown', 'Abrupt Shutdown'].includes(rawEvent.event || type);
  session.events.push({
    type,
    category: mapEventCategory(type),
    message: rawEvent.message || rawEvent.meaning || `${type} captured by the event collector.`,
    occurredAt,
    deviceInfo: rawEvent.deviceInfo || formatDeviceInfo(rawEvent),
    metadata: rawEvent.metadata || {
      eventId: rawEvent.eventId,
      sourceLog: rawEvent.sourceLog,
      externalId: rawEvent.externalId,
    },
  });
  session.lastActivityAt = occurredAt;
  session.deviceState = ['Sleep Mode', 'Screen Lock'].includes(type) ? type : isAbruptShutdown ? 'Offline' : 'Online';
  session.status = isAbruptShutdown
    ? 'incomplete'
    : ['Idle Time', 'Idle State'].includes(type)
      ? 'idle'
      : type === 'Sleep Mode'
        ? 'sleep'
        : 'active';
  session.incompleteReason = isAbruptShutdown ? 'Laptop shut down before checkout.' : session.incompleteReason;
  session.productivityScore = calculateProductivityScore(session);

  if (type === 'Idle Time') {
    session.idleMs += Number(rawEvent.durationMs || rawEvent.metadata?.durationMs || 0);
  }

  if (type === 'Active Usage') {
    session.activeMs += Number(rawEvent.durationMs || rawEvent.metadata?.durationMs || 0);
  }

  if (type === 'Idle State') {
    session.idleMs += Number(rawEvent.durationMs || rawEvent.metadata?.durationMs || 0);
  }

  if (type === 'Active State') {
    session.activeMs += Number(rawEvent.durationMs || rawEvent.metadata?.durationMs || 0);
  }

  if (type === 'Sleep Mode') {
    session.sleepMs += Number(rawEvent.durationMs || rawEvent.metadata?.durationMs || 0);
  }

  await session.save();
  return session;
}

async function setMonitoringPermission(sessionId, permission) {
  const normalized = permission === 'allowed' ? 'allowed' : 'denied';
  const session = await WorkSession.findById(sessionId);
  if (!session) {
    const error = new Error('Work session was not found.');
    error.status = 404;
    throw error;
  }

  session.monitoringPermission = normalized;
  session.deviceState = normalized === 'allowed' ? 'Monitoring Active' : 'Monitoring Permission Denied';
  session.events.push({
    type: normalized === 'allowed' ? 'Monitoring Permission Allowed' : 'Monitoring Permission Denied',
    category: 'session',
    message:
      normalized === 'allowed'
        ? 'Employee allowed device activity monitoring during work sessions.'
        : 'Employee denied device activity monitoring. Attendance remains available.',
    occurredAt: new Date(),
    deviceInfo: 'Employee Dashboard',
  });
  await session.save();
  return session;
}

async function checkoutSession(sessionId, note) {
  const cleanNote = String(note || '').trim();
  if (!cleanNote) {
    const error = new Error('Please enter what work you completed today.');
    error.status = 400;
    throw error;
  }

  const session = await WorkSession.findById(sessionId);
  if (!session) {
    const error = new Error('Work session was not found.');
    error.status = 404;
    throw error;
  }

  if (session.status === 'checked_out') {
    return session;
  }

  const now = new Date();
  session.status = 'checked_out';
  session.deviceState = 'Checked Out';
  session.checkoutAt = now;
  session.checkoutNote = cleanNote;
  session.productivityScore = calculateProductivityScore(session);
  session.events.push({
    type: 'Check-Out Completed',
    category: 'attendance',
    message: cleanNote,
    occurredAt: now,
    deviceInfo: 'Employee Dashboard',
  });
  session.events.push({
    type: 'Session Closed',
    category: 'session',
    message: 'Monitoring stopped for the remaining day.',
    occurredAt: now,
    deviceInfo: 'Smart Work Session',
  });

  await session.save();
  return session;
}

module.exports = {
  calculateProductivityScore,
  checkoutSession,
  deriveSessionStatus,
  getDateKey,
  recordTrackingEvent,
  setMonitoringPermission,
  startSessionAfterAttendance,
};
