/**
 * DRISVYA - Central Intelligent Speech Manager
 * Unified audio output and speech synthesis engine for Android and web.
 *
 * Strict Single-Speaker Architecture:
 * 1. Strict One-Announcement-at-a-Time Rule: Never starts a second announcement while current is speaking.
 * 2. Sentences finish completely before evaluating any pending announcement.
 * 3. Never calls speechSynthesis.cancel() on detection or obstacle changes (only on Mute/Disable/Stop).
 * 4. Controlled queue (max 1 pending slot) deduplicates and discards outdated target states.
 * 5. Dashboard Voice Status indicator: SPEAKING, WAITING, READY, MUTED.
 * 6. Natural complete sentences in English and Hindi.
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
    this.speechEnabled = this.isAnnouncementsEnabled;
    this.speechRate = (typeof localStorage !== 'undefined' && parseFloat(localStorage.getItem('drisvya_speed'))) || 1.0;
    this.speechPitch = 1.0;
    this.speechVolume = (typeof localStorage !== 'undefined' && parseFloat(localStorage.getItem('drisvya_volume'))) || 1.0;

    // Strict Central Speech Manager State Machine (Requirement 2)
    this.isSpeaking = false;
    this.currentAnnouncement = null;
    this.speechQueue = [];
    this.lastSpokenAnnouncement = null;
    this.currentTargetId = null;

    this.activeUtterance = null;
    this.watchdogTimer = null;
    this.isAudioUnlocked = false;

    // Controlled single-item pending slot (Requirement 8)
    this.pendingNextEvent = null;
    this.pendingAnnouncement = null; // compatibility mirror
    this.lastAnnouncementTime = 0;
    this.globalAnnouncementCooldown = 2200; // minimum cooldown between identical automatic events

    this.lastAnnouncement = {
      en: "DRISVYA assistive vision platform is ready in standby. Tap Start Assistance to begin.",
      hi: "दृश्या विज़ुअल सहायता मंच स्टैंडबाय पर तैयार है। शुरू करने के लिए स्टार्ट सहायता पर टैप करें।"
    };

    this.audioRoute = 'System Audio Output';
    this.availableVoices = [];
    this.voiceStatus = 'READY';
    this.init();
  }

  init() {
    if (!this.synth) {
      console.warn('[DRISVYA Voice] SpeechSynthesis is not supported on this browser.');
      this.updateStatusUI('MUTED');
      return;
    }

    this.loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }

    this.checkAudioOutputDevices();
    this.updateStatusUI(this.speechEnabled && !this.isMuted ? 'READY' : 'MUTED');
  }

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
      this.speak(feedback, { force: true });
      return true;
    }
    return false;
  }

  setMute(mute) {
    this.isMuted = !!mute;
    if (this.isMuted) {
      this.clearQueue(true);
      this.updateStatusUI('MUTED');
    } else {
      this.updateStatusUI(this.speechEnabled ? 'READY' : 'MUTED');
    }
  }

  toggleMute() {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  setAnnouncementsEnabled(enabled) {
    this.isAnnouncementsEnabled = !!enabled;
    this.speechEnabled = this.isAnnouncementsEnabled;
    try {
      localStorage.setItem('drisvya_announcements', this.speechEnabled ? 'true' : 'false');
    } catch (e) {}

    if (!this.speechEnabled) {
      this.clearQueue(true); // Cancels speech and purges queue
      this.updateStatusUI('MUTED');
    } else {
      this.updateStatusUI(this.isMuted ? 'MUTED' : 'READY');
    }

    const toggleEl = document.getElementById('toggleObjectAnnouncements');
    if (toggleEl && toggleEl.checked !== this.speechEnabled) {
      toggleEl.checked = this.speechEnabled;
    }

    if (window.a11yManager && window.a11yManager.preferences.voiceAlerts !== this.speechEnabled) {
      window.a11yManager.preferences.voiceAlerts = this.speechEnabled;
      window.a11yManager.updateToggleUI('toggleVoiceAlerts', this.speechEnabled);
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

  getFriendlyName(rawClass, lang) {
    const key = (rawClass || '').toLowerCase().trim();
    if (COCO_CLASS_DICTIONARY[key]) {
      return COCO_CLASS_DICTIONARY[key][lang] || COCO_CLASS_DICTIONARY[key].en;
    }
    return key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' ');
  }

  getDirectionPhrase(direction, lang, mode = 'inline') {
    const isHi = lang === 'hi';
    const dir = (direction || 'Centre').toLowerCase();

    if (isHi) {
      if (dir === 'left') return mode === 'initial' ? 'आपकी बाईं ओर' : 'बाईं ओर';
      if (dir === 'right') return mode === 'initial' ? 'आपकी दाईं ओर' : 'दाईं ओर';
      return mode === 'initial' ? 'कैमरा दृश्य में सीधे आगे' : 'सीधे आगे';
    } else {
      if (dir === 'left') return 'on your left';
      if (dir === 'right') return 'on your right';
      return mode === 'initial' ? 'is directly ahead in the camera view' : 'directly ahead';
    }
  }

  /**
   * Primary Target Voice Event Announcer
   * All speech notifications pass through this single centralized method.
   */
  announceTargetEvent(eventType, target, extra = {}) {
    if (!this.speechEnabled || this.isMuted) return;

    const targetId = target ? target.id : null;
    this.currentTargetId = targetId;

    const rawClass = (target && target.class) || 'object';
    const isHi = this.currentLanguage === 'hi';
    const name = this.getFriendlyName(rawClass, isHi ? 'hi' : 'en');
    const pos = (target && target.spatial && target.spatial.position) || (extra && extra.direction) || 'Centre';

    let prevName = '';
    if (extra && extra.previousTarget) {
      prevName = this.getFriendlyName(extra.previousTarget.class || 'object', isHi ? 'hi' : 'en');
    }

    let text = '';
    let priority = 'normal';

    switch (eventType) {
      case 'target_acquired':
        priority = 'primary';
        if (pos === 'Left') {
          text = isHi ? `${name} आपकी बाईं ओर दिखाई दिया।` : `${name} detected on your left.`;
        } else if (pos === 'Right') {
          text = isHi ? `${name} आपकी दाईं ओर दिखाई दिया।` : `${name} detected on your right.`;
        } else {
          text = isHi ? `${name} कैमरा दृश्य में सीधे आगे है।` : `${name} is directly ahead in the camera view.`;
        }
        break;

      case 'direction_changed':
        priority = 'primary';
        if (pos === 'Left') {
          text = isHi ? `${name} अब आपकी बाईं ओर है।` : `${name} is now on your left.`;
        } else if (pos === 'Right') {
          text = isHi ? `${name} अब आपकी दाईं ओर है।` : `${name} is now on your right.`;
        } else {
          text = isHi ? `${name} अब कैमरा दृश्य में सीधे आगे है।` : `${name} is directly ahead in the camera view.`;
        }
        break;

      case 'approaching':
        priority = 'primary';
        if (isHi) {
          const dirHi = pos === 'Left' ? 'बाईं ओर' : (pos === 'Right' ? 'दाईं ओर' : 'सीधे आगे');
          text = `${dirHi} ${name} पास आ रहा है।`;
        } else {
          const dirEn = pos === 'Left' ? 'on your left' : (pos === 'Right' ? 'on your right' : 'directly ahead');
          text = `${name} ${dirEn} is getting closer.`;
        }
        break;

      case 'close':
        priority = 'urgent';
        if (isHi) {
          const dirHi = pos === 'Left' ? 'बाईं ओर' : (pos === 'Right' ? 'दाईं ओर' : 'सीधे आगे');
          text = `${dirHi} ${name} बहुत पास है।`;
        } else {
          const dirEn = pos === 'Left' ? 'on your left' : (pos === 'Right' ? 'on your right' : 'directly ahead');
          text = `${name} ${dirEn} is close.`;
        }
        break;

      case 'moving_away':
        priority = 'normal';
        if (isHi) {
          const dirHi = pos === 'Left' ? 'बाईं ओर' : (pos === 'Right' ? 'दाईं ओर' : 'सीधे आगे');
          text = `${dirHi} ${name} दूर जा रहा है।`;
        } else {
          const dirEn = pos === 'Left' ? 'on your left' : (pos === 'Right' ? 'on your right' : 'directly ahead');
          text = `${name} ${dirEn} is moving away.`;
        }
        break;

      case 'far':
        priority = 'normal';
        if (isHi) {
          const dirHi = pos === 'Left' ? 'बाईं ओर' : (pos === 'Right' ? 'दाईं ओर' : 'सीधे आगे');
          text = `${dirHi} ${name} दूर है।`;
        } else {
          const dirEn = pos === 'Left' ? 'on your left' : (pos === 'Right' ? 'on your right' : 'directly ahead');
          text = `${name} ${dirEn} is far away.`;
        }
        break;

      case 'target_switched':
        priority = 'urgent';
        if (isHi) {
          const dirHi = pos === 'Left' ? 'बाईं ओर' : (pos === 'Right' ? 'दाईं ओर' : 'सीधे आगे');
          text = `${dirHi} ${name} अब सबसे नज़दीकी लक्ष्य है।`;
        } else {
          const dirEn = pos === 'Left' ? 'on your left' : (pos === 'Right' ? 'on your right' : 'directly ahead');
          text = `${name} ${dirEn} is now the closest estimated target.`;
        }
        break;

      case 'target_left_switch':
        priority = 'urgent';
        if (isHi) {
          const dirHi = pos === 'Left' ? 'बाईं ओर' : (pos === 'Right' ? 'दाईं ओर' : 'सीधे आगे');
          text = prevName 
            ? `${prevName} फ्रेम से बाहर चला गया। अब ${dirHi} ${name} को ट्रैक किया जा रहा है।`
            : `अब ${dirHi} ${name} को ट्रैक किया जा रहा है।`;
        } else {
          const dirEn = pos === 'Left' ? 'on your left' : (pos === 'Right' ? 'on your right' : 'directly ahead');
          text = prevName 
            ? `${prevName} left the frame. Now tracking ${name} ${dirEn}.`
            : `Now tracking ${name} ${dirEn}.`;
        }
        break;

      case 'target_left_frame':
        priority = 'urgent';
        text = isHi
          ? `${name} कैमरा दृश्य से बाहर चला गया।`
          : `${name} left the camera view.`;
        break;

      case 'target_lost':
        priority = 'urgent';
        text = isHi
          ? `${name} अस्थायी रूप से खो गया है।`
          : `${name} temporarily lost.`;
        break;

      case 'unlocked':
        priority = 'primary';
        text = isHi ? `लक्ष्य अनलॉक हो गया है।` : `Target unlocked.`;
        break;

      default:
        return;
    }

    if (!text) return;

    // Normal priority events respect minimum cooldown from any announcement
    const now = Date.now();
    if (priority === 'normal') {
      if (now - this.lastAnnouncementTime < this.globalAnnouncementCooldown) {
        return;
      }
    }

    this.speak(text, { targetId, type: 'target', eventType, priority });

    if (window.app) {
      window.app.logActivity(text, "voice");
    }
  }

  /**
   * Environment & Wall Awareness Voice Event Announcer
   * Centralized method ensuring zero collisions and complete sentence delivery.
   */
  announceEnvironmentEvent(eventType, subType, details = {}) {
    if (!this.speechEnabled || this.isMuted) return;

    const isHi = this.currentLanguage === 'hi';
    let text = '';
    let priority = 'normal';

    switch (eventType) {
      case 'wall_initial':
        priority = 'primary';
        if (subType === 'wall_close') {
          text = isHi ? "एक दीवार पास दिखाई दे रही है।" : "A wall appears relatively close.";
        } else if (subType === 'wall_far') {
          text = isHi ? "दीवार अपेक्षाकृत दूर दिखाई दे रही है।" : "Wall appears relatively far away.";
        } else if (subType === 'wall_uncertain') {
          text = isHi ? "दीवार की दूरी का विश्वसनीय अनुमान लगाने में असमर्थ।" : "Unable to estimate wall proximity reliably.";
        } else if (subType === 'wall_surface') {
          text = isHi ? "सामने एक बड़ी दीवार जैसी सतह दिखाई दी।" : "A large wall-like surface is detected ahead.";
        } else {
          text = isHi ? "सामने दीवार दिखाई दी।" : "Wall detected in front.";
        }
        break;

      case 'wall_dynamic':
        if (subType === 'wall_closer') {
          priority = 'primary';
          text = isHi ? "दीवार और पास आ रही है।" : "Wall appears closer.";
        } else if (subType === 'wall_close') {
          priority = 'urgent';
          text = isHi ? "दीवार पास है।" : "Wall appears close.";
        } else if (subType === 'wall_farther') {
          priority = 'normal';
          text = isHi ? "दीवार और दूर जा रही है।" : "Wall appears farther away.";
        }
        break;

      case 'centre_view':
        if (subType === 'centre_person') {
          priority = 'primary';
          text = isHi ? "कैमरा दृश्य में व्यक्ति सीधे आगे है।" : "Person directly ahead in the camera view.";
        } else if (subType === 'centre_furniture') {
          priority = 'primary';
          const objClass = details.objectClass || 'chair';
          const friendlyObj = this.getFriendlyName(objClass, isHi ? 'hi' : 'en');
          text = isHi ? `${friendlyObj} सीधे आगे है।` : `${friendlyObj} detected directly ahead.`;
        } else if (subType === 'centre_wall') {
          priority = 'primary';
          text = isHi ? "सामने केंद्र में दीवार दिखाई दी।" : "Wall detected in the centre.";
        } else if (subType === 'centre_caution') {
          priority = 'urgent';
          text = isHi ? "सामने संभावित रुकावट है। कृपया सावधानी बरतें।" : "Possible obstruction in the centre. Please use caution.";
        } else if (subType === 'centre_clear') {
          priority = 'normal';
          text = isHi ? "सामने के दृश्य में कोई पहचानी गई रुकावट नहीं है।" : "No recognised obstruction detected in the centre view.";
        } else if (subType === 'centre_uncertain') {
          priority = 'primary';
          text = isHi ? "सामने का दृश्य अनिश्चित है। कृपया अपनी छड़ी का उपयोग करें।" : "The centre view is uncertain. Please use your established mobility aid.";
        }
        break;

      case 'zone_obstruction':
        priority = 'normal';
        if (subType === 'left') {
          text = isHi ? "आपकी बाईं ओर संभावित रुकावट है।" : "Possible obstruction detected on your left.";
        } else if (subType === 'right') {
          text = isHi ? "आपकी दाईं ओर संभावित रुकावट है।" : "Possible obstruction detected on your right.";
        }
        break;

      default:
        return;
    }

    if (!text) return;

    const now = Date.now();
    if (priority === 'normal') {
      if (now - this.lastAnnouncementTime < this.globalAnnouncementCooldown) {
        return;
      }
    }

    this.speak(text, { type: 'environment', priority });

    if (window.app) {
      window.app.logActivity(text, "voice");
    }
  }

  /**
   * Compatibility bridge for legacy announcePrimaryPerson calls
   */
  announcePrimaryPerson(stateKey, customText) {
    if (customText) {
      this.speak(customText);
      return;
    }
    const mapping = {
      locked: 'target_acquired',
      far: 'far',
      approaching: 'approaching',
      close: 'close',
      lost: 'target_lost',
      unlocked: 'unlocked'
    };
    const evt = mapping[stateKey] || stateKey;
    this.announceTargetEvent(evt, { class: 'person' });
  }

  /**
   * Central speech dispatcher: Strict One-Announcement-at-a-Time Rule
   * - Never starts a second announcement while current announcement is speaking.
   * - Never interrupts a sentence halfway through.
   * - Saves latest relevant pending event to evaluate upon onend.
   */
  speak(text, options = {}) {
    if (!this.synth) return false;
    this.unlockAudio();

    const isForce = !!options.force;
    if (!this.speechEnabled && !isForce) return false;
    if (this.isMuted && !isForce) return false;
    if (!text || typeof text !== 'string') return false;

    const trimmed = text.trim();
    if (!trimmed) return false;

    // RULE 1: STRICT ONE-ANNOUNCEMENT-AT-A-TIME
    // Never start a second announcement while current announcement is speaking.
    // Never interrupt a sentence halfway through to announce another object.
    if (this.isSpeaking) {
      // Deduplicate: If incoming announcement is identical to what is currently speaking, ignore
      if (this.currentAnnouncement === trimmed) {
        return false;
      }

      // Store as the single latest relevant pending event (controlled queue of max length 1)
      const pendingItem = {
        text: trimmed,
        options: { ...options },
        timestamp: Date.now(),
        targetId: options.targetId !== undefined ? options.targetId : this.currentTargetId,
        type: options.type || 'general'
      };

      this.pendingNextEvent = pendingItem;
      this.pendingAnnouncement = pendingItem; // backward compat mirror
      this.speechQueue = [pendingItem];
      this.updateStatusUI('WAITING');
      return true;
    }

    // Deduplicate identical consecutive announcements (unless force is requested)
    const now = Date.now();
    if (!isForce && trimmed === this.lastSpokenAnnouncement && (now - this.lastAnnouncementTime < 2500)) {
      return false;
    }

    this._executeSpeak(trimmed, options);
    return true;
  }

  /**
   * Internal Speech Synthesis Invocation
   */
  _executeSpeak(text, options = {}) {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    this.isSpeaking = true;
    this.currentAnnouncement = text;
    this.speechQueue = [];
    this.pendingNextEvent = null;
    this.pendingAnnouncement = null;
    this.lastAnnouncementTime = Date.now();
    this.lastAnnouncement[this.currentLanguage] = text;

    this.updateStatusUI('SPEAKING');
    this.startVisualizer();
    this.announceToScreenReader(text);

    const utterance = new SpeechSynthesisUtterance(text);
    this.activeUtterance = utterance;

    const targetLang = options.lang || (this.currentLanguage === 'hi' ? 'hi-IN' : 'en-US');
    utterance.lang = targetLang;
    utterance.rate = this.speechRate;
    utterance.pitch = this.speechPitch;
    utterance.volume = this.speechVolume;

    const voice = this.getBestVoice(this.currentLanguage);
    if (voice) {
      utterance.voice = voice;
    }

    let finished = false;
    const finishUtterance = () => {
      if (finished) return;
      finished = true;

      if (this.watchdogTimer) {
        clearTimeout(this.watchdogTimer);
        this.watchdogTimer = null;
      }

      this.isSpeaking = false;
      this.lastSpokenAnnouncement = text;
      this.currentAnnouncement = null;
      this.activeUtterance = null;
      this.stopVisualizer();

      // Check if voice was disabled or muted while sentence was playing
      if (!this.speechEnabled || this.isMuted) {
        this.pendingNextEvent = null;
        this.pendingAnnouncement = null;
        this.speechQueue = [];
        this.updateStatusUI('MUTED');
        return;
      }

      // RULE 3 & 8: Only after onend, evaluate the next announcement.
      const pending = this.pendingNextEvent;
      if (pending) {
        this.pendingNextEvent = null;
        this.pendingAnnouncement = null;
        this.speechQueue = [];

        let isValid = true;

        // Discard stale target position/proximity announcements if target is no longer locked
        const evt = (pending.options && pending.options.eventType) || '';
        const isPosOrProximity = (evt === 'approaching' || evt === 'close' || evt === 'moving_away' || evt === 'far' || evt === 'direction_changed');
        if (isPosOrProximity && pending.targetId && window.targetTracker) {
          const currentTarget = window.targetTracker.primaryTarget;
          if (!currentTarget || currentTarget.id !== pending.targetId) {
            isValid = false; // Target changed or disappeared during playback
          }
        }

        // Discard stale pending announcements (> 4.0s old)
        if (Date.now() - pending.timestamp > 4000) {
          isValid = false;
        }

        // Discard identical repetition of what just finished speaking
        if (pending.text === this.lastSpokenAnnouncement) {
          isValid = false;
        }

        if (isValid) {
          this.updateStatusUI('WAITING');
          // Brief conversational cadence between sentences (180ms)
          setTimeout(() => {
            if (this.speechEnabled && !this.isMuted) {
              this._executeSpeak(pending.text, pending.options);
            } else {
              this.updateStatusUI('MUTED');
            }
          }, 180);
          return;
        }
      }

      // Voice manager is idle and ready
      this.updateStatusUI('READY');
    };

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.updateStatusUI('SPEAKING');
    };

    utterance.onend = () => {
      finishUtterance();
    };

    utterance.onerror = (e) => {
      console.warn('[DRISVYA Voice] Speech utterance error:', e);
      finishUtterance();
    };

    // Android Chrome speech watchdog timer: recovers state if speech engine stalls or drops onend
    const safetyMs = Math.max(6000, text.length * 160);
    this.watchdogTimer = setTimeout(() => {
      if (this.isSpeaking && this.activeUtterance === utterance) {
        console.warn('[DRISVYA Voice] Speech watchdog timeout triggered. Recovering.');
        finishUtterance();
      }
    }, safetyMs);

    try {
      if (this.synth.paused) {
        this.synth.resume();
      }
      this.synth.speak(utterance);
    } catch (err) {
      console.error('[DRISVYA Voice] Speech execution failed:', err);
      finishUtterance();
    }
  }

  /**
   * Clear active speech and pending queue (Strictly on Mute, Disable, or Camera Stop)
   */
  clearQueue(cancelActive = true) {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    this.pendingNextEvent = null;
    this.pendingAnnouncement = null;
    this.speechQueue = [];

    if (cancelActive && this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {}
    }

    this.isSpeaking = false;
    this.currentAnnouncement = null;
    this.activeUtterance = null;
    this.stopVisualizer();

    const status = (!this.speechEnabled || this.isMuted) ? 'MUTED' : 'READY';
    this.updateStatusUI(status);
  }

  /**
   * Camera Stop hook: safely cleans all pending state and silences output
   */
  onCameraStop() {
    this.clearQueue(true);
    this.currentTargetId = null;
    const status = (!this.speechEnabled || this.isMuted) ? 'MUTED' : 'READY';
    this.updateStatusUI(status);
  }

  testVoice() {
    this.unlockAudio();
    const isHi = this.currentLanguage === 'hi';
    const testText = isHi
      ? "दृश्या वॉइस टेस्ट। आवाज़ और ऑडियो आउटपुट सही तरीके से काम कर रहे हैं।"
      : "DRISVYA voice announcement test. Speech synthesis and audio output are working.";

    this.speak(testText, { force: true });

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
    const textToRepeat = this.lastSpokenAnnouncement || this.lastAnnouncement[this.currentLanguage];
    if (textToRepeat) {
      this.speak(textToRepeat, { force: true });
      return textToRepeat;
    } else {
      const fallback = this.currentLanguage === 'en' 
        ? "DRISVYA assistance is in standby. Tap Start Assistance to begin." 
        : "दृश्या सहायता स्टैंडबाय पर है। शुरू करने के लिए स्टार्ट सहायता दबाएं।";
      this.speak(fallback, { force: true });
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
   * Dashboard Status Indicator (Requirement 10)
   * Displays: SPEAKING, WAITING, READY, MUTED
   */
  updateStatusUI(statusText) {
    let normalized = 'READY';
    const s = (statusText || '').toUpperCase();
    if (s.includes('SPEAK')) {
      normalized = 'SPEAKING';
    } else if (s.includes('WAIT')) {
      normalized = 'WAITING';
    } else if (s.includes('MUTE') || s.includes('DISABLE')) {
      normalized = 'MUTED';
    } else {
      normalized = 'READY';
    }

    this.voiceStatus = normalized;

    const statusEl = document.getElementById('voiceAssistantStatusText');
    const badgeEl = document.getElementById('voiceStatusBadge');

    if (statusEl) {
      statusEl.textContent = normalized;
    }
    if (badgeEl) {
      badgeEl.className = 'status-dot';
      if (normalized === 'SPEAKING') {
        badgeEl.classList.add('speaking');
        badgeEl.style.background = 'var(--accent-cyan)';
        badgeEl.style.boxShadow = '0 0 10px var(--accent-cyan)';
      } else if (normalized === 'WAITING') {
        badgeEl.classList.add('waiting');
        badgeEl.style.background = 'var(--accent-amber, #f59e0b)';
        badgeEl.style.boxShadow = '0 0 8px var(--accent-amber, #f59e0b)';
      } else if (normalized === 'READY') {
        badgeEl.classList.add('ready', 'online');
        badgeEl.style.background = 'var(--status-online)';
        badgeEl.style.boxShadow = '0 0 8px var(--status-online)';
      } else if (normalized === 'MUTED') {
        badgeEl.classList.add('muted', 'disabled');
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
