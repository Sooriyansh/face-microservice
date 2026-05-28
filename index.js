require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');

const attendanceRoutes = require('./routes/attendance');
const studentRoutes = require('./routes/students');
const systemEventRoutes = require('./routes/systemEvents');
const workSessionRoutes = require('./routes/workSessions');
const Attendance = require('./models/Attendance');
const Student = require('./models/Student');
const SystemEvent = require('./models/SystemEvent');
const WorkSession = require('./models/WorkSession');
const User = require('./models/User');
const { deleteImages, uploadImageBuffer } = require('./services/cloudinary');
const { tryRebuildFaceModelFromCloud } = require('./services/faceModel');
const { getWorkerProcess, runRecognition } = require('./services/faceRecognition');
const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_SECRET = process.env.AUTH_SECRET || 'change-this-auth-secret-in-env';
const AUTH_COOKIE = 'faceai_auth';
const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://mahakalkheti:oI7inIFpRPh1pNrz@cluster0.m0ab8.mongodb.net/faceAttendance?retryWrites=true&w=majority';

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((error) => console.error('MongoDB connection error:', error.message));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const parseCookies = (cookieHeader = '') =>
  cookieHeader.split(';').reduce((cookies, cookie) => {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (!rawName) return cookies;
    cookies[rawName] = decodeURIComponent(rawValue.join('=') || '');
    return cookies;
  }, {});

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return { hash, salt };
};

const verifyPassword = (password, user) => {
  const { hash } = hashPassword(password, user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
};

const signJwt = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
};

