

'use server'

import { adminDb } from '@/lib/firebase-admin';
import { Deal, DealProduct, Quotation, DealOrder, DealVisit, DealMeasurement, DeliveryInstallationItem, Cpd, Dimension, AdvanceDetail, OrderType, Order, O2DStatus, MeasurementEntry, O2DProcess, Selection, Stock, Receipt } from '@/lib/types';
import { FormValues as QuotationFormValues } from '@/components/features/order-management/CreateQuotationDialog';

import { getMilestonesForOrder } from '@/lib/constants';
import { FieldValue } from 'firebase-admin/firestore';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { firebase } from 'googleapis/build/src/apis/firebase';
import { db } from '@/lib/firebase';
import { firestore } from 'firebase-admin';
import { VisitFormValues } from '@/components/features/customer/VisitForm';
import { CpdFormValues } from '@/components/features/customer/CpdForm';


// This function sends an SMS using the Fast2SMS API.
async function sendVisitSms(customerPhone: string, message: string) {
    // This is a placeholder. For a real app, you'd use a WhatsApp API provider.
    const whatsappLink = `https://wa.me/${customerPhone}?text=${encodeURIComponent(message)}`;
    console.log(`Generated WhatsApp link: ${whatsappLink}`);
    // In a real implementation, you would return this link or use a service to send it.
    return { success: true, message: "WhatsApp link generated." , link: whatsappLink};
}

export async function uploadFileToDriveAction(
  fileName: string,
  mimeType: string,
  base64Data: string
): Promise<string> {
  const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!FOLDER_ID) {
    throw new Error('Google Drive folder ID is not configured in environment variables.');
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error('The FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.');
  }
  const credentials = JSON.parse(serviceAccountKey);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });
  const fileBuffer = Buffer.from(base64Data, 'base64');
  const media = {
    mimeType: mimeType,
    body: Readable.from(fileBuffer),
  };

  try {
    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [FOLDER_ID],
      },
      media: media,
      supportsAllDrives: true,
      fields: 'id, webViewLink',
    });

    if (!file.data.id || !file.data.webViewLink) {
        throw new Error("File ID or link not returned from Google Drive API.");
    }
    
    // Make file publicly readable
    await drive.permissions.create({
        fileId: file.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone'
        },
        supportsAllDrives: true,
    });
    
    // The webViewLink is the user-facing URL. For direct embedding/access, we might need webContentLink.
    return file.data.webViewLink;

  } catch (error: any) {
    console.error("Google Drive API Error:", error.response?.data?.error || error.message);
    const specificError = error.response?.data?.error?.message || error.message;
    throw new Error(`Failed to upload file to Google Drive. API Error: ${specificError}`);
  }
}

export async function getDealById(customerId: string, dealId: string): Promise<Deal | null> {
    try {
        const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
        const docSnap = await dealRef.get();

        if (docSnap.exists) {
            const dealData = { id: docSnap.id, ...docSnap.data() } as Deal;
            // Firestore data is not directly serializable, so we need to convert it
            return JSON.parse(JSON.stringify(dealData));
        }
        return null;
    } catch (error) {
        console.error(`Error fetching deal ${dealId} for customer ${customerId}:`, error);
        return null;
    }
}

export async function updateDealProducts(customerId: string, dealId: string, products: DealProduct[]): Promise<{ success: boolean; message: string }> {
    try {
        const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
        
        // Firestore cannot store `undefined` values from the form, so we clean the products array.
        const cleanedProducts = products.map(p => 
            Object.fromEntries(Object.entries(p).filter(([_, v]) => v !== undefined))
        );

        await dealRef.update({ products: cleanedProducts });

        return { success: true, message: 'Products updated successfully.' };
    } catch (error) {
        console.error(`Error updating products for deal ${dealId}:`, error);
        return { success: false, message: 'Failed to update products.' };
    }
}


type QuotationFormWithMeta = QuotationFormValues & { createdBy?: string };

export async function createQuotationAction(customerId: string, dealId: string, values: QuotationFormWithMeta, totalAmount: number): Promise<{ success: boolean; message: string, quotationId?: string, quotation?: Quotation }> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    
    // Generate a new quotation ID
    const quotationRef = dealRef.collection('quotations').doc();

    const newQuotation: Quotation = {
        id: quotationRef.id,
        quotationNo: Math.floor(1000 + Math.random() * 9000).toString(),
        ...values,
        createdAt: new Date().toISOString(),
        status: 'approved', // Initially pending
        totalAmount: totalAmount,
        cpdId: values.selectedCpdId || "No CPD ID",
    };
    
    // Automation: Mark Quotation Making (4) as complete in O2D
    const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
    const o2dProcessDoc = await o2dProcessRef.get();
    const batch = adminDb.batch();

    batch.set(quotationRef, newQuotation);

    if (o2dProcessDoc.exists) {
        const quotationStepId = 4; // Corresponds to "Quotation Making"
        const existingMilestones = (o2dProcessDoc.data()?.milestones || []) as O2DStatus[];
        
        // Avoid adding duplicate milestones
        if (!existingMilestones.some(m => m.stepId === quotationStepId)) {
            const newMilestone: O2DStatus = {
                stepId: quotationStepId,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: values.createdBy || 'System',
                remarks: `Quotation #${newQuotation.quotationNo} created.`,
                selection: 'Done'
            };
            batch.update(o2dProcessRef, {
                milestones: FieldValue.arrayUnion(newMilestone)
            });
        }
    }
    
    await batch.commit();

    return { 
        success: true, 
        message: 'Quotation created successfully!', 
        quotationId: quotationRef.id,
        quotation: JSON.parse(JSON.stringify(newQuotation))
    };

  } catch (error: any) {
    console.error("Error creating quotation:", error);
    return { success: false, message: `Failed to create quotation: ${error.message}` };
  }
}

