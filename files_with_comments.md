
# MoTrack Project Structure Overview

This document provides a detailed breakdown of the folder and file structure for the MoTrack application, explaining the purpose of each major component.

---

## Root Directory

-   **`.env`**: Stores environment variables, such as API keys and database credentials. This file is not checked into version control for security.
-   **`README.md`**: Contains setup instructions and essential information for getting the project running locally.
-   **`package.json`**: Lists all project dependencies (like React, Next.js, etc.) and defines scripts for running, building, and deploying the application.
-   **`next.config.ts`**: The configuration file for the Next.js framework, controlling settings like image optimization and PWA (Progressive Web App) behavior.
-   **`tailwind.config.ts`**: The configuration file for Tailwind CSS, where the design system (colors, fonts, spacing) is defined.
-   **`tsconfig.json`**: The configuration file for TypeScript, defining the rules and settings for the compiler to ensure code quality and type safety.
-   **`apphosting.yaml`**: Configuration file for Firebase App Hosting, managing settings like server instance scaling.
-   **`firebase.json`**: Configures Firebase services like Firestore (database rules, indexes) and Hosting (rewrite rules).
-   **`firestore.indexes.json`**: Defines custom composite indexes for Firestore to enable complex queries and ensure efficient data fetching.
-   **`firestore-schema.md`**: A markdown document outlining the structure of the Firestore database, including collections and document fields.
-   **`components.json`**: Configuration file for `shadcn/ui`, defining the project's UI component library settings.
-   **`FLOWCHART.md`**: A markdown file containing a Mermaid.js flowchart that visually represents the application's user and data flows.
-   **`PRESENTATION_GUIDE.md`**: A detailed script and talking points for presenting the MoTrack application to stakeholders.
-   **`promo.html`, `deal_activity_tracker.html`**: Standalone HTML files, likely for promotional material or specific UI mockups.

---

## `src/` Directory

This is the main source code directory for the application.

### `src/app/`

This directory contains all the pages and routing for the application, following the Next.js App Router paradigm.

-   **`layout.tsx`**: The root layout for the entire application. It sets up the main HTML structure, includes global styles, and wraps the app in necessary providers (like Authentication and Theme).
-   **`globals.css`**: The global stylesheet where the application's core CSS variables (theme colors, fonts) are defined using Tailwind CSS directives.
-   **`page.tsx`**: The main landing page of the application, which serves as the **Login Page**.
-   **`track/page.tsx`**: The public-facing page where customers can track their order status using a tracking code.
-   **`scan/page.tsx`**: A universal page for scanning barcodes, which can be used for various inventory and tracking purposes.
-   **`mobile/`**: The directory for the installer-specific mobile view.
    -   **`page.tsx`**: The main dashboard for installers, showing their assigned tasks.
    -   **`completed/page.tsx`**: Shows a history of all tasks and visits completed by the installer.
    -   **`delivery/[visitId]/page.tsx`**: The page an installer uses to manage a delivery or installation visit, including checklists and status updates.
    -   **`measurement/[visitId]/page.tsx`**: The page an installer uses to input measurement details for a specific visit.
