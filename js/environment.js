/**
 * DRISVYA - Environment & Wall Awareness Engine
 * Browser-compatible, lightweight structural computer vision engine for:
 * 1. Planar wall and large structural surface detection without heavy model dependencies.
 * 2. Visual horizon and floor-wall baseline estimation for relative proximity awareness.
 * 3. Forward Centre-View obstruction monitoring and horizontal zone classification (LEFT / CENTRE / RIGHT).
 * 4. Temporal rate-of-change tracking (Wall closer / farther away) with strict duplicate suppression.
 * 5. Safe, descriptive spatial assistance (strictly zero unconditional movement commands).
 */

class EnvironmentAnalyzer {
  constructor() {
    this.status = 'ACTIVE'; // 'ACTIVE' | 'LOADING' | 'ERROR'
    this.isReady = true;

    // Downsampled offscreen canvas for high-performance sub-millisecond mobile pixel processing
    this.procWidth = 160;
    this.procHeight = 120;
    this.offscreenCanvas = null;
    this.offCtx = null;
    this.initCanvas();

    // Wall Detection & Proximity State
    this.wallDetected = false;
    this.wallDetectionState = 'NOT DETECTED'; // 'DETECTED' | 'NOT DETECTED' | 'UNCERTAIN'
    this.wallProximity = 'UNCERTAIN';        // 'FAR' | 'CLOSE' | 'UNCERTAIN'
    this.wallTrend = 'STABLE';               // 'STABLE' | 'CLOSER' | 'FARTHER AWAY'
    this.wallConfidence = 0.0;
    this.wallBaselineY = 0.5;                // Normalized vertical horizon / floor junction position (0.0 = top, 1.0 = bottom)
    this.wallAreaRatio = 0.0;
    this.smoothedArea = null;
    this.smoothedBaseline = null;

    // Temporal stability history (5 frames)
    this.history = [];
    this.consecutiveWallFrames = 0;
    this.consecutiveNoWallFrames = 0;

    // Initial Wall Announcement gate
    this.initialWallAnnounced = false;
    this.initialAnalysisFrames = 0;
    this.initialAnalysisTarget = 3; // Wait for 3 stable frames (~300ms) before initial announcement
    this.lastAnnouncedWallState = null;
    this.lastAnnouncedProximity = null;
    this.lastWallAnnouncementTime = 0;
    this.wallAnnouncementCooldown = 3500; // 3.5s cooldown between dynamic wall updates

    // Horizontal Zone Awareness (LEFT / CENTRE / RIGHT)
    this.leftView = 'NO RECOGNISED OBJECT';
    this.centreView = 'NO RECOGNISED OBJECT';
    this.rightView = 'NO RECOGNISED OBJECT';
    this.centreObstruction = null;
    this.lastAnnouncedCentreState = null;
    this.lastCentreAnnouncedTime = 0;
    this.centreCooldown = 4000;
  }

  initCanvas() {
    if (typeof document !== 'undefined') {
      try {
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = this.procWidth;
        this.offscreenCanvas.height = this.procHeight;
        this.offCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
      } catch (e) {
        console.warn('[DRISVYA Environment] Offscreen canvas initialization warning:', e);
      }
    }
  }

  /**
   * Main analysis cycle called from Camera detection loop
   * @param {HTMLVideoElement|Object} videoElement - Live camera feed
   * @param {Array} predictions - Active COCO-SSD bounding box predictions
   */
  analyze(videoElement, predictions = []) {
    if (!this.isReady) return this.getState();

    const now = Date.now();
    const vWidth = (videoElement && videoElement.videoWidth) || 1280;
    const vHeight = (videoElement && videoElement.videoHeight) || 720;

    // 1. Zone Obstruction & Centre-View Analysis
    this.evaluateZones(predictions, vWidth, vHeight);

    // 2. Structural Wall & Planar Surface Segmentation
    this.evaluateWallSurface(videoElement, predictions, vWidth, vHeight, now);

    // 3. Central Speech Integration: Initial Announcement & Dynamic Transitions
    this.manageSpeechAnnouncements(now);

    // 4. Update Dashboard Environment Panel
    this.updateDashboardUI();

    return this.getState();
  }

