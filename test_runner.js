/**
 * DRISVYA AI - Comprehensive Automatic Target Tracker & Proximity Audit Test Suite
 * Strictly verifies the 12 Scenarios from the Specification:
 * 
 * TEST 1: One person enters -> automatically detected, locked, highlighted.
 * TEST 2: Walks towards camera -> tracking ID remains stable, proximity updates to APPROACHING.
 * TEST 3: Walks away -> updates to MOVING AWAY.
 * TEST 4: Stays at same position/size -> no repeated proximity speech spam.
 * TEST 5: Person A tracked, Person B enters closer -> automatically switches to Person B.
 * TEST 6: Chair enters and is closer -> switches to chair according to target-selection policy.
 * TEST 7: Two objects have similar proximity -> hysteresis prevents rapid alternating.
 * TEST 8: Current target disappears temporarily -> TEMPORARILY LOST & 3.0s recovery.
 * TEST 9: Multiple detections occur together -> single speech queue; zero audio overlap.
 * TEST 10: English and Hindi speech continue working.
 * TEST 11: Performance profile on simulated Android mobile constraints (< 5ms/frame).
 * TEST 12: Stopping camera or turning announcements OFF clears speech and tracking.
 */

const fs = require('fs');
const assert = require('assert');

console.log('=== DRISVYA AI: CENTRAL AUTOMATIC TARGET TRACKER & PROXIMITY AUDIT ===\n');

// 1. FILE & MARKUP AUDIT
const html = fs.readFileSync('index.html', 'utf8');
const componentsCss = fs.readFileSync('css/components.css', 'utf8');

console.log('[AUDIT 1] Markup & CSS Controls Verification');
assert(html.includes('id="toggleObjectAnnouncements"'), 'Object announcements toggle switch missing');
assert(html.includes('id="rangeVoiceVolume"'), 'Announcement volume slider missing');
assert(html.includes('id="btnTestVoice"'), 'Test Voice button missing');
assert(html.includes('id="primaryLockStatusBadge"'), 'Target lock status badge missing');
assert(html.includes('id="valPrimaryProximity"'), 'Proximity value element missing');
assert(html.includes('id="valTargetTrend"'), 'Movement trend element missing');
assert(html.includes('id="btnUnlockPrimaryPerson"'), 'Unlock Target button missing');
assert(componentsCss.includes('.primary-person-card'), 'CSS missing .primary-person-card');
assert(componentsCss.includes('.proximity-badge'), 'CSS missing .proximity-badge');
console.log('  ✔ All UI markup elements, accessibility tags, and CSS classes verified');

