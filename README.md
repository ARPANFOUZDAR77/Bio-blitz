# BIOBLITZ: Micro Survival — Android 3D Game & XR Blocks Architecture

**BIOBLITZ: Micro Survival** is a complete 3D microscopic survival arcade game built with **Three.js**, **XR Blocks (`xrblocks`)**, and a native **Kotlin + Room Database + Android WebView** shell.

## 1. Architecture Overview

- **3D Rendering & Gameplay Engine (`/src/`)**:
  - `src/entities/PlayerOrganism.ts`: Multi-part composite 3D microorganism (`THREE.Group` with translucent phospholipid cell membrane, cytoplasm, double-envelope nucleus, cristae mitochondria, and sinusoidal helical `TubeGeometry` flagella) plus `Binary Fission` daughter clone.
  - `src/entities/BloodstreamArena.ts`: Procedural 3D arterial arena featuring peristaltic endothelial vessel walls, `LatheGeometry` biconcave Red Blood Cells (`InstancedMesh`), ATP/Glucose nutrients, $O_2$ molecules, Chemotaxis beacon rings, and Fibrin Clot obstacles.
  - `src/entities/EnemyManager.ts`: Object-pooled 3D enemy microorganisms with 4 distinct AI behaviors (**Hunter**, **Wanderer**, **Scavenger**, **Defensive**) and smooth difficulty scaling.
  - `src/camera/ThirdPersonCamera.ts`: Exponentially damped third-person follow camera (`1 - Math.exp(-k * dt)`) with touch/mouse orbit rotation, pinch/wheel zoom, vessel anti-clipping, and trauma shake.
  - `src/services/audioEngine.ts`: 100% procedural Web Audio API sound synthesizer (bloodstream ambient drone, flagella swim, nutrient chime, damage impact, ability synths, game over).
  - `src/services/androidBridge.ts`: Restricted Kotlin-JavaScript bridge (`window.BioBlitzAndroid`) backed by Room Database on Android and local transactional storage in WebView/browser preview.
  - `src/services/bioscienceService.ts`: Scientific protein & organelle lookup querying UniProtKB, RCSB PDB, and AlphaFold DB with 100% offline fallback.
  - `src/xr/BioBlitzXRScript.ts`: XR Blocks (`xb.Script` + `xb.UICard`) spatial UI and XR expansion architecture.

- **Android Native Project (`/android/`)**:
  - `MainActivity.kt`: Fullscreen landscape `AppCompatActivity` serving the bundled Three.js game via `WebViewAssetLoader` (`https://appassets.androidplatform.net/assets/dist/index.html`) for secure offline loading without file:// CORS issues.
  - `BioBlitzJavascriptBridge.kt`: Restricted `@JavascriptInterface` exposing only `saveRunResult`, `getLifetimeStatsJson`, `saveSettingsJson`, `getSettingsJson`, `vibrate`, and `isXrSupported`.
  - `data/BioBlitzDatabase.kt`: Room Database (`RunRecordEntity`, `PlayerSettingsEntity`, `BioBlitzDao`) for persistent offline scores, unlocks, and settings.

## 2. Building the Web Bundle & Android APK

### Step 1: Build the Local Three.js Asset Bundle
```bash
npm install
npm run build
```
This compiles TypeScript and bundles the entire Three.js + XR Blocks game into `dist/`.

### Step 2: Copy Bundle to Android Studio Assets & Build APK
```bash
mkdir -p android/app/src/main/assets/dist
cp -r dist/* android/app/src/main/assets/dist/
cd android
./gradlew assembleDebug
```
The resulting installable offline APK is generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

For a signed release APK:
```bash
./gradlew assembleRelease
```
