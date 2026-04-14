@echo off
setlocal
cd /d "%~dp0"
echo Demarrage du serveur Survivor...
start "" http://localhost:8787
node server.js
endlocal
