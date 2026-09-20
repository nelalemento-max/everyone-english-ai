import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore();
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const REGION = 'southamerica-east1';
const TRIAL_HOURS = 48;

type TutorReply = {
  reply: string;
  correction: string | null;
  explanation_es: string | null;
  tip_es: string;
  level: 'A1' | 'A2' | 'B1';
  new_words: Array<{ word: string; meaning_es: string }>;
  topic: string;
};

const tutorInstructions = `
You are Emma, a warm AI English conversation coach inside the app Everyone English.
The learner's native support language is Spanish, but the conversation itself should be primarily in English.
This app is NOT a rigid lesson course. Keep a natural conversation going about the learner's real life, interests, work, travel, family, business, or whatever they choose.
Adapt continuously between CEFR A1, A2 and B1.

Rules:
- Reply in clear, natural English, usually 1 to 3 short sentences, and normally end with ONE easy follow-up question.
- If the learner is A1, use very short sentences, common words and slower-friendly phrasing.
- Never overwhelm the learner with corrections. Correct at most ONE important mistake per turn.
- Prefer reformulation: continue the conversation while showing a more natural version.
- explanation_es and tip_es must be short Spanish explanations.
- If the learner's sentence is already natural, correction must be null.
- If the learner writes Spanish because they do not know how to say something, teach the English phrase and invite them to try it.
- Do not make the learner feel tested. No grades and no scolding.
- Estimate the learner level conservatively from the current and recent turns.
- Return strict JSON only, with this shape:
{
  "reply":"...",
  "correction":null,
  "explanation_es":null,
  "tip_es":"...",
  "level":"A1",
  "new_words":[{"word":"...","meaning_es":"..."}],
  "topic":"..."
}
`;

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const pieces: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') pieces.push(content.text);
    }
  }
  return pieces.join('\n').trim();
}

function cleanJson(text: string): TutorReply {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(trimmed);
  return {
    reply: String(parsed.reply || 'Tell me a little more.'),
    correction: parsed.correction ? String(parsed.correction) : null,
    explanation_es: parsed.explanation_es ? String(parsed.explanation_es) : null,
    tip_es: String(parsed.tip_es || 'Sigue hablando; la fluidez llega con práctica frecuente.'),
    level: ['A1', 'A2', 'B1'].includes(parsed.level) ? parsed.level : 'A1',
    new_words: Array.isArray(parsed.new_words)
      ? parsed.new_words
          .slice(0, 3)
          .map((item: any) => ({
            word: String(item.word || ''),
            meaning_es: String(item.meaning_es || ''),
          }))
          .filter((item: any) => item.word)
      : [],
    topic: String(parsed.topic || 'Anything'),
  };
}

async function ensureProfileDocument(
  uid: string,
  authToken: any,
  displayName = '',
) {
  const userRef = db.collection('users').doc(uid);
  const snapshot = await userRef.get();

  if (!snapshot.exists) {
    const now = Timestamp.now();
    const trialEndsAt = Timestamp.fromMillis(
      now.toMillis() + TRIAL_HOURS * 60 * 60 * 1000,
    );

    const email = typeof authToken?.email === 'string' ? authToken.email : '';
    const fallbackName = email ? email.split('@')[0] : 'Student';

    const profile = {
      displayName: displayName || authToken?.name || fallbackName,
      email,
      role: 'student',
      subscriptionStatus: 'trial',
      trialStartedAt: now,
      trialEndsAt,
      level: 'A1',
      totalTurns: 0,
      totalMinutes: 0,
      streak: 1,
      vocabularyCount: 0,
      lastTopic: 'Anything',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    await userRef.set(profile);
    return profile;
  }

  const existing = snapshot.data() || {};
  const patch: Record<string, any> = {
    lastLoginAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!existing.role) patch.role = 'student';
  if (!existing.subscriptionStatus) patch.subscriptionStatus = 'trial';
  if (!existing.trialStartedAt || !existing.trialEndsAt) {
    const now = Timestamp.now();
    patch.trialStartedAt = now;
    patch.trialEndsAt = Timestamp.fromMillis(
      now.toMillis() + TRIAL_HOURS * 60 * 60 * 1000,
    );
  }
  if (!existing.email && authToken?.email) patch.email = authToken.email;
  if (!existing.displayName && displayName) patch.displayName = displayName;

  await userRef.set(patch, { merge: true });
  const refreshed = await userRef.get();
  return refreshed.data() || existing;
}

function hasPaidOrFreeAccess(profile: any) {
  if (profile?.role === 'admin') return true;
  if (profile?.subscriptionStatus === 'active') return true;
  if (profile?.subscriptionStatus === 'complimentary') return true;

  if (profile?.subscriptionStatus === 'trial') {
    const trialEndsAt = profile?.trialEndsAt;
    const endMillis =
      typeof trialEndsAt?.toMillis === 'function'
        ? trialEndsAt.toMillis()
        : Number(trialEndsAt?.seconds || 0) * 1000;
    return endMillis > Date.now();
  }

  return false;
}

async function openAiJson(apiKey: string, path: string, body: any) {
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `OpenAI ${path}: ${response.status} ${message.slice(0, 500)}`,
    );
  }

  return response.json();
}

