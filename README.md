# DRISVYA (दृश्या) — AI-Powered Assistive Vision Platform

> **"Your World, Understood."**  
> **Brand:** DRISVYA  
> **Tagline:** Your World, Understood.  
> **Category:** AI-Powered Assistive Vision Platform  

DRISVYA is a mobile-first, AI-powered assistive vision platform engineered specifically to help visually impaired and low-vision individuals navigate and perceive their surroundings using smartphone cameras, on-device neural networks, and voice assistance.

---

## 🚀 Phase 2 Deliverables: Real-Time AI Detection & Camera Coverage

Phase 2 introduces **real-time on-device neural vision and enhanced camera coverage** while strictly preserving the accessible dashboard:

### 1. Real-Time On-Device AI Object Detection
- **TensorFlow.js + COCO-SSD:** Runs client-side neural inference using the lightweight `lite_mobilenet_v2` backbone.
- **Low Latency & Battery Throttling:** Non-overlapping inference loop throttled to ~11 FPS (90ms) to prevent overheating and battery drain on Android smartphones, while maintaining 60 FPS UI rendering.
- **Accurate Bounding Boxes:** High-contrast color-coded bounding boxes (green for people, amber for vehicles, cyan for general objects) with corner brackets and spatial labels.
- **Coordinate Projection:** Mathematical coordinate scaling that maps full video frames to `object-fit: cover` container viewports with sub-pixel alignment.
- **Common Objects Supported:** Person, chair, bottle, cup, laptop, cell phone, car, bus, bicycle, table, dog, cat, and 70+ COCO-SSD classes.

### 2. Multi-Camera & Wide-Angle Lens Support
- **Default Rear-Facing Camera:** Initializes using `facingMode: { ideal: "environment" }`.
- **Hardware Lens Discovery:** Enumerates `videoinput` devices via `navigator.mediaDevices.enumerateDevices()`, discovering secondary back lenses and ultra-wide cameras (e.g. 0.5x / 0.6x).
- **Camera Selection Control:** When multiple camera devices are available, presents an accessible lens selector dropdown (`#cameraSelectDropdown`).
- **Hardware Ultra-Wide Zoom:** Queries `track.getCapabilities().zoom`. If `zoom.min < 1.0`, provides an instant `[0.5x Wide] / [1.0x Normal]` toggle applying physical zoom constraints without software distortion.
- **Honest Physical Scope:** Transparently reflects hardware capabilities without falsely claiming software can widen a fixed sensor's physical FOV.

### 3. Spatial Detection & Narration
- **Horizontal Positioning:** Computes horizontal bounding box centers:
  - **Left** (`cx < 35%` of frame) — Hindi: *बाईं ओर*
  - **Centre** (`35% ≤ cx ≤ 65%` of frame) — Hindi: *सामने*
  - **Right** (`cx > 65%` of frame) — Hindi: *दाईं ओर*
- **Visual Relative Proximity:** Categorizes visual size into `Close`, `Medium`, and `Distant` based on relative bounding box area, strictly avoiding fake monocular distance measurements.
- **Intelligent Voice Narration:** Narrates primary obstacles and people in path (cooldown 2.8s to avoid speech overlap) in English and Hindi.
- **Haptic Alerts:** Sends tactile vibration cues (`navigator.vibrate`) when an obstacle or person is detected directly in the `Centre` zone.

---

## 🎨 Visual Design & Android Optimization

- **Palette:** Deep navy backgrounds (`#07111f`, `#0b1a2d`, `#0d1e33`) with glowing cyan accents (`#45d9ed`, `#38bdf8`).
- **Accessibility:** Instant **High Contrast** mode (pure black `#000000` & vibrant yellow `#ffff00`), **Large Text** ($125\%$ scaling), voice alerts, and haptic vibration.
- **Android Touch Ergonomics:** Minimum $\ge 48\text{px}$ touch targets, sticky bottom action bar for one-thumb reach, and safe-area inset protection.
- **Safety Disclaimer:** Prominent notice stating that DRISVYA supplements and **does not replace a white cane or guide dog**.

---

## 📂 Project Architecture

```
Drisvya AI/
├── index.html              # Accessible HTML5 with ARIA landmarks & overlay canvas
├── css/
│   ├── style.css           # Navy theme tokens, typography & Android mobile layout
│   ├── components.css      # Viewfinder HUD, lens selector, voice panel & empty states
│   └── accessibility.css   # High contrast mode, large text mode & reduced motion
├── js/
│   ├── ai.js               # TensorFlow.js & COCO-SSD loading, inference & spatial math
│   ├── camera.js           # MediaDevices lifecycle, multi-camera, zoom & bounding boxes
│   ├── voice.js            # Web Speech API engine (English + Hindi, speed presets, mute, repeat)
│   ├── accessibility.js    # A11y manager (contrast, large text, vibration & localStorage)
│   ├── sound.js            # Web Audio API synthesized earcon feedback
│   └── app.js              # Coordinator, mobile sticky bar sync, and keyboard shortcuts
├── test_runner.js          # Automated verification test suite (Phase 2 audit)
└── README.md               # Complete project documentation & guide
```

---

## ⌨️ Accessible Keyboard Shortcuts

| Shortcut | Action |
|:---:|:---|
| <kbd>Space</kbd> | Toggle Assistance (Start / Stop) |
| <kbd>M</kbd> | Mute / Unmute Voice Assistant |
| <kbd>R</kbd> | Repeat Last Spoken Announcement |
| <kbd>H</kbd> | Toggle High Contrast Mode |
| <kbd>L</kbd> | Toggle Large Text Mode |
| <kbd>S</kbd> | Open DRISVYA Settings Dialog |
| <kbd>Esc</kbd> | Close Settings Dialog |

---

## 🚀 Running & Testing Locally

```bash
# Navigate to the workspace
cd "Drisvya AI"

# Start local server (Camera requires localhost or HTTPS)
python3 -m http.server 8080 --bind 0.0.0.0
```
- **Desktop Browser:** [http://localhost:8080](http://localhost:8080)
- **Android Smartphone:** Open `http://<YOUR_COMPUTER_IP>:8080` in Chrome on your phone.
- **Run Audit Suite:** `node test_runner.js` *(all verification suites pass with 0 errors)*.
