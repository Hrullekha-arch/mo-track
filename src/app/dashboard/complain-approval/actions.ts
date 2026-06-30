'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

export type ComplaintChargeType = 'free' | 'chargeable';

const normalizeKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');

const hasComplaintApprovalAccess = (role: unknown, designation: unknown) => {
  const roleKey = normalizeKey(role);
  const designationKey = normalizeKey(designation);
  if (roleKey === 'admin') return true;
  if (roleKey === 'headsalesmanager') return true;
  if (designationKey === 'headsalesmanager') return true;
  if (designationKey === 'ea') return true;
  if (designationKey === 'salesmanager') return true;
  return false;
};

export async function saveComplaintApprovalAction(input: {
  visitId: string;
  chargeType: ComplaintChargeType;
  chargeAmount?: number;
  approvalNote?: string;
  assignedInstaller?: { id: string; name: string };
  actor?: {
    id?: string;
    name?: string;
    email?: string;
  };
}): Promise<{ success: boolean; message: string }> {
  try {
    const visitId = String(input?.visitId || '').trim();
    if (!visitId) {
      return { success: false, message: 'Complaint visit ID is required.' };
    }

    const chargeType = String(input?.chargeType || '').trim().toLowerCase();
    if (chargeType !== 'free' && chargeType !== 'chargeable') {
      return { success: false, message: 'Invalid charge type.' };
    }

    const parsedChargeAmount = Number(input?.chargeAmount || 0);
    const chargeAmount =
      chargeType === 'chargeable'
        ? Number.isFinite(parsedChargeAmount)
          ? parsedChargeAmount
          : 0
        : 0;

    if (chargeType === 'chargeable' && chargeAmount <= 0) {
      return {
        success: false,
        message: 'Charge amount must be greater than zero for chargeable complaints.',
      };
    }

    const actorId = String(input?.actor?.id || '').trim();
    if (!actorId) {
      return { success: false, message: 'Valid actor is required.' };
    }

    const actorSnap = await adminDb.collection('users').doc(actorId).get();
    if (!actorSnap.exists) {
      return { success: false, message: 'Actor not found.' };
    }

    const actorData = actorSnap.data() as any;
    const actorRole = String(actorData?.role || '').trim();
    const actorDesignation = String(actorData?.designation || '').trim();

    if (!hasComplaintApprovalAccess(actorRole, actorDesignation)) {
      return { success: false, message: 'Only admin, headsalesmanager, or EA can approve complaints.' };
    }

    const visitRef = adminDb.collection('companyVisits').doc(visitId);
    const visitSnap = await visitRef.get();
    if (!visitSnap.exists) {
      return { success: false, message: 'Complaint visit not found.' };
    }

    const visitData = visitSnap.data() as any;
    const category = String(visitData?.category || '').trim();
    if (category !== 'complaint_visit') {
      return { success: false, message: 'Selected visit is not a complaint visit.' };
    }

    const nowIso = new Date().toISOString();
    const approvalNote = String(input?.approvalNote || '').trim();
    const approvedByName =
      String(input?.actor?.name || actorData?.name || '').trim() || 'System';
    const approvedByEmail = String(input?.actor?.email || actorData?.email || '').trim();

    const approvedByPayload = {
      id: actorId,
      name: approvedByName,
      email: approvedByEmail,
      role: actorRole,
      designation: actorDesignation,
    };

    await visitRef.set(
      {
        status: 'Approved',
        approvalStatus: 'Approved',
        complaintStatus: chargeType === 'chargeable' ? 'Approved - Chargeable' : 'Approved - Free',
        pendingApproval: false,
        chargeType,
        isChargeable: chargeType === 'chargeable',
        chargeAmount,
        serviceCharge: chargeAmount,
        approvalNote: approvalNote || '',
        approvedAt: nowIso,
        approvedBy: approvedByPayload,
        ...(input.assignedInstaller?.id ? { assignedInstaller: input.assignedInstaller } : {}),
        approval: {
          decision: 'approved',
          chargeType,
          chargeAmount,
          note: approvalNote || '',
          approvedAt: nowIso,
          approvedBy: approvedByPayload,
          ...(input.assignedInstaller?.id ? { assignedInstaller: input.assignedInstaller } : {}),
        },
        updatedAt: nowIso,
        updates: FieldValue.arrayUnion({
          updatedAt: nowIso,
          updatedBy: { id: actorId, name: approvedByName },
          action: 'COMPLAINT_APPROVAL_UPDATED',
          message:
            chargeType === 'chargeable'
              ? `Complaint approved as chargeable with INR ${chargeAmount}.`
              : 'Complaint approved as free service.',
        }),
      },
      { merge: true }
    );

    return { success: true, message: 'Complaint approval saved successfully.' };
  } catch (error: any) {
    console.error('Error saving complaint approval:', error);
    return {
      success: false,
      message: error?.message || 'Failed to save complaint approval.',
    };
  }
}

