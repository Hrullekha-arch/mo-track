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
4.  The credentials have already been filled in for you in the script below.

#### `Code.gs`
```javascript
// Paste your service account credentials here.
// You can get these from the JSON file you download from the Google Cloud Console.
const FIREBASE_PROJECT_ID = "mo-panel"; 
const FIREBASE_CLIENT_EMAIL = "firebase-adminsdk-fbsvc@mo-panel.iam.gserviceaccount.com"; 
const FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCMpA+5vxQMu7M+\nDAThZr9sZKq16HtQSzBhCfgIknoe1SRrrD5PSj7+avJLfP2IXO9bm9ojGJqlRjU5\nHABgyyrUfDwxOdSXdWFJNsneoIvwDHM9rljZ5HlRBkAw6h+mGyEUYkheOX8KaLYG\nWiuC9FZr79nNcdjxmWciNGPah5P9M6a2EVSIbgftKqQhl/LUQeyXTxbo5Al0idAG\na/jGGIzdAmY9WSif9UkmX4/GGRubO9Xr+ccm+W4xmNd7+fZORpfSCCo/neHI10K+\nwD6DkovqR06R81K3G5bOQ/7xYGcL5qStabJD3P94T24brUXbyGeauIIpjNb27s6O\nIC93Sj47AgMBAAECggEAFIHHmTn3XnPwCtgNziABQXjcO3IOqQKNp1igxf81t1E0\n4k5XN5CH5ukJM2CiR0Pl0uHCyONJiVfXYuBmXbbCJAGJdVQNX5hJ+zeb18HRQc0wd\ncZz+b6cU2W+j5H3+52WFSUebbcHMeGURpDXT1z5TPvIMmCrVW8czqv881xZg83Q\n20ml63vNtoPsVkzy+Qrb0Sx2ntJKveN8xda0AuzPNG042u79eMheC/EFrBLowif4\nJ0jldtVCsY9w1yS4yJ94RgOxzLEmvh+6QOua+W8DybwtMgz7vckkyML1GiHS7HIj\nuW5L9BhKKXpdJIfdDbFTy41vZmwCoJ3o0Zhtj9sD4QKBgQDFv8xnR8ju31/yTrK0\nig1NRcfxaeYhonuPJURRJB4kjsMR/w6ZeL1K3LM31eeg8g8POZah3uzDlEaqpjyF\nRDB1RZTb5dd98/YKb7tWx9/0iOQGXz1zFerMwpSTxagqDJ+Xdy0koIF91Syttftt\nlfNqBvdKN4wNjM4Gm8SzTNDNDwKBgQC2Eb3gJiF53MbeIKhX9FK17YrLnB1Cyuxt\na/A0ZPu+UfyJEWVx57tmb9ip4nYlHtCO/qfQUANo9Vj4C0btTnJEQ3oP3gkqF8mH\nKNI47lR5WyxyJO+VZvrtW092ZKY1HSVmRYGGm9mSF5opjHV498HgaBvLgWVhPYk4\nsKLf7BfUFQKBgDlVP3UeSfJ/zviYupU/hVXHCo5Cztcnnb1F58XCu/6LaaE5GsmC\nSReAX3Gr0elG5PjcEIFD+c9GmSp24gsdVxNZJiyPOegpqEckV+N0NclXOw1h5ZYN\nX7MYIy2o2/W9DTRD+FGrO3/5I2gF4CzIkfdGp8Hb0v5GuaEO3nvBpLQfAoGAfz+v\nITYFN5KiOyVAAxjzpcs7skqN+NyymVdTLotVlxLeGT5bVFzNkS6ikzl/sTn0Mbyx\ntNn3SCgR4mqfS8QEAMnYSba5WP3/D8PsCXYo/BhI3A4MlLLAtZuX0ftOXtjcBrqV\naGsMiRqN2HQetkkS67BXnMf2/xtvCHwLmcz8anECgYEAsZTQL0UpZl2pKGY7SEOs\ngAweJ0h7jPZnzw+wrVAaC/L7YlESp7eqMjen+cyHeplOzEJwI8JK3LT18EIb+DRi\nMrvml64AzovJGQJCvNf1tCgB9yPEM9oD9HCgzRFM5YvWe49ct7Kz88gIb88tUCi3\no8/ftA0DZoJlzYn7VzKw2Is=\n-----END PRIVATE KEY-----\n";

// --- SPREADSHEET CONFIGURATION ---
const START_ROW = 2; // The first row of actual data.

const CONFIG = {
  'furniture': {
    SHEET_NAME: "FMS-O2D",
    ID_COLUMN_LETTER: 'G',
    COLUMNS: {
      DEAL_ID: 'G', // This is also the unique ID
      CUSTOMER_NAME: 'C',
      CUSTOMER_PHONE: 'D',
      REMARKS: 'E',
      SALES_PERSON: 'F',
      CUSTOMER_ADDRESS: 'H',
      WORK_TYPE: 'B', // Assuming 'B' for work type
      DELIVERY_DATE: 'I', // Assuming 'I' for promise delivery date
    },
    MILESTONE_MAP: {
      1: 'J', 2: 'N', 3: 'R', 4: 'V', 5: 'Z', 6: 'AD', 7: 'AH', 8: 'AL', 9: 'AP'
    }
  },
  'fabric': {
    SHEET_NAME: "FMS_Fabric",
    ID_COLUMN_LETTER: 'H',
    COLUMNS: {
      DEAL_ID: 'H', // This is also the unique ID
      CUSTOMER_NAME: 'B',
      CUSTOMER_PHONE: 'C',
      REMARKS: 'F',
      SALES_PERSON: 'E',
      CUSTOMER_ADDRESS: 'D',
      WORK_TYPE: 'G', 
      DELIVERY_DATE: 'I'
    },
    MILESTONE_MAP: {
      1: 'K', 2: 'M', 3: 'O', 4: 'V', 5: 'Z', 6: 'AD', 7: 'AH', 8: 'AL', 9: 'AP', 10: 'AT', 11: 'AX'
    }
  }
};


// --- MAIN SYNC FUNCTION ---
function syncFirestoreToSheet() {
  const firestore = getFirestoreService();
  const allRequests = firestore.getDocuments("purchaseRequests");
  Logger.log("Found " + allRequests.length + " purchase requests in Firestore.");

  allRequests.forEach(requestDoc => {
    const request = requestDoc.fields;
    const type = request.type ? request.type.stringValue : null;

    if (type && CONFIG[type]) {
      processRequest(firestore, request, CONFIG[type]);
    } else {
      Logger.log("Skipping request with unknown or missing type: " + (request.dealId ? request.dealId.stringValue : 'No ID'));
    }
  });

  Logger.log("Sync complete.");
}

function processRequest(firestore, request, config) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.SHEET_NAME);
  if (!sheet) {
    Logger.log("Sheet '" + config.SHEET_NAME + "' not found.");
    return;
  }

  const idToRowMap = createIdToRowMap(sheet, config.ID_COLUMN_LETTER);
  const dealId = request.dealId ? request.dealId.stringValue : null;
  if (!dealId) {
    Logger.log("Skipping request with no Deal ID.");
    return;
  }

  let rowNumber = idToRowMap.get(dealId);

  if (!rowNumber) {
    // If the request is not in the sheet, add it as a new row
    rowNumber = sheet.getLastRow() + 1;
    const newRowData = {
      [config.COLUMNS.DEAL_ID]: dealId,
      [config.COLUMNS.CUSTOMER_NAME]: request.customerName ? request.customerName.stringValue : '',
      [config.COLUMNS.CUSTOMER_PHONE]: request.email ? request.email.stringValue : '', // Using email as phone for now
      [config.COLUMNS.REMARKS]: request.remarks ? request.remarks.stringValue : '',
      [config.COLUMNS.SALES_PERSON]: request.salesman ? request.salesman.stringValue : '',
      [config.COLUMNS.CUSTOMER_ADDRESS]: request.customerName ? request.customerName.stringValue : '', // Using name as address for now
      [config.COLUMNS.WORK_TYPE]: request.workType ? request.workType.stringValue : '',
      [config.COLUMNS.DELIVERY_DATE]: request.promiseDeliveryDate ? Utilities.formatDate(new Date(request.promiseDeliveryDate.stringValue), Session.getScriptTimeZone(), "dd/MM/yyyy") : '',
    };

    // This is a simplified way to set values. A more robust solution would handle non-contiguous columns.
    for (const colName in newRowData) {
        if (newRowData.hasOwnProperty(colName)) {
            const colLetter = colName; // In this setup, keys of newRowData are column letters
            const colValue = newRowData[colName];
            updateCell(sheet, rowNumber, colLetter, colValue);
        }
    }
    Logger.log("Added new request with Deal ID '" + dealId + "' to sheet '" + config.SHEET_NAME + "' on row " + rowNumber);
  }

  // Update milestone statuses
  if (request.milestones && request.milestones.arrayValue && request.milestones.arrayValue.values) {
    request.milestones.arrayValue.values.forEach(milestoneValue => {
      const milestone = milestoneValue.mapValue.fields;
      const stepId = milestone.stepId.integerValue;
      const status = milestone.status.stringValue;

      if (config.MILESTONE_MAP[stepId] && status === 'completed') {
        const columnLetter = config.MILESTONE_MAP[stepId];
        const completedAt = milestone.completedAt.stringValue; // Assuming stringValue for ISO date
        const formattedDate = Utilities.formatDate(new Date(completedAt), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
        updateCell(sheet, rowNumber, columnLetter, formattedDate);
      }
    });
  }
}

// --- HELPER FUNCTIONS ---

function createIdToRowMap(sheet, idColumnLetter) {
  const idColumnIndex = getColumnIndex(idColumnLetter);
  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) {
    return new Map();
  }
  const range = sheet.getRange(START_ROW, idColumnIndex, lastRow - START_ROW + 1, 1);
  const sheetIds = range.getValues();
  
  const idToRowMap = new Map();
  sheetIds.forEach((row, index) => {
    if (row[0]) {
      idToRowMap.set(row[0].toString().trim(), START_ROW + index);
    }
  });
  return idToRowMap;
}

function updateCell(sheet, row, colLetter, value) {
  const cell = sheet.getRange(colLetter + row);
  if (cell.getValue().toString() !== value.toString()) {
    cell.setValue(value);
  }
}

function getColumnIndex(letter) {
  let column = 0, length = letter.length;
  for (let i = 0; i < length; i++) {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  return column;
}

function getFirestoreService() {
  return FirestoreApp.getFirestore(
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_PROJECT_ID
  );
}

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
      .everyMinutes(5)
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
