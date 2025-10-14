
# MoTrack Application File Structure (Detailed)

This document provides a comprehensive, file-by-file overview of the MoTrack application's structure, explaining the purpose of each key directory and the functions within them.

---

## `/` (Root Directory)

Contains high-level configuration for the project's frameworks, dependencies, and deployment settings.

-   **`next.config.ts`**: Configures the Next.js framework. It handles settings like Progressive Web App (PWA) functionality via `next-pwa`, image optimization rules for external sources, and build-time flags to ignore TypeScript/ESLint errors during builds.
-   **`tailwind.config.ts`**: Configures the Tailwind CSS framework. It defines the application's design system, including the color palette (using CSS variables for theming), spacing, fonts, and animations.
-   **`tsconfig.json`**: TypeScript configuration. It sets compiler options and rules for how TypeScript code is type-checked, ensuring code quality and consistency across the project.
-   **`package.json`**: Lists all project dependencies (e.g., React, Next.js, Firebase, Genkit) and devDependencies. It also defines script commands for running, building, and deploying the application (e.g., `npm run dev`, `npm run build`).
-   **`firebase.json`**: Configures Firebase services for deployment. It tells the Firebase CLI where to find Firestore security rules (`firestore.rules`) and database indexes (`firestore.indexes.json`).
-   **`firestore.rules`**: **Crucial for security.** Defines the security rules for the Firestore database, controlling who can read, write, update, or delete data in each collection.
-   **`firestore.indexes.json`**: Specifies composite indexes required for complex Firestore queries. These indexes are essential for ensuring database queries are fast and efficient as the application scales.
-   **`Documentation.md`**: A detailed, step-by-step user manual explaining the application's entire business workflow from customer creation to order completion.
-   **`README.md`**: Provides setup instructions for developers, covering essential steps like configuring Firebase Service Accounts and Google Drive API keys.
-   **`.env`**: Stores secret environment variables. This file is critical for security and holds API keys, the Firebase Service Account JSON, and the Google Drive folder ID. It is not checked into version control.

---

## `src/app/`

The core of the application, built using the Next.js App Router. Each folder inside this directory corresponds to a URL route.

-   **`layout.tsx`**: The root layout for the entire application. It wraps all pages and sets up the main HTML structure, including global context providers like `AuthProvider` for authentication state and `ThemeProvider` for light/dark mode switching.
-   **`globals.css`**: The global stylesheet. This is where the application's base theme (colors, fonts) using HSL CSS variables is defined, along with any other global styles.

### `src/app/dashboard/`

Contains all pages and components related to the main web application dashboard, accessible after login.

-   **`layout.tsx`**: The layout specific to the dashboard. It renders the main application shell (`AppShell`), which includes the sidebar navigation and header. It also contains the core authentication logic that protects all dashboard routes, redirecting unauthenticated users to the login page.
-   **`page.tsx`**: The main dashboard landing page. It dynamically renders different dashboard views (`AdminDashboard`, `CrmDashboard`, `SalesmanDashboard`, etc.) based on the logged-in user's role and designation.
-   **`[pageName]/page.tsx`**: Each subfolder represents a page on the dashboard (e.g., `/dashboard/orders`, `/dashboard/customers`). The `page.tsx` file within it is the entry point and main component for that page.
-   **`[pageName]/actions.ts`**: These files contain server-side functions (Next.js Server Actions) used by the corresponding page. They handle data mutations (create, update, delete) and complex data fetching directly with the Firebase Admin SDK, ensuring secure and privileged operations. For example, `src/app/dashboard/approvals/actions.ts` contains functions like `approveOrderAndCreatePurchaseRequest` which performs multiple database writes in a secure server environment.

---

## `src/components/`

Contains all reusable React components that make up the application's user interface.

-   **`shared/`**: Components used across multiple parts of the application.
    -   `AppShell.tsx`: The main layout component for the dashboard, including the responsive sidebar and header. It manages the navigation links available to the user based on their role and permissions.