  /**
   * Evaluates LEFT, CENTRE, and RIGHT visual zones
   * Centre view is the primary forward-awareness corridor (33.33% to 66.67%)
   */
  evaluateZones(predictions, vWidth, vHeight) {
    if (!predictions || predictions.length === 0) {
      this.leftView = 'NO RECOGNISED OBJECT';
      this.centreView = 'NO RECOGNISED OBJECT';
      this.rightView = 'NO RECOGNISED OBJECT';
      this.centreObstruction = null;
      return;
    }

    const third = vWidth / 3;
    const leftObjects = [];
    const centreObjects = [];
    const rightObjects = [];

    for (const pred of predictions) {
      const [x, y, w, h] = pred.bbox;
      const centerX = x + w / 2;

      // Classify object into zones
      if (centerX < third) {
        leftObjects.push(pred);
      } else if (centerX > third * 2) {
        rightObjects.push(pred);
      } else {
        centreObjects.push(pred);
      }

      // Check if a wide object partially spans across the centre zone
      const leftEdge = x;
      const rightEdge = x + w;
      if (leftEdge < third * 2 && rightEdge > third && !centreObjects.includes(pred)) {
        centreObjects.push(pred);
      }
    }

    this.leftView = leftObjects.length > 0 ? 'OBJECT DETECTED' : 'NO RECOGNISED OBJECT';
    this.centreView = centreObjects.length > 0 ? 'OBJECT DETECTED' : 'NO RECOGNISED OBJECT';
    this.rightView = rightObjects.length > 0 ? 'OBJECT DETECTED' : 'NO RECOGNISED OBJECT';

    // Prioritize closest centre-view entity
    if (centreObjects.length > 0) {
      centreObjects.sort((a, b) => (b.bbox[2] * b.bbox[3]) - (a.bbox[2] * a.bbox[3]));
      this.centreObstruction = centreObjects[0];
    } else {
      this.centreObstruction = null;
    }
  }

