const express = require('express');

const SystemEvent = require('../models/SystemEvent');
const Student = require('../models/Student');
const { recordTrackingEvent } = require('../services/workSessions');

const router = express.Router();

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
    user: String(rawEvent.user || '').trim(),
    message: String(rawEvent.message || '').trim().slice(0, 2000),
    externalId,
  };
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
      query.user = selectedUser;
    }

    if (req.user?.role === 'employee') {
      const employee = await Student.findOne({ email: req.user.email }).lean();
      const firstName = employee ? String(employee.name || '').split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      query.user = firstName ? new RegExp(firstName, 'i') : /.^/;
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
      user: userId,
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
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin or trusted collectors can ingest system events.',
      });
    }

    const payloadEvents = Array.isArray(req.body.events) ? req.body.events : [req.body];
    const events = payloadEvents.map(normalizeSystemEvent).filter(Boolean);

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
