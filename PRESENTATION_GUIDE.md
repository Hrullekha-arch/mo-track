
# MoTrack CRM: Presentation Guide

This guide provides a comprehensive walkthrough of the MoTrack application, designed to be used as a script or a set of talking points for a presentation to management or clients.

---

## 1. Introduction & Login

**Goal**: Introduce the app and show the role-based login system.

**Talking Points**:
- "Welcome to MoTrack, our all-in-one solution for managing operations from order creation to final installation."
- "The system has a secure, role-based login. Let's first log in as an **Admin** or **Employee** to see the main dashboard."
- *(Show the login screen, enter credentials, and log in to `/dashboard`)*.
- "You're greeted with a welcome message and the main dashboard, which acts as our mission control."

---

## 2. The Main Dashboard (`/dashboard`)

**Goal**: Explain the purpose of each module accessible from the home page.

**Talking Points**:
- "The home dashboard provides a clear overview of all major modules."
- **O2D (Order to Delivery)**: "This is where all new orders start. It's a pre-production workflow to ensure every detail is correct before manufacturing begins. You can see a badge here showing the number of active orders in this phase."
- **To Be Received**: "This section is for acknowledging orders coming from external sources, like our Google Sheets integration, to bring them into our system."
- **Orders Dashboard**: "This is the core of our tracking system, showing all active, acknowledged orders and their live progress."
- **Purchase**: "Here, we manage all purchase requests for materials needed for our orders, from initial request to vendor selection and placing the PO."
- **Inbound**: "Tracks all materials for which a Purchase Order has been confirmed. We can monitor the receiving process for each item here."
- **Details**: "This is our powerful reporting hub. It provides detailed, Excel-like table views for All Orders, O2D, Purchase, PO Tracking, and Inbound data, complete with filtering and export capabilities."
- **User Management**: "Admins can add, edit, and manage all user accounts and their specific roles and assignments."

---

## 3. The O2D (Order to Delivery) Workflow (`/dashboard/o2d`)

**Goal**: Demonstrate how a new order is created and progresses through the pre-production phase.

**Talking Points**:
1.  **Creating a New Order**:
    -   *(Navigate to the Orders Dashboard and click "New Order")*
    -   "Let's start by creating a new order. The system automatically assigns it to the correct CRM handler based on the salesman."
    -   *(Fill out the form for a new customer and select "Stitching + Installation" as the order type. Submit the form.)*
    -   "Once created, the order doesn't go to the main dashboard yet. It goes to the O2D page for verification."

2.  **Processing in O2D**:
    -   *(Navigate to the O2D page.)*
    -   "Here on the O2D page, we see our new order. This is a crucial step to ensure all prerequisites are met before production."
    -   "Each step, from receiving an advance payment to material selection and quotation, must be completed by the assigned role—Salesman, CRM, or Accounts."
    -   *(Show how a user can complete a few steps, explaining the overdue warnings and permission system.)*
    -   "When the final step is reached, the system asks to confirm the final `Order Type` before moving it to the main dashboard. This ensures the correct set of manufacturing milestones are assigned."
    -   *(Complete the final step and confirm the order type.)* "The order has now been acknowledged and moved to the main dashboard."

---

## 4. The Main Orders Dashboard (`/dashboard/orders`)

**Goal**: Showcase how to manage and track an active, acknowledged order.

**Talking Points**:
-   *(Navigate to the Orders Dashboard.)*
-   "Here, we see all active orders. The summary boxes at the top give us a quick count of orders by status, like 'Scheduled Today' or 'Ready for Delivery'."
-   "We can filter orders by customer, sales person, or installer to quickly find what we're looking for."
-   *(Find the order created in the previous step.)* "Here is the order we just moved from O2D."
-   **Milestone Progress**: "We can expand the order to see its detailed milestone progress. An employee in the production unit would mark steps like 'Fabric Allocated' and 'Stitching Done' as they are completed."
-   *(As an admin/employee, mark the first few milestones as complete until "Ready for Delivery".)*
-   **Assigning an Installer**: "Once the order is 'Ready for Delivery', we can assign an installer. This makes the task appear in the installer's mobile app."
-   *(Click "Assign", select an installer, and confirm.)*

---

## 5. The Purchase & Inbound Workflow

**Goal**: Explain how material procurement is handled.

**Talking Points**:
-   **Creating a Purchase Request**:
    -   *(Navigate to the Purchase page and click "New Purchase Request".)*
    -   "If an order requires new materials, we create a purchase request. We can specify multiple fabric or furniture items."
    -   *(Fill out and submit a request.)*
-   **Processing the Request**:
    -   "This request goes through its own approval workflow, from authorization and stock verification to selecting a vendor and placing the order."
-   **PO Tracking & Inbound**:
    -   *(Navigate to the Details page and show the PO Tracking and Inbound tabs.)*
    -   "Once a PO is placed, it appears in the 'PO Tracking' table. When materials arrive, they are processed through the 'Inbound' workflow."
    -   "Crucially, when all items for a deal are marked as received in Inbound, the 'Receiving and Handover' step in the PO tracking process is **automatically completed**, connecting our workflows."

---

## 6. The Installer's Mobile View (`/mobile`)

**Goal**: Demonstrate the field-first experience for installers.

**Talking Points**:
-   *(Log out and log back in as an **Installer**.)*
-   "Now, let's see the app from an installer's perspective. They get a simplified, mobile-first interface focused only on their assigned tasks."
-   *(Show the mobile dashboard with the assigned order.)*
-   **Updating Status on the Go**: "The installer can see the customer's details and can update the status of their assigned milestones, like 'Out for Delivery' and 'Installation Done'."
-   "When a milestone is updated, the system can capture their **geolocation** to verify their location, adding a layer of accountability."
-   *(Mark the final installation step as complete.)*
-   **Customer Feedback & OTP**: "Once the job is done, the installer asks the customer for feedback. To submit it, they must enter a **4-digit OTP** that was sent to the customer, ensuring the customer is present and approves the completion."
-   *(Show the feedback form, enter the OTP, and submit.)* "The order is now fully complete."

---

## 7. Customer-Facing Tracking (`/track`)

**Goal**: Show the simple, elegant tracking page for the end customer.

**Talking Points**:
-   *(Navigate to the `/track` page without logging in.)*
-   "Our customers also have a way to stay informed. They can visit our website and enter their unique tracking code."
-   *(Enter the tracking code of the order we've been following.)*
-   "They get a clean, simple view of their order's progress and key details. If their order is complete, they can also leave their own feedback directly on this page."

---

## 8. Admin & Reporting (`/dashboard/details` & `/dashboard/users`)

**Goal**: Briefly touch on the powerful admin capabilities.

**Talking Points**:
-   *(Log back in as an Admin.)*
-   **Details Page**: "The 'Details' page is an admin's best friend. It provides comprehensive, sortable, and filterable tables for every data point in the system. Most importantly, any view can be **exported to Excel** with a single click, making reporting seamless."
-   *(Show the All Orders table and click the 'Export' button.)*
-   **User Management**: "Finally, the User Management section allows admins to control who has access to the system. You can add new users, assign roles (like Admin, Employee, or Installer), and specify designations (like CRM or PC) to fine-tune permissions."

This concludes our tour of MoTrack. It's a powerful, end-to-end system designed to bring clarity, efficiency, and accountability to our entire operational workflow.
