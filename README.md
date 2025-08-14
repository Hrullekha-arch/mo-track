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

This application uploads files (like measurement images) to a **Google Workspace Shared Drive**. Using a Shared Drive is required because service accounts do not have their own storage quota and cannot own files in personal "My Drive" folders.

1.  **Enable the Google Drive API**:
    *   Go to the [Google Cloud Console API Library](https://console.cloud.google.com/apis/library/drive.googleapis.com).
    *   Make sure your project is selected.
    *   Click **Enable**.

2.  **Create a Shared Drive**:
    *   Go to [Google Drive](https://drive.google.com).
    *   On the left sidebar, click on **Shared drives**.
    *   Click **New** at the top left, give your Shared Drive a name (e.g., "MoTrack Uploads"), and click **Create**.

3.  **Add the Service Account as a Member**:
    *   Right-click on your new Shared Drive and select **Manage members**.
    *   In the downloaded service account JSON file from Step 1, find the `client_email` (e.g., `...iam.gserviceaccount.com`).
    *   In the "Add people and groups" dialog, paste this email address.
    *   Change its role from "Viewer" to **Content manager**. This is essential.
    *   Click **Send**.

4.  **Add the Shared Drive ID to `.env`**:
    *   Open the Shared Drive. The URL will look like `https://drive.google.com/drive/folders/SOME_LONG_ID`.
    *   Copy the `SOME_LONG_ID` part. This is your Shared Drive ID.
    *   In your `.env` file, set `GOOGLE_DRIVE_FOLDER_ID` to this ID.

**Example `/.env` file:**
```env
FIREBASE_SERVICE_ACCOUNT_KEY='{...}'
GOOGLE_DRIVE_FOLDER_ID='1a2b3c4d5e6f7g8h9i0j'
```

After adding these keys, you will need to restart your development server for the changes to take effect.
