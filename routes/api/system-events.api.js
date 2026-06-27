const express = require('express');

const SystemEvent = require('../../models/SystemEvent');
const Student = require('../../models/Student');
const { rowsToCsv } = require('../../services/hrms');
const { recordTrackingEvent } = require('../../services/workSessions');

const router = express.Router();

function sendSystemEventsExport(res, type, rows) {
  const headers = [
    { label: 'Employee ID', value: (row) => row.employeeId || '-' },
    { label: 'Employee', value: (row) => row.employeeName || row.user || 'Unknown' },
    { label: 'Event', value: (row) => row.event },
    { label: 'Occurred At', value: (row) => new Date(row.occurredAt).toLocaleString() },
    { label: 'Meaning', value: (row) => row.meaning || row.message || '-' },
    { label: 'Source', value: (row) => row.sourceLog || row.provider || '-' },
    { label: 'Computer', value: (row) => row.computer || '-' },
    { label: 'Status', value: (row) => row.status || 'Recorded' },
    { label: 'Duration Ms', value: (row) => row.durationMs || 0 },
  ];

  if (type === 'pdf') {
    res.type('html');
    return res.send(`<!doctype html><html><head><title>System Event Logs</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}th{background:#eef}</style></head><body><h1>System Event Logs</h1><table><thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${h.value(row)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.print()</script></body></html>`);
  }

  const extension = type === 'excel' ? 'xls' : 'csv';
  res.setHeader('Content-Disposition', `attachment; filename="system-event-logs.${extension}"`);
  res.type(type === 'excel' ? 'application/vnd.ms-excel' : 'text/csv');
  return res.send(rowsToCsv(rows, headers));
}

const ALLOWED_EVENTS = new Set([
  'Startup',
  'Shutdown',
  'Unexpected Shutdown',
  'Restart',
  'Sleep',
  'Wakeup',
  'Lock',
  'Unlock',
  'Login',
  'Logout',
  'Idle Time',
  'Idle State',
  'Active Usage',
  'Active State',
  'App Opened',
  'App Closed',
  'Website Visited',
  'Active Window',
  'Keyboard Activity',
  'Mouse Activity',
  'Inactive Duration',
  'Display On',
  'Display Off',
  'User Session Start',
  'User Session End',
  'Session Connect',
  'Session Disconnect',
]);

const WORKDAY_START_HOUR = 8;
const WORKDAY_END_HOUR = 17;

function getWorkdayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(WORKDAY_START_HOUR, 0, 0, 0);

  const end = new Date(now);
  end.setHours(WORKDAY_END_HOUR, 0, 0, 0);

  return {
    start,
    end: now < end ? now : end,
    fixedEnd: end,
  };
}

function parseDateQuery(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSystemEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return null;
  }

  const event = String(rawEvent.event || '').trim();
  const occurredAt = new Date(rawEvent.occurredAt);
  const eventId = Number(rawEvent.eventId);
  const sourceLog = String(rawEvent.sourceLog || '').trim();
  const externalId = String(rawEvent.externalId || '').trim();

  if (
    !ALLOWED_EVENTS.has(event) ||
    Number.isNaN(occurredAt.getTime()) ||
    !Number.isFinite(eventId) ||
    !sourceLog ||
    !externalId
  ) {
    return null;
  }

  return {
    event,
    meaning: String(rawEvent.meaning || '').trim(),
    occurredAt,
    eventId,
    sourceLog,
    provider: String(rawEvent.provider || '').trim(),
    recordNumber: Number.isFinite(Number(rawEvent.recordNumber)) ? Number(rawEvent.recordNumber) : null,
    computer: String(rawEvent.computer || '').trim(),
    employee: String(rawEvent.employee || rawEvent.employeeObjectId || '').match(/^[a-f\d]{24}$/i)
      ? String(rawEvent.employee || rawEvent.employeeObjectId)
      : null,
    employeeId: String(rawEvent.employeeId || rawEvent.employeeCode || '').trim(),
    employeeName: String(rawEvent.employeeName || '').trim(),
    user: String(rawEvent.user || '').trim(),
    durationMs: Math.max(Number(rawEvent.durationMs || rawEvent.duration || 0), 0),
    status: String(rawEvent.status || 'Recorded').trim(),
    metadata: rawEvent.metadata && typeof rawEvent.metadata === 'object' ? rawEvent.metadata : {},
    message: String(rawEvent.message || '').trim().slice(0, 2000),
    externalId,
  };
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactOrQuery(clauses) {
  return clauses.filter((clause) => {
    const value = Object.values(clause)[0];
    return value !== '' && value != null;
  });
}

async function resolveEmployeeForEvent(event) {
  const employeeObjectId = String(event.employee || '').trim();
  if (employeeObjectId.match(/^[a-f\d]{24}$/i)) {
    const employee = await Student.findById(employeeObjectId).lean();
    if (employee) return employee;
  }

  const candidates = [
    event.employeeId,
    event.metadata?.employeeId,
    event.metadata?.employeeCode,
    event.employeeName,
    event.metadata?.employeeName,
    event.user,
  ].map((value) => String(value || '').trim()).filter(Boolean);

  for (const candidate of candidates) {
    const userPart = candidate.includes('\\') ? candidate.split('\\').pop() : candidate;
    const emailCandidate = userPart.includes('@') ? userPart.toLowerCase() : '';
    const exact = await Student.findOne({
      $or: [
        { rollNumber: candidate },
        { rollNumber: userPart },
        ...(emailCandidate ? [{ email: emailCandidate }] : []),
        { name: new RegExp(`^${escapeRegex(candidate)}$`, 'i') },
      ],
    }).lean();
    if (exact) return exact;

    const fuzzyName = userPart.replace(/[._-]+/g, ' ').trim();
    if (fuzzyName) {
      const fuzzy = await Student.findOne({ name: new RegExp(escapeRegex(fuzzyName), 'i') }).lean();
      if (fuzzy) return fuzzy;
    }
  }

  return null;
}

