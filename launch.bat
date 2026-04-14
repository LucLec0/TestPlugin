@echo off
setlocal
cd /d "%~dp0"
echo Demarrage du serveur Survivor...
start "" http://localhost:8080
node server.js
endlocal
