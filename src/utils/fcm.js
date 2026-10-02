const admin = require("firebase-admin");
const { getMessaging } = require("firebase-admin/messaging");
const User = require("../models/user.model");

// Initialize Firebase Admin
// Note: If you have serviceAccountKey.json, use cert(serviceAccount)
// Otherwise, it can initialize using default credentials or Firebase project ID.
try {
  const apps = admin.apps || (admin.getApps ? admin.getApps() : []);
  if (!apps.length) {
    let credential = null;
    const certFn = admin.credential?.cert || admin.cert;

    // 1. Try Environment Variable (Recommended for Vercel / Production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT && typeof certFn === "function") {
      try {
        let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        // Support Base64 encoded JSON
        if (!raw.startsWith("{")) {
          raw = Buffer.from(raw, "base64").toString("utf-8");
        }
        const serviceAccount = JSON.parse(raw);
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        credential = certFn(serviceAccount);
        console.log("[FCM] Loaded credentials from FIREBASE_SERVICE_ACCOUNT environment variable");
      } catch (envErr) {
        console.error("[FCM] Error parsing FIREBASE_SERVICE_ACCOUNT env var:", envErr.message);
      }
    }

    // 2. Try local file (for local development)
    if (!credential && typeof certFn === "function") {
      try {
        const serviceAccount = require("../config/serviceAccountKey.json");
        credential = certFn(serviceAccount);
        console.log("[FCM] Loaded credentials from serviceAccountKey.json");
      } catch (e) {
        // file not found
      }
    }

    // 3. Fallback
    if (!credential) {
      console.log("[FCM] No service account credentials found, using project ID fallback");
      try {
        const appDefaultFn = admin.credential?.applicationDefault || admin.applicationDefault;
        if (typeof appDefaultFn === "function") {
          credential = appDefaultFn();
        }
      } catch (credErr) {
        console.warn("[FCM] applicationDefault credential fallback notice:", credErr.message);
      }
    }

    const initOptions = {
      projectId: "fixxbuddy-10838"
    };
    if (credential) {
      initOptions.credential = credential;
    }

    admin.initializeApp(initOptions);
    console.log("[FCM] Firebase Admin initialized successfully for fixxbuddy-10838");
  }
} catch (error) {
  console.warn("[FCM] Firebase Admin init notice:", error.message);
}

/**
 * Send push notification to a specific device FCM token
 */
async function sendPushNotification(fcmToken, { title, body, data = {} }) {
  if (!fcmToken) return null;

  try {
    // FCM requires all data values to be strings
    const sanitizedData = Object.entries({
      ...data,
      click_action: "FLUTTER_NOTIFICATION_CLICK"
    }).reduce((acc, [key, val]) => {
      acc[key] = val != null ? String(val) : "";
      return acc;
    }, {});

    const payload = {
      token: fcmToken,
      notification: {
        title: title || "FixxBuddy Update",
        body: body || ""
      },
      data: sanitizedData,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          priority: "high",
          channelId: "fixxbuddy_alerts"
        }
      }
    };

    const messenger = admin.messaging ? admin.messaging() : getMessaging();
    const response = await messenger.send(payload);
    console.log("[FCM] Push notification sent successfully:", response);
    return response;
  } catch (error) {
    console.error("[FCM] Error sending push notification:", error.message);
    return null;
  }
}

/**
 * Send push notification to a user by their MongoDB _id
 */
async function sendPushToUser(userId, { title, body, data = {} }) {
  try {
    const user = await User.findById(userId).select("fcmToken");
    if (!user || !user.fcmToken) {
      console.log(`[FCM] User ${userId} has no registered FCM token`);
      return null;
    }

    return await sendPushNotification(user.fcmToken, { title, body, data });
  } catch (error) {
    console.error(`[FCM] Failed to send push to user ${userId}:`, error.message);
    return null;
  }
}

module.exports = {
  admin,
  sendPushNotification,
  sendPushToUser
};
