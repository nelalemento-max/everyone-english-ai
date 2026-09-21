import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { decodeProtectedHeader, importX509, jwtVerify } from "npm:jose@6.1.0";

const FIREBASE_PROJECT_ID = "everyone-english-ai";
const ADMIN_EMAIL = "nelalemento@gmail.com";
const TRIAL_HOURS = 48;

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

async function transcribe(apiKey: string, audioBase64: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(audioBase64), (char) => char.charCodeAt(0));
  const form = new FormData();
  const extension = mimeType.includes("webm") ? "webm" : "m4a";

  form.append(
    "file",
    new Blob([bytes], { type: mimeType }),
    `learner.${extension}`,
  );
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "en");
  form.append(
    "prompt",
    "English learner conversation. Keep imperfect learner wording when audible.",
  );

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
  return String(result.text ?? "").trim();
}

async function synthesize(apiKey: string, text: string, level: string) {
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
      speed: level === "A1" ? 0.82 : level === "A2" ? 0.92 : 1,
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
  return btoa(binary);
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
You are Emma, a warm AI English conversation coach inside Everyone English.
The learner's support language is Spanish, but the conversation itself is primarily English.
There are no rigid lessons. Keep a natural conversation going about the learner's real life and interests.
Adapt continuously from CEFR A1 through B1.

Rules:
- Reply in natural English, usually 1 to 3 short sentences.
- Normally end with one easy follow-up question.
- For A1, use very short sentences and common words.
- Correct at most ONE important mistake in a turn.
- Do not mark a grammatically valid sentence as wrong just because a different sentence fits the context better. In that case, keep correction null and mention the alternative briefly in explanation_es or the reply.
- If the learner is already natural, correction must be null.
- explanation_es and tip_es are brief Spanish support.
- If the learner uses Spanish because they do not know the English phrase, teach it and invite them to try it.
- Never scold, grade, or make the learner feel tested.
- For A1 learners, suggested_reply MUST contain one short, natural example answer the learner can say next, directly answering your final question. Keep it 3 to 10 simple words.
- For A2 or B1, suggested_reply should normally be null unless the learner explicitly asks for an example.
- Return strict JSON only:
{"reply":"...","correction":null,"explanation_es":null,"tip_es":"...","level":"A1","new_words":[{"word":"...","meaning_es":"..."}],"topic":"...","suggested_reply":"I eat chicken and rice."}
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

  const transcript = typedText || await transcribe(apiKey, audioBase64, mimeType);
  if (!transcript) {
    return json(
      { error: "no_speech", message: "No pude escuchar palabras. Intenta nuevamente." },
      400,
    );
  }

  const { data: recentRows, error: recentError } = await supabase
    .from("conversation_turns")
    .select("transcript, reply, created_at")
    .eq("firebase_uid", profile.firebase_uid)
    .order("created_at", { ascending: false })
    .limit(6);
  if (recentError) throw recentError;

  const recent = (recentRows ?? [])
    .reverse()
    .map((row: any) => `Learner: ${row.transcript}\nEmma: ${row.reply}`)
    .join("\n\n");

  const response = await openAiJson(apiKey, "responses", {
    model: "gpt-5.6-luna",
    reasoning: { effort: "none" },
    store: false,
    instructions: tutorInstructions,
    input: `Current estimated level: ${requestedLevel}\nPreferred topic: ${requestedTopic}\n\nRecent conversation:\n${recent || "(first turn)"}\n\nLearner now says:\n${transcript}`,
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
  const audio = await synthesize(apiKey, tutor.reply, tutor.level);

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
    audioBase64: audio,
    suggestedReply: tutor.level === "A1" ? tutor.suggested_reply : null,
  });
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
