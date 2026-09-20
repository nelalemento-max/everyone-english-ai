export type CefrLevel = 'A1' | 'A2' | 'B1';
export type UserRole = 'student' | 'admin';
export type SubscriptionStatus = 'trial' | 'active' | 'complimentary' | 'blocked';

export type NewWord = {
  word: string;
  meaningEs: string;
};

export type ConversationTurn = {
  transcript: string;
  reply: string;
  correction?: string | null;
  explanationEs?: string | null;
  tipEs?: string | null;
  level: CefrLevel;
  newWords: NewWord[];
  audioBase64?: string;
};

export type LearnerProfile = {
  level: CefrLevel;
  displayName: string;
  email?: string;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt?: any;
  totalTurns: number;
  totalMinutes: number;
  streak: number;
  vocabularyCount: number;
  lastTopic: string;
};