export async function createDealOrderAction(
  customerId: string,
  dealId: string,
  quotation: Quotation,
  creator: { id: string; name: string },
  orderType: OrderType
): Promise<{ success: boolean; message: string; order?: Order }> {
  try {
    const customerRef = adminDb.collection('customers').doc(customerId);
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const quotationRef = dealRef.collection('quotations').doc(quotation.id);

    const [customerSnap, dealSnap, currentQuotationSnap] = await Promise.all([
      customerRef.get(),
      dealRef.get(),
      quotationRef.get()
    ]);

    if (currentQuotationSnap.exists && currentQuotationSnap.data()?.status === 'Converted to Order') {
      return { success: false, message: 'This quotation has already been converted to an order.' };
    }

    if (!customerSnap.exists) {
        return { success: false, message: 'Customer not found.' };
    }
    if (!dealSnap.exists) {
        return { success: false, message: 'Deal not found.' };
    }

    const customerData = customerSnap.data() as any;
    const dealData = dealSnap.data() as Deal;

    let salesmanName = 'N/A';
    if (dealData.representativeId) {
        const salesmanRef = adminDb.collection('users').doc(dealData.representativeId);
        const salesmanSnap = await salesmanRef.get();
        if (salesmanSnap.exists) {
            salesmanName = salesmanSnap.data()?.name || 'N/A';
        }
    }

    const batch = adminDb.batch();
    
    const dealOrdersRef = dealRef.collection('orders');
    const newDealOrderRef = dealOrdersRef.doc();

    const orderId = `MOTRACK-${quotation.quotationNo}`;
    const newOrderRef = adminDb.collection('orders').doc(orderId);

    const allFabricDetails = quotation.items.map(item => ({
      fabricName: item.collectionBrand,
      quantity: String(item.quantity),
      rate: item.rate || 0,
      discountPercent: item.discountPercent || 0,
    }));
    
    const initialMilestones = getMilestonesForOrder(orderType);
    const firstMilestone = initialMilestones.find(m => m.id === 1);
    if (firstMilestone) {
        firstMilestone.completed = true;
        firstMilestone.completedAt = new Date().toISOString();
        firstMilestone.completedBy = creator.name;
    }

    const newOrder: Order = {
      id: orderId,
      crmOrderNo: quotation.quotationNo,
      customerName: quotation.customerName,
      customerPhone: customerData.mobileNo || '',
      customerAddress: customerData.addressPinCode || `${customerData.city}, ${customerData.state}`,
      salesPerson: salesmanName,
      orderType: orderType,
      milestones: initialMilestones,
      createdAt: new Date().toISOString(),
      isAcknowledged: true,
      status: 'Pending Approval',
      customerId: customerId,
      dealId: dealData.dealId, // Storing the numeric dealId
      dealOrderDocId: newDealOrderRef.id,
      storeName: quotation.store,
      fabricDetails: allFabricDetails,
      totalAmount: quotation.totalAmount,
      vasDetails: quotation.vasDetails || [],
    };

    batch.set(newOrderRef, newOrder);
    
    const newDealOrder: DealOrder = {
      orderNo: newOrder.id,
      id: newDealOrderRef.id,
      orderDate: new Date().toISOString(),
      createdBy: creator.name,
      remark: quotation.billingName || '',
      items: quotation.items,
      status: 'Pending Approval'
    };

    batch.set(newDealOrderRef, newDealOrder);

    batch.update(quotationRef, { 
      status: 'Converted to Order',
      orderNo: newOrder.id,
    });

    await batch.commit();

    return {
      success: true,
      message: 'Order created and sent for approval.',
      order: JSON.parse(JSON.stringify(newOrder)),
    };
  } catch (error: any) {
    console.error('Error creating deal order:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}

export async function getQuotationsForDeal(customerId: string, dealId: string): Promise<Quotation[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('quotations')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const quotations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quotation));
        return JSON.parse(JSON.stringify(quotations));
    } catch (error) {
        console.error("Error fetching quotations:", error);
        return [];
    }
}

export async function updateQuotationStatusAction(
  customerId: string,
  dealId: string,
  quotationId: string,
  status: Quotation["status"]
): Promise<{ success: boolean; message: string }> {
  try {
    const quotationRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('quotations')
      .doc(quotationId);

    const quotationSnap = await quotationRef.get();
    if (!quotationSnap.exists) {
      return { success: false, message: 'Quotation not found.' };
    }

    const currentStatus = quotationSnap.data()?.status as Quotation["status"] | undefined;
    if (currentStatus === 'Converted to Order' && status === 'Closed') {
      return { success: false, message: 'Converted quotations cannot be closed.' };
    }

    await quotationRef.update({ status });
    return { success: true, message: `Quotation marked as ${status}.` };
  } catch (error: any) {
    console.error('Error updating quotation status:', error);
    return { success: false, message: `Failed to update quotation: ${error.message}` };
  }
}

export async function getOrdersForDeal(customerId: string, dealId: string): Promise<DealOrder[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('orders')
            .orderBy('orderDate', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealOrder));
        return JSON.parse(JSON.stringify(orders));
    } catch (error) {
        console.error("Error fetching orders:", error);
        return [];
    }
}


