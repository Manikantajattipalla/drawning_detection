from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import cv2
import numpy as np
import tempfile
import os
import torch
import json
import time
import base64
from threading import Thread
import uuid

app = Flask(__name__)
CORS(app)

# Store active detection sessions
detection_sessions = {}

def load_model():
    """Load YOLO model with PyTorch 2.6+ compatibility"""
    print("Loading YOLO model...")
    
    # Set weights_only=False for PyTorch 2.6+
    original_load = torch.load
    torch.load = lambda *args, **kwargs: original_load(*args, **{**kwargs, 'weights_only': False})
    
    try:
        from ultralytics import YOLO
        model = YOLO("drowning or not/model.pt")
        print("✅ Model loaded successfully!")
        print(f"Model classes: {list(model.names.values())}")
        return model
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        raise e
    finally:
        # Restore original torch.load
        torch.load = original_load

# Load model at startup
try:
    model = load_model()
    MODEL_LOADED = True
except Exception as e:
    print(f"CRITICAL ERROR: {e}")
    MODEL_LOADED = False
    model = None

class DetectionSession:
    def __init__(self, session_id):
        self.session_id = session_id
        self.status = "processing"
        self.progress = 0
        self.current_frame = 0
        self.total_frames = 0
        self.drowning_count = 0
        self.detections = []
        self.result = None
        self.error = None
        self.processed_frame_data = None

@app.route('/detect_live', methods=['POST'])
def detect_drowning_live():
    if not MODEL_LOADED:
        return jsonify({'error': 'Model not loaded'}), 500
    
    try:
        if 'video' not in request.files:
            return jsonify({'error': 'No video file provided'}), 400
        
        video_file = request.files['video']
        if video_file.filename == '':
            return jsonify({'error': 'No video file selected'}), 400
        
        # Create session ID
        session_id = str(uuid.uuid4())
        session = DetectionSession(session_id)
        detection_sessions[session_id] = session
        
        print(f"Starting live detection for: {video_file.filename}")
        
        # Save video temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_file:
            video_file.save(temp_file.name)
            temp_path = temp_file.name
        
        # Start processing in background thread
        thread = Thread(target=process_video_live, args=(temp_path, session_id))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'session_id': session_id,
            'message': 'Detection started'
        })
    
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/detection_status/<session_id>')
def get_detection_status(session_id):
    """Get current status of detection session"""
    if session_id not in detection_sessions:
        return jsonify({'error': 'Session not found'}), 404
    
    session = detection_sessions[session_id]
    
    response_data = {
        'session_id': session_id,
        'status': session.status,
        'progress': session.progress,
        'current_frame': session.current_frame,
        'total_frames': session.total_frames,
        'drowning_count': session.drowning_count,
        'detections': session.detections[-10:],  # Last 10 detections
        'result': session.result,
        'error': session.error
    }
    
    # Include processed frame if available
    if session.processed_frame_data:
        response_data['frame_data'] = session.processed_frame_data
        session.processed_frame_data = None  # Clear after sending
    
    return jsonify(response_data)

@app.route('/live_updates/<session_id>')
def live_updates(session_id):
    """Server-Sent Events endpoint for live updates"""
    def generate():
        if session_id not in detection_sessions:
            yield f"data: {json.dumps({'error': 'Session not found'})}\n\n"
            return
        
        while session_id in detection_sessions:
            session = detection_sessions[session_id]
            
            update_data = {
                'status': session.status,
                'progress': session.progress,
                'current_frame': session.current_frame,
                'total_frames': session.total_frames,
                'drowning_count': session.drowning_count,
                'recent_detections': session.detections[-3:] if session.detections else []
            }
            
            # Include frame data if available
            if session.processed_frame_data:
                update_data['frame_data'] = session.processed_frame_data
                session.processed_frame_data = None
            
            yield f"data: {json.dumps(update_data)}\n\n"
            
            # If processing is complete, send final result and break
            if session.status in ['completed', 'error']:
                if session.status == 'completed':
                    final_data = {
                        'status': 'completed',
                        'result': session.result,
                        'total_detections': len(session.detections),
                        'drowning_count': session.drowning_count
                    }
                else:
                    final_data = {
                        'status': 'error',
                        'error': session.error
                    }
                yield f"data: {json.dumps(final_data)}\n\n"
                break
            
            time.sleep(0.5)  # Update every 500ms
    
    return Response(generate(), mimetype='text/event-stream')

