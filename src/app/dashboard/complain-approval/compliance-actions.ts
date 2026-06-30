'use server';

import { adminDb } from '@/lib/firebase-admin';

export type ComplianceSubmission = {
  id: string;
  dealId: string;
  customerName: string;
  salesman: string;
  item: string;
  category: string;
  quantity: string;
  typeOfReturn: string;
  returnSubOptions: string[];
  descriptionForReturn: string;
  imageUrls: string[];
  createdAt: string;
};

export async function saveComplianceAction(payload: {
  dealId: string;
  customerName: string;
  salesman: string;
  item: string;
  category: string;
  quantity: string;
  typeOfReturn: string;
  returnSubOptions: string[];
  descriptionForReturn: string;
  imageUrls: string[];
}): Promise<{ success: boolean; id?: string; message?: string }> {
  try {
    const ref = await adminDb.collection('compliances').add({
      ...payload,
      createdAt: new Date().toISOString(),
    });
    return { success: true, id: ref.id };
  } catch (err: any) {
    console.error('saveComplianceAction error:', err);
    return { success: false, message: err.message };
  }
}

export async function getCompliancesAction(): Promise<ComplianceSubmission[]> {
  try {
    const snap = await adminDb
      .collection('compliances')
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<ComplianceSubmission, 'id'>),
    }));
  } catch (err: any) {
    console.error('getCompliancesAction error:', err);
    return [];
  }
}
