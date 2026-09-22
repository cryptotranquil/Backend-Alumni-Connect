const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

function parseServiceAccount(value) {
  if (!value) return null;
  try {
    const decoded = value.trim().startsWith("{")
      ? value
      : Buffer.from(value, "base64").toString("utf8");
    const account = JSON.parse(decoded);
    // Environment files commonly preserve escaped newlines in private keys.
    if (account.private_key) {
      account.private_key = account.private_key.replace(/\\n/g, "\n");
    }
    return account;
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_JSON must be raw or base64 JSON: ${error.message}`,
    );
  }
}

function initialize() {
  if (admin.apps.length) return;

  // Firebase emulators do not require credentials. This also makes local
  // integration tests possible without a production service-account key.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "demo-alumni-connect",
    });
    return;
  }

  let serviceAccount = parseServiceAccount(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  );
  if (!serviceAccount) {
    const localPath = path.join(__dirname, "../../serviceAccountKey.json");
    if (fs.existsSync(localPath)) serviceAccount = require(localPath);
  }

  if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return;
  }

  // Supports Google Cloud/Cloud Run and local ADC via
  // GOOGLE_APPLICATION_CREDENTIALS without requiring a copied key file.
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_CLOUD_PROJECT
  ) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return;
  }

  throw new Error(
    "Firestore credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON, " +
      "GOOGLE_APPLICATION_CREDENTIALS, or FIRESTORE_EMULATOR_HOST.",
  );
}

initialize();
module.exports = admin.firestore();
