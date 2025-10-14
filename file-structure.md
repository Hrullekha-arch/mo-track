
# MoTrack Application File Structure

This document provides a high-level overview of the MoTrack application's file structure, explaining the purpose of each key directory and file.

---

## `/` (Root Directory)

This is the main project directory containing configuration files and top-level project information.

-   **`next.config.ts`**: Configuration file for the Next.js framework. It handles settings like Progressive Web App (PWA) configuration, image optimization rules, and build-time flags.
-   **`tailwind.config.ts`**: Configuration for the Tailwind CSS framework. This is where the application's design system (colors, spacing, fonts, etc.) is defined.
-   **`tsconfig.json`**: TypeScript configuration. It sets the rules for how TypeScript code is compiled and type-checked, ensuring code quality and consistency.
-   **`package.json`**: Lists the project's dependencies (libraries like React, Next.js, Firebase) and defines script commands (e.g., `npm run dev`, `npm run build`).
-   **`firebase.json`**: Configures Firebase services for deployment, primarily telling the Firebase CLI where to find Firestore rules and indexes.
-   **`firestore.rules`**: Defines the security rules for the Firestore database, controlling who can read, write, or delete data in each collection.
-   **`firestore.indexes.json`**: Specifies composite indexes needed for complex Firestore queries to ensure efficient database performance.
-   **`Documentation.md`**: The detailed, step-by-step guide to the application's entire business workflow.
-   **`.env`**: Stores secret environment variables, such as API keys and the Firebase Service Account Key, that should not be exposed in the source code.

---

## `src/app/`

The core of the application, built using the Next.js App Router. Each folder inside this directory typically corresponds to a URL path.

-   **`layout.tsx`**: The root layout for the entire application. It sets up the main HTML structure, including global context providers like `AuthProvider` for authentication and `ThemeProvider` for light/dark mode.
-   **`globals.css`**: Global stylesheet where the application's base theme (colors, fonts) and custom CSS variables are defined.
-   **`dashboard/`**: Contains all pages and components related to the main web application dashboard.
    -   `layout.tsx`: The layout specific to the dashboard, providing the main sidebar navigation and authentication checks.
    -   `page.tsx`: The main dashboard landing page.
    -   `[pageName]/page.tsx`: Each subfolder represents a page on the dashboard (e.g., `/dashboard/orders`, `/dashboard/customers`). The `page.tsx` file within it is the entry point for that page.
    -   `[pageName]/actions.ts`: Server-side functions (Next.js Server Actions) that handle data mutations like creating, updating, or deleting documents in Firestore for a specific page.
-   **`mobile/`**: Contains pages specifically designed for the installer's mobile view.
-   **`track/`**: The public-facing page where customers can track their order status.
-   **`scan/`**: The universal scanner page used for various barcode-scanning functionalities like verifying cuts or completing PMS steps.

---

## `src/components/`

This directory contains all the reusable React components that make up the application's user interface.

-   **`shared/`**: Components used across ઉત્પાદનmultiple parts of the application, such as the main `AppShell` (the dashboard layout).
-   **`ui/`**: General-purpose, low-level UI components provided by `shadcn/ui`, such as `Button.tsx`, `Card.tsx`, and `Input.tsx`.
-   **`features/`**: Higher-level components that encapsulate specific business logic or features. These are organized by domain.
    -   `customer/`: Components related to customer management (e.g., `NewContactDialog.tsx`).
    -   `order-management/`: Components for managing orders, creating quotations, and tracking progress (e.g., `OrdersTable.tsx`, `MilestoneProgress.tsx`).
    -   `inventory/`: Components for managing stock and viewing transaction history.
    -   `purchase/`: Components related to the purchasing workflow.
    -   `pms/`: Components for the Production Management System.
    -   `installer/`: Components for the installer's mobile interface.
    -   `tracking/`: The component used on the public order tracking page.

---

## `src/lib/`

A collection of utility files, constants, and helper functions used throughout the application.

-   **`firebase.ts`**: Initializes the **client-side** Firebase SDK, providing the `db` and `auth` objects used in client components.
-   **`firebase-admin.ts`**: Initializes the **server-side** Firebase Admin SDK, used in Server Actions for privileged database operations.
-   **`types.ts`**: Contains all the TypeScript type definitions for the application's data structures (e.g., `Order`, `Customer`, `User`).
-   **`constants.ts`**: Defines application-wide constants, such as the configuration for O2D and PMS process steps.
-   **`utils.ts`**: General utility functions, most notably the `cn` function for combining Tailwind CSS classes.

---

## `src/context/`

Contains React Context providers for managing global state.

-   **`AuthContext.tsx`**: Manages the application's authentication state, providing information about the currently logged-in user, their role, and functions for login/logout.

---

## `src/ai/`

This directory houses all the Generative AI functionalities powered by Genkit.

-   **`genkit.ts`**: Initializes and configures the core Genkit AI instance.
-   **`flows/`**: Contains individual files for each AI "flow" or agent. For example, `complete-pms-process.ts` defines the logic for an agent that can mark an entire production process as complete.
