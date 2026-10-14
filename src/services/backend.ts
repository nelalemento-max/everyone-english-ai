import { getIdToken } from 'firebase/auth';
import { auth } from './firebase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 900;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function friendlyNetworkError(error: any) {
  const raw = String(error?.message || error || '').toLowerCase();

  if (
    error?.name === 'AbortError' ||
    raw.includes('timeout') ||
    raw.includes('timed out')
  ) {
    return new Error(
      'La conexión está tardando demasiado. Revisa tu internet y vuelve a intentar.',
    );
  }

  return new Error(
    'No se pudo conectar con Everyone English. Revisa tu internet e intenta nuevamente.',
  );
}

export async function callBackend<T = any>(
  action: string,
  payload: Record<string, any> = {},
): Promise<T> {
  if (!SUPABASE_URL) {
    throw new Error('Supabase todavía no está configurado en .env.');
  }

  const user = auth?.currentUser;
  if (!user) {
    throw new Error('Debes iniciar sesión para continuar.');
  }

  let token: string;
  try {
    token = await getIdToken(user);
  } catch {
    throw new Error(
      'No se pudo validar tu sesión. Revisa tu internet y vuelve a intentar.',
    );
  }

  const url = `${SUPABASE_URL}/functions/v1/everyone-english-api`;
  const init: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  };

  let response: Response | null = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchWithTimeout(url, init);
      break;
    } catch (error: any) {
      lastError = error;
      if (attempt === 0) {
        await wait(RETRY_DELAY_MS);
      }
    }
  }

  if (!response) {
    throw friendlyNetworkError(lastError);
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      (response.status === 403
        ? 'Tu acceso no está habilitado.'
        : response.status >= 500
          ? 'El servicio está temporalmente ocupado. Intenta nuevamente en unos segundos.'
          : 'No se pudo conectar con Everyone English.');
    const error: any = new Error(message);
    error.code = data?.error || `http_${response.status}`;
    throw error;
  }

  return data as T;
}
