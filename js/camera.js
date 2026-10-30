/**
 * DRISVYA - Camera Lifecycle & Assistance Controller
 * Phase 1: Real media handling, viewfinder HUD, honest permission management.
 * Strictly avoids fake AI simulation. Architecture is pre-wired for TensorFlow.js & COCO-SSD.
 */

class CameraController {
  constructor() {
    this.isActive = false;
    this.stream = null;
    this.videoEl = null;
    this.canvasEl = null;
    this.ctx = null;
    this.cardEl = null;
    this.placeholderEl = null;
    this.statusTextEl = null;
    this.toggleBtnEl = null;
    this.stickyBtnEl = null;
    this.hudBadgeEl = null;

    // Detection state (ready for Phase 2 models)
    this.detections = {
      objects: 0,
      people: 0,
      vehicles: 0,
      nearest: "None within range"
    };

    // Phase 2 hook callback
    this.onFrameCallback = null;
    this.animFrameId = null;
  }

  init() {
    this.videoEl = document.getElementById('cameraVideo');
    this.canvasEl = document.getElementById('overlayCanvas');
    if (this.canvasEl) {
      this.ctx = this.canvasEl.getContext('2d');
    }
    this.cardEl = document.getElementById('cameraCard');
    this.placeholderEl = document.getElementById('cameraPlaceholder');
    this.statusTextEl = document.getElementById('cameraStatusValue');
    this.toggleBtnEl = document.getElementById('btnToggleAssistance');
    this.stickyBtnEl = document.getElementById('btnStickyAssist');
    this.hudBadgeEl = document.getElementById('hudLiveBadge');

    if (this.toggleBtnEl) {
      this.toggleBtnEl.addEventListener('click', () => this.toggleAssistance());
    }
    if (this.stickyBtnEl) {
      this.stickyBtnEl.addEventListener('click', () => this.toggleAssistance());
    }

    this.updateDetectionUI();
  }

  async toggleAssistance() {
    if (this.isActive) {
      await this.stopAssistance();
    } else {
      await this.startAssistance();
    }
  }

  async startAssistance() {
    if (this.isActive) return;

    if (window.soundEngine) {
      window.soundEngine.playStart();
    }
    if (window.a11yManager) {
      window.a11yManager.vibrate([40, 80, 40]);
    }

    this.setStatus("Requesting Camera Access...");
    if (window.app) {
      window.app.logActivity("Starting DRISVYA visual assistance...", "camera");
    }

    // Check mediaDevices support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errorMsg = "Camera access requires HTTPS or localhost on Android. Please check your connection.";
      this.setStatus("Camera Not Supported");
      if (window.voiceAssistant) {
        window.voiceAssistant.speak(errorMsg);
      }
      if (window.app) {
        window.app.logActivity(errorMsg, "alert");
      }
      return;
    }

    try {
      // Request real rear/environment camera on Android
      const constraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = stream;

      if (this.videoEl) {
        this.videoEl.srcObject = stream;
        await new Promise((resolve) => {
          this.videoEl.onloadedmetadata = () => resolve();
        });
        await this.videoEl.play();
        this.videoEl.classList.add('active');

        // Adjust canvas dimensions to match video stream
        if (this.canvasEl) {
          this.canvasEl.width = this.videoEl.videoWidth || 640;
          this.canvasEl.height = this.videoEl.videoHeight || 480;
        }
      }

      if (this.placeholderEl) {
        this.placeholderEl.classList.add('hidden');
      }

      this.isActive = true;
      this.updateStateUI(true);
      this.setStatus("Camera Active • Feed Live (Phase 2 Ready)");

      const announceText = window.voiceAssistant && window.voiceAssistant.currentLanguage === 'hi'
        ? "सहायता सक्रिय है। कैमरा चालू है। फेज़ 2 एआई मॉडल स्टैंडबाय पर है।"
        : "Assistance active. Camera feed live. AI vision engine standby for Phase 2.";

      if (window.voiceAssistant) {
        window.voiceAssistant.speak(announceText);
      }

      if (window.app) {
        window.app.logActivity("Assistance active. Camera stream connected.", "camera");
      }

      // Start frame capture loop hook for Phase 2
      this.startFrameLoop();

    } catch (err) {
      console.warn("Camera access failed or denied:", err);
      this.isActive = false;
      this.updateStateUI(false);

      let msg = "Camera access was denied or unavailable.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = "Camera permission denied. On Android Chrome: Tap lock/tune icon in URL bar → Permissions → Allow Camera.";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = "No video camera detected on this device.";
      }

