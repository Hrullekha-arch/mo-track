"use server";
import { adminDb } from "@/lib/firebase-admin";
import { PurchaseRequest } from "@/lib/types";

export async function getPurchaseViewDetails(purchaseRequestId: string) {
  try {
    // ===============================
    // 1️⃣ VALIDATE INPUT
    // ===============================
    if (!purchaseRequestId || typeof purchaseRequestId !== 'string') {
      return { 
        success: false, 
        message: "Invalid purchase request ID provided." 
      };
    }

    console.log("🔍 Fetching purchase request:", purchaseRequestId);

    // ===============================
    // 2️⃣ FETCH PURCHASE REQUEST
    // ===============================
    const prRef = adminDb.collection("purchaseRequests").doc(purchaseRequestId);
    const prSnap = await prRef.get();
    
    if (!prSnap.exists) {
      console.warn("⚠️ Purchase request not found:", purchaseRequestId);
      return { 
        success: false, 
        message: "Purchase request not found." 
      };
    }

    const prData = prSnap.data();
    const pr = { 
      id: prSnap.id, 
      ...prData 
    } as PurchaseRequest;

    console.log("✅ Purchase request loaded:", pr.id);

    // ===============================
    // 3️⃣ RESOLVE ORDER ID WITH MULTIPLE FORMATS
    // ===============================
    const dealIdFromPR = String(pr.dealId || "").trim();
    
    if (!dealIdFromPR || dealIdFromPR === "undefined" || dealIdFromPR === "null") {
      console.warn("⚠️ No valid deal/order ID found in purchase request");
      return { 
        success: true, 
        data: { 
          purchaseRequest: pr, 
          customer: null, 
          deal: null,
          representative: null,
          order: null,
          quotations: [], 
          orders: [], 
          visits: [], 
          measurements: [], 
          receipts: [],
          vendors: {},
          fabricStockDetails: [],
          customerId: null,
          dealDocId: null,
        } 
      };
    }

    console.log("🔎 Order ID from PR:", dealIdFromPR);

    // ===============================
    // 4️⃣ FETCH ORDER (TRY MULTIPLE FORMATS)
    // ===============================
    let orderSnap = null;
    let orderIdVariants = [];

    // Generate possible order ID formats
    if (dealIdFromPR.startsWith("MOTRACK-")) {
      orderIdVariants = [
        dealIdFromPR,                                    // "MOTRACK-8149"
        dealIdFromPR.replace("MOTRACK-", "")            // "8149"
      ];
    } else {
      orderIdVariants = [
        dealIdFromPR,                                    // "8149"
        `MOTRACK-${dealIdFromPR}`                       // "MOTRACK-8149"
      ];
    }

    console.log("🔍 Trying order ID variants:", orderIdVariants);

    // Try each variant
    for (const orderId of orderIdVariants) {
      const orderRef = adminDb.collection("orders").doc(orderId);
      const snap = await orderRef.get();
      
      if (snap.exists) {
        orderSnap = snap;
        console.log("✅ Order found with ID:", orderId);
        break;
      }
    }

    if (!orderSnap) {
      console.warn("⚠️ Order not found with any variant:", orderIdVariants);
      return { 
        success: true, 
        data: { 
          purchaseRequest: pr, 
          customer: null, 
          deal: null,
          representative: null,
          order: null,
          quotations: [], 
          orders: [], 
          visits: [], 
          measurements: [], 
          receipts: [],
          vendors: {},
          fabricStockDetails: [],
          customerId: null,
          dealDocId: null,
        } 
      };
    }

    const orderData = orderSnap.data();
    console.log("✅ Order loaded:", orderSnap.id);

    // Extract the REAL numeric dealId from order
    const numericDealId = String(orderData?.dealId || "").trim();
    const customerId = orderData?.customerId;

    console.log("🎯 Real dealId from order:", numericDealId);
    console.log("👤 CustomerId:", customerId);

    if (!numericDealId || !customerId) {
      console.warn("⚠️ No dealId or customerId found in order document");
      return {
        success: true,
        data: {
          purchaseRequest: pr,
          customer: null,
          deal: null,
          representative: null,
          order: { id: orderSnap.id, ...orderData },
          quotations: [],
          orders: [],
          visits: [],
          measurements: [],
          receipts: [],
          vendors: {},
          fabricStockDetails: [],
          customerId: customerId || null,
          dealDocId: null,
        }
      };
    }

    // ===============================
    // 5️⃣ FETCH DEAL DOCUMENT
    // ===============================
    console.log("🔍 Searching for deal with numeric dealId:", numericDealId);
    
    const dealCg = await adminDb
      .collectionGroup("deals")
      .where("dealId", "==", numericDealId)
      .limit(1)
      .get();

    if (dealCg.empty) {
      console.warn("⚠️ Deal not found for dealId:", numericDealId);
      return {
        success: true,
        data: {
          purchaseRequest: pr,
          customer: null,
          deal: null,
          representative: null,
          order: { id: orderSnap.id, ...orderData },
          quotations: [],
          orders: [],
          visits: [],
          measurements: [],
          receipts: [],
          vendors: {},
          fabricStockDetails: [],
          customerId: customerId,
          dealDocId: null,
        }
      };
    }

    const dealDoc = dealCg.docs[0];
    const dealRef = dealDoc.ref;
    const customerRef = dealRef.parent.parent;

    if (!customerRef) {
      console.error("❌ Customer reference is null");
      return {
        success: false,
        message: "Invalid deal structure - cannot resolve customer."
      };
    }

    const dealData = dealDoc.data();
    const deal = { 
      id: dealDoc.id, 
      ...dealData 
    };

    console.log("✅ Deal found:", dealRef.path);
    console.log("📍 Customer ref:", customerRef.path);

    // ===============================
    // 6️⃣ FETCH DEAL REPRESENTATIVE (SALESMAN)
    // ===============================
    let representative = null;
    const representativeId = dealData?.representativeId || dealData?.salesmanId;
    
    if (representativeId) {
      try {
        console.log("👤 Fetching representative:", representativeId);
        const repRef = adminDb.collection('users').doc(representativeId);
        const repSnap = await repRef.get();
        
        if (repSnap.exists) {
          const repData = repSnap.data();
          representative = {
            id: repSnap.id,
            name: repData?.name || "N/A",
            email: repData?.email || null,
            phone: repData?.phone || null,
            role: repData?.role || null,
          };
          console.log("✅ Representative loaded:", representative.name);
        } else {
          console.warn("⚠️ Representative not found:", representativeId);
        }
      } catch (error) {
        console.error("❌ Error fetching representative:", error);
      }
    } else {
      console.warn("⚠️ No representativeId found in deal");
    }

    // ===============================
    // 7️⃣ FETCH ALL RELATED DATA
    // ===============================
    const [
      customerSnap, 
      quotationsSnap, 
      ordersSnap, 
      visitsSnap, 
      measurementsSnap, 
      receiptsSnap
    ] = await Promise.allSettled([
      customerRef.get(),
      dealRef.collection("quotations")
        .orderBy("createdAt", "desc")
        .limit(20)
        .get(),
      dealRef.collection("orders")
        .orderBy("orderDate", "desc")
        .limit(20)
        .get(),
      dealRef.collection("visits")
        .orderBy("createdAt", "desc")
        .limit(20)
        .get(),
      dealRef.collection("measurements")
        .orderBy("createdAt", "desc")
        .limit(20)
        .get(),
      dealRef.collection("receipts")
        .orderBy("date", "desc")
        .limit(20)
        .get(),
    ]);

    // ===============================
    // 8️⃣ PROCESS CUSTOMER DATA
    // ===============================
    let customer = null;
    if (customerSnap.status === "fulfilled" && customerSnap.value?.exists) {
      const custData = customerSnap.value.data();
      customer = { 
        id: customerSnap.value.id,
        name: custData?.name || "N/A",
        phone: custData?.mobileNo || custData?.phone || "N/A",
        email: custData?.email || null,
        city: custData?.city || "N/A",
        state: custData?.state || null,
        address: custData?.address || custData?.addressPinCode || "N/A",
        pincode: custData?.pinCode || custData?.addressPinCode || null,
        ...custData
      };
      console.log("✅ Customer loaded:", customer.name);
    } else {
      console.warn("⚠️ Customer data not loaded");
    }

    // ===============================
    // 9️⃣ FETCH DETAILED STOCK INFO (SAME AS YOUR PATTERN!)
    // ===============================
    const fabricStockDetails: any[] = [];
    const vendors: Record<string, any> = {};
    const fabricDetails = pr.fabricDetails || [];

    console.log(`🔍 Fetching detailed stock info for ${fabricDetails.length} fabrics...`);

    for (const fabric of fabricDetails) {
      const bcn = fabric.fabricName;
      if (!bcn) continue;

      // ✅ 1) Find parent stock doc by BCN
      const stockParentSnap = await adminDb
        .collection("stocks")
        .where("bcn", "==", bcn)
        .limit(1)
        .get();

      const stockParentDoc = stockParentSnap.docs[0];
      const stockParent = stockParentDoc?.data() || null;

      let bestLengthDocData: any = null;
      let bestProductId: string | undefined = undefined;

      // ✅ 2) Fetch lengths subcollection
      if (stockParentDoc) {
        const lengthsSnap = await stockParentDoc.ref.collection("lengths").get();

        if (!lengthsSnap.empty) {
          const docs = lengthsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          docs.sort((a: any, b: any) => {
            const aAvail = Number(a.availableQty ?? a.quantity ?? 0);
            const bAvail = Number(b.availableQty ?? b.quantity ?? 0);
            return bAvail - aAvail;
          });

          bestLengthDocData = docs[0];
          bestProductId = String(bestLengthDocData.productId || bestLengthDocData.id || "");
        }
      }

      // ✅ 3) Merge parent + lengths doc
      const detailedStockItem = {
        ...(stockParent || {}),
        ...(bestLengthDocData || {}),
        stockDocId: stockParentDoc?.id || null,
        productId: bestProductId || null,
      };

      // Extract vendor info
      const vendorName = fabric.vendorName || 
                        detailedStockItem.vendorName || 
                        detailedStockItem.supplierCompanyName || 
                        "N/A";
      
      const vendorId = fabric.vendorId || 
                      detailedStockItem.vendorId || 
                      detailedStockItem.supplierId;

      // Store vendor info
      if (vendorId && !vendors[vendorId]) {
        vendors[vendorId] = {
          id: vendorId,
          name: vendorName,
        };
      }

      // Store detailed stock info for this fabric
      fabricStockDetails.push({
        fabricName: bcn,
        itemName: detailedStockItem.itemName || "N/A",
        serialNo: detailedStockItem.supplierCollectionCode || "N/A",
        hsnCode: detailedStockItem.hsnCode || "N/A",
        mrp: Number(detailedStockItem.mrp || 0),
        vendorName: vendorName,
        vendorId: vendorId || null,
        category: detailedStockItem.category || detailedStockItem.categoryGroup || "N/A",
        availableQty: Number(detailedStockItem.availableQty ?? detailedStockItem.quantity ?? 0),
        neededQty: parseFloat(fabric.quantity),
        poNumber: fabric.poNumber || null,
        expectedDeliveryDate: fabric.expectedDeliveryDate || null,
        stockDocId: stockParentDoc?.id || null,
        productId: bestProductId || null,
        detailedStockItem,
      });
    }

    console.log(`✅ Fetched detailed stock info for ${fabricStockDetails.length} fabrics`);
    console.log(`✅ Found ${Object.keys(vendors).length} unique vendors`);

    // ===============================
    // 🔟 FETCH ADDITIONAL VENDOR DETAILS FROM VENDORS COLLECTION
    // ===============================
    const vendorIds = Object.keys(vendors);
    
    if (vendorIds.length > 0) {
      console.log("🏢 Enriching vendor details from vendors collection...");
      
      const vendorPromises = vendorIds.map(async (vendorId) => {
        try {
          const vendorRef = adminDb.collection('vendors').doc(vendorId);
          const vendorSnap = await vendorRef.get();
          
          if (vendorSnap.exists) {
            const vData = vendorSnap.data();
            vendors[vendorId] = {
              ...vendors[vendorId],
              ...vData,
              id: vendorSnap.id,
              name: vData?.name || vData?.vendorName || vendors[vendorId].name,
            };
          }
        } catch (error) {
          console.error(`Error enriching vendor ${vendorId}:`, error);
        }
      });

      await Promise.allSettled(vendorPromises);
      console.log("✅ Vendor details enriched");
    }

    // ===============================
    // 1️⃣1️⃣ PROCESS OTHER COLLECTIONS
    // ===============================
    
    let quotations = [];
    if (quotationsSnap.status === "fulfilled" && quotationsSnap.value) {
      quotations = quotationsSnap.value.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log(`✅ Loaded ${quotations.length} quotations`);
    }

    let orders = [];
    if (ordersSnap.status === "fulfilled" && ordersSnap.value) {
      orders = ordersSnap.value.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log(`✅ Loaded ${orders.length} deal orders`);
    }

    let visits = [];
    if (visitsSnap.status === "fulfilled" && visitsSnap.value) {
      visits = visitsSnap.value.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log(`✅ Loaded ${visits.length} visits`);
    }

    let measurements = [];
    if (measurementsSnap.status === "fulfilled" && measurementsSnap.value) {
      measurements = measurementsSnap.value.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          typeOf: data.typeOf || "-",
          doerName: data.doerName || data.createdBy || "-",
          createdBy: data.createdBy || "-",
          createdAt: data.createdAt || null,
          entries: data.entries || [],
          rooms: data.rooms || [],
          selectionId: data.selectionId || null,
          status: data.status || "unknown",
          flags: data.flags || [],
          pdfUrl: data.pdfUrl || null
        };
      });
      console.log(`✅ Loaded ${measurements.length} measurements`);
    }

    let receipts = [];
    if (receiptsSnap.status === "fulfilled" && receiptsSnap.value) {
      receipts = receiptsSnap.value.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log(`✅ Loaded ${receipts.length} receipts`);
    }

    // ===============================
    // 1️⃣2️⃣ SERIALIZE & RETURN
    // ===============================
    const result = {
      success: true,
      data: {
        purchaseRequest: JSON.parse(JSON.stringify(pr)),
        customer: customer ? JSON.parse(JSON.stringify(customer)) : null,
        deal: JSON.parse(JSON.stringify(deal)),
        representative: representative ? JSON.parse(JSON.stringify(representative)) : null,
        order: JSON.parse(JSON.stringify({ id: orderSnap.id, ...orderData })),
        vendors: JSON.parse(JSON.stringify(vendors)),
        fabricStockDetails: JSON.parse(JSON.stringify(fabricStockDetails)),
        quotations: JSON.parse(JSON.stringify(quotations)),
        orders: JSON.parse(JSON.stringify(orders)),
        visits: JSON.parse(JSON.stringify(visits)),
        measurements: JSON.parse(JSON.stringify(measurements)),
        receipts: JSON.parse(JSON.stringify(receipts)),
        customerId: customer?.id || customerId || null,
        dealDocId: dealDoc.id,
      },
    };

    console.log("🎉 getPurchaseViewDetails completed successfully");
    console.log("📊 Summary:", {
      orderIdUsed: orderSnap.id,
      dealId: numericDealId,
      customer: customer?.name || "N/A",
      representative: representative?.name || "N/A",
      vendors: Object.keys(vendors).length,
      fabricsWithStockDetails: fabricStockDetails.length,
    });

    return result;

  } catch (e: any) {
    console.error("❌ getPurchaseViewDetails CRITICAL ERROR:", e);
    console.error("Stack:", e.stack);
    
    return { 
      success: false, 
      message: e.message || "Failed to load purchase details.",
      error: process.env.NODE_ENV === 'development' ? e.stack : undefined
    };
  }
}
