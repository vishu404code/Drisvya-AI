/**
 * DRISVYA - Intelligent Voice Announcement Engine (Phase 3)
 * Full integration with SpeechSynthesis API for Android smartphones & Bluetooth audio.
 * Features:
 * - Natural language sentences for obstacles ("Person detected in front", "Chair on your left", etc.)
 * - English and Hindi voice selection with dialect matching
 * - Urgent warning priority system (preempts normal announcements; cannot be interrupted by low priority)
 * - Anti-repetitive cooldown & deduplication system
 * - Audio unlocker on user interaction (resolves Android mobile autoplay restrictions)
 * - Persistent utterance reference to prevent Chromium garbage collection freeze
 * - Bluetooth audio headset compatibility and status tracking
 */

const COCO_CLASS_DICTIONARY = {
  person: { en: 'Person', hi: 'व्यक्ति' },
  chair: { en: 'Chair', hi: 'कुर्सी' },
  bottle: { en: 'Bottle', hi: 'बोतल' },
  cup: { en: 'Cup', hi: 'कप' },
  'dining table': { en: 'Table', hi: 'मेज' },
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
    this.speechRate = (typeof localStorage !== 'undefined' && parseFloat(localStorage.getItem('drisvya_speed'))) || 1.0;
    this.speechPitch = 1.0;
    this.speechVolume = 1.0;

    // Cooldown & deduplication state
    this.lastAnnouncement = {
      en: "DRISVYA assistive vision platform is ready in standby. Tap Start Assistance to begin.",
      hi: "दृश्या विज़ुअल सहायता मंच स्टैंडबाय पर तैयार है। शुरू करने के लिए स्टार्ट सहायता पर टैप करें।"
    };
    this.lastAnnouncedKey = '';
    this.lastAnnouncedTime = 0;
    this.cooldownInterval = 2500; // 2.5s configurable cooldown between standard announcements
    this.recentDetections = new Map(); // key -> { time, position, proximity }

    // Priority management
    this.isUrgentSpeaking = false;
    this.isSpeaking = false;
    this.activeUtterance = null; // Prevents Chromium garbage collection bug on Android

    // Audio unlock state
    this.isAudioUnlocked = false;

    // Bluetooth & system audio routing status
    this.audioRoute = 'System Audio Output';

    this.availableVoices = [];
    this.init();
  }

  init() {
    if (!this.synth) {
      console.warn('[DRISVYA Voice] SpeechSynthesis is not supported on this browser.');
      this.updateStatusUI('Unavailable');
      return;
    }

    this.loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }

    // Inspect audio output devices for Bluetooth headsets
    this.checkAudioOutputDevices();
    this.updateStatusUI('Ready');
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
        d.label.toLowerCase().includes('bluetooth') || 
        d.label.toLowerCase().includes('wireless') || 
        d.label.toLowerCase().includes('headset') ||
        d.label.toLowerCase().includes('earbuds')
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
      // Safe fallback
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
      // Find Hindi voice
      const hindi = this.availableVoices.find(v => 
        v.lang.toLowerCase().replace('_', '-').startsWith('hi') || 
        v.name.toLowerCase().includes('hindi')
      );
      if (hindi) return hindi;
    }

    // For English: Prefer Indian English (natural for bilingual context) or clean US/UK
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
      this.speak(feedback, { force: true, priority: 'normal' });
      return true;
    }
    return false;
  }

  setMute(mute) {
    this.isMuted = !!mute;
    if (this.isMuted && this.synth) {
      this.synth.cancel();
      this.stopVisualizer();
      this.isUrgentSpeaking = false;
      this.isSpeaking = false;
    }
    this.updateStatusUI(this.isMuted ? 'Muted' : 'Ready');
  }

  toggleMute() {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  setSpeechRate(rate) {
    this.speechRate = Math.max(0.6, Math.min(2.0, parseFloat(rate)));
    try {
      localStorage.setItem('drisvya_speed', String(this.speechRate));
    } catch (e) {}
  }

  /**
   * Speak announcement with priority management & Android Chromium stability
   * @param {string} text - The sentence to speak
   * @param {object} options - { priority: 'urgent'|'normal', force: boolean, lang: string }
   */
  speak(text, options = {}) {
    if (!this.synth) return;
    this.unlockAudio();

    const priority = options.priority || 'normal';

    // Rule: Ordinary detections CANNOT interrupt active urgent warnings
    if (this.isUrgentSpeaking && priority !== 'urgent') {
      return;
    }

    // Announce to Screen Readers immediately via ARIA live region
    this.announceToScreenReader(text);

    if (this.isMuted && !options.force) {
      return;
    }

    // If urgent warning arrives while ordinary message is playing, interrupt immediately
    if (priority === 'urgent' && this.synth.speaking) {
      this.synth.cancel();
    } else if (this.synth.speaking && priority !== 'urgent') {
      // Don't pile up speech if already speaking normal message
      return;
    }

    // Store for repeat functionality
    this.lastAnnouncement[this.currentLanguage] = text;

    const utterance = new SpeechSynthesisUtterance(text);
    this.activeUtterance = utterance; // Keep reference to prevent GC freeze on Chrome

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

    utterance.onend = () => {
      this.isSpeaking = false;
      this.isUrgentSpeaking = false;
      this.activeUtterance = null;
      this.stopVisualizer();
      this.updateStatusUI(this.isMuted ? 'Muted' : 'Ready');
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      this.isUrgentSpeaking = false;
      this.activeUtterance = null;
      this.stopVisualizer();
      this.updateStatusUI(this.isMuted ? 'Muted' : 'Ready');
      console.warn('[DRISVYA Voice] Speech error:', e);
    };

    try {
      // On Android Chrome, resume before speak ensures queue isn't paused
      if (this.synth.paused) {
        this.synth.resume();
      }
      this.synth.speak(utterance);
    } catch (err) {
      console.error('[DRISVYA Voice] Speech call failed:', err);
      this.isSpeaking = false;
      this.isUrgentSpeaking = false;
    }
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

  /**
   * Process live detection predictions and decide intelligent announcements
   * Handles:
   * - Urgent close-range obstacle warnings (highest priority)
   * - Natural sentences with Left/Centre/Right
   * - Deduplication & cooldowns
   */
  handleDetections(predictions = []) {
    if (!predictions || !predictions.length || this.isMuted) return;
    const now = Date.now();

    // 1. Check for URGENT WARNINGS first
    // An object that is very close (large bounding box) in the Centre or immediately in front
    const urgentCandidate = predictions.find(p => {
      const isClose = p.proximity && p.proximity.level === 'Close';
      const isCentre = p.spatial && p.spatial.position === 'Centre';
      return isClose && isCentre;
    });

    if (urgentCandidate) {
      // Urgent warning condition!
      const urgentKey = `urgent_${urgentCandidate.class}`;
      // Throttle urgent warning to once every 3.5s so user can hear and react
      if (now - this.lastAnnouncedTime > 3500 || this.lastAnnouncedKey !== urgentKey) {
        this.lastAnnouncedTime = now;
        this.lastAnnouncedKey = urgentKey;

        const friendlyName = this.getFriendlyName(urgentCandidate.class, this.currentLanguage);
        const urgentSentence = this.formatUrgentSentence(friendlyName, this.currentLanguage);

        // Speak with urgent priority
        this.speak(urgentSentence, { priority: 'urgent' });

        if (window.soundEngine) window.soundEngine.playAlert();
        if (window.a11yManager) window.a11yManager.vibrate([100, 50, 100]);
        if (window.app) window.app.logActivity(urgentSentence, "alert");
        return;
      }
    }

    // 2. Normal Announcements (Subject to cooldown & deduplication)
    if (now - this.lastAnnouncedTime < this.cooldownInterval) {
      return; // Still in cooldown
    }

    // Prioritize largest object in view
    const sorted = [...predictions].sort((a, b) => (b.bbox[2] * b.bbox[3]) - (a.bbox[2] * a.bbox[3]));
    const primary = sorted[0];

    const pos = primary.spatial ? primary.spatial.position : 'Centre';
    const objectKey = `${primary.class}_${pos}`;

    // Deduplication: Avoid repeating exact same object and position unless 5 seconds have passed
    if (this.lastAnnouncedKey === objectKey && now - this.lastAnnouncedTime < 5000) {
      return;
    }

    this.lastAnnouncedKey = objectKey;
    this.lastAnnouncedTime = now;

    const friendlyName = this.getFriendlyName(primary.class, this.currentLanguage);
    const sentence = this.formatPositionSentence(friendlyName, pos, this.currentLanguage);

    this.speak(sentence, { priority: 'normal' });

    if (pos === 'Centre' && window.a11yManager) {
      window.a11yManager.vibrate(40);
    }
  }

  getFriendlyName(rawClass, lang) {
    if (COCO_CLASS_DICTIONARY[rawClass]) {
      return COCO_CLASS_DICTIONARY[rawClass][lang];
    }
    // Fallback: capitalize
    return rawClass.charAt(0).toUpperCase() + rawClass.slice(1).replace('_', ' ');
  }

  formatPositionSentence(name, position, lang) {
    if (lang === 'hi') {
      if (position === 'Left') {
        return `बाईं ओर ${name} दिखाई दे रहा है।`;
      } else if (position === 'Right') {
        return `दाईं ओर ${name} दिखाई दे रहा है।`;
      } else {
        return `सामने ${name} दिखाई दे रहा है।`;
      }
    } else {
      if (position === 'Left') {
        return `${name} detected on your left.`;
      } else if (position === 'Right') {
        return `${name} detected on your right.`;
      } else {
        return `${name} detected in front.`;
      }
    }
  }

  formatUrgentSentence(name, lang) {
    if (lang === 'hi') {
      return `चेतावनी! सामने बहुत करीब ${name} है।`;
    } else {
      return `Warning! ${name} is very close ahead.`;
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
        badgeEl.style.background = 'var(--accent-cyan)';
        badgeEl.style.boxShadow = '0 0 10px var(--accent-cyan)';
      } else if (statusText === 'Ready') {
        badgeEl.style.background = 'var(--status-online)';
        badgeEl.style.boxShadow = '0 0 8px var(--status-online)';
      } else if (statusText === 'Muted') {
        badgeEl.style.background = 'var(--status-warning)';
        badgeEl.style.boxShadow = 'none';
      } else {
        badgeEl.style.background = 'var(--status-danger)';
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