async function transcribe(
  apiKey: string,
  audioBase64: string,
  mimeType: string,
) {
  const buffer = Buffer.from(audioBase64, 'base64');
  const form = new FormData();
  const extension = mimeType.includes('webm') ? 'webm' : 'm4a';

  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    `learner.${extension}`,
  );
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', 'en');
  form.append(
    'prompt',
    'English learner conversation. Keep imperfect learner wording when audible.',
  );

  const response = await fetch(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `OpenAI transcription: ${response.status} ${message.slice(0, 500)}`,
    );
  }

  const json: any = await response.json();
  return String(json.text || '').trim();
}

async function synthesize(apiKey: string, text: string, level: string) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'coral',
      input: text.slice(0, 1800),
      response_format: 'mp3',
      speed: level === 'A1' ? 0.88 : level === 'A2' ? 0.94 : 1.0,
      instructions:
        'Warm, patient English conversation coach. Clear pronunciation, friendly and natural, never robotic.',
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `OpenAI speech: ${response.status} ${message.slice(0, 500)}`,
    );
  }

  return Buffer.from(await response.arrayBuffer()).toString('base64');
}

export const initializeUserProfile = onCall(
  { region: REGION, cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in is required.');
    }

    const displayName =
      typeof request.data?.displayName === 'string'
        ? request.data.displayName.trim().slice(0, 80)
        : '';

    const profile = await ensureProfileDocument(
      request.auth.uid,
      request.auth.token,
      displayName,
    );

    return {
      role: profile.role || 'student',
      subscriptionStatus: profile.subscriptionStatus || 'trial',
      trialEndsAt: profile.trialEndsAt || null,
    };
  },
);


export const adminSetUserAccess = onCall(
  { region: REGION, cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in is required.');
    }

    const callerRef = db.collection('users').doc(request.auth.uid);
    const callerSnap = await callerRef.get();
    const caller = callerSnap.data();

    if (!caller || caller.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Administrator access is required.');
    }

    const targetUid =
      typeof request.data?.targetUid === 'string'
        ? request.data.targetUid.trim()
        : '';

    const subscriptionStatus =
      typeof request.data?.subscriptionStatus === 'string'
        ? request.data.subscriptionStatus
        : '';

    const allowedStatuses = ['trial', 'active', 'complimentary', 'blocked'];

    if (!targetUid || !allowedStatuses.includes(subscriptionStatus)) {
      throw new HttpsError('invalid-argument', 'Invalid user or access status.');
    }

    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();

    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'User not found.');
    }

    const target = targetSnap.data() || {};
    if (target.role === 'admin') {
      throw new HttpsError('failed-precondition', 'Administrator access is managed separately.');
    }

    await targetRef.set(
      {
        subscriptionStatus,
        accessUpdatedAt: FieldValue.serverTimestamp(),
        accessUpdatedBy: request.auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { ok: true, targetUid, subscriptionStatus };
  },
);

