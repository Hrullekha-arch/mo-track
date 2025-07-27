import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration for AUTHENTICATION (mo-track)
// This is the primary app for user login/logout.
export const firebaseConfig = {
  apiKey: "AIzaSyBIxEw7lvRvGSkTuabAENTn2mH6-oFaUmE",
  authDomain: "mo-track-a5a5c.firebaseapp.com",
  projectId: "mo-track-a5a5c",
  storageBucket: "mo-track-a5a5c.appspot.com",
  messagingSenderId: "1055591391763",
  appId: "1:1055591391763:web:9e13933c873f08c3f4e9e7",
  measurementId: "G-9XG86MJY7E"
};

// Your web app's Firebase configuration for DATABASE (mo-panel)
// This is the secondary app for all Firestore data.
const dbFirebaseConfig = {
  apiKey: "AIzaSyA1HAseuKX45_j6pUUJhEwGxbtCUW_OnLw",
  authDomain: "mo-panel.firebaseapp.com",
  projectId: "mo-panel",
  storageBucket: "mo-panel.appspot.com",
  messagingSenderId: "616662408646",
  appId: "1:616662408646:web:bf730cfb0b9d8de0b326c7",
  measurementId: "G-M7M6X69SNF"
};


// Initialize Firebase
let app: FirebaseApp;
let dbApp: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  dbApp = initializeApp(dbFirebaseConfig, 'dbApp');
} else {
  app = getApp();
  dbApp = getApp('dbApp');
}

const db = getFirestore(dbApp);
const auth = getAuth(app);

export { app, db, auth };
