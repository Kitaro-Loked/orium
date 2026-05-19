# Orium Installer for Windows
# Run: powershell -c "irm https://orium.dev/install.ps1 | iex"

$ErrorActionPreference = "Stop"

$InstallDir = "$env:LOCALAPPDATA\Orium"
$Version = "0.1.0"

Write-Host "Installing Orium v$Version..." -ForegroundColor Cyan

# Create directory
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Download latest release (placeholder)
Write-Host "Downloading..." -ForegroundColor Yellow
# Invoke-WebRequest -Uri "https://github.com/your-org/orium/releases/download/v$Version/orium-windows-x64.zip" -OutFile "$InstallDir\orium.zip"

# Extract
# Expand-Archive -Path "$InstallDir\orium.zip" -DestinationPath $InstallDir -Force

# Add to PATH
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    Write-Host "Added Orium to PATH. Restart your terminal to use 'orium' command." -ForegroundColor Green
}

Write-Host "Orium installed successfully!" -ForegroundColor Green
Write-Host "Run 'orium --help' to get started." -ForegroundColor White
