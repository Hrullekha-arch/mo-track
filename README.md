# Firebase Studio - MoTrack

This is a Next.js starter application for MoTrack, a comprehensive operations management tool.

---

## **Required Setup**

### 1. Add Firebase Service Account Key

For the application's server-side functions (like file uploads) to connect to your Firebase project, you must provide a **Service Account Key**.

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

This application uses Google Drive to store uploaded files (e.g., measurement images).

#### Step 2.1: Enable the Google Drive API

1.  Go to the [Google Cloud Console API Library](https://console.cloud.google.com/apis/library/drive.googleapis.com).
2.  Make sure your current Firebase project is selected.
3.  Click the **Enable** button.

#### Step 2.2: Create a Shared Drive

Service accounts cannot own files in a standard "My Drive" folder. You must use a **Shared Drive**.

1.  Go to [Google Drive](https://drive.google.com/).
2.  On the left-hand side, right-click on **Shared drives** and select **New shared drive...**.
3.  Give it a name (e.g., "MoTrack App Uploads") and click **Create**.
4.  Once created, right-click on the new Shared Drive and select **Manage members**.

#### Step 2.3: Share the Drive with the Service Account

1.  Find your service account's email address. You can find this in the JSON key you downloaded, under the `client_email` property (e.g., `your-app@your-project-id.iam.gserviceaccount.com`).
2.  In the "Manage members" dialog in Google Drive, paste this email address.
3.  Assign the **Content manager** role. This is crucial as it allows the service account to add, edit, and delete files.
4.  Click **Send**.

#### Step 2.4: Get the Shared Drive ID

1.  Open your new Shared Drive.
2.  The URL in your browser will look something like this: `https://drive.google.com/drive/u/0/folders/DRIVE_ID_IS_HERE`.
3.  Copy the `DRIVE_ID_IS_HERE` part.
4.  Open the `.env` file in your project and paste this ID as the value for `GOOGLE_DRIVE_FOLDER_ID`.

**Example `/.env` file:**
```env
GOOGLE_DRIVE_FOLDER_ID='0AKkzh4FCszRbUk9PVA'
```

After completing these steps, your application will be able to upload files to the designated Shared Drive.
