/**
 * DRISVYA - Intelligent Voice Announcement Engine
 * Full integration with SpeechSynthesis API for Android smartphones & Bluetooth audio.
 * Features:
 * - Natural language screen zone sentences ("Person on your left.", "Chair in front of you.", "Bottle on your right.")
 * - Multi-frame consistency tracking (announces only after multiple consecutive frames)
 * - Object & zone cooldowns preventing frame-by-frame repetition
 * - Disappearance & reappearance lifecycle handling
 * - Single-item freshness queue (no overlapping speech; discards stale announcements)
 * - Master Object Announcements toggle (ON/OFF)
 * - Announcement volume control
 * - Clear three-state speech status indicator: Speaking / Waiting / Disabled
 * - English and Hindi voice selection with dialect matching
 * - Audio unlocker on user interaction (resolves Android mobile autoplay restrictions)
 * - Bluetooth audio headset compatibility and status tracking
 * - Preserves working Test Voice button
 */

const COCO_CLASS_DICTIONARY = {
  person: { en: 'Person', hi: 'व्यक्ति' },
  chair: { en: 'Chair', hi: 'कुर्सी' },
  bottle: { en: 'Bottle', hi: 'बोतल' },
  cup: { en: 'Cup', hi: 'कप' },
  'dining table': { en: 'Table', hi: 'मेज' },
  table: { en: 'Table', hi: 'मेज' },
  couch: { en: 'Sofa', hi: 'सोफा' },
  bed: { en: 'Bed', hi: 'बिस्तर' },
  laptop: { en: 'Laptop', hi: 'लैपटॉप' },
  'cell phone': { en: 'Mobile phone', hi: 'मोबाइल' },
  car: { en: 'Car', hi: 'कार' },
  bus: { en: 'Bus', hi: 'बस' },
  truck: { en: 'Truck', hi: 'ट्रक' },
  bicycle: { en: 'Bicycle', hi: 'साइकिल' },
  motorcycle: { en: 'Motorcycle', hi: 'मोटरसाइकिल' },
  backpack: { en: 'Backpack', hi: 'बैग' },
  handbag: { en: 'Handbag', hi: 'हैंडबैग' },
  suitcase: { en: 'Suitcase', hi: 'सूटकेस' },
  dog: { en: 'Dog', hi: 'कुत्ता' },
  cat: { en: 'Cat', hi: 'बिल्ली' },
  door: { en: 'Door', hi: 'दरवाज़ा' },
  tv: { en: 'TV', hi: 'टीवी' },
  microwave: { en: 'Microwave', hi: 'माइक्रोवेव' },
  refrigerator: { en: 'Refrigerator', hi: 'फ्रिज' },
  book: { en: 'Book', hi: 'किताब' },
  clock: { en: 'Clock', hi: 'घड़ी' },
  vase: { en: 'Vase', hi: 'फूलदान' },
  stairs: { en: 'Stairs', hi: 'सीढ़ियाँ' },
  'traffic light': { en: 'Traffic light', hi: 'ट्रैफ़िक लाइट' },
  'stop sign': { en: 'Stop sign', hi: 'स्टॉप साइन' }
};

class VoiceAssistant {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.currentLanguage = (typeof localStorage !== 'undefined' && localStorage.getItem('drisvya_lang')) || 'en';
    this.isMuted = false;
    this.isAnnouncementsEnabled = (typeof localStorage !== 'undefined' ? localStorage.getItem('drisvya_announcements') !== 'false' : true);
    this.speechRate = (typeof localStorage !== 'undefined' && parseFloat(localStorage.getItem('drisvya_speed'))) || 1.0;
    this.speechPitch = 1.0;
    this.speechVolume = (typeof localStorage !== 'undefined' && parseFloat(localStorage.getItem('drisvya_volume'))) || 1.0;

    // Multi-frame stability tracking & cooldowns
    this.trackedObjects = new Map(); // key: `${class}_${position}` -> { class, position, consecutiveCount, lastSeenTime, lastAnnouncedTime, announcedInCurrentAppearance, disappeared }
    this.requiredConsecutiveFrames = 2; // Must be detected in at least 2 consecutive frames for stability
    this.objectCooldown = 6000; // 6 seconds cooldown per object and zone
    this.globalAnnouncementCooldown = 2200; // 2.2 seconds minimum gap between speech announcements
    this.lastAnnouncementTime = 0;
    this.pendingAnnouncement = null; // { candidate, timestamp } - queued freshness announcement

    // Speech state
    this.isSpeaking = false;
    this.isUrgentSpeaking = false;
    this.activeUtterance = null; // Prevents Chromium garbage collection bug on Android
    this.isAudioUnlocked = false; // Audio unlock flag

