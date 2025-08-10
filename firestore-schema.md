
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
      role: 'admin' | 'employee' | 'installer' | 'salesman' | 'Accounts' | 'Hr';
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
      o2dMilestones?: O2DStatus[];
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

Tracks requests for materials needed for orders.

-   **Path**: `/purchaseRequests/{dealId}`
-   **Operations**: Read, Create, Update
-   **Structure**:
    ```typescript
    interface PurchaseRequest {
      id: string; // Document ID, same as dealId
      dealId: string;
      customerName: string;
      status: 'Pending Approval' | 'Approved' | 'PO Generated' | 'Completed' | 'Cancelled';
      fabricDetails?: FabricDetail[];
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

## `stocks`

The main inventory collection.

-   **Path**: `/stocks/{stockId}` (where `stockId` is a sanitized BCN)
-   **Operations**: Read, Update
-   **Structure**:
    ```typescript
    interface Stock {
      id: string;
      bcn?: string;
      itemName: string;
      quantity: number;
      // ... and other inventory fields
    }
    ```

### Subcollection: `stockAdded` & `stockSold`

-   **Path**: `/stocks/{stockId}/stockAdded/{transactionId}` or `/stocks/{stockId}/stockSold/{transactionId}`
-   **Operations**: Read, Create, Delete
-   **Structure**:
    ```typescript
    interface StockTransaction {
      id: string;
      stockId: string;
      type: 'addition' | 'deduction';
      quantityChange: number;
      poNumber?: string; // for additions
      orderId?: string; // for deductions
      createdAt: string; // ISO Date
      createdBy: string; // User name
    }
    ```
