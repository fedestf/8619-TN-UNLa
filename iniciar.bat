@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if not errorlevel 1 (
    node.exe server.cjs
    goto finish
)
set "SPOTIFY_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%SPOTIFY_NODE%" (
    "%SPOTIFY_NODE%" server.cjs
    goto finish
)
echo No se encontro Node.js en esta PC.
echo Instala Node.js y volve a ejecutar este archivo.
:finish
pause