export async function addVisitAction(
  customerId: string,
  dealId: string,
  visitData: Omit<VisitFormValues, 'date'> & { typeOfVisit: string, orderId?: string },
  creatorName: string
): Promise<{ success: boolean; message: string; visit?: DealVisit, whatsAppUrl?: string }> {
  try {
    console.log("🟡 addVisitAction STARTED");
    console.log("➡ incoming visitData:", visitData);

    // Fetch customer
    const customerRef = adminDb.collection('customers').doc(customerId);
    const customerSnap = await customerRef.get();
    if (!customerSnap.exists) {
      return { success: false, message: "Customer not found." };
    }
    const customerData = customerSnap.data() as any;

    // Fetch deal
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const dealSnap = await dealRef.get();
    const dealData = dealSnap.data() as Deal;

    console.log("🟢 LOADED DEAL:", dealData);

    // ⭐ FIXED SELECTION-ID LOGIC ⭐
    let finalSelectionId: string | null = null;

    if (visitData.selectionId && visitData.selectionId !== "none") {
      finalSelectionId = visitData.selectionId;
      console.log("🎯 Using selectionId from UI:", finalSelectionId);
    } else if (dealData?.latestSelectionId) {
      finalSelectionId = dealData.latestSelectionId;
      console.log("🎯 Using latestSelectionId from deal:", finalSelectionId);
    } else {
      finalSelectionId = "none";
      console.log("🚫 No selection found → storing 'none'");
    }

    const visitsRef = dealRef.collection('visits');
    const newVisitRef = visitsRef.doc();

    // ⭐ FULL visit object (with selectionId FIXED)
    const newVisit: Omit<DealVisit, 'id'> = {
      representative: visitData.representative,
      typeOfVisit: visitData.typeOfVisit,
      createdAt: new Date().toISOString(),
      createdBy: creatorName,

      // ⭐ CRITICAL FIELD ADDED
      selectionId: finalSelectionId ?? undefined,


      measurements: visitData.measurements || [],
      blinds: visitData.blinds || [],
      curtain: visitData.curtain || [],
      otherCurtain: visitData.otherCurtain || "",

      deliveryInstallations: (visitData.deliveryInstallations || [])
        .filter(Boolean) as DeliveryInstallationItem[],

      subDeliveryInstallations: (visitData.subDeliveryInstallations || [])
        .filter(Boolean) as DeliveryInstallationItem[],

      otherDelivery: visitData.otherDelivery || "",

      dealId: dealData.dealId,
      status: "approved",          // your existing workflow
      orderId: visitData.orderId ?? undefined,
      remark: visitData.remark ?? undefined,


      // ⭐ REQUIRED EMPTY dueDate (your schema requires it)
      dueDate: visitData.dueDate ?? "",
    };

    console.log("🧩 FINAL VISIT SAVING:", newVisit);

    const batch = adminDb.batch();
    batch.set(newVisitRef, newVisit);

    // Delivery logic (unchanged)
    if (visitData.typeOfVisit === "delivery") {
      const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
      const o2dProcessDoc = await o2dProcessRef.get();
      if (o2dProcessDoc.exists) {
        const newMilestone: O2DStatus = {
          stepId: 12,
          status: "completed",
          completedAt: new Date().toISOString(),
          completedBy: creatorName,
          remarks: `Direct delivery visit created for order ${visitData.orderId || 'N/A'}.`,
          selection: "Done",
        };
        batch.update(o2dProcessRef, {
          milestones: FieldValue.arrayUnion(newMilestone),
        });
      }
    }

    await batch.commit();

    const savedVisit: DealVisit = {
      id: newVisitRef.id,
      ...newVisit,
    };

    // Create WhatsApp link
    const confirmationLink = `https://mo-track-yerq.vercel.app/visit/confirm/${newVisitRef.id}?customerId=${customerId}&dealId=${dealId}`;

    const smsMessage = `Dear ${customerData.name},
Please confirm your visit from Mo Design Pvt. Ltd.:
${confirmationLink}`;

    const smsResult = await sendVisitSms(customerData.mobileNo, smsMessage);

    return {
      success: true,
      message: "Visit request created successfully",
      visit: JSON.parse(JSON.stringify(savedVisit)),
      whatsAppUrl: smsResult.link,
    };
  } catch (error: any) {
    console.error("❌ ERROR addVisitAction:", error);
    return { success: false, message: error.message };
  }
}



export async function getVisitsForDeal(customerId: string, dealId: string): Promise<DealVisit[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('visits')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return []; // NOT NULL
        }

        const visits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DealVisit));
        return JSON.parse(JSON.stringify(visits));

    } catch (error) {
        console.error("Error fetching visits:", error);
        return []; // NEVER return null
    }
}


