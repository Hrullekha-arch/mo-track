# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Google Sheets Integration Setup (via Google Apps Script)

To enable automatic updates from your Firestore database to your Google Sheet, you need to set up a Google Apps Script on your sheet and provide it with credentials to access your Firebase project data.

### 1. Create a Google Cloud Service Account

A Service Account is a special type of Google account intended to represent a non-human user that needs to authenticate and be authorized to access data in Google APIs.

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Select your Firebase project from the dropdown at the top (it should have the same name as your Firebase project, e.g., "mo-panel").
3.  In the navigation menu (☰), go to **IAM & Admin** > **Service Accounts**.
4.  Click **+ CREATE SERVICE ACCOUNT**.
5.  Give it a name (e.g., "motrack-sheets-reader") and a description. Click **CREATE AND CONTINUE**.
6.  For roles, grant it the **Cloud Datastore User** role. This gives it permission to read from your Firestore database. Click **CONTINUE**.
7.  Skip the last step ("Grant users access to this service account") and click **DONE**.
8.  Find the service account you just created in the list. Click the three-dot menu under **Actions** and select **Manage keys**.
9.  Click **ADD KEY** > **Create new key**.
10. Select **JSON** as the key type and click **CREATE**. A JSON file will be downloaded. This is your service account key.

### 2. Configure the Apps Script

1.  Open your Google Sheet.
2.  Go to **Extensions** > **Apps Script**. This will open a new tab with the script editor.
3.  **Copy the Apps Script code** provided by the AI assistant into the `Code.gs` editor, replacing any existing code.
4.  **Open the JSON key file** you downloaded in Step 1. You will need three pieces of information from it:
    *   `project_id`
    *   `client_email`
    *   `private_key` (the entire string, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
5.  **Paste these three values** into the corresponding placeholder variables at the top of the `Code.gs` script.

### 3. Add the Firestore Library to Apps Script

1.  In the Apps Script editor, find the **Libraries** section on the left and click the `+` button.
2.  In the "Script ID" field, paste the following ID:
    `1VUSl4b1r1L5EO9I3n8_s9i4Y2uaO_yI-B5St05IryEl2s4pfsltI0R-M`
3.  Click **Look up**.
4.  Make sure the Identifier is `Firestore` and select the latest version.
5.  Click **Add**.

### 4. Set Up a Trigger to Run the Script Automatically

1.  In the Apps Script editor, click the **Triggers** icon (it looks like a clock) on the left sidebar.
2.  Click the **+ Add Trigger** button in the bottom right.
3.  Configure the trigger with the following settings:
    *   **Choose which function to run**: `syncFirestoreToSheet`
    *   **Choose which deployment should run**: `Head`
    *   **Select event source**: `Time-driven`
    *   **Select type of time based trigger**: `Minutes timer`
    *   **Select minute interval**: `Every 15 minutes` (or your desired frequency)
4.  Click **Save**. You will be asked to authorize the script. Follow the prompts to allow it to run.

After completing these steps, the Apps Script will automatically run on your chosen schedule, read the latest data from your Firestore database, and update your Google Sheet accordingly.
