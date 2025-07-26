# Drowning Detection System

A real-time drowning detection system using YOLOv8 deep learning model with web-based interface.

## Features

- Real-time video analysis for drowning detection
- Web-based user interface
- Live progress tracking with frame-by-frame updates
- YOLO-based object detection model
- Server-Sent Events for real-time updates

## Quick Setup

### For Windows Users:

1. **Double-click `setup.bat`** - This will automatically:
   - Create virtual environment
   - Install all dependencies
   - Set up the project

### Manual Setup:

```bash
# Create virtual environment
python -m venv drowning_detection_env

# Activate environment (Windows)
drowning_detection_env\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Running the Application

1. **Activate environment:**

   ```bash
   drowning_detection_env\Scripts\activate
   ```

2. **Start the server:**

   ```bash
   python app_live.py
   ```

3. **Open your browser and go to:**

   ```
   http://localhost:5000
   ```

4. **Open `index.html` in another tab** for the web interface

## Project Structure

```
drowning_detection/
├── app_live.py              # Flask backend server
├── index.html               # Web interface
├── script_live.js           # Frontend JavaScript
├── styles.css               # Styling
├── setup.bat                # Automated setup script
├── requirements.txt         # Python dependencies
└── drowning or not/
    ├── model.pt            # YOLOv8 model file
    └── test.mp4            # Sample test video
```

## Dependencies

- Python 3.12+
- Flask 2.3.3
- OpenCV-Python 4.10.0.84
- PyTorch 2.7.1+cpu
- Ultralytics 8.3.169
- Flask-CORS 6.0.1

## Usage

1. Upload a video file through the web interface
2. Click "Start Live Detection"
3. Watch real-time analysis with frame-by-frame detection
4. Results show drowning detection with bounding boxes

## Model Information

- **Model Type:** YOLOv8 (Ultralytics)
- **Classes:** Drowning detection trained model
- **Input:** Video files (MP4, AVI, MOV, etc.)
- **Output:** Real-time detection with confidence scores

## Browser Compatibility

- Chrome (Recommended)
- Firefox
- Edge
- Safari

## Troubleshooting

- Ensure virtual environment is activated
- Check that model.pt file exists in "drowning or not/" folder
- Verify all dependencies are installed
- Make sure port 5000 is available

---

_For detailed setup instructions, see DEPLOYMENT_GUIDE.md_
