import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { decodeProtectedHeader, importX509, jwtVerify } from "npm:jose@6.1.0";

const FIREBASE_PROJECT_ID = "everyone-english-ai";
const ADMIN_EMAIL = "nelalemento@gmail.com";
const TRIAL_HOURS = 48;

const PRACTICE_LANGUAGES = {
  en: {
    name: "English",
    transcriptionCode: "en",
    example: "I like coffee.",
    strictRule:
      "Use English ONLY for reply, correction, suggested_reply and new_words.word. Do not switch to Spanish or French unless the learner explicitly asks for a translation.",
    fallbackReply: "Tell me a little more.",
    ttsInstruction:
      "Warm, patient English language tutor. Speak clearly, naturally and encouragingly.",
  },
  es: {
    name: "Spanish",
    transcriptionCode: "es",
    example: "Me gusta el café.",
    strictRule:
      "Use Spanish ONLY for reply, correction, suggested_reply and new_words.word. Do not switch to English or French, even if earlier conversation used another language. Only explanation_es and tip_es are also Spanish support.",
    fallbackReply: "Cuéntame un poco más.",
    ttsInstruction:
      "Tutora cálida y paciente de español. Habla en español claro, natural y alentador.",
  },
  fr: {
    name: "French",
    transcriptionCode: "fr",
    example: "J'aime le café.",
    strictRule:
      "Use French ONLY for reply, correction, suggested_reply and new_words.word. Do not switch to English or Spanish, even if earlier conversation used another language. explanation_es and tip_es remain brief Spanish support.",
    fallbackReply: "Dis-m'en un peu plus.",
    ttsInstruction:
      "Professeure de français chaleureuse et patiente. Parle en français clair, naturel et encourageant.",
  },
} as const;

const AI_COST_RATES = {
  llmInputPerMillion: 0.20,
  llmOutputPerMillion: 1.20,
  transcribeInputPerMillion: 1.25,
  transcribeOutputPerMillion: 5.00,
  transcribePerMinuteFallback: 0.003,
  ttsInputPerMillion: 0.60,
  ttsAudioOutputPerMillion: 12.00,
  rateVersion: "2026-09-21",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type FirebaseIdentity = {
  uid: string;
  email: string;
  name: string;
};

type TutorReply = {
  reply: string;
  correction: string | null;
  explanation_es: string | null;
  tip_es: string;
  level: "A1" | "A2" | "B1";
  new_words: Array<{ word: string; meaning_es: string }>;
  topic: string;
  suggested_reply: string | null;
};

let certCache: Record<string, string> | null = null;
let certCacheUntil = 0;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let secret = legacy ?? "";

  if (!secret) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
      secret = keys.default ?? Object.values(keys)[0] ?? "";
    } catch {
      secret = "";
    }
  }

  if (!url || !secret) throw new Error("Supabase server credentials unavailable.");
  return createClient(url, String(secret), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getFirebaseCerts() {
  if (certCache && Date.now() < certCacheUntil) return certCache;

  const response = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
  );
  if (!response.ok) throw new Error("Could not load Firebase signing certificates.");

  const certs = await response.json() as Record<string, string>;
  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? "3600");

  certCache = certs;
  certCacheUntil = Date.now() + Math.max(300, maxAge - 60) * 1000;
  return certs;
}

async function verifyFirebaseRequest(req: Request): Promise<FirebaseIdentity> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  const token = authHeader.slice(7).trim();
  if (!token) throw new Error("AUTH_REQUIRED");

  const header = decodeProtectedHeader(token);
  if (!header.kid || header.alg !== "RS256") throw new Error("AUTH_INVALID");

  const certs = await getFirebaseCerts();
  const cert = certs[String(header.kid)];
  if (!cert) {
    certCacheUntil = 0;
    const refreshed = await getFirebaseCerts();
    if (!refreshed[String(header.kid)]) throw new Error("AUTH_INVALID");
  }

  const activeCert = (await getFirebaseCerts())[String(header.kid)];
  const key = await importX509(activeCert, "RS256");
  const issuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

  const { payload } = await jwtVerify(token, key, {
    algorithms: ["RS256"],
    audience: FIREBASE_PROJECT_ID,
    issuer,
  });

  const uid = String(payload.sub ?? "");
  if (!uid) throw new Error("AUTH_INVALID");

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    typeof payload.auth_time === "number" &&
    payload.auth_time > nowSeconds + 60
  ) {
    throw new Error("AUTH_INVALID");
  }

  return {
    uid,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : "",
    name: typeof payload.name === "string" ? payload.name : "",
  };
}

