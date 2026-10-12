@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if not errorlevel 1 goto run

where winget.exe >nul 2>nul
if errorlevel 1 (
    echo No se encontro Node.js ni WinGet.
    echo Instala Node.js LTS desde https://nodejs.org/ y volve a ejecutar este archivo.
    goto finish
)

echo Instalando Node.js LTS. Windows puede solicitar permisos de administrador.
winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo No se pudo completar la instalacion de Node.js.
    echo Instala Node.js LTS desde https://nodejs.org/ y volve a ejecutar este archivo.
    goto finish
)

rem Leer el PATH actualizado sin depender de una nueva consola.
powershell.exe -NoProfile -Command "$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'); if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { Write-Host 'Node.js no esta disponible. Cerra esta consola y ejecuta iniciar.bat nuevamente.'; exit 1 }; & node.exe server.cjs; exit $LASTEXITCODE"
goto finish

:run
node.exe server.cjs
:finish
pause

