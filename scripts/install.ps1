# ============================================================
# Aquatic Claw — Windows Installer
# Run: iwr -useb https://aquaticclaw.sh/install.ps1 | iex
# OR: Right-click this file > Run with PowerShell
# ============================================================

$ErrorActionPreference = "Stop"
$AquaticClawDir = "$env:USERPROFILE\aquaticclaw"

Write-Host ""
Write-Host "🐠 ============================================" -ForegroundColor Cyan
Write-Host "🌊  Aquatic Claw — AI Agent Monitor" -ForegroundColor Cyan
Write-Host "🐠 ============================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    Write-Host "✓ Node.js $nodeVersion found" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js 18+ from: https://nodejs.org" -ForegroundColor Yellow
    Write-Host "Then run this installer again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check npm
Write-Host "Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version 2>$null
    Write-Host "✓ npm $npmVersion found" -ForegroundColor Green
} catch {
    Write-Host "✗ npm not found!" -ForegroundColor Red
    exit 1
}

# Get API key
Write-Host ""
Write-Host "🔑 Anthropic API Key Setup" -ForegroundColor Cyan
Write-Host "Get your key at: https://console.anthropic.com" -ForegroundColor Yellow
Write-Host ""
$apiKey = Read-Host "Enter your Anthropic API key (starts with sk-ant-...)"

if (-not $apiKey -or -not $apiKey.StartsWith("sk-")) {
    Write-Host "⚠ Invalid API key format. You can add it later in .env file" -ForegroundColor Yellow
    $apiKey = "your_anthropic_api_key_here"
}

# Create directory
Write-Host ""
Write-Host "📁 Setting up in $AquaticClawDir..." -ForegroundColor Yellow

if (Test-Path $AquaticClawDir) {
    $overwrite = Read-Host "Directory exists. Overwrite? (y/N)"
    if ($overwrite -ne "y") { exit 0 }
    Remove-Item -Recurse -Force $AquaticClawDir
}

New-Item -ItemType Directory -Path $AquaticClawDir | Out-Null
New-Item -ItemType Directory -Path "$AquaticClawDir\backend" | Out-Null
New-Item -ItemType Directory -Path "$AquaticClawDir\frontend" | Out-Null
New-Item -ItemType Directory -Path "$AquaticClawDir\workspace" | Out-Null

Write-Host "✓ Directories created" -ForegroundColor Green

# Copy files (if running from downloaded zip)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path "$scriptDir\backend\server.js") {
    Write-Host "Copying files..." -ForegroundColor Yellow
    Copy-Item -Recurse "$scriptDir\backend\*" "$AquaticClawDir\backend\"
    Copy-Item -Recurse "$scriptDir\frontend\*" "$AquaticClawDir\frontend\"
    Copy-Item "$scriptDir\package.json" "$AquaticClawDir\"
    Write-Host "✓ Files copied" -ForegroundColor Green
}

# Create .env
$envContent = @"
# Aquatic Claw Configuration
ANTHROPIC_API_KEY=$apiKey
PORT=3333
NODE_ENV=production
WORKSPACE_DIR=./workspace
MAX_AGENTS=10
AGENT_TIMEOUT_MS=300000
MAX_TOKENS_PER_AGENT=8192
"@
Set-Content -Path "$AquaticClawDir\.env" -Value $envContent
Write-Host "✓ .env created" -ForegroundColor Green

# Install dependencies
Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
Set-Location $AquaticClawDir
npm install --silent
Write-Host "✓ Dependencies installed" -ForegroundColor Green

# Create launcher batch file
$launcherContent = @"
@echo off
cd /d "%USERPROFILE%\aquaticclaw"
echo.
echo [92m Aquatic Claw starting...[0m
echo [96m Open http://localhost:3333 in your browser[0m
echo.
node backend\server.js
pause
"@
Set-Content -Path "$AquaticClawDir\start.bat" -Value $launcherContent

# Create desktop shortcut
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Aquatic Claw.lnk")
$Shortcut.TargetPath = "$AquaticClawDir\start.bat"
$Shortcut.WorkingDirectory = $AquaticClawDir
$Shortcut.Description = "Aquatic Claw - AI Agent Monitor"
$Shortcut.Save()

Write-Host ""
Write-Host "🐠 ============================================" -ForegroundColor Cyan
Write-Host "✓  Aquatic Claw installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "   To start: Double-click 'Aquatic Claw' on Desktop" -ForegroundColor White
Write-Host "   Or run:   $AquaticClawDir\start.bat" -ForegroundColor White
Write-Host "   Then open: http://localhost:3333" -ForegroundColor Cyan
Write-Host ""
Write-Host "   API key stored in: $AquaticClawDir\.env" -ForegroundColor Yellow
Write-Host "🐠 ============================================" -ForegroundColor Cyan
Write-Host ""

$launch = Read-Host "Launch Aquatic Claw now? (Y/n)"
if ($launch -ne "n") {
    Start-Process "$AquaticClawDir\start.bat"
    Start-Sleep 3
    Start-Process "http://localhost:3333"
}
