/**
 * @fileoverview Google Apps Script to sync a Google Sheet with MoTrack Firestore.
 *
 * To use this script:
 * 1. Open your Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Copy and paste the entire content of this file into the script editor.
 * 4. Add the OAuth2 library:
 *    - In the script editor, click "Libraries" (+).
 *    - Script ID: 1B7FSrk57A1B1LCoGSvMwoK24V7oP23A3cbv37EPy0sD4Z_ALa5tSrygE
 *    - Click "Look up", select the latest version, and click "Add".
 * 5. Run the `setup` function ONCE to configure your service account.
 *    - You will be asked to authorize the script.
 * 6. Deploy the script as a Web App to trigger it via a URL.
 *    - Click Deploy > New deployment.
 *    - Select Type: Web app.
 *    - Execute as: Me.
 *    - Who has access: Anyone (or Anyone within your organization).
 *    - Click "Deploy".
 *    - You can use the provided Web App URL to trigger the `doGet` function.
 */

// --- CONFIGURATION ---

// The name of the sheet in your Google Spreadsheet that contains the order data.
const SHEET_NAME = 'Sheet1';
// Your Google Cloud Project ID.
const PROJECT_ID = 'mo-panel';
// The base URL for the Firestore REST API.
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * Sets up the service account credentials.
 * IMPORTANT: Run this function once from the Apps Script editor to save your credentials securely.
 * Paste your actual service account JSON into the `serviceAccount` object below.
 */
function setup() {
  // IMPORTANT: PASTE YOUR SERVICE ACCOUNT JSON HERE
  const serviceAccount = {
    "type": "service_account",
    "project_id": "mo-panel",
    "private_key_id": "40a7c972a61d94e80a3372de98d26828d377740f",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCdwlEM3g6pG2fG\nIwZl59X0av2xERIc/gkEzy+PEH3TGD2o0Sf3LP5LkWNfG5ubC/jVgc+MjgT4FUzE\n+ohHQ9/dbv3Noo2HyJmsPzel+EiubvlypP74tvgf8HA9w+ZqGayai5X7xD/CBDc+\n3eoLSwAP5nQ5oCi9+ZsGGOxlGdvelmaS/ZVD+s32mhnEINcUzV+7T6VFOtIQcS9c\ngr0cx+LrKyfkpf4CHY1bbSI8E4ma3uLA9bwc/u3/yjlHF6UwPt0vTZowjBEOCt/w\ncMirBN1Z1QQDQiLGaH94D14UAhSq+i6XeApumFaS3ehvIB22FcPH0QKOoVt9ujpO\nLpcS+U/hAgMBAAECggEAA1TfMU5fMOMLRfvnXq+OrSK1SM/7efFDb36QmozWm2af\nprkEBwxEMoRXfOKwXo3aK2gaYfV91V9dx6sixZ6BU8PMSFNuebeaxzBulGqx3j0p\nt2oUmFwE0WfadvN0Ijl4k6ru9+olDovYPtOg5awnzC4pti3Trm9e/rn4BAqPwhuS\ngZ7mGseyPVkYXfYUkLJ84DTd5c6Ycya2HtbT8j8sQu0AtsdOruU1meFmNvwssGWv\n9GKVK1oWu65cENOC7ndo1hXtwqxBu9SC1gYQlKbgopfcw1MnC4xyCDPbUITui4kT\n2ep50cXAWuelngF3DKUqRrkXb/VhZ0u9oyEBb6YdoQKBgQDNAcWhkAi7Z39spumX\neeOjA2GrfJ7gC2jVB/XKrbXiWIH5GWVdnsKot5UTlO3O52gZTR4jaE6d5BgXDuGn\nSnt8vniOHcD17xRc47PI06sbSb7J/VxzV4pYWl09FitfREAENL4sFGH2ps1xeCEK\nLsSMErlTNsJZZKCdfa/dEf9QlwKBgQDE//D5T7pkfjW8FhqqX+W/Lf0fw1a3/E8l\ngvzk6ss/0JPK8zPHMc17vqoqsosnW7fU6EZKqPzgDuppZil1ZJcc1a9Xbip5z2FN\nTylH2O48nJKldOU/Nf2s6ktfz+uZMwFO0393dmhLFX9ZzbuNOBwlOyDnYVaeFqsy\neutik456RwKBgQCceWvFY1Cm6dpirgvBaHGNbPlRkO8bBtpfL5I1vt0DBJc/8Fhk\nWtctO+J3bccNk6brGOeWEvlenkic4OjvbXRPxHnzz1YG4RLjy5DgCl+hlmofdljo\nWLrpsR9VjuRP9KIAE9nLf0s+nhZVM2HUidnPKEN39mXlIV9Oli5zSFddxQKBgD5R\nqO11Z0V7F4yUgYL8KzW7WqO9q6UwT+lR8qaIEBvz440EOpD9FD/dJP+004hz30ee\n4v2jT7uhfE4zX1IfrB4XCwzhcNZv4BwQusJbwaGy9kEZJZxFfCZDR+zbXXBtTjCd\nf2lPL9bwygSirH4UDfNJLTOE+12vViD1+ZiJjTzpAoGBAIWcZV6q3dI44lWbeJv/\nlfDyGfoE52SWtqdcQGZnnzLgnN+SUjKLcumLxoBeA48UDbZHWlBRl1guDxrcdiZ6\nmRDVSNVqIoJAiG7Jm3jaq4kvdxNT8jssqM6h56/o4jYuD0i+D1D3V7vuieOI7/8+\nPnu6z/QvBVKZZQI2sBTOZpCI\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk-fbsvc@mo-panel.iam.gserviceaccount.com",
    "client_id": "103176715190342703303",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40mo-panel.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
  };

  PropertiesService.getScriptProperties().setProperty('SERVICE_ACCOUNT', JSON.stringify(serviceAccount));
  Logger.log('✅ Service account configuration saved successfully.');
}

