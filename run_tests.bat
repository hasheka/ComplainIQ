@echo off
REM Runs the backend tests (pytest) and the frontend tests (vitest, type-check, lint).
cd /d "%~dp0"
call .venv\Scripts\activate.bat
echo === Backend tests ===
python -m pytest -q
echo.
echo === Frontend: type check, lint, tests ===
cd frontend
call npm run typecheck
call npm run lint
call npm test
cd ..
pause
