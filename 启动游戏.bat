@echo off
cd /d %~dp0
start "dream-server" /min python -m http.server 8283
timeout /t 1 >nul
start "" http://localhost:8283
