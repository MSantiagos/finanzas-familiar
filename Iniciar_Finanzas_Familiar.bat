@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Finanzas Familiar — Servidor WiFi Sincronizado (CRDT-Lite)

set "PORT=8090"
set "PY_CMD="

where python >nul 2>&1
if %errorlevel% equ 0 (
    python --version >nul 2>&1
    if !errorlevel! equ 0 set "PY_CMD=python"
)

if "!PY_CMD!"=="" (
    where py >nul 2>&1
    if !errorlevel! equ 0 set "PY_CMD=py"
)

if "!PY_CMD!"=="" (
    echo ========================================================
    echo [ERROR] No se detecto Python instalado en este equipo.
    echo Instala Python 3 desde https://www.python.org/downloads/
    echo ========================================================
    pause
    exit /b 1
)

set "LOCAL_IP=localhost"
for /f "delims=" %%i in ('!PY_CMD! -c "import socket; s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()" 2^>nul') do (
    set "LOCAL_IP=%%i"
)

echo ====================================================================
echo   🛡️  FINANZAS FAMILIAR — SERVIDOR WIFI SINCRONIZADO (CRDT-Lite)
echo ====================================================================
echo.
echo   💻 En este PC (Windows):          http://localhost:%PORT%
echo   📱 iPhones Mauricio y Marie:      http://!LOCAL_IP!:%PORT%
echo.
echo --------------------------------------------------------------------
echo   • Abre la URL WiFi en Safari en ambos iPhones (misma red WiFi).
echo   • Toca "Compartir -> Agregar a pantalla de inicio" para modo PWA.
echo   • Sincronización CRDT-Lite activa: ambos celulares y este PC
echo     fusionan gastos en vivo sin sobrescribirse jamás.
echo   • Presiona Ctrl+C en esta ventana cuando desees apagar el servidor.
echo ====================================================================
echo.

start "" "http://localhost:%PORT%"
!PY_CMD! server.py

if %errorlevel% neq 0 (
    echo.
    echo [AVISO] El servidor se detuvo con codigo %errorlevel%.
    pause
)
