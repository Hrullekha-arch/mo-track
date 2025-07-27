# Firebase Studio - MoTrack

This is a Next.js starter application for MoTrack, a comprehensive operations management tool.

---

## **Required Setup**: Add Service Account Key for `mo-panel`

For the application's server-side functions to connect to your Firebase project (like checking the database connection), you must provide it with a **Service Account Key** for the `mo-panel` project.

### 1. Get Your Service Account Key for `mo-panel`

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and select your **`mo-panel`** project.
2.  Click the gear icon next to **Project Overview** in the top-left, then select **Project settings**.
3.  Go to the **Service accounts** tab.
4.  Click the **Generate new private key** button. A JSON file will be downloaded.

### 2. Add Key to your `.env` File

1.  Open the downloaded JSON file in a text editor.
2.  Copy the **entire content** of the file.
3.  In your project, open the `.env` file.
4.  Paste the copied key as the value for `FIREBASE_SERVICE_ACCOUNT_KEY`.

**Example `/.env` file:**
```env
FIREBASE_SERVICE_ACCOUNT_KEY='{"type": "service_account", "project_id": "mo-panel", ...}'
```

**IMPORTANT**: The entire JSON key must be on a single line and enclosed in single quotes.

After adding the key, you will need to restart your development server for the change to take effect.
