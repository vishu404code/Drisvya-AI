/**
 * DRISVYA - Unified Automatic Target Tracker & Smart Proximity Engine
 * One central computer vision tracking engine for real-time mobile assistance.
 * 
 * Core Capabilities:
 * 1. Multi-Object Persistent Tracking:
 *    - Associative matching via IoU (Intersection over Union), centroid displacement, and class labels.
 *    - Stable persistent tracking IDs (#1, #2, etc.) across consecutive frames.
 *    - Rolling temporal history buffer (10 frames) per tracked object.
 * 
 * 2. Automatic Target Selection & Switching with Hysteresis:
 *    - Automatic locking on the most relevant / closest object without requiring manual taps.
 *    - Target Relevance Scoring based on proximity, ground-plane vertical baseline, category scale, and confidence.
 *    - Multi-cycle confirmation (3 consecutive detection cycles) & hysteresis margin (> 25% + offset) to eliminate switching jitter.
 *    - 3.0s temporary occlusion recovery window before target release.
 * 
 * 3. Smart Relative Proximity & Dynamic Trend Estimation:
 *    - Exponential Moving Average (EMA) smoothing of apparent bounding box dimensions.
 *    - Multi-signal relative proximity: normalized frame area, aspect ratio, vertical position, category normalization.
 *    - Dynamic temporal rate-of-change analysis: FAR, APPROACHING, CLOSER, CLOSE, MOVING AWAY, STABLE, UNCERTAIN.
 *    - Zero fabricated metric measurements; strictly relative spatial awareness.
 * 
 * 4. Priority Announcement Integration:
 *    - Routes all primary target state changes and switches to the central Speech Manager.
 */

class UnifiedTargetTracker {
  constructor() {
    // Tracked objects registry: trackId (number) -> TrackedObject
    this.trackedObjects = new Map();
    this.nextTrackId = 1;

    // Primary Target state
    this.primaryTarget = null;
    this.primaryTargetId = null;
    this.lockStatus = 'not_locked'; // 'not_locked' | 'locked' | 'temporarily_lost'
    this.lostRecoveryPeriod = 2500; // 2.5s recovery window for brief occlusion / frame departure
    this.lostSince = null;
    this.targetAbsentCycles = 0;

    // Direction Tracking & Zone Hysteresis
    this.candidateDirection = null;
    this.candidateDirectionCycles = 0;
    this.candidateDirectionConfirmation = 2; // 2 consecutive cycles required to confirm direction change
    this.lastDirectionAnnouncedTime = 0;

    // Target Switching & Hysteresis
    this.switchCandidateId = null;
    this.switchCandidateCycles = 0;
    this.switchConfirmationCycles = 3; // Must sustain advantage for 3 consecutive detection cycles
    this.switchMarginMultiplier = 1.15; // 15% higher relevance required
    this.switchMarginOffset = 0.02;

    // Proximity announcement throttle
    this.proximityCooldown = 3200; // 3.2s minimum gap between non-urgent proximity updates
    this.lastProximityAnnouncedTime = 0;
    this.lastAnnouncedState = null;

    // Detection stats cache
    this.activeObjectsList = [];
  }

  init() {
    this.bindControls();
    this.updateDashboardUI();
  }

  bindControls() {
    const btnUnlock = document.getElementById('btnUnlockPrimaryPerson');
    if (btnUnlock) {
      btnUnlock.addEventListener('click', () => this.unlockTarget());
    }

    const canvas = document.getElementById('overlayCanvas');
    const container = document.querySelector('.camera-preview-container');
    const targetElement = canvas || container;

    if (targetElement) {
      targetElement.addEventListener('click', (e) => this.handleCanvasTap(e));
    }
  }