export const conversationTurn = onCall(
  {
    region: REGION,
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in is required.');
    }

    const uid = request.auth.uid;
    const userRef = db.collection('users').doc(uid);
    const profile = await ensureProfileDocument(
      uid,
      request.auth.token,
      '',
    );

    if (!hasPaidOrFreeAccess(profile)) {
      if (profile.subscriptionStatus === 'trial') {
        await userRef.set(
          {
            subscriptionStatus: 'blocked',
            blockedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      throw new HttpsError(
        'permission-denied',
        'Tu prueba gratuita terminó. Activa tu suscripción para seguir practicando.',
      );
    }

    const data = request.data || {};
    const audioBase64 =
      typeof data.audioBase64 === 'string' ? data.audioBase64 : '';
    const typedText =
      typeof data.text === 'string' ? data.text.trim().slice(0, 1500) : '';
    const mimeType =
      typeof data.mimeType === 'string' ? data.mimeType : 'audio/m4a';
    const requestedLevel = ['A1', 'A2', 'B1'].includes(data.level)
      ? data.level
      : 'A1';
    const requestedTopic =
      typeof data.topic === 'string' ? data.topic.slice(0, 80) : 'Anything';
    const seconds = Math.max(0, Math.min(60, Number(data.seconds || 0)));

    if (!typedText && !audioBase64) {
      throw new HttpsError(
        'invalid-argument',
        'Audio or text is required.',
      );
    }

    if (audioBase64.length > 6_000_000) {
      throw new HttpsError(
        'invalid-argument',
        'Audio turn is too long. Keep turns under about 45 seconds.',
      );
    }

    const apiKey = OPENAI_API_KEY.value();
    const transcript =
      typedText || (await transcribe(apiKey, audioBase64, mimeType));

    if (!transcript) {
      throw new HttpsError(
        'invalid-argument',
        'I could not hear any words. Please try again.',
      );
    }

    const turnsRef = userRef.collection('turns');
    const recentSnap = await turnsRef
      .orderBy('createdAt', 'desc')
      .limit(6)
      .get();

    const recent = recentSnap.docs
      .reverse()
      .map((turnDoc) => {
        const t = turnDoc.data();
        return `Learner: ${t.transcript || ''}\nEmma: ${t.reply || ''}`;
      })
      .join('\n\n');

    const response: any = await openAiJson(apiKey, 'responses', {
      model: 'gpt-5-mini',
      instructions: tutorInstructions,
      input: `Current estimated level: ${requestedLevel}\nPreferred topic: ${requestedTopic}\n\nRecent conversation:\n${recent || '(first turn)'}\n\nLearner now says:\n${transcript}`,
      max_output_tokens: 420,
    });

    let tutor: TutorReply;

    try {
      tutor = cleanJson(extractResponseText(response));
    } catch {
      tutor = {
        reply:
          extractResponseText(response) ||
          'Great. Tell me a little more about that.',
        correction: null,
        explanation_es: null,
        tip_es: 'Sigue la conversación con frases cortas y claras.',
        level: requestedLevel,
        new_words: [],
        topic: requestedTopic,
      };
    }

    const audio = await synthesize(apiKey, tutor.reply, tutor.level);
    const now = FieldValue.serverTimestamp();
    const wordsAdded = tutor.new_words.length;

    await turnsRef.add({
      transcript,
      reply: tutor.reply,
      correction: tutor.correction,
      explanationEs: tutor.explanation_es,
      tipEs: tutor.tip_es,
      level: tutor.level,
      topic: tutor.topic,
      newWords: tutor.new_words,
      seconds,
      createdAt: now,
    });

    await userRef.set(
      {
        level: tutor.level,
        lastTopic: tutor.topic,
        totalTurns: FieldValue.increment(1),
        totalMinutes: FieldValue.increment(seconds / 60),
        vocabularyCount: FieldValue.increment(wordsAdded),
        updatedAt: now,
      },
      { merge: true },
    );

    return {
      transcript,
      reply: tutor.reply,
      correction: tutor.correction,
      explanationEs: tutor.explanation_es,
      tipEs: tutor.tip_es,
      level: tutor.level,
      newWords: tutor.new_words.map((item) => ({
        word: item.word,
        meaningEs: item.meaning_es,
      })),
      audioBase64: audio,
    };
  },
);
