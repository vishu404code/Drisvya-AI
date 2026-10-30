/**
 * DRISVYA Phase 2 - Comprehensive Verification Test Suite
 * Tests Real-Time Object Detection, Spatial Calculations (Left/Centre/Right),
 * Multi-Camera & Ultra-Wide Discovery, Bounding Box Coordinate Mapping,
 * and Assistance Lifecycle.
 */

const fs = require('fs');
const assert = require('assert');

console.log('=== DRISVYA PHASE 2 REAL-TIME AI & CAMERA AUDIT SUITE ===\n');

// 1. FILE AUDIT
const html = fs.readFileSync('index.html', 'utf8');
const styleCss = fs.readFileSync('css/style.css', 'utf8');
const componentsCss = fs.readFileSync('css/components.css', 'utf8');
const a11yCss = fs.readFileSync('css/accessibility.css', 'utf8');

// 2. CHECK HTML AI SCRIPT TAGS & ELEMENTS
console.log('[TEST 1] AI Script Tags & Phase 2 UI Elements');
assert(html.includes('tfjs'), 'TensorFlow.js CDN script missing in index.html');
assert(html.includes('coco-ssd'), 'COCO-SSD CDN script missing in index.html');
assert(html.includes('js/ai.js'), 'js/ai.js script tag missing in index.html');
assert(html.includes('id="overlayCanvas"'), 'Canvas overlay missing');
assert(html.includes('id="modelStatusBadge"'), 'HUD model status badge missing');
assert(html.includes('id="cameraSelectContainer"'), 'Camera lens selector container missing');
assert(html.includes('id="cameraSelectDropdown"'), 'Camera dropdown missing');
assert(html.includes('id="btnToggleUltraWide"'), 'Ultra-wide toggle button missing');
console.log('  ✔ HTML script tags and Phase 2 elements verified');

// 3. CSS AUDIT FOR CAMERA LENS & WIDE CONTROLS
console.log('[TEST 2] CSS Styling for Lens & Ultra-Wide Controls');
assert(componentsCss.includes('.camera-select-row'), 'CSS missing .camera-select-row');
assert(componentsCss.includes('.btn-lens-toggle'), 'CSS missing .btn-lens-toggle');
assert(a11yCss.includes('body.high-contrast-mode .camera-select-row'), 'High contrast CSS missing for camera select');
console.log('  ✔ CSS rules for multi-camera controls verified');

// 4. JAVASCRIPT & AI ENGINE SIMULATION SETUP
console.log('[TEST 3] AI Engine & Spatial Detection Unit Tests');

// Mock browser global environment
global.window = global;
global.tf = {
  ready: () => Promise.resolve(),
  getBackend: () => 'webgl'
};

let mockModelLoaded = false;
global.cocoSsd = {
  load: async (options) => {
    mockModelLoaded = true;
    return {
      detect: async (video, maxObjects, threshold) => {
        // Mock detections: person, chair, bottle
        return [
          { bbox: [120, 80, 240, 500], class: 'person', score: 0.94 },
          { bbox: [30, 200, 160, 220], class: 'chair', score: 0.82 },
          { bbox: [950, 160, 80, 180], class: 'bottle', score: 0.89 }
        ];
      }
    };
  }
};

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
    const el = {
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
        toggle(cls, force) { if (force) this.items.add(cls); else this.items.delete(cls); return this.items.has(cls); },
        contains(cls) { return this.items.has(cls); }
      },
      setAttribute(name, val) { this[name] = val; },
      getAttribute(name) { return this[name]; },
      addEventListener() {},
      querySelector() { return null; },
      appendChild(child) {
        if (this.options) this.options.push(child);
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
    };
    return el;
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