    this.lastAnnouncement = {
      en: "DRISVYA assistive vision platform is ready in standby. Tap Start Assistance to begin.",
      hi: "दृश्या विज़ुअल सहायता मंच स्टैंडबाय पर तैयार है। शुरू करने के लिए स्टार्ट सहायता पर टैप करें।"
    };

    // Bluetooth & system audio routing status
    this.audioRoute = 'System Audio Output';
    this.availableVoices = [];
    this.init();
  }

  init() {
    if (!this.synth) {
      console.warn('[DRISVYA Voice] SpeechSynthesis is not supported on this browser.');
      this.updateStatusUI('Disabled');
      return;
    }

    this.loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }

    // Inspect audio output devices for Bluetooth headsets
    this.checkAudioOutputDevices();

    // Initial state: Waiting (if enabled) or Disabled
    this.updateStatusUI(this.isAnnouncementsEnabled && !this.isMuted ? 'Waiting' : 'Disabled');
  }

  /**
   * Unlock SpeechSynthesis and Web Audio upon user gesture (Crucial for Android Chrome)
   */
  unlockAudio() {
    if (this.isAudioUnlocked) return;
    this.isAudioUnlocked = true;

    try {
      if (this.synth && this.synth.resume) {
        this.synth.resume();
      }
      if (window.soundEngine && window.soundEngine.init) {
        window.soundEngine.init();
      }
      console.info('[DRISVYA Voice] Audio engine unlocked via user interaction.');
    } catch (e) {
      console.warn('[DRISVYA Voice] Audio unlock error:', e);
    }
  }

  loadVoices() {
    if (!this.synth) return;
    try {
      this.availableVoices = this.synth.getVoices() || [];
      if (this.availableVoices.length > 0) {
        console.info(`[DRISVYA Voice] Loaded ${this.availableVoices.length} speech synthesis voices.`);
      }
    } catch (e) {
      console.warn('[DRISVYA Voice] Could not get speech voices:', e);
    }
  }

  /**
   * Inspect audio routing (Bluetooth earphones / wired headsets)
   */
  async checkAudioOutputDevices() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      const hasBluetooth = audioOutputs.some(d => 
        (d.label || '').toLowerCase().includes('bluetooth') || 
        (d.label || '').toLowerCase().includes('wireless') || 
        (d.label || '').toLowerCase().includes('headset') ||
        (d.label || '').toLowerCase().includes('earbuds')
      );

      if (hasBluetooth) {
        this.audioRoute = 'Bluetooth Headset Connected';
      } else if (audioOutputs.length > 0) {
        this.audioRoute = 'System / Headphone Output';
      } else {
        this.audioRoute = 'System Audio (Bluetooth Compatible)';
      }

      this.updateAudioRouteUI();
    } catch (e) {
      this.audioRoute = 'System Audio Output';
      this.updateAudioRouteUI();
    }
  }

  updateAudioRouteUI() {
    const routeEl = document.getElementById('audioRouteStatus');
    if (routeEl) {
      routeEl.textContent = this.audioRoute;
    }
  }

  /**
   * Select best natural voice for current language
   */
  getBestVoice(langCode) {
    if (!this.availableVoices.length) {
      this.loadVoices();
    }
    if (!this.availableVoices.length) return null;

    if (langCode === 'hi') {
      const hindi = this.availableVoices.find(v => 
        v.lang.toLowerCase().replace('_', '-').startsWith('hi') || 
        v.name.toLowerCase().includes('hindi')
      );
      if (hindi) return hindi;
    }

    const indianEnglish = this.availableVoices.find(v => v.lang === 'en-IN' || v.lang === 'en_IN');
    if (indianEnglish && langCode === 'en') return indianEnglish;

    const genericEnglish = this.availableVoices.find(v => v.lang.toLowerCase().startsWith('en'));
    if (genericEnglish && langCode === 'en') return genericEnglish;

    return this.availableVoices[0] || null;
  }

  setLanguage(lang) {
    if (lang === 'en' || lang === 'hi') {
      this.currentLanguage = lang;
      try {
        localStorage.setItem('drisvya_lang', lang);
      } catch (e) {}

      const feedback = lang === 'en' 
        ? "Language set to English." 
        : "भाषा हिन्दी में सेट कर दी गई है।";
      this.speak(feedback, { force: true, priority: 'urgent' });
      return true;
    }
    return false;
  }

  setMute(mute) {
    this.isMuted = !!mute;
    if (this.isMuted && this.synth) {
      this.clearQueue();
      this.synth.cancel();
      this.stopVisualizer();
      this.isUrgentSpeaking = false;
      this.isSpeaking = false;
    }
    this.updateStatusUI(this.isMuted || !this.isAnnouncementsEnabled ? 'Disabled' : 'Waiting');
  }

  toggleMute() {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  setAnnouncementsEnabled(enabled) {
    this.isAnnouncementsEnabled = !!enabled;
    try {
      localStorage.setItem('drisvya_announcements', this.isAnnouncementsEnabled ? 'true' : 'false');
    } catch (e) {}

    if (!this.isAnnouncementsEnabled) {
      this.clearQueue();
      if (this.synth) this.synth.cancel();
      this.stopVisualizer();
      this.isSpeaking = false;
      this.isUrgentSpeaking = false;
      this.updateStatusUI('Disabled');
    } else {
      this.updateStatusUI(this.isMuted ? 'Disabled' : 'Waiting');
    }

    // Sync UI checkbox if present
    const toggleEl = document.getElementById('toggleObjectAnnouncements');
    if (toggleEl && toggleEl.checked !== this.isAnnouncementsEnabled) {
      toggleEl.checked = this.isAnnouncementsEnabled;
    }

    // Sync accessibility settings toggle
    if (window.a11yManager && window.a11yManager.preferences.voiceAlerts !== this.isAnnouncementsEnabled) {
      window.a11yManager.preferences.voiceAlerts = this.isAnnouncementsEnabled;
      window.a11yManager.updateToggleUI('toggleVoiceAlerts', this.isAnnouncementsEnabled);
      window.a11yManager.savePreferences();
    }
  }

  setSpeechRate(rate) {
    this.speechRate = Math.max(0.6, Math.min(2.0, parseFloat(rate)));
    try {
      localStorage.setItem('drisvya_speed', String(this.speechRate));
    } catch (e) {}
  }

  setVolume(volume) {
    this.speechVolume = Math.max(0.0, Math.min(1.0, parseFloat(volume)));
    try {
      localStorage.setItem('drisvya_volume', String(this.speechVolume));
    } catch (e) {}

    const valEl = document.getElementById('valVoiceVolume');
    if (valEl) {
      valEl.textContent = `${Math.round(this.speechVolume * 100)}%`;
    }
  }

  /**
   * Natural English and Hindi screen zone sentence formatting
   * Screen positions: Left, Centre, Right
   */
  formatPositionSentence(name, position, lang) {
    if (lang === 'hi') {
      if (position === 'Left') {
        return `बाईं ओर ${name} है।`;
      } else if (position === 'Right') {
        return `दाईं ओर ${name} है।`;
      } else if (position === 'Centre') {
        return `आपके सामने ${name} है।`;
      } else {
        return `${name} दिखाई दे रहा है।`;
      }
    } else {
      if (position === 'Left') {
        return `${name} on your left.`;
      } else if (position === 'Right') {
        return `${name} on your right.`;
      } else if (position === 'Centre') {
        return `${name} in front of you.`;
      } else {
        return `${name} detected.`;
      }
    }
  }

  getFriendlyName(rawClass, lang) {
    const key = (rawClass || '').toLowerCase().trim();
    if (COCO_CLASS_DICTIONARY[key]) {
      return COCO_CLASS_DICTIONARY[key][lang] || COCO_CLASS_DICTIONARY[key].en;
    }
    return key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' ');
  }

  /**
   * Process actual predictions from live detection stream
   * - Tracks consecutive frames for stable detection
   * - Avoids frame-by-frame repetitive speech
   * - Respects per-object cooldowns
   * - Handles disappearance & reappearance
   * - Prioritizes top relevant detection
   * - Queues cleanly without speech overlap
   */
  handleDetections(predictions = []) {
    if (!this.isAnnouncementsEnabled || this.isMuted) return;

    const now = Date.now();
    const currentFrameKeys = new Set();

    // 1. Process detections in current frame
    if (predictions && predictions.length > 0) {
      predictions.forEach(pred => {
        const pos = pred.spatial ? pred.spatial.position : 'Centre';
        const key = `${pred.class}_${pos}`;
        currentFrameKeys.add(key);

        let tracked = this.trackedObjects.get(key);
        if (!tracked) {
          tracked = {
            class: pred.class,
            position: pos,
            consecutiveCount: 0,
            lastSeenTime: now,
            lastAnnouncedTime: 0,
            announcedInCurrentAppearance: false,
            disappeared: false,
            bbox: pred.bbox,
            score: pred.score || 0
          };
          this.trackedObjects.set(key, tracked);
        }

        // Increment consecutive frames
        tracked.consecutiveCount++;
        tracked.lastSeenTime = now;
        tracked.bbox = pred.bbox;
        tracked.score = pred.score || 0;

        // If it previously disappeared and came back, reset disappeared flag
        if (tracked.disappeared) {
          tracked.disappeared = false;
        }
      });
    }

    // 2. Mark objects that disappeared (not in current frame for > 1500ms)
    this.trackedObjects.forEach((tracked, key) => {
      if (!currentFrameKeys.has(key)) {
        if (now - tracked.lastSeenTime > 1500) {
          tracked.consecutiveCount = 0;
          tracked.announcedInCurrentAppearance = false;
          tracked.disappeared = true;
        }
      }
    });

    if (!predictions || predictions.length === 0) return;

    // 3. Find candidates eligible for announcement:
    // - Must meet required consecutive frames
    // - Must not already be announced during this appearance
    // - Must have passed the per-object cooldown
    const eligibleCandidates = [];
    this.trackedObjects.forEach((tracked, key) => {
      if (
        currentFrameKeys.has(key) &&
        tracked.consecutiveCount >= this.requiredConsecutiveFrames &&
        !tracked.announcedInCurrentAppearance &&
        (now - tracked.lastAnnouncedTime >= this.objectCooldown)
      ) {
        eligibleCandidates.push(tracked);
      }
    });

    if (eligibleCandidates.length === 0) return;

    // 4. Prioritize: sort by bounding box area descending (largest/most prominent first)
    eligibleCandidates.sort((a, b) => {
      const areaA = (a.bbox && a.bbox[2] * a.bbox[3]) || 0;
      const areaB = (b.bbox && b.bbox[2] * b.bbox[3]) || 0;
      return areaB - areaA;
    });

    const chosenCandidate = eligibleCandidates[0];

    // 5. Prevent overlapping speech
    // If speech is already playing, queue this announcement (max 1 fresh pending announcement)
    if (this.isSpeaking || (this.synth && this.synth.speaking)) {
      this.pendingAnnouncement = {
        candidate: chosenCandidate,
        timestamp: now
      };
      return;
    }

    // If within global cooldown, store in pending queue
    if (now - this.lastAnnouncementTime < this.globalAnnouncementCooldown) {
      this.pendingAnnouncement = {
        candidate: chosenCandidate,
        timestamp: now
      };
      return;
    }

    // 6. Speak the chosen candidate
    this.executeAnnouncement(chosenCandidate, now);
  }

  executeAnnouncement(candidate, timestamp) {
    candidate.announcedInCurrentAppearance = true;
    candidate.lastAnnouncedTime = timestamp;
    this.lastAnnouncementTime = timestamp;
    this.pendingAnnouncement = null;

    const friendlyName = this.getFriendlyName(candidate.class, this.currentLanguage);
    const sentence = this.formatPositionSentence(friendlyName, candidate.position, this.currentLanguage);

    this.speak(sentence, { priority: 'normal' });

    if (candidate.position === 'Centre' && window.a11yManager) {
      window.a11yManager.vibrate(35);
    }
    if (window.app) {
      window.app.logActivity(sentence, "voice");
    }
  }

  /**
   * Speak announcement with priority management & Android Chromium stability
   */
  speak(text, options = {}) {
    if (!this.synth) return;
    this.unlockAudio();

    const priority = options.priority || 'normal';

    // Announcements disabled check (unless forced by Test Voice or user action)
    if (!this.isAnnouncementsEnabled && !options.force) {
      return;
    }

    if (this.isMuted && !options.force) {
      return;
    }

    // Urgent warnings interrupt lower-priority announcements
    if (priority === 'urgent' && this.synth.speaking) {
      this.synth.cancel();
      this.isSpeaking = false;
    } else if (this.isSpeaking || this.synth.speaking) {
      // Ordinary announcements must not interrupt an announcement already playing
      return;
    }

    // Announce to Screen Readers via ARIA live region
    this.announceToScreenReader(text);

    // Save for Repeat Audio
    this.lastAnnouncement[this.currentLanguage] = text;

    const utterance = new SpeechSynthesisUtterance(text);
    this.activeUtterance = utterance; // Prevent V8 garbage collection mid-speech

    const targetLang = options.lang || (this.currentLanguage === 'hi' ? 'hi-IN' : 'en-US');
    utterance.lang = targetLang;
    utterance.rate = this.speechRate;
    utterance.pitch = this.speechPitch;
    utterance.volume = this.speechVolume;

    const voice = this.getBestVoice(this.currentLanguage);
    if (voice) {
      utterance.voice = voice;
    }

    if (priority === 'urgent') {
      this.isUrgentSpeaking = true;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.startVisualizer();
      this.updateStatusUI('Speaking');
    };

    const handleSpeechEnd = () => {
      this.isSpeaking = false;
      this.isUrgentSpeaking = false;
      this.activeUtterance = null;
      this.stopVisualizer();

      // Check queued announcement (only play if fresh, < 2500ms)
      if (this.pendingAnnouncement && this.isAnnouncementsEnabled && !this.isMuted) {
        const pending = this.pendingAnnouncement;
        this.pendingAnnouncement = null;
        const now = Date.now();
        if (now - pending.timestamp < 2500 && pending.candidate) {
          this.executeAnnouncement(pending.candidate, now);
          return;
        }
      }

      this.updateStatusUI(this.isAnnouncementsEnabled && !this.isMuted ? 'Waiting' : 'Disabled');
    };

    utterance.onend = handleSpeechEnd;
    utterance.onerror = (e) => {
      console.warn('[DRISVYA Voice] Speech error:', e);
      handleSpeechEnd();
    };

    try {
      if (this.synth.paused) {
        this.synth.resume();
      }
      this.synth.speak(utterance);
    } catch (err) {
      console.error('[DRISVYA Voice] Speech call failed:', err);
      handleSpeechEnd();
    }
  }

  /**
   * Clear pending queue and reset tracking
   */
  clearQueue() {
    this.pendingAnnouncement = null;
    this.trackedObjects.clear();
  }

  /**
   * Test Voice function (Allows user to verify audio and unlocks SpeechSynthesis)
   */
  testVoice() {
    this.unlockAudio();
    const isHi = this.currentLanguage === 'hi';
    const testText = isHi
      ? "दृश्या वॉइस टेस्ट। आवाज़ और ऑडियो आउटपुट सही तरीके से काम कर रहे हैं।"
      : "DRISVYA voice announcement test. Speech synthesis and audio output are working.";

    this.speak(testText, { force: true, priority: 'urgent' });

    if (window.soundEngine) {
      window.soundEngine.playStart();
    }
    if (window.a11yManager) {
      window.a11yManager.vibrate([40, 80, 40]);
    }
    if (window.app) {
      window.app.logActivity("Voice announcement test triggered.", "voice");
    }
  }

  repeatLast() {
    this.unlockAudio();
    const textToRepeat = this.lastAnnouncement[this.currentLanguage];
    if (textToRepeat) {
      this.speak(textToRepeat, { force: true, priority: 'urgent' });
      return textToRepeat;
    } else {
      const fallback = this.currentLanguage === 'en' 
        ? "DRISVYA assistance is in standby. Tap Start Assistance to begin." 
        : "दृश्या सहायता स्टैंडबाय पर है। शुरू करने के लिए स्टार्ट सहायता दबाएं।";
      this.speak(fallback, { force: true, priority: 'urgent' });
      return fallback;
    }
  }

  startVisualizer() {
    const visualizer = document.getElementById('audioVisualizer');
    if (visualizer) visualizer.classList.add('speaking');
  }

  stopVisualizer() {
    const visualizer = document.getElementById('audioVisualizer');
    if (visualizer) visualizer.classList.remove('speaking');
  }

  /**
   * Update Status UI indicator: Speaking / Waiting / Disabled
   */
  updateStatusUI(statusText) {
    const statusEl = document.getElementById('voiceAssistantStatusText');
    const badgeEl = document.getElementById('voiceStatusBadge');

    if (statusEl) statusEl.textContent = statusText;
    if (badgeEl) {
      badgeEl.className = 'status-dot';
      if (statusText === 'Speaking') {
        badgeEl.classList.add('speaking');
        badgeEl.style.background = 'var(--accent-cyan)';
        badgeEl.style.boxShadow = '0 0 10px var(--accent-cyan)';
      } else if (statusText === 'Waiting') {
        badgeEl.classList.add('online');
        badgeEl.style.background = 'var(--status-online)';
        badgeEl.style.boxShadow = '0 0 8px var(--status-online)';
      } else if (statusText === 'Disabled') {
        badgeEl.classList.add('disabled');
        badgeEl.style.background = 'var(--status-standby)';
        badgeEl.style.boxShadow = 'none';
      }
    }
  }

  announceToScreenReader(text) {
    const announcer = document.getElementById('a11yAnnouncer');
    if (announcer) {
      announcer.textContent = '';
      setTimeout(() => {
        announcer.textContent = text;
      }, 50);
    }
  }
}

window.voiceAssistant = new VoiceAssistant();