async function ensureProfile(
  supabase: ReturnType<typeof adminClient>,
  identity: FirebaseIdentity,
  displayName = "",
) {
  const { data: existing, error: readError } = await supabase
    .from("app_users")
    .select("*")
    .eq("firebase_uid", identity.uid)
    .maybeSingle();

  if (readError) throw readError;

  if (!existing) {
    const now = new Date();
    const trialEnds = new Date(now.getTime() + TRIAL_HOURS * 60 * 60 * 1000);
    const isAdmin = identity.email === ADMIN_EMAIL;

    const row = {
      firebase_uid: identity.uid,
      email: identity.email,
      display_name:
        displayName.trim().slice(0, 80) ||
        identity.name ||
        identity.email.split("@")[0] ||
        "Student",
      role: isAdmin ? "admin" : "student",
      subscription_status: isAdmin ? "complimentary" : "trial",
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnds.toISOString(),
      last_login_at: now.toISOString(),
    };

    const { data, error } = await supabase
      .from("app_users")
      .insert(row)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const patch: Record<string, unknown> = {
    last_login_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!existing.email && identity.email) patch.email = identity.email;
  if (!existing.display_name && displayName) {
    patch.display_name = displayName.trim().slice(0, 80);
  }

  if (identity.email === ADMIN_EMAIL && existing.role !== "admin") {
    patch.role = "admin";
    patch.subscription_status = "complimentary";
  }

  if (Object.keys(patch).length > 0) {
    const { data, error } = await supabase
      .from("app_users")
      .update(patch)
      .eq("firebase_uid", identity.uid)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  return existing;
}

function hasAccess(profile: any) {
  if (profile?.role === "admin") return true;
  if (profile?.subscription_status === "complimentary") return true;
  if (profile?.subscription_status === "active") {
    if (!profile?.subscription_paid_until) return true;
    const paidUntil = new Date(String(profile.subscription_paid_until) + "T23:59:59Z").getTime();
    return paidUntil >= Date.now();
  }
  if (profile?.subscription_status !== "trial") return false;
  return new Date(profile.trial_ends_at).getTime() > Date.now();
}

function publicProfile(profile: any) {
  return {
    displayName: profile.display_name ?? "",
    email: profile.email ?? "",
    role: profile.role ?? "student",
    subscriptionStatus: profile.subscription_status ?? "trial",
    trialEndsAt: profile.trial_ends_at ?? null,
    level: profile.level ?? "A1",
    totalTurns: Number(profile.total_turns ?? 0),
    totalMinutes: Number(profile.total_minutes ?? 0),
    streak: Number(profile.streak ?? 1),
    vocabularyCount: Number(profile.vocabulary_count ?? 0),
    lastTopic: profile.last_topic ?? "Anything",
    lastPracticeLanguage: profile.last_practice_language ?? "en",
    subscriptionPaidUntil: profile.subscription_paid_until ?? null,
  };
}

async function openAiJson(apiKey: string, path: string, body: any) {
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OPENAI_${response.status}: ${message.slice(0, 400)}`);
  }

  return response.json();
}

async function transcribe(apiKey: string, audioBase64: string, mimeType: string, languageCode: string) {
  const bytes = Uint8Array.from(atob(audioBase64), (char) => char.charCodeAt(0));
  const form = new FormData();
  const extension = mimeType.includes("webm") ? "webm" : "m4a";
  form.append("file", new Blob([bytes], { type: mimeType }), `learner.${extension}`);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", languageCode);
  form.append("prompt", "English learner conversation. Keep imperfect learner wording when audible.");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OPENAI_TRANSCRIBE_${response.status}: ${message.slice(0, 400)}`);
  }
  const result = await response.json();
  return {
    text: String(result.text ?? "").trim(),
    inputTokens: Number(result?.usage?.input_tokens ?? 0),
    outputTokens: Number(result?.usage?.output_tokens ?? 0),
  };
}

async function synthesize(
  apiKey: string,
  text: string,
  level: string,
  language: keyof typeof PRACTICE_LANGUAGES,
) {
  const speed = level === "A1" ? 0.82 : level === "A2" ? 0.92 : 1;
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: text.slice(0, 1600),
      response_format: "mp3",
      speed,
      instructions:
        level === "A1"
          ? `${PRACTICE_LANGUAGES[language].ttsInstruction} Speak a little slowly, with short natural pauses and simple pronunciation for a beginner.`
          : PRACTICE_LANGUAGES[language].ttsInstruction,
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OPENAI_TTS_${response.status}: ${message.slice(0, 400)}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  const words = Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
  const estimatedSeconds = words / (2.5 * speed);
  const inputTokensEst = Math.max(1, Math.ceil(text.length / 4));
  const audioTokensEst = Math.max(1, Math.ceil(estimatedSeconds * 20));
  const estimatedCostUsd =
    (inputTokensEst * AI_COST_RATES.ttsInputPerMillion / 1_000_000) +
    (audioTokensEst * AI_COST_RATES.ttsAudioOutputPerMillion / 1_000_000);

  return { audioBase64: btoa(binary), inputTokensEst, audioTokensEst, estimatedCostUsd };
}

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const pieces: string[] = [];
  for (const item of payload?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (typeof part?.text === "string") pieces.push(part.text);
    }
  }
  return pieces.join("\n").trim();
}

