import {
  initializeApp,
  getApps,
  getApp,
  FirebaseApp,
  FirebaseOptions,
} from "firebase/app";
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const readFirebaseWebAppConfig = (): Partial<FirebaseOptions> => {
  const raw = process.env.FIREBASE_WEBAPP_CONFIG;
  if (!raw) return {};

  try {
    return JSON.parse(raw) as FirebaseOptions;
  } catch {
    return {};
  }
};

const webAppConfig = readFirebaseWebAppConfig();

const defaults = {
  apiKey: "AIzaSyBUb3wNulHplcgEkuqpv2K5v711K7hxLzo",
  authDomain: "studio-3799785967-d0d9d.firebaseapp.com",
  projectId: "studio-3799785967-d0d9d",
  storageBucket: "studio-3799785967-d0d9d.firebasestorage.app",
  messagingSenderId: "190186132582",
  appId: "1:190186132582:web:a384cfd7d537547b7a09a7",
  measurementId: "G-M7M6X69SNF",
};

const firebaseConfig: FirebaseOptions = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ??
    webAppConfig.apiKey ??
    defaults.apiKey,
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    webAppConfig.authDomain ??
    defaults.authDomain,
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ??
    webAppConfig.projectId ??
    defaults.projectId,
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    webAppConfig.storageBucket ??
    defaults.storageBucket,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
    webAppConfig.messagingSenderId ??
    defaults.messagingSenderId,
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ??
    webAppConfig.appId ??
    defaults.appId,
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ??
    process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ??
    webAppConfig.measurementId ??
    defaults.measurementId,
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth = getAuth(app);

// Enable offline persistence so the app serves from cache when internet is unavailable
let db: Firestore;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  db = getFirestore(app);
}

const storage = getStorage(app);

export { auth, db, storage };
