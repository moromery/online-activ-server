@echo off
REM ==== ملف BAT لرفع مشروعك على GitHub تلقائي ====

REM ===== إعداد رابط الريبو =====
set REPO_URL=https://github.com/moromery/online-activ-server.git

REM ===== تهيئة المشروع لو محتاج =====
git init

REM ===== إضافة كل الملفات =====
git add .

REM ===== Commit =====
set /p COMMIT_MSG=ادخل رسالة الـ Commit (تركها فاضية لـ "Auto commit"): 
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Auto commit
git commit -m "%COMMIT_MSG%"

REM ===== إضافة Remote =====
git remote remove origin
git remote add origin %REPO_URL%

REM ===== Push للـ GitHub =====
echo جاري رفع المشروع على GitHub...
git push -u origin main --force

echo.
echo ✅ تم رفع المشروع على GitHub بنجاح!
pause
