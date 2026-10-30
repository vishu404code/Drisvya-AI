/**
 * DRISVYA AI Engine - Phase 2: Real-Time Object Detection
 * Integrates TensorFlow.js and COCO-SSD (lite_mobilenet_v2) for low-latency,
 * on-device assistive vision on mobile Android browsers.
 */

class AIEngine {
  constructor() {
    this.model = null;
    this.isLoading = false;
    this.isReady = false;
    this.loadError = null;
    this.baseModel = 'lite_mobilenet_v2'; // Lightweight mobile-optimized backbone
    this.confidenceThreshold = 0.45; // 45% confidence threshold for assistive accuracy
  }

  /**
   * Initializes and loads the COCO-SSD model weights
   */
  async loadModel() {
    if (this.isReady && this.model) return this.model;
    if (this.isLoading) {
      // Return a promise that waits for active load
      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          if (this.isReady) {
            clearInterval(interval);
            resolve(this.model);
          } else if (this.loadError) {
            clearInterval(interval);
            reject(new Error(this.loadError));
          }
        }, 100);
      });
    }

    this.isLoading = true;
    this.loadError = null;
    this.updateStatusUI('loading');

    // Verify TensorFlow.js is available
    if (typeof window.tf === 'undefined') {
      this.loadError = "TensorFlow.js library is not loaded. Please check your internet connection.";
      this.isLoading = false;
      this.updateStatusUI('error', this.loadError);
      throw new Error(this.loadError);
    }

    // Verify COCO-SSD is available
    if (typeof window.cocoSsd === 'undefined') {
      this.loadError = "COCO-SSD model library is not loaded. Please verify CDN access.";
      this.isLoading = false;
      this.updateStatusUI('error', this.loadError);
      throw new Error(this.loadError);
    }

    try {
      console.info(`[DRISVYA AI] Loading COCO-SSD model with ${this.baseModel}...`);
      
      // Warm up tf backend
      await tf.ready();

      // Load model
      this.model = await cocoSsd.load({ base: this.baseModel });
      this.isReady = true;
      this.isLoading = false;
      this.updateStatusUI('ready');
      console.info("[DRISVYA AI] Model loaded successfully and ready for inference.");
      
      if (window.app) {
        window.app.logActivity("AI vision model (COCO-SSD) loaded and ready.", "system");
      }
      return this.model;
    } catch (err) {
      console.error("[DRISVYA AI] Model loading failed:", err);
      this.isLoading = false;
      this.isReady = false;
      this.loadError = err.message || "Failed to load detection model weights.";
      this.updateStatusUI('error', this.loadError);
      if (window.app) {
        window.app.logActivity(`Model load error: ${this.loadError}`, "alert");
      }
      throw err;
    }
  }

  /**
   * Run inference on the current video frame
   */
  async detect(videoElement) {
    if (!this.isReady || !this.model) {
      return [];
    }

    if (!videoElement || videoElement.readyState < 2 || videoElement.videoWidth === 0) {
      return [];
    }

    try {
      const rawPredictions = await this.model.detect(videoElement, 10, this.confidenceThreshold);
      const vWidth = videoElement.videoWidth;
      const vHeight = videoElement.videoHeight;

      // Enhance raw predictions with spatial positioning & honest relative proximity
      return rawPredictions.map(pred => {
        const spatial = this.calculateSpatialPosition(pred.bbox, vWidth);
        const proximity = this.calculateProximity(pred.bbox, vWidth, vHeight);
        return {
          ...pred,
          spatial,
          proximity
        };
      });
    } catch (err) {
      console.warn("[DRISVYA AI] Detection frame error:", err);
      return [];
    }
  }

  /**
   * Calculate horizontal position (Left, Centre, Right) based on bounding box center
   */
  calculateSpatialPosition(bbox, videoWidth) {
    const [x, , width] = bbox;
    const centerX = x + width / 2;
    const ratio = centerX / (videoWidth || 1);

    let position = 'Centre';
    let positionHi = 'सामने';

    if (ratio < 0.35) {
      position = 'Left';
      positionHi = 'बाईं ओर';
    } else if (ratio > 0.65) {
      position = 'Right';
      positionHi = 'दाईं ओर';
    }

    return {
      position,
      positionHi,
      ratio: Math.round(ratio * 100),
      centerX
    };
  }

  /**
   * Calculate visual relative size / proximity category (Honest, never fake monocular meters)
   */
  calculateProximity(bbox, videoWidth, videoHeight) {
    const [, , width, height] = bbox;
    const objectArea = width * height;
    const frameArea = (videoWidth || 1) * (videoHeight || 1);
    const areaRatio = objectArea / frameArea;

    let level = 'Distant';
    let levelHi = 'दूर';

    if (areaRatio > 0.18) {
      level = 'Close';
      levelHi = 'पास';
    } else if (areaRatio > 0.05) {
      level = 'Medium';
      levelHi = 'मध्यम दूरी';
    }

    return {
      level,
      levelHi,
      areaRatio: Math.round(areaRatio * 100)
    };
  }

  updateStatusUI(status, message = '') {
    const badge = document.getElementById('modelStatusBadge');
    const statusText = document.getElementById('cameraStatusValue');

    if (badge) {
      badge.className = 'hud-badge';
      if (status === 'loading') {
        badge.innerHTML = '<span class="hud-badge-dot" style="background:var(--status-warning);"></span><span>AI LOADING</span>';
      } else if (status === 'ready') {
        badge.innerHTML = '<span class="hud-badge-dot" style="background:var(--status-online);"></span><span>AI READY</span>';
      } else if (status === 'error') {
        badge.innerHTML = '<span class="hud-badge-dot" style="background:var(--status-danger);"></span><span>AI ERROR</span>';
      }
    }

    if (status === 'loading' && statusText && window.cameraController?.isActive) {
      statusText.textContent = "Loading AI Vision Model...";
    } else if (status === 'error' && statusText) {
      statusText.textContent = `AI Error: ${message.slice(0, 35)}...`;
    }
  }
}

window.aiEngine = new AIEngine();
