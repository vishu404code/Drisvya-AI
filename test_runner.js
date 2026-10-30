/**
 * DRISVYA Phase 3 - Comprehensive Verification & Audit Test Suite
 * Tests:
 * 1. Intelligent Voice Announcement System: SpeechSynthesis integration, voice loading,
 *    meaningful natural sentences, spatial positioning (Left/Centre/Right),
 *    English & Hindi language support, deduplication & cooldown, urgent obstacle preemption.
 * 2. Ultra-Wide Camera & Multi-Lens Controller: Device enumeration, rear camera detection,
 *    ultra-wide camera selection, hardware zoom (< 1.0), and honest status reporting when unavailable.
 * 3. Bluetooth Audio Output Route Detection & Test Voice features.
 */

const fs = require('fs');
const assert = require('assert');

console.log('=== DRISVYA PHASE 3 INTELLIGENT VOICE & ULTRA-WIDE CAMERA AUDIT SUITE ===\n');

// 1. FILE & MARKUP AUDIT
const html = fs.readFileSync('index.html', 'utf8');
const componentsCss = fs.readFileSync('css/components.css', 'utf8');
const a11yCss = fs.readFileSync('css/accessibility.css', 'utf8');

console.log('[TEST 1] Phase 3 HTML UI Elements & Buttons Audit');
assert(html.includes('id="btnTestVoice"'), 'Test Voice button missing in index.html');
assert(html.includes('id="voiceStatusBadge"'), 'Voice status badge missing in index.html');
assert(html.includes('id="audioRouteStatus"'), 'Audio route status missing in index.html');
assert(html.includes('id="cameraSelectContainer"'), 'Camera lens selector missing in index.html');
assert(html.includes('id="cameraSelectDropdown"'), 'Camera dropdown missing in index.html');
assert(html.includes('id="ultraWideAvailabilityNote"'), 'Ultra-wide availability note missing in index.html');
assert(html.includes('id="ultraWideStatusText"'), 'Ultra-wide status text missing in index.html');
console.log('  ✔ All Phase 3 UI elements verified in index.html');

console.log('[TEST 2] CSS Styling Audit for Voice & Lens Controls');
assert(componentsCss.includes('.btn-test-voice'), 'CSS missing .btn-test-voice');
assert(componentsCss.includes('.audio-route-pill'), 'CSS missing .audio-route-pill');
assert(componentsCss.includes('.lens-status-note'), 'CSS missing .lens-status-note');
assert(componentsCss.includes('.status-dot'), 'CSS missing .status-dot');
assert(a11yCss.includes('.lens-status-note'), 'High contrast CSS missing for lens note');
assert(a11yCss.includes('.audio-route-pill'), 'High contrast CSS missing for audio route pill');
console.log('  ✔ All Phase 3 CSS styles and high-contrast rules verified');

// 2. MOCK BROWSER ENVIRONMENT
global.window = global;

global.tf = {
  ready: () => Promise.resolve(),
  getBackend: () => 'webgl'
};

global.cocoSsd = {
  load: async () => ({
    detect: async () => [
      { bbox: [120, 80, 240, 500], class: 'person', score: 0.94 },
      { bbox: [30, 200, 160, 220], class: 'chair', score: 0.82 },
      { bbox: [950, 160, 80, 180], class: 'bottle', score: 0.89 }
    ]
  })
};

let spokenUtterances = [];
let speechCancelled = false;

global.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
    this.lang = 'en-US';
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
};

global.speechSynthesis = {
  speaking: false,
  paused: false,
  getVoices: () => [
    { lang: 'en-US', name: 'Google US English' },
    { lang: 'en-IN', name: 'Google Indian English' },
    { lang: 'hi-IN', name: 'Google हिन्दी' }
  ],
  speak: (utterance) => {
    spokenUtterances.push(utterance);
    global.speechSynthesis.speaking = true;
    if (utterance.onstart) utterance.onstart();
    global.speechSynthesis.speaking = false;
    if (utterance.onend) utterance.onend();
  },
  cancel: () => {
    speechCancelled = true;
    global.speechSynthesis.speaking = false;
  },
  resume: () => {
    global.speechSynthesis.paused = false;
  }
};
global.window.speechSynthesis = global.speechSynthesis;
global.window.SpeechSynthesisUtterance = global.SpeechSynthesisUtterance;

