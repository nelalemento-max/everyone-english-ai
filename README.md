# Everyone English AI

Conversational English practice app for Android + Web/PWA, built with Expo/React Native, Firebase and OpenAI.

## What is already included

- One codebase for Android and web.
- Firebase anonymous authentication for the first personal version.
- Firestore learner profile and conversation history.
- Firebase Cloud Function that keeps the OpenAI API key server-side.
- Voice recording on Android/web.
- OpenAI transcription -> adaptive tutor response -> TTS voice.
- Emma AI tutor avatar with listening/speaking animation.
- A1/A2/B1 adaptive coaching.
- Gentle corrections, Spanish explanations and vocabulary tracking.
- Progress dashboard.
- Firebase Hosting configuration for the web build.
- Android package: `com.nelalemento.everyoneenglish`.

## 1. Install locally

Requirements: Node.js 22+, Android Studio, Java/Android SDK, Firebase CLI.

```bash
npm install
npm --prefix functions install
```

## 2. Create/configure Firebase

Create a Firebase project, then enable:

1. Authentication -> Sign-in method -> Anonymous.
2. Firestore Database.
3. Cloud Functions (Blaze billing is required by Firebase to deploy Functions).
4. Hosting.
5. Add a Web App to the Firebase project and copy its configuration.

Copy `.env.example` to `.env` and replace the values with the Firebase Web App config.

Copy `.firebaserc.example` to `.firebaserc` and set your Firebase project ID.

## 3. Store the OpenAI key securely

Never put the OpenAI key in `.env` or in the Android/web app.

```bash
firebase login
firebase use YOUR_FIREBASE_PROJECT_ID
firebase functions:secrets:set OPENAI_API_KEY
```

Paste the key only when the Firebase CLI asks for it.

The deployed Cloud Function reads it from Google Secret Manager.

## 4. Deploy backend + rules + web

```bash
firebase deploy --only firestore:rules,functions
npm run build:web
firebase deploy --only hosting
```

## 5. Run the web version locally

```bash
npm run web
```

## 6. Generate/open the Android Studio project

```bash
npm run prebuild:android
```

Then open the generated `android/` folder in Android Studio.

Or run directly:

```bash
npm run android
```

## 7. First personal test

Open the Talk tab, choose a topic, tap **Speak**, say one sentence and tap **Stop & send**. Emma will:

1. transcribe what you said;
2. answer in English;
3. optionally correct one important mistake;
4. explain briefly in Spanish;
5. speak the response aloud;
6. save progress in Firestore.

## Cost-control choices in this MVP

- Short, manual voice turns instead of always-open realtime audio.
- `gpt-4o-mini-transcribe` for speech recognition.
- `gpt-5-mini` for the tutor brain.
- `gpt-4o-mini-tts` for voice.
- Maximum audio payload and short responses.

After validating the app personally, the Talk screen can be upgraded to OpenAI Realtime/WebRTC while keeping the same Firebase user/progress model.
