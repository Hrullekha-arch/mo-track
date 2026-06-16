

# MoTrack Firestore Schema

This document outlines the main Firestore collections, their document structures, and the operations performed on them within the MoTrack application.

---

## `users`

Stores user accounts and their roles.

-   **Path**: `/users/{userId}`
-   **Operations**: Read (list, detail), Create, Update
-   **Structure**:
    ```typescript
    interface User {
      id: string; // Document ID, same as Firebase Auth UID
      name: string;
      email: string;
      role: 'admin' | 'employee' | 'installer' | 'salesman' | 'Accounts' | 'Hr' | 'PC';
      designation?: 'CRM' | 'Allocators' | 'PC'; // Only for 'employee' role
      salesmanCode?: string; // Only for 'salesman' role
    }
    ```

---

## `customers`

Stores all customer information. Each customer can have subcollections for their deals.

-   **Path**: `/customers/{customerId}`
-   **Operations**: Read (list, detail), Create, Update
-   **Structure**:
    ```typescript
    interface Customer {
      id: string; // Document ID
      name: string;
      mobileNo: string;
      email?: string;
      architect?: string;
      salesSupport?: string;
      landmark?: string;
      city?: string;
      state?: string;
      addressPinCode?: string;
      gstin?: string;
      panNo?: string;
      referenceName?: string;
      sourceOfCustomer?: string;
      pinCode?: string;
      createdAt: string; // ISO Date
      createdBy: string; // User name
    }
    ```

### Subcollection: `deals`

-   **Path**: `/customers/{customerId}/deals/{dealId}`
-   **Operations**: Read, Create, Update
-   **Structure**:
    ```typescript
    interface Deal {
      id: string; // Document ID
      dealId: string; // 4-digit numeric ID
      dealName: string;
      dealAmount: number;
      representativeId: string; // User ID of the salesman
      description: string;
      createdAt: string; // ISO Date
      products?: DealProduct[];
      advanceForMeasurement?: 'Yes' | 'No' | 'Old';
      isAcknowledged?: boolean; // True when O2D process is complete
    }
    ```

### Subcollection: `quotations`

-   **Path**: `/customers/{customerId}/deals/{dealId}/quotations/{quotationId}`
-   **Operations**: Read, Create, Update
-   **Structure**:
    ```typescript
    interface Quotation {
      id: string; // Document ID
      quotationNo: string;
      items: QuotationItem[];
      totalAmount: number;
      status: 'Pending Approval' | 'Approved' | 'Converted to Order';
      // ... and other quotation fields
    }
    ```

---

## `o2d`

Stores the state of the Order-to-Delivery pre-production workflow for each deal.

-   **Path**: `/o2d/{dealDocumentId}`
-   **Operations**: Create, Update, Read
-   **Structure**:
    ```typescript
    interface O2DProcess {
      id: string; // Document ID, same as the Deal's document ID
      dealId: string; // The 4-digit numeric deal ID
      dealName: string;
      customerId: string;
      customerName: string;
      salesPerson: string;
      milestones: O2DStatus[];
      createdAt: string; // ISO Date string of deal creation
      isAcknowledged: boolean; // Becomes true when the final O2D step is complete
    }
    ```

---

## `orders`

This is the main collection for tracking all customer orders from creation to completion.

-   **Path**: `/orders/{orderId}` (where `orderId` is typically `MOTRACK-` + `crmOrderNo`)
-   **Operations**: Read (list, detail), Create, Update, Delete
-   **Structure**:
    ```typescript
    interface Order {
      id: string;
      crmOrderNo: string;
      customerName: string;
      customerPhone: string;
      customerAddress: string;
      salesPerson: string; // Name of the salesman
      orderType: 'delivery' | 'stitching' | 'stitching+installation';
      milestones: Milestone[];
      pmsMilestones?: PmsStatus[];
      fabricDetails?: FabricDetail[];
      totalAmount?: number;
      status?: 'Pending Approval' | 'Approved';
      isAcknowledged: boolean; // true if created in-app or acknowledged
      assignedTo?: string; // Installer User ID
      handledByCrm?: string; // CRM User ID
      createdAt: string; // ISO Date
      otp?: string;
      // ... and other fields
    }
    ```

### Subcollection: `allocations`

-   **Path**: `/orders/{orderId}/allocations/{allocationId}`
-   **Operations**: Read, Create
-   **Structure**:
    ```typescript
    interface Allocation {
      stockId: string;
      itemName: string;
      quantityAllocated: number;
      lengths: number[];
      allocatedAt: string; // ISO Date
      allocatedBy: string; // User name
    }
    ```

