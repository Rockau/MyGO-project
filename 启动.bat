@echo off
cd /d "%~dp0"
start "" http://localhost:8000/
node serve.mjs 8000
pause
