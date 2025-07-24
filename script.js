const videoInput = document.getElementById('videoInput');
const videoUpload = document.getElementById('videoUpload');
const detectBtn = document.getElementById('detectBtn');
const resetBtn = document.getElementById('resetBtn');
const resultDiv = document.getElementById('result');

// Handle video file selection
videoUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        videoInput.src = url;
        detectBtn.disabled = false;
        resultDiv.classList.add('hidden');
    }
});

// Detect swimming when button is clicked
detectBtn.addEventListener('click', async function() {
    if (!videoInput.src) return;
    
    // Show loading state
    detectBtn.disabled = true;
    detectBtn.textContent = 'Detecting...';
    resultDiv.classList.add('hidden');

    try {
        // In a real implementation, you would send the video to your backend
        // For this example, we'll simulate a response
        const isSwimming = await callSwimmingDetectionAPI(videoInput.src);
        
        // Display result
        resultDiv.textContent = isSwimming ? 
            '✅ Swimming Detected!' : 
            '❌ No Swimming Detected';
        resultDiv.className = isSwimming ? 
            'swimming' : 
            'not-swimming';
        resultDiv.classList.remove('hidden');
    } catch (error) {
        console.error('Detection error:', error);
        resultDiv.textContent = 'Error during detection';
        resultDiv.className = 'not-swimming';
        resultDiv.classList.remove('hidden');
    } finally {
        detectBtn.disabled = false;
        detectBtn.textContent = 'Detect Swimming';
    }
});

// Reset the interface
resetBtn.addEventListener('click', function() {
    videoInput.src = '';
    videoUpload.value = '';
    detectBtn.disabled = true;
    resultDiv.classList.add('hidden');
});

// Simulate API call to backend
function callSwimmingDetectionAPI(videoUrl) {
    return new Promise((resolve) => {
        // Simulate network delay
        setTimeout(() => {
            // Random result for demonstration
            // In reality, you would process the video on your backend
            resolve(Math.random() > 0.5);
        }, 2000);
    });
}