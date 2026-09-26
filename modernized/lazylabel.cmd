@echo off
rem LazyLabel with options, from PowerShell or cmd, in this folder:
rem   .\lazylabel.cmd "C:\path\to\your\images" --port 8790 --no-open
rem "npm start" needs a "--" before options, and PowerShell's npm drops it; this needs none.
node "%~dp0lazylabel-reimagined\api\dist\src\cli.js" %*
