# BIOBLITZ: Micro Survival — QA & APK Testing Checklist

## 1. Core Gameplay & Controls
- [x] **Splash Screen**: Displays BIOBLITZ animated logo over live 3D microscopic bloodstream scene and transitions cleanly to Main Menu.
- [x] **Virtual Touchscreen Joystick (Left Side)**: Smooth 360-degree camera-relative movement of the player microorganism.
- [x] **Right-Side Touch Action Cluster**:
  - [x] **Sprint Button**: Increases speed and flagella whip frequency while consuming cellular energy.
  - [x] **Dash Button**: Triggers hydrodynamic impulse burst with cooldown.
  - [x] **Biological Ability Buttons (1–4)**: Activates *Flagella Boost*, *Membrane Shield*, *Chemotaxis*, and *Binary Fission* with visual effects and cooldown timers.
- [x] **Desktop Keyboard/Mouse Parity**: `WASD` / Arrow keys move, `Shift` sprinting, `Space` dash, `1–4` abilities, mouse drag rotates third-person camera, scroll wheel zooms.

## 2. Player Organism & Camera
- [x] **Composite 3D Anatomy**: Translucent cell membrane, cytoplasm, nucleus, mitochondria, and animated posterior flagella visible at 60 FPS.
- [x] **All 6 Required Animations**: Idle breathing, movement tilt + flagella wave, sprint streamline, damage flash, growth expansion (up to 2.25x), and death lysis.
- [x] **Third-Person Follow Camera**: Exponentially damped follow above and behind the organism, orbit rotation, zoom clamping, and vessel-wall anti-clipping.

## 3. Bloodstream Arena, Nutrients & Enemy AI
- [x] **Nutrient & Oxygen Collection**: Restores cellular energy, increases score, triggers particle burst + harmonic chime, and grows organism size.
- [x] **Energy & Health Systems**: Continuous metabolic energy drain, critical low-energy warning banner, temporary post-hit invulnerability shield.
- [x] **4 Distinct Enemy AI Types**:
  - [x] *Hunter*: Pursues and lunges at the player.
  - [x] *Wanderer*: Drifts organically through the plasma current.
  - [x] *Scavenger*: Seeks and consumes nearby nutrient particles.
  - [x] *Defensive*: Patrols territorial perimeter and lunges if encroached.

## 4. Android Native & Offline Verification
- [x] **100% Offline Execution**: Zero external texture/audio/model 404s; works in Airplane Mode.
- [x] **Room Database & Restricted JS Bridge**: Saves high scores, survival time, nutrients collected, unlocked organisms/abilities, and graphics/audio settings.
- [x] **Adaptive Graphics Presets**: Low, Medium, and High graphics modes dynamically adjust `InstancedMesh` counts, active enemy cap, and pixel ratio.