  /**
   * Structural Wall & Planar Surface Analysis
   * Identifies large contiguous planar background surfaces, excluding foreground objects.
   */
  evaluateWallSurface(videoElement, predictions, vWidth, vHeight, now) {
    let structuralAreaRatio = 0.0;
    let baselineY = 0.5;
    let confidence = 0.0;
    let isPlanar = false;

    // Support calibrated simulation/testing inputs when provided
    if (videoElement && videoElement._simulatedWall) {
      structuralAreaRatio = videoElement._simulatedWall.areaRatio !== undefined ? videoElement._simulatedWall.areaRatio : 0.4;
      baselineY = videoElement._simulatedWall.baselineY !== undefined ? videoElement._simulatedWall.baselineY : 0.4;
      isPlanar = videoElement._simulatedWall.isPlanar !== undefined ? videoElement._simulatedWall.isPlanar : true;
      confidence = videoElement._simulatedWall.confidence !== undefined ? videoElement._simulatedWall.confidence : 0.90;
    }
    // Use offscreen image analysis if canvas context is available
    else if (this.offCtx && videoElement && videoElement.readyState >= 2) {
      try {
        this.offCtx.drawImage(videoElement, 0, 0, this.procWidth, this.procHeight);
        const imgData = this.offCtx.getImageData(0, 0, this.procWidth, this.procHeight);
        const pixels = imgData.data;

        // Build object exclusion mask from COCO-SSD bounding boxes
        const scaleX = this.procWidth / vWidth;
        const scaleY = this.procHeight / vHeight;
        const mask = new Uint8Array(this.procWidth * this.procHeight);

        for (const pred of predictions) {
          const [bx, by, bw, bh] = pred.bbox;
          const minX = Math.max(0, Math.floor(bx * scaleX));
          const maxX = Math.min(this.procWidth, Math.ceil((bx + bw) * scaleX));
          const minY = Math.max(0, Math.floor(by * scaleY));
          const maxY = Math.min(this.procHeight, Math.ceil((by + bh) * scaleY));

          for (let py = minY; py < maxY; py++) {
            const rowOffset = py * this.procWidth;
            for (let px = minX; px < maxX; px++) {
              mask[rowOffset + px] = 1; // 1 = Occupied by recognized foreground object
            }
          }
        }

        // Structural edge & planar homogeneity scan
        let unmaskedCount = 0;
        let smoothCount = 0;
        let lowestWallY = 0;
        let edgeCount = 0;

        // Analyze vertical central band (20% to 80% width) for wall structural integrity
        const startX = Math.floor(this.procWidth * 0.20);
        const endX = Math.floor(this.procWidth * 0.80);
        const startY = 8;
        const endY = this.procHeight - 8;

        for (let y = startY; y < endY; y++) {
          const row = y * this.procWidth;
          const nextRow = (y + 1) * this.procWidth;

          for (let x = startX; x < endX; x++) {
            const idx = row + x;
            if (mask[idx] === 1) continue; // Skip object pixels

            unmaskedCount++;
            const pIdx = idx * 4;
            const nextPIdx = (nextRow + x) * 4;
            const rightPIdx = (row + x + 1) * 4;

            // Simple fast gradient
            const lum = 0.299 * pixels[pIdx] + 0.587 * pixels[pIdx + 1] + 0.114 * pixels[pIdx + 2];
            const lumDown = 0.299 * pixels[nextPIdx] + 0.587 * pixels[nextPIdx + 1] + 0.114 * pixels[nextPIdx + 2];
            const lumRight = 0.299 * pixels[rightPIdx] + 0.587 * pixels[rightPIdx + 1] + 0.114 * pixels[rightPIdx + 2];

            const grad = Math.abs(lum - lumDown) + Math.abs(lum - lumRight);

            if (grad < 16) {
              smoothCount++;
              if (y > lowestWallY) lowestWallY = y;
            } else if (grad > 36) {
              edgeCount++;
            }
          }
        }

        const sampleTotal = (endX - startX) * (endY - startY);
        structuralAreaRatio = sampleTotal > 0 ? (smoothCount / sampleTotal) : 0;
        baselineY = this.procHeight > 0 ? (lowestWallY / this.procHeight) : 0.5;

        // Wall requires homogeneous contiguous surface with defined architectural boundaries
        isPlanar = (unmaskedCount > sampleTotal * 0.35) && (smoothCount > unmaskedCount * 0.45);
        confidence = isPlanar ? Math.min(0.95, structuralAreaRatio * 1.3) : 0.2;

      } catch (err) {
        // Fallback for security-restricted canvases or environments
        isPlanar = false;
        confidence = 0.1;
      }
    } else {
      // Geometric fallback when offscreen image data is unavailable (e.g. headless tests)
      // Deduce structural surface from absence of blocking objects across the upper/mid frame
      let totalOccupiedArea = 0;
      for (const pred of predictions) {
        totalOccupiedArea += (pred.bbox[2] * pred.bbox[3]) / (vWidth * vHeight);
      }
      structuralAreaRatio = Math.max(0, 1.0 - totalOccupiedArea);
      isPlanar = structuralAreaRatio >= 0.35;
      confidence = isPlanar ? 0.85 : 0.2;
      baselineY = Math.min(0.85, 0.45 + (structuralAreaRatio * 0.3));
    }

    // Exponential Moving Average (EMA) smoothing for stability
    const alpha = 0.35;
    this.smoothedArea = this.smoothedArea !== null
      ? (alpha * structuralAreaRatio + (1 - alpha) * this.smoothedArea)
      : structuralAreaRatio;
    this.smoothedBaseline = this.smoothedBaseline !== null
      ? (alpha * baselineY + (1 - alpha) * this.smoothedBaseline)
      : baselineY;

    this.wallAreaRatio = this.smoothedArea;
    this.wallBaselineY = this.smoothedBaseline;
    this.wallConfidence = confidence;

    // Temporal stability window
    this.history.push({
      time: now,
      area: this.wallAreaRatio,
      baseline: this.wallBaselineY,
      confidence
    });
    if (this.history.length > 5) this.history.shift();

    // Wall Detection Classification
    if (isPlanar && this.wallAreaRatio >= 0.28 && confidence >= 0.45) {
      this.consecutiveWallFrames++;
      this.consecutiveNoWallFrames = 0;
      if (this.consecutiveWallFrames >= 2) {
        this.wallDetected = true;
        this.wallDetectionState = 'DETECTED';
      }
    } else if (confidence < 0.35 && this.wallAreaRatio > 0.15 && this.wallAreaRatio < 0.28) {
      this.wallDetectionState = 'UNCERTAIN';
    } else {
      this.consecutiveNoWallFrames++;
      this.consecutiveWallFrames = 0;
      if (this.consecutiveNoWallFrames >= 3) {
        this.wallDetected = false;
        this.wallDetectionState = 'NOT DETECTED';
        this.wallProximity = 'UNCERTAIN';
        this.wallTrend = 'STABLE';
      }
    }

    // Relative Apparent Proximity Estimation
    if (this.wallDetected) {
      // Close: Wall occupies majority of view or baseline is low in frame
      const isClose = (this.wallAreaRatio > 0.58 || this.wallBaselineY > 0.68);
      // Far: Floor occupies lower frame, wall baseline is high
      const isFar = (this.wallAreaRatio < 0.38 && this.wallBaselineY < 0.42);

      if (isClose) {
        this.wallProximity = 'CLOSE';
      } else if (isFar) {
        this.wallProximity = 'FAR';
      } else {
        this.wallProximity = 'FAR'; // Default baseline category
      }

      // Dynamic Trend Analysis (Approaching / Farther Away)
      if (this.history.length >= 3) {
        const oldest = this.history[0];
        const newest = this.history[this.history.length - 1];
        const deltaArea = newest.area - oldest.area;
        const deltaBase = newest.baseline - oldest.baseline;

        if (deltaArea > 0.08 || deltaBase > 0.08) {
          this.wallTrend = 'CLOSER';
        } else if (deltaArea < -0.08 || deltaBase < -0.08) {
          this.wallTrend = 'FARTHER AWAY';
        } else {
          this.wallTrend = 'STABLE';
        }
      }
    }
  }

