
'use server';

import { google } from 'googleapis';
import { SHEET_NAME, ORDER_ID_COLUMN, O2D_STEP_TO_COLUMN_MAP } from '@/lib/google-sheets-config';
import { format } from 'date-fns';

// This function formats the date to be inserted into the sheet.
// You can change the format here if needed.
const formatTimestampForSheet = (isoDate: string) => {
    return format(new Date(isoDate), 'dd/MM/yyyy HH:mm:ss');
};

async function getSheetsClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('The GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set.');
    }
    
    // The key is expected to be a stringified JSON object.
    const credentials = JSON.parse(serviceAccountKey);

    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    return google.sheets({ version: 'v4', auth: authClient as any });
}

export async function updateSheetForO2DStep(crmOrderNo: string, stepId: number, completedAt: string) {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
        throw new Error('The GOOGLE_SHEET_ID environment variable is not set.');
    }
    if (!crmOrderNo) {
        throw new Error('Cannot update sheet without a CRM Order No.');
    }

    const column = O2D_STEP_TO_COLUMN_MAP[stepId];
    if (!column) {
        console.warn(`No column mapping found for O2D step ${stepId}. Skipping sheet update.`);
        return; // No mapping for this step, so we do nothing.
    }

    try {
        const sheets = await getSheetsClient();

        // 1. Find the row number for the given crmOrderNo.
        const idColumn = `${SHEET_NAME}!${ORDER_ID_COLUMN}:${ORDER_ID_COLUMN}`;
        const getRowsResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: idColumn,
        });

        const orderIds = getRowsResponse.data.values;
        if (!orderIds || orderIds.length === 0) {
            throw new Error(`Column ${ORDER_ID_COLUMN} in sheet '${SHEET_NAME}' is empty or not found.`);
        }

        const rowIndex = orderIds.findIndex(row => row[0] === crmOrderNo);
        if (rowIndex === -1) {
            console.warn(`Order with CRM No. "${crmOrderNo}" not found in Google Sheet. Skipping update.`);
            return;
            // You could optionally throw an error here if a match is always expected.
            // throw new Error(`Order with CRM No. "${crmOrderNo}" not found in Google Sheet.`);
        }

        const rowNumber = rowIndex + 1; // Sheet rows are 1-based

        // 2. Update the specific cell in that row.
        const cellToUpdate = `${SHEET_NAME}!${column}${rowNumber}`;
        const valueToInsert = formatTimestampForSheet(completedAt);

        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: cellToUpdate,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[valueToInsert]],
            },
        });

        return { success: true, message: `Updated cell ${cellToUpdate} for order ${crmOrderNo}.` };

    } catch (error: any) {
        console.error('Google Sheets API Error:', error.response?.data?.error || error.message);
        throw new Error('Failed to update Google Sheet. Please check the service account permissions and configuration.');
    }
}
