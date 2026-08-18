@echo off
chcp 65001 >nul
title Safar Service - Setup & Installation
echo ==============================================
echo   SAFAR SERVICE - SETUP & INSTALLATION
echo ==============================================
echo.

:: Step 1: Install PostgreSQL
echo [1/5] Installing PostgreSQL...
echo.
echo PostgreSQL is required for the Safar Service.
echo.
echo Please download and install PostgreSQL 17 from:
echo https://www.postgresql.org/download/windows/
echo.
echo After installation, ensure:
echo   - Port: 5432
echo   - Database: safar_service
echo   - User: postgres
echo   - Password: postgres
echo.
pause

:: Step 2: Install npm dependencies
echo.
echo [2/5] Installing npm dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)
echo ✓ npm dependencies installed

:: Step 3: Create database
echo.
echo [3/5] Creating database...
echo.
echo Please ensure PostgreSQL is running, then:
echo 1. Open pgAdmin or psql
echo 2. Create database: CREATE DATABASE safar_service;
echo 3. Run: node 00-infrastructure/database/migrations/run-all-migrations.js
echo.
pause

:: Step 4: Run migrations
echo.
echo [4/5] Running database migrations...
node 00-infrastructure/database/migrations/run-all-migrations.js
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Migration failed. Check PostgreSQL connection.
    echo Make sure PostgreSQL is running and database exists.
)
echo ✓ Migrations completed

:: Step 5: Run tests
echo.
echo [5/5] Running tests...
npx jest --runInBand --testTimeout=30000 --forceExit 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Some tests failed. Check the output above.
)
echo ✓ Tests completed

echo.
echo ==============================================
echo   SETUP COMPLETE
echo ==============================================
echo.
echo To start the server:
echo   node server.js
echo.
echo To start individual microservices:
echo   node 12-trip-management/run-server.js
echo   node 13-auth-management/run-server.js
echo   node 14-admin-panel/run-server.js
echo   node 15-pricing-engine/run-server.js
echo.
pause