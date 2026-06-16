
import './globals.css';
import "leaflet/dist/leaflet.css";
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from 'next-themes';
import { FirebaseClientProvider } from '@/firebase';
import { FcmProvider } from '@/components/FcmProvider';
import { ReduxProvider } from '@/store/ReduxProvider';
import { DevSwReset } from '@/components/DevSwReset';

const isProduction = process.env.NODE_ENV === "production";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet"></link>
        <meta name="theme-color" content="#2563eb" />
        {isProduction ? <link rel="manifest" href="/manifest.json" /> : null}
        {!isProduction ? (
          <script
            id="dev-sw-cache-reset"
            dangerouslySetInnerHTML={{
              __html: `
(() => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      )
      .then(() => {
        if (!("caches" in window)) return;
        return caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      })
      .catch(() => {});
  });
})();
              `,
            }}
          />
        ) : null}
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
                {!isProduction && <DevSwReset />}
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
