@echo off
cd /d "%~dp0"
echo Publicando la app del celular en internet (GitHub Pages)...
git add -A
git -c core.autocrlf=false commit -m "Actualizacion de la app del celular" >nul 2>&1
git push origin main
if errorlevel 1 (
  echo.
  echo No se pudo publicar. Revisa tu conexion a internet y que sigas conectado a GitHub (gh auth status).
) else (
  echo.
  echo Listo. En 1 o 2 minutos la version nueva estara en:
  echo https://alphacoresolution.github.io/detector-reacciones-app/
  echo En el iPhone, cierra la app y vuelve a abrirla para que tome los cambios.
)
pause
