# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Google Sheets Integration Setup

To enable writing O2D process updates to your Google Sheet, you need to configure the application with your Google Cloud credentials.

### 1. Create a Google Cloud Service Account

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Select your project (or create a new one).
3.  In the navigation menu, go to **IAM & Admin** > **Service Accounts**.
4.  Click **+ CREATE SERVICE ACCOUNT**.
5.  Give it a name (e.g., "motrack-sheets-writer") and a description. Click **CREATE AND CONTINUE**.
6.  For roles, grant the **Editor** role to this service account so it can edit your sheets. Click **CONTINUE**.
7.  Skip the last step and click **DONE**.
8.  Find the service account you just created in the list. Click the three-dot menu under **Actions** and select **Manage keys**.
9.  Click **ADD KEY** > **Create new key**.
10. Select **JSON** as the key type and click **CREATE**. A JSON file will be downloaded. This is your service account key.

### 2. Share your Google Sheet

1.  Open the JSON key file you just downloaded. Find the `client_email` address (it will look something like `...iam.gserviceaccount.com`).
2.  Open your Google Sheet.
3.  Click the **Share** button.
4.  Paste the `client_email` into the sharing dialog and give it **Editor** access.
5.  Click **Share**.

### 3. Configure Environment Variables

1.  **Create a new file** in the root of your project called `.env.local`.
2.  **Open the JSON key file** you downloaded. Copy the entire contents of the file.
3.  **Open your Google Sheet** in the browser. The URL will look like `.../spreadsheets/d/<your-sheet-id>/edit...`. Copy the long string of characters that is your Sheet ID.
4.  Add the following content to your `.env.local` file, pasting your JSON key and Sheet ID where indicated:

```
# .env.local

# Your Google Sheet ID
GOOGLE_SHEET_ID="YOUR_SHEET_ID_HERE"

# The entire JSON content of your service account key file
GOOGLE_SERVICE_ACCOUNT_KEY='{"type": "service_account", "project_id": "...", ...}'
```

**Important**: Make sure the JSON key is enclosed in single quotes `'` to ensure it is parsed correctly.

### 4. Configure Column Mapping

1.  Open the file `src/lib/google-sheets-config.ts`.
2.  Update the `O2D_STEP_TO_COLUMN_MAP` to match the columns in your Google Sheet where you want to write the completion data for each step.

After completing these steps, the application will automatically update your Google Sheet whenever an O2D process step is completed.