// Mock DOM elements
const domElements = new Map();
function getOrCreateMockElement(id) {
  if (!domElements.has(id)) {
    domElements.set(id, {
      id,
      textContent: '',
      innerHTML: '',
      style: {},
      clientWidth: 400,
      clientHeight: 300,
      width: 400,
      height: 300,
      videoWidth: 1280,
      videoHeight: 720,
      readyState: 4,
      options: [],
      classList: {
        items: new Set(),
        add(cls) { this.items.add(cls); },
        remove(cls) { this.items.delete(cls); },
        toggle(cls, force) { if (force !== undefined ? force : !this.items.has(cls)) this.items.add(cls); else this.items.delete(cls); return this.items.has(cls); },
        contains(cls) { return this.items.has(cls); }
      },
      setAttribute(name, val) { this[name] = val; },
      getAttribute(name) { return this[name]; },
      addEventListener() {},
      querySelector() { return null; },
      appendChild(child) {
        if (!this.options) this.options = [];
        this.options.push(child);
      },
      pause() {},
      play() { return Promise.resolve(); },
      getContext() {
        return {
          clearRect() {},
          strokeRect() {},
          fillRect() {},
          fillText() {},
          measureText() { return { width: 60 }; },
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
          fill() {},
          roundRect() {},
          save() {},
          restore() {},
          scale() {}
        };
      }
    });
  }
  return domElements.get(id);
}

global.document = {
  activeElement: null,
  body: {
    classList: {
      items: new Set(),
      add(cls) { this.items.add(cls); },
      remove(cls) { this.items.delete(cls); },
      toggle(cls, force) { if (force) this.items.add(cls); else this.items.delete(cls); return this.items.has(cls); },
      contains(cls) { return this.items.has(cls); }
    }
  },
  getElementById(id) {
    return getOrCreateMockElement(id);
  },
  createElement(tag) {
    return {
      tagName: tag,
      value: '',
      textContent: '',
      selected: false,
      innerHTML: '',
      style: {},
      classList: { add() {} }
    };
  },
  addEventListener() {}
};

let mockDevices = [
  { kind: 'videoinput', deviceId: 'cam_back_0', label: 'Back Camera 0 (Wide)' },
  { kind: 'videoinput', deviceId: 'cam_back_1', label: 'Back Camera 2 (Ultra-Wide 0.5x)' },
  { kind: 'videoinput', deviceId: 'cam_front', label: 'Front Camera' },
  { kind: 'audiooutput', deviceId: 'bt_headset', label: 'Bluetooth Wireless Headset' }
];

Object.defineProperty(global, 'navigator', {
  value: {
    onLine: true,
    vibrate() { return true; },
    mediaDevices: {
      getUserMedia: async (constraints) => {
        return {
          getTracks: () => [
            {
              stop() {},
              getCapabilities: () => ({ zoom: { min: 0.5, max: 8.0, step: 0.1 } }),
              applyConstraints: async () => {}
            }
          ],
          getVideoTracks: () => [
            {
              stop() {},
              getCapabilities: () => ({ zoom: { min: 0.5, max: 8.0, step: 0.1 } }),
              applyConstraints: async () => {}
            }
          ]
        };
      },
      enumerateDevices: async () => mockDevices
    }
  },
  configurable: true,
  writable: true
});

global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = val; },
  removeItem(key) { delete this.store[key]; }
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Load DRISVYA modules
require('./js/sound.js');
require('./js/voice.js');
require('./js/accessibility.js');
require('./js/ai.js');
require('./js/camera.js');

