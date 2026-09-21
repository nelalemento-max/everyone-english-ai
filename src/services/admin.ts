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
  monthlyPriceOverrideUsd?: number | null;
  monthlyPriceNote?: string;
  lastPracticeLanguage?: 'en' | 'es' | 'fr';
};

export type AdminLanguageUsage = {
  turns: number;
  costUsd: number;
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
  currentMonthTurns: number;
  currentMonthAiCostUsd: number;
  projectedMonthlyAiCostUsd: number;
  suggestedMonthlyPriceUsd: number;
  monthlyPriceOverrideUsd?: number | null;
  monthlyPriceNote?: string;
  effectiveMonthlyPriceUsd: number;
  effectiveMonthlyPriceBob?: number | null;
  activeDays: number;
  currentMonthActiveDays: number;
  languages: {
    en: AdminLanguageUsage;
    es: AdminLanguageUsage;
    fr: AdminLanguageUsage;
  };
};

export type AdminInvestment = {
  id: string;
  provider: string;
  amountUsd: number;
  exchangeRateBobPerUsd?: number | null;
  amountBob?: number | null;
  purchasedAt: string;
  note: string;
};

export type AdminAnalytics = {
  month: string;
  sampleUsers: number;
  totalTurns: number;
  totalAiCostUsd: number;
  currentMonthAiCostUsd: number;
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
  settings: {
    exchangeRateBobPerUsd?: number | null;
    pricingMarkup: number;
    safetyBufferPercent: number;
    normalTurnsPerDay: number;
  };
  investments: AdminInvestment[];
  investmentSummary: {
    totalInvestedUsd: number;
    totalInvestedBob: number;
    estimatedRemainingUsd: number;
  };
  breakdown: {
    transcribeUsd: number;
    llmUsd: number;
    ttsUsd: number;
  };
  languageTotals: {
    en: AdminLanguageUsage;
    es: AdminLanguageUsage;
    fr: AdminLanguageUsage;
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

export async function updateBusinessSettings(input: {
  exchangeRateBobPerUsd?: number | null;
  pricingMarkup: number;
  safetyBufferPercent: number;
  normalTurnsPerDay: number;
}) {
  return callBackend('adminUpdateBusinessSettings', input);
}

export async function addAiInvestment(input: {
  amountUsd: number;
  exchangeRateBobPerUsd?: number | null;
  provider?: string;
  purchasedAt?: string;
  note?: string;
}) {
  return callBackend('adminAddInvestment', input);
}

export async function setUserMonthlyPrice(
  targetUid: string,
  monthlyPriceOverrideUsd: number | null,
  note = '',
) {
  return callBackend('adminSetUserPrice', {
    targetUid,
    monthlyPriceOverrideUsd,
    note,
  });
}
