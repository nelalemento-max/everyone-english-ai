# Puesta en marcha en Windows / Android Studio

## A. Preparar el proyecto

1. Clona o descarga el repositorio.
2. Abre PowerShell dentro de la carpeta.
3. Ejecuta:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-windows.ps1
```

## B. Firebase

En Firebase Console crea un proyecto llamado, por ejemplo, `everyone-english-ai`.

Activa:
- Authentication -> Anonymous.
- Firestore Database.
- Functions.
- Hosting.

En Project settings -> Your apps, registra una **Web app** y copia sus datos en `.env`.

En `.firebaserc` reemplaza `YOUR_FIREBASE_PROJECT_ID`.

## C. Guardar la llave OpenAI

No la pegues en el código ni en `.env`.

```powershell
firebase login
firebase use TU_PROJECT_ID
firebase functions:secrets:set OPENAI_API_KEY
```

Pega la llave sólo cuando la consola de Firebase la solicite.

## D. Backend

```powershell
firebase deploy --only firestore:rules,functions
```

## E. Web / iPhone como PWA

```powershell
npm run build:web
firebase deploy --only hosting
```

Firebase mostrará la URL `https://TU_PROJECT_ID.web.app`.

En iPhone se abre esa URL en Safari y se usa **Compartir -> Añadir a pantalla de inicio**.

## F. Android Studio

```powershell
npm run prebuild:android
```

Después abre en Android Studio la carpeta:

```text
android
```

Para probar con un teléfono conectado o emulador:

```powershell
npm run android
```

## G. Prueba inicial

1. Entra a **Talk**.
2. Elige `Anything`.
3. Pulsa **Speak**.
4. Di: `Hello, my name is Nelson. I want to practice English.`
5. Pulsa **Stop & send**.

Emma debe responder por voz, mostrar el texto y guardar el turno en Firestore.