def process_video_live(video_path, session_id):
    """Process video with live updates"""
    session = detection_sessions[session_id]
    
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            session.error = "Cannot open video file"
            session.status = "error"
            return
        
        # Get total frame count
        session.total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        drowning_count = 0
        frame_count = 0
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            session.current_frame = frame_count
            session.progress = int((frame_count / session.total_frames) * 100)
            
            # Process every 10th frame
            if frame_count % 10 != 0:
                continue
            
            try:
                # Run detection
                results = model(frame, verbose=False)[0]
                
                frame_detections = []
                frame_has_drowning = False
                
                if results.boxes is not None:
                    # Draw bounding boxes on frame
                    annotated_frame = frame.copy()
                    
                    for box in results.boxes:
                        cls_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        label = model.names[cls_id]
                        
                        # Get bounding box coordinates
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                        
                        detection_info = {
                            'frame': frame_count,
                            'label': label,
                            'confidence': round(conf, 2),
                            'bbox': [x1, y1, x2, y2],
                            'timestamp': round(frame_count / fps, 2) if fps > 0 else 0
                        }
                        
                        frame_detections.append(detection_info)
                        
                        # Draw bounding box
                        color = (0, 0, 255) if "drown" in label.lower() else (0, 255, 0)
                        cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(annotated_frame, f"{label}: {conf:.2f}", 
                                  (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                        
                        # Check for drowning
                        if "drown" in label.lower() and conf >= 0.5:
                            drowning_count += 1
                            frame_has_drowning = True
                            print(f"Frame {frame_count}: Drowning detected! ({conf:.2f})")
                    
                    # Convert frame to base64 for frontend display
                    _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    frame_base64 = base64.b64encode(buffer).decode('utf-8')
                    session.processed_frame_data = frame_base64
                
                # Add detections to session
                session.detections.extend(frame_detections)
                session.drowning_count = drowning_count
                
                # Early termination if enough drowning detected
                if drowning_count >= 3:
                    print(f"Early termination: {drowning_count} drowning detections found")
                    break
                    
            except Exception as e:
                print(f"Frame processing error: {e}")
                continue
        
        cap.release()
        
        # Set final result
        session.result = drowning_count >= 2
        session.status = "completed"
        session.progress = 100
        
        # Clean up temporary file
        if os.path.exists(video_path):
            os.unlink(video_path)
        
        print(f"Detection completed. Result: {session.result}, Drowning count: {drowning_count}")
        
    except Exception as e:
        session.error = str(e)
        session.status = "error"
        print(f"Processing error: {e}")
        
        # Clean up on error
        if os.path.exists(video_path):
            os.unlink(video_path)

@app.route('/detect', methods=['POST'])
def detect_drowning():
    """Original simple detection endpoint"""
    if not MODEL_LOADED:
        return jsonify({'error': 'Model not loaded'}), 500
    
    try:
        if 'video' not in request.files:
            return jsonify({'error': 'No video file provided'}), 400
        
        video_file = request.files['video']
        if video_file.filename == '':
            return jsonify({'error': 'No video file selected'}), 400
        
        print(f"Processing: {video_file.filename}")
        
        # Save video temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_file:
            video_file.save(temp_file.name)
            temp_path = temp_file.name
        
        try:
            # Process video
            result = process_video_simple(temp_path)
            return jsonify({
                'drowning_detected': result,
                'message': 'Drowning detected!' if result else 'No drowning detected'
            })
        finally:
            # Clean up
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

def process_video_simple(video_path):
    """Simple video processing without live updates"""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception("Cannot open video file")
    
    drowning_count = 0
    frame_count = 0
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_count += 1
        if frame_count % 10 != 0:
            continue
        
        try:
            results = model(frame, verbose=False)[0]
            
            if results.boxes is not None:
                for box in results.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    label = model.names[cls_id]
                    
                    if "drown" in label.lower() and conf >= 0.5:
                        drowning_count += 1
            
            if drowning_count >= 2:
                cap.release()
                return True
                
        except Exception as e:
            print(f"Frame processing error: {e}")
            continue
    
    cap.release()
    return drowning_count >= 2

@app.route('/health')
def health():
    return jsonify({
        'status': 'healthy',
        'model_loaded': MODEL_LOADED,
        'active_sessions': len(detection_sessions)
    })

@app.route('/')
def root():
    return jsonify({
        'message': 'Drowning Detection API with Live Updates',
        'model_status': 'loaded' if MODEL_LOADED else 'failed',
        'endpoints': {
            'detect': 'POST /detect (simple detection)',
            'detect_live': 'POST /detect_live (live detection)',
            'status': 'GET /detection_status/<session_id>',
            'live_updates': 'GET /live_updates/<session_id> (SSE)'
        }
    })

if __name__ == '__main__':
    print(f"Server starting with live detection... Model: {'Loaded' if MODEL_LOADED else 'Failed'}")
    app.run(debug=True, host='0.0.0.0', port=5000)
