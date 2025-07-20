# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

---

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
3.  **Copy the Apps Script code** provided below into the `Code.gs` editor, replacing any existing code.
4.  **Open the JSON key file** you downloaded in Step 1. You will need three pieces of information from it:
    *   `project_id`
    *   `client_email`
    *   `private_key` (the entire string, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
5.  **Paste these three values** into the corresponding placeholder variables at the top of the `Code.gs` script.

#### `Code.gs`
```javascript
// Paste your service account credentials here.
// You can get these from the JSON file you download from the Google Cloud Console.
const FIREBASE_PROJECT_ID = "YOUR_FIREBASE_PROJECT_ID"; // e.g., "mo-panel"
const FIREBASE_CLIENT_EMAIL = "YOUR_SERVICE_ACCOUNT_EMAIL"; // e.g., "....iam.gserviceaccount.com"
const FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n";

// --- SPREADSHEET CONFIGURATION ---
const SHEET_NAME = "FMS-O2D";
const CRM_ORDER_ID_COLUMN_LETTER = 'G'; // The column with the unique ID to match rows.
const START_ROW = 2; // The first row of actual data.

// Maps Firestore o2dMilestones stepId to the column it should update.
const STEP_TO_COLUMN_MAP = {
  1: 'K',
  2: 'O',
  3: 'S',
  4: 'W',
  5: 'AA',
  6: 'AE',
  7: 'AI',
  8: 'AM',
  9: 'AQ'
};

// Main function to run to sync data.
function syncFirestoreToSheet() {
  const firestore = getFirestoreService();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    Logger.log("Sheet '" + SHEET_NAME + "' not found.");
    return;
  }
  
  // Get all orders from Firestore
  const allOrders = firestore.getDocuments("orders");
  Logger.log("Found " + allOrders.length + " orders in Firestore.");

  // Get all CRM Order IDs from the sheet to create a map for quick lookups
  const crmOrderIdColumnIndex = getColumnIndex(CRM_ORDER_ID_COLUMN_LETTER);
  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) {
    Logger.log("No data rows found in the sheet.");
    return;
  }
  const range = sheet.getRange(START_ROW, crmOrderIdColumnIndex, lastRow - START_ROW + 1, 1);
  const sheetOrderIds = range.getValues();
  
  const idToRowMap = new Map();
  sheetOrderIds.forEach((row, index) => {
    if (row[0]) {
      idToRowMap.set(row[0].toString().trim(), START_ROW + index);
    }
  });

  // Iterate over Firestore orders and update the sheet
  allOrders.forEach(orderDoc => {
    const order = orderDoc.fields;
    const crmOrderNo = order.crmOrderNo ? order.crmOrderNo.stringValue : null;
    
    if (crmOrderNo && idToRowMap.has(crmOrderNo)) {
      const rowNumber = idToRowMap.get(crmOrderNo);
      
      // Update O2D milestone statuses
      if (order.o2dMilestones && order.o2dMilestones.arrayValue && order.o2dMilestones.arrayValue.values) {
        order.o2dMilestones.arrayValue.values.forEach(milestoneValue => {
          const milestone = milestoneValue.mapValue.fields;
          const stepId = milestone.stepId.integerValue;
          const status = milestone.status.stringValue;
          
          if (STEP_TO_COLUMN_MAP[stepId] && status === 'completed') {
            const columnLetter = STEP_TO_COLUMN_MAP[stepId];
            const completedAt = milestone.completedAt.timestampValue;
            // Format to a more standard 'dd/MM/yyyy HH:mm:ss' format
            const formattedDate = Utilities.formatDate(new Date(completedAt), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
            updateCell(sheet, rowNumber, columnLetter, formattedDate);
          }
        });
      }
    } else {
      if (crmOrderNo) {
        Logger.log("Order with CRM ID '" + crmOrderNo + "' found in Firestore but not in Sheet.");
      }
    }
  });
  
  Logger.log("Sync complete.");
}

/**
 * Helper function to update a single cell to avoid writing if the value is already the same.
 */
function updateCell(sheet, row, colLetter, value) {
  const cell = sheet.getRange(colLetter + row);
  if (cell.getValue().toString() !== value.toString()) {
    cell.setValue(value);
  }
}

/**
 * Helper function to convert column letter to index.
 */
function getColumnIndex(letter) {
  let column = 0, length = letter.length;
  for (let i = 0; i < length; i++) {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  return column;
}


/**
 * Initializes and returns a Firestore service instance.
 */
function getFirestoreService() {
  return FirestoreApp.getFirestore(
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_PROJECT_ID
  );
}

// Function to set up a trigger automatically if one doesn't exist
function setupTrigger() {
  const functionName = 'syncFirestoreToSheet';
  const triggers = ScriptApp.getProjectTriggers();
  let triggerExists = false;

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === functionName) {
      triggerExists = true;
    }
  });

  if (!triggerExists) {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .everyMinutes(5) // You can change this to 10, 15, 30, etc.
      .create();
    Logger.log('Trigger for ' + functionName + ' created.');
  } else {
    Logger.log('Trigger for ' + functionName + ' already exists.');
  }
}

```

### 3. Add the Firestore Library to Apps Script

1.  In the Apps Script editor, find the **Libraries** section on the left and click the `+` button.
2.  In the "Script ID" field, paste the following ID:
    `1VUSl4b1r1L5EO9I3n8_s9i4Y2uaO_yI-B5St05IryEl2s4pfsltI0R-M`
3.  Click **Look up**.
4.  Make sure the Identifier is `Firestore` and select the latest version.
5.  Click **Add**.

### 4. Set Up a Trigger to Run the Script Automatically

The provided script includes a `setupTrigger` function. To set up the trigger:
1. In the Apps Script editor, make sure you have saved the project (`Ctrl+S` or `Cmd+S`).
2. At the top of the editor, where it says **"Select function"**, choose `setupTrigger`.
3. Click the **"Run"** button (looks like a play icon ▶).
4. You will be asked to authorize the script. This is a critical step.
   *  Click **"Review permissions"**.
   *  Choose your Google account.
   *  You will likely see a warning that "Google hasn't verified this app." This is normal for your own scripts. Click **"Advanced"**, then click **"Go to [Your Project Name] (unsafe)"**.
   *  Review the permissions and click **"Allow"**.
5. Once you run it, the script will automatically create a time-driven trigger that runs the `syncFirestoreToSheet` function every 5 minutes. You can verify this by clicking the **Triggers** icon (it looks like a clock) on the left sidebar.

After completing these steps, the Apps Script will automatically run on your chosen schedule, read the latest data from your Firestore database, and update your Google Sheet accordingly.