import { getIdToken } from 'firebase/auth';
import { auth } from './firebase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

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

  const token = await getIdToken(user);

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/everyone-english-api`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...payload }),
    },
  );

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
        : 'No se pudo conectar con Everyone English.');
    const error: any = new Error(message);
    error.code = data?.error || `http_${response.status}`;
    throw error;
  }

  return data as T;
}
