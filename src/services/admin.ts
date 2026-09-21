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

export type AdminCostUser = {
  id: string;
  displayName: string;
  role?: string;
  subscriptionStatus?: string;
  turns: number;
  speakingMinutes: number;
  aiCostUsd: number;
  avgCostPerTurnUsd: number;
  projectedNormalMonthlyUsd: number;
  activeDays: number;
};

export type AdminAnalytics = {
  sampleUsers: number;
  totalTurns: number;
  totalAiCostUsd: number;
  averageCostPerTurnUsd: number;
  averageCostPerUserObservedUsd: number;
  scenarios: {
    lightMonthlyUsd: number;
    normalMonthlyUsd: number;
    intensiveMonthlyUsd: number;
  };
  referenceMonthlyPriceUsd: number;
  budget100UsersUsd: number;
  safetyBufferPercent: number;
  referenceMarkup: number;
  breakdown: {
    transcribeUsd: number;
    llmUsd: number;
    ttsUsd: number;
  };
  perUser: AdminCostUser[];
  rateVersion: string;
  note: string;
};

export async function listAdminUsers() {
  const result = await callBackend<{ users: AdminUser[] }>('adminList');
  return result.users;
}

export async function getAdminAnalytics() {
  const result = await callBackend<{ analytics: AdminAnalytics }>('adminAnalytics');
  return result.analytics;
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
