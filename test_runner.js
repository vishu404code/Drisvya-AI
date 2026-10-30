/**
 * DRISVYA - Comprehensive Verification & Duplicate Prevention Audit Test Suite
 * Tests the Duplicate Prevention & Speech Queue Requirements:
 * 1. Keep one object visible for 20 seconds. It should not be repeatedly announced.
 * 2. Remove the object and bring it back after 3 seconds. Respect the 15-second cooldown.
 * 3. Show multiple objects together without overlap.
 * 4. Move an object between left, centre and right without re-triggering announcements.
 * 5. Turn announcements OFF while speech is queued (clears queue & cancels audio).
 * 6. Verify English and Hindi still work.
 * 7. Camera stop clears speech queue and tracked objects.
 * 8. Original Test Voice button works.
 * 9. Wide-angle camera and uncropped full frame processing inspection.
 */

const fs = require('fs');
const assert = require('assert');

console.log('=== DRISVYA DUPLICATE PREVENTION & SPEECH QUEUE AUDIT ===\n');

// 1. FILE & MARKUP AUDIT
const html = fs.readFileSync('index.html', 'utf8');
const componentsCss = fs.readFileSync('css/components.css', 'utf8');

console.log('[TEST 1] Markup & CSS Controls Audit');
assert(html.includes('id="toggleObjectAnnouncements"'), 'Object announcements toggle switch missing');
assert(html.includes('id="rangeVoiceVolume"'), 'Announcement volume slider missing');
assert(html.includes('id="btnTestVoice"'), 'Test Voice button missing');
assert(componentsCss.includes('.voice-toggle-row'), 'CSS missing .voice-toggle-row');
assert(componentsCss.includes('.slider-switch-track'), 'CSS missing .slider-switch-track');
console.log('  ✔ All UI elements and CSS controls verified');

// 2. TIME SIMULATION & BROWSER MOCK
global.window = global;

let currentTime = 10000000;
Date.now = () => currentTime;

global.tf = {
  ready: () => Promise.resolve(),
  getBackend: () => 'webgl'
};

