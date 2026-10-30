/**
 * DRISVYA - Voice Assistance Engine
 * Uses Native Web Speech API (SpeechSynthesis) for English and Hindi audio output.
 * Fully interactive with speech rate presets, mute toggle, and repeat functionality.
 */

class VoiceAssistant {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.currentLanguage = localStorage.getItem('drisvya_lang') || 'en'; // 'en' or 'hi'
    this.isMuted = false;
    this.speechRate = parseFloat(localStorage.getItem('drisvya_speed')) || 1.0;
    this.speechPitch = 1.0;
    this.speechVolume = 1.0;
    this.lastAnnouncement = {
      en: "DRISVYA assistive vision platform is ready in standby. Tap Start Assistance to begin.",
      hi: "दृश्या विज़ुअल सहायता मंच स्टैंडबाय पर तैयार है। शुरू करने के लिए स्टार्ट सहायता पर टैप करें।"
    };
    this.availableVoices = [];
    this.isSpeaking = false;

    this.init();
  }

  init() {
    if (!this.synth) {
      console.warn('SpeechSynthesis is not supported on this browser.');
      this.updateStatusUI('Unsupported');
      return;
    }

    this.loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
  }

  loadVoices() {
    if (!this.synth) return;
    this.availableVoices = this.synth.getVoices() || [];
  }

  getBestVoice(langCode) {
    if (!this.availableVoices.length) return null;

    if (langCode === 'hi') {
      const hindiVoice = this.availableVoices.find(v => v.lang.startsWith('hi') || v.lang.includes('HI'));
      if (hindiVoice) return hindiVoice;
    }

    // Prefer Indian English or high quality generic English
    const indianEnglish = this.availableVoices.find(v => v.lang === 'en-IN');
    if (indianEnglish && langCode === 'en') return indianEnglish;

    const genericEnglish = this.availableVoices.find(v => v.lang.startsWith('en'));
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
    if (this.isMuted && this.synth) {
      this.synth.cancel();
      this.stopVisualizer();
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

  speak(text, options = {}) {
    if (!this.synth) return;

    // Announce to Screen Readers immediately
    this.announceToScreenReader(text);

    if (this.isMuted && !options.force) {
      return;
    }

    // Cancel active utterance before starting new one
    this.synth.cancel();

    // Store for repeat functionality
    this.lastAnnouncement[this.currentLanguage] = text;

    const utterance = new SpeechSynthesisUtterance(text);
    const targetLang = options.lang || (this.currentLanguage === 'hi' ? 'hi-IN' : 'en-US');
    utterance.lang = targetLang;
    utterance.rate = this.speechRate;
    utterance.pitch = this.speechPitch;
    utterance.volume = this.speechVolume;

    const voice = this.getBestVoice(this.currentLanguage);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.startVisualizer();
      this.updateStatusUI('Speaking');
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.stopVisualizer();
      this.updateStatusUI(this.isMuted ? 'Muted' : 'Ready');
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      this.stopVisualizer();
      this.updateStatusUI('Ready');
      console.warn('Speech error:', e);
    };

    try {
      this.synth.speak(utterance);
    } catch (err) {
      console.error('Speech synthesis execution failed:', err);
    }
  }

  repeatLast() {
    const textToRepeat = this.lastAnnouncement[this.currentLanguage];
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
    if (visualizer) {
      visualizer.classList.add('speaking');
    }
  }

  stopVisualizer() {
    const visualizer = document.getElementById('audioVisualizer');
    if (visualizer) {
      visualizer.classList.remove('speaking');
    }
  }

  updateStatusUI(statusText) {
    const statusEl = document.getElementById('voiceAssistantStatusText');
    if (statusEl) {
      statusEl.textContent = statusText;
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
