import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration for mo-panel
export const firebaseConfig = {
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

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
