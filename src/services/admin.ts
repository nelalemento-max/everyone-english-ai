import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { SubscriptionStatus } from '../types';

export async function setUserAccess(
  targetUid: string,
  subscriptionStatus: SubscriptionStatus,
) {
  if (!functions) throw new Error('Firebase todavía no está configurado.');
  const call = httpsCallable(functions, 'adminSetUserAccess');
  const result = await call({ targetUid, subscriptionStatus });
  return result.data;
}
