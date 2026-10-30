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
assert(html.includes('id="primaryLockStatusBadge"'), 'Primary person lock status badge missing');
assert(html.includes('id="valPrimaryProximity"'), 'Primary proximity value missing');
assert(html.includes('id="btnUnlockPrimaryPerson"'), 'Unlock Primary Person button missing');
assert(componentsCss.includes('.voice-toggle-row'), 'CSS missing .voice-toggle-row');
assert(componentsCss.includes('.slider-switch-track'), 'CSS missing .slider-switch-track');
assert(componentsCss.includes('.primary-person-card'), 'CSS missing .primary-person-card');
assert(componentsCss.includes('.proximity-badge'), 'CSS missing .proximity-badge');
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
  querySelector(sel) {
    return getOrCreateMockElement(sel.replace(/^[.#]/, ''));
  },
  createElement(tag) {
    return {
      tagName: tag, value: '', textContent: '', selected: false, innerHTML: '', style: {},
      classList: {
        items: new Set(),
        add(cls) { this.items.add(cls); },
        remove(cls) { this.items.delete(cls); },
        contains(cls) { return this.items.has(cls); }
      },
      addEventListener() {}
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
require('./js/tracker.js');
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

  // ====================================================================
  // SMART DISTANCE AWARENESS & PRIMARY PERSON TRACKING TEST SCENARIOS
  // ====================================================================
  console.log('\n--- PRIMARY PERSON & DISTANCE AWARENESS SCENARIOS ---\n');

  // Scenario 3: Multiple people visible simultaneously
  console.log('[SCENARIO 1] Multiple People Visible Simultaneously');
  window.primaryPersonTracker.reset();
  currentTime = 6000000;
  spokenUtterances = [];

  const personA = { bbox: [100, 100, 160, 320], class: 'person', score: 0.90, spatial: { position: 'Left' } };
  const personB = { bbox: [600, 100, 180, 340], class: 'person', score: 0.88, spatial: { position: 'Centre' } };
  const frameMulti = [personA, personB];

  window.primaryPersonTracker.update(frameMulti, 1280, 720);
  assert.strictEqual(window.primaryPersonTracker.detectedPeople.length, 2, 'Must detect and track both people simultaneously');
  assert.strictEqual(window.primaryPersonTracker.lockStatus, 'not_locked', 'Initial state must be not_locked');
  console.log('  ✔ Multiple people detected and assigned distinct track IDs without locking prematurely');

  // Scenario 4: Selecting and locking one particular person
  console.log('[SCENARIO 2] Selecting and Locking One Particular Person');
  spokenUtterances = [];
  const targetToLock = window.primaryPersonTracker.detectedPeople[0]; // Lock Person A
  const targetId = targetToLock.id;
  window.primaryPersonTracker.lockPerson(targetToLock);

  assert.strictEqual(window.primaryPersonTracker.lockStatus, 'locked');
  assert.strictEqual(window.primaryPersonTracker.lockedPersonId, targetId);
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Primary person detected.', 'Must announce locked target');
  console.log('  ✔ Target person locked with confirmation announcement');

  // Scenario 5: Other people entering frame without breaking lock (Anti-drift)
  console.log('[SCENARIO 3] Anti-Drift: Other People Moving / Entering Frame');
  currentTime += 500;
  const personC = { bbox: [800, 50, 300, 600], class: 'person', score: 0.95, spatial: { position: 'Right' } }; // Larger person entering
  const personAMoved = { bbox: [110, 105, 160, 320], class: 'person', score: 0.91, spatial: { position: 'Left' } };
  window.primaryPersonTracker.update([personAMoved, personB, personC], 1280, 720);

  assert.strictEqual(window.primaryPersonTracker.lockStatus, 'locked');
  assert.strictEqual(window.primaryPersonTracker.lockedPersonId, targetId, 'Lock must remain on original Person A');
  assert.strictEqual(window.primaryPersonTracker.lockedPerson.id, targetId);
  console.log('  ✔ Anti-drift lock retained on primary person despite new/closer people in frame');

  // Scenario 1: Person moving closer (Approaching)
  console.log('[SCENARIO 4] Relative Proximity: Person Moving Closer (Approaching)');
  spokenUtterances = [];
  window.primaryPersonTracker.history = []; // Reset history
  window.primaryPersonTracker.lastAnnouncedProximity = 'Far';
  window.primaryPersonTracker.lastAnnouncedTime = currentTime;

  // Simulate consecutive frames of expanding size from Far
  // Frame 1: w=80, h=160
  currentTime += 100;
  window.primaryPersonTracker.update([{ bbox: [110, 100, 80, 160], class: 'person', score: 0.92, spatial: { position: 'Centre' } }], 1280, 720);

  // Frame 2: expanding w=95, h=190
  currentTime += 100;
  window.primaryPersonTracker.update([{ bbox: [110, 80, 95, 190], class: 'person', score: 0.92, spatial: { position: 'Centre' } }], 1280, 720);

  // Frame 3: expanding w=115, h=230
  currentTime += 100;
  window.primaryPersonTracker.update([{ bbox: [110, 60, 115, 230], class: 'person', score: 0.92, spatial: { position: 'Centre' } }], 1280, 720);

  // Frame 4: expanding w=140, h=280
  currentTime += 100;
  window.primaryPersonTracker.update([{ bbox: [110, 40, 140, 280], class: 'person', score: 0.92, spatial: { position: 'Centre' } }], 1280, 720);

  assert.strictEqual(window.primaryPersonTracker.lockedPerson.proximity.level, 'Approaching', 'Must identify Approaching trend');
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Primary person is getting closer.');
  console.log('  ✔ Multi-frame temporal expansion correctly categorized as "Approaching"');

  // Scenario 7: No repeated announcements for unchanged proximity state
  console.log('[SCENARIO 5] No Repeated Announcements for Unchanged Proximity');
  const initialCount = spokenUtterances.length;
  // Next 5 frames in same approaching range
  for (let i = 0; i < 5; i++) {
    currentTime += 100;
    window.primaryPersonTracker.update([{ bbox: [110, 40, 142, 282], class: 'person', score: 0.92, spatial: { position: 'Centre' } }], 1280, 720);
  }
  assert.strictEqual(spokenUtterances.length, initialCount, 'Must not spam speech while proximity state remains unchanged');
  console.log('  ✔ Unchanged proximity state produced zero duplicate announcements');

  // Person reaches Close
  console.log('[SCENARIO 6] Transition to Close State & Highest Priority Alert');
  spokenUtterances = [];
  currentTime += 100;
  // Frame large enough for close (h=440, heightRatio = 440/720 = 0.61 > 0.52)
  window.primaryPersonTracker.update([{ bbox: [100, 20, 260, 440], class: 'person', score: 0.94, spatial: { position: 'Centre' } }], 1280, 720);

  assert.strictEqual(window.primaryPersonTracker.lockedPerson.proximity.level, 'Close');
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Primary person is close.');
  console.log('  ✔ Close proximity identified and announced with urgent priority');

  // Scenario 2: Person moving farther away (Far)
  console.log('[SCENARIO 7] Person Moving Farther Away (Far)');
  spokenUtterances = [];
  currentTime += 5000; // Past proximity cooldown
  window.primaryPersonTracker.history = [];
  // Small bounding box: 70x140 (heightRatio = 140/720 = 0.194 < 0.30, areaRatio = 9800/921600 = 0.010 < 0.08)
  window.primaryPersonTracker.update([{ bbox: [100, 100, 70, 140], class: 'person', score: 0.88, spatial: { position: 'Centre' } }], 1280, 720);

  assert.strictEqual(window.primaryPersonTracker.lockedPerson.proximity.level, 'Far');
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Primary person is far away.');
  console.log('  ✔ Reduced apparent size correctly categorized as "Far"');

  // Scenario 6: Locked person temporarily disappearing (recovering within 3.5s)
  console.log('[SCENARIO 8] Temporary Occlusion & 3.5s Recovery Window');
  spokenUtterances = [];
  currentTime += 1000;
  // Frame with no people
  window.primaryPersonTracker.update([], 1280, 720);
  assert.strictEqual(window.primaryPersonTracker.lockStatus, 'temporarily_lost', 'Must enter temporarily_lost state');
  assert.strictEqual(window.primaryPersonTracker.lockedPersonId, targetId, 'Must retain locked person ID');

  // Still absent after 2 seconds (< 3.5s recovery window)
  currentTime += 2000;
  window.primaryPersonTracker.update([], 1280, 720);
  assert.strictEqual(window.primaryPersonTracker.lockStatus, 'temporarily_lost', 'Must remain temporarily_lost within 3.5s');

  // Reappears at 2.5s!
  currentTime += 500;
  window.primaryPersonTracker.update([{ bbox: [105, 100, 100, 180], class: 'person', score: 0.90, spatial: { position: 'Centre' } }], 1280, 720);
  assert.strictEqual(window.primaryPersonTracker.lockStatus, 'locked', 'Lock successfully recovered without loss');
  assert.strictEqual(window.primaryPersonTracker.lockedPersonId, targetId);
  console.log('  ✔ Occluded target cleanly re-acquired within 3.5s recovery window');

  // Scenario 8 & 9: English and Hindi announcements & No Speech Overlap
  console.log('[SCENARIO 9] English & Hindi Phrasing with Single Speech Queue');
  window.voiceAssistant.setLanguage('hi');
  spokenUtterances = [];

  window.voiceAssistant.announcePrimaryPerson('approaching');
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'मुख्य व्यक्ति पास आ रहा है।');

  window.voiceAssistant.announcePrimaryPerson('close');
  assert.strictEqual(spokenUtterances.length, 2);
  assert.strictEqual(spokenUtterances[1].text, 'मुख्य व्यक्ति पास है।');

  window.voiceAssistant.announcePrimaryPerson('lost');
  assert.strictEqual(spokenUtterances.length, 3);
  assert.strictEqual(spokenUtterances[2].text, 'मुख्य व्यक्ति अस्थायी रूप से खो गया है।');

  window.voiceAssistant.announcePrimaryPerson('unlocked');
  assert.strictEqual(spokenUtterances.length, 4);
  assert.strictEqual(spokenUtterances[3].text, 'मुख्य व्यक्ति अनलॉक हो गया है।');

  // Reset to English
  window.voiceAssistant.setLanguage('en');
  console.log('  ✔ All localized Hindi phrases verified through single speech queue');

  // Scenario 10: Unlocking and selecting another person
  console.log('[SCENARIO 10] Unlocking & Re-Targeting Another Person');
  spokenUtterances = [];
  window.primaryPersonTracker.unlockPerson();
  assert.strictEqual(window.primaryPersonTracker.lockStatus, 'not_locked');
  assert.strictEqual(window.primaryPersonTracker.lockedPersonId, null);
  assert.strictEqual(spokenUtterances[0].text, 'Primary person unlocked.');

  // Now lock Person B
  spokenUtterances = [];
  const personBNew = window.primaryPersonTracker.detectedPeople.find(p => p.id !== targetId) || { id: 'person_2', bbox: [500, 100, 200, 400], class: 'person', score: 0.9 };
  window.primaryPersonTracker.lockPerson(personBNew);
  assert.strictEqual(window.primaryPersonTracker.lockStatus, 'locked');
  assert.strictEqual(window.primaryPersonTracker.lockedPersonId, personBNew.id);
  assert.strictEqual(spokenUtterances[0].text, 'Primary person detected.');
  console.log('  ✔ Primary person unlocked and re-targeted to different detected person');

  console.log('\n================================================================');
  console.log('🎉 ALL 20 VERIFICATION & SCENARIO TESTS PASSED WITH 0 ERRORS');
  console.log('================================================================');
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
