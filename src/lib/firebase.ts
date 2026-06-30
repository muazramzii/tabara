import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ───────────────────────────────────────────────────────────────
// SETUP (do this once):
// 1. Create a project at https://console.firebase.google.com
// 2. Add a *Web* app, copy its config, paste the values below.
// 3. In the console, enable:
//      - Authentication  -> Sign-in method -> Email/Password
//      - Firestore Database (start in test mode for now)
//      - Storage
// ───────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Guard against re-initialising during Fast Refresh
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// initializeAuth + AsyncStorage = users stay logged in between app reloads
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