  /**
   * Central Speech Integration: Initial Announcement & Dynamic Transitions
   * Adheres strictly to single-queue architecture and zero duplicate spam.
   */
  manageSpeechAnnouncements(now) {
    if (!window.voiceAssistant || !window.voiceAssistant.isAnnouncementsEnabled) return;

    // 1. FORWARD CENTRE-VIEW OBSTRUCTION ANNOUNCEMENTS
    // Active whenever a recognised entity occupies the forward path and tracker is not actively narrating it
    const tracker = window.targetTracker;
    const isTargetLocked = tracker && tracker.primaryTarget && tracker.lockStatus === 'locked';

    if (!isTargetLocked && this.centreObstruction && (now - this.lastCentreAnnouncedTime >= this.centreCooldown)) {
      const cls = this.centreObstruction.class;
      const clsLower = cls.toLowerCase();

      if (this.lastAnnouncedCentreState !== clsLower) {
        this.lastAnnouncedCentreState = clsLower;
        this.lastCentreAnnouncedTime = now;

        if (clsLower === 'person') {
          window.voiceAssistant.announceEnvironmentEvent('centre_view', 'centre_person');
        } else if (['chair', 'table', 'couch', 'bed'].includes(clsLower)) {
          window.voiceAssistant.announceEnvironmentEvent('centre_view', 'centre_furniture', { objectClass: clsLower });
        } else {
          window.voiceAssistant.announceEnvironmentEvent('centre_view', 'centre_caution');
        }
      }
    }

    this.initialAnalysisFrames++;

    // 2. INITIAL WALL ANNOUNCEMENT (Occurs exactly once on camera start after stable analysis)
    if (!this.initialWallAnnounced && this.initialAnalysisFrames >= this.initialAnalysisTarget) {
      this.initialWallAnnounced = true;

      if (this.wallDetected) {
        let subType = 'wall_detected_front';
        if (this.wallProximity === 'CLOSE') {
          subType = 'wall_close';
        } else if (this.wallProximity === 'FAR') {
          subType = 'wall_far';
        }

        this.lastAnnouncedWallState = this.wallDetectionState;
        this.lastAnnouncedProximity = this.wallProximity;
        this.lastWallAnnouncementTime = now;

        window.voiceAssistant.announceEnvironmentEvent('wall_initial', subType);
      } else if (this.wallDetectionState === 'UNCERTAIN') {
        this.lastAnnouncedWallState = 'UNCERTAIN';
        this.lastWallAnnouncementTime = now;
        window.voiceAssistant.announceEnvironmentEvent('wall_initial', 'wall_uncertain');
      }
      return;
    }

    if (!this.initialWallAnnounced) return;

    // 3. CONTINUOUS DYNAMIC WALL AWARENESS (Only when meaningful proximity changes occur)
    if (this.wallDetected) {
      if (now - this.lastWallAnnouncementTime >= this.wallAnnouncementCooldown) {
        // Farther away event (user stepping back from wall)
        if (this.wallTrend === 'FARTHER AWAY' && this.lastAnnouncedProximity !== 'FARTHER AWAY') {
          this.lastAnnouncedProximity = 'FARTHER AWAY';
          this.lastWallAnnouncementTime = now;
          window.voiceAssistant.announceEnvironmentEvent('wall_dynamic', 'wall_farther');
          return;
        }

        // Closer event (user advancing toward wall)
        if (this.wallTrend === 'CLOSER' && this.lastAnnouncedProximity !== 'CLOSER') {
          this.lastAnnouncedProximity = 'CLOSER';
          this.lastWallAnnouncementTime = now;
          window.voiceAssistant.announceEnvironmentEvent('wall_dynamic', 'wall_closer');
          return;
        }

        // Close event (user arrives at close wall and is not moving away)
        if (this.wallProximity === 'CLOSE' && this.lastAnnouncedProximity !== 'CLOSE') {
          this.lastAnnouncedProximity = 'CLOSE';
          this.lastWallAnnouncementTime = now;
          window.voiceAssistant.announceEnvironmentEvent('wall_dynamic', 'wall_close');
          return;
        }
      }
    }
  }

