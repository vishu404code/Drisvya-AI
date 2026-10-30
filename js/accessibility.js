/**
 * DRISVYA - Accessibility Manager
 * Controls High Contrast, Large Text, Voice Alerts, and Haptic Vibration.
 * Persists user preferences seamlessly in localStorage.
 */

class AccessibilityManager {
  constructor() {
    this.preferences = {
      highContrast: false,
      largeText: false,
      voiceAlerts: true,
      vibration: true,
      soundCues: true
    };

    this.STORAGE_KEY = 'drisvya_a11y_prefs';
  }

  init() {
    this.loadPreferences();
    this.applyPreferences();
    this.bindEvents();
  }

  loadPreferences() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        this.preferences = { ...this.preferences, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Unable to load a11y preferences:', e);
    }
  }

  savePreferences() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.preferences));
    } catch (e) {
      console.warn('Unable to save a11y preferences:', e);
    }
  }

  applyPreferences() {
    // 1. High Contrast
    if (this.preferences.highContrast) {
      document.body.classList.add('high-contrast-mode');
    } else {
      document.body.classList.remove('high-contrast-mode');
    }
    this.updateToggleUI('toggleHighContrast', this.preferences.highContrast);

    // 2. Large Text
    if (this.preferences.largeText) {
      document.body.classList.add('large-text-mode');
    } else {
      document.body.classList.remove('large-text-mode');
    }
    this.updateToggleUI('toggleLargeText', this.preferences.largeText);

    // 3. Voice Alerts
    this.updateToggleUI('toggleVoiceAlerts', this.preferences.voiceAlerts);
    if (window.voiceAssistant) {
      window.voiceAssistant.setMute(!this.preferences.voiceAlerts);
    }

    // 4. Vibration
    this.updateToggleUI('toggleVibration', this.preferences.vibration);

    // Sound Cues
    if (window.soundEngine) {
      window.soundEngine.setEnabled(this.preferences.soundCues);
    }
  }

  updateToggleUI(elementId, isActive) {
    const el = document.getElementById(elementId);
    if (el) {
      el.classList.toggle('active', !!isActive);
      el.setAttribute('aria-checked', isActive ? 'true' : 'false');
    }
  }

  toggleHighContrast() {
    this.preferences.highContrast = !this.preferences.highContrast;
    this.savePreferences();
    this.applyPreferences();
    this.vibrate(30);

    const message = this.preferences.highContrast 
      ? 'High contrast mode enabled.' 
      : 'High contrast mode disabled.';
    if (window.voiceAssistant && this.preferences.voiceAlerts) {
      window.voiceAssistant.announceToScreenReader(message);
    }
    if (window.app) {
      window.app.logActivity(message, "system");
    }
    return this.preferences.highContrast;
  }

  toggleLargeText() {
    this.preferences.largeText = !this.preferences.largeText;
    this.savePreferences();
    this.applyPreferences();
    this.vibrate(30);

    const message = this.preferences.largeText 
      ? 'Large text mode enabled.' 
      : 'Large text mode disabled.';
    if (window.voiceAssistant && this.preferences.voiceAlerts) {
      window.voiceAssistant.announceToScreenReader(message);
    }
    if (window.app) {
      window.app.logActivity(message, "system");
    }
    return this.preferences.largeText;
  }

  toggleVoiceAlerts() {
    this.preferences.voiceAlerts = !this.preferences.voiceAlerts;
    this.savePreferences();
    this.applyPreferences();
    this.vibrate(30);

    const message = this.preferences.voiceAlerts 
      ? 'Voice alerts enabled.' 
      : 'Voice alerts muted.';
    if (window.voiceAssistant) {
      window.voiceAssistant.announceToScreenReader(message);
    }
    if (window.app) {
      window.app.logActivity(message, "voice");
    }
    return this.preferences.voiceAlerts;
  }

  toggleVibration() {
    this.preferences.vibration = !this.preferences.vibration;
    this.savePreferences();
    this.applyPreferences();
    if (this.preferences.vibration) {
      this.vibrate([40, 60, 40]);
    }

    const message = this.preferences.vibration 
      ? 'Haptic vibration feedback enabled.' 
      : 'Haptic vibration feedback disabled.';
    if (window.voiceAssistant && this.preferences.voiceAlerts) {
      window.voiceAssistant.announceToScreenReader(message);
    }
    if (window.app) {
      window.app.logActivity(message, "system");
    }
    return this.preferences.vibration;
  }

  setSoundCues(enabled) {
    this.preferences.soundCues = !!enabled;
    if (window.soundEngine) {
      window.soundEngine.setEnabled(this.preferences.soundCues);
    }
    this.savePreferences();
  }

  vibrate(pattern = 30) {
    if (this.preferences.vibration && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Safe ignore
      }
    }
  }

  bindEvents() {
    const bindToggle = (id, handler) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', () => handler());
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handler();
          }
        });
      }
    };

    bindToggle('toggleHighContrast', () => this.toggleHighContrast());
    bindToggle('toggleLargeText', () => this.toggleLargeText());
    bindToggle('toggleVoiceAlerts', () => this.toggleVoiceAlerts());
    bindToggle('toggleVibration', () => this.toggleVibration());
  }
}

window.a11yManager = new AccessibilityManager();
