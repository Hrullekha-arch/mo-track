'use server';

import { Cpd, Deal, DealMeasurement, DealVisit, DeliveryInstallationItem, O2DStatus, VisitUpdateLog } from '@/lib/types';
import { CpdFormValues } from '@/components/features/customer/CpdForm';
import { VisitFormValues } from '@/components/features/customer/VisitForm';
import {
  adminDb,
  buildVisitNo,
  dedupeO2DMilestones,
  deriveVisitPurpose,
  getDateOnly,
  normalizeVisitType,
  resolveUserName,
  sendVisitSms,
  stripUndefined,
  upsertO2DMilestone,
} from './actions-shared';

export async function addVisitAction(
  customerId: string,
  dealId: string,
  visitData: Omit<VisitFormValues, 'date'> & { typeOfVisit: string; orderId?: string },
  creatorName: string,
): Promise<{ success: boolean; message: string; visit?: DealVisit; whatsAppUrl?: string }> {
  try {
    const customerRef = adminDb.collection('customers').doc(customerId);
    const customerSnap = await customerRef.get();
    if (!customerSnap.exists) return { success: false, message: 'Customer not found.' };
    const customerData = customerSnap.data() as any;

    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const dealSnap = await dealRef.get();
    const dealData = dealSnap.data() as Deal;

    const finalSelectionId =
      visitData.selectionId && visitData.selectionId !== 'none'
        ? visitData.selectionId
        : dealData?.latestSelectionId || 'none';

    const newVisitRef = dealRef.collection('visits').doc();
    const nowIso = new Date().toISOString();
    const repId = visitData.representative || dealData?.assignedSalesPerson?.id || dealData?.representativeId;
    const repName = dealData?.assignedSalesPerson?.name || (await resolveUserName(repId));

    const assignedSalesPersonPayload = stripUndefined({ id: repId, name: repName });
    const customerSnapshotPayload = stripUndefined({
      id: customerId,
      name: customerData?.name || '',
      phone: customerData?.phone || customerData?.mobileNo || '',
      address: customerData?.billingAddress?.line1 || customerData?.addressPinCode || customerData?.address || '',
      customerType: customerData?.customerType,
    });
    const dealSnapshotPayload = stripUndefined({
      dealCode: dealData?.dealCode,
      title: dealData?.title || dealData?.dealName || '',
    });
    const locationPayload = stripUndefined({
      address:
        visitData.customerAddress ||
        customerData?.billingAddress?.line1 ||
        customerData?.addressPinCode ||
        customerData?.address ||
        undefined,
    });
    const assignmentPayload = stripUndefined({
      slot: stripUndefined({ date: getDateOnly(visitData.dueDate) }),
    });

    const updates: VisitUpdateLog[] = [
      {
        updatedAt: nowIso,
        updatedBy: { name: creatorName },
        action: 'CREATED',
        message: `Visit created${visitData.typeOfVisit ? ` (${visitData.typeOfVisit})` : ''}.`,
      },
    ];

    const newVisit: Omit<DealVisit, 'id'> = {
      visitId: newVisitRef.id,
      visitNo: buildVisitNo(undefined, nowIso),
      customerId,
      dealId: dealData?.dealId || dealId,
      customerSnapshot: Object.keys(customerSnapshotPayload).length > 0 ? customerSnapshotPayload : undefined,
      dealSnapshot: Object.keys(dealSnapshotPayload).length > 0 ? dealSnapshotPayload : undefined,
      assignedSalesPerson:
        Object.keys(assignedSalesPersonPayload).length > 0 ? assignedSalesPersonPayload : undefined,
      visitType: normalizeVisitType(visitData.typeOfVisit) || visitData.typeOfVisit,
      purpose: deriveVisitPurpose(visitData.typeOfVisit),
      assignment: Object.keys(assignmentPayload).length > 0 ? assignmentPayload : undefined,
      location: Object.keys(locationPayload).length > 0 ? locationPayload : undefined,
      updates,
      updatedAt: nowIso,
      representative: visitData.representative,
      typeOfVisit: visitData.typeOfVisit,
      createdAt: nowIso,
      createdBy: creatorName,
      selectionId: finalSelectionId ?? undefined,
      measurements: visitData.measurements || [],
      blinds: visitData.blinds || [],
      curtain: visitData.curtain || [],
      otherCurtain: visitData.otherCurtain || '',
      deliveryInstallations: (visitData.deliveryInstallations || []).filter(Boolean) as DeliveryInstallationItem[],
      subDeliveryInstallations: (visitData.subDeliveryInstallations || []).filter(Boolean) as DeliveryInstallationItem[],
      otherDelivery: visitData.otherDelivery || '',
      status: 'approved',
      orderId: visitData.orderId ?? undefined,
      remark: visitData.remark ?? undefined,
      dueDate: visitData.dueDate ?? '',
      ...(visitData.typeOfVisit === 'complaint' && {
        complaintItem: visitData.complaintItem ?? '',
        complaintQuantity: visitData.complaintQuantity ?? '',
        complaintType: visitData.complaintType ?? '',
        complaintDescription: visitData.complaintDescription ?? '',
        complaintPriority: visitData.complaintPriority ?? 'medium',
        ...((visitData as any).assignedCrm ? { assignedCrm: (visitData as any).assignedCrm } : {}),
      }),
    };

    const batch = adminDb.batch();
    batch.set(newVisitRef, newVisit);

    if (visitData.typeOfVisit === 'delivery') {
      const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
      const o2dProcessDoc = await o2dProcessRef.get();
      if (o2dProcessDoc.exists) {
        const existingMilestones = dedupeO2DMilestones((o2dProcessDoc.data()?.milestones || []) as O2DStatus[]);
        batch.update(o2dProcessRef, {
          milestones: upsertO2DMilestone(existingMilestones, {
            stepId: 12,
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: creatorName,
            remarks: `Direct delivery visit created for order ${visitData.orderId || 'N/A'}.`,
            selection: 'Done',
          }),
        });
      }
    }

    await batch.commit();

    const confirmationLink = `https://mo-track-yerq.vercel.app/visit/confirm/${newVisitRef.id}?customerId=${customerId}&dealId=${dealId}`;
    const smsMessage = `Dear ${customerData.name},\nPlease confirm your visit from Mo Design Pvt. Ltd.:\n${confirmationLink}`;
    const smsResult = await sendVisitSms(customerData.phone || customerData.mobileNo || '', smsMessage);

    return {
      success: true,
      message: 'Visit request created successfully',
      visit: JSON.parse(JSON.stringify({ id: newVisitRef.id, ...newVisit })),
      whatsAppUrl: smsResult.link,
    };
  } catch (error: any) {
    console.error('ERROR addVisitAction:', error);
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
    if (snapshot.empty) return [];
    return JSON.parse(JSON.stringify(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as DealVisit))));
  } catch (error) {
    console.error('Error fetching visits:', error);
    return [];
  }
}

