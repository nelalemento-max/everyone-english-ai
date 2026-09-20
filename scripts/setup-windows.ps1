$ErrorActionPreference = "Stop"
Write-Host "Everyone English - Windows setup" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 22+ is required." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is required." }

Write-Host "Installing app dependencies..." -ForegroundColor Yellow
npm install

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env. Fill it with your Firebase public config." -ForegroundColor Green
}

Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "1) Configure .env"
Write-Host "2) Store OPENAI_API_KEY as a Supabase Edge Function secret"
Write-Host "3) npm run prebuild:android"
Write-Host "4) npm run android"
Write-Host "5) npm run build:web"
Write-Host "6) npx firebase-tools deploy --only hosting --project everyone-english-ai"