---

## `purchaseRequests`

Tracks requests for materials needed for orders. This collection also holds the generated PO data.

-   **Path**: `/purchaseRequests/{dealId}`
-   **Operations**: Read, Create, Update
-   **Structure**:
    ```typescript
    interface PurchaseRequest {
      id: string; // Document ID, same as dealId
      dealId: string;
      customerName: string;
      status: 'Pending Approval' | 'Approved' | 'PO Generated' | 'Completed' | 'Cancelled';
      fabricDetails?: FabricDetail[]; // PO numbers are added to items within this array
      poMilestones?: PurchaseStatus[]; // Tracks the progress after a PO is generated
      // ... and other fields
    }
    ```

---

## `inbounds`

Tracks the receipt of materials from purchase orders.

-   **Path**: `/inbounds/{poNumber}`
-   **Operations**: Read, Create, Update
-   **Structure**:
    ```typescript
    interface InboundRequest {
      id: string; // Document ID, same as PO Number
      purchaseRequestId: string;
      dealId: string;
      status: 'Active' | 'Completed';
      items: InboundItem[];
      // ... and other fields
    }
    ```

---

## `invoices`

Stores final, generated invoices.

-   **Path**: `/invoices/{invoiceId}`
-   **Operations**: Create, Read
-   **Structure**:
    ```typescript
    interface Invoice {
      id: string;
      invoiceNo: string;
      orderId: string;
      tallyBillNo?: string;
      customer: {
        name: string;
        phone: string;
        address: string;
      };
      salesPerson: string;
      items: InvoiceBatchItem[];
      totals: {
        subTotal: number;
        totalDiscount: number;
        taxableValue: number;
        cgst: number;
        sgst: number;
        igst: number;
        roundOff: number;
        grandTotal: number;
      };
      createdAt: string; // ISO Date
      createdBy: string; // User name
    }
    ```

---

## `Cutting`

Stores cutting tasks generated from invoices.

-   **Path**: `/Cutting/{cuttingId}` (where `cuttingId` is usually the `invoiceId`)
-   **Operations**: Create, Read
-   **Structure**:
    ```typescript
    interface CuttingTask {
      id: string; 
      invoiceId: string;
      orderId: string;
      customerName: string;
      customerPhone: string;
      salesPerson: string;
      items: InvoiceBatchItem[];
      createdAt: string; // ISO Date string
      status: 'Pending' | 'In Progress' | 'Completed';
    }
    ```

---

## `stocks`

The main inventory collection.

-   **Path**: `/stocks/{bcn}` (where `bcn` is the barcode number)
-   **Operations**: Read, Update
-   **Structure**: The parent document mainly serves as a container. Key aggregated data is stored here.

    ```typescript
    interface Stock {
      id: string; // Same as bcn
      bcn: string;
      itemName: string;
      // Aggregated quantities
      quantity: number; // Total original qty from all rolls
      availableQty: number;
      reservedQty: number;
      cutQty: number;
      // ... other identifying fields like category, vendor, mrp
    }
    ```

### Subcollection: `lengths`

Stores individual rolls or pieces of a stock item.

-   **Path**: `/stocks/{bcn}/lengths/{lengthId}`
-   **Operations**: Create, Read, Update, Delete
-   **Structure**: Contains the detailed properties of a single roll.
    ```typescript
    interface StockLength {
        id: string; // e.g., "Length1", "Length (12.50 MTR)"
        bcn: string;
        itemName: string;
        quantity: number;     // Original length of this specific roll
        availableQty: number;
        reservedQty: number;
        cutQty: number;
        // ... and other detailed properties like mrp, serialNo, etc.
    }
    ```
    -   **`cutHistory` (Subcollection)**: Logs every cut made from this roll.
    -   **`cutRequests` (Subcollection)**: Stores pending cutting jobs for this roll.
    -   **`reservedQty` (Subcollection)**: Logs reservations made against this roll for specific orders.

---

## `taxDetails`

Stores tax information based on HSN code.

-   **Path**: `/taxDetails/{hsnCode}`
-   **Operations**: Create, Read, Update, Delete
-   **Structure**:
    ```typescript
    interface TaxDetail {
      id: string;      // Same as HSN Code
      hsnCode: string;
      gst: number;
      cgst: number;
      sgst: number;
      igst: number;
    }
    ```