export async function addMeasurementAction(
  customerId: string,
  dealId: string,
  visitId: string,
  measurementData: Omit<DealMeasurement, 'id' | 'createdAt' | 'createdBy'>,
  creatorName: string,
  pdfUrl: string
): Promise<{ success: boolean; message: string; measurement?: DealMeasurement }> {
    try {
        const batch = adminDb.batch();
        
        const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
        const measurementsRef = dealRef.collection('measurements');
        const newMeasurementRef = measurementsRef.doc();
        
        const newMeasurementForDb: Omit<DealMeasurement, 'id'> = {
            ...measurementData,
            createdAt: new Date().toISOString(),
            createdBy: creatorName,
            pdfUrl: pdfUrl,
        };
        
        batch.set(newMeasurementRef, newMeasurementForDb);

        // Update the visit document with status and PDF URL
        const visitRef = dealRef.collection('visits').doc(visitId);
        batch.update(visitRef, {
            status: 'completed',
            measurementPdfUrl: pdfUrl,
        });

        // Update the O2D process if it's the first measurement for this deal
        const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
        const o2dProcessDoc = await o2dProcessRef.get();
        
        if (o2dProcessDoc.exists) {
            const measurementStepId = 2; // Corresponds to "Measurement"
            const existingMilestones = (o2dProcessDoc.data()?.milestones || []) as O2DStatus[];
            
            if (!existingMilestones.some(m => m.stepId === measurementStepId)) {
                const newMilestone: O2DStatus = {
                    stepId: measurementStepId,
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    completedBy: creatorName,
                    remarks: `Measurement recorded. PDF: ${pdfUrl}`,
                    selection: 'Done'
                };
                batch.update(o2dProcessRef, {
                    milestones: FieldValue.arrayUnion(newMilestone)
                });
            }
        }
        
        await batch.commit();
        
        const savedMeasurement = { ...newMeasurementForDb, id: newMeasurementRef.id };

        return { success: true, message: "Measurement added successfully.", measurement: JSON.parse(JSON.stringify(savedMeasurement)) };
    } catch (error: any) {
        console.error("Error adding measurement:", error);
        return { success: false, message: `Server error: ${error.message}` };
    }
}


export async function getMeasurementsForDeal(customerId: string, dealId: string) {
  try {
    const ref = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("measurements")
      .orderBy("createdAt", "desc");

    const snapshot = await ref.get();

    const measurements = snapshot.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,
        typeOf: data.typeOf || "-",
        doerName: data.doerName || data.createdBy || "-",
        createdBy: data.createdBy || "-",
        createdAt: data.createdAt || null,
        entries: data.entries || [],
        rooms: data.rooms || [],
        selectionId: data.selectionId || null,       // ←🔥 IMPORTANT
        status: data.status || "unknown",            // ←🔥 IMPORTANT
        flags: data.flags || [],                     // ←🔥 OPTIONAL
        pdfUrl: data.pdfUrl || null
      };
    });

    return measurements;
  } catch (err) {
    console.error("❌ ERROR getMeasurementsForDeal:", err);
    return [];
  }
}


export async function addCpdAction(
  customerId: string,
  dealId: string,
  cpdData: CpdFormValues,
  creatorName: string
): Promise<{ success: boolean; message: string; cpd?: Cpd }> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const cpdsRef = dealRef.collection('cpds');
    
    // Generate a unique 4-digit cpdId
    let newCpdId: string;
    let isUnique = false;
    do {
      newCpdId = Math.floor(1000 + Math.random() * 9000).toString();
      const existingCpdQuery = cpdsRef.where('cpdId', '==', newCpdId);
      const snapshot = await existingCpdQuery.get();
      if (snapshot.empty) {
        isUnique = true;
      }
    } while (!isUnique);

    // Normalize to satisfy Cpd types (ids required, arrays normalized)
    const normalizeCpd = (data: CpdFormValues): Omit<Cpd, "id" | "cpdId" | "createdAt" | "createdBy"> => ({
      representative: data.representative,
      customerName: data.customerName,
      telNo: data.telNo,
      date: data.date,
      rooms: (data.rooms || []).map((room) => ({
        room: room.room,
        items: (room.items || []).map((item) => ({
          itemName: item.itemName,
          type: item.type,
          qty: item.qty,
          rate: item.rate,
          dis: item.dis,
          amount: item.amount,
          fabricType: item.fabricType,
          hasDimension: item.hasDimension,
          hasStitchDimension: item.hasStitchDimension,
          dimensions: (item.dimensions || []).map((d) => ({
            id: d.id ?? `${Date.now()}-${Math.random()}`,
            length: d.length,
            width: d.width,
            type: Array.isArray(d.type) ? d.type : d.type ? [d.type] : [],
            advanceDetails: (d.advanceDetails || []).map((a) => ({
              id: a.id ?? `${Date.now()}-${Math.random()}`,
              name: a.name,
              pcs: a.pcs,
              imageUrl: (a as any).imageUrl ?? (a as any).img ?? undefined,
            })),
          })),
          stitchDimensions: (item.stitchDimensions || []).map((s) => ({
            id: s.id ?? `${Date.now()}-${Math.random()}`,
            vas: s.vas,
            lengths: s.lengths,
            width: s.width,
            operation: s.operation,
            noOfPanels: s.noOfPanels,
            remark: s.remark,
          })),
        })),
      })),
    });

    const newCpdRef = cpdsRef.doc();
    const normalized = normalizeCpd(cpdData);
    const fullCpdData: Omit<Cpd, 'id'> = {
      representative: normalized.representative,
      customerName: normalized.customerName,
      telNo: normalized.telNo,
      date: normalized.date,
      rooms: normalized.rooms,
      cpdId: newCpdId,
      createdAt: new Date().toISOString(),
      createdBy: creatorName,
    };
    
    const batch = adminDb.batch();
    batch.set(newCpdRef, fullCpdData);
    
    // Update the O2D process
    const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
    const o2dProcessDoc = await o2dProcessRef.get();
    
    if (o2dProcessDoc.exists) {
        const finalSelectionStepId = 3; // Corresponds to "Final Material Selection"
         const existingMilestones = (o2dProcessDoc.data()?.milestones || []) as O2DStatus[];
        
        if (!existingMilestones.some(m => m.stepId === finalSelectionStepId)) {
            const newMilestone: O2DStatus = {
                stepId: finalSelectionStepId,
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: creatorName,
                remarks: `CPD #${newCpdId} created for this deal.`,
                selection: 'Done'
            };
            batch.update(o2dProcessRef, {
                milestones: FieldValue.arrayUnion(newMilestone)
            });
        }
    }
    
    await batch.commit();

    const savedCpd = { ...fullCpdData, id: newCpdRef.id };

    return { success: true, message: 'CPD saved successfully and material selection marked as complete.', cpd: JSON.parse(JSON.stringify(savedCpd)) };
  } catch (error: any) {
    console.error('Error saving CPD:', error);
    return { success: false, message: `Failed to save CPD: ${error.message}` };
  }
}

