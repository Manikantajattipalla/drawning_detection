const videoInput = document.getElementById("videoInput");
const videoUpload = document.getElementById("videoUpload");
const liveDetectBtn = document.getElementById("liveDetectBtn");
const resetBtn = document.getElementById("resetBtn");

// Live detection elements
const liveDetectionDiv = document.getElementById("liveDetection");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const currentFrameSpan = document.getElementById("currentFrame");
const totalFramesSpan = document.getElementById("totalFrames");
const drowningCountSpan = document.getElementById("drowningCount");
const detectionStatusSpan = document.getElementById("detectionStatus");
const liveFrameContainer = document.getElementById("liveFrameContainer");
const liveFrameImg = document.getElementById("liveFrame");
const detectionsList = document.getElementById("detectionsList");

// Backend API URL
const API_URL = "http://localhost:5000";

// Current session tracking
let currentSession = null;
let eventSource = null;

// Handle video file selection
videoUpload.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    videoInput.src = url;
    liveDetectBtn.disabled = false;
    liveDetectionDiv.classList.add("hidden");
  }
});

// Live detection functionality
liveDetectBtn.addEventListener("click", async function () {
  if (!videoInput.src) return;

  const file = videoUpload.files[0];
  if (!file) {
    // Log error to console instead of showing alert
    console.error("Please select a video file first");
    return;
  }

  // Show live detection interface
  liveDetectionDiv.classList.remove("hidden");

  // Disable buttons
  liveDetectBtn.disabled = true;
  liveDetectBtn.textContent = "Processing..."; // Reset live detection display
  resetLiveDetectionDisplay();

  try {
    // Start live detection
    const sessionId = await startLiveDetection(file);
    currentSession = sessionId;

    // Start listening to live updates
    startLiveUpdates(sessionId);
  } catch (error) {
    console.error("Live detection error:", error);
    showError("Error starting live detection: " + error.message);
    resetUI();
  }
});

// Reset functionality
resetBtn.addEventListener("click", function () {
  videoInput.src = "";
  videoUpload.value = "";
  liveDetectBtn.disabled = true;
  liveDetectionDiv.classList.add("hidden");

  // Stop live updates if running
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  currentSession = null;
  resetUI();
});

async function startLiveDetection(videoFile) {
  const formData = new FormData();
  formData.append("video", videoFile);

  const response = await fetch(`${API_URL}/detect_live`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Live detection failed");
  }

  const result = await response.json();
  return result.session_id;
}

function startLiveUpdates(sessionId) {
  // Close existing event source
  if (eventSource) {
    eventSource.close();
  }

  // Create new event source for live updates
  eventSource = new EventSource(`${API_URL}/live_updates/${sessionId}`);

  eventSource.onmessage = function (event) {
    try {
      const data = JSON.parse(event.data);
      updateLiveDisplay(data);

      // Handle completion
      if (data.status === "completed") {
        handleDetectionComplete(data);
      } else if (data.status === "error") {
        handleDetectionError(data);
      }
    } catch (error) {
      console.error("Error parsing live update:", error);
    }
  };

  eventSource.onerror = function (event) {
    console.error("EventSource failed:", event);
    if (eventSource.readyState === EventSource.CLOSED) {
      showError("Connection to server lost");
      resetUI();
    }
  };
}

function updateLiveDisplay(data) {
  // Update progress
  if (data.progress !== undefined) {
    progressFill.style.width = `${data.progress}%`;
    progressText.textContent = `${data.progress}%`;
  }

  // Update frame info
  if (data.current_frame !== undefined) {
    currentFrameSpan.textContent = data.current_frame;
  }
  if (data.total_frames !== undefined) {
    totalFramesSpan.textContent = data.total_frames;
  }

  // Update drowning count with immediate alert
  if (data.drowning_count !== undefined) {
    const previousCount = parseInt(drowningCountSpan.textContent) || 0;
    drowningCountSpan.textContent = data.drowning_count;

    if (data.drowning_count > 0) {
      drowningCountSpan.style.color = "#dc3545";
      drowningCountSpan.style.fontWeight = "bold";

      // Show alert if new drowning detected
      if (data.drowning_count > previousCount) {
        showDrowningAlert(data.current_frame, data.drowning_count);
      }
    }
  }

  // Update status
  if (data.status) {
    detectionStatusSpan.textContent = getStatusText(data.status);
    detectionStatusSpan.className = `status-${data.status}`;
  }

  // Update frame display
  if (data.frame_data) {
    liveFrameImg.src = `data:image/jpeg;base64,${data.frame_data}`;
    liveFrameContainer.classList.remove("hidden");
  }

  // Update recent detections with immediate alerts
  if (data.recent_detections && data.recent_detections.length > 0) {
    updateDetectionsList(data.recent_detections);

    // Check for new drowning detections and show alerts
    data.recent_detections.forEach((detection) => {
      if (
        detection.label &&
        detection.label.toLowerCase().includes("drown") &&
        detection.confidence >= 0.5
      ) {
        showInstantDrowningAlert(detection);
      }
    });
  }
}

