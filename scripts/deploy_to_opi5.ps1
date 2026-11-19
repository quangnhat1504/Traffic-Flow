<#
.SYNOPSIS
    Deploys and manages TrafficFlow Edge Cloud on Orange Pi 5 (Rockchip RK3588)
    via Tailscale (qnhat@100.115.216.86).

.PARAMETER TargetHost
    Tailscale IP or hostname of the Orange Pi 5 board (Default: 100.115.216.86).

.PARAMETER User
    SSH user on the target board (Default: qnhat).

.PARAMETER RemoteDir
    Remote directory where TrafficFlow Edge is deployed (Default: /home/orangepi/TrafficFlow_Edge).

.PARAMETER Stage
    Action to perform: sync, build-docker, start, stop, status, all.

.EXAMPLE
    .\scripts\deploy_to_opi5.ps1 -Stage "sync"
    .\scripts\deploy_to_opi5.ps1 -Stage "build-docker"
    .\scripts\deploy_to_opi5.ps1 -Stage "start"
    .\scripts\deploy_to_opi5.ps1 -Stage "status"
#>

param (
    [string]$TargetHost = "100.115.216.86",
    [string]$User = "qnhat",
    [string]$RemoteDir = "/home/qnhat/TrafficFlow_Edge",
    [ValidateSet("sync", "compile-rknn", "build-docker", "start", "start-native", "stop", "status", "all")]
    [string]$Stage = "sync"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "TrafficFlow Edge Cloud Deployment — Orange Pi 5 (RK3588)" -ForegroundColor Cyan
Write-Host "Target: ${User}@${TargetHost}:${RemoteDir}" -ForegroundColor Cyan
Write-Host "Stage:  $Stage" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$PythonEnv = "/home/orangepi/miniconda3/envs/rknn_env/bin/python"

# Ensure remote base directory exists
ssh.exe -o BatchMode=yes -o ConnectTimeout=5 "${User}@${TargetHost}" "mkdir -p $RemoteDir/storage/uploads $RemoteDir/storage/previews $RemoteDir/storage/results $RemoteDir/models/rknn $RemoteDir/models/onnx $RemoteDir/configs $RemoteDir/scripts"

if ($Stage -in @("sync", "all")) {
    Write-Host "`n[1/5] Packaging and syncing codebase to Orange Pi 5..." -ForegroundColor Yellow
    $tarFile = "$env:TEMP\trafficflow_opi5_sync.tar"
    if (Test-Path $tarFile) { Remove-Item $tarFile -Force }

    # Tar production files (src, configs, docker, models, docs, scripts, pyproject.toml, .env)
    # Exclude massive local PyTorch checkpoints (*.pt), .git, docs/archive, .egg-info
    tar.exe --exclude="*.venv*" --exclude="*.git*" --exclude="*__pycache__*" --exclude="*node_modules*" --exclude="*.zip" --exclude="*.pt" --exclude="*.egg-info*" --exclude="docs/archive*" -cf $tarFile src configs docker models docs scripts pyproject.toml .env

    Write-Host "  Copying archive via SCP..." -ForegroundColor Gray
    scp.exe -o BatchMode=yes -o ConnectTimeout=10 $tarFile "${User}@${TargetHost}:/tmp/trafficflow_opi5_sync.tar"

    Write-Host "  Extracting on Orange Pi 5..." -ForegroundColor Gray
    ssh.exe -o BatchMode=yes "${User}@${TargetHost}" "chmod -R u+rwX $RemoteDir 2>/dev/null || true; tar --overwrite --no-same-permissions --no-same-owner -xf /tmp/trafficflow_opi5_sync.tar -C $RemoteDir && rm -f /tmp/trafficflow_opi5_sync.tar && cp $RemoteDir/configs/env.opi5 $RemoteDir/.env && chmod -R u+rwX $RemoteDir"
    Remove-Item $tarFile -Force -ErrorAction SilentlyContinue

    Write-Host "[SUCCESS] Sync completed!" -ForegroundColor Green
}

if ($Stage -in @("compile-rknn", "all")) {
    Write-Host "`n[2/5] Compiling fine-tuned models to RKNN on Orange Pi 5..." -ForegroundColor Yellow
    ssh.exe "${User}@${TargetHost}" "cd $RemoteDir && $PythonEnv scripts/build_rknn_on_board.py"
    Write-Host "[SUCCESS] RKNN on-board compilation completed!" -ForegroundColor Green
}

if ($Stage -in @("build-docker")) {
    Write-Host "`n[3/5] Building ARM64 Docker images on Orange Pi 5..." -ForegroundColor Yellow
    ssh.exe "${User}@${TargetHost}" "cd $RemoteDir && docker compose -f docker/docker-compose.opi5.yml build"
    Write-Host "[SUCCESS] Docker build completed!" -ForegroundColor Green
}

if ($Stage -in @("start")) {
    Write-Host "`n[4/5] Launching TrafficFlow Edge Cloud stack via Docker..." -ForegroundColor Yellow
    ssh.exe "${User}@${TargetHost}" "cd $RemoteDir && docker compose -f docker/docker-compose.opi5.yml up -d"
    Write-Host "[SUCCESS] Services started! API accessible at http://${TargetHost}:8000" -ForegroundColor Green
}

if ($Stage -in @("start-native", "all")) {
    Write-Host "`n[4/5] Launching TrafficFlow Edge Cloud natively on Orange Pi 5..." -ForegroundColor Yellow
    ssh.exe "${User}@${TargetHost}" "cd $RemoteDir && bash scripts/start_edge_server.sh"
    Start-Sleep -Seconds 2
    Write-Host "[SUCCESS] Edge Cloud API running at http://${TargetHost}:8000" -ForegroundColor Green
}

if ($Stage -eq "stop") {
    Write-Host "`nStopping TrafficFlow Edge Cloud..." -ForegroundColor Yellow
    ssh.exe "${User}@${TargetHost}" "cd $RemoteDir && bash scripts/stop_edge_server.sh; cd $RemoteDir && docker compose -f docker/docker-compose.opi5.yml down 2>/dev/null || true"
    Write-Host "[SUCCESS] Services stopped." -ForegroundColor Green
}

if ($Stage -in @("status", "all")) {
    Write-Host "`n[5/5] Checking Edge Cloud status on Orange Pi 5..." -ForegroundColor Yellow
    ssh.exe "${User}@${TargetHost}" "cd $RemoteDir && bash scripts/status_edge_server.sh"
}