export async function addMeasurementAction(
  customerId: string,
  dealId: string,
  visitId: string,
  measurementData: Omit<DealMeasurement, 'id' | 'createdAt' | 'createdBy'>,
  creatorName: string,
  pdfUrl: string,
): Promise<{ success: boolean; message: string; measurement?: DealMeasurement }> {
  try {
    const batch = adminDb.batch();
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const newMeasurementRef = dealRef.collection('measurements').doc();
    batch.set(newMeasurementRef, {
      ...measurementData,
      createdAt: new Date().toISOString(),
      createdBy: creatorName,
      pdfUrl,
    });

    batch.update(dealRef.collection('visits').doc(visitId), {
      status: 'completed',
      measurementPdfUrl: pdfUrl,
      updatedAt: new Date().toISOString(),
    });

    const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
    const o2dProcessDoc = await o2dProcessRef.get();
    if (o2dProcessDoc.exists) {
      const measurementStepId = 2;
      const existingMilestones = dedupeO2DMilestones((o2dProcessDoc.data()?.milestones || []) as O2DStatus[]);
      if (!existingMilestones.some((m) => m.stepId === measurementStepId)) {
        batch.update(o2dProcessRef, {
          milestones: upsertO2DMilestone(existingMilestones, {
            stepId: measurementStepId,
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: creatorName,
            remarks: `Measurement recorded. PDF: ${pdfUrl}`,
            selection: 'Done',
          }),
        });
      }
    }

    await batch.commit();
    return {
      success: true,
      message: 'Measurement added successfully.',
      measurement: JSON.parse(JSON.stringify({ ...measurementData, id: newMeasurementRef.id, createdAt: new Date().toISOString(), createdBy: creatorName, pdfUrl })),
    };
  } catch (error: any) {
    console.error('Error adding measurement:', error);
    return { success: false, message: `Server error: ${error.message}` };
  }
}

