# Firebase Studio - MoTrack

This is a Next.js starter application for MoTrack, a comprehensive operations management tool.

---

## **Required Setup**

### 1. Add Firebase Service Account Key

For the application's server-side functions to connect to your Firebase project, you must provide a **Service Account Key**.

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and select your project.
2.  Click the gear icon next to **Project Overview**, then select **Project settings**.
3.  Go to the **Service accounts** tab.
4.  Click **Generate new private key**. A JSON file will be downloaded.
5.  Open the downloaded JSON file, copy the entire content, and paste it as the value for `FIREBASE_SERVICE_ACCOUNT_KEY` in your `.env` file.

**Example `/.env` file:**
```env
FIREBASE_SERVICE_ACCOUNT_KEY='{"type": "service_account", "project_id": "...", ...}'
```

**IMPORTANT**: The entire JSON key must be on a single line and enclosed in single quotes.
