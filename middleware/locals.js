require('../config/testingEnv').applyTestingEnvDefaults();

function defaultViewLocals(req, res, next) {
  res.locals.studentCount = 0;
  res.locals.todayAttendanceCount = 0;
  res.locals.recentAttendance = [];
  res.locals.students = [];
  res.locals.records = [];
  res.locals.firebaseConfig = {
    apiKey: process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_WEB_APP_ID || '',
    vapidKey: process.env.FIREBASE_WEB_VAPID_KEY || process.env.VAPID_PUBLIC_KEY || '',
  };
  next();
}

module.exports = { defaultViewLocals };