-   **`ui/`**: General-purpose, low-level UI components provided by the `shadcn/ui` library, such as `Button.tsx`, `Card.tsx`, `Input.tsx`, and `Dialog.tsx`. These are the basic building blocks of the interface.
-   **`features/`**: Higher-level components that encapsulate specific business logic or features. These are organized by domain to keep related UI logic together.
    -   `customer/`: Components for customer management (e.g., `NewContactDialog.tsx`, `CustomerResultsTable.tsx`).
    -   `order-management/`: Components for managing orders, creating quotations, and tracking progress (e.g., `OrdersTable.tsx`, `MilestoneProgress.tsx`, `CreateQuotationDialog.tsx`).
    -   `inventory/`: Components for managing stock and viewing transaction history (e.g., `StockTable.tsx`, `StockDetails.tsx`).
    -   `purchase/`: Components related to the purchasing workflow (e.g., `PurchaseRequestTable.tsx`, `PoGenTable.tsx`).
    -   `pms/`: Components for the Production Management System (e.g., `BarcodeSticker.tsx`).
    -   `installer/`: Components for the installer's mobile interface (e.g., `MobileView.tsx`).
    -   `tracking/`: Components used on the public order tracking page.
    -   `reports/`: Components for displaying report data (e.g., `ReportDetailDialog.tsx`).

---

## `src/lib/`

A collection of utility files, constants, helper functions, and SDK initializations.

-   **`firebase.ts`**: Initializes the **client-side** Firebase SDK. It exports the `db` (Firestore) and `auth` (Authentication) objects that are used in client components for real-time data fetching and user authentication tasks.
-   **`firebase-admin.ts`**: Initializes the **server-side** Firebase Admin SDK. This is used exclusively in Server Actions and API routes for privileged database operations that require bypassing security rules (e.g., administrative tasks, complex data aggregation).
-   **`types.ts`**: Contains all the TypeScript type definitions for the application's data structures (e.g., `Order`, `Customer`, `User`, `Deal`). This is crucial for maintaining type safety and code consistency across the app.
-   **`constants.ts`**: Defines application-wide constants, such as the configuration for O2D and PMS process steps (`O2D_PROCESS_CONFIG`, `PMS_PROCESS_CONFIG`), and various option lists for forms (`roomOptions`, `vasOptions`).
-   **`utils.ts`**: General utility functions, most notably the `cn` function from `tailwind-merge` and `clsx`, which is used for conditionally combining Tailwind CSS classes.

---

## `src/context/`

Contains React Context providers for managing global application state.

-   **`AuthContext.tsx`**: Manages the application's authentication state. It provides a `useAuth` hook that gives components access to the currently logged-in user's data (`user`), their role (`role`), authentication status (`loading`), and functions for `login` and `logout`.

---

## `src/ai/`

This directory houses all the Generative AI functionalities powered by Genkit.

-   **`genkit.ts`**: Initializes and configures the core Genkit AI instance, setting up the Google AI plugin and specifying the default model (`gemini-2.0-flash`).
-   **`flows/`**: Contains individual files for each AI "flow" or agent. Each file defines the logic for a specific AI-powered task.
    -   `complete-pms-process.ts`: Defines the `completePmsProcess` flow. This agent can receive an order ID and programmatically mark all PMS steps as complete, then update the main order's "Stitching Done" milestone in Firestore.
    -   `generate-installation-schedule.ts`: Defines the `generateInstallationSchedule` flow. This agent analyzes installer workloads, delivery locations, and order deadlines to automatically generate an optimized installation schedule.

---

## `src/services/`

Contains functions that interact with external services, such as the Tally accounting software.

-   `tally.ts`: Handles all communication with the Tally ERP. It contains functions for building the specific XML formats that Tally expects for creating sales vouchers (`buildSalesVoucherXML`) and for querying Tally for stock information (`getStockFromTally`). It also includes the logic for sending these XML packets to the Tally server endpoint.
-   `mo-space-tally.ts`: A specialized version of `tally.ts` for handling invoices related to the "MO SPACES PVT.LTD." company, which has different tax and ledger requirements.
-   `google-sheets.ts`: Manages integration with Google Sheets for O2D tracking. Its primary function, `updateSheetForO2DStep`, finds the correct row for an order and updates a specific column with a timestamp when an O2D milestone is completed.

