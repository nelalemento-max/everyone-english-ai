import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);

export let auth: FirebaseAuth.Auth | null = null;

if (firebaseConfigured) {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  if (Platform.OS === 'web') {
    auth = FirebaseAuth.getAuth(app);
  } else {
    try {
      // Firebase's React Native implementation exports this at runtime, but
      // some Expo/Firebase 12 TypeScript resolutions omit it from the public
      // type surface. Accessing it through the module keeps RN persistence
      // without breaking the Expo app typecheck.
      const getReactNativePersistence = (
        FirebaseAuth as typeof FirebaseAuth & {
          getReactNativePersistence?: (storage: typeof AsyncStorage) => FirebaseAuth.Persistence;
        }
      ).getReactNativePersistence;

      if (!getReactNativePersistence) {
        auth = FirebaseAuth.getAuth(app);
      } else {
        auth = FirebaseAuth.initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
      }
    } catch {
      auth = FirebaseAuth.getAuth(app);
    }
  }
}
