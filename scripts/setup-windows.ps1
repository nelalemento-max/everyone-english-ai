$ErrorActionPreference = "Stop"
Write-Host "Everyone English - Windows setup" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 22+ is required." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is required." }

Write-Host "Installing app dependencies..." -ForegroundColor Yellow
npm install
Write-Host "Installing Firebase Function dependencies..." -ForegroundColor Yellow
npm --prefix functions install

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env. Fill it with your Firebase Web App configuration." -ForegroundColor Green
}
if (-not (Test-Path .firebaserc)) {
  Copy-Item .firebaserc.example .firebaserc
  Write-Host "Created .firebaserc. Replace YOUR_FIREBASE_PROJECT_ID." -ForegroundColor Green
}

Write-Host "\nNext:" -ForegroundColor Cyan
Write-Host "1) firebase login"
Write-Host "2) firebase use YOUR_FIREBASE_PROJECT_ID"
Write-Host "3) firebase functions:secrets:set OPENAI_API_KEY"
Write-Host "4) firebase deploy --only firestore:rules,functions"
Write-Host "5) npm run build:web; firebase deploy --only hosting"
Write-Host "6) npm run prebuild:android; open the android folder in Android Studio"
