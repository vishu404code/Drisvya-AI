# DRISVYA (दृश्या) — AI-Powered Assistive Vision Platform

> **"Your World, Understood."**  
> **Brand:** DRISVYA  
> **Tagline:** Your World, Understood.  
> **Category:** AI-Powered Assistive Vision Platform  

DRISVYA is a mobile-first, AI-powered assistive vision web application engineered specifically to help visually impaired and low-vision individuals navigate and perceive their surroundings using Android smartphone hardware and voice assistance.

---

## 📌 Phase 1 Scope & Architecture

Phase 1 establishes the **frontend foundation, accessible design system, and Android-optimized interface**:

- **Official Brand Identity:** Consistent DRISVYA branding with a minimal vision-inspired symbol logo.
- **No Paid APIs or Cloud Dependencies:** Runs 100% client-side via native Web APIs (Web Speech, Web Audio, MediaDevices, Haptic Vibration).
- **Zero Fake Detection:** Strictly avoids fabricated AI object detection or fake camera simulation. The camera lifecycle is real, and the neural network pipeline is cleanly pre-wired for TensorFlow.js and COCO-SSD in Phase 2.
- **Android Smartphone Optimization:** Built for thumb reach, safe-area insets, fluid typography, and ≥ 48px touch targets, accompanied by an ergonomic sticky action bar.

---

## 🎨 Visual Design & Theme

- **Background:** Deep navy (`#07111f`, `#0b1a2d`, `#0d1e33`).
- **Accents:** Subtle cyan glow (`#45d9ed`, `#38bdf8`, `#22d3ee`).
- **Typography:** High legibility with fluid scaling and clean visual hierarchy.
- **Viewfinder HUD:** Assistive framing brackets, center optical reticle, and scanning beam.

---

## 📱 Main Screen Components

### 1. Header
- **Minimal Vision Logo:** Precision SVG icon representing optical perception and focal alignment.
- **Brand Title & Category:** DRISVYA with *Assistive Vision* badge.
- **Connection Status:** Live pill indicator (`Online • Ready` / `Offline Mode`).
- **Settings Trigger:** Direct access to DRISVYA Preferences.

### 2. Hero Section
- **Heading:** *"Your World, Understood."*
- **Tagline Badge:** *AI-Powered Assistive Vision Platform*
- **Listen to Overview:** Audio summary vocalized in the selected language.

### 3. Main Camera Card & Viewfinder HUD
- **Real Video Feed:** Connects to device rear camera (`facingMode: 'environment'`).
- **Overlaid Canvas (`#overlayCanvas`):** Pre-wired for TensorFlow.js and COCO-SSD bounding box rendering.
- **Prominent START ASSISTANCE Button:** 64px tall, high-contrast cyan-blue CTA.
- **Camera Status Strip:** Reports live hardware states honestly.
- **Camera Permission Instructions:** Step-by-step guidance for Android Chrome permissions and chest-height device orientation.

### 4. Detection Summary (Standby)
- **Objects Detected:** Count indicator (0 in Standby).
- **People Detected:** Count indicator (0 in Standby).
- **Vehicles Detected:** Count indicator (0 in Standby).
- **Nearest Obstacle:** Proximity card (`None within range` in Standby).
- **Notice:** Clear notice that AI models plug in during Phase 2; no fake data is displayed.

### 5. Voice Assistant Control Panel
- **Status & Visualizer:** Real-time CSS audio waveform reflecting speech activity.
- **Language Selection:** Instant toggle between **English** (`en-US/IN`) and **हिन्दी (Hindi)** (`hi-IN`).
- **Voice Speed Presets:** One-tap speed buttons: **Slow** (0.8x), **Normal** (1.0x), **Fast** (1.2x).
- **Mute / Unmute:** Dedicated control with acoustic feedback.
- **Repeat Announcement:** Instant audio repetition of the latest announcement.

### 6. Accessibility Settings
Four instant toggles saved to `localStorage`:
1. **High Contrast:** Pure black background (`#000000`), vivid yellow borders (`#ffff00`), and white text.
2. **Large Text:** 125% typography scale with automatic single-column layout adjustment.
3. **Voice Alerts:** Toggle spoken audio descriptions.
4. **Haptic Vibration:** Tactile vibration cues (`navigator.vibrate`) on Android.

### 7. Detection History & Timeline
- Real-time activity and announcement history with timestamps.
- **Proper Empty State:** Informative empty state card with vision reticle icon: *"No detections recorded yet. Start assistance to scan your surroundings in real-time."*
- **Clear Button:** Resets the history at any time.

### 8. Safety Disclaimer
- Prominent safety disclaimer card:  
  *“Important Safety Disclaimer: DRISVYA is an assistive preview platform designed to supplement environmental awareness. It does NOT replace a white cane or guide dog. Always use standard primary mobility aids, and proceed with caution in hazardous or unfamiliar environments.”*

### 9. Sticky Android Mobile Action Bar
- Fixed at the bottom of Android smartphone screens for effortless one-handed thumb access to **START ASSISTANCE** and **Repeat Audio**.

---

## ⌨️ Accessible Keyboard Shortcuts

| Shortcut | Action |
|:---:|:---|
| <kbd>Space</kbd> | Toggle Assistance (Start / Stop) |
| <kbd>M</kbd> | Mute / Unmute Voice Assistant |
| <kbd>R</kbd> | Repeat Last Spoken Audio |
| <kbd>H</kbd> | Toggle High Contrast Mode |
| <kbd>L</kbd> | Toggle Large Text Mode |
| <kbd>S</kbd> | Open DRISVYA Settings Dialog |
| <kbd>Esc</kbd> | Close Settings Dialog |

---

## 🚀 How to Run the Application

Because camera access (`getUserMedia`) requires a secure origin (`localhost` or `https`), serve via a local HTTP server:

### Option A: Using Python
```bash
cd "Drisvya AI"
python3 -m http.server 8080
```
Open **`http://localhost:8080`** in your browser.

### Option B: Mobile Testing on Android Smartphone
1. Connect your Android smartphone to the same Wi-Fi network as your computer.
2. Start the server:
   ```bash
   python3 -m http.server 8080 --bind 0.0.0.0
   ```
3. Open Google Chrome on your Android phone and visit:
   `http://<YOUR_COMPUTER_LOCAL_IP>:8080`

### Option C: Run Verification Test Runner
```bash
node test_runner.js
```
*(All 10 verification test suites pass with 0 errors).*

---

## 🔮 Phase 2 Roadmap: AI Vision Model Integration

When ready for Phase 2:
1. Load `@tensorflow/tfjs` and `@tensorflow-models/coco-ssd`.
2. Connect the detection model to `cameraController.registerPhase2Model(async (video) => { ... })`.
3. Draw real bounding boxes using `cameraController.drawBoundingBoxes(predictions)`.
4. Update live counts via `cameraController.setDetectionResults({ objects, people, vehicles, nearest })`.
