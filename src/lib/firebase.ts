import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  // @ts-ignore - exists in the RN bundle, missing from web type defs
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyCrDPMWTI4oVkiXjCWOm2aRq6zN71EHsh0",
  authDomain: "tabara-66365.firebaseapp.com",
  projectId: "tabara-66365",
  storageBucket: "tabara-66365.firebasestorage.app",
  messagingSenderId: "272721127882",
  appId: "1:272721127882:web:cf88289c744482b9888733",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialise auth once; if it's already been set up (e.g. after Fast
// Refresh), reuse the existing instance instead of crashing.
let auth: Auth;
try {
  auth =
    Platform.OS === "web"
      ? getAuth(app)
      : initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
} catch {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;