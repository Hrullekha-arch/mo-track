import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Config for mo-track (Authentication)
const authFirebaseConfig = {
  apiKey: "YOUR_MO_TRACK_API_KEY", // Replace with your actual mo-track API key
  authDomain: "mo-track-project-id.firebaseapp.com", // Replace with your mo-track authDomain
  projectId: "mo-track-project-id", // Replace with your mo-track projectId
  storageBucket: "mo-track-project-id.appspot.com",
  messagingSenderId: "YOUR_MO_TRACK_MESSAGING_SENDER_ID",
  appId: "YOUR_MO_TRACK_APP_ID"
};

// Config for mo-panel (Database)
const dbFirebaseConfig = {
  apiKey: "AIzaSyA1HAseuKX45_j6pUUJhEwGxbtCUW_OnLw",
  authDomain: "mo-panel.firebaseapp.com",
  projectId: "mo-panel",
  storageBucket: "mo-panel.appspot.com",
  messagingSenderId: "616662408646",
  appId: "1:616662408646:web:bf730cfb0b9d8de0b326c7",
  measurementId: "G-M7M6X69SNF"
};


// Initialize Firebase apps
let authApp: FirebaseApp;
let dbApp: FirebaseApp;

if (!getApps().length) {
  // Initialize the auth app as the default app
  authApp = initializeApp(authFirebaseConfig);
  // Initialize the db app with a unique name
  dbApp = initializeApp(dbFirebaseConfig, "dbApp");
} else {
  authApp = getApp();
  dbApp = getApp("dbApp");
}

const auth = getAuth(authApp);
const db = getFirestore(dbApp);

export { auth, db };
