# MoTrack Application Workflow Documentation

This document provides a step-by-step guide to the complete operational workflow within the MoTrack application, from initial customer contact to final order completion.

---

## Step 1: Customer and Deal Creation

The entire process begins with a customer.

1.  **Navigate to Customers**: From the main dashboard, go to the **Customers** section.
2.  **Create New Contact**: Use the "New Contact" button to add a new customer to the system. Fill in their essential details like name, mobile number, and address.
3.  **Create a New Deal**: Once a customer is created, you will be taken to their details page. Here, you can create a "New Deal" which represents a potential sale or project for that customer. Give the deal a name and an estimated amount.

---

## Step 2: CRM Activity & Pre-Sales

This phase involves all activities before a formal order is placed.

1.  **Open Deal Activity Tracker**: Navigate to the specific deal you created for the customer. This opens the "CRM Activity Tracker" page.
2.  **Log Visits & Measurements**:
    *   Use the **Visits** tab to schedule and log site visits for measurements or client meetings.
    *   Use the **Measurement** tab to record detailed measurements taken at the site.
3.  **Add Products (CPD)**:
    *   Go to the **CPD (Customer Product Details)** tab.
    *   Here, you can add all the specific items (fabrics, materials) that the customer is interested in for this deal. This acts as a master list of potential products.
4.  **Generate a Quotation**:
    *   From the **CPD** tab, select the items the customer wants to move forward with and click **"Convert to Quotation"**.
    *   This opens a dialog where you can finalize quantities, rates, and discounts before creating an official quotation document.

---

## Step 3: Quotation & Order Approval

Before an order can be processed, it must be officially approved.

1.  **Quotation Approval**: The newly created quotation will automatically appear in the **Approvals** section under the "Approve Quotations" tab. An authorized user (e.g., Accounts or Admin) must review and approve it.
2.  **Convert to Sales Order**: Once the quotation is approved, it can be converted into a Sales Order. This can be done from two places:
    *   The deal's **Quotations** tab.
    *   The **Invoice > New Invoice** page.
3.  **Order Approval**: Creating the Sales Order automatically generates a main order document and sends it to the "Approve Orders" tab in the **Approvals** section. It must be approved here before it enters the production pipeline.

---

## Step 4: O2D (Order-to-Delivery) Process

After approval, the order enters the O2D (Order-to-Delivery) workflow, which is a pre-production checklist.

1.  **Navigate to O2D**: The order will now appear on the **O2D** dashboard.
2.  **Complete Pre-Production Steps**: The O2D timeline tracks critical pre-production milestones:
    *   **Advance Payment**: Confirming the initial payment has been received.
    *   **Purchase Material Receiving**: The system checks if required materials are in stock. If not, it triggers a Purchase Request. This step is completed once all materials are in-house.
    *   **Production/Stitching**: This step is automatically completed when the main "Stitching Done" milestone is marked in the PMS or main order view.
    *   **Balance Payment Follow-up & Confirmation**: Tracking the final payment.
    *   **Scheduling**: Scheduling the final delivery or installation.
3.  **Order Acknowledgement**: Once the final O2D step ("Installation Done") is completed, the order is considered fully acknowledged and transitions to active order management.

---

## Step 5: Production & Allocation (The Main Dashboard)

The order is now live and managed from the main **Orders** dashboard.

1.  **Stock Allocation**:
    *   Find the order on the dashboard.
    *   For each item in the order, use the **"Allocate"** button to reserve the required quantity from available stock rolls.
2.  **Invoice Generation**:
    *   Once stock is allocated, the item moves to the **Invoice** section.
    *   Here, you can generate an official invoice, which also creates a cutting task.
3.  **Cutting & PMS (Production Management System)**:
    *   The **Cutting** department receives the task. They scan the barcode of the roll to be cut to verify it.
    *   The order then moves through the **PMS (Production Management System)**, which tracks each stage of stitching and finishing.
    *   Marking the final PMS step as complete automatically updates the main order's "Stitching Done" milestone.

---

## Step 6: Delivery & Installation

The final phase of fulfilling the customer's order.

1.  **Assign Installer**: Once the order is "Ready for Delivery", an admin or PC can assign an installer from the main **Orders** dashboard.
2.  **Installer's Mobile View**: The assigned order appears in the installer's mobile app view.
3.  **On-Site Updates**: The installer updates the status on-site:
    *   Marks the order as "Out for Delivery/Installation" when they begin their journey.
    *   Marks "Installation Done" upon completion.
4.  **Feedback & OTP**: After the job is done, the installer collects feedback (a star rating and remarks) from the customer and confirms it by entering a 4-digit OTP that was sent to the customer.

This completes the lifecycle of an order in the MoTrack system.