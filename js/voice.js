/**
 * DRISVYA - Central Intelligent Speech Manager
 * Unified audio output and speech synthesis engine for Android and web.
 * Features:
 * - Single-queue speech execution (zero audio collisions / speech overlap)
 * - Intelligent target event narration with English and Hindi support
 * - Urgent preemption (close obstacles & target switching can preempt non-urgent speech)
 * - State-change gating & deduplication (no repetitive spam on unchanged states)
 * - Strict cancellation on announcements OFF or camera stop
 * - Full audio route, volume, speech rate, and Test Voice support
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

    // Single Central Speech State
    this.isSpeaking = false;
    this.isUrgentSpeaking = false;
    this.activeUtterance = null;
    this.isAudioUnlocked = false;

    this.lastAnnouncementTime = 0;
    this.globalAnnouncementCooldown = 2400; // 2.4s minimum gap between non-urgent speech
    this.pendingAnnouncement = null;

    this.lastAnnouncement = {
      en: "DRISVYA assistive vision platform is ready in standby. Tap Start Assistance to begin.",
      hi: "दृश्या विज़ुअल सहायता मंच स्टैंडबाय पर तैयार है। शुरू करने के लिए स्टार्ट सहायता पर टैप करें।"
    };

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

    this.checkAudioOutputDevices();
    this.updateStatusUI(this.isAnnouncementsEnabled && !this.isMuted ? 'Waiting' : 'Disabled');
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

    const toggleEl = document.getElementById('toggleObjectAnnouncements');
    if (toggleEl && toggleEl.checked !== this.isAnnouncementsEnabled) {
      toggleEl.checked = this.isAnnouncementsEnabled;
    }

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

  getFriendlyName(rawClass, lang) {
    const key = (rawClass || '').toLowerCase().trim();
    if (COCO_CLASS_DICTIONARY[key]) {
      return COCO_CLASS_DICTIONARY[key][lang] || COCO_CLASS_DICTIONARY[key].en;
    }
    return key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' ');
  }

  /**
   * Primary Target Voice Event Announcer
   * All speech notifications pass through this single centralized method.
   */
  announceTargetEvent(eventType, target, extra = {}) {
    if (!this.isAnnouncementsEnabled || this.isMuted) return;

    const rawClass = (target && target.class) || 'object';
    const isHi = this.currentLanguage === 'hi';
    const name = this.getFriendlyName(rawClass, isHi ? 'hi' : 'en');

    let text = '';
    let priority = 'normal';

    switch (eventType) {
      case 'target_acquired':
        text = isHi
          ? `${name} दिखाई दिया। ट्रैकिंग शुरू हुई।`
          : `${name} detected. Tracking started.`;
        priority = 'primary';
        break;

      case 'approaching':
        text = isHi
          ? `${name} पास आ रहा है।`
          : `${name} is getting closer.`;
        priority = 'primary';
        break;

      case 'close':
        text = isHi
          ? `${name} पास है।`
          : `${name} is close.`;
        priority = 'urgent';
        break;

      case 'moving_away':
        text = isHi
          ? `${name} दूर जा रहा है।`
          : `${name} is moving away.`;
        priority = 'normal';
        break;

      case 'far':
        text = isHi
          ? `${name} दूर है।`
          : `${name} is far away.`;
        priority = 'normal';
        break;

      case 'target_switched':
        text = isHi
          ? `${name} अब सबसे नज़दीकी लक्ष्य है।`
          : `${name} is now the closest estimated target.`;
        priority = 'urgent';
        break;

      case 'uncertain':
        text = isHi
          ? `लक्ष्य ट्रैकिंग अनिश्चित है।`
          : `Target tracking uncertain.`;
        priority = 'normal';
        break;

      case 'target_lost':
        text = isHi
          ? `${name} अस्थायी रूप से खो गया है।`
          : `${name} temporarily lost.`;
        priority = 'urgent';
        break;

      case 'unlocked':
        text = isHi
          ? `लक्ष्य अनलॉक हो गया है।`
          : `Target unlocked.`;
        priority = 'primary';
        break;

      default:
        return;
    }

    if (!text) return;

    const now = Date.now();
    // Normal priority events respect cooldown
    if (priority === 'normal') {
      if (now - this.lastAnnouncementTime < this.globalAnnouncementCooldown) {
        return;
      }
    }

    this.lastAnnouncementTime = now;
    this.pendingAnnouncement = null;
    this.speak(text, { priority });

    if (window.app) {
      window.app.logActivity(text, "voice");
    }
  }

  /**
   * Compatibility bridge for legacy announcePrimaryPerson calls
   */
  announcePrimaryPerson(stateKey, customText) {
    if (customText) {
      this.speak(customText, { priority: 'primary' });
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
   * Central speech execution with preemption & non-overlapping guarantees
   */
  speak(text, options = {}) {
    if (!this.synth) return;
    this.unlockAudio();

    const priority = options.priority || 'normal';

    if (!this.isAnnouncementsEnabled && !options.force) {
      return;
    }
    if (this.isMuted && !options.force) {
      return;
    }

    // Preemption handling
    if ((priority === 'urgent' || priority === 'primary') && this.synth.speaking) {
      if (!this.isUrgentSpeaking) {
        this.synth.cancel();
        this.isSpeaking = false;
        this.isUrgentSpeaking = false;
      } else {
        return; // Already speaking an urgent alert; do not collide
      }
    } else if (this.isSpeaking || this.synth.speaking) {
      return; // Non-urgent never interrupts
    }

    this.announceToScreenReader(text);
    this.lastAnnouncement[this.currentLanguage] = text;

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

      if (this.pendingAnnouncement && this.isAnnouncementsEnabled && !this.isMuted) {
        const pending = this.pendingAnnouncement;
        this.pendingAnnouncement = null;
        const now = Date.now();
        if (now - pending.timestamp < 3000) {
          this.speak(pending.text, { priority: pending.priority || 'normal' });
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

  clearQueue() {
    this.pendingAnnouncement = null;
    if (this.synth) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
    this.isUrgentSpeaking = false;
    this.stopVisualizer();
    this.updateStatusUI(this.isAnnouncementsEnabled && !this.isMuted ? 'Waiting' : 'Disabled');
  }

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
