# Everyone English - Android Studio / Windows

Trabajamos desde la Terminal de Android Studio.

## 1. Actualizar código

```powershell
git pull
npm install
```

## 2. Variables públicas locales

El archivo `.env` debe contener la configuración pública de Firebase y esta línea:

```
EXPO_PUBLIC_SUPABASE_URL=https://coddqwhoigpobomasrzs.supabase.co
```

No guardes la llave OpenAI aquí.

## 3. OpenAI

La llave OpenAI se guarda como secreto de la Edge Function de Supabase, no dentro del APK ni de la Web.

## 4. Android

```powershell
npm run prebuild:android
```

Luego abre la carpeta `android` en Android Studio o ejecuta:

```powershell
npm run android
```

## 5. Web

```powershell
npm run build:web
npx firebase-tools deploy --only hosting --project everyone-english-ai
```

## 6. Flujo de usuarios

- Registro con correo y contraseña en Firebase Auth.
- El backend Supabase crea el perfil y entrega 48 horas de prueba.
- Al vencer, bloquea la IA.
- El administrador puede marcar usuarios como Activo, Gratis o Bloqueado.