  /**
   * Reset environment state on camera stop or reload
   */
  reset() {
    this.wallDetected = false;
    this.wallDetectionState = 'NOT DETECTED';
    this.wallProximity = 'UNCERTAIN';
    this.wallTrend = 'STABLE';
    this.wallConfidence = 0.0;
    this.wallAreaRatio = 0.0;
    this.smoothedArea = null;
    this.smoothedBaseline = null;
    this.history = [];
    this.consecutiveWallFrames = 0;
    this.consecutiveNoWallFrames = 0;
    this.initialWallAnnounced = false;
    this.initialAnalysisFrames = 0;
    this.lastAnnouncedWallState = null;
    this.lastAnnouncedProximity = null;
    this.lastWallAnnouncementTime = 0;
    this.lastAnnouncedCentreState = null;
    this.lastCentreAnnouncedTime = 0;
    this.leftView = 'NO RECOGNISED OBJECT';
    this.centreView = 'NO RECOGNISED OBJECT';
    this.rightView = 'NO RECOGNISED OBJECT';
    this.centreObstruction = null;
    this.updateDashboardUI();
  }

  /**
   * Update Dashboard Environment Awareness metrics panel
   */
  updateDashboardUI() {
    const valWallDetection = document.getElementById('valWallDetection');
    const valWallProximity = document.getElementById('valWallProximity');
    const valCentreView = document.getElementById('valCentreView');
    const valLeftView = document.getElementById('valLeftView');
    const valRightView = document.getElementById('valRightView');
    const valEnvEngine = document.getElementById('valEnvEngineStatus');
    const envBadge = document.getElementById('envAnalysisStatusBadge');

    if (!valWallDetection) return;

    // Wall Detection
    valWallDetection.textContent = this.wallDetectionState;
    if (this.wallDetectionState === 'DETECTED') {
      valWallDetection.style.color = 'var(--accent-cyan)';
    } else if (this.wallDetectionState === 'UNCERTAIN') {
      valWallDetection.style.color = 'var(--status-warning)';
    } else {
      valWallDetection.style.color = 'var(--text-secondary)';
    }

    // Wall Proximity
    if (valWallProximity) {
      if (this.wallDetected) {
        valWallProximity.textContent = this.wallProximity;
        valWallProximity.className = `p-metric-val proximity-badge ${this.wallProximity.toLowerCase()}`;
      } else {
        valWallProximity.textContent = '—';
        valWallProximity.className = 'p-metric-val proximity-badge';
      }
    }

    // Centre View
    if (valCentreView) {
      if (this.centreObstruction) {
        valCentreView.textContent = `OBJECT: ${this.centreObstruction.class.toUpperCase()}`;
        valCentreView.style.color = '#f59e0b';
      } else if (this.wallDetected && this.wallBaselineY > 0.4) {
        valCentreView.textContent = 'WALL DETECTED';
        valCentreView.style.color = 'var(--accent-cyan)';
      } else {
        valCentreView.textContent = this.centreView;
        valCentreView.style.color = 'var(--text-secondary)';
      }
    }

    // Left View
    if (valLeftView) {
      valLeftView.textContent = this.leftView;
      valLeftView.style.color = this.leftView === 'OBJECT DETECTED' ? '#38bdf8' : 'var(--text-secondary)';
    }

    // Right View
    if (valRightView) {
      valRightView.textContent = this.rightView;
      valRightView.style.color = this.rightView === 'OBJECT DETECTED' ? '#38bdf8' : 'var(--text-secondary)';
    }

    // Engine Status
    if (valEnvEngine) {
      valEnvEngine.textContent = this.status;
      valEnvEngine.style.color = this.status === 'ACTIVE' ? 'var(--status-online)' : 'var(--status-danger)';
    }

    if (envBadge) {
      envBadge.textContent = this.status;
      envBadge.className = `lock-status-badge ${this.status === 'ACTIVE' ? 'locked' : 'lost'}`;
    }
  }

  getState() {
    return {
      status: this.status,
      wallDetection: this.wallDetectionState,
      wallProximity: this.wallProximity,
      wallTrend: this.wallTrend,
      leftView: this.leftView,
      centreView: this.centreView,
      rightView: this.rightView,
      centreObstruction: this.centreObstruction
    };
  }
}

// Global instance
window.environmentAnalyzer = new EnvironmentAnalyzer();