      this.setStatus("Camera Permission Denied");
      if (window.voiceAssistant) {
        window.voiceAssistant.speak(msg);
      }
      if (window.app) {
        window.app.logActivity(msg, "alert");
      }
    }
  }

  async stopAssistance() {
    if (!this.isActive && !this.stream) return;

    if (window.soundEngine) {
      window.soundEngine.playStop();
    }
    if (window.a11yManager) {
      window.a11yManager.vibrate(50);
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Stop real camera stream tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
      this.videoEl.classList.remove('active');
    }

    if (this.ctx && this.canvasEl) {
      this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
    }

    if (this.placeholderEl) {
      this.placeholderEl.classList.remove('hidden');
    }

    this.isActive = false;
    this.updateStateUI(false);
    this.setStatus("Camera Inactive • Ready to Connect");

    const stopMsg = window.voiceAssistant && window.voiceAssistant.currentLanguage === 'hi'
      ? "सहायता रोक दी गई है।"
      : "Assistance stopped. Camera inactive.";

    if (window.voiceAssistant) {
      window.voiceAssistant.speak(stopMsg);
    }

    if (window.app) {
      window.app.logActivity("Assistance stopped. Camera session closed.", "camera");
    }
  }

  updateStateUI(active) {
    if (this.cardEl) {
      this.cardEl.classList.toggle('active', active);
    }

    if (this.hudBadgeEl) {
      this.hudBadgeEl.classList.toggle('live', active);
      const textSpan = this.hudBadgeEl.querySelector('.hud-badge-text');
      if (textSpan) {
        textSpan.textContent = active ? "LIVE FEED" : "STANDBY";
      }
    }

    // Sync Main CTA
    if (this.toggleBtnEl) {
      this.toggleBtnEl.classList.toggle('active', active);
      this.toggleBtnEl.setAttribute('aria-pressed', active ? 'true' : 'false');
      const btnLabel = this.toggleBtnEl.querySelector('.btn-label-text');
      if (btnLabel) {
        btnLabel.textContent = active ? "STOP ASSISTANCE" : "START ASSISTANCE";
      }
    }

    // Sync Sticky Mobile CTA
    if (this.stickyBtnEl) {
      this.stickyBtnEl.classList.toggle('active', active);
      this.stickyBtnEl.setAttribute('aria-pressed', active ? 'true' : 'false');
      const stickyLabel = this.stickyBtnEl.querySelector('.btn-sticky-label');
      if (stickyLabel) {
        stickyLabel.textContent = active ? "STOP ASSISTANCE" : "START ASSISTANCE";
      }
    }
  }

  setStatus(text) {
    if (this.statusTextEl) {
      this.statusTextEl.textContent = text;
    }
  }

  // Update detection summary UI
  updateDetectionUI() {
    const objEl = document.getElementById('countObjects');
    const peopleEl = document.getElementById('countPeople');
    const vehiclesEl = document.getElementById('countVehicles');
    const nearestEl = document.getElementById('valNearestObject');

    if (objEl) objEl.textContent = this.detections.objects;
    if (peopleEl) peopleEl.textContent = this.detections.people;
    if (vehiclesEl) vehiclesEl.textContent = this.detections.vehicles;
    if (nearestEl) nearestEl.textContent = this.detections.nearest;
  }

  // Phase 2 Integration Hook: call this when Phase 2 models detect objects
  setDetectionResults(results) {
    if (results) {
      this.detections = { ...this.detections, ...results };
      this.updateDetectionUI();
    }
  }

  // Draw predictions onto overlay canvas (Phase 2 feature hook)
  drawBoundingBoxes(predictions = []) {
    if (!this.ctx || !this.canvasEl) return;
    this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
    if (!predictions.length) return;

    predictions.forEach(p => {
      const [x, y, w, h] = p.bbox;
      this.ctx.strokeStyle = '#45d9ed';
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(x, y, w, h);

      // Label background
      const text = `${p.class} ${Math.round(p.score * 100)}%`;
      this.ctx.fillStyle = 'rgba(7, 17, 31, 0.85)';
      this.ctx.fillRect(x, Math.max(0, y - 24), this.ctx.measureText(text).width + 12, 22);

      // Label text
      this.ctx.fillStyle = '#eef7ff';
      this.ctx.font = '12px -apple-system, sans-serif';
      this.ctx.fillText(text, x + 6, Math.max(16, y - 8));
    });
  }

  // Frame loop hook ready for Phase 2 neural network inference
  startFrameLoop() {
    const loop = () => {
      if (!this.isActive) return;
      if (this.onFrameCallback && this.videoEl && this.videoEl.readyState >= 2) {
        this.onFrameCallback(this.videoEl);
      }
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  registerPhase2Model(callback) {
    this.onFrameCallback = callback;
    console.info("DRISVYA Phase 2 Vision Model pipeline registered.");
  }
}

window.cameraController = new CameraController();
