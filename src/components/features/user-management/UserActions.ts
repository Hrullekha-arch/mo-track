
'use server';

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}

export async function createUser(email: string, password: string):Promise<{uid?: string, error?: string}> {
    try {
        const userRecord = await getAuth().createUser({
            email,
            password,
        });
        return { uid: userRecord.uid };
    } catch (error: any) {
        if (error.code === 'auth/email-already-exists') {
            return { error: 'A user with this email address already exists.' };
        }
        return { error: error.message || 'An unknown error occurred.' };
    }
}
