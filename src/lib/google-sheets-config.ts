/**
 * This file contains the configuration for the Google Sheets integration.
 * You need to update this file to match your Google Sheet setup.
 */

// This is the name of the sheet (tab) within your Google Spreadsheet file.
export const SHEET_NAME = 'O2D_Tracking';

// This is the column that contains the unique CRM Order No. to identify the row.
// 'A' corresponds to column A, 'B' to column B, and so on.
export const ORDER_ID_COLUMN = 'A';

/**
 * This maps each O2D process step ID to the column where its completion
 * date and time should be written.
 *
 * For example, { 1: 'F' } means that when step 1 ("Receive Advance") is
 * completed, the timestamp will be written to column F in the correct row.
 *
 * **ACTION REQUIRED**: Update these column letters to match your Google Sheet.
 */
export const O2D_STEP_TO_COLUMN_MAP: Record<number, string> = {
  1: 'F',   // Example: Receive Advance date in column F
  2: 'G',   // Example: Material Selection date in column G
  3: 'H',   // ...and so on.
  4: 'I',
  5: 'J',
  6: 'K',
  7: 'L',
  8: 'M',
  9: 'N',
  10: 'O',
};