export async function getMeasurementsForDeal(customerId: string, dealId: string) {
  try {
    const snapshot = await adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealId)
      .collection('measurements')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        typeOf: data.typeOf || '-',
        doerName: data.doerName || data.createdBy || '-',
        createdBy: data.createdBy || '-',
        createdAt: data.createdAt || null,
        entries: data.entries || [],
        rooms: data.rooms || [],
        selectionId: data.selectionId || null,
        status: data.status || 'unknown',
        flags: data.flags || [],
        pdfUrl: data.pdfUrl || null,
      };
    });
  } catch (err) {
    console.error('ERROR getMeasurementsForDeal:', err);
    return [];
  }
}

export async function addCpdAction(
  customerId: string,
  dealId: string,
  cpdData: CpdFormValues,
  creatorName: string,
): Promise<{ success: boolean; message: string; cpd?: Cpd }> {
  try {
    const dealRef = adminDb.collection('customers').doc(customerId).collection('deals').doc(dealId);
    const cpdsRef = dealRef.collection('cpds');
    let newCpdId = '';

    do {
      newCpdId = Math.floor(1000 + Math.random() * 9000).toString();
    } while (!(await cpdsRef.where('cpdId', '==', newCpdId).get()).empty);

    const normalizeCpd = (data: CpdFormValues): Omit<Cpd, 'id' | 'cpdId' | 'createdAt' | 'createdBy'> => ({
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
      ...normalized,
      cpdId: newCpdId,
      createdAt: new Date().toISOString(),
      createdBy: creatorName,
    };

    const batch = adminDb.batch();
    batch.set(newCpdRef, fullCpdData);
    const o2dProcessRef = adminDb.collection('o2d').doc(dealId);
    const o2dProcessDoc = await o2dProcessRef.get();
    if (o2dProcessDoc.exists) {
      const finalSelectionStepId = 3;
      const existingMilestones = dedupeO2DMilestones((o2dProcessDoc.data()?.milestones || []) as O2DStatus[]);
      if (!existingMilestones.some((m) => m.stepId === finalSelectionStepId)) {
        batch.update(o2dProcessRef, {
          milestones: upsertO2DMilestone(existingMilestones, {
            stepId: finalSelectionStepId,
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: creatorName,
            remarks: `CPD #${newCpdId} created for this deal.`,
            selection: 'Done',
          }),
        });
      }
    }

    await batch.commit();
    return {
      success: true,
      message: 'CPD saved successfully and material selection marked as complete.',
      cpd: JSON.parse(JSON.stringify({ ...fullCpdData, id: newCpdRef.id })),
    };
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
    if (snapshot.empty) return [];
    return JSON.parse(JSON.stringify(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Cpd))));
  } catch (error) {
    console.error('Error fetching CPDs:', error);
    return [];
  }
}

export async function startVisitAction(
  customerId: string,
  dealDocId: string,
  visitId: string,
  _geo?: { lat: number; lng: number; radiusM?: number },
): Promise<{ success: boolean; message: string }> {
  try {
    const visitRef = adminDb
      .collection('customers')
      .doc(customerId)
      .collection('deals')
      .doc(dealDocId)
      .collection('visits')
      .doc(visitId);
    const visitSnap = await visitRef.get();
    if (visitSnap.exists && !visitSnap.data()?.visitStartTime) {
      await visitRef.update({
        visitStartTime: new Date().toISOString(),
        visitStatus: 'Working',
        updatedAt: new Date().toISOString(),
      });
    }
    return { success: true, message: 'Visit started.' };
  } catch (error: any) {
    console.error('Error starting visit:', error);
    return { success: false, message: `Failed to start visit: ${error.message}` };
  }
}
