# Everyone English AI

Aplicación conversacional para aprender inglés con IA desde Android y Web/PWA.

## Arquitectura

- **Expo / React Native**: Android + Web.
- **Firebase Authentication**: registro e inicio de sesión por correo y contraseña.
- **Firebase Hosting**: publicación web/PWA.
- **Supabase Free**: base de datos, progreso, control de prueba y Edge Function segura.
- **OpenAI API**: transcripción, conversación y voz de Emma.

Firebase Functions ya no se usan, por lo que el proyecto no requiere Blaze.

## Acceso comercial

Cada nueva cuenta recibe una prueba de 48 horas.

Estados:
- `trial`: prueba gratuita.
- `active`: cliente activo.
- `complimentary`: acceso gratuito permanente.
- `blocked`: acceso suspendido.
- `admin`: administrador.

La cuenta `nelalemento@gmail.com` se reconoce como administradora desde el backend.

## Configuración local

Copia `.env.example` a `.env` y usa la configuración pública de Firebase más:

```
EXPO_PUBLIC_SUPABASE_URL=https://coddqwhoigpobomasrzs.supabase.co
```

La llave OpenAI **nunca** debe ir en `.env`, Android ni GitHub. Se guarda como secreto de Supabase Edge Functions.

## Desarrollo

```powershell
npm install
npm run web
```

Para Android:

```powershell
npm run prebuild:android
npm run android
```

## Publicar web

```powershell
npm run build:web
npx firebase-tools deploy --only hosting --project everyone-english-ai
```

## Backend Supabase

Proyecto: `EveryoneEnglish`
Project ref: `coddqwhoigpobomasrzs`
Región: São Paulo.

Edge Function:
`everyone-english-api`

La función verifica directamente los Firebase ID Tokens, controla la prueba de 48 horas y usa la llave OpenAI únicamente en el servidor.
