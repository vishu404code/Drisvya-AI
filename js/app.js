/**
 * DRISVYA - Main Application Controller
 * Brand: DRISVYA · Tagline: Your World, Understood.
 * Category: AI-Powered Assistive Vision Platform
 * Phase 1: Frontend Foundation & Android-Optimized UI Orchestration
 */

class DrisvyaApp {
  constructor() {
    this.modalEl = null;
    this.historyListEl = null;
    this.emptyStateEl = null;
    this.activities = [];
    this.lastFocusedElement = null;
  }

  init() {
    this.modalEl = document.getElementById('settingsModal');
    this.historyListEl = document.getElementById('detectionHistoryList');
    this.emptyStateEl = document.getElementById('historyEmptyState');

    // Initialize sub-modules
    if (window.soundEngine) window.soundEngine.init();
    if (window.a11yManager) window.a11yManager.init();
    if (window.cameraController) window.cameraController.init();

    this.bindHeaderControls();
    this.bindVoiceAssistantControls();
    this.bindSettingsModal();
    this.bindKeyboardShortcuts();
    this.initNetworkStatus();
    this.bindHeroActions();
    this.bindStickyMobileBar();

    // Initial greeting in activity log
    this.logActivity("DRISVYA Assistive Platform initialized. Ready to assist.", "system");
  }

