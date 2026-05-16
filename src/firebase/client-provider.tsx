
'use client';
import { PropsWithChildren, useEffect, useState } from 'react';

import { initializeFirebase } from './index';
import { FirebaseProvider } from './provider';

export function FirebaseClientProvider({ children }: PropsWithChildren) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  const { app, auth, firestore } = initializeFirebase();

  return (
    <FirebaseProvider firebaseApp={app} auth={auth} firestore={firestore}>
      {children}
    </FirebaseProvider>
  );
}
