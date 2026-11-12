import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const env = import.meta.env;

export const usingEmulators = env.VITE_USE_EMULATORS === '1';
export const isConfigured = Boolean(env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY);

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'missing',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'missing',
  appId: env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);

function localCache() {
  try {
    // Keeps data on the phone so the app works offline and queues changes.
    return persistentLocalCache({ tabManager: persistentMultipleTabManager() });
  } catch {
    return memoryLocalCache();
  }
}

export const db = initializeFirestore(app, { localCache: localCache(), ignoreUndefinedProperties: true });

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
