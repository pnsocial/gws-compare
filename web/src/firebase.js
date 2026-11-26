import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore/lite';

// Cấu hình web lấy từ .env.local (không commit). Xem .env.example.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// TODO: App Check (reCAPTCHA Enterprise) làm sau, theo kế hoạch.
export const db = getFirestore(initializeApp(config));
