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

### 2. Configure Firebase Storage

This application uses Firebase Storage to store uploaded files (e.g., measurement images, PDFs).

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and select your project.
2.  Navigate to the **Storage** section from the left-hand menu.
3.  Click **Get started**.
4.  Follow the on-screen instructions to set up your storage bucket. We recommend choosing "production mode" when prompted for security rules.
5.  After setup is complete, navigate to the **Rules** tab.
6.  Paste the following rules into the editor and click **Publish**:
    ```
    rules_version = '2';
    service firebase.storage {
      match /b/{bucket}/o {
        // Allow public read for easy image display.
        // Restrict writes to authenticated users.
        match /{allPaths=**} {
          allow read;
          allow write: if request.auth != null;
        }
      }
    }
    ```
7.  Go back to the **Files** tab. Your storage bucket URL will be at the top (e.g., `gs://your-project-id.appspot.com`).
8.  Copy just the bucket name part (`your-project-id.appspot.com`).
9.  Open the `.env` file in your project and add this value for `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.

**Example `.env` file:**
```env
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='your-project-id.appspot.com'
```

After completing these steps, your application will be able to upload files to Firebase Storage.