export async function getCpdsForDeal(customerId: string, dealId: string): Promise<Cpd[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('cpds')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const cpds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cpd));
        return JSON.parse(JSON.stringify(cpds));
    } catch (error) {
        console.error("Error fetching CPDs:", error);
        return [];
    }
}

export async function createSelectionAction(customerId: string, dealId: string, products: DealProduct[], creatorName: string): Promise<{ success: boolean; message: string; selection?: Selection }> {
    try {
      const selectionsRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId).collection('selections');
  
      let selectionId: string;
      let isUnique = false;
      do {
        selectionId = Math.floor(1000 + Math.random() * 9000).toString();
        const existingDoc = await selectionsRef.doc(selectionId).get();
        if (!existingDoc.exists) {
          isUnique = true;
        }
      } while (!isUnique);
      
      const fullProducts = products.map(p => ({
        ...p,
        id: p.id || `${Date.now()}-${Math.random()}` // ensure every product has id
      }));

      
      const totalMrp = products.reduce((sum, p) => sum + ((Number(p.quantity) || 0) * (Number(p.mrp) || 0)), 0);
      const totalPcs = products.reduce((sum, p) => sum + (Number(p.noOfPcs) || 1), 0);
      const totalRooms = new Set(products.map(p => p.room)).size;
  
      const newSelection: Selection = {
        id: selectionId,
        products: fullProducts,
        createdAt: new Date().toISOString(),
        createdBy: creatorName,
        totalMrp: totalMrp,
        totalPcs: totalPcs,
        totalRooms: totalRooms,
        status: 'draft',
      };
  
      await selectionsRef.doc(selectionId).set(newSelection);
  
      return { 
        success: true, 
        message: 'Selection created successfully!', 
        selection: JSON.parse(JSON.stringify(newSelection))
      };
  
    } catch (error: any) {
      console.error("Error creating selection:", error);
      return { success: false, message: `Failed to create selection: ${error.message}` };
    }
  }

export async function getProductsByIds(productIds: string[]): Promise<DealProduct[]> {
    // In a real application, you would query your database for products with these IDs.
    // Since the products are part of the deal document, we can't query them directly.
    // This function is a placeholder and would need a better data model to work efficiently.
    // For now, we will return an empty array.
    console.warn("getProductsByIds is a placeholder and not implemented efficiently.");
    return [];
}


export async function getSelectionsForDeal(customerId: string, dealId: string): Promise<Selection[]> {
    try {
        const snapshot = await adminDb
            .collection('customers')
            .doc(customerId)
            .collection('deals')
            .doc(dealId)
            .collection('selections')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const selections = snapshot.docs.map(doc => doc.data() as Selection);
        return JSON.parse(JSON.stringify(selections));
    } catch (error) {
        console.error("Error fetching selections:", error);
        return [];
    }
}

export async function updateSelectionStatusAction(
  customerId: string,
  dealId: string,
  selectionId: string,
  status: 'draft' | 'final'
): Promise<{ success: boolean; message: string }> {
  try {
    const selectionRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('selections')
      .doc(selectionId);

    await selectionRef.update({ status });

    return { success: true, message: `Selection status updated to ${status}.` };
  } catch (error: any) {
    console.error('Error updating selection status:', error);
    return { success: false, message: 'Failed to update selection status.' };
  }
}

export async function getSelectionById(
  customerId: string,
  dealId: string,
  selectionId: string
) {
  try {
    const ref = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("selections")
      .doc(selectionId);

    const snap = await ref.get();

    if (!snap.exists) return null;

    return JSON.parse(JSON.stringify({ id: snap.id, ...snap.data() }));
  } catch (e) {
    console.log("🔥 Error fetching selection:", e);
    return null;
  }
}


//////////////////////////////////////////////// UPDATE BLINDS ACTION (ADMIN MODE) ///////

