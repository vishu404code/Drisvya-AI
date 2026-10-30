/**
 * DRISVYA - Comprehensive Verification & Audit Test Suite
 * Tests the Intelligent Object Announcement System:
 * 1. A person appears in the camera and is announced.
 * 2. An object on the left, centre and right is announced with the correct screen position.
 * 3. The same object does not get announced continuously (stable multi-frame + cooldown).
 * 4. Multiple objects do not create overlapping speech (prioritized freshness queue).
 * 5. English and Hindi announcements work with natural phrasing.
 * 6. Turning announcements OFF immediately stops pending speech and clears queue.
 * 7. Stopping the camera clears the speech queue.
 * 8. The original Test Voice button still works.
 * 9. Spatial position calculations (left third, middle third, right third).
 * 10. Dashboard UI controls: Master switch, volume, speech status (Speaking/Waiting/Disabled).
 */

const fs = require('fs');
const assert = require('assert');

console.log('=== DRISVYA INTELLIGENT OBJECT ANNOUNCEMENT AUDIT SUITE ===\n');

// 1. FILE & MARKUP AUDIT
const html = fs.readFileSync('index.html', 'utf8');
const componentsCss = fs.readFileSync('css/components.css', 'utf8');
const a11yCss = fs.readFileSync('css/accessibility.css', 'utf8');

console.log('[TEST 1] Dashboard Markup & Control Elements Audit');
assert(html.includes('id="toggleObjectAnnouncements"'), 'Object announcements toggle switch missing in index.html');
assert(html.includes('id="rangeVoiceVolume"'), 'Announcement volume slider missing in index.html');
assert(html.includes('id="valVoiceVolume"'), 'Volume percentage badge missing in index.html');
assert(html.includes('id="btnTestVoice"'), 'Test Voice button missing in index.html');
assert(html.includes('id="voiceStatusBadge"'), 'Voice status badge missing in index.html');
assert(html.includes('id="voiceAssistantStatusText"'), 'Voice assistant status text missing in index.html');
assert(html.includes('id="audioRouteStatus"'), 'Audio route status missing in index.html');
console.log('  ✔ All Object Announcement dashboard controls verified in index.html');

