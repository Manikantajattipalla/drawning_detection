@echo off
echo ========================================
echo  Drowning Detection System Setup
echo ========================================

echo Creating virtual environment...
python -m venv drowning_detection_env

echo Activating virtual environment...
call drowning_detection_env\Scripts\activate.bat

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo ========================================
echo  Setup Complete!
echo ========================================
echo.
echo To run the application:
echo 1. drowning_detection_env\Scripts\activate
echo 2. python app_live.py
echo 3. Open index.html in your browser
echo.
pause
