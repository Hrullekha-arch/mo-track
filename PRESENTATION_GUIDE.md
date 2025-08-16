
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

## 2. Customer & Deal Creation

**Goal**: Show how to create a new customer and a new deal associated with them.

**Talking Points**:
1.  **Navigating to Customers**:
    -   *(From the main dashboard, navigate to the "Customers" module.)*
    -   "Everything starts with our customers. The customer module is where we manage all our client information."
2.  **Creating a New Customer**:
    -   *(Show the customer search page. Click "New Contact".)*
    -   "We can search for existing customers or, as we'll do now, add a new one. We capture all essential details right from the start."
    -   *(Fill out and save the new customer form.)*
3.  **Creating a New Deal**:
    -   *(After saving, you are taken to the customer's detail page. Click "New Deal".)*
    -   "Once a customer is created, we can create 'Deals' for them. A deal represents a potential sale or project, like new curtains for a living room."
    -   *(Fill out the new deal form, including name, amount, and salesman. Submit.)*
    -   "Creating a deal automatically kicks off two processes: it creates the deal page for CRM activities and simultaneously creates a corresponding card in the **O2D (Order to Delivery)** module for pre-production tracking."

---

## 3. The Deal Activity Page & Quoting

**Goal**: Demonstrate how products are added to a deal and converted into a quotation.

**Talking Points**:
1.  **The Activity Hub**:
    -   *(You are now on the Deal Activity page for the newly created deal.)*
    -   "This is the central hub for managing this specific deal. We have tabs for adding products, creating customer product details (CPDs), logging visits, and more."
2.  **Adding Products**:
    -   *(Navigate to the "Products" tab.)*
    -   "Here, the sales team can add all the required products for the deal, like fabrics, rods, and accessories, specifying quantities for each."
    -   *(Add a few products to the list.)*
3.  **Creating a Quotation from Products**:
    -   "Once the products are added, we can select them and directly convert them into a formal quotation to send to the customer."
    -   *(Select the added products and click "Convert to Quotation".)*
    -   "This opens the quotation dialog, pre-filled with our items. We can adjust rates and add VAS charges before finalizing."
    -   *(Finalize and save the quotation.)* "The quotation is now created and sent for approval."
4.  **Alternative: Creating a CPD**:
    -   *(Navigate to the "CPD" tab.)*
    -   "For more complex orders, we can first create a Customer Product Detail sheet. This is a highly detailed document capturing every specific requirement, room by room."
    -   "Once a CPD is saved, it appears in a history table, and from there, it can **also be converted into a quotation** with a single click, ensuring accuracy for complex jobs."

---

## 4. The O2D (Order to Delivery) Workflow

**Goal**: Explain the pre-production checklist and how a deal becomes an acknowledged order.

**Talking Points**:
1.  **The O2D Page**:
    -   *(Navigate to the O2D page from the main dashboard.)*
    -   "Remember, when we created the deal, an O2D card was also made. Here it is. O2D is our pre-production checklist to ensure every prerequisite is met before manufacturing begins."
2.  **Completing Milestones**:
    -   "Each step, from receiving an advance payment to completing measurements and getting quotation approval, must be completed by the assigned role—Salesman, CRM, or Accounts."
    -   *(Show how a user can complete a few steps.)* "The system tracks each step. If a Purchase Request is needed for materials, the 'Material Receiving' step will only be automatically completed when the Purchase workflow is finished."
3.  **Acknowledging the Order**:
    -   "When the final O2D step is done, the system asks for a final confirmation of the `Order Type` (e.g., Stitching + Installation). This ensures the correct set of manufacturing milestones are assigned."
    -   *(Complete the final step and confirm the order type.)* "The order has now been **acknowledged** and is moved from O2D to the main **Orders Dashboard**, officially entering the production pipeline."

---

## 5. The Main Orders Dashboard & Production

**Goal**: Showcase how to manage and track an active, acknowledged order.

**Talking Points**:
-   *(Navigate to the Orders Dashboard.)*
-   "Here, we see all active, acknowledged orders. An employee in the production unit would now take over."
-   **Milestone Progress**: "We can expand the order to see its detailed production milestones. They would mark steps like 'Fabric Allocated' and 'Stitching Done' as they are completed."
-   *(As an admin/employee, mark the first few milestones as complete.)*
-   **Assigning an Installer**: "Once the order is 'Ready for Delivery', we can assign an installer. This action makes the task instantly appear in the installer's mobile app."
-   *(Click "Assign", select an installer, and confirm.)*

---

## 6. The Installer's Mobile View

**Goal**: Demonstrate the field-first experience for installers.

**Talking Points**:
-   *(Log out and log back in as an **Installer**.)*
-   "Now, let's see the app from an installer's perspective. They get a simplified, mobile-first interface focused only on their assigned tasks, including both **installation orders** and **measurement visits**."
-   **Updating Status on the Go**: "The installer can see the customer's details and update the status of their assigned milestones, like 'Out for Delivery' and 'Installation Done'."
-   **Completing a Measurement Visit**: "If it's a measurement visit, they can open the measurement form, input all the details, attach photos, and submit everything directly from the field."
-   **Completing an Installation**: *(Mark the final installation step as complete.)* "Once the job is done, the installer asks the customer for feedback. To submit it, they must enter a **4-digit OTP** that was sent to the customer, ensuring the customer is present and approves the completion."

---

## 7. Customer-Facing Tracking

**Goal**: Show the simple, elegant tracking page for the end customer.

**Talking Points**:
-   *(Navigate to the `/track` page without logging in.)*
-   "Our customers also have a way to stay informed. They can visit our website and enter their unique tracking code."
-   *(Enter the tracking code of the order we've been following.)*
-   "They get a clean, simple view of their order's progress and key details. If their order is complete, they can also leave their own feedback directly on this page."

This concludes our tour of MoTrack. It's a powerful, end-to-end system designed to bring clarity, efficiency, and accountability to our entire operational workflow.
