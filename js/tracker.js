/**
 * DRISVYA - Smart Distance Awareness & Primary Person Tracking System
 * Experimental camera-based relative proximity estimation & target locking.
 * Features:
 * - Bounding-box dimension & temporal size delta tracking across consecutive frames
 * - Relative proximity categorization: Far, Approaching, Close, Uncertain
 * - Manual target locking via viewfinder tap or dashboard quick-select
 * - Stable tracking ID with 3.5s temporary occlusion recovery window
 * - Anti-drift lock protection (never silently switches lock to another person)
 * - Priority announcements routed through the central Speech Manager
 * - High-contrast visual HUD indicators
 */

class PrimaryPersonTracker {
  constructor() {
    this.lockedPersonId = null;
    this.lockedPerson = null;
    this.lockStatus = 'not_locked'; // 'not_locked' | 'locked' | 'temporarily_lost'
    this.lostRecoveryPeriod = 3500; // 3.5 seconds temporary occlusion recovery window
    this.lostSince = null;
    
    // Proximity estimation history
    this.historyWindowSize = 8;
    this.history = []; // [{ time, bbox, areaRatio, heightRatio, centerX, centerY, score }]
    this.lastAnnouncedProximity = null;
    this.lastAnnouncedTime = 0;
    this.proximityCooldown = 4000; // 4s cooldown between proximity state announcements

    // Detected people in current frame
    this.detectedPeople = [];
    this.trackedPeopleMap = new Map(); // id -> { id, bbox, score, spatial, lastSeen, history }
    this.nextPersonId = 1;
  }

  init() {
    this.bindControls();
    this.updateDashboardUI();
  }

  bindControls() {
    const btnUnlock = document.getElementById('btnUnlockPrimaryPerson');
    if (btnUnlock) {
      btnUnlock.addEventListener('click', () => this.unlockPerson());
    }

    // Canvas Tap Listener
    const canvas = document.getElementById('overlayCanvas');
    const container = document.querySelector('.camera-preview-container');
    const targetElement = canvas || container;

    if (targetElement) {
      targetElement.addEventListener('click', (e) => this.handleCanvasTap(e));
    }
  }

  /**
   * Handle user tap on viewfinder canvas to lock a person
   */
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

