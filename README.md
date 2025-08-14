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

### 2. Configure Google Drive for File Uploads

This application uploads files (like measurement images) to a specific Google Drive folder.

1.  **Enable the Google Drive API**:
    *   Go to the [Google Cloud Console API Library](https://console.cloud.google.com/apis/library/drive.googleapis.com).
    *   Make sure your project is selected.
    *   Click **Enable**.

2.  **Create a Google Drive Folder**:
    *   Go to [Google Drive](https://drive.google.com) and create a new folder where you want to store the app's uploads (e.g., "MoTrack Measurements").
    *   Select the folder, click the "Share" button.

3.  **Share the Folder with the Service Account**:
    *   In the downloaded service account JSON file from Step 1, find the `client_email` (e.g., `...iam.gserviceaccount.com`).
    *   In the Google Drive "Share" dialog, paste this email address.
    *   Give it **Editor** permissions.
    *   Click **Share**.

4.  **Add the Folder ID to `.env`**:
    *   Open the folder in Google Drive. The URL will look like `https://drive.google.com/drive/folders/SOME_LONG_ID`.
    *   Copy the `SOME_LONG_ID` part. This is your Folder ID.
    *   In your `.env` file, set `GOOGLE_DRIVE_FOLDER_ID` to this ID.

**Example `/.env` file:**
```env
FIREBASE_SERVICE_ACCOUNT_KEY='{...}'
GOOGLE_DRIVE_FOLDER_ID='1a2b3c4d5e6f7g8h9i0j'
```

After adding these keys, you will need to restart your development server for the changes to take effect.