const verifyJwt = (token) => {
  if (!token || token.split('.').length !== 3) return null;
  const [header, body, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest('base64url');
  if (signature.length !== expectedSignature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.expiresAt && Date.now() > payload.expiresAt) return null;
  return payload;
};

const setAuthCookie = (res, user) => {
  const token = signJwt({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`);
};

async function saveBiometricEnrollment(faceLabel, images, savedImages = []) {
  const safeFaceLabel = String(faceLabel || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const batchId = Date.now();

  for (const [index, image] of images.entries()) {
    const [, encoded] = String(image).split(',');
    if (!encoded) {
      throw new Error(`Invalid biometric image payload at index ${index}`);
    }

    const fileName = `${String(index).padStart(3, '0')}.jpg`;
    const imageBuffer = Buffer.from(encoded, 'base64');

    const uploadResult = await uploadImageBuffer(imageBuffer, {
      folder: `faceAttendance/dataset/${safeFaceLabel}`,
      publicId: `${batchId}_${String(index).padStart(3, '0')}`,
    });

    savedImages.push({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileName,
    });
  }

  return savedImages;
}

const clearAuthCookie = (res) => {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
};

const requireAuth = (req, res, next) => {
  if (req.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Please login first.' });
  }
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return requireAuth(req, res, next);
  if (roles.includes(req.user.role)) return next();
  return res.status(403).render('error', {
    message: 'You do not have permission to open this page.',
  });
};

app.use(async (req, res, next) => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const payload = verifyJwt(cookies[AUTH_COOKIE]);
    req.user = payload ? await User.findById(payload.id).lean() : null;
    res.locals.currentUser = req.user;
    next();
  } catch (error) {
    clearAuthCookie(res);
    next();
  }
});

app.use((req, res, next) => {
  res.locals.studentCount = 0;
  res.locals.todayAttendanceCount = 0;
  res.locals.recentAttendance = [];
  res.locals.students = [];
  res.locals.records = [];
  next();
});

app.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect(req.user.role === 'admin' ? '/' : '/employee');
  }
  res.render('login', {
    error: req.query.error || '',
    nextUrl: req.query.next || '',
  });
});

app.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email });

    if (user && user.role === 'employee') {
      return res.status(403).render('login', {
        error: 'Employee login is allowed through face recognition only.',
        nextUrl: req.body.next || '',
      });
    }

    if (!user || !verifyPassword(password, user)) {
      return res.status(401).render('login', {
        error: 'Email or password is incorrect.',
        nextUrl: req.body.next || '',
      });
    }

    setAuthCookie(res, user);
    const fallbackUrl = user.role === 'admin' ? '/' : '/employee';
    res.redirect(req.body.next || fallbackUrl);
  } catch (error) {
    next(error);
  }
});

app.get('/signup', (req, res) => {
  if (req.user) {
    return res.redirect(req.user.role === 'admin' ? '/' : '/employee');
  }
  res.render('signup', { error: '' });
});

app.get('/forgot-password', (req, res) => {
  res.render('forgot-password');
});

app.post('/signup', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    const role = req.body.role === 'admin' ? 'admin' : 'employee';
    const employeeId = String(req.body.employeeId || '').trim();
    const department = String(req.body.department || '').trim();
    const phoneNumber = String(req.body.phoneNumber || '').trim();
    const enrollmentImages = Array.isArray(req.body.enrollmentImages) ? req.body.enrollmentImages : [];

    if (!name || !email || password.length < 6 || password !== confirmPassword) {
      return res.status(400).render('signup', {
        error: 'Name, valid email, matching passwords, and a minimum 6-character password are required.',
      });
    }

    if (role === 'employee' && (!employeeId || !department || !phoneNumber || enrollmentImages.length < 6)) {
      return res.status(400).json({
        success: false,
        message: 'Employee signup requires employee ID, department, phone number, and at least 6 face scans.',
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (req.is('application/json')) {
        return res.status(409).json({ success: false, message: 'An account already exists with this email.' });
      }
      return res.status(409).render('signup', { error: 'An account already exists with this email.' });
    }

    const { hash, salt } = hashPassword(password);
    let employeeProfile = null;

    if (role === 'employee') {
      const faceLabel = `${employeeId}_${email.split('@')[0]}`.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const existingStudent = await Student.findOne({ $or: [{ faceLabel }, { email }, { rollNumber: employeeId }] }).lean();
      if (existingStudent) {
        return res.status(409).json({ success: false, message: 'Employee profile already exists for this email or employee ID.' });
      }

      let savedImages = [];
      try {
        savedImages = await saveBiometricEnrollment(faceLabel, enrollmentImages);
        employeeProfile = await Student.create({
          name,
          faceLabel,
          rollNumber: employeeId,
          joiningDate: new Date(),
          department,
          email,
          phoneNumber,
          faceLoginEnabled: true,
          biometricEncryptionStatus: 'Encrypted',
          livenessStatus: 'Passed',
          enrollmentImages: savedImages,
          enrollmentStatus: 'Verified',
          enrollmentReviewedAt: new Date(),
          enrollmentReviewNote: 'Auto verified during secure signup biometric enrollment.',
        });
        const modelBuild = await tryRebuildFaceModelFromCloud();
        if (!modelBuild.success) {
          employeeProfile.enrollmentReviewNote = `Biometric images stored in Cloudinary. Model rebuild warning: ${modelBuild.message}`;
          await employeeProfile.save();
        }
      } catch (error) {
        if (employeeProfile) {
          await Student.findByIdAndDelete(employeeProfile._id);
        }
        await deleteImages(savedImages.map((image) => image.publicId));
        return res.status(500).json({
          success: false,
          message: 'Biometric enrollment failed. Camera scans could not be stored or AI model could not be trained.',
          details: error.message,
        });
      }
    }

    const user = await User.create({
      name,
      email,
      role,
      employeeProfile: employeeProfile ? employeeProfile._id : null,
      employeeId,
      department,
      phoneNumber,
      faceLoginEnabled: role === 'employee',
      accountStatus: role === 'employee' ? 'active' : 'active',
      passwordHash: hash,
      passwordSalt: salt,
    });

    setAuthCookie(res, user);
    if (req.is('application/json')) {
      return res.status(201).json({
        success: true,
        redirectTo: role === 'admin' ? '/' : '/employee',
        user: { name: user.name, email: user.email, role: user.role },
        modelWarning: employeeProfile?.enrollmentReviewNote || '',
      });
    }
    res.redirect(role === 'admin' ? '/' : '/employee');
  } catch (error) {
    next(error);
  }
});

app.post('/employee-face-login', async (req, res, next) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, message: 'Face image is required.' });
    }

    const [, encoded] = image.split(',');
    if (!encoded) {
      return res.status(400).json({ success: false, message: 'Invalid face image payload.' });
    }

    let recognition;
    try {
      recognition = await runRecognition(Buffer.from(encoded, 'base64'));
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Face recognition service unavailable. Train the biometric model first.',
        details: error.message,
      });
    }

    if (!recognition.success || !recognition.matched) {
      return res.json({
        success: true,
        recognized: false,
        message: recognition.message || 'Face detected, but identity confidence is low.',
        confidence: recognition.confidence || 0,
        box: recognition.box || null,
        quality: recognition.quality || null,
        quality_issues: recognition.quality_issues || [],
        stage: recognition.stage || 'not_matched',
      });
    }

    const employee = await Student.findOne({ faceLabel: recognition.label }).lean();
    const user = employee
      ? await User.findOne({
          role: 'employee',
          $or: [{ employeeProfile: employee._id }, { email: employee.email }],
          faceLoginEnabled: true,
          accountStatus: 'active',
        })
      : null;

    if (!user) {
      return res.status(401).json({
        success: false,
        recognized: false,
        message: 'Face recognized, but no active employee account is linked.',
        confidence: recognition.confidence || 0,
      });
    }

    setAuthCookie(res, user);
    res.json({
      success: true,
      recognized: true,
      redirectTo: '/employee',
      confidence: recognition.confidence || 0,
      employee: {
        name: employee.name,
        faceLabel: employee.faceLabel,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.redirect('/login');
});

app.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);

    const [studentCount, todayAttendanceCount, recentAttendance, students, liveSessions] = await Promise.all([
      Student.countDocuments(),
      Attendance.countDocuments({ dateKey: todayKey }),
      Attendance.find()
        .sort({ markedAt: -1 })
        .limit(8)
        .populate('student')
        .lean(),
      Student.find().sort({ createdAt: -1 }).lean(),
      WorkSession.find({ dateKey: todayKey }).populate('employee').populate('attendance').lean(),
    ]);
    const systemEventCount = await SystemEvent.countDocuments();

    res.render('index', {
      studentCount,
      todayAttendanceCount,
      recentAttendance,
      safeRecentAttendance: Array.isArray(recentAttendance) ? recentAttendance : [],
      students,
      systemEventCount,
      liveSessions,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/attendance', requireRole('admin'), async (req, res, next) => {
  try {
    const records = await Attendance.find()
      .sort({ markedAt: -1 })
      .limit(20)
      .populate('student')
      .lean();

    res.render('attendance', { records });
  } catch (error) {
    next(error);
  }
});

app.get('/employee', requireRole('admin', 'employee'), async (req, res, next) => {
  try {
    const employeeQuery = req.user.role === 'employee' ? { email: req.user.email } : {};
    const employee = await Student.findOne(employeeQuery).sort({ createdAt: -1 }).lean();
    const attendanceQuery = employee ? { student: employee._id } : {};
    const employeeFirstName = employee ? String(employee.name || '').split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const eventUserPattern = employeeFirstName ? new RegExp(employeeFirstName, 'i') : /.^/;

    const [records, personalEvents, workSession] = await Promise.all([
      Attendance.find(attendanceQuery)
        .sort({ markedAt: -1 })
        .limit(20)
        .populate('student')
        .lean(),
      SystemEvent.find(employee ? { user: eventUserPattern } : {})
        .sort({ occurredAt: -1 })
        .limit(20)
        .lean(),
      employee
        ? WorkSession.findOne({ employee: employee._id, dateKey: new Date().toISOString().slice(0, 10) })
            .populate('employee')
            .populate('attendance')
            .lean()
        : null,
    ]);

    res.render('employee', {
      employee,
      records,
      personalEvents,
      workSession,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/system-events', requireRole('admin'), async (req, res, next) => {
  try {
    const now = new Date();
    const workdayStart = new Date(now);
    workdayStart.setHours(8, 0, 0, 0);

    const workdayEnd = new Date(now);
    workdayEnd.setHours(17, 0, 0, 0);

    const rangeEnd = now < workdayEnd ? now : workdayEnd;
    const [systemEvents, students, liveSessions] = await Promise.all([
      SystemEvent.find({
      occurredAt: {
        $gte: workdayStart,
        $lte: rangeEnd,
      },
    })
      .sort({ occurredAt: 1 })
      .limit(500)
      .lean(),
      Student.find().sort({ name: 1 }).lean(),
      WorkSession.find({ dateKey: now.toISOString().slice(0, 10) }).populate('employee').populate('attendance').lean(),
    ]);

    res.render('system-events', {
      systemEvents,
      students,
      systemEventRange: {
        start: workdayStart,
        end: rangeEnd,
        workdayEnd,
      },
      liveSessions,
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/students', requireAuth, studentRoutes);
app.use('/api/attendance', requireAuth, attendanceRoutes);
app.use('/api/system-events', requireAuth, systemEventRoutes);
app.use('/api/work-sessions', requireAuth, workSessionRoutes);
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.originalUrl}`,
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }

  res.status(500).render('error', {
    message: error.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
  getWorkerProcess()
    .then(() => console.log('Face recognition worker warmed up'))
    .catch((error) => console.warn('Face recognition warmup skipped:', error.message));
});