// 5. TEST AI ENGINE & MODEL LOADING (Testing Req 2)
(async () => {
  console.log('[TEST 4] AI Model Loading (COCO-SSD lite_mobilenet_v2)');
  await window.aiEngine.loadModel();
  assert.strictEqual(window.aiEngine.isReady, true, 'AI Engine should be ready');
  assert.strictEqual(mockModelLoaded, true, 'Mock model should be loaded');
  console.log('  ✔ AI model loaded successfully with lite_mobilenet_v2');

  // 6. TEST SPATIAL POSITION CALCULATIONS (Testing Req 7)
  console.log('[TEST 5] Spatial Position Calculation (Left / Centre / Right)');
  const vWidth = 1280;

  // Left object: x=50, w=100 -> center = 100 / 1280 = 0.078 < 0.35 -> Left
  const leftSpatial = window.aiEngine.calculateSpatialPosition([50, 50, 100, 100], vWidth);
  assert.strictEqual(leftSpatial.position, 'Left', 'Object on left should be identified as Left');
  assert.strictEqual(leftSpatial.positionHi, 'बाईं ओर', 'Hindi for Left must be correct');

  // Centre object: x=540, w=200 -> center = 640 / 1280 = 0.50 -> Centre
  const centreSpatial = window.aiEngine.calculateSpatialPosition([540, 50, 200, 200], vWidth);
  assert.strictEqual(centreSpatial.position, 'Centre', 'Object in middle should be identified as Centre');
  assert.strictEqual(centreSpatial.positionHi, 'सामने', 'Hindi for Centre must be correct');

  // Right object: x=1000, w=200 -> center = 1100 / 1280 = 0.859 > 0.65 -> Right
  const rightSpatial = window.aiEngine.calculateSpatialPosition([1000, 50, 200, 200], vWidth);
  assert.strictEqual(rightSpatial.position, 'Right', 'Object on right should be identified as Right');
  assert.strictEqual(rightSpatial.positionHi, 'दाईं ओर', 'Hindi for Right must be correct');
  console.log('  ✔ Spatial calculations for Left, Centre, and Right passed');

  // 7. TEST DETECTION OF PERSON, CHAIR, BOTTLE (Testing Req 3, 4, 5)
  console.log('[TEST 6] Detection of Person, Chair, and Bottle Classes');
  const mockVideo = document.getElementById('cameraVideo');
  const preds = await window.aiEngine.detect(mockVideo);
  assert(preds.some(p => p.class === 'person'), 'Must detect person');
  assert(preds.some(p => p.class === 'chair'), 'Must detect chair');
  assert(preds.some(p => p.class === 'bottle'), 'Must detect bottle');
  console.log(`  ✔ Detected ${preds.length} objects: ${preds.map(p => `${p.class} (${p.spatial.position})`).join(', ')}`);

  // 8. TEST CAMERA CONTROLLER INITIALIZATION & CAMERA DISCOVERY (Testing Req 1, 9)
  console.log('[TEST 7] Multi-Camera & Ultra-Wide Discovery');
  window.cameraController.init();
  await window.cameraController.discoverCameraDevices();
  assert(window.cameraController.availableDevices.length >= 2, 'Should discover multiple camera devices');
  console.log(`  ✔ Discovered ${window.cameraController.availableDevices.length} camera devices`);

  // Test ultra-wide hardware zoom toggle
  window.cameraController.activeTrack = {
    getCapabilities: () => ({ zoom: { min: 0.5, max: 8.0 } }),
    applyConstraints: async (c) => {
      assert(c.advanced[0].zoom <= 1.0, 'Zoom constraint should be <= 1.0');
    }
  };
  await window.cameraController.toggleUltraWideZoom();
  assert.strictEqual(window.cameraController.isUltraWideActive, true, 'Ultra-wide should be active');
  console.log('  ✔ Ultra-wide lens toggle passed');

  // 9. TEST CAMERA ASSISTANCE START & DETECTION (Testing Req 1, 6, 8)
  console.log('[TEST 8] Camera Start, Processing & Bounding Box Rendering');
  await window.cameraController.startAssistance();
  assert.strictEqual(window.cameraController.isActive, true, 'Camera should be active');

  // Process predictions and verify counts
  window.cameraController.processDetectionResults(preds);
  assert.strictEqual(window.cameraController.detections.objects, 3, 'Objects count should be 3');
  assert.strictEqual(window.cameraController.detections.people, 1, 'People count should be 1');
  assert(window.cameraController.detections.nearest.includes('PERSON'), 'Nearest should identify largest object (PERSON)');

  // Test drawBoundingBoxes execution
  window.cameraController.drawBoundingBoxes(preds);
  console.log('  ✔ Camera started and bounding boxes rendered without errors');

  // 10. TEST CAMERA STOP & CLEANUP (Testing Req 10)
  console.log('[TEST 9] Camera Stop & Complete Detection Cleanup');
  await window.cameraController.stopAssistance();
  assert.strictEqual(window.cameraController.isActive, false, 'Camera should be inactive');
  assert.strictEqual(window.cameraController.isDetecting, false, 'Detection should be stopped');
  assert.strictEqual(window.cameraController.stream, null, 'Stream tracks should be released');
  assert.strictEqual(window.cameraController.detections.objects, 0, 'Object counts should reset to 0');
  console.log('  ✔ Camera stopped and all detection resources cleanly released');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE 2 VERIFICATION SUITES PASSED WITH 0 ERRORS');
  console.log('================================================================');
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
