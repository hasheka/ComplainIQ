@echo off
REM ComplainIQ - one-time setup for Windows. Double-click, or run in Command Prompt:  setup.bat
cd /d "%~dp0"

echo === 1/4  Checking Python and Node.js ===
python --version || (echo Python 3.11 or newer is required. Install from https://www.python.org/downloads/ and tick "Add python.exe to PATH". & pause & exit /b 1)
node --version   || (echo Node.js 20 or newer is required. Install the LTS version from https://nodejs.org/ & pause & exit /b 1)

echo === 2/4  Creating the Python environment and installing packages ===
if not exist .venv ( python -m venv .venv || (echo Could not create the virtual environment & pause & exit /b 1) )
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt || (echo pip install failed - read the error above & pause & exit /b 1)

echo === 3/4  Building the website (takes a few minutes the first time) ===
cd frontend
call npm ci || (echo npm ci failed - read the error above & cd .. & pause & exit /b 1)
call npm run build || (echo Frontend build failed - read the error above & cd .. & pause & exit /b 1)
cd ..

echo === 4/4  Creating the database ===
alembic upgrade head || (echo Database setup failed & pause & exit /b 1)

echo.
echo Setup finished. Start the app with:  start.bat
pause
