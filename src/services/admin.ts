import { callBackend } from './backend';
import { SubscriptionStatus } from '../types';

export type AdminUser = {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  subscriptionStatus?: SubscriptionStatus;
  level?: string;
  totalTurns?: number;
  trialEndsAt?: string | null;
  createdAt?: string | null;
};

export async function listAdminUsers() {
  const result = await callBackend<{ users: AdminUser[] }>('adminList');
  return result.users;
}

export async function setUserAccess(
  targetUid: string,
  subscriptionStatus: SubscriptionStatus,
) {
  return callBackend('adminSetAccess', {
    targetUid,
    subscriptionStatus,
  });
}