  // Header Status & Settings Button
  bindHeaderControls() {
    const btnOpenSettings = document.getElementById('btnOpenSettings');
    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', () => this.openSettings());
    }
  }

  // Network Status Monitor (Online/Offline)
  initNetworkStatus() {
    const statusPill = document.getElementById('systemStatusPill');
    const statusText = document.getElementById('systemStatusText');

    const updateOnlineStatus = () => {
      const isOnline = navigator.onLine;
      if (statusPill && statusText) {
        if (isOnline) {
          statusPill.classList.remove('offline');
          statusText.textContent = "Online • Ready";
          statusPill.setAttribute('aria-label', 'System status: Online and ready');
        } else {
          statusPill.classList.add('offline');
          statusText.textContent = "Offline Mode";
          statusPill.setAttribute('aria-label', 'System status: Offline mode');
        }
      }
      this.logActivity(isOnline ? "Network connection active." : "Device is offline. Local assistive tools remain active.", "network");
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
  }

  // Hero Section "Listen to Overview" Button
  bindHeroActions() {
    const btnListenOverview = document.getElementById('btnListenOverview');
    if (btnListenOverview) {
      btnListenOverview.addEventListener('click', () => {
        const isHi = window.voiceAssistant && window.voiceAssistant.currentLanguage === 'hi';
        const text = isHi
          ? "दृश्या में आपका स्वागत है। योर वर्ल्ड, अंडरस्टूड। यह दृष्टिबाधित लोगों के लिए मोबाइल विज़ुअल सहायता मंच है। शुरू करने के लिए स्टार्ट सहायता बटन दबाएं।"
          : "Welcome to DRISVYA. Your World, Understood. An AI-powered assistive vision platform designed for greater independence. Tap Start Assistance or press spacebar to begin.";
        if (window.voiceAssistant) {
          window.voiceAssistant.speak(text, { force: true });
        }
        this.logActivity("Overview spoken by DRISVYA voice assistant.", "voice");
      });
    }
  }

  // Voice Assistant Controls (Language, Speed, Mute, Repeat)
  bindVoiceAssistantControls() {
    const btnLangEn = document.getElementById('btnLangEn');
    const btnLangHi = document.getElementById('btnLangHi');
    const btnMuteVoice = document.getElementById('btnMuteVoice');
    const btnRepeatVoice = document.getElementById('btnRepeatVoice');

    // Speed Preset Buttons
    const speedSlow = document.getElementById('speedSlow');
    const speedNormal = document.getElementById('speedNormal');
    const speedFast = document.getElementById('speedFast');

    // Restore active language button from saved preference
    const savedLang = localStorage.getItem('drisvya_lang') || 'en';
    if (savedLang === 'hi' && btnLangHi && btnLangEn) {
      btnLangHi.classList.add('active');
      btnLangEn.classList.remove('active');
    }

    if (btnLangEn && btnLangHi) {
      btnLangEn.addEventListener('click', () => {
        btnLangEn.classList.add('active');
        btnLangHi.classList.remove('active');
        btnLangEn.setAttribute('aria-pressed', 'true');
        btnLangHi.setAttribute('aria-pressed', 'false');
        if (window.voiceAssistant) {
          window.voiceAssistant.setLanguage('en');
        }
        if (window.soundEngine) window.soundEngine.playToggle(true);
        this.logActivity("Language set to English (en-US / en-IN).", "voice");
      });

      btnLangHi.addEventListener('click', () => {
        btnLangHi.classList.add('active');
        btnLangEn.classList.remove('active');
        btnLangHi.setAttribute('aria-pressed', 'true');
        btnLangEn.setAttribute('aria-pressed', 'false');
        if (window.voiceAssistant) {
          window.voiceAssistant.setLanguage('hi');
        }
        if (window.soundEngine) window.soundEngine.playToggle(true);
        this.logActivity("भाषा हिन्दी में सेट की गई (Language set to Hindi).", "voice");
      });
    }

    // Speed presets
    const setSpeedUI = (speedVal, targetBtn) => {
      [speedSlow, speedNormal, speedFast].forEach(b => {
        if (b) {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        }
      });
      if (targetBtn) {
        targetBtn.classList.add('active');
        targetBtn.setAttribute('aria-pressed', 'true');
      }
      if (window.voiceAssistant) {
        window.voiceAssistant.setSpeechRate(speedVal);
      }
      this.logActivity(`Speech rate set to ${speedVal}x.`, "voice");
    };

    if (speedSlow) speedSlow.addEventListener('click', () => setSpeedUI(0.85, speedSlow));
    if (speedNormal) speedNormal.addEventListener('click', () => setSpeedUI(1.0, speedNormal));
    if (speedFast) speedFast.addEventListener('click', () => setSpeedUI(1.25, speedFast));

    // Mute Button
    if (btnMuteVoice) {
      btnMuteVoice.addEventListener('click', () => {
        if (!window.voiceAssistant) return;
        const isMuted = window.voiceAssistant.toggleMute();
        btnMuteVoice.classList.toggle('muted', isMuted);
        btnMuteVoice.setAttribute('aria-pressed', isMuted ? 'true' : 'false');

        const muteLabel = btnMuteVoice.querySelector('.btn-mute-text');
        if (muteLabel) {
          muteLabel.textContent = isMuted ? "Unmute Voice" : "Mute Voice";
        }

        if (window.soundEngine) window.soundEngine.playToggle(!isMuted);
        this.logActivity(isMuted ? "Voice engine muted." : "Voice engine unmuted.", "voice");
      });
    }

    // Repeat Announcement
    if (btnRepeatVoice) {
      btnRepeatVoice.addEventListener('click', () => {
        if (window.voiceAssistant) {
          const text = window.voiceAssistant.repeatLast();
          this.logActivity(`Repeated audio: "${text}"`, "voice");
        }
        if (window.a11yManager) window.a11yManager.vibrate(30);
      });
    }

    // Clear Detection History Button
    const btnClearHistory = document.getElementById('btnClearHistory');
    if (btnClearHistory) {
      btnClearHistory.addEventListener('click', () => this.clearHistory());
    }
  }

  // Sticky Mobile Action Bar
  bindStickyMobileBar() {
    const btnStickyRepeat = document.getElementById('btnStickyRepeat');
    if (btnStickyRepeat) {
      btnStickyRepeat.addEventListener('click', () => {
        if (window.voiceAssistant) {
          window.voiceAssistant.repeatLast();
        }
        if (window.a11yManager) window.a11yManager.vibrate(30);
      });
    }
  }

  // Detection History & Activity Timeline
  logActivity(text, type = 'system') {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const item = { text, type, timestamp, id: Date.now() + Math.random() };
    this.activities.unshift(item);

    if (this.activities.length > 25) {
      this.activities.pop();
    }

    this.renderHistoryList();
  }

  renderHistoryList() {
    if (!this.historyListEl || !this.emptyStateEl) return;

    // When assistance is active and objects are detected, let cameraController manage live objects view
    if (window.cameraController && window.cameraController.isActive && window.cameraController.currentPredictions.length > 0) {
      return;
    }

    if (this.activities.length === 0) {
      this.historyListEl.innerHTML = '';
      this.emptyStateEl.style.display = 'flex';
      return;
    }

    this.emptyStateEl.style.display = 'none';
    this.historyListEl.innerHTML = '';

    const iconMap = {
      camera: '<svg viewBox="0 0 24 24"><path d="M12 9a3.75 3.75 0 100 7.5 3.75 3.75 0 000-7.5z"/><path fill-rule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71a48.89 48.89 0 015.081.768c1.378.208 2.38 1.41 2.38 2.802v8.692c0 1.392-1.002 2.594-2.38 2.802a48.88 48.88 0 01-16.02 0c-1.378-.208-2.38-1.41-2.38-2.802V10.06c0-1.392 1.002-2.594 2.38-2.802 1.688-.255 3.385-.514 5.081-.768.465-.067.87-.327 1.11-.71l.822-1.317a3.003 3.003 0 012.332-1.39z"/></svg>',
      voice: '<svg viewBox="0 0 24 24"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.5A2.25 2.25 0 002.25 9.75v4.5A2.25 2.25 0 004.5 16.5h1.94l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06zM18.53 7.47a.75.75 0 00-1.06 1.06 5.25 5.25 0 010 7.42.75.75 0 101.06 1.06 6.75 6.75 0 000-9.54z"/></svg>',
      alert: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"/></svg>',
      network: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z"/></svg>',
      system: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.74-5.25z"/></svg>'
    };

    this.activities.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <div class="history-item-icon">${iconMap[item.type] || iconMap.system}</div>
        <div class="history-item-content">
          <span class="history-item-title">${this.escapeHTML(item.text)}</span>
          <span class="history-item-meta">${item.timestamp}</span>
        </div>
      `;
      this.historyListEl.appendChild(li);
    });
  }

  clearHistory() {
    this.activities = [];
    this.renderHistoryList();
    if (window.soundEngine) window.soundEngine.playToggle(false);
  }

  escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // Settings Modal / Dialog Management
  bindSettingsModal() {
    const btnClose = document.getElementById('btnCloseSettings');
    const rangeSpeechRate = document.getElementById('rangeSpeechRate');
    const valSpeechRate = document.getElementById('valSpeechRate');
    const toggleSoundCues = document.getElementById('toggleSoundCues');
    const btnResetSettings = document.getElementById('btnResetSettings');

    if (btnClose) {
      btnClose.addEventListener('click', () => this.closeSettings());
    }

    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.closeSettings();
        }
      });
    }

    if (rangeSpeechRate && valSpeechRate) {
      rangeSpeechRate.addEventListener('input', (e) => {
        const rate = parseFloat(e.target.value);
        valSpeechRate.textContent = `${rate.toFixed(1)}x`;
        if (window.voiceAssistant) {
          window.voiceAssistant.setSpeechRate(rate);
        }
      });
    }

    if (toggleSoundCues) {
      toggleSoundCues.addEventListener('change', (e) => {
        if (window.a11yManager) {
          window.a11yManager.setSoundCues(e.target.checked);
        }
      });
    }

    if (btnResetSettings) {
      btnResetSettings.addEventListener('click', () => {
        try {
          localStorage.removeItem('drisvya_a11y_prefs');
          localStorage.removeItem('drisvya_lang');
          localStorage.removeItem('drisvya_speed');
        } catch (e) {}

        if (window.a11yManager) {
          window.a11yManager.preferences = {
            highContrast: false,
            largeText: false,
            voiceAlerts: true,
            vibration: true,
            soundCues: true
          };
          window.a11yManager.applyPreferences();
        }
        if (rangeSpeechRate && valSpeechRate) {
          rangeSpeechRate.value = 1.0;
          valSpeechRate.textContent = "1.0x";
          if (window.voiceAssistant) {
            window.voiceAssistant.setSpeechRate(1.0);
          }
        }
        this.logActivity("All settings reset to defaults.", "system");
        this.closeSettings();
      });
    }
  }

  openSettings() {
    if (!this.modalEl) return;
    this.lastFocusedElement = document.activeElement;
    this.modalEl.classList.add('open');
    this.modalEl.setAttribute('aria-hidden', 'false');

    const firstInteractive = this.modalEl.querySelector('button, input, select');
    if (firstInteractive) {
      setTimeout(() => firstInteractive.focus(), 50);
    }

    if (window.soundEngine) window.soundEngine.playToggle(true);
  }

  closeSettings() {
    if (!this.modalEl) return;
    this.modalEl.classList.remove('open');
    this.modalEl.setAttribute('aria-hidden', 'true');

    if (this.lastFocusedElement) {
      this.lastFocusedElement.focus();
    }
  }

  // Accessible Keyboard Shortcuts
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
        if (e.key === 'Escape') {
          this.closeSettings();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (this.modalEl && this.modalEl.classList.contains('open')) {
          this.closeSettings();
        }
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (window.cameraController) {
          window.cameraController.toggleAssistance();
        }
      }

      if (e.key === 'm' || e.key === 'M') {
        const btnMute = document.getElementById('btnMuteVoice');
        if (btnMute) btnMute.click();
      }

      if (e.key === 'r' || e.key === 'R') {
        const btnRepeat = document.getElementById('btnRepeatVoice');
        if (btnRepeat) btnRepeat.click();
      }

      if (e.key === 'h' || e.key === 'H') {
        if (window.a11yManager) {
          window.a11yManager.toggleHighContrast();
        }
      }

      if (e.key === 'l' || e.key === 'L') {
        if (window.a11yManager) {
          window.a11yManager.toggleLargeText();
        }
      }

      if (e.key === 's' || e.key === 'S') {
        if (this.modalEl && !this.modalEl.classList.contains('open')) {
          this.openSettings();
        }
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new DrisvyaApp();
  window.app.init();
});
