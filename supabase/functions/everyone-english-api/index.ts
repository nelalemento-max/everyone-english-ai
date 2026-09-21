import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { decodeProtectedHeader, importX509, jwtVerify } from "npm:jose@6.1.0";

const FIREBASE_PROJECT_ID = "everyone-english-ai";
const ADMIN_EMAIL = "nelalemento@gmail.com";
const TRIAL_HOURS = 48;

const PRACTICE_LANGUAGES = {
  en: { name: "English", transcriptionCode: "en", example: "I like coffee." },
  es: { name: "Spanish", transcriptionCode: "es", example: "Me gusta el café." },
  fr: { name: "French", transcriptionCode: "fr", example: "J'aime le café." },
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
  if (["active", "complimentary"].includes(profile?.subscription_status)) return true;
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

async function synthesize(apiKey: string, text: string, level: string) {
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
          ? "Warm, patient English tutor for a beginner. Speak clearly and a little slowly, with natural short pauses. Use simple pronunciation and sound encouraging, not robotic."
          : "Warm, patient English conversation coach. Clear pronunciation, friendly and natural, never robotic.",
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

function cleanTutorJson(text: string, fallbackLevel: string, fallbackTopic: string): TutorReply {
  try {
    const trimmed = text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(trimmed);

    return {
      reply: String(parsed.reply || "Tell me a little more."),
      correction: parsed.correction ? String(parsed.correction) : null,
      explanation_es: parsed.explanation_es ? String(parsed.explanation_es) : null,
      tip_es: String(parsed.tip_es || "Sigue hablando con frases cortas y claras."),
      level: ["A1", "A2", "B1"].includes(parsed.level) ? parsed.level : fallbackLevel as any,
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
      reply: text || "Great. Tell me a little more about that.",
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
- Follow the target practice language supplied in the request.
- Reply in the target practice language, usually 1 to 3 short sentences.
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
    instructions: tutorInstructions,
    input: `Target practice language: ${languageConfig.name}\nCurrent estimated level: ${requestedLevel}\nPreferred topic: ${requestedTopic}\n\nRecent conversation:\n${recent || "(first turn)"}\n\nLearner now says:\n${transcript}`,
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

  const audio = await synthesize(apiKey, tutor.reply, tutor.level);
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