export async function updateBlindsAction({
  customerId,
  dealId,
  selectionId,
  roomName,
  blinds
}: {
  customerId: string;
  dealId: string;
  selectionId: string;
  roomName: string;
  blinds: any[];
}) {
  console.log("=======================================");
  console.log("🔥 updateBlindsAction called (ADMIN MODE)");
  console.log("customerId:", customerId);
  console.log("dealId:", dealId);
  console.log("selectionId:", selectionId);
  console.log("roomName:", roomName);
  console.log("incoming blinds:", blinds);

  try {
    if (!selectionId) {
      console.log("❌ Selection ID missing");
      return { success: false, error: "Selection ID missing" };
    }

    // ------------------------------------------------
    // ✅ ADMIN FIRESTORE REF (bypasses all rules)
    // ------------------------------------------------
    const selectionRef = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("selections")
      .doc(selectionId);

    console.log("📌 selectionRef path:", selectionRef.path);

    // ------------------------------------------------
    // ✅ FETCH CURRENT SELECTION DOCUMENT
    // ------------------------------------------------
    const snap = await selectionRef.get();

    if (!snap.exists) {
      console.log("❌ Selection NOT FOUND");
      return { success: false, error: "Selection not found" };
    }

    const selectionData = snap.data() || {};
    const existingProducts = selectionData.products || [];

    console.log("📄 CURRENT PRODUCTS:", existingProducts);

    // ------------------------------------------------
    // 1️⃣ UPDATE EXISTING BLINDS
    // ------------------------------------------------
    const updatedExisting = existingProducts.map((prod: any) => {
      const match = blinds.find((b) => b.id === prod.id);

      if (match) {
        console.log(`🟢 MATCH FOUND → Updating product: ${prod.id}`);

        return {
          ...prod,
          ...match, // copy all blind fields
          room: roomName,
          isBlind: true
        };
      }

      console.log(`⏭ Skipping (no match): ${prod.id}`);
      return prod;
    });

    // ------------------------------------------------
    // 2️⃣ DETECT NEW BLINDS (NOT PRESENT IN FIRESTORE)
    // ------------------------------------------------
    const newBlinds = blinds.filter(
      (b) => !existingProducts.some((p: any) => p.id === b.id)
    );

    console.log("🟡 NEW BLINDS TO ADD:", newBlinds);

    // Attach defaults for new blinds
    const formattedNewBlinds = newBlinds.map((b) => ({
      ...b,
      isBlind: true,
      room: roomName,
      salesDescription: "",
      collectionBrand: b.shadeNo || "",
      quantity: "0",
      remarks: ""
    }));

    // ------------------------------------------------
    // 3️⃣ FINAL PRODUCT LIST
    // ------------------------------------------------
    const finalProducts = [...updatedExisting, ...formattedNewBlinds];

    console.log("🧩 FINAL PRODUCT LIST TO SAVE:", finalProducts);

    // ------------------------------------------------
    // 4️⃣ SAVE TO FIRESTORE
    // ------------------------------------------------
    console.log("📤 Writing updated product data to Firestore...");

    await selectionRef.update({
      products: finalProducts
    });

    console.log("✅ BLIND UPDATE SUCCESS");
    console.log("=======================================");

    return { success: true };

  } catch (err: any) {
    console.log("❌ updateBlindsAction ERROR:", err);
    console.log("=======================================");
    return { success: false, error: err.message };
  }
}

//////////////////////////////////update SOfa Action///////////////////
export async function updateSofasAction({
  customerId,
  dealId,
  selectionId,
  roomName,
  sofas
}: {
  customerId: string;
  dealId: string;
  selectionId: string;
  roomName: string;
  sofas: any[];
}) {
  console.log("=======================================");
  console.log("🔥 updateSofasAction CALLED");
  console.log("incoming sofas:", sofas);

  try {
    const selectionRef = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("selections")
      .doc(selectionId);

    const snap = await selectionRef.get();

    if (!snap.exists) {
      return { success: false, error: "Selection not found" };
    }

    const selectionData = snap.data() || {};
    const existingProducts = selectionData.products || [];

    console.log("📄 Current Products Count:", existingProducts.length);

    // ----------------------------
    // 🔥 UPDATE OR ADD SOFAS
    // ----------------------------
    const updatedProducts = [...existingProducts];

    sofas.forEach((sofa) => {
      const existingIndex = updatedProducts.findIndex((p) => p.id === sofa.id);

      const sofaData = {
        id: sofa.id,
        isSofa: true,
        room: roomName,
        itemName: sofa.itemName,
        noOfSeat: sofa.noOfSeat,
        fabricQty: sofa.fabricQty,
        stitchingRate: sofa.stitchingRate,

        foam: sofa.foam || null,
        casement: sofa.casement || null,
        marking: sofa.marking || null,

        // Default required firestore fields
        quantity: "0",
        noOfPcs: "1",
        collectionBrand: "",
        mrp: "0",
        remarks: "",
        salesDescription: "",
        verticalRepeat: "",
        horizontalRepeat: ""
      };

      if (existingIndex !== -1) {
        console.log("🟢 Updating existing sofa:", sofa.id);
        updatedProducts[existingIndex] = {
          ...updatedProducts[existingIndex],
          ...sofaData
        };
      } else {
        console.log("🟡 Adding NEW sofa:", sofa.id);
        updatedProducts.push(sofaData);
      }
    });

    // ----------------------------
    // 🔥 SAVE TO FIRESTORE
    // ----------------------------
    await selectionRef.update({
      products: updatedProducts
    });

    console.log("✅ Sofa update success");

    return { success: true };
  } catch (err: any) {
    console.log("❌ ERROR in updateSofasAction:", err);
    return { success: false, error: err.message };
  }
}

