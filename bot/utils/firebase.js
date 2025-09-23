const admin = require("firebase-admin");
require('dotenv').config({ path: __dirname + '/../../.env' })


if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf-8")
    
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is missing");
}

const db = admin.firestore();
module.exports = db;