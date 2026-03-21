import { FirebaseOptions } from "firebase/app";

const fromEnv = (key: string): string | undefined => {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value : undefined;
};

const fromWebAppConfig = (key: keyof FirebaseOptions): string | undefined => {
  const raw = process.env.FIREBASE_WEBAPP_CONFIG;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as FirebaseOptions;
    const value = parsed[key];
    return typeof value === "string" && value.trim().length > 0
      ? value
      : undefined;
  } catch {
    return undefined;
  }
};

const defaults = {
  apiKey: "AIzaSyBUb3wNulHplcgEkuqpv2K5v711K7hxLzo",
  authDomain: "studio-3799785967-d0d9d.firebaseapp.com",
  projectId: "studio-3799785967-d0d9d",
  storageBucket: "studio-3799785967-d0d9d.firebasestorage.app",
  messagingSenderId: "190186132582",
  appId: "1:190186132582:web:a384cfd7d537547b7a09a7",
  measurementId: "G-M7M6X69SNF",
};

export const firebaseConfig: FirebaseOptions = {
  apiKey:
    fromEnv("NEXT_PUBLIC_FIREBASE_API_KEY") ??
    fromEnv("EXPO_PUBLIC_FIREBASE_API_KEY") ??
    fromWebAppConfig("apiKey") ??
    defaults.apiKey,
  authDomain:
    fromEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") ??
    fromEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN") ??
    fromWebAppConfig("authDomain") ??
    defaults.authDomain,
  projectId:
    fromEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID") ??
    fromEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID") ??
    fromWebAppConfig("projectId") ??
    defaults.projectId,
  storageBucket:
    fromEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET") ??
    fromEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET") ??
    fromWebAppConfig("storageBucket") ??
    defaults.storageBucket,
  messagingSenderId:
    fromEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") ??
    fromEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") ??
    fromWebAppConfig("messagingSenderId") ??
    defaults.messagingSenderId,
  appId:
    fromEnv("NEXT_PUBLIC_FIREBASE_APP_ID") ??
    fromEnv("EXPO_PUBLIC_FIREBASE_APP_ID") ??
    fromWebAppConfig("appId") ??
    defaults.appId,
  measurementId:
    fromEnv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID") ??
    fromEnv("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID") ??
    fromWebAppConfig("measurementId") ??
    defaults.measurementId,
};
