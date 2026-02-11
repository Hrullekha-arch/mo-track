
"use client";

import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from 'next-themes';
import { initializeFirebase, FirebaseClientProvider } from '@/firebase';
import { FcmProvider } from '@/components/FcmProvider';
import { ReduxProvider } from '@/store/ReduxProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { app, auth, firestore } = initializeFirebase();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet"></link>
        <meta name="theme-color" content="#2563eb" />
        <link rel="manifest" href="/manifest.json" />
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4024784077029748"
     crossorigin="anonymous"></script>
      </head>
      <body className="font-body antialiased">
        <ReduxProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            disableTransitionOnChange
          >
            <FirebaseClientProvider firebaseApp={app} auth={auth} firestore={firestore}>
              <AuthProvider>
                <FcmProvider />
                {children}
                <Toaster />
              </AuthProvider>
            </FirebaseClientProvider>
          </ThemeProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
