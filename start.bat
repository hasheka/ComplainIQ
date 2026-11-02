@echo off
REM ComplainIQ - start the website. Run setup.bat once first.
cd /d "%~dp0"
if not exist .venv\Scripts\activate.bat ( echo Run setup.bat first. & pause & exit /b 1 )
if not exist frontend\dist\index.html ( echo The website is not built yet. Run setup.bat first. & pause & exit /b 1 )
call .venv\Scripts\activate.bat

REM Local http (not https), so the login cookie must not be marked "Secure".
set COOKIE_SECURE=false

alembic upgrade head || (echo Database setup failed & pause & exit /b 1)

echo.
echo   Website:        http://127.0.0.1:8000
echo   API docs:       http://127.0.0.1:8000/api/docs
echo   Stop the app with Ctrl+C in this window.
echo.
start "" http://127.0.0.1:8000
uvicorn backend.main:app --host 127.0.0.1 --port 8000
pause