/**
 * Gets a valid access token for the Firebase service account.
 * Uses the OAuth2 library to handle token acquisition and renewal.
 * @returns {string} A valid OAuth2 access token.
 */
function getAccessToken() {
  try {
    const serviceAccountString = PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT');
    if (!serviceAccountString) {
      throw new Error('Service account not configured. Please run the setup() function first.');
    }
    const serviceAccount = JSON.parse(serviceAccountString);

    const service = OAuth2.createService('Firebase')
      .setTokenUrl(serviceAccount.token_uri)
      .setPrivateKey(serviceAccount.private_key)
      .setIssuer(serviceAccount.client_email)
      .setSubject(serviceAccount.client_email)
      .setPropertyStore(PropertiesService.getScriptProperties())
      .setScope([
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/datastore',
      ].join(' '));

    if (!service.hasAccess()) {
      const error = service.getLastError();
      Logger.log('🔴 OAuth Error Details: ', error);
      throw new Error('Authentication failed: ' + JSON.stringify(error));
    }

    const token = service.getAccessToken();
    return token;
  } catch (err) {
    Logger.log('🔴 Error in getAccessToken: ' + err.message);
    throw err;
  }
}

/**
 * Main function triggered by visiting the Web App URL.
 * Processes the Google Sheet to create or update orders in Firestore.
 */
