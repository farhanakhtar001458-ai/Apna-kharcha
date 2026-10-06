@echo off
setlocal
set APP_HOME=%~dp0
set GRADLE_VERSION=8.9
if "%GRADLE_USER_HOME%"=="" set GRADLE_USER_HOME=%USERPROFILE%\.gradle
set DIST_ROOT=%GRADLE_USER_HOME%\wrapper\dists\apna-hisab-gradle-%GRADLE_VERSION%
set GRADLE_HOME=%DIST_ROOT%\gradle-%GRADLE_VERSION%
if not exist "%GRADLE_HOME%\bin\gradle.bat" (
  if not exist "%DIST_ROOT%" mkdir "%DIST_ROOT%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip -OutFile '%DIST_ROOT%\gradle-%GRADLE_VERSION%-bin.zip'"
  if errorlevel 1 exit /b %ERRORLEVEL%
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force '%DIST_ROOT%\gradle-%GRADLE_VERSION%-bin.zip' '%DIST_ROOT%'"
  if errorlevel 1 exit /b %ERRORLEVEL%
  del "%DIST_ROOT%\gradle-%GRADLE_VERSION%-bin.zip"
)
call "%GRADLE_HOME%\bin\gradle.bat" -p "%APP_HOME%" %*
endlocal
