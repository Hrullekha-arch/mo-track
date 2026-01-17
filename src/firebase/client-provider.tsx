
'use client';
import { FirebaseApp } from 'firebase/app';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';
import { PropsWithChildren, useEffect, useState } from 'react';

import { initializeFirebase, FirebaseProvider } from '.';

type FirebaseClientProviderProps = PropsWithChildren<{
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}>;

export function FirebaseClientProvider({
  children,
  ...props
}: FirebaseClientProviderProps) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <FirebaseProvider
      firebaseApp={props.firebaseApp}
      auth={props.auth}
      firestore={props.firestore}
    >
      {children}
    </FirebaseProvider>
  );
}
