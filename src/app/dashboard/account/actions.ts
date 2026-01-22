'use server';

import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { OwnerRef, OwnerType, HandoverRequest, User } from '@/lib/types';
import { ownerTypeFromUser } from '@/lib/owners';

type CreateHandoverInput = {
  fromOwnerId: string;
  fromOwnerType: OwnerType;
  toOwnerId: string;
  toOwnerType: OwnerType;
  note?: string;
};

export async function createHandoverRequestAction(input: CreateHandoverInput) {
  try {
    if (!input.fromOwnerId || !input.toOwnerId) {
      return { success: false, message: 'Missing owner information.' };
    }

    const now = new Date().toISOString();
    const payload: Omit<HandoverRequest, 'id'> = {
      fromOwner: { id: input.fromOwnerId, type: input.fromOwnerType } as OwnerRef,
      toOwner: { id: input.toOwnerId, type: input.toOwnerType } as OwnerRef,
      scopeType: 'ALL_WORK',
      startAt: now,
      endAt: null,
      status: 'PENDING', // auto-activate for now; swap to PENDING if approval flow is added
      note: input.note || '',
      createdAt: now,
      acceptedAt: null,
    };

    const docRef = adminDb.collection('handover_requests').doc();
    await docRef.set({ ...payload, id: docRef.id });

    return { success: true, message: 'Handover activated', handoverRequestId: docRef.id };
  } catch (error: any) {
    console.error('Error creating handover request:', error);
    return { success: false, message: error.message || 'Failed to create handover request.' };
  }
}

export async function getSalesmenForCrmAction(crmUserId: string) {
  if (!crmUserId) return [];
  const snap = await adminDb
    .collection('salesmanCrmAssignments')
    .where('crmUserId', '==', crmUserId)
    .get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    name: doc.id,
    ...doc.data(),
  }));
}

export async function getBackupOwnersAction(role: string, designation?: string) {
  if (!role) return [];
  let query: FirebaseFirestore.Query = adminDb.collection('users').where('role', '==', role);
  if (designation) {
    query = query.where('designation', '==', designation);
  }
  const snap = await query.get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    name: (doc.data() as any).name || doc.id,
    role: (doc.data() as any).role,
    designation: (doc.data() as any).designation,
  }));
}

export async function updateAccountPreferencesAction(params: {
  userId: string;
  weekOff?: string;
  assignedSalesmanId?: string;
  assignedSalesmanName?: string;
  backupOwnerId?: string;
  backupOwnerName?: string;
}) {
  try {
    const { userId, ...rest } = params;
    if (!userId) return { success: false, message: 'Missing user.' };
    await adminDb.collection('users').doc(userId).set(rest, { merge: true });
    return { success: true, message: 'Preferences updated.' };
  } catch (error: any) {
    console.error('Error updating account preferences:', error);
    return { success: false, message: error.message || 'Failed to save.' };
  }
}

export async function requestHandoverAndBackupAction(input: {
  fromUserId: string;
  fromOwnerType: OwnerType;
  toOwnerId: string;
  toOwnerType: OwnerType;
  note?: string;
}) {
  try {
    if (!input.fromUserId || !input.toOwnerId) {
      return { success: false, message: 'Missing owner information.' };
    }

    const now = new Date().toISOString();
    // Update backup owner on source user
    await adminDb.collection('users').doc(input.fromUserId).set(
      {
        backupOwnerId: input.toOwnerId,
        backupOwnerName: input.toOwnerId,
        backupOwnerType: input.toOwnerType,
        backupSetAt: now,
      },
      { merge: true }
    );

    // Create handover request (pending acceptance)
    const payload: Omit<HandoverRequest, 'id'> = {
      fromOwner: { id: input.fromUserId, type: input.fromOwnerType },
      toOwner: { id: input.toOwnerId, type: input.toOwnerType },
      scopeType: 'ALL_WORK',
      startAt: now,
      endAt: null,
      status: 'PENDING',
      note: input.note || '',
      createdAt: now,
      acceptedAt: null,
    };
    const docRef = adminDb.collection('handover_requests').doc();
    await docRef.set({ ...payload, id: docRef.id });

    // Notify target user (in-app + push)
    const targetUserSnap = await adminDb.collection('users').doc(input.toOwnerId).get();
    if (targetUserSnap.exists) {
      const targetUser = { id: targetUserSnap.id, ...targetUserSnap.data() } as User;
      const notificationPayload = {
        type: 'handover_assigned',
        message: `You are now covering for ${input.fromUserId}.`,
        link: '/dashboard',
        read: false,
        createdAt: now,
      };
      await adminDb
        .collection('users')
        .doc(input.toOwnerId)
        .collection('notifications')
        .add(notificationPayload);

      if (targetUser.fcmTokens && targetUser.fcmTokens.length > 0) {
        await adminMessaging.sendEachForMulticast({
          notification: {
            title: 'New Handover Assignment',
            body: 'You are now covering work for a teammate.',
          },
          tokens: targetUser.fcmTokens,
        });
      }
    }

    return { success: true, message: 'Handover request sent (pending acceptance)', handoverRequestId: docRef.id };
  } catch (error: any) {
    console.error('Error in requestHandoverAndBackupAction:', error);
    return { success: false, message: error.message || 'Failed to activate handover.' };
  }
}
export async function acceptHandoverRequestAction(params: { handoverRequestId: string; actingUserId: string }) {
  try {
    const { handoverRequestId, actingUserId } = params;
    if (!handoverRequestId || !actingUserId) return { success: false, message: 'Missing data.' };

    const ref = adminDb.collection('handover_requests').doc(handoverRequestId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'Request not found.' };

    const data = snap.data() as HandoverRequest;
    if (data.toOwner.id !== actingUserId) {
      return { success: false, message: 'Only the requested assignee can accept.' };
    }

    const now = new Date().toISOString();
    await ref.update({ status: 'ACCEPTED', acceptedAt: now, acceptedBy: actingUserId });

    return { success: true, message: 'Handover accepted.', acceptedAt: now };
  } catch (error: any) {
    console.error('Error accepting handover:', error);
    return { success: false, message: error.message || 'Failed to accept handover.' };
  }
}

export async function rejectHandoverRequestAction(params: { handoverRequestId: string; actingUserId: string }) {
  try {
    const { handoverRequestId, actingUserId } = params;
    if (!handoverRequestId || !actingUserId) return { success: false, message: 'Missing data.' };

    const ref = adminDb.collection('handover_requests').doc(handoverRequestId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, message: 'Request not found.' };

    const data = snap.data() as HandoverRequest;
    if (data.toOwner.id !== actingUserId) {
      return { success: false, message: 'Only the requested assignee can reject.' };
    }

    const now = new Date().toISOString();
    await ref.update({ status: 'REJECTED', acceptedAt: null, rejectedAt: now, rejectedBy: actingUserId });

    return { success: true, message: 'Handover rejected.' };
  } catch (error: any) {
    console.error('Error rejecting handover:', error);
    return { success: false, message: error.message || 'Failed to reject handover.' };
  }
}

export async function getPendingHandoversForUserAction(toOwnerId: string) {
  if (!toOwnerId) return [];
  const snap = await adminDb
    .collection('handover_requests')
    .where('toOwner.id', '==', toOwnerId)
    .where('status', '==', 'PENDING')
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any[];
}

