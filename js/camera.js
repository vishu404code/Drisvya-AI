/**
 * DRISVYA - Camera Lifecycle, Wide-Angle Lens Controller & Real-Time AI Detection
 * Phase 2: Live TensorFlow.js & COCO-SSD integration, multi-camera & ultra-wide lens support,
 * pixel-perfect bounding box alignment, spatial position narration (Left/Centre/Right).
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

    // Camera hardware & lens management
    this.availableDevices = [];
    this.selectedDeviceId = (typeof localStorage !== 'undefined' && localStorage.getItem('drisvya_camera_id')) || null;
    this.isUltraWideActive = false;
    this.activeTrack = null;

    // AI Detection state
    this.isDetecting = false;
    this.lastDetectionTime = 0;
    this.detectionInterval = 90; // ~11 FPS inference to optimize battery & thermal profile on mobile
    this.animFrameId = null;

    // Active detection results
    this.currentPredictions = [];
    this.detections = {
      objects: 0,
      people: 0,
      vehicles: 0,
      nearest: "None within range"
    };

    // Voice narration throttle & state tracking
    this.lastSpokenKey = '';
    this.lastSpokenTime = 0;
    this.spokenCooldown = 2800; // 2.8s speech cooldown to prevent audio overlap
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

    this.bindCameraSelectionControls();
    this.discoverCameraDevices();
    this.updateDetectionUI();

    if (window.primaryPersonTracker) {
      window.primaryPersonTracker.init();
    }
  }

  /**
   * Enumerate and initialize camera devices (Detecting rear cameras and ultra-wide candidates)
   */
  async discoverCameraDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableDevices = devices.filter(d => d.kind === 'videoinput');
      this.renderDeviceSelectorUI();
    } catch (e) {
      console.warn("[DRISVYA Camera] Device enumeration error:", e);
    }
  }

  bindCameraSelectionControls() {
    const selectEl = document.getElementById('cameraSelectDropdown');
    const ultraWideBtn = document.getElementById('btnToggleUltraWide');

    if (selectEl) {
      selectEl.addEventListener('change', async (e) => {
        const deviceId = e.target.value;
        if (deviceId && deviceId !== this.selectedDeviceId) {
          this.selectedDeviceId = deviceId;
          try {
            localStorage.setItem('drisvya_camera_id', deviceId);
          } catch (err) {}
          if (this.isActive) {
            await this.restartWithDevice(deviceId);
          }
        }
      });
    }

    if (ultraWideBtn) {
      ultraWideBtn.addEventListener('click', async () => {
        await this.toggleUltraWideZoom();
      });
    }
  }

  renderDeviceSelectorUI() {
    const container = document.getElementById('cameraSelectContainer');
    const selectEl = document.getElementById('cameraSelectDropdown');
    const ultraWideBtn = document.getElementById('btnToggleUltraWide');
    const statusNoteText = document.getElementById('ultraWideStatusText');

    if (!selectEl) return;

    selectEl.innerHTML = '';

    let backCameraIndex = 1;
    let ultraWideCandidate = null;
    let hasUltraWide = false;

    if (this.availableDevices.length > 0) {
      this.availableDevices.forEach((device) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        const label = (device.label || '').toLowerCase();

        let friendlyName = `Camera ${selectEl.options ? selectEl.options.length + 1 : 1}`;
        if (label.includes('front') || label.includes('user') || label.includes('selfie')) {
          friendlyName = 'Front Camera';
        } else if (label.includes('ultra') || label.includes('wide') || label.includes('0.5') || label.includes('0.6')) {
          friendlyName = 'Ultra-Wide Camera (0.5x)';
          ultraWideCandidate = device.deviceId;
          hasUltraWide = true;
        } else if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
          friendlyName = backCameraIndex === 1 ? 'Main Rear Camera (1.0x)' : `Rear Camera ${backCameraIndex}`;
          backCameraIndex++;
        }

        option.textContent = friendlyName;
        if (device.deviceId === this.selectedDeviceId) {
          option.selected = true;
        }
        selectEl.appendChild(option);
      });
    } else {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Rear Camera (Default)';
      selectEl.appendChild(option);
    }

    // Check zoom capabilities on active camera track
    let hasHardwareZoom = false;
    let minZoom = 1.0;
    if (this.activeTrack && this.activeTrack.getCapabilities) {
      const caps = this.activeTrack.getCapabilities();
      if (caps.zoom && ultraWideBtn) {
        hasHardwareZoom = true;
        minZoom = caps.zoom.min || 1.0;
        ultraWideBtn.style.display = 'inline-flex';
        ultraWideBtn.textContent = this.isUltraWideActive ? "1.0x Normal" : `${minZoom < 1 ? minZoom : 0.5}x Wide`;
        if (minZoom < 1.0) {
          hasUltraWide = true;
        }
      }
    }

    // Honest reporting in Ultra-Wide Availability Note
    if (statusNoteText) {
      if (hasUltraWide || (hasHardwareZoom && minZoom < 1.0)) {
        statusNoteText.textContent = "Ultra-wide lens detected and active. Providing maximum peripheral view.";
      } else if (this.availableDevices.length > 1) {
        statusNoteText.textContent = `Multiple cameras detected (${this.availableDevices.length}). Select auxiliary lens from dropdown if ultra-wide is supported by device.`;
      } else if (this.isActive) {
        statusNoteText.textContent = "Standard rear camera active. Ultra-wide lens is not exposed by this device or browser.";
      } else {
        statusNoteText.textContent = "Rear camera ready. Additional lenses will be verified upon starting assistance.";
      }
    }
  }

  /**
   * Toggle hardware zoom to ultra-wide (if supported by Android Camera2 API)
   */
  async toggleUltraWideZoom() {
    if (!this.activeTrack || !this.activeTrack.getCapabilities) return;
    const caps = this.activeTrack.getCapabilities();
    const btn = document.getElementById('btnToggleUltraWide');

    if (!caps.zoom) {
      if (window.voiceAssistant) {
        window.voiceAssistant.speak("Hardware zoom control is not supported by this camera sensor.");
      }
      return;
    }

    try {
      this.isUltraWideActive = !this.isUltraWideActive;
      const targetZoom = this.isUltraWideActive ? (caps.zoom.min || 1.0) : 1.0;
      await this.activeTrack.applyConstraints({
        advanced: [{ zoom: targetZoom }]
      });

      if (btn) {
        btn.classList.toggle('active', this.isUltraWideActive);
        btn.textContent = this.isUltraWideActive ? "1.0x Normal" : "0.5x Wide";
      }

      const msg = this.isUltraWideActive ? "Switched to ultra-wide lens." : "Switched to standard lens.";
      if (window.voiceAssistant) {
        window.voiceAssistant.speak(msg);
      }
      if (window.app) {
        window.app.logActivity(msg, "camera");
      }
    } catch (e) {
      console.warn("[DRISVYA Camera] Wide zoom constraint failed:", e);
    }
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

    if (window.environmentAnalyzer) {
      window.environmentAnalyzer.reset();
    }

    // Crucial: Unlock speech audio engine upon user gesture
    if (window.voiceAssistant) {
      window.voiceAssistant.unlockAudio();
    }

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
      // Build constraints - default to environment (rear-facing) camera
      const constraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      if (this.selectedDeviceId) {
        constraints.video.deviceId = { exact: this.selectedDeviceId };
        delete constraints.video.facingMode;
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = stream;
      this.activeTrack = stream.getVideoTracks()[0] || null;

      if (this.videoEl) {
        this.videoEl.srcObject = stream;
        await new Promise((resolve) => {
          if (this.videoEl.readyState >= 1) return resolve();
          this.videoEl.onloadedmetadata = () => resolve();
          setTimeout(resolve, 500); // Safety timeout fallback
        });
        await this.videoEl.play();
        this.videoEl.classList.add('active');
      }

      if (this.placeholderEl) {
        this.placeholderEl.classList.add('hidden');
      }

      this.isActive = true;
      this.updateStateUI(true);

      // Discover hardware devices now that permission is granted
      await this.discoverCameraDevices();

      // Load AI Model if not loaded yet
      this.setStatus("Loading AI Detection Model...");
      try {
        if (window.aiEngine) {
          await window.aiEngine.loadModel();
        }
        this.setStatus("AI Detection Live • System Active");
        
        const announceText = window.voiceAssistant && window.voiceAssistant.currentLanguage === 'hi'
          ? "सहायता शुरू हो गई है। कैमरा और एआई डिटेक्शन सक्रिय हैं।"
          : "Assistance active. Real-time object detection ready.";

        if (window.voiceAssistant) {
          window.voiceAssistant.speak(announceText);
        }
      } catch (modelErr) {
        console.error("AI Model failed to load:", modelErr);
        this.setStatus("Camera Live • AI Model Error");
        if (window.voiceAssistant) {
          window.voiceAssistant.speak("Camera is live, but AI model failed to load. Please check network connection.");
        }
      }

      // Start continuous detection loop
      this.startDetectionLoop();

    } catch (err) {
      console.warn("[DRISVYA Camera] Camera access failed:", err);
      this.isActive = false;
      this.updateStateUI(false);

      let msg = "Camera access was denied or unavailable.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = "Camera permission denied. On Android: Tap lock icon in address bar → Permissions → Allow Camera.";
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

  async restartWithDevice(deviceId) {
    if (!this.isActive) return;
    // Stop current stream
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    this.selectedDeviceId = deviceId;
    this.isActive = false;
    await this.startAssistance();
  }

  async stopAssistance() {
    // Clear voice announcement queue & tracking on camera stop
    if (window.voiceAssistant) {
      window.voiceAssistant.clearQueue();
      if (window.voiceAssistant.synth) {
        window.voiceAssistant.synth.cancel();
      }
    }

    if (window.primaryPersonTracker) {
      window.primaryPersonTracker.reset();
    }

    if (window.environmentAnalyzer) {
      window.environmentAnalyzer.reset();
    }

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

    this.isDetecting = false;

    // Release camera hardware tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.activeTrack = null;
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
    this.currentPredictions = [];
    this.updateStateUI(false);
    this.setStatus("Camera Inactive • Ready to Connect");

    // Clear voice announcement queue & tracking on camera stop
    if (window.voiceAssistant) {
      window.voiceAssistant.clearQueue();
      if (window.voiceAssistant.synth) {
        window.voiceAssistant.synth.cancel();
      }
    }

    if (window.primaryPersonTracker) {
      window.primaryPersonTracker.reset();
    }

    if (window.environmentAnalyzer) {
      window.environmentAnalyzer.reset();
    }

    // Reset detection counts
    this.detections = {
      objects: 0,
      people: 0,
      vehicles: 0,
      nearest: "None within range"
    };
    this.updateDetectionUI();
    this.renderLiveDetectionList([]);

    const stopMsg = window.voiceAssistant && window.voiceAssistant.currentLanguage === 'hi'
      ? "सहायता रोक दी गई है।"
      : "Assistance stopped. Detection session closed.";

    if (window.voiceAssistant) {
      window.voiceAssistant.speak(stopMsg);
    }

    if (window.app) {
      window.app.logActivity("Assistance stopped. Camera session closed.", "camera");
    }
  }

  /**
   * Main real-time detection loop
   * Runs inference asynchronously with throttling to protect battery & maintain 60fps UI
   */
  startDetectionLoop() {
    const loop = async (timestamp) => {
      if (!this.isActive) return;

      // Check if model is ready and throttle inference interval
      if (window.aiEngine && window.aiEngine.isReady && !this.isDetecting) {
        if (timestamp - this.lastDetectionTime >= this.detectionInterval) {
          this.lastDetectionTime = timestamp;
          this.isDetecting = true;

          try {
            const predictions = await window.aiEngine.detect(this.videoEl);
            if (this.isActive) {
              this.currentPredictions = predictions;
              this.processDetectionResults(predictions);
              this.drawBoundingBoxes(predictions);
            }
          } catch (e) {
            console.warn("[DRISVYA AI] Detection cycle error:", e);
          } finally {
            this.isDetecting = false;
          }
        }
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  /**
   * Process predictions, update counts, update proximity, and voice announce
   */
  processDetectionResults(predictions) {
    if (!predictions) predictions = [];

    const people = predictions.filter(p => p.class === 'person');
    const vehicles = predictions.filter(p => ['car', 'bus', 'truck', 'motorcycle', 'bicycle', 'train'].includes(p.class));

    // Find nearest / primary target in view
    let nearestText = "None within range";
    const tracker = window.targetTracker || window.primaryPersonTracker;
    if (tracker && tracker.primaryTarget) {
      const t = tracker.primaryTarget;
      const pos = t.spatial ? t.spatial.position : 'Centre';
      nearestText = `${t.class.toUpperCase()} #${t.id} (${pos} · ${t.proximityState || 'In view'})`;
    } else if (predictions.length > 0) {
      const sortedByArea = [...predictions].sort((a, b) => (b.bbox[2] * b.bbox[3]) - (a.bbox[2] * a.bbox[3]));
      const top = sortedByArea[0];
      const posLabel = top.spatial ? top.spatial.position : 'Centre';
      nearestText = `${top.class.toUpperCase()} (${posLabel})`;
    }

    this.detections = {
      objects: predictions.length,
      people: people.length,
      vehicles: vehicles.length,
      nearest: nearestText
    };

    // Update Central Unified Target Tracker
    if (tracker) {
      const vW = (this.videoEl && this.videoEl.videoWidth) || 1280;
      const vH = (this.videoEl && this.videoEl.videoHeight) || 720;
      tracker.update(predictions, vW, vH);
    }

    // Run Environment, Wall Awareness & Forward View Analysis
    if (window.environmentAnalyzer) {
      window.environmentAnalyzer.analyze(this.videoEl, predictions);
    }

    this.updateDetectionUI();
    this.renderLiveDetectionList(predictions);
  }

  /**
   * Render real-time recognized items in the Detection List
   */
  renderLiveDetectionList(predictions) {
    const listEl = document.getElementById('detectionHistoryList');
    const emptyStateEl = document.getElementById('historyEmptyState');

    if (!listEl || !emptyStateEl) return;

    if (predictions.length === 0) {
      listEl.innerHTML = '';
      emptyStateEl.style.display = 'flex';
      return;
    }

    emptyStateEl.style.display = 'none';
    listEl.innerHTML = '';

    predictions.slice(0, 6).forEach(pred => {
      const li = document.createElement('li');
      li.className = 'history-item';

      const spatialBadge = pred.spatial ? pred.spatial.position.toUpperCase() : 'CENTRE';
      const scorePercent = Math.round(pred.score * 100);
      const proximity = pred.proximity ? pred.proximity.level : 'In view';

      li.innerHTML = `
        <div class="history-item-icon">
          <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z"/></svg>
        </div>
        <div class="history-item-content">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="history-item-title" style="text-transform:capitalize; font-weight:800;">${pred.class}</span>
            <span style="font-size:10px; font-weight:700; color:var(--accent-cyan); background:rgba(69,217,237,0.12); padding:2px 6px; border-radius:999px;">
              ${spatialBadge} · ${scorePercent}%
            </span>
          </div>
          <span class="history-item-meta">${proximity} · Real-time bounding box tracked</span>
        </div>
      `;
      listEl.appendChild(li);
    });
  }

  /**
   * Intelligent speech narration of detected objects (delegates to VoiceAssistant)
   */
  announceCriticalObstacles(predictions) {
    if (window.voiceAssistant && window.voiceAssistant.handleDetections) {
      window.voiceAssistant.handleDetections(predictions);
    }
  }

  /**
   * Draw high-contrast bounding boxes with exact object-fit: cover coordinate projection
   */
  drawBoundingBoxes(predictions) {
    if (!this.ctx || !this.canvasEl || !this.videoEl) return;

    const containerW = this.canvasEl.clientWidth;
    const containerH = this.canvasEl.clientHeight;
    if (!containerW || !containerH) return;

    const dpr = window.devicePixelRatio || 1;
    if (this.canvasEl.width !== containerW * dpr || this.canvasEl.height !== containerH * dpr) {
      this.canvasEl.width = containerW * dpr;
      this.canvasEl.height = containerH * dpr;
    }

    this.ctx.save();
    this.ctx.scale(dpr, dpr);
    this.ctx.clearRect(0, 0, containerW, containerH);

    if (!predictions || !predictions.length) {
      this.ctx.restore();
      return;
    }

    const vW = this.videoEl.videoWidth || 1;
    const vH = this.videoEl.videoHeight || 1;

    // Exact object-fit: cover mapping
    const scale = Math.max(containerW / vW, containerH / vH);
    const renderW = vW * scale;
    const renderH = vH * scale;
    const offsetX = (containerW - renderW) / 2;
    const offsetY = (containerH - renderH) / 2;

    const tracker = window.targetTracker || window.primaryPersonTracker;
    const isPrimaryLocked = tracker && tracker.lockStatus === 'locked' && tracker.primaryTarget;

    // Use tracked objects if available, otherwise raw predictions
    const objectsToRender = (tracker && tracker.activeObjectsList && tracker.activeObjectsList.length > 0)
      ? tracker.activeObjectsList
      : predictions;

    objectsToRender.forEach(obj => {
      const [bx, by, bw, bh] = obj.bbox;

      // Projected coordinates on displayed screen
      const drawX = bx * scale + offsetX;
      const drawY = by * scale + offsetY;
      const drawW = bw * scale;
      const drawH = bh * scale;

      const isPrimary = isPrimaryLocked && (obj.isPrimaryTarget || (tracker.primaryTarget && obj.id === tracker.primaryTarget.id));

      // Color coding: Gold for primary target, Cyan for objects, Green for people, Amber for vehicles
      let strokeColor = '#45d9ed';
      if (isPrimary) strokeColor = '#f59e0b';
      else if (obj.class === 'person') strokeColor = '#34d399';
      else if (['car', 'bus', 'truck', 'motorcycle', 'bicycle'].includes(obj.class)) strokeColor = '#fbbf24';

      // Draw bounding rectangle
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = isPrimary ? 3.5 : 2.0;
      this.ctx.shadowColor = strokeColor;
      this.ctx.shadowBlur = isPrimary ? 16 : 6;
      this.ctx.strokeRect(drawX, drawY, drawW, drawH);
      if (isPrimary) {
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(drawX + 3, drawY + 3, Math.max(0, drawW - 6), Math.max(0, drawH - 6));
      }
      this.ctx.shadowBlur = 0;

      // Corner target brackets
      const cornerLen = Math.min(16, drawW / 3, drawH / 3);
      this.ctx.lineWidth = isPrimary ? 5 : 3.5;
      this.ctx.beginPath();
      // TL
      this.ctx.moveTo(drawX, drawY + cornerLen);
      this.ctx.lineTo(drawX, drawY);
      this.ctx.lineTo(drawX + cornerLen, drawY);
      // TR
      this.ctx.moveTo(drawX + drawW - cornerLen, drawY);
      this.ctx.lineTo(drawX + drawW, drawY);
      this.ctx.lineTo(drawX + drawW, drawY + cornerLen);
      // BL
      this.ctx.moveTo(drawX, drawY + drawH - cornerLen);
      this.ctx.lineTo(drawX, drawY + drawH);
      this.ctx.lineTo(drawX + cornerLen, drawY + drawH);
      // BR
      this.ctx.moveTo(drawX + drawW - cornerLen, drawY + drawH);
      this.ctx.lineTo(drawX + drawW, drawY + drawH);
      this.ctx.lineTo(drawX + drawW, drawY + drawH - cornerLen);
      this.ctx.stroke();

      // Label Pill
      const score = Math.round((obj.score || 0.85) * 100);
      const pos = obj.spatial ? obj.spatial.position.toUpperCase() : 'CENTRE';
      const idPrefix = obj.id ? `#${obj.id} ` : '';
      const proxState = obj.proximityState || (obj.proximity ? obj.proximity.level : 'IN VIEW');

      let labelText = `${idPrefix}${obj.class.toUpperCase()} ${score}% · ${pos}`;
      if (isPrimary) {
        labelText = `★ TARGET ${idPrefix}${obj.class.toUpperCase()} · ${pos} · ${proxState}`;
      }

      this.ctx.font = isPrimary 
        ? '800 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        : '700 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const textMetrics = this.ctx.measureText(labelText);
      const pillW = textMetrics.width + 16;
      const pillH = 22;
      const pillY = Math.max(4, drawY - pillH - 2);

      // Pill Background
      this.ctx.fillStyle = isPrimary ? 'rgba(26, 18, 4, 0.95)' : 'rgba(7, 17, 31, 0.9)';
      this.ctx.beginPath();
      this.ctx.roundRect(drawX, pillY, pillW, pillH, 4);
      this.ctx.fill();
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = isPrimary ? 1.5 : 1;
      this.ctx.stroke();

      // Pill Text
      this.ctx.fillStyle = isPrimary ? '#fef08a' : '#ffffff';
      this.ctx.fillText(labelText, drawX + 8, pillY + 15);
    });

    // If target is temporarily lost within recovery window, draw alert banner at top
    if (tracker && tracker.lockStatus === 'temporarily_lost') {
      const bannerText = "⚠ TARGET TEMPORARILY LOST — REACQUIRING...";
      this.ctx.font = '800 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const bMetrics = this.ctx.measureText(bannerText);
      const bW = bMetrics.width + 24;
      const bH = 24;
      const bX = (containerW - bW) / 2;
      const bY = 10;

      this.ctx.fillStyle = 'rgba(239, 68, 68, 0.92)';
      this.ctx.beginPath();
      this.ctx.roundRect(bX, bY, bW, bH, 6);
      this.ctx.fill();
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText(bannerText, bX + 12, bY + 16);
    }

    // Render Wall & Centre-View overlay indicators if environmentAnalyzer is active
    const env = window.environmentAnalyzer;
    if (env && env.wallDetected) {
      const wallY = env.wallBaselineY * renderH + offsetY;
      if (wallY > 20 && wallY < containerH - 20) {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(69, 217, 237, 0.40)';
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([6, 6]);
        this.ctx.beginPath();
        this.ctx.moveTo(offsetX, wallY);
        this.ctx.lineTo(offsetX + renderW, wallY);
        this.ctx.stroke();

        // Wall HUD pill
        const wallText = `SURFACE: WALL (${env.wallProximity})`;
        this.ctx.font = '700 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const wMet = this.ctx.measureText(wallText);
        const wPillW = wMet.width + 12;
        const wPillH = 18;
        const wPillX = Math.max(10, (containerW - wPillW) / 2);
        const wPillY = Math.max(4, wallY - wPillH - 3);

        this.ctx.fillStyle = 'rgba(7, 17, 31, 0.85)';
        this.ctx.beginPath();
        this.ctx.roundRect(wPillX, wPillY, wPillW, wPillH, 3);
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(69, 217, 237, 0.6)';
        this.ctx.stroke();

        this.ctx.fillStyle = '#45d9ed';
        this.ctx.fillText(wallText, wPillX + 6, wPillY + 12);
        this.ctx.restore();
      }
    }

    this.ctx.restore();
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

    if (this.toggleBtnEl) {
      this.toggleBtnEl.classList.toggle('active', active);
      this.toggleBtnEl.setAttribute('aria-pressed', active ? 'true' : 'false');
      const btnLabel = this.toggleBtnEl.querySelector('.btn-label-text');
      if (btnLabel) {
        btnLabel.textContent = active ? "STOP ASSISTANCE" : "START ASSISTANCE";
      }
    }

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
}

window.cameraController = new CameraController();
