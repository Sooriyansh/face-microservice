require('dotenv').config();

const testingEnvDefaults = {
  MONGO_URI:
    'mongodb+srv://mahakalkheti:oI7inIFpRPh1pNrz@cluster0.m0ab8.mongodb.net/faceAttendance?retryWrites=true&w=majority',
  PORT: '5000',
  CLOUDINARY_CLOUD_NAME: 'dpb0mwete',
  CLOUDINARY_API_KEY: '155177776544667',
  CLOUDINARY_API_SECRET: 'sGKj5YrpnXD6V5rrYlvGkgFz_eM',
  FACE_CONFIDENCE_THRESHOLD: '0.78',
  FACE_CONFIDENCE_MARGIN: '0.02',
  PYTHON_EXECUTABLE: 'python',
  RECOGNITION_TIMEOUT_MS: '12000',
  SOCKET_CORS_ORIGIN: '',
  NOTIFICATION_TIMEZONE: 'Asia/Kolkata',
  FIREBASE_PROJECT_ID: 'hellon-3f3c2',
  FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-fbsvc@hellon-3f3c2.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY:
    '-----BEGIN PRIVATE KEY-----\nNEW_REGENERATED_PRIVATE_KEY\n-----END PRIVATE KEY-----\n',
  FIREBASE_WEB_API_KEY: '',
  FIREBASE_AUTH_DOMAIN: 'hellon-3f3c2.firebaseapp.com',
  FIREBASE_MESSAGING_SENDER_ID: '',
  FIREBASE_WEB_APP_ID: '',
  FIREBASE_WEB_VAPID_KEY: '',
  VAPID_PUBLIC_KEY:
    'BJ8m5YoLLH4JTqKWv6bME3zdSd7svbhjshgGtGdpT1YtvagUjol0InMj-nTUfuJ9N42v7OAmcvm06NZgo2GqNsM',
  VAPID_PRIVATE_KEY: 'J3qigqPH25tgGQWNBXF_s1vJP7dKY-H5Kb2SUJ8O4vM',
  VAPID_SUBJECT: 'mailto:admin@example.com',
};

function applyTestingEnvDefaults() {
  Object.entries(testingEnvDefaults).forEach(([key, value]) => {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

module.exports = {
  applyTestingEnvDefaults,
  testingEnvDefaults,
};
