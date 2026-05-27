/**
 * FIREBASE INITIALIZATION AND HANDLERS
 */

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, onValue, off, Database } from 'firebase/database';

export const firebaseConfig = {
  apiKey: "AIzaSyB7z5w4fgNw1QTV-Cx37j-m8r8I94J1Vuk",
  authDomain: "alertacentral-9ba4f.firebaseapp.com",
  databaseURL: "https://alertacentral-9ba4f-default-rtdb.firebaseio.com",
  projectId: "alertacentral-9ba4f",
  storageBucket: "alertacentral-9ba4f.firebasestorage.app",
  messagingSenderId: "770130153303",
  appId: "1:770130153303:web:ade358f215f5a7c46f3812"
};

let db: Database | null = null;
let initialised = false;

try {
  // Suppress duplicate app errors during hot reloads
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  db = getDatabase(app);
  initialised = true;
} catch (e) {
  console.warn("Firebase Realtime Database initialization failed. Playing in Safety Fallback (Local Simulation Mode).", e);
}

export { db, initialised };
export { ref, set, onValue, off };
