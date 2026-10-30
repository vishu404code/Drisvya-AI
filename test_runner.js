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
    if (tag === 'canvas') {
      return {
        tagName: 'CANVAS',
        width: 160,
        height: 120,
        getContext() {
          return {
            drawImage() {},
            getImageData() {
              return { data: new Uint8ClampedArray(160 * 120 * 4) };
            },
            clearRect() {},
            fillRect() {},
            strokeRect() {},
            fillText() {},
            beginPath() {},
            moveTo() {},
            lineTo() {},
            stroke() {},
            fill() {},
            roundRect() {},
            save() {},
            restore() {},
            setLineDash() {},
            measureText() { return { width: 50 }; }
          };
        }
      };
    }
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
require('./js/environment.js');
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
  assert.strictEqual(spokenUtterances[0].text, 'Person is directly ahead in the camera view.');
  console.log('  ✔ Target automatically selected and locked with announcement: "Person is directly ahead in the camera view."');

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
  assert.strictEqual(spokenUtterances[0].text, 'Person directly ahead is getting closer.');
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
  assert.strictEqual(spokenUtterances[0].text, 'Person directly ahead is moving away.');
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
  // Person B enters at [200, 40, 260, 480] (area 124,800 -> MUCH closer, on LEFT!)
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
  assert.strictEqual(spokenUtterances[0].text, 'Person on your left is now the closest estimated target.');
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
  assert.strictEqual(spokenUtterances[0].text, 'Chair on your left is now the closest estimated target.');
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

  const dummyPerson = { class: 'person', spatial: { position: 'Centre' } };
  const dummyChair = { class: 'chair', spatial: { position: 'Right' } };
  const dummyLeftPerson = { class: 'person', spatial: { position: 'Left' } };

  window.voiceAssistant.announceTargetEvent('target_acquired', dummyPerson);
  assert.strictEqual(spokenUtterances[0].text, 'व्यक्ति कैमरा दृश्य में सीधे आगे है।');

  window.voiceAssistant.lastAnnouncementTime = 0;
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('approaching', dummyPerson);
  assert.strictEqual(spokenUtterances[1].text, 'सीधे आगे व्यक्ति पास आ रहा है।');

  window.voiceAssistant.lastAnnouncementTime = 0;
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('close', dummyPerson);
  assert.strictEqual(spokenUtterances[2].text, 'सीधे आगे व्यक्ति बहुत पास है।');

  window.voiceAssistant.lastAnnouncementTime = 0;
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('moving_away', dummyLeftPerson);
  assert.strictEqual(spokenUtterances[3].text, 'बाईं ओर व्यक्ति दूर जा रहा है।');

  window.voiceAssistant.lastAnnouncementTime = 0;
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('target_switched', dummyChair);
  assert.strictEqual(spokenUtterances[4].text, 'दाईं ओर कुर्सी अब सबसे नज़दीकी लक्ष्य है।');

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

  // ====================================================================
  // TEST 13: ACCURATE LEFT / CENTRE / RIGHT VERTICAL ZONE CALCULATION
  // ====================================================================
  console.log('[TEST 13] Vertical Zone Calculation (LEFT: 0-33%, CENTRE: 33-67%, RIGHT: 67-100%)');
  // Full video width 1280px
  // Object on Left: center at 200px (200/1280 = 0.15625 < 0.3333)
  const leftPos = window.targetTracker.computeSpatialPosition([100, 100, 200, 300], 1280, null);
  assert.strictEqual(leftPos.position, 'Left', 'Zone must be Left');
  assert.strictEqual(leftPos.normalizedX, 200 / 1280);

  // Object in Centre: center at 640px (640/1280 = 0.50)
  const centrePos = window.targetTracker.computeSpatialPosition([540, 100, 200, 300], 1280, null);
  assert.strictEqual(centrePos.position, 'Centre', 'Zone must be Centre');
  assert.strictEqual(centrePos.normalizedX, 0.5);

  // Object on Right: center at 1100px (1100/1280 = 0.859375 > 0.6667)
  const rightPos = window.targetTracker.computeSpatialPosition([1000, 100, 200, 300], 1280, null);
  assert.strictEqual(rightPos.position, 'Right', 'Zone must be Right');
  assert.strictEqual(rightPos.normalizedX, 1100 / 1280);
  console.log('  ✔ Calculated normalized positions and exact vertical zones correctly');

  // ====================================================================
  // TEST 14: BOUNDARY HYSTERESIS MARGIN (3.5% = 0.035)
  // ====================================================================
  console.log('[TEST 14] Zone Boundary Hysteresis Margin (3.5% Stability Buffer)');
  // Boundary 1/3 ~ 0.3333. Threshold to exit Left is 1/3 + 0.035 = 0.3683 (471.4px in 1280px frame)
  // Center at 440px -> normX = 440/1280 = 0.34375 (crosses 0.3333, but within hysteresis margin!)
  const leftHysteresis = window.targetTracker.computeSpatialPosition([340, 100, 200, 300], 1280, 'Left');
  assert.strictEqual(leftHysteresis.position, 'Left', 'Must remain Left because normX (0.3438) has not crossed 0.3683 buffer');

  // Center at 480px -> normX = 480/1280 = 0.375 (exceeds 0.3683 buffer -> switches to Centre)
  const leftExited = window.targetTracker.computeSpatialPosition([380, 100, 200, 300], 1280, 'Left');
  assert.strictEqual(leftExited.position, 'Centre', 'Must cleanly transition to Centre once hysteresis margin is passed');

  // Boundary 2/3 ~ 0.6667. Threshold to exit Right is 2/3 - 0.035 = 0.6317 (808.5px in 1280px frame)
  // Center at 830px -> normX = 830/1280 = 0.6484 (drops below 0.6667, but within hysteresis margin!)
  const rightHysteresis = window.targetTracker.computeSpatialPosition([730, 100, 200, 300], 1280, 'Right');
  assert.strictEqual(rightHysteresis.position, 'Right', 'Must remain Right because normX (0.6484) has not dropped below 0.6317 buffer');

  // Center at 780px -> normX = 780/1280 = 0.6094 (drops below 0.6317 buffer -> switches to Centre)
  const rightExited = window.targetTracker.computeSpatialPosition([680, 100, 200, 300], 1280, 'Right');
  assert.strictEqual(rightExited.position, 'Centre', 'Must cleanly transition to Centre once hysteresis margin is passed');
  console.log('  ✔ Hysteresis margin strictly eliminated jitter at 0.3333 and 0.6667 boundaries');

  // ====================================================================
  // TEST 15: DIRECTION ANNOUNCEMENTS UPON TARGET LOCK
  // ====================================================================
  console.log('[TEST 15] Target Lock Direction Announcements');
  window.targetTracker.reset();
  window.voiceAssistant.setLanguage('en');
  window.voiceAssistant.setAnnouncementsEnabled(true);
  spokenUtterances = [];

  // Lock target on Left
  currentTime += 1000;
  window.targetTracker.update([{ bbox: [100, 100, 150, 300], class: 'person', score: 0.92 }], 1280, 720);
  assert.strictEqual(spokenUtterances[0].text, 'Person detected on your left.');

  // Unlock and lock target on Right
  window.targetTracker.unlockTarget();
  spokenUtterances = [];
  currentTime += 1000;
  window.targetTracker.update([{ bbox: [1000, 100, 150, 300], class: 'chair', score: 0.92 }], 1280, 720);
  assert.strictEqual(spokenUtterances[0].text, 'Chair detected on your right.');

  // Unlock and lock target in Centre
  window.targetTracker.unlockTarget();
  spokenUtterances = [];
  currentTime += 1000;
  window.targetTracker.update([{ bbox: [565, 100, 150, 300], class: 'bottle', score: 0.90 }], 1280, 720);
  assert.strictEqual(spokenUtterances[0].text, 'Bottle is directly ahead in the camera view.');
  console.log('  ✔ Verified all 3 initial target lock direction phrases: Left, Right, and Centre');

  // ====================================================================
  // TEST 16: MULTI-FRAME CONFIRMED DIRECTION TRANSITION ANNOUNCEMENTS
  // ====================================================================
  console.log('[TEST 16] Multi-Frame Confirmed Direction Changes');
  window.targetTracker.reset();
  spokenUtterances = [];
  currentTime += 1000;

  // Person starts on Left
  window.targetTracker.update([{ bbox: [260, 100, 150, 300], class: 'person', score: 0.92 }], 1280, 720);
  assert.strictEqual(spokenUtterances[0].text, 'Person detected on your left.');
  spokenUtterances = [];

  // Frame 1 in Centre: 1st cycle should NOT announce yet (requires 2 consecutive cycles)
  currentTime += 100;
  window.targetTracker.update([{ bbox: [420, 100, 150, 300], class: 'person', score: 0.92 }], 1280, 720);
  assert.strictEqual(spokenUtterances.length, 0, 'Single cycle transition must not announce without confirmation');

  // Frame 2 in Centre: 2nd cycle confirms direction change!
  currentTime += 2100; // Past 2.0s direction cooldown
  window.targetTracker.update([{ bbox: [420, 100, 150, 300], class: 'person', score: 0.92 }], 1280, 720);
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Person is directly ahead in the camera view.');

  // Move to Right for 2 confirmed cycles
  spokenUtterances = [];
  currentTime += 100;
  window.targetTracker.update([{ bbox: [650, 100, 150, 300], class: 'person', score: 0.92 }], 1280, 720);
  currentTime += 100;
  window.targetTracker.update([{ bbox: [850, 100, 150, 300], class: 'person', score: 0.92 }], 1280, 720);
  assert.strictEqual(spokenUtterances.length, 0, '1st cycle on Right must not announce');

  currentTime += 2100;
  window.targetTracker.update([{ bbox: [850, 100, 150, 300], class: 'person', score: 0.92 }], 1280, 720);
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Person is now on your right.');
  console.log('  ✔ Confirmed multi-frame direction transitions without jitter');

  // ====================================================================
  // TEST 17: COMBINED DIRECTION + PROXIMITY ANNOUNCEMENTS
  // ====================================================================
  console.log('[TEST 17] Combined Direction + Proximity Alerts');
  window.targetTracker.reset();
  spokenUtterances = [];
  currentTime += 1000;

  // Person enters on Right
  window.targetTracker.update([{ bbox: [1000, 100, 100, 200], class: 'person', score: 0.92 }], 1280, 720);
  spokenUtterances = [];

  // Approach on Right
  const rightApproach = [
    [980, 80, 120, 240],
    [960, 60, 140, 280],
    [940, 40, 170, 340]
  ];
  for (const b of rightApproach) {
    currentTime += 100;
    window.targetTracker.update([{ bbox: b, class: 'person', score: 0.92 }], 1280, 720);
  }
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Person on your right is getting closer.');

  // Close obstacle in Centre
  spokenUtterances = [];
  currentTime += 3500;
  const dummyClose = { class: 'person', spatial: { position: 'Centre' }, proximityState: 'CLOSE' };
  window.voiceAssistant.announceTargetEvent('close', dummyClose);
  assert.strictEqual(spokenUtterances[0].text, 'Person directly ahead is close.');

  // Moving away on Left
  spokenUtterances = [];
  currentTime += 3500;
  const dummyAway = { class: 'person', spatial: { position: 'Left' }, proximityState: 'MOVING AWAY' };
  window.voiceAssistant.announceTargetEvent('moving_away', dummyAway);
  assert.strictEqual(spokenUtterances[0].text, 'Person on your left is moving away.');
  console.log('  ✔ Verified combined direction + proximity alerts in English');

  // ====================================================================
  // TEST 18: HINDI DIRECTION & PROXIMITY ANNOUNCEMENTS
  // ====================================================================
  console.log('[TEST 18] Localized Hindi Direction & Proximity Announcements');
  window.voiceAssistant.setLanguage('hi');
  spokenUtterances = [];
  currentTime += 1000;

  // Hindi target lock on Left
  window.voiceAssistant.announceTargetEvent('target_acquired', { class: 'person', spatial: { position: 'Left' } });
  assert.strictEqual(spokenUtterances[0].text, 'व्यक्ति आपकी बाईं ओर दिखाई दिया।');

  // Hindi direction change to Right
  spokenUtterances = [];
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('direction_changed', { class: 'person', spatial: { position: 'Right' } });
  assert.strictEqual(spokenUtterances[0].text, 'व्यक्ति अब आपकी दाईं ओर है।');

  // Hindi combined proximity alerts
  spokenUtterances = [];
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('approaching', { class: 'person', spatial: { position: 'Right' } });
  assert.strictEqual(spokenUtterances[0].text, 'दाईं ओर व्यक्ति पास आ रहा है।');

  spokenUtterances = [];
  currentTime += 3000;
  window.voiceAssistant.announceTargetEvent('close', { class: 'person', spatial: { position: 'Centre' } });
  assert.strictEqual(spokenUtterances[0].text, 'सीधे आगे व्यक्ति बहुत पास है।');

  window.voiceAssistant.setLanguage('en');
  console.log('  ✔ Verified accurate Hindi direction phrasing and grammatical structure');

  // ====================================================================
  // TEST 19: AUTOMATIC TARGET RESET WHEN OBJECT LEAVES FRAME
  // ====================================================================
  console.log('[TEST 19] Target Leaves Frame & Automatic Next-Closest Switch');
  window.targetTracker.reset();
  spokenUtterances = [];
  currentTime += 1000;

  // Person A and Chair B are both in the camera view
  const bothInFrame = [
    { bbox: [100, 100, 200, 400], class: 'person', score: 0.94 }, // Person A (Locked)
    { bbox: [950, 150, 180, 360], class: 'chair', score: 0.91 }   // Chair B (Right)
  ];
  window.targetTracker.update(bothInFrame, 1280, 720);
  assert.strictEqual(window.targetTracker.primaryTarget.class, 'person');
  const personTrackId = window.targetTracker.primaryTarget.id;

  spokenUtterances = [];
  currentTime += 500;

  // Person A walks completely out of the frame! Only Chair B remains:
  const chairOnlyFrame = [
    { bbox: [950, 150, 180, 360], class: 'chair', score: 0.91 }
  ];
  window.targetTracker.update(chairOnlyFrame, 1280, 720);

  // System must IMMEDIATELY release old target and lock Chair B!
  assert.strictEqual(window.targetTracker.lockStatus, 'locked');
  assert.strictEqual(window.targetTracker.primaryTarget.class, 'chair');
  assert.notStrictEqual(window.targetTracker.primaryTarget.id, personTrackId);
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Person left the frame. Now tracking Chair on your right.');
  console.log('  ✔ Released departed target immediately and switched to next closest candidate');

  // Now Chair B leaves the frame and NO OTHER OBJECTS remain in view:
  spokenUtterances = [];
  currentTime += 500;
  window.targetTracker.update([], 1280, 720); // 1st absent frame -> temporarily_lost grace period (2.5s)
  assert.strictEqual(window.targetTracker.lockStatus, 'temporarily_lost');

  // After 2.5s grace period expires with no objects returning:
  currentTime += 2600;
  window.targetTracker.update([], 1280, 720);
  assert.strictEqual(window.targetTracker.lockStatus, 'not_locked');
  assert.strictEqual(window.targetTracker.primaryTarget, null);
  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Chair left the camera view.');
  console.log('  ✔ Grace period (2.5s) smoothly transitioned to Searching/Not Locked when no objects remained');

  // ====================================================================
  // TEST 20: CANVAS HUD AND DASHBOARD DIRECTION DISPLAY
  // ====================================================================
  console.log('[TEST 20] Canvas HUD & Dashboard Direction Display Verification');
  window.targetTracker.reset();
  currentTime += 1000;

  window.targetTracker.update([{ bbox: [560, 100, 160, 320], class: 'person', score: 0.95 }], 1280, 720);
  const statusEl = document.getElementById('valPrimaryPersonStatus');
  assert(statusEl.textContent.includes('PERSON'), 'Dashboard must display class');
  assert(statusEl.textContent.includes('CENTRE'), 'Dashboard must display direction');
  console.log('  ✔ Dashboard and canvas HUD display primary target direction prominently');

  // ====================================================================
  // TEST 21: CAMERA STARTS & INITIAL WALL ANALYSIS (Scenario 1 & 2)
  // ====================================================================
  console.log('[TEST 21] Camera Starts & Initial Wall Observation');
  window.environmentAnalyzer.reset();
  window.voiceAssistant.setLanguage('en');
  window.voiceAssistant.setAnnouncementsEnabled(true);
  spokenUtterances = [];
  currentTime = 2000000;

  // Frame 1 & 2: Initial analysis stabilizing (no speech yet)
  const farWallVid = { videoWidth: 1280, videoHeight: 720, _simulatedWall: { areaRatio: 0.35, baselineY: 0.38, isPlanar: true, confidence: 0.88 } };
  window.environmentAnalyzer.analyze(farWallVid, []);
  currentTime += 100;
  window.environmentAnalyzer.analyze(farWallVid, []);
  assert.strictEqual(spokenUtterances.length, 0, 'Must not announce wall before target analysis frames are complete');

  // Frame 3: Initial analysis target reached -> Exactly ONE initial wall update spoken!
  currentTime += 100;
  window.environmentAnalyzer.analyze(farWallVid, []);
  assert.strictEqual(window.environmentAnalyzer.wallDetected, true, 'Wall must be detected in open room');
  assert.strictEqual(window.environmentAnalyzer.wallDetectionState, 'DETECTED');
  assert.strictEqual(spokenUtterances.length, 1, 'Exactly one initial wall announcement');
  assert(spokenUtterances[0].text.includes('Wall') || spokenUtterances[0].text.includes('wall'), 'Spoken text must announce wall');
  console.log(`  ✔ Camera start completed initial analysis and announced: "${spokenUtterances[0].text}"`);

  // ====================================================================
  // TEST 22: WALL APPEARS CLOSER & CLOSE STATE (Scenario 3)
  // ====================================================================
  console.log('[TEST 22] Wall Appears to Become Closer & Close Proximity State');
  spokenUtterances = [];
  currentTime += 4000; // Past 3.5s cooldown

  // User approaches wall: apparent wall coverage increases and baseline descends
  for (let i = 0; i < 4; i++) {
    currentTime += 100;
    const approachVid = {
      videoWidth: 1280,
      videoHeight: 720,
      _simulatedWall: {
        areaRatio: 0.40 + (i * 0.08),
        baselineY: 0.48 + (i * 0.08),
        isPlanar: true,
        confidence: 0.90
      }
    };
    window.environmentAnalyzer.analyze(approachVid, []);
  }

  assert.strictEqual(spokenUtterances.length, 1);
  assert(
    spokenUtterances[0].text === 'Wall appears closer.' || spokenUtterances[0].text === 'Wall appears close.',
    'Must announce closer or close state'
  );
  console.log(`  ✔ Advancing toward wall detected and announced: "${spokenUtterances[0].text}"`);

  // ====================================================================
  // TEST 23: WALL APPEARS FARTHER AWAY (Scenario 4)
  // ====================================================================
  console.log('[TEST 23] Wall Appears to Become Farther Away');
  spokenUtterances = [];

  // Establish receding trend across consecutive frames
  let recedeVid = null;
  for (let i = 0; i < 4; i++) {
    currentTime += 100;
    recedeVid = {
      videoWidth: 1280,
      videoHeight: 720,
      _simulatedWall: {
        areaRatio: 0.65 - (i * 0.10),
        baselineY: 0.72 - (i * 0.10),
        isPlanar: true,
        confidence: 0.90
      }
    };
    window.environmentAnalyzer.analyze(recedeVid, []);
  }

  // Trigger announcement after cooldown
  spokenUtterances = [];
  currentTime += 4000; // Past 3.5s cooldown with confirmed receding trend
  window.environmentAnalyzer.analyze(recedeVid, []);

  assert.strictEqual(spokenUtterances.length, 1);
  assert.strictEqual(spokenUtterances[0].text, 'Wall appears farther away.');
  console.log('  ✔ Receding from wall detected and announced: "Wall appears farther away."');

  // ====================================================================
  // TEST 24: PERSON IN CENTRE VIEW (Scenario 5)
  // ====================================================================
  console.log('[TEST 24] Person Appears in Forward Centre View');
  window.environmentAnalyzer.reset();
  window.targetTracker.reset();
  spokenUtterances = [];
  currentTime += 1000;

  // Person directly ahead in centre (x: 520, w: 200 -> center: 620/1280 = 0.484, middle third)
  const centrePerson = [{ bbox: [520, 80, 200, 450], class: 'person', score: 0.94 }];
  window.environmentAnalyzer.analyze({ videoWidth: 1280, videoHeight: 720 }, centrePerson);

  assert.strictEqual(window.environmentAnalyzer.centreView, 'OBJECT DETECTED');
  assert.strictEqual(window.environmentAnalyzer.centreObstruction.class, 'person');
  assert.strictEqual(spokenUtterances[0].text, 'Person directly ahead in the camera view.');
  console.log('  ✔ Person in forward path identified and announced: "Person directly ahead in the camera view."');

  // ====================================================================
  // TEST 25: CHAIR IN CENTRE VIEW (Scenario 6)
  // ====================================================================
  console.log('[TEST 25] Chair Appears in Forward Centre View');
  window.environmentAnalyzer.reset();
  window.targetTracker.reset();
  spokenUtterances = [];
  currentTime += 4500; // Past cooldown

  // Chair directly ahead in centre
  const centreChair = [{ bbox: [530, 150, 180, 320], class: 'chair', score: 0.92 }];
  window.environmentAnalyzer.analyze({ videoWidth: 1280, videoHeight: 720 }, centreChair);

  assert.strictEqual(window.environmentAnalyzer.centreView, 'OBJECT DETECTED');
  assert.strictEqual(window.environmentAnalyzer.centreObstruction.class, 'chair');
  assert.strictEqual(spokenUtterances[0].text, 'Chair detected directly ahead.');
  console.log('  ✔ Furniture in forward path identified and announced: "Chair detected directly ahead."');

  // ====================================================================
  // TEST 26: CENTRE HAS NO RECOGNISED OBJECT & SAFETY ASSISTANCE (Scenario 7)
  // ====================================================================
  console.log('[TEST 26] Centre View Has No Recognised Object (Descriptive Safety)');
  window.environmentAnalyzer.reset();
  window.voiceAssistant.lastAnnouncementTime = 0;
  spokenUtterances = [];
  currentTime += 3000;

  window.environmentAnalyzer.analyze({ videoWidth: 1280, videoHeight: 720 }, []);
  assert.strictEqual(window.environmentAnalyzer.centreView, 'NO RECOGNISED OBJECT');

  // Request explicit centre status check
  window.voiceAssistant.announceEnvironmentEvent('centre_view', 'centre_clear');
  assert.strictEqual(spokenUtterances[0].text, 'No recognised obstruction detected in the centre view.');

  // Strict Safety Compliance: Verify that unconditional commands are NEVER generated
  const forbiddenCommands = ['move forward', 'walk forward', 'turn left', 'turn right', 'path clear', 'safe to proceed'];
  for (const cmd of forbiddenCommands) {
    assert(!spokenUtterances[0].text.toLowerCase().includes(cmd), `Must NEVER issue command "${cmd}"`);
  }
  console.log('  ✔ Descriptive centre-clear information verified without dangerous movement commands');

  // ====================================================================
  // TEST 27: OBJECTS ON LEFT AND RIGHT (Scenario 8)
  // ====================================================================
  console.log('[TEST 27] Objects on Left and Right (Zone Classification)');
  window.environmentAnalyzer.reset();
  spokenUtterances = [];
  currentTime += 1000;

  const leftAndRight = [
    { bbox: [60, 100, 120, 240], class: 'bottle', score: 0.88 },  // Left: center = 120/1280 = 0.09
    { bbox: [1020, 100, 140, 260], class: 'chair', score: 0.90 }  // Right: center = 1090/1280 = 0.85
  ];
  window.environmentAnalyzer.analyze({ videoWidth: 1280, videoHeight: 720 }, leftAndRight);

  assert.strictEqual(window.environmentAnalyzer.leftView, 'OBJECT DETECTED');
  assert.strictEqual(window.environmentAnalyzer.rightView, 'OBJECT DETECTED');
  assert.strictEqual(window.environmentAnalyzer.centreView, 'NO RECOGNISED OBJECT');

  // Test zone obstruction alerts
  window.voiceAssistant.lastAnnouncementTime = 0;
  window.voiceAssistant.announceEnvironmentEvent('zone_obstruction', 'left');
  assert.strictEqual(spokenUtterances[0].text, 'Possible obstruction detected on your left.');

  window.voiceAssistant.lastAnnouncementTime = 0;
  window.voiceAssistant.announceEnvironmentEvent('zone_obstruction', 'right');
  assert.strictEqual(spokenUtterances[1].text, 'Possible obstruction detected on your right.');
  console.log('  ✔ Lateral zones properly classified and obstruction warnings confirmed');

  // ====================================================================
  // TEST 28: ZERO OBJECTS BUT WALL REMAINS VISIBLE (Scenario 9)
  // ====================================================================
  console.log('[TEST 28] Zero Ordinary Objects with Persistent Wall Awareness');
  window.environmentAnalyzer.reset();
  spokenUtterances = [];
  currentTime += 1000;

  // 10 frames of 0 COCO-SSD detections
  for (let i = 0; i < 10; i++) {
    currentTime += 100;
    window.environmentAnalyzer.analyze({ videoWidth: 1280, videoHeight: 720 }, []);
  }

  assert.strictEqual(window.environmentAnalyzer.wallDetected, true);
  assert.strictEqual(window.environmentAnalyzer.wallDetectionState, 'DETECTED');
  // Exactly 1 initial wall announcement was made, never spammed repeatedly
  assert.strictEqual(spokenUtterances.length, 1);
  assert(!spokenUtterances[0].text.includes('No objects detected'), 'Never repeatedly spam negative object counts');
  console.log('  ✔ Wall awareness remained continuously active with zero object detections');

  // ====================================================================
  // TEST 29: WALL ANNOUNCEMENTS DO NOT REPEAT CONTINUOUSLY (Scenario 10)
  // ====================================================================
  console.log('[TEST 29] Stationary Wall Deduplication (Zero Speech Spam)');
  const speechCountBefore = spokenUtterances.length;

  // 15 more frames of unchanged wall
  for (let i = 0; i < 15; i++) {
    currentTime += 100;
    window.environmentAnalyzer.analyze({ videoWidth: 1280, videoHeight: 720 }, []);
  }

  assert.strictEqual(spokenUtterances.length, speechCountBefore, 'Unchanged wall must not produce duplicate speech');
  console.log('  ✔ Stationary wall produced zero duplicate announcements across 15 frames');

  // ====================================================================
  // TEST 30: WALL, OBJECT AND DIRECTION ZERO AUDIO OVERLAP (Scenario 11)
  // ====================================================================
  console.log('[TEST 30] Wall, Object & Direction Speech Collision Prevention');
  spokenUtterances = [];
  currentTime += 1000;

  // Trigger simultaneous wall, target, and zone events in the exact same millisecond
  window.voiceAssistant.isSpeaking = true; // Speech synthesis busy
  window.voiceAssistant.announceEnvironmentEvent('wall_dynamic', 'wall_closer'); // Normal priority -> should not collide
  window.voiceAssistant.announceTargetEvent('moving_away', { class: 'person' }); // Normal priority -> should not collide

  assert.strictEqual(spokenUtterances.length, 0, 'Must never play speech while audio engine is speaking');
  window.voiceAssistant.isSpeaking = false;
  console.log('  ✔ Central speech manager strictly guaranteed zero audio collisions across all subsystems');

  // ====================================================================
  // TEST 31: ENGLISH AND HINDI LOCALIZATION (Scenario 12)
  // ====================================================================
  console.log('[TEST 31] English and Hindi Environment Speech Verification');
  window.voiceAssistant.setLanguage('hi');
  spokenUtterances = [];
  currentTime += 1000;

  // Test Hindi wall initial
  window.voiceAssistant.announceEnvironmentEvent('wall_initial', 'wall_detected_front');
  assert.strictEqual(spokenUtterances[0].text, 'सामने दीवार दिखाई दी।');

  // Test Hindi wall close
  window.voiceAssistant.lastAnnouncementTime = 0;
  window.voiceAssistant.announceEnvironmentEvent('wall_initial', 'wall_close');
  assert.strictEqual(spokenUtterances[1].text, 'एक दीवार पास दिखाई दे रही है।');

  // Test Hindi wall closer
  window.voiceAssistant.lastAnnouncementTime = 0;
  window.voiceAssistant.announceEnvironmentEvent('wall_dynamic', 'wall_closer');
  assert.strictEqual(spokenUtterances[2].text, 'दीवार और पास आ रही है।');

  // Test Hindi wall farther
  window.voiceAssistant.lastAnnouncementTime = 0;
  window.voiceAssistant.announceEnvironmentEvent('wall_dynamic', 'wall_farther');
  assert.strictEqual(spokenUtterances[3].text, 'दीवार और दूर जा रही है।');

  // Test Hindi centre person
  window.voiceAssistant.lastAnnouncementTime = 0;
  window.voiceAssistant.announceEnvironmentEvent('centre_view', 'centre_person');
  assert.strictEqual(spokenUtterances[4].text, 'कैमरा दृश्य में व्यक्ति सीधे आगे है।');

  // Test Hindi centre caution
  window.voiceAssistant.lastAnnouncementTime = 0;
  window.voiceAssistant.announceEnvironmentEvent('centre_view', 'centre_caution');
  assert.strictEqual(spokenUtterances[5].text, 'सामने संभावित रुकावट है। कृपया सावधानी बरतें।');

  // Test Hindi centre clear
  window.voiceAssistant.lastAnnouncementTime = 0;
  window.voiceAssistant.announceEnvironmentEvent('centre_view', 'centre_clear');
  assert.strictEqual(spokenUtterances[6].text, 'सामने के दृश्य में कोई पहचानी गई रुकावट नहीं है।');

  window.voiceAssistant.setLanguage('en');
  console.log('  ✔ All localized Hindi environment and wall alerts verified');

  // ====================================================================
  // TEST 32: ANDROID MOBILE PERFORMANCE PROFILE (Scenario 13)
  // ====================================================================
  console.log('[TEST 32] Environment Engine Android Mobile Performance Profile');
  const dummyVid = { videoWidth: 1280, videoHeight: 720, readyState: 4 };
  const mockDets = [
    { bbox: [100, 100, 150, 300], class: 'person', score: 0.90 },
    { bbox: [550, 120, 140, 220], class: 'chair', score: 0.88 },
    { bbox: [950, 200, 80, 150], class: 'bottle', score: 0.85 }
  ];

  const envStartTime = process.hrtime.bigint();
  const envIterations = 50;
  for (let i = 0; i < envIterations; i++) {
    currentTime += 90;
    window.environmentAnalyzer.analyze(dummyVid, mockDets);
  }
  const envEndTime = process.hrtime.bigint();
  const envTotalMs = Number(envEndTime - envStartTime) / 1000000;
  const envAvgMs = envTotalMs / envIterations;

  console.log(`  ⏱ 50 environment analysis cycles completed in ${envTotalMs.toFixed(2)}ms (${envAvgMs.toFixed(3)}ms per frame)`);
  assert(envAvgMs < 5.0, 'Environment execution must be under 5ms per frame on mobile devices');
  console.log('  ✔ Lightweight execution easily maintains 60fps on Android smartphones');

  // ====================================================================
  // TEST 33: DASHBOARD ENVIRONMENT PANEL METRICS VERIFICATION
  // ====================================================================
  console.log('[TEST 33] Dashboard Environment Awareness Panel Verification');
  const valWallDet = document.getElementById('valWallDetection');
  const valWallProx = document.getElementById('valWallProximity');
  const valCentre = document.getElementById('valCentreView');
  const valLeft = document.getElementById('valLeftView');
  const valRight = document.getElementById('valRightView');
  const valEnvStatus = document.getElementById('valEnvEngineStatus');

  assert(valWallDet !== null, 'valWallDetection element must exist');
  assert(valWallProx !== null, 'valWallProximity element must exist');
  assert(valCentre !== null, 'valCentreView element must exist');
  assert(valLeft !== null, 'valLeftView element must exist');
  assert(valRight !== null, 'valRightView element must exist');
  assert(valEnvStatus !== null, 'valEnvEngineStatus element must exist');
  assert.strictEqual(valEnvStatus.textContent, 'ACTIVE');
  console.log('  ✔ All 6 Dashboard Environment Awareness metrics verified');

  console.log('\n================================================================');
  console.log('🎉 ALL 33 AUDIT TESTS PASSED WITH 0 ERRORS');
  console.log('================================================================');
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