(async () => {
  // 3. TEST VOICE ASSISTANT INITIALIZATION & VOICES LOADING (Requirement A1, A2)
  console.log('[TEST 3] VoiceAssistant Initialization & Voice Loading');
  window.voiceAssistant.init();
  assert(window.voiceAssistant.synth !== null, 'SpeechSynthesis must be supported');
  assert(window.voiceAssistant.availableVoices.length >= 3, 'Must load voices from speechSynthesis');
  const enVoice = window.voiceAssistant.getBestVoice('en');
  const hiVoice = window.voiceAssistant.getBestVoice('hi');
  assert(enVoice && enVoice.lang.startsWith('en'), 'Must match English voice');
  assert(hiVoice && hiVoice.lang.startsWith('hi'), 'Must match Hindi voice');
  console.log(`  ✔ Voices loaded successfully: English (${enVoice.name}), Hindi (${hiVoice.name})`);

  // 4. TEST AUDIO UNLOCKING (Requirement A)
  console.log('[TEST 4] Audio Unlock Mechanism for Mobile Browsers');
  assert.strictEqual(window.voiceAssistant.isAudioUnlocked, false, 'Should be locked initially');
  window.voiceAssistant.unlockAudio();
  assert.strictEqual(window.voiceAssistant.isAudioUnlocked, true, 'Should be unlocked after user gesture');
  console.log('  ✔ Audio engine unlocked via user interaction');

  // 5. TEST VOICE TEST BUTTON (Requirement A14, C)
  console.log('[TEST 5] Test Voice Functionality');
  spokenUtterances = [];
  window.voiceAssistant.testVoice();
  assert(spokenUtterances.length > 0, 'Test voice must queue an utterance');
  assert(spokenUtterances[0].text.includes('test') || spokenUtterances[0].text.includes('टेस्ट'), 'Spoken text must be test sentence');
  console.log(`  ✔ Test Voice announcement verified: "${spokenUtterances[0].text}"`);

  // 6. TEST DIRECTIONAL ANNOUNCEMENTS FOR PERSON, CHAIR, BOTTLE (Testing Req 1, 2, 3, 4)
  console.log('[TEST 6] Natural Sentences for Person, Chair, and Bottle (Left, Centre, Right)');
  
  // Person in Centre
  spokenUtterances = [];
  window.voiceAssistant.lastAnnouncedTime = 0; // reset cooldown
  window.voiceAssistant.lastAnnouncedKey = '';
  const personDetections = [
    {
      bbox: [400, 100, 300, 500],
      class: 'person',
      spatial: { position: 'Centre' },
      proximity: { level: 'Medium' }
    }
  ];
  window.voiceAssistant.handleDetections(personDetections);
  assert.strictEqual(spokenUtterances.length, 1, 'Should speak person announcement');
  assert.strictEqual(spokenUtterances[0].text, 'Person detected in front.', 'Person sentence must match');
  console.log(`  ✔ Person announced: "${spokenUtterances[0].text}"`);

  // Chair on Left
  spokenUtterances = [];
  window.voiceAssistant.lastAnnouncedTime = 0; // reset cooldown
  window.voiceAssistant.lastAnnouncedKey = '';
  const chairDetections = [
    {
      bbox: [40, 200, 180, 250],
      class: 'chair',
      spatial: { position: 'Left' },
      proximity: { level: 'Medium' }
    }
  ];
  window.voiceAssistant.handleDetections(chairDetections);
  assert.strictEqual(spokenUtterances.length, 1, 'Should speak chair announcement');
  assert.strictEqual(spokenUtterances[0].text, 'Chair detected on your left.', 'Chair sentence must match');
  console.log(`  ✔ Chair announced: "${spokenUtterances[0].text}"`);

  // Bottle on Right
  spokenUtterances = [];
  window.voiceAssistant.lastAnnouncedTime = 0; // reset cooldown
  window.voiceAssistant.lastAnnouncedKey = '';
  const bottleDetections = [
    {
      bbox: [950, 150, 80, 200],
      class: 'bottle',
      spatial: { position: 'Right' },
      proximity: { level: 'Medium' }
    }
  ];
  window.voiceAssistant.handleDetections(bottleDetections);
  assert.strictEqual(spokenUtterances.length, 1, 'Should speak bottle announcement');
  assert.strictEqual(spokenUtterances[0].text, 'Bottle detected on your right.', 'Bottle sentence must match');
  console.log(`  ✔ Bottle announced: "${spokenUtterances[0].text}"`);

  // 7. TEST LANGUAGE SWITCHING TO HINDI (Testing Req 5)
  console.log('[TEST 7] Language Switching to Hindi & Natural Hindi Grammar');
  window.voiceAssistant.setLanguage('hi');
  assert.strictEqual(window.voiceAssistant.currentLanguage, 'hi', 'Language must be Hindi');
  
  spokenUtterances = [];
  window.voiceAssistant.lastAnnouncedTime = 0;
  window.voiceAssistant.lastAnnouncedKey = '';
  window.voiceAssistant.handleDetections(chairDetections);
  assert.strictEqual(spokenUtterances.length, 1, 'Should speak Hindi chair announcement');
  assert.strictEqual(spokenUtterances[0].text, 'बाईं ओर कुर्सी दिखाई दे रहा है।', 'Hindi sentence structure must be correct');
  console.log(`  ✔ Hindi announcement verified: "${spokenUtterances[0].text}"`);

  // Switch back to English for remaining tests
  window.voiceAssistant.setLanguage('en');

  // 8. TEST COOLDOWN & ANTI-REPETITION (Testing Req 7)
  console.log('[TEST 8] Anti-Repetitive Cooldown & Deduplication');
  spokenUtterances = [];
  window.voiceAssistant.lastAnnouncedTime = 0;
  window.voiceAssistant.lastAnnouncedKey = '';
  
  // First detection speaks
  window.voiceAssistant.handleDetections(personDetections);
  assert.strictEqual(spokenUtterances.length, 1, 'First detection must speak');

  // Immediate second detection with same entity within cooldown must NOT speak
  window.voiceAssistant.handleDetections(personDetections);
  assert.strictEqual(spokenUtterances.length, 1, 'Duplicate detection in cooldown must be suppressed');
  console.log('  ✔ Repeated identical announcements successfully throttled');

  // 9. TEST URGENT OBSTACLE WARNING & PREEMPTION (Testing Req 8)
  console.log('[TEST 9] Urgent Obstacle Warning & Priority Preemption');
  speechCancelled = false;
  spokenUtterances = [];
  window.voiceAssistant.synth.speaking = true; // Simulate ordinary message is currently playing

  const urgentObstacle = [
    {
      bbox: [350, 50, 600, 650], // Huge bbox area right in centre
      class: 'person',
      spatial: { position: 'Centre' },
      proximity: { level: 'Close' }
    }
  ];

  window.voiceAssistant.handleDetections(urgentObstacle);
  assert.strictEqual(speechCancelled, true, 'Urgent obstacle must preempt ongoing low-priority announcement');
  assert(spokenUtterances.some(u => u.text === 'Warning! Person is very close ahead.'), 'Urgent warning sentence must be spoken');

  // Test that normal detection CANNOT interrupt active urgent warning
  window.voiceAssistant.isUrgentSpeaking = true;
  spokenUtterances = [];
  window.voiceAssistant.lastAnnouncedTime = 0;
  window.voiceAssistant.speak('A bottle is on your right.', { priority: 'normal' });
  assert.strictEqual(spokenUtterances.length, 0, 'Normal speech must NOT interrupt active urgent warning');

  // Reset urgent state
  window.voiceAssistant.isUrgentSpeaking = false;
  console.log('  ✔ Urgent obstacle warning successfully preempted speech and blocked lower-priority interrupts');

  // 10. TEST BLUETOOTH AUDIO ROUTING INSPECTION (Testing Req 6)
  console.log('[TEST 10] Audio Routing & Bluetooth Headset Detection');
  await window.voiceAssistant.checkAudioOutputDevices();
  assert(window.voiceAssistant.audioRoute.includes('Bluetooth'), 'Should detect Bluetooth headset when present in audio outputs');
  const routeEl = document.getElementById('audioRouteStatus');
  assert(routeEl.textContent.includes('Bluetooth'), 'UI should display Bluetooth headset connection status');
  console.log(`  ✔ Bluetooth audio route detected & displayed: "${routeEl.textContent}"`);

  // 11. TEST MULTI-CAMERA & ULTRA-WIDE DISCOVERY (Testing Req 9, 10, 11)
  console.log('[TEST 11] Camera Device Inspection, Ultra-Wide Selection & Honest Status');
  window.cameraController.init();
  await window.cameraController.discoverCameraDevices();
  assert(window.cameraController.availableDevices.length >= 2, 'Must discover video input devices');

  const selectEl = document.getElementById('cameraSelectDropdown');
  assert(selectEl.options.length >= 2, 'Dropdown must be populated with discovered camera devices');
  const hasUltraWideOption = selectEl.options.some(o => o.textContent.includes('Ultra-Wide'));
  assert(hasUltraWideOption, 'Must detect Ultra-Wide Camera (0.5x) from mock device list');
  console.log('  ✔ Ultra-wide camera correctly identified in dropdown options');

  // Test honest reporting when ultra-wide is NOT exposed by device
  mockDevices = [
    { kind: 'videoinput', deviceId: 'cam_back_single', label: 'Rear Camera' }
  ];
  window.cameraController.activeTrack = null;
  window.cameraController.isActive = true;
  await window.cameraController.discoverCameraDevices();
  const statusNote = document.getElementById('ultraWideStatusText');
  assert(statusNote.textContent.includes('Ultra-wide lens is not exposed'), 'Must honestly report when ultra-wide lens is unavailable');
  console.log(`  ✔ Honest lens status reported when ultra-wide unavailable: "${statusNote.textContent}"`);

  // 12. TEST CAMERA START & OBJECT DETECTION HOOK
  console.log('[TEST 12] Camera Detection Loop Hooks Directly into VoiceAssistant');
  let voiceHandledCalled = false;
  window.voiceAssistant.handleDetections = (preds) => {
    voiceHandledCalled = true;
    assert.strictEqual(preds.length, 2, 'Predictions array forwarded intact');
  };

  const samplePreds = [
    { bbox: [100, 100, 200, 200], class: 'person', spatial: { position: 'Centre' }, proximity: { level: 'Medium' } },
    { bbox: [500, 100, 100, 100], class: 'chair', spatial: { position: 'Right' }, proximity: { level: 'Medium' } }
  ];
  window.cameraController.processDetectionResults(samplePreds);
  assert.strictEqual(voiceHandledCalled, true, 'processDetectionResults must invoke voiceAssistant.handleDetections');
  console.log('  ✔ Detection results forwarded seamlessly to voice engine');

  // 13. TEST SPATIAL POSITION & DETECTIONS WITH LITE MODEL
  console.log('[TEST 13] Spatial Position Left/Centre/Right Calculations & AI Engine Detection');
  const leftSpatial = window.aiEngine.calculateSpatialPosition([50, 50, 100, 100], 1280);
  assert.strictEqual(leftSpatial.position, 'Left');
  assert.strictEqual(leftSpatial.positionHi, 'बाईं ओर');
  const centreSpatial = window.aiEngine.calculateSpatialPosition([540, 50, 200, 200], 1280);
  assert.strictEqual(centreSpatial.position, 'Centre');
  assert.strictEqual(centreSpatial.positionHi, 'सामने');
  const rightSpatial = window.aiEngine.calculateSpatialPosition([1000, 50, 200, 200], 1280);
  assert.strictEqual(rightSpatial.position, 'Right');
  assert.strictEqual(rightSpatial.positionHi, 'दाईं ओर');
  console.log('  ✔ Spatial calculations for Left, Centre, and Right verified');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE 3 VERIFICATION SUITES PASSED WITH 0 ERRORS');
  console.log('================================================================');
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