///////////////////////////Update Item Action
export async function updateItemsAction({
  customerId,
  dealId,
  selectionId,
  roomName,
  items
}: {
  customerId: string;
  dealId: string;
  selectionId: string;
  roomName: string;
  items: any[];
}) {
  console.log("=======================================");
  console.log("🔥 updateItemsAction CALLED");
  console.log("incoming items:", items);

  try {
    const selectionRef = adminDb
      .collection("customers")
      .doc(customerId)
      .collection("deals")
      .doc(dealId)
      .collection("selections")
      .doc(selectionId);

    const snap = await selectionRef.get();

    if (!snap.exists) {
      return { success: false, error: "Selection not found" };
    }

    const selectionData = snap.data() || {};
    const existingProducts = Array.isArray(selectionData.products)
      ? selectionData.products
      : [];

    console.log("📄 Current Products Count:", existingProducts.length);


    console.log("📄 Current Products Count:", existingProducts.length);

    // ----------------------------
    // CLEAN existingProducts
    // ----------------------------
    const updatedProducts = [...existingProducts];

    // ----------------------------
    // PROCESS ITEMS
    // ----------------------------
      items.forEach(item => {
        let id = item.id;

        // If item has no valid ID → generate new one
        if (!id) {
          id = adminDb.collection("_").doc().id;
        }

        // Find existing document
        const index = updatedProducts.findIndex(p => p.id === id);

        const itemData = {
          id,
          room: roomName,
          itemType: item.itemType || "",
          itemName: item.itemName || "",
          noOfPannel: item.noOfPannel || "",
          height: item.height || "",
          width: item.width || "",
          remark: item.remark || "",
          casement: item.casement || null,
          marking: item.marking || null,
          niwar: item.niwar || null,
          isBlind: false,
          isSofa: false,
          quantity: "0",
          noOfPcs: "1",
          collectionBrand: "",
          mrp: "0",
          remarks: "",
          salesDescription: "",
          verticalRepeat: "",
          horizontalRepeat: ""
        };

        if (index !== -1) {
          updatedProducts[index] = { ...updatedProducts[index], ...itemData };
        } else {
          updatedProducts.push(itemData);
        }
      });


    // ----------------------------
    // SAVE
    // ----------------------------
    await selectionRef.update({
      products: updatedProducts
    });

    console.log("✅ Items update success");

    return { success: true };
  } catch (err: any) {
    console.log("❌ ERROR in updateItemsAction:", err);
    return { success: false, error: err.message };
  }
}

//////////////////////////////////////////
// CORRECT — SAVE MEASUREMENT TO DEAL
//////////////////////////////////////////

import admin from "firebase-admin";