-   **`dashboard/`**: The main application area for authenticated admin and employee users.
    -   **`layout.tsx`**: The layout for the dashboard, containing the main sidebar navigation and user profile management. It protects all nested routes, ensuring only logged-in users can access them.
    -   **`page.tsx`**: The **Home Dashboard** page, which displays summary cards linking to all major modules.
    -   **`all-orders/`**: Contains the "Details" page, which is a powerful reporting hub with sortable and filterable tables for all major data collections.
    -   **`approvals/`**: The page where users with 'Accounts' or 'admin' roles can approve pending quotations and orders.
    -   **`customers/`**: The "Customers" module for managing customer information and their associated deals.
        -   **`page.tsx`**: The main customer search page.
        -   **`[customerId]/page.tsx`**: The detail page for a single customer, showing their list of deals.
        -   **`[customerId]/[dealId]/page.tsx`**: The "CRM Activity Tracker" page, which is the core interface for managing a specific deal. It includes tabs for adding products, creating quotations, logging visits, and more.
    -   **`cutting/`**: The module for managing fabric cutting tasks generated from invoices.
    -   **`inbound/`**: The module for managing the receipt of materials from purchase orders.
    -   **`inventory/`**: The module for managing stock levels, viewing transaction history, and importing/exporting stock data.
    -   **`invoice/`**: The module for creating and viewing invoices based on allocated order items.
    -   **`o2d/`**: The "Order to Delivery" page, where all new deals are processed through a pre-production checklist before being acknowledged and moved to the main orders dashboard.
    -   **`orders/`**: The "Orders Dashboard" module for tracking all active, acknowledged orders and their production milestones.
        -   **`[orderId]/page.tsx`**: The detail page for a single order, showing its specific items and milestone progress.
    -   **`pending/`**: A page to view and acknowledge orders that have come from external sources (like a Google Sheet) and need to be brought into the main workflow.
    -   **`pms/`**: The "Production Management System" page, where the detailed, step-by-step stitching process is tracked.
    -   **`po-tracking/`**: A dashboard to follow up on Purchase Orders that have been placed with vendors.
    -   **`purchase/`**: The module for managing purchase requests for materials.
    -   **`reports/`**: The page for generating and viewing various business reports, such as sales performance and stock ledgers.
    -   **`users/`**: The "User Management" page, where admins can add, edit, and manage user accounts and their roles.
    -   **`visits/`**: A centralized dashboard for viewing all requested and approved customer visits.

### `src/components/`

This directory contains all the reusable React components.

-   **`ui/`**: Contains the low-level, reusable UI components from `shadcn/ui`, such as `Button`, `Card`, `Input`, `Table`, etc. These are the building blocks of the application's interface.
-   **`features/`**: Contains higher-level components that are specific to a particular feature or module of the application (e.g., `order-management`, `user-management`). These components often combine multiple `ui` components to create a complete feature.
-   **`shared/`**: Contains components that are used across multiple features, such as the main `AppShell.tsx` which defines the dashboard's navigation and layout.

### `src/context/`

-   **`AuthContext.tsx`**: A React Context that manages the application's authentication state. It handles user login, logout, and provides user information (like name and role) to all components wrapped within it.

### `src/hooks/`

-   **`useToast.ts`**: A custom hook for displaying "toast" notifications (small pop-up messages) to the user for actions like success, error, or warning.
-   **`use-mobile.tsx`**: A utility hook to detect if the application is being viewed on a mobile device, allowing for responsive UI adjustments.

### `src/lib/`

This directory contains utility functions, type definitions, and configuration files.

-   **`firebase.ts`**: Initializes the client-side Firebase connection.
-   **`firebase-admin.ts`**: Initializes the server-side Firebase Admin SDK, used for secure backend operations.
-   **`types.ts`**: Contains all the TypeScript type and interface definitions for the application's data structures (e.g., `Order`, `User`, `Customer`).
-   **`constants.ts`**: Defines application-wide constants, such as the configurations for milestones and process steps.
-   **`utils.ts`**: A utility file for helper functions, most notably the `cn` function for conditionally combining CSS class names.

### `src/ai/`

This directory contains all the code related to Generative AI functionality using Genkit.

-   **`genkit.ts`**: The main configuration file for Genkit, where plugins (like Google AI) are initialized.
-   **`flows/`**: A directory containing individual Genkit flows. Each flow is a self-contained AI agent that can be called from the application to perform a specific task (e.g., `generate-installation-schedule.ts`).

---

## `functions/`

A directory for Cloud Functions for Firebase. This is primarily used to set up the Next.js server to run in a serverless environment on Firebase.

---

This structure separates concerns, making the application easier to manage, maintain, and scale.