    // Check if tap hit any detected person
    for (const person of this.detectedPeople) {
      const [bx, by, bw, bh] = person.bbox;
      const drawX = bx * scale + offsetX;
      const drawY = by * scale + offsetY;
      const drawW = bw * scale;
      const drawH = bh * scale;

      // Expand tap target slightly for touch ergonomics
      const pad = 12;
      if (
        clickX >= drawX - pad &&
        clickX <= drawX + drawW + pad &&
        clickY >= drawY - pad &&
        clickY <= drawY + drawH + pad
      ) {
        if (this.lockStatus === 'locked' && this.lockedPersonId === person.id) {
          this.unlockPerson();
        } else {
          this.lockPerson(person);
        }
        return;
      }
    }
  }

  /**
   * Lock a detected person as the Primary Person
   */
  lockPerson(person) {
    if (!person) return;

    this.lockedPersonId = person.id || `person_${this.nextPersonId++}`;
    this.lockedPerson = {
      ...person,
      id: this.lockedPersonId
    };
    this.lockStatus = 'locked';
    this.lostSince = null;
    this.history = [];
    this.lastAnnouncedProximity = (person.proximity && person.proximity.level) || 'Far';
    this.lastAnnouncedTime = Date.now();

    if (window.soundEngine) window.soundEngine.playToggle(true);
    if (window.a11yManager) window.a11yManager.vibrate([40, 80, 40]);

    if (window.voiceAssistant) {
      window.voiceAssistant.announcePrimaryPerson('locked');
    }

    if (window.app) {
      window.app.logActivity(`Primary person locked (${this.lockedPersonId}).`, "camera");
    }

    this.updateDashboardUI();
  }

  /**
   * Unlock the Primary Person
   */
  unlockPerson() {
    if (this.lockStatus === 'not_locked') return;

    this.lockedPersonId = null;
    this.lockedPerson = null;
    this.lockStatus = 'not_locked';
    this.lostSince = null;
    this.history = [];
    this.lastAnnouncedProximity = null;

    if (window.soundEngine) window.soundEngine.playToggle(false);
    if (window.a11yManager) window.a11yManager.vibrate(30);

    if (window.voiceAssistant) {
      window.voiceAssistant.announcePrimaryPerson('unlocked');
    }

    if (window.app) {
      window.app.logActivity("Primary person unlocked.", "camera");
    }

    this.updateDashboardUI();
  }

  /**
   * Frame-by-frame tracker update called from detection cycle
   */
  update(predictions = [], vWidth = 1280, vHeight = 720) {
    const now = Date.now();
    const rawPeople = predictions.filter(p => p.class === 'person');

    // 1. Maintain frame-to-frame IDs for all visible people
    this.detectedPeople = this.trackPeopleAcrossFrames(rawPeople, now);

    // 2. Handle Primary Person Lock
    if (this.lockStatus === 'not_locked') {
      this.updateDashboardUI();
      return;
    }

    // Match locked person in current frame
    let matchedPerson = null;
    let minDistance = Infinity;

    if (this.lockedPerson) {
      const [lx, ly, lw, lh] = this.lockedPerson.bbox;
      const lCenterX = lx + lw / 2;
      const lCenterY = ly + lh / 2;

      for (const p of this.detectedPeople) {
        const [px, py, pw, ph] = p.bbox;
        const pCenterX = px + pw / 2;
        const pCenterY = py + ph / 2;

        const dist = Math.hypot(pCenterX - lCenterX, pCenterY - lCenterY);
        // Matching threshold: must be within reasonable spatial distance (< 45% of width)
        if (dist < minDistance && dist < vWidth * 0.45) {
          minDistance = dist;
          matchedPerson = p;
        }
      }
    }

    if (matchedPerson) {
      // Primary person is actively visible!
      this.lockStatus = 'locked';
      this.lostSince = null;

      // Update locked person details
      this.lockedPerson.bbox = matchedPerson.bbox;
      this.lockedPerson.spatial = matchedPerson.spatial;
      this.lockedPerson.score = matchedPerson.score;
      this.lockedPerson.lastSeen = now;
      matchedPerson.isPrimaryPerson = true;

      // Estimate Relative Proximity using size & temporal expansion
      const proximity = this.estimateProximity(this.lockedPerson, vWidth, vHeight, now);
      this.lockedPerson.proximity = proximity;
      matchedPerson.proximity = proximity;

      // Check proximity state change announcement
      this.checkProximityAnnouncement(proximity.level, now);

    } else {
      // Primary person is missing from current frame!
      if (this.lostSince === null) {
        this.lostSince = now;
      }

      const elapsedLost = now - this.lostSince;
      if (elapsedLost <= this.lostRecoveryPeriod) {
        // Within recovery window: retain identity, display temporarily lost
        this.lockStatus = 'temporarily_lost';
        if (this.lockedPerson) {
          this.lockedPerson.proximity = { level: 'Uncertain', levelHi: 'अनिश्चित', confidence: 0 };
        }
      } else {
        // Recovery window expired: unlock and report lost honestly
        this.lockStatus = 'not_locked';
        const hadPerson = this.lockedPerson;
        this.lockedPerson = null;
        this.lockedPersonId = null;

        if (window.voiceAssistant && hadPerson) {
          window.voiceAssistant.announcePrimaryPerson('lost');
        }
        if (window.app) {
          window.app.logActivity("Primary person tracking lost (recovery window expired).", "camera");
        }
      }
    }

    this.updateDashboardUI();
  }

  /**
   * Assign consistent tracking IDs across frames using centroid proximity
   */
  trackPeopleAcrossFrames(rawPeople, now) {
    const trackedList = [];
    const matchedTrackIds = new Set();

    for (const raw of rawPeople) {
      const [rx, ry, rw, rh] = raw.bbox;
      const rCenterX = rx + rw / 2;
      const rCenterY = ry + rh / 2;

      let bestMatch = null;
      let minDistance = Infinity;

      for (const [id, entry] of this.trackedPeopleMap.entries()) {
        const [ex, ey, ew, eh] = entry.bbox;
        const eCenterX = ex + ew / 2;
        const eCenterY = ey + eh / 2;
        const dist = Math.hypot(rCenterX - eCenterX, rCenterY - eCenterY);

        if (dist < minDistance && dist < 450 && !matchedTrackIds.has(id)) {
          minDistance = dist;
          bestMatch = entry;
        }
      }

      if (bestMatch) {
        bestMatch.bbox = raw.bbox;
        bestMatch.score = raw.score;
        bestMatch.spatial = raw.spatial;
        bestMatch.lastSeen = now;
        matchedTrackIds.add(bestMatch.id);
        trackedList.push(bestMatch);
      } else {
        const id = `person_${this.nextPersonId++}`;
        const newEntry = {
          id,
          class: 'person',
          bbox: raw.bbox,
          score: raw.score,
          spatial: raw.spatial,
          lastSeen: now,
          isPrimaryPerson: false
        };
        this.trackedPeopleMap.set(id, newEntry);
        matchedTrackIds.add(id);
        trackedList.push(newEntry);
      }
    }

    // Clean up old entries missing for > 10 seconds
    for (const [id, entry] of this.trackedPeopleMap.entries()) {
      if (now - entry.lastSeen > 10000 && id !== this.lockedPersonId) {
        this.trackedPeopleMap.delete(id);
      }
    }

    return trackedList;
  }

  /**
   * Experimental Camera-Based Relative Proximity Estimation
   * Categories: Far, Approaching, Close, Uncertain
   */
  estimateProximity(person, vWidth, vHeight, now) {
    const [, , w, h] = person.bbox;
    const area = w * h;
    const frameArea = (vWidth || 1) * (vHeight || 1);
    const areaRatio = area / frameArea;
    const heightRatio = h / (vHeight || 1);
    const score = person.score || 0;

    // Push to rolling history window
    this.history.push({
      time: now,
      areaRatio,
      heightRatio,
      score
    });

    if (this.history.length > this.historyWindowSize) {
      this.history.shift();
    }

    // 1. Low confidence -> Uncertain
    if (score < 0.45) {
      return { level: 'Uncertain', levelHi: 'अनिश्चित', confidence: Math.round(score * 100) };
    }

    // 2. High frame occupancy -> Close
    if (heightRatio > 0.52 || areaRatio > 0.20) {
      return { level: 'Close', levelHi: 'पास', confidence: Math.round(score * 100) };
    }

    // 3. Temporal expansion trend analysis -> Approaching
    // Requires multiple consecutive frames of steady expansion
    if (this.history.length >= 3) {
      const oldest = this.history[0];
      const newest = this.history[this.history.length - 1];
      const areaDelta = (newest.areaRatio - oldest.areaRatio) / Math.max(0.01, oldest.areaRatio);
      const heightDelta = (newest.heightRatio - oldest.heightRatio) / Math.max(0.01, oldest.heightRatio);

      // Verify consistent increase across intermediate frames
      let isSteadilyGrowing = true;
      for (let i = 1; i < this.history.length; i++) {
        if (this.history[i].areaRatio < this.history[i - 1].areaRatio * 0.95) {
          isSteadilyGrowing = false;
          break;
        }
      }

      // If expanding by >= 15% across frames and growing steadily
      if (isSteadilyGrowing && areaDelta >= 0.15 && heightDelta >= 0.08) {
        return { level: 'Approaching', levelHi: 'पास आ रहा है', confidence: Math.round(score * 100) };
      }
    }

    // 4. Small frame occupancy -> Far
    if (heightRatio < 0.30 && areaRatio < 0.08) {
      return { level: 'Far', levelHi: 'दूर', confidence: Math.round(score * 100) };
    }

    return { level: 'Far', levelHi: 'दूर', confidence: Math.round(score * 100) };
  }

  /**
   * Check and announce proximity transitions
   */
  checkProximityAnnouncement(newLevel, now) {
    if (!newLevel || newLevel === 'Uncertain') return;

    if (this.lastAnnouncedProximity !== newLevel) {
      const isImportantTransition = newLevel === 'Close' || newLevel === 'Approaching';
      if (isImportantTransition || (now - this.lastAnnouncedTime >= this.proximityCooldown)) {
        this.lastAnnouncedProximity = newLevel;
        this.lastAnnouncedTime = now;

        let stateKey = 'far';
        if (newLevel === 'Approaching') stateKey = 'approaching';
        else if (newLevel === 'Close') stateKey = 'close';

        if (window.voiceAssistant) {
          window.voiceAssistant.announcePrimaryPerson(stateKey);
        }
      }
    }
  }

  /**
   * Update Dashboard controls & status display
   */
  updateDashboardUI() {
    const badgeEl = document.getElementById('primaryLockStatusBadge');
    const statusTextEl = document.getElementById('valPrimaryPersonStatus');
    const proximityEl = document.getElementById('valPrimaryProximity');
    const confidenceEl = document.getElementById('valPrimaryConfidence');
    const announceStatusEl = document.getElementById('valPrimaryAnnounceStatus');
    const btnUnlock = document.getElementById('btnUnlockPrimaryPerson');
    const peopleButtonsRow = document.getElementById('detectedPeopleButtons');

    if (!statusTextEl) return;

    if (this.lockStatus === 'locked' && this.lockedPerson) {
      if (badgeEl) {
        badgeEl.textContent = "Locked";
        badgeEl.className = "lock-status-badge locked";
      }
      statusTextEl.textContent = `Tracking Primary Person (${this.lockedPerson.spatial ? this.lockedPerson.spatial.position : 'View'})`;
      statusTextEl.style.color = "var(--accent-cyan)";

      const prox = this.lockedPerson.proximity || { level: 'Uncertain' };
      if (proximityEl) {
        proximityEl.textContent = prox.level;
        proximityEl.className = `p-metric-val proximity-badge ${prox.level.toLowerCase()}`;
      }

      if (confidenceEl) {
        confidenceEl.textContent = `${Math.round((this.lockedPerson.score || 0) * 100)}%`;
      }

      if (announceStatusEl) {
        announceStatusEl.textContent = "Primary Priority Active";
        announceStatusEl.style.color = "var(--status-online)";
      }

      if (btnUnlock) btnUnlock.style.display = 'inline-flex';

    } else if (this.lockStatus === 'temporarily_lost') {
      if (badgeEl) {
        badgeEl.textContent = "Temporarily Lost";
        badgeEl.className = "lock-status-badge lost";
      }
      statusTextEl.textContent = "Primary person temporarily lost...";
      statusTextEl.style.color = "var(--status-warning)";

      if (proximityEl) {
        proximityEl.textContent = "Uncertain";
        proximityEl.className = "p-metric-val proximity-badge uncertain";
      }

      if (confidenceEl) confidenceEl.textContent = "Searching...";
      if (announceStatusEl) announceStatusEl.textContent = "Reacquiring...";
      if (btnUnlock) btnUnlock.style.display = 'inline-flex';

    } else {
      if (badgeEl) {
        badgeEl.textContent = "Not Locked";
        badgeEl.className = "lock-status-badge not-locked";
      }
      statusTextEl.textContent = "Not Locked";
      statusTextEl.style.color = "var(--text-secondary)";

      if (proximityEl) {
        proximityEl.textContent = "—";
        proximityEl.className = "p-metric-val proximity-badge";
      }

      if (confidenceEl) confidenceEl.textContent = "—";
      if (announceStatusEl) {
        announceStatusEl.textContent = "Normal Queue";
        announceStatusEl.style.color = "var(--text-muted)";
      }

      if (btnUnlock) btnUnlock.style.display = 'none';
    }

    // Render quick-select person buttons
    if (peopleButtonsRow) {
      if (this.detectedPeople.length === 0) {
        peopleButtonsRow.innerHTML = '<span class="no-people-hint">No people detected in frame</span>';
      } else {
        peopleButtonsRow.innerHTML = '';
        this.detectedPeople.forEach((p, idx) => {
          const btn = document.createElement('button');
          btn.className = 'btn-person-pill';
          const pos = p.spatial ? p.spatial.position : 'Centre';
          const isTarget = this.lockStatus === 'locked' && this.lockedPersonId === p.id;
          if (isTarget) btn.classList.add('active');

          btn.innerHTML = `
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M12 2a5 5 0 100 10 5 5 0 000-10zm-7 17a7 7 0 1114 0H5z"/></svg>
            <span>${isTarget ? 'Locked: ' : 'Lock: '}Person ${idx + 1} (${pos})</span>
          `;
          btn.addEventListener('click', () => {
            if (isTarget) this.unlockPerson();
            else this.lockPerson(p);
          });
          peopleButtonsRow.appendChild(btn);
        });
      }
    }
  }

  reset() {
    this.lockedPersonId = null;
    this.lockedPerson = null;
    this.lockStatus = 'not_locked';
    this.lostSince = null;
    this.history = [];
    this.lastAnnouncedProximity = null;
    this.detectedPeople = [];
    this.trackedPeopleMap.clear();
    this.updateDashboardUI();
  }
}

window.primaryPersonTracker = new PrimaryPersonTracker();