export async function saveMeasurementToDeal({
  customerId,
  dealId,
  visitId,
  selectionId,
  typeOf,
  doerName,
  rooms,
  itemDetails = [],
  createdBy,
  status,
  flags,
}: {
  customerId?: string;
  dealId?: string;
  visitId?: string;
  selectionId?: string | null;
  typeOf?: string | null;
  doerName?: string | null;
  rooms: any[];
  itemDetails?: any[];
  createdBy?: string;
  status?: string;
  flags?: string[];
}) {
  try {
    console.log("🔥 saveMeasurementToDeal CALLED");
    console.log({ customerId, dealId, visitId, createdBy, doerName });

    /* ---------------- FALLBACKS ---------------- */

    const safeCreatedBy =
      (createdBy && createdBy.trim()) ||
      (doerName && doerName.trim()) ||
      "System";

    const safeStatus = status || "completed";
    const safeFlags = Array.isArray(flags) ? flags : [];

    /* ---------------- RESOLVE REFS ---------------- */

    let dealRef:
      | FirebaseFirestore.DocumentReference
      | null = null;
    let visitRef:
      | FirebaseFirestore.DocumentReference
      | null = null;

    // ✅ If customerId + dealId (doc id) provided, use them
    if (customerId && dealId) {
      dealRef = adminDb
        .collection("customers")
        .doc(customerId)
        .collection("deals")
        .doc(dealId);

      if (visitId) {
        visitRef = dealRef.collection("visits").doc(visitId);
      }
    }

    // ✅ Otherwise resolve from visitId (BEST for your new payload)
    if (!dealRef) {
      if (!visitId) throw new Error("visitId missing (cannot resolve deal)");

      // 1) Nested visits: customers/{cid}/deals/{did}/visits/{visitId}
      const cg = await adminDb
        .collectionGroup("visits")
        .where(admin.firestore.FieldPath.documentId(), "==", visitId)
        .limit(1)
        .get();

      if (!cg.empty) {
        visitRef = cg.docs[0].ref;
        // visits -> parent is visits collection -> parent.parent is deal doc
        dealRef = visitRef.parent.parent || null;
      }

      // 2) Optional fallback if you have top-level visits/{visitId}
      if (!dealRef) {
        const direct = await adminDb.collection("visits").doc(visitId).get();
        if (direct.exists) {
          visitRef = direct.ref;

          const v = direct.data() || {};
          const cid = v.customerId;
          const did = v.dealId; // ⚠️ must be deal doc id to work

          if (cid && did) {
            dealRef = adminDb
              .collection("customers")
              .doc(cid)
              .collection("deals")
              .doc(did);
          }
        }
      }

      if (!dealRef) {
        throw new Error(
          "Could not resolve dealRef from visitId. Visit not found in Firestore."
        );
      }
    }

    /* ---------------- SANITIZE DATA ---------------- */

    const stripPrivateKeys = (obj: any) => {
      if (!obj || typeof obj !== "object") return {};
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith("_")) continue; // removes _showPanelDropdown etc
        out[k] = v;
      }
      return out;
    };

    const sanitizeRooms = (rooms || []).map((room) => ({
      roomName: room.roomName || "",
      items: (room.items || []).map((item: any) => ({
        type: item.type || "",
        data: stripPrivateKeys(item.data || {}),
        remark: item.remark || "",
        photos: Array.isArray(item.photos) ? item.photos.filter(Boolean) : [],
      })),
    }));

    const safeItemDetails = Array.isArray(itemDetails)
      ? itemDetails.filter(Boolean)
      : [];

    /* ---------------- SAVE ---------------- */

    const measurementRef = dealRef.collection("measurements").doc();

    const saveData = {
      id: measurementRef.id,
      createdAt: new Date().toISOString(),
      createdBy: safeCreatedBy,

      selectionId: selectionId ?? null,
      typeOf: typeOf ?? null,
      doerName: doerName ?? null,

      rooms: sanitizeRooms,
      itemDetails: safeItemDetails,

      status: safeStatus,
      flags: safeFlags,
    };

    const batch = adminDb.batch();

    // 1️⃣ Save Measurement
    batch.set(measurementRef, saveData, { merge: true });

    // 2️⃣ Update Visit (ONLY if visitRef resolved)
    if (visitRef) {
      batch.set(
        visitRef,
        {
          status: "completed",
          visitEndTime: new Date().toISOString(),
          measurementId: measurementRef.id,
          measurementSavedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    // 3️⃣ Update Deal
    batch.set(
      dealRef,
      {
        latestMeasurementId: measurementRef.id,
        latestMeasurementAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await batch.commit();

    console.log("✅ Measurement saved:", measurementRef.path);

    return {
      success: true,
      measurementId: measurementRef.id,
      dealPath: dealRef.path,
      visitPath: visitRef?.path || null,
    };
  } catch (err: any) {
    console.error("❌ saveMeasurementToDeal ERROR:", err);
    return {
      success: false,
      error: err.message || "Failed to save measurement",
    };
  }
}


//////////////////////Inventory look Up///////////////////
export async function inventoryLookupAction({ bcnList }: { bcnList: string[] }) {
  try {
    const results: Record<string, any> = {};

    for (let raw of bcnList) {
      const bcn = String(raw || "").trim();
      console

      // ⛔ SKIP invalid BCN values
      if (
        !bcn ||
        bcn === "N/A" ||
        bcn === "-" ||
        bcn === "null" ||
        bcn === "undefined"
      ) {
        console.log("⛔ Skipping invalid BCN:", raw);
        results[bcn] = { mrp: 0 };
        continue;
      }

      try {
        const snap = await adminDb
          .collection("stocks")
          .doc(bcn)
          .get();

        if (!snap.exists) {
          console.log("⚠️ BCN not found in stocks:", bcn);
          results[bcn] = { mrp: 0 };
        } else {
          results[bcn] = snap.data();
        }
      } catch (inner) {
        console.log("🔥 Firestore error for BCN:", bcn, inner);
        results[bcn] = { mrp: 0 };
      }
    }

    return results;

  } catch (e) {
    console.log("🔥 inventoryLookupAction failed:", e);
    return {};
  }
}


/////////////////////get Selection id Action/////////////////// 

export async function getMeasurementById(customerId:string, dealId:string, measurementId:string): Promise<DealMeasurement | null> {
  console.log("SERVER getMeasurementById args:", {
    customerId,
    dealId,
    measurementId
  });

  try {
    const ref = adminDb
      .collection("customers")
      .doc(String(customerId))
      .collection("deals")
      .doc(String(dealId))
      .collection("measurements")
      .doc(String(measurementId));

    const snap = await ref.get();

    if (!snap.exists) return null;

    // It's crucial to return a plain object, not a Firestore DocumentSnapshot
    const data = { id: snap.id, ...snap.data() } as DealMeasurement;
    return JSON.parse(JSON.stringify(data));
    
  } catch (e) {
    console.log("🔥 error fetching measurement", e);
    return null;
  }
}

export async function addReceiptAction(
  customerId: string,
  dealId: string,
  receiptData: Omit<Receipt, 'id'>
): Promise<{ success: boolean; message: string }> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const receiptRef = dealRef.collection('receipts').doc();

    await receiptRef.set({
      ...receiptData,
      id: receiptRef.id,
    });
    
    return { success: true, message: 'Receipt added successfully.' };
  } catch (error: any) {
    console.error("Error adding receipt:", error);
    return { success: false, message: `Failed to add receipt: ${error.message}` };
  }
}

export async function getReceiptsForDeal(customerId: string, dealId: string): Promise<Receipt[]> {
  try {
      const snapshot = await adminDb
          .collection('customers')
          .doc(customerId)
          .collection('deals')
          .doc(dealId)
          .collection('receipts')
          .orderBy('date', 'desc')
          .get();

      if (snapshot.empty) {
          return [];
      }

      const receipts = snapshot.docs.map(doc => doc.data() as Receipt);
      return JSON.parse(JSON.stringify(receipts));
  } catch (error) {
      console.error("Error fetching receipts:", error);
      return [];
  }
}

export async function startVisitAction(customerId: string, dealDocId: string, visitId: string, geo?: { lat: number; lng: number; radiusM?: number }): Promise<{ success: boolean; message: string }> {
  try {
    const visitRef = adminDb.collection("customers").doc(customerId).collection("deals").doc(dealDocId).collection("visits").doc(visitId);
    const visitSnap = await visitRef.get();
    if (visitSnap.exists && !visitSnap.data()?.visitStartTime) {
      await visitRef.update({
        visitStartTime: new Date().toISOString(),
        visitStatus: "Working",
      });
    }
    return { success: true, message: "Visit started." };
  } catch (error: any) {
    console.error("Error starting visit:", error);
    return { success: false, message: `Failed to start visit: ${error.message}` };
  }
}