export async function saveVisitComplaintApprovalAction(input: {
  customerId: string;
  dealId: string;
  visitId: string;
  chargeType: ComplaintChargeType;
  chargeAmount?: number;
  approvalNote?: string;
  assignedInstaller?: { id: string; name: string };
  actor?: { id?: string; name?: string; email?: string };
}): Promise<{ success: boolean; message: string }> {
  try {
    const { customerId, dealId, visitId } = input;
    if (!customerId || !dealId || !visitId) {
      return { success: false, message: 'Missing visit path info.' };
    }

    const chargeType = String(input?.chargeType || '').trim().toLowerCase();
    if (chargeType !== 'free' && chargeType !== 'chargeable') {
      return { success: false, message: 'Invalid charge type.' };
    }

    const parsedChargeAmount = Number(input?.chargeAmount || 0);
    const chargeAmount = chargeType === 'chargeable' && Number.isFinite(parsedChargeAmount) ? parsedChargeAmount : 0;

    if (chargeType === 'chargeable' && chargeAmount <= 0) {
      return { success: false, message: 'Charge amount must be greater than zero for chargeable complaints.' };
    }

    const actorId = String(input?.actor?.id || '').trim();
    if (!actorId) return { success: false, message: 'Valid actor is required.' };

    const actorSnap = await adminDb.collection('users').doc(actorId).get();
    if (!actorSnap.exists) return { success: false, message: 'Actor not found.' };

    const actorData = actorSnap.data() as any;
    const actorRole = String(actorData?.role || '').trim();
    const actorDesignation = String(actorData?.designation || '').trim();

    if (!hasComplaintApprovalAccess(actorRole, actorDesignation)) {
      return { success: false, message: 'Only admin or sales manager can approve complaints.' };
    }

    const nowIso = new Date().toISOString();
    const approvalNote = String(input?.approvalNote || '').trim();
    const approvedByName = String(input?.actor?.name || actorData?.name || '').trim() || 'System';
    const approvedByEmail = String(input?.actor?.email || actorData?.email || '').trim();
    const approvedByPayload = { id: actorId, name: approvedByName, email: approvedByEmail, role: actorRole, designation: actorDesignation };

    const visitRef = adminDb
      .collection('customers').doc(customerId)
      .collection('deals').doc(dealId)
      .collection('visits').doc(visitId);

    await visitRef.set(
      {
        complianceApprovalStatus: 'Approved',
        complianceChargeType: chargeType,
        complianceIsChargeable: chargeType === 'chargeable',
        complianceChargeAmount: chargeAmount,
        complianceApprovalNote: approvalNote || '',
        complianceApprovedAt: nowIso,
        complianceApprovedBy: approvedByPayload,
        ...(input.assignedInstaller?.id ? { assignedInstaller: input.assignedInstaller } : {}),
      },
      { merge: true }
    );

    return { success: true, message: 'Complaint approval saved successfully.' };
  } catch (error: any) {
    console.error('Error saving visit complaint approval:', error);
    return { success: false, message: error?.message || 'Failed to save complaint approval.' };
  }
}