  handleCanvasTap(event) {
    const canvas = document.getElementById('overlayCanvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const containerW = canvas.clientWidth;
    const containerH = canvas.clientHeight;

    const video = document.getElementById('cameraVideo');
    const vW = (video && video.videoWidth) || 1280;
    const vH = (video && video.videoHeight) || 720;

    const scale = Math.max(containerW / vW, containerH / vH);
    const renderW = vW * scale;
    const renderH = vH * scale;
    const offsetX = (containerW - renderW) / 2;
    const offsetY = (containerH - renderH) / 2;

    const visible = Array.from(this.trackedObjects.values()).filter(t => t.absentFrames === 0);

    for (const obj of visible) {
      const [bx, by, bw, bh] = obj.bbox;
      const drawX = bx * scale + offsetX;
      const drawY = by * scale + offsetY;
      const drawW = bw * scale;
      const drawH = bh * scale;
      const pad = 14;

      if (
        clickX >= drawX - pad &&
        clickX <= drawX + drawW + pad &&
        clickY >= drawY - pad &&
        clickY <= drawY + drawH + pad
      ) {
        if (this.primaryTarget && this.primaryTarget.id === obj.id) {
          this.unlockTarget();
        } else {
          this.lockTarget(obj, 'manual_tap');
        }
        return;
      }
    }
  }

  /**
   * Main cycle update called directly from camera detection loop
   */
  update(predictions = [], vWidth = 1280, vHeight = 720) {
    const now = Date.now();
    vWidth = Math.max(1, vWidth);
    vHeight = Math.max(1, vHeight);

    // 1. Associate current predictions with tracked objects using IoU + Centroid distance
    this.matchDetections(predictions, now, vWidth, vHeight);

    // 2. Estimate relative proximity & dynamic temporal trend for every tracked object
    for (const tracked of this.trackedObjects.values()) {
      if (tracked.absentFrames === 0) {
        this.estimateProximity(tracked, vWidth, vHeight, now);
      }
    }

    // 3. Automatic Primary Target Selection, Closer-Target Switching & Loss Recovery
    this.updateTargetSelection(now);

    // 4. Clean up old tracked objects that have been absent for > 8 seconds
    for (const [id, tracked] of this.trackedObjects.entries()) {
      if (tracked.absentFrames > 0 && now - tracked.lastSeen > 8000) {
        if (!this.primaryTarget || this.primaryTarget.id !== id) {
          this.trackedObjects.delete(id);
        }
      }
    }

    this.activeObjectsList = Array.from(this.trackedObjects.values()).filter(t => t.absentFrames === 0);
    this.updateDashboardUI();
  }

  /**
   * Associate detections with existing tracks using IoU, centroid distance and class labels
   */
  matchDetections(predictions, now, vWidth, vHeight) {
    const unmatchedDetections = [...predictions];
    const matchedTrackIds = new Set();
    const diag = Math.hypot(vWidth, vHeight);

    // Sort existing tracks: give matching priority to currently tracked objects with higher history
    const existingTracks = Array.from(this.trackedObjects.values())
      .sort((a, b) => (b.id === this.primaryTargetId ? 1 : 0) - (a.id === this.primaryTargetId ? 1 : 0));

    for (const track of existingTracks) {
      let bestDetIndex = -1;
      let minCost = Infinity;

      for (let i = 0; i < unmatchedDetections.length; i++) {
        const det = unmatchedDetections[i];
        if (det.class.toLowerCase() !== track.class.toLowerCase()) continue;

        const iou = this.computeIoU(track.bbox, det.bbox);
        const [tx, ty, tw, th] = track.bbox;
        const [dx, dy, dw, dh] = det.bbox;
        const tCenterX = tx + tw / 2;
        const tCenterY = ty + th / 2;
        const dCenterX = dx + dw / 2;
        const dCenterY = dy + dh / 2;
        const centerDist = Math.hypot(tCenterX - dCenterX, tCenterY - dCenterY);

        // Matching criteria: good overlap OR close centroid movement
        const maxSpan = Math.max(tw, th, dw, dh) * 1.5;
        if (iou > 0.15 || centerDist < maxSpan) {
          const cost = (1 - iou) * 0.60 + (centerDist / diag) * 0.40;
          if (cost < minCost) {
            minCost = cost;
            bestDetIndex = i;
          }
        }
      }

      if (bestDetIndex !== -1 && minCost < 0.85) {
        const matched = unmatchedDetections.splice(bestDetIndex, 1)[0];
        track.bbox = matched.bbox;
        track.score = matched.score;
        const prevPos = track.spatial ? track.spatial.position : null;
        track.spatial = matched.spatial || this.computeSpatialPosition(matched.bbox, vWidth, prevPos);
        track.lastSeen = now;
        track.absentFrames = 0;
        track.consecutiveFrames++;
        matchedTrackIds.add(track.id);
      } else {
        track.absentFrames++;
      }
    }

    // Register remaining unmatched detections as new tracked objects
    for (const det of unmatchedDetections) {
      const id = this.nextTrackId++;
      const [x, y, w, h] = det.bbox;
      const initialAreaRatio = (w * h) / (vWidth * vHeight);
      const initialHeightRatio = h / vHeight;

      const newTrack = {
        id,
        trackId: `track_${id}`,
        class: (det.class || 'object').toLowerCase(),
        bbox: det.bbox,
        score: det.score || 0.85,
        spatial: det.spatial || this.computeSpatialPosition(det.bbox, vWidth, null),
        firstSeen: now,
        lastSeen: now,
        consecutiveFrames: 1,
        absentFrames: 0,
        isPrimaryTarget: false,

        // Proximity metrics
        areaRatio: initialAreaRatio,
        heightRatio: initialHeightRatio,
        smoothedArea: initialAreaRatio,
        smoothedHeight: initialHeightRatio,
        proximityScore: null,
        smoothedProximityScore: null,
        proximityTrend: 'STABLE',
        proximityState: 'FAR',
        lastAnnouncedState: null,
        lastAnnouncedDirection: null,
        relevanceScore: 0.1,

        history: [
          {
            time: now,
            bbox: det.bbox,
            areaRatio: initialAreaRatio,
            smoothedArea: initialAreaRatio,
            heightRatio: initialHeightRatio,
            score: det.score || 0.85,
            proximityScore: 0.1
          }
        ]
      };

      this.trackedObjects.set(id, newTrack);
    }
  }

  computeIoU(boxA, boxB) {
    const xA = Math.max(boxA[0], boxB[0]);
    const yA = Math.max(boxA[1], boxB[1]);
    const xB = Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]);
    const yB = Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    if (interArea <= 0) return 0;