function cleanTutorJson(
  text: string,
  fallbackLevel: string,
  fallbackTopic: string,
  language: keyof typeof PRACTICE_LANGUAGES,
): TutorReply {
  const fallbackReply = PRACTICE_LANGUAGES[language].fallbackReply;
  try {
    const trimmed = text
      .trim()
      .replace(/^\`\`\`json\s*/i, "")
      .replace(/\`\`\`$/i, "")
      .trim();
    const parsed = JSON.parse(trimmed);

    return {
      reply: String(parsed.reply || fallbackReply),
      correction: parsed.correction ? String(parsed.correction) : null,
      explanation_es: parsed.explanation_es ? String(parsed.explanation_es) : null,
      tip_es: String(parsed.tip_es || "Sigue hablando con frases cortas y claras."),
      level: ["A1", "A2", "B1"].includes(parsed.level)
        ? parsed.level
        : fallbackLevel as any,
      new_words: Array.isArray(parsed.new_words)
        ? parsed.new_words
            .slice(0, 3)
            .map((item: any) => ({
              word: String(item.word || ""),
              meaning_es: String(item.meaning_es || ""),
            }))
            .filter((item: any) => item.word)
        : [],
      topic: String(parsed.topic || fallbackTopic),
      suggested_reply: parsed.suggested_reply ? String(parsed.suggested_reply) : null,
    };
  } catch {
    return {
      reply: text || fallbackReply,
      correction: null,
      explanation_es: null,
      tip_es: "Sigue hablando con frases cortas y claras.",
      level: (["A1", "A2", "B1"].includes(fallbackLevel) ? fallbackLevel : "A1") as any,
      new_words: [],
      topic: fallbackTopic,
      suggested_reply: null,
    };
  }
}

const tutorInstructions = `
You are Emma, a warm AI language conversation coach inside Everyone English.
The learner may choose to practice English, Spanish, or French.
There are no rigid lessons. Keep a natural conversation going about the learner's real life and interests.
Adapt continuously from CEFR A1 through B1.

Rules:
- The selected target practice language is a HARD BOUNDARY for the conversation.
- Follow the target practice language supplied in the request.
- Reply in the target practice language, usually 1 to 3 short sentences.
- Never drift into one of the other supported languages because of previous turns.
- Normally end with one easy follow-up question.
- For A1, use very short sentences and common words.
- Correct at most ONE important mistake in a turn.
- Do not mark a grammatically valid sentence as wrong just because a different sentence fits the context better.
- If the learner is already natural, correction must be null.
- correction and suggested_reply must be in the target practice language.
- explanation_es and tip_es are brief Spanish support.
- If the learner uses Spanish because they do not know a phrase in English or French, teach the target-language phrase and invite them to try it.
- If the learner asks to change topic, immediately switch to a different practical topic, ask a fresh question, and set the JSON topic field to the new topic.
- Preferred topic names: My day, Work, Travel, Family, Business, Food, Hobbies, Shopping, Plans, Anything.
- Never scold, grade, or make the learner feel tested.
- For A1 learners, suggested_reply MUST contain one short, natural example answer in the target practice language, 3 to 10 simple words.
- For A2 or B1, suggested_reply should normally be null unless the learner explicitly asks for an example.
- Return strict JSON only.
`;


const tutorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "reply",
    "correction",
    "explanation_es",
    "tip_es",
    "level",
    "new_words",
    "topic",
    "suggested_reply",
  ],
  properties: {
    reply: { type: "string" },
    correction: { type: ["string", "null"] },
    explanation_es: { type: ["string", "null"] },
    tip_es: { type: "string" },
    level: { type: "string", enum: ["A1", "A2", "B1"] },
    new_words: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "meaning_es"],
        properties: {
          word: { type: "string" },
          meaning_es: { type: "string" },
        },
      },
    },
    topic: { type: "string" },
    suggested_reply: { type: ["string", "null"] },
  },
};

async function conversation(
  supabase: ReturnType<typeof adminClient>,
  profile: any,
  body: any,
) {
  if (!hasAccess(profile)) {
    if (profile.subscription_status === "trial") {
      await supabase
        .from("app_users")
        .update({
          subscription_status: "blocked",
          updated_at: new Date().toISOString(),
        })
        .eq("firebase_uid", profile.firebase_uid);
    }
    return json(
      {
        error: "trial_expired",
        message:
          "Tu prueba gratuita terminó. Activa tu suscripción para seguir practicando.",
      },
      403,
    );
  }

  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
  const typedText = typeof body.text === "string" ? body.text.trim().slice(0, 1500) : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "audio/m4a";
  const requestedLevel = ["A1", "A2", "B1"].includes(body.level) ? body.level : "A1";
  const requestedTopic =
    typeof body.topic === "string" ? body.topic.slice(0, 80) : "Anything";
  const requestedLanguage =
    typeof body.practiceLanguage === "string" && body.practiceLanguage in PRACTICE_LANGUAGES
      ? body.practiceLanguage as keyof typeof PRACTICE_LANGUAGES
      : "en";
  const languageConfig = PRACTICE_LANGUAGES[requestedLanguage];
  const seconds = Math.max(0, Math.min(60, Number(body.seconds || 0)));

  if (!typedText && !audioBase64) {
    return json({ error: "invalid_input", message: "Audio or text is required." }, 400);
  }

  if (audioBase64.length > 6_000_000) {
    return json(
      {
        error: "audio_too_long",
        message: "Keep voice turns under about 45 seconds.",
      },
      400,
    );
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json(
      {
        error: "openai_not_configured",
        message: "OpenAI todavía no está conectado al servidor.",
      },
      503,
    );
  }

  const transcribed = typedText
    ? { text: typedText, inputTokens: 0, outputTokens: 0 }
    : await transcribe(apiKey, audioBase64, mimeType, languageConfig.transcriptionCode);
  const transcript = transcribed.text;
  if (!transcript) {
    return json(
      { error: "no_speech", message: "No pude escuchar palabras. Intenta nuevamente." },
      400,
    );
  }

  const { data: recentRows, error: recentError } = await supabase
    .from("conversation_turns")
    .select("transcript, reply, topic, practice_language, created_at")
    .eq("firebase_uid", profile.firebase_uid)
    .eq("practice_language", requestedLanguage)
    .order("created_at", { ascending: false })
    .limit(10);
  if (recentError) throw recentError;

  const recent = (recentRows ?? [])
    .filter((row: any) => requestedTopic === "Anything" || row.topic === requestedTopic)
    .slice(0, 6)
    .reverse()
    .map((row: any) => `Learner: ${row.transcript}\nEmma: ${row.reply}`)
    .join("\n\n");

  const response = await openAiJson(apiKey, "responses", {
    model: "gpt-5.6-luna",
    reasoning: { effort: "none" },
    store: false,
    instructions: `${tutorInstructions}\n\nCURRENT LANGUAGE RULE — THIS OVERRIDES ALL OTHER LANGUAGE CONTEXT:\n${languageConfig.strictRule}`,
    input: `Target practice language: ${languageConfig.name}\nCurrent estimated level: ${requestedLevel}\nPreferred topic: ${requestedTopic}\n\nRecent conversation in THIS SAME language only:\n${recent || "(first turn)"}\n\nLearner now says:\n${transcript}`,
    text: {
      format: {
        type: "json_schema",
        name: "everyone_english_tutor_reply",
        strict: true,
        schema: tutorResponseSchema,
      },
    },
    max_output_tokens: 500,
  });

  const tutor = cleanTutorJson(
    extractResponseText(response),
    requestedLevel,
    requestedTopic,
    requestedLanguage,
  );

  const measuredLlmInput = Number(response?.usage?.input_tokens ?? 0);
  const measuredLlmOutput = Number(response?.usage?.output_tokens ?? 0);
  const llmInputTokens = measuredLlmInput || Math.max(1, Math.ceil((tutorInstructions.length + recent.length + transcript.length) / 4));
  const llmOutputTokens = measuredLlmOutput || Math.max(1, Math.ceil((tutor.reply.length + tutor.tip_es.length + (tutor.explanation_es?.length ?? 0)) / 4));
  const llmCostUsd =
    (llmInputTokens * AI_COST_RATES.llmInputPerMillion / 1_000_000) +
    (llmOutputTokens * AI_COST_RATES.llmOutputPerMillion / 1_000_000);

  const transcribeMeasured = transcribed.inputTokens > 0 || transcribed.outputTokens > 0;
  const transcribeCostUsd = typedText
    ? 0
    : transcribeMeasured
      ? (
          transcribed.inputTokens * AI_COST_RATES.transcribeInputPerMillion / 1_000_000 +
          transcribed.outputTokens * AI_COST_RATES.transcribeOutputPerMillion / 1_000_000
        )
      : (seconds / 60) * AI_COST_RATES.transcribePerMinuteFallback;

  const audio = await synthesize(apiKey, tutor.reply, tutor.level, requestedLanguage);
  const totalAiCostUsd = llmCostUsd + transcribeCostUsd + audio.estimatedCostUsd;

  const { error: turnError } = await supabase.from("conversation_turns").insert({
    firebase_uid: profile.firebase_uid,
    transcript,
    reply: tutor.reply,
    correction: tutor.correction,
    explanation_es: tutor.explanation_es,
    tip_es: tutor.tip_es,
    level: tutor.level,
    topic: tutor.topic,
    new_words: tutor.new_words,
    seconds,
    practice_language: requestedLanguage,
    llm_input_tokens: llmInputTokens,
    llm_output_tokens: llmOutputTokens,
    transcribe_input_tokens: transcribed.inputTokens,
    transcribe_output_tokens: transcribed.outputTokens,
    tts_input_tokens_est: audio.inputTokensEst,
    tts_audio_tokens_est: audio.audioTokensEst,
    transcribe_cost_usd: Number(transcribeCostUsd.toFixed(6)),
    llm_cost_usd: Number(llmCostUsd.toFixed(6)),
    tts_cost_usd: Number(audio.estimatedCostUsd.toFixed(6)),
    ai_cost_usd: Number(totalAiCostUsd.toFixed(6)),
    cost_estimated: true,
    cost_rate_version: AI_COST_RATES.rateVersion,
  });
  if (turnError) throw turnError;

  const { error: updateError } = await supabase.rpc("increment_everyone_english_progress", {
    p_firebase_uid: profile.firebase_uid,
    p_level: tutor.level,
    p_topic: tutor.topic,
    p_seconds: seconds,
    p_words: tutor.new_words.length,
  });
  if (updateError) throw updateError;

  const { error: languageUpdateError } = await supabase
    .from("app_users")
    .update({
      last_practice_language: requestedLanguage,
      updated_at: new Date().toISOString(),
    })
    .eq("firebase_uid", profile.firebase_uid);
  if (languageUpdateError) throw languageUpdateError;

  return json({
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
    audioBase64: audio.audioBase64,
    suggestedReply: tutor.level === "A1" ? tutor.suggested_reply : null,
    topic: tutor.topic,
    practiceLanguage: requestedLanguage,
  });
}


async function buildAdminAnalytics(supabase: ReturnType<typeof adminClient>) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const elapsedDays = Math.max(1, now.getUTCDate());

  const [
    { data: users, error: usersError },
    { data: turns, error: turnsError },
    { data: settingsRow, error: settingsError },
    { data: investments, error: investmentsError },
  ] = await Promise.all([
    supabase
      .from("app_users")
      .select(
        "firebase_uid, display_name, role, subscription_status, monthly_price_override_usd, monthly_price_note",
      )
      .limit(500),
    supabase
      .from("conversation_turns")
      .select(
        "firebase_uid, seconds, ai_cost_usd, transcribe_cost_usd, llm_cost_usd, tts_cost_usd, practice_language, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase
      .from("business_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("ai_investments")
      .select("*")
      .order("purchased_at", { ascending: false })
      .limit(100),
  ]);

  if (usersError) throw usersError;
  if (turnsError) throw turnsError;
  if (settingsError) throw settingsError;
  if (investmentsError) throw investmentsError;

  const settings = {
    exchangeRateBobPerUsd: settingsRow?.exchange_rate_bob_per_usd == null
      ? null
      : Number(settingsRow.exchange_rate_bob_per_usd),
    pricingMarkup: Number(settingsRow?.pricing_markup ?? 4),
    safetyBufferPercent: Number(settingsRow?.safety_buffer_percent ?? 25),
    normalTurnsPerDay: Number(settingsRow?.normal_turns_per_day ?? 25),
    defaultMonthlyPriceBob: Number(settingsRow?.default_monthly_price_bob ?? 50),
    firstSaleCommissionBob: Number(settingsRow?.first_sale_commission_bob ?? 20),
    renewalCommissionBob: Number(settingsRow?.renewal_commission_bob ?? 5),
  };

  const stats = new Map<string, any>();
  for (const user of users ?? []) {
    stats.set(user.firebase_uid, {
      id: user.firebase_uid,
      displayName: user.display_name || "Sin nombre",
      role: user.role,
      subscriptionStatus: user.subscription_status,
      monthlyPriceOverrideUsd:
        user.monthly_price_override_usd == null
          ? null
          : Number(user.monthly_price_override_usd),
      monthlyPriceNote: user.monthly_price_note || "",
      turns: 0,
      speakingSeconds: 0,
      aiCostUsd: 0,
      currentMonthTurns: 0,
      currentMonthAiCostUsd: 0,
      activeDays: new Set<string>(),
      currentMonthActiveDays: new Set<string>(),
      languages: {
        en: { turns: 0, costUsd: 0 },
        es: { turns: 0, costUsd: 0 },
        fr: { turns: 0, costUsd: 0 },
      },
    });
  }

  let transcribeUsd = 0;
  let llmUsd = 0;
  let ttsUsd = 0;
  const languageTotals = {
    en: { turns: 0, costUsd: 0 },
    es: { turns: 0, costUsd: 0 },
    fr: { turns: 0, costUsd: 0 },
  };

  for (const turn of turns ?? []) {
    const row = stats.get(turn.firebase_uid);
    if (!row) continue;

    const cost = Number(turn.ai_cost_usd || 0);
    const language = ["en", "es", "fr"].includes(turn.practice_language)
      ? turn.practice_language
      : "en";
    const createdAt = new Date(turn.created_at);

    row.turns += 1;
    row.speakingSeconds += Number(turn.seconds || 0);
    row.aiCostUsd += cost;
    row.languages[language].turns += 1;
    row.languages[language].costUsd += cost;
    languageTotals[language as "en" | "es" | "fr"].turns += 1;
    languageTotals[language as "en" | "es" | "fr"].costUsd += cost;

    if (turn.created_at) {
      row.activeDays.add(String(turn.created_at).slice(0, 10));
    }

    if (createdAt >= monthStart && createdAt <= now) {
      row.currentMonthTurns += 1;
      row.currentMonthAiCostUsd += cost;
      row.currentMonthActiveDays.add(String(turn.created_at).slice(0, 10));
    }

    transcribeUsd += Number(turn.transcribe_cost_usd || 0);
    llmUsd += Number(turn.llm_cost_usd || 0);
    ttsUsd += Number(turn.tts_cost_usd || 0);
  }

  const perUser = Array.from(stats.values())
    .filter((row) => row.turns > 0)
    .map((row) => {
      const avgCostPerTurnUsd = row.turns ? row.aiCostUsd / row.turns : 0;
      const projectedMonthlyAiCostUsd =
        row.currentMonthAiCostUsd > 0
          ? (row.currentMonthAiCostUsd / elapsedDays) * daysInMonth
          : avgCostPerTurnUsd * settings.normalTurnsPerDay * daysInMonth;

      const suggestedMonthlyPriceUsd =
        projectedMonthlyAiCostUsd *
        (1 + settings.safetyBufferPercent / 100) *
        settings.pricingMarkup;

      const effectiveMonthlyPriceUsd =
        row.monthlyPriceOverrideUsd ?? suggestedMonthlyPriceUsd;

      return {
        id: row.id,
        displayName: row.displayName,
        role: row.role,
        subscriptionStatus: row.subscriptionStatus,
        turns: row.turns,
        speakingMinutes: row.speakingSeconds / 60,
        aiCostUsd: row.aiCostUsd,
        avgCostPerTurnUsd,
        currentMonthTurns: row.currentMonthTurns,
        currentMonthAiCostUsd: row.currentMonthAiCostUsd,
        projectedMonthlyAiCostUsd,
        suggestedMonthlyPriceUsd,
        monthlyPriceOverrideUsd: row.monthlyPriceOverrideUsd,
        monthlyPriceNote: row.monthlyPriceNote,
        effectiveMonthlyPriceUsd,
        effectiveMonthlyPriceBob:
          settings.exchangeRateBobPerUsd == null
            ? null
            : effectiveMonthlyPriceUsd * settings.exchangeRateBobPerUsd,
        activeDays: row.activeDays.size,
        currentMonthActiveDays: row.currentMonthActiveDays.size,
        languages: row.languages,
      };
    })
    .sort((a, b) => b.currentMonthAiCostUsd - a.currentMonthAiCostUsd);

  const totalTurns = perUser.reduce((sum, row) => sum + row.turns, 0);
  const totalAiCostUsd = perUser.reduce((sum, row) => sum + row.aiCostUsd, 0);
  const currentMonthAiCostUsd = perUser.reduce(
    (sum, row) => sum + row.currentMonthAiCostUsd,
    0,
  );
  const averageCostPerTurnUsd = totalTurns ? totalAiCostUsd / totalTurns : 0;
  const lightMonthlyUsd = averageCostPerTurnUsd * 10 * daysInMonth;
  const normalMonthlyUsd =
    averageCostPerTurnUsd * settings.normalTurnsPerDay * daysInMonth;
  const intensiveMonthlyUsd = averageCostPerTurnUsd * 50 * daysInMonth;
  const referenceMonthlyPriceUsd =
    normalMonthlyUsd *
    (1 + settings.safetyBufferPercent / 100) *
    settings.pricingMarkup;

  const normalizedInvestments = (investments ?? []).map((item: any) => ({
    id: item.id,
    provider: item.provider,
    amountUsd: Number(item.amount_usd || 0),
    exchangeRateBobPerUsd:
      item.exchange_rate_bob_per_usd == null
        ? null
        : Number(item.exchange_rate_bob_per_usd),
    amountBob: item.amount_bob == null ? null : Number(item.amount_bob),
    purchasedAt: item.purchased_at,
    note: item.note || "",
  }));

  const totalInvestedUsd = normalizedInvestments.reduce(
    (sum, item) => sum + item.amountUsd,
    0,
  );
  const totalInvestedBob = normalizedInvestments.reduce(
    (sum, item) => sum + Number(item.amountBob || 0),
    0,
  );

  return {
    month: monthStart.toISOString().slice(0, 7),
    sampleUsers: perUser.length,
    totalTurns,
    totalAiCostUsd,
    currentMonthAiCostUsd,
    averageCostPerTurnUsd,
    averageCostPerUserObservedUsd: perUser.length
      ? totalAiCostUsd / perUser.length
      : 0,
    scenarios: {
      lightMonthlyUsd,
      normalMonthlyUsd,
      intensiveMonthlyUsd,
    },
    referenceMonthlyPriceUsd,
    budget100UsersUsd:
      normalMonthlyUsd * 100 * (1 + settings.safetyBufferPercent / 100),
    safetyBufferPercent: settings.safetyBufferPercent,
    referenceMarkup: settings.pricingMarkup,
    settings,
    investments: normalizedInvestments,
    investmentSummary: {
      totalInvestedUsd,
      totalInvestedBob,
      estimatedRemainingUsd: totalInvestedUsd - totalAiCostUsd,
    },
    breakdown: { transcribeUsd, llmUsd, ttsUsd },
    languageTotals,
    perUser,
    rateVersion: AI_COST_RATES.rateVersion,
    note:
      "Los tres idiomas comparten la misma suscripción y el mismo presupuesto de IA. El precio sugerido se recalcula según uso, tipo de cambio, margen y colchón configurados por el administrador.",
  };
}


async function buildAdminSalesOverview(
  supabase: ReturnType<typeof adminClient>,
) {
  const [
    { data: settingsRow, error: settingsError },
    { data: agents, error: agentsError },
    { data: users, error: usersError },
    { data: payments, error: paymentsError },
    { data: commissions, error: commissionsError },
  ] = await Promise.all([
    supabase
      .from("business_settings")
      .select("default_monthly_price_bob, first_sale_commission_bob, renewal_commission_bob")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("sales_agents")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("app_users")
      .select("firebase_uid, display_name, email, sales_agent_id"),
    supabase
      .from("customer_payments")
      .select("*")
      .order("paid_at", { ascending: false })
      .limit(300),
    supabase
      .from("sales_commissions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  if (settingsError) throw settingsError;
  if (agentsError) throw agentsError;
  if (usersError) throw usersError;
  if (paymentsError) throw paymentsError;
  if (commissionsError) throw commissionsError;

  const settings = {
    defaultMonthlyPriceBob: Number(settingsRow?.default_monthly_price_bob ?? 50),
    firstSaleCommissionBob: Number(settingsRow?.first_sale_commission_bob ?? 20),
    renewalCommissionBob: Number(settingsRow?.renewal_commission_bob ?? 5),
  };

  const userMap = new Map<string, any>();
  for (const user of users ?? []) userMap.set(user.firebase_uid, user);

  const agentMap = new Map<string, any>();
  for (const agent of agents ?? []) agentMap.set(agent.id, agent);

  const agentStats = new Map<string, any>();
  for (const agent of agents ?? []) {
    agentStats.set(agent.id, {
      id: agent.id,
      name: agent.name,
      phone: agent.phone || "",
      active: Boolean(agent.active),
      firstSaleCommissionBob:
        agent.first_sale_commission_bob == null
          ? null
          : Number(agent.first_sale_commission_bob),
      renewalCommissionBob:
        agent.renewal_commission_bob == null
          ? null
          : Number(agent.renewal_commission_bob),
      note: agent.note || "",
      customerCount: 0,
      salesCount: 0,
      revenueBob: 0,
      pendingCommissionBob: 0,
      paidCommissionBob: 0,
    });
  }

  for (const user of users ?? []) {
    if (user.sales_agent_id && agentStats.has(user.sales_agent_id)) {
      agentStats.get(user.sales_agent_id).customerCount += 1;
    }
  }

  for (const payment of payments ?? []) {
    if (payment.sales_agent_id && agentStats.has(payment.sales_agent_id)) {
      const row = agentStats.get(payment.sales_agent_id);
      row.salesCount += 1;
      row.revenueBob += Number(payment.amount_bob || 0);
    }
  }

  for (const commission of commissions ?? []) {
    if (!agentStats.has(commission.sales_agent_id)) continue;
    const row = agentStats.get(commission.sales_agent_id);
    if (commission.status === "pending") {
      row.pendingCommissionBob += Number(commission.commission_bob || 0);
    }
    if (commission.status === "paid") {
      row.paidCommissionBob += Number(commission.commission_bob || 0);
    }
  }

  const normalizedPayments = (payments ?? []).map((payment: any) => {
    const user = userMap.get(payment.firebase_uid);
    const agent = payment.sales_agent_id
      ? agentMap.get(payment.sales_agent_id)
      : null;
    return {
      id: payment.id,
      firebaseUid: payment.firebase_uid,
      customerName: user?.display_name || user?.email || "Sin nombre",
      salesAgentId: payment.sales_agent_id ?? null,
      salesAgentName: agent?.name ?? null,
      billingMonth: payment.billing_month,
      amountBob: Number(payment.amount_bob || 0),
      paidAt: payment.paid_at,
      note: payment.note || "",
    };
  });

  const normalizedCommissions = (commissions ?? []).map((commission: any) => {
    const user = userMap.get(commission.firebase_uid);
    const agent = agentMap.get(commission.sales_agent_id);
    return {
      id: commission.id,
      paymentId: commission.payment_id,
      salesAgentId: commission.sales_agent_id,
      salesAgentName: agent?.name || "Vendedor",
      firebaseUid: commission.firebase_uid,
      customerName: user?.display_name || user?.email || "Sin nombre",
      commissionType: commission.commission_type,
      billingMonth: commission.billing_month,
      customerPaymentBob: Number(commission.customer_payment_bob || 0),
      commissionBob: Number(commission.commission_bob || 0),
      status: commission.status,
      paidAt: commission.paid_at,
      createdAt: commission.created_at,
    };
  });

  const revenueBob = normalizedPayments.reduce(
    (sum: number, item: any) => sum + item.amountBob,
    0,
  );
  const pendingCommissionBob = normalizedCommissions
    .filter((item: any) => item.status === "pending")
    .reduce((sum: number, item: any) => sum + item.commissionBob, 0);
  const paidCommissionBob = normalizedCommissions
    .filter((item: any) => item.status === "paid")
    .reduce((sum: number, item: any) => sum + item.commissionBob, 0);

  return {
    settings,
    summary: {
      revenueBob,
      pendingCommissionBob,
      paidCommissionBob,
      netAfterCommissionsBob:
        revenueBob - pendingCommissionBob - paidCommissionBob,
      paymentsCount: normalizedPayments.length,
    },
    agents: Array.from(agentStats.values()),
    payments: normalizedPayments,
    commissions: normalizedCommissions,
  };
}

function monthEndFromBillingMonth(billingMonth: string) {
  const [year, month] = billingMonth.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const identity = await verifyFirebaseRequest(req);
    const supabase = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "bootstrap");

    const profile = await ensureProfile(
      supabase,
      identity,
      typeof body.displayName === "string" ? body.displayName : "",
    );

    if (action === "bootstrap" || action === "profile") {
      return json({ profile: publicProfile(profile) });
    }

    if (action === "conversation") {
      return await conversation(supabase, profile, body);
    }

    if (action === "adminAnalytics") {
      if (profile.role !== "admin") return json({ error: "forbidden" }, 403);
      return json({ analytics: await buildAdminAnalytics(supabase) });
    }

    if (action === "adminUpdateBusinessSettings") {
      if (profile.role !== "admin") return json({ error: "forbidden" }, 403);

      const exchangeRateRaw = body.exchangeRateBobPerUsd;
      const exchangeRate =
        exchangeRateRaw === null || exchangeRateRaw === "" || exchangeRateRaw === undefined
          ? null
          : Number(exchangeRateRaw);
      const pricingMarkup = Number(body.pricingMarkup ?? 4);
      const safetyBufferPercent = Number(body.safetyBufferPercent ?? 25);
      const normalTurnsPerDay = Number(body.normalTurnsPerDay ?? 25);
      const defaultMonthlyPriceBob = Number(body.defaultMonthlyPriceBob ?? 50);
      const firstSaleCommissionBob = Number(body.firstSaleCommissionBob ?? 20);
      const renewalCommissionBob = Number(body.renewalCommissionBob ?? 5);

      if (
        (exchangeRate !== null && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) ||
        !Number.isFinite(pricingMarkup) || pricingMarkup < 1 || pricingMarkup > 20 ||
        !Number.isFinite(safetyBufferPercent) || safetyBufferPercent < 0 || safetyBufferPercent > 500 ||
        !Number.isFinite(normalTurnsPerDay) || normalTurnsPerDay < 1 || normalTurnsPerDay > 500 ||
        !Number.isFinite(defaultMonthlyPriceBob) || defaultMonthlyPriceBob <= 0 ||
        !Number.isFinite(firstSaleCommissionBob) || firstSaleCommissionBob < 0 ||
        !Number.isFinite(renewalCommissionBob) || renewalCommissionBob < 0
      ) {
        return json({ error: "invalid_business_settings" }, 400);
      }

      const { error } = await supabase
        .from("business_settings")
        .upsert({
          id: 1,
          exchange_rate_bob_per_usd: exchangeRate,
          pricing_markup: pricingMarkup,
          safety_buffer_percent: safetyBufferPercent,
          normal_turns_per_day: Math.round(normalTurnsPerDay),
          default_monthly_price_bob: defaultMonthlyPriceBob,
          first_sale_commission_bob: firstSaleCommissionBob,
          renewal_commission_bob: renewalCommissionBob,
          updated_at: new Date().toISOString(),
          updated_by: profile.firebase_uid,
        }, { onConflict: "id" });
      if (error) throw error;

      return json({ ok: true });
    }

    if (action === "adminAddInvestment") {
      if (profile.role !== "admin") return json({ error: "forbidden" }, 403);

      const amountUsd = Number(body.amountUsd || 0);
      const exchangeRateRaw = body.exchangeRateBobPerUsd;
      const exchangeRate =
        exchangeRateRaw === null || exchangeRateRaw === "" || exchangeRateRaw === undefined
          ? null
          : Number(exchangeRateRaw);
      const provider =
        typeof body.provider === "string" && body.provider.trim()
          ? body.provider.trim().slice(0, 80)
          : "OpenAI";
      const note =
        typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
      const purchasedAt =
        typeof body.purchasedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.purchasedAt)
          ? body.purchasedAt
          : new Date().toISOString().slice(0, 10);

      if (
        !Number.isFinite(amountUsd) || amountUsd <= 0 ||
        (exchangeRate !== null && (!Number.isFinite(exchangeRate) || exchangeRate <= 0))
      ) {
        return json({ error: "invalid_investment" }, 400);
      }

      const amountBob = exchangeRate === null ? null : amountUsd * exchangeRate;
      const { error } = await supabase.from("ai_investments").insert({
        provider,
        amount_usd: amountUsd,
        exchange_rate_bob_per_usd: exchangeRate,
        amount_bob: amountBob,
        purchased_at: purchasedAt,
        note,
        created_by: profile.firebase_uid,
      });
      if (error) throw error;

      return json({ ok: true });
    }

    if (action === "adminSetUserPrice") {
      if (profile.role !== "admin") return json({ error: "forbidden" }, 403);

      const targetUid = typeof body.targetUid === "string" ? body.targetUid.trim() : "";
      const priceRaw = body.monthlyPriceOverrideUsd;
      const monthlyPriceOverrideUsd =
        priceRaw === null || priceRaw === "" || priceRaw === undefined
          ? null
          : Number(priceRaw);
      const note =
        typeof body.note === "string" ? body.note.trim().slice(0, 250) : "";

      if (
        !targetUid ||
        (monthlyPriceOverrideUsd !== null &&
          (!Number.isFinite(monthlyPriceOverrideUsd) || monthlyPriceOverrideUsd < 0))
      ) {
        return json({ error: "invalid_user_price" }, 400);
      }

      const { error } = await supabase
        .from("app_users")
        .update({
          monthly_price_override_usd: monthlyPriceOverrideUsd,
          monthly_price_note: note,
          updated_at: new Date().toISOString(),
        })
        .eq("firebase_uid", targetUid);
      if (error) throw error;

      return json({ ok: true });
    }

    if (action === "adminSalesOverview") {
      if (profile.role !== "admin") return json({ error: "forbidden" }, 403);
      return json({ sales: await buildAdminSalesOverview(supabase) });
    }

    if (action === "adminCreateSalesAgent") {
      if (profile.role !== "admin") return json({ error: "forbidden" }, 403);

      const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
      const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 50) : "";
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 250) : "";
      const firstRaw = body.firstSaleCommissionBob;
      const renewalRaw = body.renewalCommissionBob;
      const firstSaleCommissionBob =
        firstRaw === null || firstRaw === "" || firstRaw === undefined
          ? null
          : Number(firstRaw);
      const renewalCommissionBob =
        renewalRaw === null || renewalRaw === "" || renewalRaw === undefined
          ? null
          : Number(renewalRaw);

      if (
        !name ||
        (firstSaleCommissionBob !== null &&
          (!Number.isFinite(firstSaleCommissionBob) || firstSaleCommissionBob < 0)) ||
        (renewalCommissionBob !== null &&
          (!Number.isFinite(renewalCommissionBob) || renewalCommissionBob < 0))
      ) {
        return json({ error: "invalid_sales_agent" }, 400);
      }

      const { data, error } = await supabase
        .from("sales_agents")
        .insert({
          name,
          phone,
          note,
          first_sale_commission_bob: firstSaleCommissionBob,
          renewal_commission_bob: renewalCommissionBob,
        })
        .select("id")
        .single();
      if (error) throw error;

      return json({ ok: true, salesAgentId: data.id });
    }

    if (action === "adminToggleSalesAgent") {
      if (profile.role !== "admin") return json({ error: "forbidden" }, 403);

      const salesAgentId =
        typeof body.salesAgentId === "string" ? body.salesAgentId.trim() : "";
      const active = Boolean(body.active);
      if (!salesAgentId) return json({ error: "invalid_sales_agent" }, 400);

      const { error } = await supabase
        .from("sales_agents")
        .update({ active, updated_at: new Date().toISOString() })
        .eq("id", salesAgentId);
      if (error) throw error;

      return json({ ok: true });
    }

    if (action === "adminAssignSalesAgent") {
      if (profile.role !== "admin") return json({ error: "forbidden" }, 403);

      const targetUid = typeof body.targetUid === "string" ? body.targetUid.trim() : "";
      const salesAgentId =
        body.salesAgentId === null || body.salesAgentId === ""
          ? null
          : String(body.salesAgentId || "").trim();

      if (!targetUid) return json({ error: "invalid_assignment" }, 400);

      if (salesAgentId) {
        const { data: agent, error: agentError } = await supabase
          .from("sales_agents")
          .select("id, active")
          .eq("id", salesAgentId)
          .maybeSingle();
        if (agentError) throw agentError;
        if (!agent || !agent.active) {
          return json({ error: "sales_agent_not_available" }, 409);
        }
      }

      const { error } = await supabase
        .from("app_users")
        .update({
          sales_agent_id: salesAgentId,
          updated_at: new Date().toISOString(),
        })
        .eq("firebase_uid", targetUid);
      if (error) throw error;

      return json({ ok: true });
    }

    if (action === "adminRegisterMonthlyPayment") {
      if (profile.role !== "admin") return json({ error: "forbidden" }, 403);

      const targetUid = typeof body.targetUid === "string" ? body.targetUid.trim() : "";
      const { data: settingsRow, error: settingsError } = await supabase
        .from("business_settings")
        .select("default_monthly_price_bob, first_sale_commission_bob, renewal_commission_bob")
        .eq("id", 1)
        .maybeSingle();
      if (settingsError) throw settingsError;

      const amountBob = Number(
        body.amountBob ?? settingsRow?.default_monthly_price_bob ?? 50,
      );
      const billingMonth =
        typeof body.billingMonth === "string" &&
        /^\d{4}-\d{2}(-01)?$/.test(body.billingMonth)
          ? body.billingMonth.slice(0, 7) + "-01"
          : new Date().toISOString().slice(0, 7) + "-01";
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 250) : "";

      if (!targetUid || !Number.isFinite(amountBob) || amountBob <= 0) {
        return json({ error: "invalid_payment" }, 400);
      }

      const { data: target, error: targetError } = await supabase
        .from("app_users")
        .select("firebase_uid, role, sales_agent_id")
        .eq("firebase_uid", targetUid)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) return json({ error: "user_not_found" }, 404);
      if (target.role === "admin") {
        return json({ error: "cannot_bill_admin" }, 409);
      }

      const { count: previousPayments, error: countError } = await supabase
        .from("customer_payments")
        .select("id", { count: "exact", head: true })
        .eq("firebase_uid", targetUid);
      if (countError) throw countError;

      const { data: payment, error: paymentError } = await supabase
        .from("customer_payments")
        .insert({
          firebase_uid: targetUid,
          sales_agent_id: target.sales_agent_id,
          billing_month: billingMonth,
          amount_bob: amountBob,
          payment_method: "manual",
          note,
          registered_by: profile.firebase_uid,
        })
        .select("id")
        .single();

      if (paymentError) {
        if (String(paymentError.code) === "23505") {
          return json({ error: "payment_already_registered" }, 409);
        }
        throw paymentError;
      }

      if (target.sales_agent_id) {
        const { data: agent, error: agentError } = await supabase
          .from("sales_agents")
          .select("first_sale_commission_bob, renewal_commission_bob")
          .eq("id", target.sales_agent_id)
          .maybeSingle();
        if (agentError) throw agentError;

        const firstSale = Number(previousPayments || 0) === 0;
        const commissionBob = firstSale
          ? Number(
              agent?.first_sale_commission_bob ??
                settingsRow?.first_sale_commission_bob ??
                20,
            )
          : Number(
              agent?.renewal_commission_bob ??
                settingsRow?.renewal_commission_bob ??
                5,
            );

        if (commissionBob > 0) {
          const { error: commissionError } = await supabase
            .from("sales_commissions")
            .insert({
              payment_id: payment.id,
              sales_agent_id: target.sales_agent_id,
              firebase_uid: targetUid,
              commission_type: firstSale ? "first_sale" : "renewal",
              billing_month: billingMonth,
              customer_payment_bob: amountBob,
              commission_bob: commissionBob,
              status: "pending",
            });
          if (commissionError) throw commissionError;
        }
      }

      const { error: userUpdateError } = await supabase
        .from("app_users")
        .update({
          subscription_status: "active",
          subscription_paid_until: monthEndFromBillingMonth(billingMonth),
          access_updated_at: new Date().toISOString(),
          access_updated_by: profile.firebase_uid,
          updated_at: new Date().toISOString(),
        })
        .eq("firebase_uid", targetUid);
      if (userUpdateError) throw userUpdateError;

      return json({
        ok: true,
        paymentId: payment.id,
        subscriptionPaidUntil: monthEndFromBillingMonth(billingMonth),
      });
    }

    if (action === "adminMarkCommissionPaid") {
      if (profile.role !== "admin") return json({ error: "forbidden" }, 403);

      const commissionId =
        typeof body.commissionId === "string" ? body.commissionId.trim() : "";
      if (!commissionId) return json({ error: "invalid_commission" }, 400);

      const { error } = await supabase
        .from("sales_commissions")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", commissionId)
        .eq("status", "pending");
      if (error) throw error;

      return json({ ok: true });
    }

    if (action === "adminList") {
      if (profile.role !== "admin") {
        return json({ error: "forbidden" }, 403);
      }

      const { data, error } = await supabase
        .from("app_users")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      return json({
        users: (data ?? []).map((row: any) => ({
          id: row.firebase_uid,
          displayName: row.display_name,
          email: row.email,
          role: row.role,
          subscriptionStatus: row.subscription_status,
          level: row.level,
          totalTurns: Number(row.total_turns || 0),
          trialEndsAt: row.trial_ends_at,
          createdAt: row.created_at,
          monthlyPriceOverrideUsd:
            row.monthly_price_override_usd == null
              ? null
              : Number(row.monthly_price_override_usd),
          monthlyPriceNote: row.monthly_price_note || "",
          lastPracticeLanguage: row.last_practice_language || "en",
          salesAgentId: row.sales_agent_id ?? null,
          subscriptionPaidUntil: row.subscription_paid_until ?? null,
        })),
      });
    }

    if (action === "adminSetAccess") {
      if (profile.role !== "admin") {
        return json({ error: "forbidden" }, 403);
      }

      const targetUid = typeof body.targetUid === "string" ? body.targetUid.trim() : "";
      const status = typeof body.subscriptionStatus === "string"
        ? body.subscriptionStatus
        : "";
      const allowed = ["trial", "active", "complimentary", "blocked"];

      if (!targetUid || !allowed.includes(status)) {
        return json({ error: "invalid_access_update" }, 400);
      }

      const { data: target, error: targetError } = await supabase
        .from("app_users")
        .select("firebase_uid, role")
        .eq("firebase_uid", targetUid)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) return json({ error: "user_not_found" }, 404);
      if (target.role === "admin") {
        return json({ error: "cannot_modify_admin" }, 409);
      }

      const patch: Record<string, unknown> = {
        subscription_status: status,
        access_updated_at: new Date().toISOString(),
        access_updated_by: profile.firebase_uid,
        updated_at: new Date().toISOString(),
      };

      if (status === "trial") {
        patch.trial_started_at = new Date().toISOString();
        patch.trial_ends_at = new Date(Date.now() + TRIAL_HOURS * 60 * 60 * 1000).toISOString();
      }

      const { error } = await supabase
        .from("app_users")
        .update(patch)
        .eq("firebase_uid", targetUid);
      if (error) throw error;

      return json({ ok: true, targetUid, subscriptionStatus: status });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);

    if (message === "AUTH_REQUIRED" || message === "AUTH_INVALID") {
      return json({ error: "unauthorized" }, 401);
    }

    return json(
      {
        error: "server_error",
        message: "No se pudo procesar la solicitud.",
      },
      500,
    );
  }
});