function doGet() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found`);
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    let results = {
      status: 'started',
      newOrders: 0,
      updatedOrders: 0,
      skippedRows: 0,
      errors: [],
      processedRows: 0
    };

    rows.forEach((row, index) => {
      const rowNumber = index + 2; // 1-based index + header row
      results.processedRows++;

      try {
        const trackingId = row[0]?.toString().trim(); // Column A
        const customerName = row[1]?.toString().trim(); // Column B
        const phone = row[2]?.toString().trim(); // Column C
        const remark = row[3]?.toString().trim(); // Column D
        const salesman = row[4]?.toString().trim(); // Column E
        const crmOrderNo = row[5]?.toString().trim(); // Column F
        const address = row[6]?.toString().trim(); // Column G
        const orderReceivedTimestamp = row[44]; // Column AS

        if (!customerName || !crmOrderNo) {
          results.skippedRows++;
          return;
        }

        if (!trackingId) {
          // --- CREATE NEW ORDER ---
          if (findOrderByCrmOrderNo(crmOrderNo)) {
            results.errors.push(`Row ${rowNumber}: Skipped - An order with CRM Order No. ${crmOrderNo} already exists.`);
            results.skippedRows++;
            return;
          }

          const newTrackingId = `MOTRACK-${crmOrderNo}`;
          const newOrder = {
            id: newTrackingId,
            crmOrderNo: crmOrderNo,
            customerName: customerName,
            customerPhone: phone || '',
            customerAddress: address || '',
            salesPerson: salesman || '',
            orderType: 'delivery',
            remarks: remark || '',
            milestones: getInitialMilestones('delivery'), // Using helper
            createdAt: new Date().toISOString(),
            createdBy: { id: 'sheets-script', name: 'Google Sheets' },
            otp: Math.floor(1000 + Math.random() * 9000).toString(),
          };

          createOrderInFirestore(newOrder);
          sheet.getRange(rowNumber, 1).setValue(newTrackingId); // Write back tracking number
          results.newOrders++;
          results.errors.push(`Row ${rowNumber}: Created new order ${newTrackingId}`);

        } else if (orderReceivedTimestamp instanceof Date) {
          // --- UPDATE EXISTING ORDER ---
          updateOrderMilestone(trackingId, 1, orderReceivedTimestamp);
          results.updatedOrders++;
        }
      } catch (err) {
        results.errors.push(`Row ${rowNumber}: Error - ${err.message}`);
        Logger.log(`🔴 Error processing row ${rowNumber}: ${err.stack}`);
      }
    });

    results.status = 'completed';
    return ContentService.createTextOutput(JSON.stringify(results, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('🔴 Fatal error in doGet: ' + err.stack);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message,
    }, null, 2)).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Creates a new order document in Firestore.
 * @param {object} orderPayload The complete order object.
 */
function createOrderInFirestore(orderPayload) {
  if (!orderPayload || !orderPayload.id) {
    throw new Error("Invalid order payload provided to createOrderInFirestore.");
  }
  const document = convertObjectToFirestoreDocument(orderPayload);
  const url = `${FIRESTORE_URL}/orders?documentId=${encodeURIComponent(orderPayload.id)}`;
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getAccessToken() },
    payload: JSON.stringify(document),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    const error = response.getContentText();
    Logger.log(`🔴 Firestore create error for ${orderPayload.id}: ${error}`);
    throw new Error(`Firestore API error (${response.getResponseCode()}): ${error}`);
  }
  Logger.log(`✅ Order ${orderPayload.id} created successfully.`);
}

/**
 * Updates a specific milestone for an existing order in Firestore.
 * @param {string} trackingId The ID of the order to update.
 * @param {number} milestoneId The ID of the milestone (e.g., 1 for 'Order Received').
 * @param {Date} timestamp The completion timestamp.
 */
function updateOrderMilestone(trackingId, milestoneId, timestamp) {
  const docPath = `orders/${trackingId}`;
  
  // First, get the current document to read the existing milestones
  const currentOrder = getFirestoreDocument(docPath);
  if (!currentOrder) {
    throw new Error(`Order with ID ${trackingId} not found for updating.`);
  }

  const existingMilestones = currentOrder.fields.milestones.arrayValue.values.map(m => convertFirestoreMapToObject(m.mapValue));

  // Update the specific milestone
  const updatedMilestones = existingMilestones.map(m => {
    if (m.id === milestoneId) {
      return {
        ...m,
        completed: true,
        completedAt: timestamp.toISOString(),
        completedBy: 'sheets-script'
      };
    }
    return m;
  });

  // Prepare the update payload for the entire milestones array
  const updatePayload = {
    fields: {
      milestones: {
        arrayValue: {
          values: updatedMilestones.map(m => ({ mapValue: convertObjectToFirestoreMap(m) }))
        }
      }
    }
  };
  
  const url = `${FIRESTORE_URL}/${docPath}?updateMask.fieldPaths=milestones`;
  const options = {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getAccessToken() },
    payload: JSON.stringify(updatePayload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    const error = response.getContentText();
    Logger.log(`🔴 Firestore update error for ${trackingId}: ${error}`);
    throw new Error(`Update failed (${response.getResponseCode()}): ${error}`);
  }
  Logger.log(`✅ Milestone ${milestoneId} updated for order ${trackingId}.`);
}


// --- HELPER FUNCTIONS ---

/**
 * Queries Firestore to find an order by its CRM Order Number.
 * @param {string} crmOrderNo The CRM order number to search for.
 * @returns {object|null} The Firestore document if found, otherwise null.
 */
function findOrderByCrmOrderNo(crmOrderNo) {
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'crmOrderNo' },
          op: 'EQUAL',
          value: { stringValue: crmOrderNo }
        }
      },
      limit: 1
    }
  };
  const url = `${FIRESTORE_URL}:runQuery`;
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getAccessToken() },
    payload: JSON.stringify(query),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    Logger.log(`🔴 Query failed for CRM No ${crmOrderNo}: ${response.getContentText()}`);
    return null;
  }

  const result = JSON.parse(response.getContentText());
  return (result[0] && result[0].document) ? result[0].document : null;
}

/**
 * Fetches a single document from Firestore by its path.
 * @param {string} path The document path (e.g., 'orders/MOTRACK-123').
 * @returns {object|null} The Firestore document object, or null if not found.
 */
function getFirestoreDocument(path) {
  const url = `${FIRESTORE_URL}/${path}`;
  const options = {
    method: 'get',
    headers: { Authorization: 'Bearer ' + getAccessToken() },
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() === 200) {
    return JSON.parse(response.getContentText());
  }
  return null;
}

/**
 * Generates the initial array of milestone objects for a new order.
 * This should match the structure in `src/lib/constants.ts`.
 * @param {string} orderType The type of order ('delivery', 'stitching', etc.).
 * @returns {Array<object>} An array of milestone objects.
 */
function getInitialMilestones(orderType) {
  const MILESTONES_CONFIG = {
    1: { name: 'Order Received' }, 2: { name: 'Fabric Allocated' }, 3: { name: 'Sent to Stitching' }, 4: { name: 'Stitching Done' }, 5: { name: 'Ready for Delivery' }, 6: { name: 'Installation Scheduled' }, 7: { name: 'Out for Delivery/Installation' }, 8: { name: 'Installation Done' },
  };
  const ORDER_TYPE_MILESTONES = {
    'delivery': [1, 2, 5, 7, 8], 'stitching': [1, 2, 3, 4, 5, 7, 8], 'stitching+installation': [1, 2, 3, 4, 5, 6, 7, 8],
  };

  const milestoneIds = ORDER_TYPE_MILESTONES[orderType] || [];
  return milestoneIds.map(id => ({
    id: id,
    name: MILESTONES_CONFIG[id].name,
    completed: false,
    completedBy: null,
    completedAt: null,
    location: null,
  }));
}

/**
 * Converts a standard JavaScript object into a Firestore document format (for the REST API).
 * This handles basic data types.
 * @param {object} obj The standard JavaScript object.
 * @returns {object} A Firestore document object with a 'fields' property.
 */
function convertObjectToFirestoreDocument(obj) {
  const fields = {};
  for (const key in obj) {
    const value = obj[key];
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      fields[key] = { integerValue: value };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value === null) {
      fields[key] = { nullValue: null };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(item => ({ mapValue: convertObjectToFirestoreMap(item) }))
        }
      };
    } else if (typeof value === 'object' && value !== null) {
       fields[key] = { mapValue: convertObjectToFirestoreMap(value) };
    }
  }
  return { fields: fields };
}

/**
 * Converts a JavaScript object into a Firestore Map object.
 */
function convertObjectToFirestoreMap(obj) {
    const fields = {};
    for (const key in obj) {
        const value = obj[key];
        if (typeof value === 'string') {
            fields[key] = { stringValue: value };
        } else if (typeof value === 'number') {
            fields[key] = { integerValue: value };
        } else if (typeof value === 'boolean') {
            fields[key] = { booleanValue: value };
        } else if (value === null) {
            fields[key] = { nullValue: null };
        }
    }
    return { fields: fields };
}

/**
 * Converts a Firestore Map back into a standard JavaScript object.
 */
function convertFirestoreMapToObject(mapValue) {
    const obj = {};
    const fields = mapValue.fields || {};
    for (const key in fields) {
        const valueObject = fields[key];
        const valueType = Object.keys(valueObject)[0];
        obj[key] = valueObject[valueType];
    }
    return obj;
}