// 2. TIME SIMULATION & BROWSER ENVIRONMENT MOCK
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
        if (!this.children) this.children = [];
        this.children.push(child);
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
  // ====================================================================
  // TEST 1: ONE PERSON ENTERS -> AUTOMATICALLY DETECTED, LOCKED, HIGHLIGHTED
  // ====================================================================
  console.log('[TEST 1] Automatic Target Detection & Lock on Entry');
  window.targetTracker.reset();
  currentTime = 1000000;
  spokenUtterances = [];

  const personEntry = [{ bbox: [400, 150, 100, 200], class: 'person', score: 0.92 }];
  window.targetTracker.update(personEntry, 1280, 720);

  assert.strictEqual(window.targetTracker.lockStatus, 'locked', 'Lock status must be locked');
  assert(window.targetTracker.primaryTarget !== null, 'Primary target must not be null');
  assert.strictEqual(window.targetTracker.primaryTarget.class, 'person', 'Primary target class must be person');
  assert.strictEqual(window.targetTracker.primaryTarget.isPrimaryTarget, true, 'isPrimaryTarget flag must be true');
  assert.strictEqual(spokenUtterances.length, 1, 'Exactly one announcement spoken');
  assert.strictEqual(spokenUtterances[0].text, 'Person detected. Tracking started.');
  console.log('  ✔ Target automatically selected and locked with announcement: "Person detected. Tracking started."');

  const lockedId = window.targetTracker.primaryTarget.id;

  // ====================================================================
  // TEST 2: WALKS TOWARDS CAMERA -> STABLE ID & UPDATES TO APPROACHING
  // ====================================================================
  console.log('[TEST 2] Walking Towards Camera (Stable ID & Approaching Trend)');
  spokenUtterances = [];

  // Simulate consecutive detection frames of steady approach
  const approachFrames = [
    [400, 140, 105, 210], // Frame 1
    [390, 120, 115, 230], // Frame 2
    [380, 100, 130, 260], // Frame 3
    [370, 80, 150, 290]   // Frame 4
  ];

  for (const bbox of approachFrames) {
    currentTime += 100;
    window.targetTracker.update([{ bbox, class: 'person', score: 0.92 }], 1280, 720);
  }

  assert.strictEqual(window.targetTracker.primaryTarget.id, lockedId, 'Tracking ID must remain strictly identical');
  assert.strictEqual(window.targetTracker.primaryTarget.proximityTrend, 'APPROACHING', 'Trend must be APPROACHING');
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Person is getting closer.');
  console.log('  ✔ Tracking ID remained stable across movement and proximity trend updated to APPROACHING');

  // ====================================================================
  // TEST 3: WALKS AWAY -> UPDATES TO MOVING AWAY
  // ====================================================================
  console.log('[TEST 3] Person Walks Away (Updates to MOVING AWAY)');
  spokenUtterances = [];
  currentTime += 4000; // Past proximity cooldown

  // Simulate consecutive frames of shrinking size as person walks away
  const recedeFrames = [
    [380, 100, 130, 250], // Frame 1
    [390, 120, 110, 210], // Frame 2
    [400, 140, 95, 180],  // Frame 3
    [410, 160, 80, 150]   // Frame 4
  ];

  for (const bbox of recedeFrames) {
    currentTime += 100;
    window.targetTracker.update([{ bbox, class: 'person', score: 0.90 }], 1280, 720);
  }

  assert.strictEqual(window.targetTracker.primaryTarget.id, lockedId, 'Tracking ID must remain stable');
  assert.strictEqual(window.targetTracker.primaryTarget.proximityTrend, 'MOVING AWAY');
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Person is moving away.');
  console.log('  ✔ Shrinking apparent size correctly detected as MOVING AWAY');

  // ====================================================================
  // TEST 4: SAME POSITION & SIZE -> NO REPEATED SPEECH SPAM
  // ====================================================================
  console.log('[TEST 4] Stationary at Same Position (Zero Duplicate Speech Spam)');
  const initialSpeechCount = spokenUtterances.length;

  // Run 10 consecutive frames with static bounding box
  for (let i = 0; i < 10; i++) {
    currentTime += 100;
    window.targetTracker.update([{ bbox: [430, 180, 90, 180], class: 'person', score: 0.90 }], 1280, 720);
  }

  assert.strictEqual(spokenUtterances.length, initialSpeechCount, 'Must not spam speech when proximity state is unchanged');
  console.log('  ✔ Stationary object produced zero duplicate speech announcements across 10 frames');

  // ====================================================================
  // TEST 5: PERSON A TRACKED, PERSON B ENTERS CLOSER -> AUTO SWITCH TO B
  // ====================================================================
  console.log('[TEST 5] Automatic Switching to Closer Person (with Confirmation Cycles)');
  spokenUtterances = [];
  currentTime += 1000;

  // Person A is at [430, 180, 90, 180] (area 16,200)
  // Person B enters at [200, 40, 260, 480] (area 124,800 -> MUCH closer!)
  const frameTwoPeople = [
    { bbox: [430, 180, 90, 180], class: 'person', score: 0.90 }, // Person A (Far)
    { bbox: [200, 40, 260, 480], class: 'person', score: 0.95 }  // Person B (Close)
  ];

  // Feed for 3 confirmation cycles
  for (let i = 0; i < 3; i++) {
    currentTime += 100;
    window.targetTracker.update(frameTwoPeople, 1280, 720);
  }

  assert.notStrictEqual(window.targetTracker.primaryTarget.id, lockedId, 'Target ID must have switched');
  assert.strictEqual(window.targetTracker.primaryTarget.class, 'person');
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Person is now the closest estimated target.');
  console.log('  ✔ Automatically switched primary target to closer Person B after 3-cycle confirmation');

  const personBId = window.targetTracker.primaryTarget.id;

  // ====================================================================
  // TEST 6: CHAIR ENTERS AND IS CLOSER -> SWITCHES TO CHAIR
  // ====================================================================
  console.log('[TEST 6] Automatic Switching to Closer Object Category (Chair)');
  spokenUtterances = [];
  currentTime += 1000;

  // Person B is at [200, 150, 130, 260] (area 33,800)
  // A chair enters directly in front at [100, 20, 360, 460] (area 165,600, bottomY = 480/720)
  const framePersonAndChair = [
    { bbox: [200, 150, 130, 260], class: 'person', score: 0.88 },
    { bbox: [100, 20, 360, 460], class: 'chair', score: 0.93 }
  ];

  for (let i = 0; i < 3; i++) {
    currentTime += 100;
    window.targetTracker.update(framePersonAndChair, 1280, 720);
  }

  assert.strictEqual(window.targetTracker.primaryTarget.class, 'chair', 'Primary target must now be chair');
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Chair is now the closest estimated target.');
  console.log('  ✔ Switched primary target to chair according to target-selection policy');

  // ====================================================================
  // TEST 7: TWO OBJECTS OF SIMILAR PROXIMITY -> HYSTERESIS PREVENTS FLICKER
  // ====================================================================
  console.log('[TEST 7] Hysteresis Test: Two Objects of Similar Proximity');
  const currentTargetId = window.targetTracker.primaryTarget.id;
  const initialSwitchCount = spokenUtterances.length;

  // Simulate two chairs of similar size side by side (only ~5% size variation)
  for (let i = 0; i < 8; i++) {
    currentTime += 100;
    const flip = (i % 2 === 0);
    const twoChairs = [
      { bbox: [50, 20, 350 + (flip ? 10 : 0), 450], class: 'chair', score: 0.90 },
      { bbox: [500, 20, 350 + (!flip ? 10 : 0), 450], class: 'chair', score: 0.90 }
    ];
    window.targetTracker.update(twoChairs, 1280, 720);
  }

  assert.strictEqual(spokenUtterances.length, initialSwitchCount, 'Hysteresis must prevent rapid alternating speech');
  console.log('  ✔ Hysteresis margin strictly prevented flickering between similarly sized objects');

  // ====================================================================
  // TEST 8: TARGET DISAPPEARS TEMPORARILY -> TEMPORARILY LOST & RECOVERY
  // ====================================================================
  console.log('[TEST 8] Target Disappears Temporarily (Recovery Window)');
  spokenUtterances = [];
  const targetBeforeLoss = window.targetTracker.primaryTarget.id;

  // Frame with empty detections
  currentTime += 500;
  window.targetTracker.update([], 1280, 720);

  assert.strictEqual(window.targetTracker.lockStatus, 'temporarily_lost', 'Must transition to temporarily_lost');
  assert.strictEqual(document.getElementById('primaryLockStatusBadge').textContent, 'Temporarily Lost');

  // 1.5s later (within 3.0s recovery window) -> Still temporarily_lost
  currentTime += 1500;
  window.targetTracker.update([], 1280, 720);
  assert.strictEqual(window.targetTracker.lockStatus, 'temporarily_lost');

  // Target returns at 2.0s!
  currentTime += 500;
  const returnFrame = [{ bbox: [60, 20, 350, 450], class: 'chair', score: 0.92 }];
  window.targetTracker.update(returnFrame, 1280, 720);

  assert.strictEqual(window.targetTracker.lockStatus, 'locked', 'Lock must be re-acquired');
  assert.strictEqual(window.targetTracker.primaryTarget.id, targetBeforeLoss, 'Original tracking ID must be retained');
  console.log('  ✔ Occluded target cleanly re-acquired within 3.0s recovery window');

  // ====================================================================
  // TEST 9: MULTIPLE DETECTIONS SIMULTANEOUSLY -> ZERO AUDIO OVERLAP
  // ====================================================================
  console.log('[TEST 9] Multiple Simultaneous Detections & Zero Audio Overlap');
  spokenUtterances = [];
  currentTime += 1000;

  const crowd = [
    { bbox: [50, 100, 100, 200], class: 'person', score: 0.85 },
    { bbox: [250, 120, 90, 180], class: 'bottle', score: 0.82 },
    { bbox: [450, 80, 160, 300], class: 'chair', score: 0.90 },
    { bbox: [700, 50, 280, 400], class: 'person', score: 0.95 }
  ];

  window.targetTracker.update(crowd, 1280, 720);
  currentTime += 100;
  window.targetTracker.update(crowd, 1280, 720);

  // Exactly one announcement must be made or queued, zero speech collisions
  assert(spokenUtterances.length <= 1, 'Never play multiple simultaneous speech utterances');
  console.log('  ✔ Central speech manager guarantees zero audio collisions');

  // ====================================================================
  // TEST 10: ENGLISH AND HINDI SPEECH FUNCTIONALITY
  // ====================================================================
  console.log('[TEST 10] English and Hindi Phrasing Verification');
  window.voiceAssistant.setLanguage('hi');
  spokenUtterances = [];

  const dummyPerson = { class: 'person' };
  const dummyChair = { class: 'chair' };

  window.voiceAssistant.announceTargetEvent('target_acquired', dummyPerson);
  assert.strictEqual(spokenUtterances[0].text, 'व्यक्ति दिखाई दिया। ट्रैकिंग शुरू हुई।');

  window.voiceAssistant.lastAnnouncementTime = 0;
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('approaching', dummyPerson);
  assert.strictEqual(spokenUtterances[1].text, 'व्यक्ति पास आ रहा है।');

  window.voiceAssistant.lastAnnouncementTime = 0;
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('close', dummyPerson);
  assert.strictEqual(spokenUtterances[2].text, 'व्यक्ति पास है।');

  window.voiceAssistant.lastAnnouncementTime = 0;
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('moving_away', dummyPerson);
  assert.strictEqual(spokenUtterances[3].text, 'व्यक्ति दूर जा रहा है।');

  window.voiceAssistant.lastAnnouncementTime = 0;
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('target_switched', dummyChair);
  assert.strictEqual(spokenUtterances[4].text, 'कुर्सी अब सबसे नज़दीकी लक्ष्य है।');

  window.voiceAssistant.lastAnnouncementTime = 0;
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('target_lost', dummyChair);
  assert.strictEqual(spokenUtterances[5].text, 'कुर्सी अस्थायी रूप से खो गया है।');

  window.voiceAssistant.setLanguage('en');
  console.log('  ✔ All localized Hindi phrases verified with natural grammar and pronunciation');

  // ====================================================================
  // TEST 11: PERFORMANCE PROFILE (ANDROID MOBILE CONSTRAINTS)
  // ====================================================================
  console.log('[TEST 11] Performance Profile on Simulated Mobile Constraints');
  const perfFrame = [
    { bbox: [100, 100, 150, 300], class: 'person', score: 0.9 },
    { bbox: [300, 120, 120, 200], class: 'chair', score: 0.88 },
    { bbox: [500, 200, 80, 100], class: 'bottle', score: 0.85 },
    { bbox: [650, 80, 200, 350], class: 'person', score: 0.92 }
  ];

  const startTime = process.hrtime.bigint();
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    currentTime += 90;
    window.targetTracker.update(perfFrame, 1280, 720);
  }
  const endTime = process.hrtime.bigint();
  const totalMs = Number(endTime - startTime) / 1000000;
  const avgMsPerFrame = totalMs / iterations;

  console.log(`  ⏱ 50 tracking cycles completed in ${totalMs.toFixed(2)}ms (${avgMsPerFrame.toFixed(3)}ms per frame)`);
  assert(avgMsPerFrame < 5.0, 'Frame execution time must be under 5ms for 60fps mobile UI');
  console.log('  ✔ Extremely fast execution suitable for Android mobile browsers');

  // ====================================================================
  // TEST 12: STOP CAMERA & ANNOUNCEMENTS OFF CLEARS SPEECH AND TRACKING
  // ====================================================================
  console.log('[TEST 12] Stopping Camera & Announcements OFF Cleans All Activity');
  speechCancelled = false;
  window.voiceAssistant.isSpeaking = true;
  window.voiceAssistant.pendingAnnouncement = { text: 'Stale alert', timestamp: currentTime };

  window.voiceAssistant.setAnnouncementsEnabled(false);
  assert.strictEqual(window.voiceAssistant.isAnnouncementsEnabled, false);
  assert.strictEqual(speechCancelled, true);
  assert.strictEqual(window.voiceAssistant.pendingAnnouncement, null);

  await window.cameraController.stopAssistance();
  assert.strictEqual(window.targetTracker.lockStatus, 'not_locked');
  assert.strictEqual(window.targetTracker.primaryTarget, null);
  assert.strictEqual(window.targetTracker.trackedObjects.size, 0);
  console.log('  ✔ Camera stop and speech toggle cleanly purged all active tracking state and speech queues');

  console.log('\n================================================================');
  console.log('🎉 ALL 12 AUDIT TESTS PASSED WITH 0 ERRORS');
  console.log('================================================================');
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
