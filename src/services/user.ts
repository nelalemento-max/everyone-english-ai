import { callBackend } from './backend';
import { LearnerProfile } from '../types';

export async function initializeUserProfile(displayName?: string) {
  const result = await callBackend<{ profile: LearnerProfile }>('bootstrap', {
    displayName: displayName || '',
  });
  return result.profile;
}

export async function fetchUserProfile() {
  const result = await callBackend<{ profile: LearnerProfile }>('profile');
  return result.profile;
}