    const boxAArea = boxA[2] * boxA[3];
    const boxBArea = boxB[2] * boxB[3];
    const unionArea = boxAArea + boxBArea - interArea;
    return unionArea > 0 ? interArea / unionArea : 0;
  }

  /**
   * Determine spatial zone (LEFT / CENTRE / RIGHT) with boundary hysteresis margin.
   * Frame zones:
   * - LEFT: 0%–33.33% (0.0 to 1/3)
   * - CENTRE: 33.33%–66.67% (1/3 to 2/3)
   * - RIGHT: 66.67%–100% (2/3 to 1.0)
   * 
   * Uses original uncropped video frame width and a 3.5% (0.035) hysteresis buffer
   * to strictly eliminate direction flipping near zone thresholds.
   */
  computeSpatialPosition(bbox, vWidth = 1280, prevPosition = null) {
    const [x, , w] = bbox;
    const objectCenterX = x + w / 2;
    const safeVWidth = Math.max(1, vWidth);
    const normalizedX = Math.max(0.0, Math.min(1.0, objectCenterX / safeVWidth));

    const leftBoundary = 1 / 3;      // ~0.33333
    const rightBoundary = 2 / 3;     // ~0.66667
    const hysteresisMargin = 0.035;  // 3.5% margin

    let position = 'Centre';

    if (prevPosition === 'Left') {
      // Must clearly cross past (1/3 + margin = ~0.3683) to transition out of Left
      if (normalizedX > (leftBoundary + hysteresisMargin)) {
        position = (normalizedX > (rightBoundary + hysteresisMargin)) ? 'Right' : 'Centre';
      } else {
        position = 'Left';
      }
    } else if (prevPosition === 'Right') {
      // Must clearly drop below (2/3 - margin = ~0.6317) to transition out of Right
      if (normalizedX < (rightBoundary - hysteresisMargin)) {
        position = (normalizedX < (leftBoundary - hysteresisMargin)) ? 'Left' : 'Centre';
      } else {
        position = 'Right';
      }
    } else if (prevPosition === 'Centre') {
      // Must clearly pass outside hysteresis margins to leave Centre
      if (normalizedX < (leftBoundary - hysteresisMargin)) {
        position = 'Left';
      } else if (normalizedX > (rightBoundary + hysteresisMargin)) {
        position = 'Right';
      } else {
        position = 'Centre';
      }
    } else {
      // Initial state without historical bias
      if (normalizedX < leftBoundary) {
        position = 'Left';
      } else if (normalizedX > rightBoundary) {
        position = 'Right';
      } else {
        position = 'Centre';
      }
    }

    return {
      position,
      normalizedX,
      objectCenterX
    };
  }

  /**
   * Smart Proximity Estimation & Dynamic Trend Computation
   */
  estimateProximity(tracked, vWidth, vHeight, now) {
    const [x, y, w, h] = tracked.bbox;
    const frameArea = Math.max(1, vWidth * vHeight);
    const area = w * h;
    const areaRatio = area / frameArea;
    const heightRatio = h / Math.max(1, vHeight);
    const bottomY = Math.min(1.0, (y + h) / Math.max(1, vHeight));
    const score = tracked.score || 0;

    // Category physical scale normalization
    let catScale = 1.0;
    const cls = tracked.class.toLowerCase();
    if (['car', 'bus', 'truck', 'train'].includes(cls)) {
      catScale = 0.55;
    } else if (['bottle', 'cup', 'cell phone', 'mouse', 'remote', 'book', 'apple'].includes(cls)) {
      catScale = 2.4;
    } else if (['chair', 'couch', 'table', 'dining table', 'bicycle', 'motorcycle', 'dog'].includes(cls)) {
      catScale = 1.1;
    } else if (cls === 'person') {
      catScale = 1.0;
    }

    const rawProximity = Math.min(1.0, (areaRatio * catScale * 0.50) + (heightRatio * 0.35) + (bottomY * 0.15));

    // Exponential Moving Average (EMA) smoothing
    const alpha = 0.40;
    tracked.smoothedArea = tracked.smoothedArea !== null ? (alpha * areaRatio + (1 - alpha) * tracked.smoothedArea) : areaRatio;
    tracked.smoothedHeight = tracked.smoothedHeight !== null ? (alpha * heightRatio + (1 - alpha) * tracked.smoothedHeight) : heightRatio;
    tracked.smoothedProximityScore = tracked.smoothedProximityScore !== null ? (alpha * rawProximity + (1 - alpha) * tracked.smoothedProximityScore) : rawProximity;
    tracked.proximityScore = rawProximity;

    tracked.history.push({
      time: now,
      bbox: tracked.bbox,
      areaRatio,
      smoothedArea: tracked.smoothedArea,
      heightRatio: tracked.smoothedHeight,
      score,
      proximityScore: tracked.smoothedProximityScore
    });

    if (tracked.history.length > 10) {
      tracked.history.shift();
    }

    // Low confidence -> UNCERTAIN
    if (score < 0.45) {
      tracked.proximityTrend = 'STABLE';
      tracked.proximityState = 'UNCERTAIN';
      return;
    }

    // Dynamic Trend Analysis (Requires >= 3 consecutive frames)
    let trend = 'STABLE';
    let deltaArea = 0;

    if (tracked.history.length >= 3) {
      const windowLen = Math.min(tracked.history.length, 5);
      const startIndex = tracked.history.length - windowLen;
      const windowStart = tracked.history[startIndex];
      const newest = tracked.history[tracked.history.length - 1];
      const baseArea = Math.max(0.005, windowStart.smoothedArea);
      deltaArea = (newest.smoothedArea - baseArea) / baseArea;

      let incCount = 0;
      let decCount = 0;
      for (let i = startIndex + 1; i < tracked.history.length; i++) {
        const diff = tracked.history[i].smoothedArea - tracked.history[i - 1].smoothedArea;
        if (diff > 0.001) incCount++;
        else if (diff < -0.001) decCount++;
      }

      const thresholdFrames = Math.max(2, Math.floor((windowLen - 1) * 0.60));

      if (deltaArea >= 0.12 && incCount >= thresholdFrames) {
        trend = 'APPROACHING';
      } else if (deltaArea <= -0.12 && decCount >= thresholdFrames) {
        trend = 'MOVING AWAY';
      } else {
        trend = 'STABLE';
      }
    }

    tracked.proximityTrend = trend;
    tracked.deltaAreaPercent = Math.round(deltaArea * 100);

    // Static Distance Category
    const isClose = (tracked.smoothedHeight > 0.52 || (tracked.smoothedArea * catScale) > 0.20 || tracked.smoothedProximityScore > 0.48);
    const isFar = (tracked.smoothedHeight < 0.28 && (tracked.smoothedArea * catScale) < 0.08);

    // Unified Proximity State
    if (trend === 'APPROACHING') {
      tracked.proximityState = isClose ? 'CLOSE' : 'APPROACHING';
    } else if (trend === 'MOVING AWAY') {
      tracked.proximityState = 'MOVING AWAY';
    } else {
      // STABLE
      if (isClose) {
        tracked.proximityState = 'CLOSE';
      } else if (isFar) {
        tracked.proximityState = 'FAR';
      } else {
        tracked.proximityState = 'STABLE';
      }
    }
  }

  /**
   * Automatic Target Selection, Closer-Target Switching with Hysteresis & Target Loss Recovery
   */
  updateTargetSelection(now) {
    const visible = Array.from(this.trackedObjects.values()).filter(t => t.absentFrames === 0);

    // If no objects visible in current frame
    if (visible.length === 0) {
      if (this.primaryTarget) {
        if (this.lostSince === null) {
          this.lostSince = now;
        }
        const elapsed = now - this.lostSince;
        if (elapsed <= this.lostRecoveryPeriod) {
          this.lockStatus = 'temporarily_lost';
        } else {
          // Grace period expired (2.5s) with target absent and no other objects in view
          const lost = this.primaryTarget;
          this.primaryTarget = null;
          this.primaryTargetId = null;
          this.lockStatus = 'not_locked';
          this.lostSince = null;
          this.targetAbsentCycles = 0;
          this.candidateDirection = null;
          this.candidateDirectionCycles = 0;
          if (window.voiceAssistant) {
            window.voiceAssistant.announceTargetEvent('target_left_frame', lost);
          }
        }
      } else {
        this.lockStatus = 'not_locked';
      }
      return;
    }

    // Compute Relevance / Closeness Score for each visible object
    visible.forEach(obj => {
      const prox = obj.smoothedProximityScore || 0;
      const score = obj.score || 0;
      const approachBonus = (obj.proximityTrend === 'APPROACHING') ? 0.06 : 0;
      obj.relevanceScore = (prox * 0.85) + (score * 0.09) + approachBonus;
    });

    // Rank visible objects descending by relevance
    visible.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const bestCandidate = visible[0];

    // CASE 1: No current primary target -> Automatically lock the best candidate!
    if (!this.primaryTarget || this.lockStatus === 'not_locked') {
      this.targetAbsentCycles = 0;
      this.lockTarget(bestCandidate, 'auto_select');
      return;
    }

    // CASE 2: Primary target is active and still visible in this frame
    const currentTargetVisible = visible.find(o => o.id === this.primaryTarget.id);

    if (currentTargetVisible) {
      this.primaryTarget = currentTargetVisible;
      this.primaryTargetId = currentTargetVisible.id;
      this.lockStatus = 'locked';
      this.lostSince = null;
      this.targetAbsentCycles = 0;

      // Mark primary target flag on tracks
      for (const obj of visible) {
        obj.isPrimaryTarget = (obj.id === this.primaryTarget.id);
      }

      // Automatic Target Switching with Hysteresis (Closer Target Switching)
      if (bestCandidate.id !== this.primaryTarget.id) {
        const threshold = (this.primaryTarget.relevanceScore * this.switchMarginMultiplier) + this.switchMarginOffset;

        if (bestCandidate.relevanceScore > threshold) {
          if (this.switchCandidateId === bestCandidate.id) {
            this.switchCandidateCycles++;
          } else {
            this.switchCandidateId = bestCandidate.id;
            this.switchCandidateCycles = 1;
          }

          if (this.switchCandidateCycles >= this.switchConfirmationCycles) {
            // Sustained closeness confirmed -> Switch primary target!
            this.switchCandidateId = null;
            this.switchCandidateCycles = 0;
            this.lockTarget(bestCandidate, 'auto_switch');
            return;
          }
        } else {
          this.switchCandidateId = null;
          this.switchCandidateCycles = 0;
        }
      } else {
        this.switchCandidateId = null;
        this.switchCandidateCycles = 0;
      }

      // Proximity State Change Monitoring
      this.checkTargetProximityChange(this.primaryTarget, now);

      // Direction Change Monitoring (with multi-frame confirmation)
      this.checkTargetDirectionChange(this.primaryTarget, now);

    } else {
      // CASE 3: Primary target is absent in this frame, but other objects ARE visible!
      this.targetAbsentCycles = (this.targetAbsentCycles || 0) + 1;

      // When the primary target completely leaves the camera frame,
      // release old target immediately and automatically select the next closest valid detected object.
      if (bestCandidate) {
        const previousTarget = this.primaryTarget;
        this.lockTarget(bestCandidate, 'target_left_switch', { previousTarget });
        return;
      }
    }
  }

  /**
   * Monitor primary target direction transitions (LEFT / CENTRE / RIGHT)
   * Requires multi-frame confirmation (2 consecutive detection cycles in the new zone)
   * to strictly eliminate rapid direction flapping.
   */
  checkTargetDirectionChange(target, now) {
    if (!target || !target.spatial) return;
    const currentPos = target.spatial.position;

    if (!target.lastAnnouncedDirection) {
      target.lastAnnouncedDirection = currentPos;
      return;
    }

    if (currentPos !== target.lastAnnouncedDirection) {
      if (this.candidateDirection === currentPos) {
        this.candidateDirectionCycles++;
      } else {
        this.candidateDirection = currentPos;
        this.candidateDirectionCycles = 1;
      }

      // Require 2 consecutive cycles in the new zone and minimum 2.0s cooldown from any announcement
      if (this.candidateDirectionCycles >= this.candidateDirectionConfirmation) {
        const lastSpeechTime = window.voiceAssistant ? window.voiceAssistant.lastAnnouncementTime : 0;
        const cooldownPassed = (now - this.lastDirectionAnnouncedTime >= 2000) && (now - lastSpeechTime >= 2000);

        if (cooldownPassed) {
          target.lastAnnouncedDirection = currentPos;
          this.candidateDirection = null;
          this.candidateDirectionCycles = 0;
          this.lastDirectionAnnouncedTime = now;

          if (window.voiceAssistant) {
            window.voiceAssistant.announceTargetEvent('direction_changed', target, {
              direction: currentPos
            });
          }
        }
      }
    } else {
      this.candidateDirection = null;
      this.candidateDirectionCycles = 0;
    }
  }

  /**
   * Monitor primary target proximity state transitions and trigger announcements
   */
  checkTargetProximityChange(target, now) {
    if (!target || target.proximityState === 'UNCERTAIN') return;

    const currentState = target.proximityState;

    if (target.lastAnnouncedState !== currentState) {
      target.lastAnnouncedState = currentState;
      this.lastAnnouncedState = currentState;
      this.lastProximityAnnouncedTime = now;

      if (window.voiceAssistant) {
        let eventType = null;
        if (currentState === 'APPROACHING') eventType = 'approaching';
        else if (currentState === 'CLOSE') eventType = 'close';
        else if (currentState === 'MOVING AWAY') eventType = 'moving_away';
        else if (currentState === 'FAR' && target.history && target.history.length > 3) eventType = 'far';

        if (eventType) {
          // Sync last announced direction because combined proximity announcements already announce current direction
          if (target.spatial && target.spatial.position) {
            target.lastAnnouncedDirection = target.spatial.position;
            this.lastDirectionAnnouncedTime = now;
            this.candidateDirection = null;
            this.candidateDirectionCycles = 0;
          }
          window.voiceAssistant.announceTargetEvent(eventType, target);
        }
      }
    }
  }

  /**
   * Lock a target as the primary tracking target
   */
  lockTarget(target, reason = 'auto_select', extra = {}) {
    if (!target) return;

    const previousTarget = extra.previousTarget || this.primaryTarget;
    if (previousTarget && previousTarget !== target) {
      previousTarget.isPrimaryTarget = false;
    }

    this.primaryTarget = target;
    this.primaryTargetId = target.id;
    this.lockStatus = 'locked';
    this.lostSince = null;
    this.targetAbsentCycles = 0;
    target.isPrimaryTarget = true;
    target.lastAnnouncedState = target.proximityState || 'FAR';
    target.lastAnnouncedDirection = (target.spatial && target.spatial.position) || 'Centre';
    this.candidateDirection = null;
    this.candidateDirectionCycles = 0;
    this.lastAnnouncedState = target.lastAnnouncedState;
    this.lastProximityAnnouncedTime = Date.now();

    if (window.soundEngine) window.soundEngine.playToggle(true);
    if (window.a11yManager) window.a11yManager.vibrate([40, 80, 40]);

    if (window.voiceAssistant) {
      if (reason === 'auto_switch') {
        window.voiceAssistant.announceTargetEvent('target_switched', target);
      } else if (reason === 'target_left_switch') {
        window.voiceAssistant.announceTargetEvent('target_left_switch', target, { previousTarget });
      } else {
        window.voiceAssistant.announceTargetEvent('target_acquired', target);
      }
    }

    if (window.app) {
      const pos = (target.spatial && target.spatial.position) || 'Centre';
      window.app.logActivity(`Target locked: ${target.class} (#${target.id}) [${pos}] [${reason}].`, "camera");
    }

    this.updateDashboardUI();
  }

  /**
   * Explicitly unlock the target
   */
  unlockTarget() {
    if (this.lockStatus === 'not_locked') return;

    if (this.primaryTarget) {
      this.primaryTarget.isPrimaryTarget = false;
    }
    this.primaryTarget = null;
    this.primaryTargetId = null;
    this.lockStatus = 'not_locked';
    this.lostSince = null;
    this.targetAbsentCycles = 0;
    this.candidateDirection = null;
    this.candidateDirectionCycles = 0;
    this.lastAnnouncedState = null;

    if (window.soundEngine) window.soundEngine.playToggle(false);
    if (window.a11yManager) window.a11yManager.vibrate(30);

    if (window.voiceAssistant) {
      window.voiceAssistant.announceTargetEvent('unlocked', null);
    }

    if (window.app) {
      window.app.logActivity("Target manually unlocked.", "camera");
    }

    this.updateDashboardUI();
  }

  // Backward compatibility alias for unlockPerson
  unlockPerson() {
    this.unlockTarget();
  }

  // Backward compatibility alias for lockPerson
  lockPerson(person) {
    this.lockTarget(person, 'manual_tap');
  }

  get detectedPeople() {
    return Array.from(this.trackedObjects.values()).filter(t => t.class === 'person' && t.absentFrames === 0);
  }

  get lockedPerson() {
    return this.primaryTarget;
  }

  get lockedPersonId() {
    return this.primaryTargetId;
  }

  reset() {
    this.trackedObjects.clear();
    this.primaryTarget = null;
    this.primaryTargetId = null;
    this.lockStatus = 'not_locked';
    this.lostSince = null;
    this.targetAbsentCycles = 0;
    this.candidateDirection = null;
    this.candidateDirectionCycles = 0;
    this.switchCandidateId = null;
    this.switchCandidateCycles = 0;
    this.lastAnnouncedState = null;
    this.activeObjectsList = [];
    this.updateDashboardUI();
  }

  /**
   * Update Dashboard UI elements
   */
  updateDashboardUI() {
    const badgeEl = document.getElementById('primaryLockStatusBadge');
    const statusTextEl = document.getElementById('valPrimaryPersonStatus');
    const proximityEl = document.getElementById('valPrimaryProximity');
    const confidenceEl = document.getElementById('valPrimaryConfidence');
    const trendEl = document.getElementById('valTargetTrend');
    const announceStatusEl = document.getElementById('valPrimaryAnnounceStatus');
    const btnUnlock = document.getElementById('btnUnlockPrimaryPerson');
    const peopleButtonsRow = document.getElementById('detectedPeopleButtons');

    if (!statusTextEl) return;

    const visible = Array.from(this.trackedObjects.values()).filter(t => t.absentFrames === 0);

    if (this.lockStatus === 'locked' && this.primaryTarget) {
      const t = this.primaryTarget;
      const pos = t.spatial ? t.spatial.position : 'Centre';
      const dirText = pos === 'Centre' ? 'CENTRE (AHEAD)' : pos.toUpperCase();
      const score = Math.round((t.score || 0) * 100);

      if (badgeEl) {
        badgeEl.textContent = "Locked";
        badgeEl.className = "lock-status-badge locked";
      }

      statusTextEl.textContent = `${t.class.toUpperCase()} #${t.id} · ${dirText}`;
      statusTextEl.style.color = "var(--accent-cyan)";

      if (proximityEl) {
        proximityEl.textContent = t.proximityState || 'FAR';
        proximityEl.className = `p-metric-val proximity-badge ${(t.proximityState || 'far').toLowerCase().replace(/\s+/g, '-')}`;
      }

      if (trendEl) {
        const delta = t.deltaAreaPercent !== undefined ? `${t.deltaAreaPercent > 0 ? '+' : ''}${t.deltaAreaPercent}%` : '';
        trendEl.textContent = `${t.proximityTrend} ${delta}`.trim();
        trendEl.style.color = t.proximityTrend === 'APPROACHING' ? '#f59e0b' : (t.proximityTrend === 'MOVING AWAY' ? '#38bdf8' : 'var(--text-secondary)');
      }

      if (confidenceEl) {
        confidenceEl.textContent = `${score}%`;
      }

      if (announceStatusEl) {
        announceStatusEl.textContent = "Auto Target Priority";
        announceStatusEl.style.color = "var(--status-online)";
      }

      if (btnUnlock) btnUnlock.style.display = 'inline-flex';

    } else if (this.lockStatus === 'temporarily_lost') {
      if (badgeEl) {
        badgeEl.textContent = "Temporarily Lost";
        badgeEl.className = "lock-status-badge lost";
      }

      statusTextEl.textContent = "Reacquiring target...";
      statusTextEl.style.color = "var(--status-warning)";

      if (proximityEl) {
        proximityEl.textContent = "UNCERTAIN";
        proximityEl.className = "p-metric-val proximity-badge uncertain";
      }

      if (trendEl) trendEl.textContent = "Searching...";
      if (confidenceEl) confidenceEl.textContent = "Searching...";
      if (announceStatusEl) {
        announceStatusEl.textContent = "Reacquiring...";
        announceStatusEl.style.color = "var(--status-warning)";
      }
      if (btnUnlock) btnUnlock.style.display = 'inline-flex';

    } else {
      if (badgeEl) {
        badgeEl.textContent = visible.length > 0 ? "Auto-Scanning" : "Searching";
        badgeEl.className = "lock-status-badge not-locked";
      }

      statusTextEl.textContent = visible.length > 0 ? "Scanning view..." : "No objects in view";
      statusTextEl.style.color = "var(--text-secondary)";

      if (proximityEl) {
        proximityEl.textContent = "—";
        proximityEl.className = "p-metric-val proximity-badge";
      }

      if (trendEl) trendEl.textContent = "—";
      if (confidenceEl) confidenceEl.textContent = "—";
      if (announceStatusEl) {
        announceStatusEl.textContent = "Auto Standby";
        announceStatusEl.style.color = "var(--text-muted)";
      }
      if (btnUnlock) btnUnlock.style.display = 'none';
    }

    // Render quick-select pills for all visible tracked objects
    if (peopleButtonsRow) {
      if (visible.length === 0) {
        peopleButtonsRow.innerHTML = '<span class="no-people-hint">No objects currently detected</span>';
      } else {
        peopleButtonsRow.innerHTML = '';
        visible.forEach(obj => {
          const btn = document.createElement('button');
          btn.className = 'btn-person-pill';
          const isTarget = this.primaryTarget && this.primaryTarget.id === obj.id;
          if (isTarget) btn.classList.add('active');

          const pos = obj.spatial ? obj.spatial.position : 'Centre';
          btn.innerHTML = `
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z"/></svg>
            <span>${isTarget ? '★ Target: ' : 'Lock: '}${obj.class} #${obj.id} (${pos} · ${obj.proximityState})</span>
          `;
          btn.addEventListener('click', () => {
            if (isTarget) this.unlockTarget();
            else this.lockTarget(obj, 'manual_pill');
          });
          peopleButtonsRow.appendChild(btn);
        });
      }
    }
  }
}

window.targetTracker = new UnifiedTargetTracker();
window.primaryPersonTracker = window.targetTracker; // Backward-compatibility alias