console.log('[TEST 2] CSS Styling Audit for Object Announcements & Switches');
assert(componentsCss.includes('.voice-toggle-row'), 'CSS missing .voice-toggle-row');
assert(componentsCss.includes('.switch-control-wrap'), 'CSS missing .switch-control-wrap');
assert(componentsCss.includes('.slider-switch-track'), 'CSS missing .slider-switch-track');
assert(componentsCss.includes('.slider-switch-thumb'), 'CSS missing .slider-switch-thumb');
assert(componentsCss.includes('.status-dot.speaking'), 'CSS missing .status-dot.speaking');
assert(componentsCss.includes('.status-dot.disabled'), 'CSS missing .status-dot.disabled');
assert(a11yCss.includes('.voice-toggle-row'), 'High contrast CSS missing for voice-toggle-row');
console.log('  ✔ CSS rules for toggle switches, status dots, and high-contrast verified');

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
      value: '1.0',
      checked: true,
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
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {} }],
        getVideoTracks: () => [{ stop() {}, getCapabilities: () => ({ zoom: { min: 0.5, max: 8.0 } }) }]
      }),
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
  // 3. SPATIAL POSITION CALCULATION (Left third, Middle third, Right third)
  console.log('[TEST 3] Screen Zone Partitioning (Left third, Middle third, Right third)');
  const vW = 1200;
  // Left third: center < 400 (e.g. x=100, w=100 -> center=150)
  const leftSpatial = window.aiEngine.calculateSpatialPosition([100, 50, 100, 100], vW);
  assert.strictEqual(leftSpatial.position, 'Left', 'Object in left third must be Left');

  // Middle third: 400 <= center <= 800 (e.g. x=550, w=100 -> center=600)
  const centreSpatial = window.aiEngine.calculateSpatialPosition([550, 50, 100, 100], vW);
  assert.strictEqual(centreSpatial.position, 'Centre', 'Object in middle third must be Centre');

  // Right third: center > 800 (e.g. x=950, w=100 -> center=1000)
  const rightSpatial = window.aiEngine.calculateSpatialPosition([950, 50, 100, 100], vW);
  assert.strictEqual(rightSpatial.position, 'Right', 'Object in right third must be Right');
  console.log('  ✔ Camera frame partitioned correctly into exact horizontal thirds (Left, Centre, Right)');

  // 4. REQUIREMENT 1: A person appears in the camera and is announced
  console.log('[TEST 4] Person Appears in Camera Across Consecutive Frames (Requirement 1)');
  window.voiceAssistant.clearQueue();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];

  const personInCentre = [{
    bbox: [500, 100, 200, 400],
    class: 'person',
    spatial: { position: 'Centre' },
    proximity: { level: 'Medium' }
  }];

  // Frame 1: consecutive count = 1 (< 2 required frames) -> Should not speak prematurely
  window.voiceAssistant.handleDetections(personInCentre);
  assert.strictEqual(spokenUtterances.length, 0, 'Must wait for consecutive frame stability before speaking');

  // Frame 2: consecutive count = 2 (meets threshold) -> Should speak!
  window.voiceAssistant.handleDetections(personInCentre);
  assert.strictEqual(spokenUtterances.length, 1, 'Should announce person on reaching 2 consecutive frames');
  assert.strictEqual(spokenUtterances[0].text, 'Person in front of you.', 'Must announce person in front of you');
  console.log(`  ✔ Person announced: "${spokenUtterances[0].text}"`);

  // 5. REQUIREMENT 2: Objects on Left, Centre, and Right announced with correct screen position
  console.log('[TEST 5] Screen Position Phrasing for Left, Centre, and Right (Requirement 2)');
  
  // Chair on Left
  window.voiceAssistant.clearQueue();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];
  const chairOnLeft = [{
    bbox: [50, 150, 150, 250],
    class: 'chair',
    spatial: { position: 'Left' }
  }];
  window.voiceAssistant.handleDetections(chairOnLeft); // Frame 1
  window.voiceAssistant.handleDetections(chairOnLeft); // Frame 2
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Chair on your left.', 'Left zone phrasing must be "[Object] on your left."');
  console.log(`  ✔ Left zone: "${spokenUtterances[0].text}"`);

  // Bottle on Right
  window.voiceAssistant.clearQueue();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];
  const bottleOnRight = [{
    bbox: [950, 150, 100, 200],
    class: 'bottle',
    spatial: { position: 'Right' }
  }];
  window.voiceAssistant.handleDetections(bottleOnRight); // Frame 1
  window.voiceAssistant.handleDetections(bottleOnRight); // Frame 2
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Bottle on your right.', 'Right zone phrasing must be "[Object] on your right."');
  console.log(`  ✔ Right zone: "${spokenUtterances[0].text}"`);

  // 6. REQUIREMENT 3: Same object does NOT get announced continuously
  console.log('[TEST 6] Continuous Frame Suppression & Cooldown (Requirement 3)');
  // Feed the bottle continuously for 5 more frames
  const initialCount = spokenUtterances.length;
  for (let i = 0; i < 5; i++) {
    window.voiceAssistant.handleDetections(bottleOnRight);
  }
  assert.strictEqual(spokenUtterances.length, initialCount, 'Same object must NOT repeat continuously on successive frames');
  console.log('  ✔ Same object suppressed over multiple continuous frames (cooldown enforced)');

  // 7. REQUIREMENT 4: Multiple objects do NOT create overlapping speech
  console.log('[TEST 7] Multiple Objects & Single-Queue Protection (Requirement 4)');
  window.voiceAssistant.clearQueue();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];

  const multipleObjects = [
    { bbox: [100, 100, 200, 300], class: 'laptop', spatial: { position: 'Left' } },   // area = 60,000
    { bbox: [450, 50, 400, 600], class: 'person', spatial: { position: 'Centre' } }    // area = 240,000 (Larger/higher priority)
  ];

  // Frame 1
  window.voiceAssistant.handleDetections(multipleObjects);
  // Frame 2
  window.voiceAssistant.handleDetections(multipleObjects);

  // Exactly one announcement should play initially (the higher priority one)
  assert.strictEqual(spokenUtterances.length, 1, 'Only the prioritized object should speak first');
  assert.strictEqual(spokenUtterances[0].text, 'Person in front of you.', 'Larger/closer object takes priority');
  console.log(`  ✔ Prioritized speech without overlap: "${spokenUtterances[0].text}"`);

  // 8. REQUIREMENT 5: English and Hindi announcements work
  console.log('[TEST 8] Language Switching & Hindi Phrasing (Requirement 5)');
  window.voiceAssistant.setLanguage('hi');
  assert.strictEqual(window.voiceAssistant.currentLanguage, 'hi', 'Language must be Hindi');
  
  window.voiceAssistant.clearQueue();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];

  const chairHindi = [{
    bbox: [60, 200, 150, 200],
    class: 'chair',
    spatial: { position: 'Left' }
  }];
  window.voiceAssistant.handleDetections(chairHindi); // Frame 1
  window.voiceAssistant.handleDetections(chairHindi); // Frame 2
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'बाईं ओर कुर्सी है।', 'Hindi phrasing must be "बाईं ओर [कुर्सी] है।"');
  console.log(`  ✔ Hindi screen position sentence: "${spokenUtterances[0].text}"`);

  // Switch back to English
  window.voiceAssistant.setLanguage('en');

  // 9. REQUIREMENT 6: Turning announcements OFF immediately stops pending speech
  console.log('[TEST 9] Object Announcements Master Switch (ON/OFF) (Requirement 6)');
  speechCancelled = false;
  window.voiceAssistant.isSpeaking = true;
  window.voiceAssistant.setAnnouncementsEnabled(false);

  assert.strictEqual(window.voiceAssistant.isAnnouncementsEnabled, false, 'Announcements must be disabled');
  assert.strictEqual(speechCancelled, true, 'Turning OFF must immediately cancel active speech');
  assert.strictEqual(window.voiceAssistant.pendingAnnouncement, null, 'Pending queue must be cleared');
  
  const statusEl = document.getElementById('voiceAssistantStatusText');
  assert.strictEqual(statusEl.textContent, 'Disabled', 'Status indicator must show Disabled');
  console.log('  ✔ Turning announcements OFF immediately stopped speech and set status to Disabled');

  // Re-enable
  window.voiceAssistant.setAnnouncementsEnabled(true);
  assert.strictEqual(statusEl.textContent, 'Waiting', 'Status indicator must return to Waiting');
  console.log('  ✔ Re-enabling announcements restored status to Waiting');

  // 10. REQUIREMENT 7: Stopping camera clears the speech queue
  console.log('[TEST 10] Stopping Camera Clears Speech Queue (Requirement 7)');
  window.voiceAssistant.pendingAnnouncement = { candidate: { class: 'bottle', position: 'Right' }, timestamp: Date.now() };
  window.voiceAssistant.trackedObjects.set('bottle_Right', { consecutiveCount: 3 });

  await window.cameraController.stopAssistance();
  assert.strictEqual(window.voiceAssistant.pendingAnnouncement, null, 'Camera stop must clear pending announcement');
  assert.strictEqual(window.voiceAssistant.trackedObjects.size, 0, 'Camera stop must clear tracked objects map');
  console.log('  ✔ Stopping camera cleanly cleared speech queue and detection tracking');

  // 11. REQUIREMENT 8: Original Test Voice button still works
  console.log('[TEST 11] Original Test Voice Button Functionality (Requirement 8)');
  spokenUtterances = [];
  window.voiceAssistant.testVoice();
  assert(spokenUtterances.length > 0, 'Test voice must trigger speech');
  assert(spokenUtterances[0].text.includes('test') || spokenUtterances[0].text.includes('टेस्ट'), 'Spoken text must be test sentence');
  console.log(`  ✔ Original Test Voice button working: "${spokenUtterances[0].text}"`);

  // 12. Volume Control Verification
  console.log('[TEST 12] Announcement Volume Control (Requirement 6)');
  window.voiceAssistant.setVolume(0.75);
  assert.strictEqual(window.voiceAssistant.speechVolume, 0.75, 'Volume must be 0.75');
  const volEl = document.getElementById('valVoiceVolume');
  assert.strictEqual(volEl.textContent, '75%', 'Volume badge must display 75%');
  console.log('  ✔ Announcement volume setting and percentage display verified');

  // 13. Camera & Bounding Box Pipeline Verification
  console.log('[TEST 13] Camera Controller, Device Selection & Bounding Box Alignment');
  window.cameraController.init();
  await window.cameraController.discoverCameraDevices();
  assert(window.cameraController.availableDevices.length >= 2, 'Camera devices must be enumerated');
  const sampleDetections = [
    { bbox: [100, 100, 200, 400], class: 'person', score: 0.95, spatial: { position: 'Left' } }
  ];
  window.cameraController.drawBoundingBoxes(sampleDetections);
  console.log('  ✔ Camera device enumeration and bounding box rendering verified');

  console.log('\n================================================================');
  console.log('🎉 ALL 13 VERIFICATION SUITES PASSED WITH 0 ERRORS');
  console.log('================================================================');
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