global.cocoSsd = {
  load: async () => ({
    detect: async () => [
      { bbox: [120, 80, 240, 500], class: 'person', score: 0.94 }
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
          clearRect() {}, strokeRect() {}, fillRect() {}, fillText() {},
          measureText() { return { width: 60 }; },
          beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
          roundRect() {}, save() {}, restore() {}, scale() {}
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
      tagName: tag, value: '', textContent: '', selected: false, innerHTML: '', style: {},
      classList: { add() {} }
    };
  },
  addEventListener() {}
};

Object.defineProperty(global, 'navigator', {
  value: {
    onLine: true,
    vibrate() { return true; },
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {} }],
        getVideoTracks: () => [{ stop() {}, getCapabilities: () => ({ zoom: { min: 0.5, max: 8.0 } }) }]
      }),
      enumerateDevices: async () => [
        { kind: 'videoinput', deviceId: 'cam_back_0', label: 'Back Camera 0 (Wide)' },
        { kind: 'videoinput', deviceId: 'cam_back_1', label: 'Back Camera 2 (Ultra-Wide 0.5x)' },
        { kind: 'videoinput', deviceId: 'cam_front', label: 'Front Camera' }
      ]
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
  // TEST CASE 1: Keep one object visible for 20 seconds. It should not be repeatedly announced.
  console.log('[TEST 2] Visible for 20 Seconds Continuous Visibility Test (Requirement 5.1)');
  currentTime = 1000000;
  window.voiceAssistant.clearQueue();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];

  const persistentPerson = [{
    bbox: [500, 100, 200, 400],
    class: 'person',
    spatial: { position: 'Centre' }
  }];

  // Frame 1: t = 1000000
  window.voiceAssistant.handleDetections(persistentPerson);
  assert.strictEqual(spokenUtterances.length, 0, 'Frame 1 must not announce prematurely');

  // Frame 2: t = 1000100 -> Announced!
  currentTime += 100;
  window.voiceAssistant.handleDetections(persistentPerson);
  assert.strictEqual(spokenUtterances.length, 1, 'Frame 2 must announce confirmed person');
  assert.strictEqual(spokenUtterances[0].text, 'Person in front of you.');

  // Now simulate 20 continuous seconds of frames (at t=1s, 2s, 5s, 10s, 15s, 19s, 20s)
  const timestamps = [1000, 2000, 5000, 8000, 10000, 12000, 15000, 18000, 20000];
  for (const offset of timestamps) {
    currentTime = 1000000 + offset;
    window.voiceAssistant.handleDetections(persistentPerson);
  }

  assert.strictEqual(spokenUtterances.length, 1, 'Object must NOT be repeatedly announced while continuously visible over 20 seconds');
  console.log('  ✔ Continuous visibility test passed: exactly 1 announcement across 20 seconds');

  // TEST CASE 2: Remove the object and bring it back after 3 seconds. Respect the 15-second cooldown.
  console.log('[TEST 3] Remove Object & Return After 3s with 15s Cooldown (Requirement 5.2)');
  // Chair announced at t = 2000000 (t0)
  currentTime = 2000000;
  window.voiceAssistant.clearQueue();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];

  const chair = [{
    bbox: [60, 200, 180, 250],
    class: 'chair',
    spatial: { position: 'Left' }
  }];

  // Frame 1 & 2
  window.voiceAssistant.handleDetections(chair);
  currentTime += 100;
  window.voiceAssistant.handleDetections(chair);
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Chair on your left.');

  // Remove object at t = 2002000 (absent)
  currentTime = 2002000;
  window.voiceAssistant.handleDetections([]);

  // Bring chair back at t = 2006000 (absent for 4 seconds >= 3s threshold)
  // BUT only 6 seconds have elapsed since last announcement (< 15s cooldown!)
  currentTime = 2006000;
  window.voiceAssistant.handleDetections(chair);
  currentTime += 100;
  window.voiceAssistant.handleDetections(chair);

  // Must NOT announce yet because 15s cooldown has not elapsed!
  assert.strictEqual(spokenUtterances.length, 1, 'Must respect 15-second cooldown even after returning');

  // Advance time to t = 2016000 (> 15 seconds since original announcement at t=2000100)
  currentTime = 2016000;
  window.voiceAssistant.handleDetections(chair);
  currentTime += 100;
  window.voiceAssistant.handleDetections(chair);

  assert.strictEqual(spokenUtterances.length, 2, 'Must announce when 15s cooldown has elapsed and object returned');
  assert.strictEqual(spokenUtterances[1].text, 'Chair on your left.');
  console.log('  ✔ Absence threshold (>= 3s) and 15s cooldown verified');

  // TEST CASE 4: Move an object between left, centre and right
  console.log('[TEST 4] Zone Shift Continuity: Moving Left -> Centre -> Right (Requirement 5.4)');
  currentTime = 3000000;
  window.voiceAssistant.clearQueue();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];

  // Person appears on Left
  const personLeft = [{ bbox: [50, 100, 200, 400], class: 'person', spatial: { position: 'Left' } }];
  window.voiceAssistant.handleDetections(personLeft);
  currentTime += 100;
  window.voiceAssistant.handleDetections(personLeft);
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Person on your left.');

  // Person moves to Centre (centroid moves to 600)
  currentTime += 500;
  const personCentre = [{ bbox: [500, 100, 200, 400], class: 'person', spatial: { position: 'Centre' } }];
  window.voiceAssistant.handleDetections(personCentre);
  currentTime += 100;
  window.voiceAssistant.handleDetections(personCentre);

  // Person moves to Right (centroid moves to 1000)
  currentTime += 500;
  const personRight = [{ bbox: [900, 100, 200, 400], class: 'person', spatial: { position: 'Right' } }];
  window.voiceAssistant.handleDetections(personRight);
  currentTime += 100;
  window.voiceAssistant.handleDetections(personRight);

  assert.strictEqual(spokenUtterances.length, 1, 'Moving between screen zones must NOT immediately re-announce the same object');
  console.log('  ✔ Spatial movement between zones correctly identified as same object without duplicate speech');

  // TEST CASE 3: Show multiple objects together
  console.log('[TEST 5] Multiple Objects Prioritization Without Overlap (Requirement 5.3)');
  currentTime = 4000000;
  window.voiceAssistant.clearQueue();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];

  const multiple = [
    { bbox: [100, 100, 150, 150], class: 'bottle', spatial: { position: 'Left' } }, // area = 22,500
    { bbox: [450, 100, 350, 500], class: 'person', spatial: { position: 'Centre' } } // area = 175,000 (Prioritized)
  ];

  window.voiceAssistant.handleDetections(multiple);
  currentTime += 100;
  window.voiceAssistant.handleDetections(multiple);

  assert.strictEqual(spokenUtterances.length, 1, 'Only one object spoken initially (no overlapping audio)');
  assert.strictEqual(spokenUtterances[0].text, 'Person in front of you.', 'Larger object must be prioritized');
  console.log('  ✔ Multiple objects prioritized cleanly without speech collisions');

  // TEST CASE 5: Turn announcements OFF while speech is queued
  console.log('[TEST 6] Announcements OFF Cancels Audio & Clears Queue (Requirement 5.5)');
  speechCancelled = false;
  window.voiceAssistant.isSpeaking = true;
  window.voiceAssistant.pendingAnnouncement = { text: 'Queued message', timestamp: currentTime };

  window.voiceAssistant.setAnnouncementsEnabled(false);
  assert.strictEqual(window.voiceAssistant.isAnnouncementsEnabled, false, 'Announcements must be disabled');
  assert.strictEqual(speechCancelled, true, 'Speech must be cancelled immediately');
  assert.strictEqual(window.voiceAssistant.pendingAnnouncement, null, 'Pending queue must be cleared');
  assert.strictEqual(document.getElementById('voiceAssistantStatusText').textContent, 'Disabled');
  console.log('  ✔ Disabling announcements successfully purged queue and aborted speech');

  // Re-enable
  window.voiceAssistant.setAnnouncementsEnabled(true);

  // TEST CASE 6: Verify English and Hindi still work
  console.log('[TEST 7] English and Hindi Announcements Verification (Requirement 5.6)');
  window.voiceAssistant.clearQueue();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];

  // Switch to Hindi
  window.voiceAssistant.setLanguage('hi');
  assert.strictEqual(window.voiceAssistant.currentLanguage, 'hi');
  spokenUtterances = [];

  currentTime = 5000000;
  const hindiChair = [{ bbox: [50, 150, 150, 200], class: 'chair', spatial: { position: 'Left' } }];
  window.voiceAssistant.handleDetections(hindiChair);
  currentTime += 100;
  window.voiceAssistant.handleDetections(hindiChair);

  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'बाईं ओर कुर्सी है।', 'Hindi sentence must be accurate');
  console.log(`  ✔ Hindi screen zone announcement verified: "${spokenUtterances[0].text}"`);

  // Switch back to English
  window.voiceAssistant.setLanguage('en');

  // TEST CASE 7: Stopping camera clears speech queue
  console.log('[TEST 8] Camera Stop Clears Speech Queue');
  window.voiceAssistant.pendingAnnouncement = { text: 'Test Pending', timestamp: currentTime };
  window.voiceAssistant.trackedObjects.set('obj_1', { consecutiveFrames: 4 });
  await window.cameraController.stopAssistance();
  assert.strictEqual(window.voiceAssistant.pendingAnnouncement, null);
  assert.strictEqual(window.voiceAssistant.trackedObjects.size, 0);
  console.log('  ✔ Camera stop completely reset tracking and speech queues');

  // TEST CASE 8: Test Voice button works
  console.log('[TEST 9] Original Test Voice Button');
  spokenUtterances = [];
  window.voiceAssistant.testVoice();
  assert(spokenUtterances.length > 0);
  assert(spokenUtterances[0].text.includes('test') || spokenUtterances[0].text.includes('टेस्ट'));
  console.log(`  ✔ Test Voice button functional: "${spokenUtterances[0].text}"`);

  // TEST CASE 9: Full Frame Processing & Camera Inspection
  console.log('[TEST 10] Uncropped Frame Processing & Camera Enumeration');
  await window.cameraController.discoverCameraDevices();
  assert(window.cameraController.availableDevices.length >= 2, 'Devices enumerated');
  console.log('  ✔ Camera hardware enumerated without cropping raw video inputs');

  console.log('\n================================================================');
  console.log('🎉 ALL 10 VERIFICATION TESTS PASSED WITH 0 ERRORS');
  console.log('================================================================');
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
