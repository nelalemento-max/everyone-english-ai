import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export async function initializeUserProfile(displayName?: string) {
  if (!functions) throw new Error('Firebase todavía no está configurado.');
  const call = httpsCallable(functions, 'initializeUserProfile');
  const result = await call({ displayName: displayName || '' });
  return result.data;
}
