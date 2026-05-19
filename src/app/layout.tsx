
import './globals.css';
import "leaflet/dist/leaflet.css";
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from 'next-themes';
import { FirebaseClientProvider } from '@/firebase';
import { FcmProvider } from '@/components/FcmProvider';
import { ReduxProvider } from '@/store/ReduxProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isProduction = process.env.NODE_ENV === "production";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {!isProduction ? (
          <script
            id="dev-sw-cache-reset"
            dangerouslySetInnerHTML={{
              __html: `
                (() => {
                  if (typeof window === "undefined") return;
                  if (!("serviceWorker" in navigator)) return;
                  navigator.serviceWorker.getRegistrations()
                    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
                    .catch(() => {});
                  if ("caches" in window) {
                    caches.keys()
                      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
                      .catch(() => {});
                  }
                })();
              `,
            }}
          />
        ) : null}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet"></link>
        <meta name="theme-color" content="#2563eb" />
        {isProduction ? <link rel="manifest" href="/manifest.json" /> : null}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4024784077029748"
          crossOrigin="anonymous"
        ></script>
      </head>
      <body className="font-body antialiased">
        <ReduxProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            disableTransitionOnChange
          >
            <FirebaseClientProvider>
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