function updateDetectionsList(detections) {
  // Keep only last 10 detections
  const maxDetections = 10;

  detections.forEach((detection) => {
    const detectionElement = createDetectionElement(detection);
    detectionsList.insertBefore(detectionElement, detectionsList.firstChild);
  });

  // Remove excess detections
  while (detectionsList.children.length > maxDetections) {
    detectionsList.removeChild(detectionsList.lastChild);
  }
}

function createDetectionElement(detection) {
  const element = document.createElement("div");
  element.className = "detection-item";

  if (detection.label && detection.label.toLowerCase().includes("drown")) {
    element.classList.add("drowning");
  }

  element.innerHTML = `
    <div>
      <span class="detection-label">${detection.label || "Unknown"}</span>
      <span class="detection-confidence">(${(
        detection.confidence * 100
      ).toFixed(1)}%)</span>
    </div>
    <div>
      <span class="detection-time">Frame ${detection.frame} (${
    detection.timestamp
  }s)</span>
    </div>
  `;

  return element;
}

function handleDetectionComplete(data) {
  console.log("Detection completed:", data);

  // Update final status
  detectionStatusSpan.textContent = "Completed";
  detectionStatusSpan.className = "status-completed";

  // Detection completed - results shown in live display

  // Close event source
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  resetUI();
}

function handleDetectionError(data) {
  console.error("Detection error:", data.error);
  showError(data.error || "Detection failed");
  resetUI();
}

function showError(message) {
  console.error(`Error: ${message}`);
  detectionStatusSpan.textContent = "Error";
  detectionStatusSpan.className = "status-error";
}

function resetLiveDetectionDisplay() {
  progressFill.style.width = "0%";
  progressText.textContent = "0%";
  currentFrameSpan.textContent = "0";
  totalFramesSpan.textContent = "0";
  drowningCountSpan.textContent = "0";
  drowningCountSpan.style.color = "";
  drowningCountSpan.style.fontWeight = "";
  detectionStatusSpan.textContent = "Processing...";
  detectionStatusSpan.className = "status-processing";
  liveFrameContainer.classList.add("hidden");
  detectionsList.innerHTML = "";
}

function resetUI() {
  liveDetectBtn.disabled = false;
  liveDetectBtn.textContent = "Start Detection";
}

// Real-time drowning alert functions
function showDrowningAlert(frameNumber, totalCount) {
  // Log drowning detection to console instead of showing alert
  console.log(
    `🚨 DROWNING DETECTED! Frame: ${frameNumber}, Total Detections: ${totalCount}`
  );
}

function showInstantDrowningAlert(detection) {
  // Log high-confidence drowning detection to console
  if (detection.confidence >= 0.7) {
    console.log(
      `🚨 HIGH CONFIDENCE DROWNING! Frame: ${detection.frame}, Confidence: ${(
        detection.confidence * 100
      ).toFixed(1)}%`
    );
  }
}

function getStatusText(status) {
  switch (status) {
    case "processing":
      return "Processing...";
    case "completed":
      return "Completed";
    case "error":
      return "Error";
    default:
      return status;
  }
}

// Check if backend is running
async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (response.ok) {
      const data = await response.json();
      console.log("Backend is running and ready");
      console.log("Active sessions:", data.active_sessions);
      document.body.style.borderTop = "3px solid green";
    }
  } catch (error) {
    console.warn("Backend not available:", error.message);
    document.body.style.borderTop = "3px solid red";
  }
}

// Check backend health on page load
checkBackendHealth();

// Refresh health check every 30 seconds
setInterval(checkBackendHealth, 30000);