async function enrichEventsWithEmployees(events) {
  return Promise.all(events.map(async (event) => {
    const employee = await resolveEmployeeForEvent(event);
    if (!employee) return event;
    return {
      ...event,
      employee: employee._id,
      employeeId: event.employeeId || employee.rollNumber || '',
      employeeName: employee.name || event.employeeName || '',
      user: event.user || employee.name || '',
      metadata: {
        ...event.metadata,
        employeeId: String(employee._id),
        employeeName: employee.name,
        employeeCode: employee.rollNumber || '',
      },
    };
  }));
}

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const mode = String(req.query.mode || '').trim();
    const selectedUser = String(req.query.user || '').trim();
    const workdayRange = getWorkdayRange();
    const from = parseDateQuery(req.query.from) || (mode === 'workday' ? workdayRange.start : null);
    const to = parseDateQuery(req.query.to) || (mode === 'workday' ? workdayRange.end : null);
    const sortDirection = String(req.query.sort || '').toLowerCase() === 'asc' ? 1 : -1;

    const query = {};
    if (from || to) {
      query.occurredAt = {};
      if (from) {
        query.occurredAt.$gte = from;
      }
      if (to) {
        query.occurredAt.$lte = to;
      }
    }
    if (selectedUser) {
      query.$or = compactOrQuery([{ user: selectedUser }, { employeeName: selectedUser }, { employeeId: selectedUser }]);
    }

    if (req.user?.role === 'employee') {
      const employee = await Student.findOne({ email: req.user.email }).lean();
      query.$or = employee
        ? compactOrQuery([{ employee: employee._id }, { employeeId: employee.rollNumber || '' }, { employeeName: employee.name || '' }, { user: employee.name || '' }])
        : [{ user: /.^/ }];
    }

    const events = await SystemEvent.find(query)
      .sort({ occurredAt: sortDirection })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      events,
      range: {
        start: from,
        end: to,
        workdayEnd: mode === 'workday' ? workdayRange.fixedEnd : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/export/:type', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can export system event logs.' });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 1000);
    const from = parseDateQuery(req.query.from);
    const to = parseDateQuery(req.query.to);
    const query = {};
    if (from || to) {
      query.occurredAt = {};
      if (from) query.occurredAt.$gte = from;
      if (to) query.occurredAt.$lte = to;
    }
    if (req.query.user) {
      const selectedUser = String(req.query.user);
      query.$or = compactOrQuery([{ user: selectedUser }, { employeeName: selectedUser }, { employeeId: selectedUser }]);
    }
    const events = await SystemEvent.find(query).sort({ occurredAt: -1 }).limit(limit).lean();
    return sendSystemEventsExport(res, req.params.type, events);
  } catch (error) {
    next(error);
  }
});

// Get detailed activity for a specific user
router.get('/users/:userId/activity', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can inspect employee activity timelines.',
      });
    }

    const userId = String(req.params.userId || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
    const workdayRange = getWorkdayRange();
    const from = parseDateQuery(req.query.from) || workdayRange.start;
    const to = parseDateQuery(req.query.to) || workdayRange.end;

    const events = await SystemEvent.find({
      $or: compactOrQuery([{ user: userId }, { employeeName: userId }, { employeeId: userId }, { employee: userId.match(/^[a-f\d]{24}$/i) ? userId : null }]),
      occurredAt: {
        $gte: from,
        $lte: to,
      },
    })
      .sort({ occurredAt: -1 })
      .limit(limit)
      .lean();

    const stats = {
      totalEvents: events.length,
      uniqueEventTypes: new Set(events.map((e) => e.event)).size,
      eventBreakdown: {},
      accuracy: 100,
      user: userId,
    };

    events.forEach((event) => {
      if (!stats.eventBreakdown[event.event]) {
        stats.eventBreakdown[event.event] = 0;
      }
      stats.eventBreakdown[event.event] += 1;
    });

    res.json({
      success: true,
      user: userId,
      events,
      stats,
      range: { start: from, end: to },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/ingest', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin' && !req.trustedCollector) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or trusted collectors can ingest system events.',
      });
    }

    const payloadEvents = Array.isArray(req.body.events) ? req.body.events : [req.body];
    const events = await enrichEventsWithEmployees(payloadEvents.map(normalizeSystemEvent).filter(Boolean));

    if (events.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid system events were provided',
      });
    }

    const result = await SystemEvent.bulkWrite(
      events.map((event) => ({
        updateOne: {
          filter: { externalId: event.externalId },
          update: { $setOnInsert: event },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    await Promise.all(events.map((event) => recordTrackingEvent(event)));

    res.status(201).json({
      success: true,
      received: events.length,
      inserted: result.upsertedCount || 0,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

