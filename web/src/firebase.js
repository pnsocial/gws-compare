import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore/lite';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

// Cấu hình web lấy từ .env.local (không commit). Xem .env.example.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(config);

// App Check (reCAPTCHA Enterprise). Site key là khóa công khai, nằm trong bundle là bình thường.
// Đang ở chế độ monitor: Firestore chưa enforce, nên thiếu token không chặn đọc.
const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (siteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true
  });
}

export const db = getFirestore(app);
