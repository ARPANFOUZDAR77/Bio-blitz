import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ThirdPersonCameraController } from '../camera/ThirdPersonCamera';
import {
  ARENA_MAPS,
  ARENA_RADIUS,
  ARENA_VERTICAL_LIMIT,
  BIOLOGICAL_ABILITIES,
  DIFFICULTY_PRESETS,
  GRAPHICS_PRESETS,
  ORGANISM_STRAINS,
  REGION_POWER_UPS,
} from '../constants';
import { BloodstreamArena, RegionPowerUpInstance } from '../entities/BloodstreamArena';
import { EnemyManager } from '../entities/EnemyManager';
import { PlayerOrganism } from '../entities/PlayerOrganism';
import { androidBridge } from '../services/androidBridge';
import { bioAudio } from '../services/audioEngine';
import {
  AbilityId,
  ActivePlayerStats,
  ArenaMapId,
  DifficultyLevel,
  GameScreenState,
  GameSettings,
  LifetimeStatistics,
  RegionPowerUpId,
} from '../types';

const _moveInputVec = new THREE.Vector3();
const _pushVec = new THREE.Vector3();

export interface GameOverSummary {
  score: number;
  survivalTimeSec: number;
  nutrientsCollected: number;
  bestScore: number;
  isNewBestScore: boolean;
  newlyUnlockedOrganisms: string[];
  newlyUnlockedAbilities: AbilityId[];
}

export class BioBlitzGameEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public isSoftwareGl: boolean;

  public arena: BloodstreamArena;
  public player: PlayerOrganism;
  public enemyManager: EnemyManager;
  public cameraController: ThirdPersonCameraController;
  public worldRoot: THREE.Group;

  public screenState: GameScreenState = GameScreenState.SPLASH;
  public settings: GameSettings;
  public stats: ActivePlayerStats;

  // Input state (shared by touch joystick, buttons, and keyboard)
  public joystickX = 0;
  public joystickY = 0;
  public verticalInput = 0; // Optional ascend/descend
  public sprintHeld = false;
  private keysHeld = new Set<string>();

  // Callbacks to update HUD / UI
  private onHudUpdate?: (stats: ActivePlayerStats) => void;
  private onScreenStateChange?: (
    state: GameScreenState,
    gameOverSummary?: GameOverSummary,
  ) => void;
  private onStatusBanner?: (message: string, colorHex?: string) => void;

  private clock = new THREE.Clock();
  private hitstopTimer = 0;
  private dashTimer = 0;
  private dashDirection = new THREE.Vector3();
  private deathDelayTimer = 0;

  constructor(mountContainer: HTMLElement) {
    this.settings = androidBridge.getSettings();

    // Detect Software WebGL per Three.js skill directive
    this.isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const mapSpec =
      ARENA_MAPS[this.settings.selectedMapId] || ARENA_MAPS[ArenaMapId.HEART];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(mapSpec.bgColor);
    this.scene.fog = new THREE.FogExp2(mapSpec.fogColor, 0.0022);

    this.camera = new THREE.PerspectiveCamera(
      74,
      window.innerWidth / window.innerHeight,
      0.1,
      950,
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const preset = GRAPHICS_PRESETS[this.settings.graphicsQuality];
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, preset.pixelRatioCap),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && preset.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mountContainer.appendChild(this.renderer.domElement);

    // Mandatory Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // World root group (can also be attached or mirrored into XR scene)
    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);

    this.setupLighting();

    // Instantiate core 3D game entities
    this.arena = new BloodstreamArena(
      this.settings.graphicsQuality,
      this.settings.selectedMapId || ArenaMapId.HEART,
    );
    this.player = new PlayerOrganism(this.settings.selectedOrganismId, this.isSoftwareGl);
    this.enemyManager = new EnemyManager(this.settings.graphicsQuality);

    this.worldRoot.add(this.arena);
    this.worldRoot.add(this.player);
    this.worldRoot.add(this.player.fissionClone);
    this.worldRoot.add(this.enemyManager);

    this.cameraController = new ThirdPersonCameraController(this.camera);
    this.cameraController.sensitivity = this.settings.cameraSensitivity;
    this.cameraController.snapToTarget(this.player.position);

    this.stats = this.createInitialStats();

    bioAudio.setVolumes(
      this.settings.musicVolume,
      this.settings.sfxVolume,
      this.settings.muted,
    );

    this.bindInputListeners();
  }

  private setupLighting(): void {
    // Cool-to-warm biological Hemisphere fill
    const hemiLight = new THREE.HemisphereLight(0xffccd5, 0x1e1b4b, 2.2);
    this.worldRoot.add(hemiLight);

    // Warm arterial key directional light
    const keyLight = new THREE.DirectionalLight(0xffe4e6, 2.8);
    keyLight.position.set(14, 28, 16);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 75;
      const d = 28;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
    }
    this.worldRoot.add(keyLight);

    // Cyan rim backlight for cellular translucency contrast
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    rimLight.position.set(-18, -12, -20);
    this.worldRoot.add(rimLight);
  }

  private createInitialStats(): ActivePlayerStats {
    const strain =
      ORGANISM_STRAINS.find((s) => s.id === this.settings.selectedOrganismId) ||
      ORGANISM_STRAINS[0];
    return {
      health: strain.baseHealth,
      maxHealth: strain.baseHealth,
      energy: strain.baseEnergy,
      maxEnergy: strain.baseEnergy,
      speed: strain.baseSpeed,
      size: 1.0,
      survivalTimeSec: 0,
      score: 0,
      nutrientsCollected: 0,
      invulnerableTimer: 0,
      isSprinting: false,
      isDashing: false,
      dashCooldown: 0,
      activeAbilities: {
        [AbilityId.FLAGELLA_BOOST]: { cooldownRemaining: 0, activeRemaining: 0 },
        [AbilityId.MEMBRANE_SHIELD]: { cooldownRemaining: 0, activeRemaining: 0 },
        [AbilityId.CHEMOTAXIS]: { cooldownRemaining: 0, activeRemaining: 0 },
        [AbilityId.BINARY_FISSION]: { cooldownRemaining: 0, activeRemaining: 0 },
      },
      activeRegionPowerUp: {
        id: null,
        remainingSec: 0,
        durationSec: 0,
      },
      difficultyMultiplier: 1.0,
      difficultyLevel: this.settings.difficultyLevel || DifficultyLevel.MEDIUM,
    };
  }

  public setCallbacks(callbacks: {
    onHudUpdate: (stats: ActivePlayerStats) => void;
    onScreenStateChange: (state: GameScreenState, summary?: GameOverSummary) => void;
    onStatusBanner: (message: string, colorHex?: string) => void;
  }): void {
    this.onHudUpdate = callbacks.onHudUpdate;
    this.onScreenStateChange = callbacks.onScreenStateChange;
    this.onStatusBanner = callbacks.onStatusBanner;
  }

  public enterFullscreen(): void {
    try {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (!document.fullscreenElement) {
        if (docEl.requestFullscreen) {
          void docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          void docEl.webkitRequestFullscreen();
        }
      }
    } catch {
      // Ignore fullscreen restriction in embedded frames
    }
  }

  public exitFullscreen(): void {
    try {
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void>;
        webkitFullscreenElement?: Element | null;
      };
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) {
          void doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          void doc.webkitExitFullscreen();
        }
      }
    } catch {
      // Ignore fullscreen exit errors
    }
  }

  public startNewGame(): void {
    this.enterFullscreen();
    bioAudio.init();
    bioAudio.startAmbientBloodstream();

    const diffPreset =
      DIFFICULTY_PRESETS[this.settings.difficultyLevel] ||
      DIFFICULTY_PRESETS[DifficultyLevel.MEDIUM];

    const mapSpec =
      ARENA_MAPS[this.settings.selectedMapId] || ARENA_MAPS[ArenaMapId.HEART];
    this.arena.setArenaMap(this.settings.selectedMapId || ArenaMapId.HEART);
    this.scene.background = new THREE.Color(mapSpec.bgColor);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(mapSpec.fogColor);
    }

    this.player.setStrain(this.settings.selectedOrganismId);
    this.player.resetForNewGame();
    this.enemyManager.resetEnemiesForNewGame(diffPreset.initialEnemies);

    this.stats = this.createInitialStats();
    this.dashTimer = 0;
    this.hitstopTimer = 0;
    this.deathDelayTimer = 0;
    this.cameraController.snapToTarget(this.player.position);

    this.setScreenState(GameScreenState.PLAYING);
    this.onHudUpdate?.(this.stats);
    this.onStatusBanner?.(
      `${mapSpec.name.toUpperCase()} (${diffPreset.label.toUpperCase()}) — 10X ORGAN ARENA`,
      mapSpec.accentHex,
    );
  }

  public pauseGame(): void {
    if (this.screenState !== GameScreenState.PLAYING) return;
    this.keysHeld.clear();
    this.joystickX = 0;
    this.joystickY = 0;
    this.sprintHeld = false;
    this.setScreenState(GameScreenState.PAUSED);
  }

  public resumeGame(): void {
    if (this.screenState !== GameScreenState.PAUSED) return;
    this.clock.getDelta(); // Flush elapsed pause delta
    this.setScreenState(GameScreenState.PLAYING);
  }

  public returnToMainMenu(): void {
    this.exitFullscreen();
    this.keysHeld.clear();
    this.joystickX = 0;
    this.joystickY = 0;
    this.sprintHeld = false;
    this.player.resetForNewGame();
    this.setScreenState(GameScreenState.MAIN_MENU);
  }

  public setScreenState(state: GameScreenState, summary?: GameOverSummary): void {
    this.screenState = state;
    this.onScreenStateChange?.(state, summary);
  }

  public applyUpdatedSettings(partial: Partial<GameSettings>): GameSettings {
    this.settings = androidBridge.saveSettings(partial);

    const preset = GRAPHICS_PRESETS[this.settings.graphicsQuality];
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, preset.pixelRatioCap),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && preset.shadowsEnabled;

    const mapSpec =
      ARENA_MAPS[this.settings.selectedMapId] || ARENA_MAPS[ArenaMapId.HEART];
    this.scene.background = new THREE.Color(mapSpec.bgColor);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(mapSpec.fogColor);
    }

    this.arena.setArenaMap(this.settings.selectedMapId || ArenaMapId.HEART);
    this.arena.setGraphicsQuality(this.settings.graphicsQuality);
    this.enemyManager.setGraphicsQuality(this.settings.graphicsQuality);
    this.player.setStrain(this.settings.selectedOrganismId);
    this.cameraController.sensitivity = this.settings.cameraSensitivity;

    bioAudio.setVolumes(
      this.settings.musicVolume,
      this.settings.sfxVolume,
      this.settings.muted,
    );

    return this.settings;
  }

  public triggerDash(): void {
    if (this.screenState !== GameScreenState.PLAYING || this.player.isDead) return;
    if (this.stats.dashCooldown > 0) return;
    if (this.stats.energy < 8) {
      this.onStatusBanner?.('INSUFFICIENT ATP ENERGY FOR DASH!', '#f43f5e');
      return;
    }

    this.stats.energy = Math.max(0, this.stats.energy - 8);
    this.stats.dashCooldown = 2.4;
    this.stats.isDashing = true;
    this.dashTimer = 0.26;

    if (this.player.velocity.lengthSq() > 0.2) {
      this.dashDirection.copy(this.player.velocity).normalize();
    } else {
      this.dashDirection.copy(this.player.heading).normalize();
    }

    bioAudio.playDash();
    androidBridge.triggerHaptic(20);
  }

  public activateAbility(abilityId?: AbilityId): boolean {
    if (this.screenState !== GameScreenState.PLAYING || this.player.isDead) return false;
    const targetId = abilityId || this.settings.equippedAbilityId;
    const spec = BIOLOGICAL_ABILITIES[targetId];
    const state = this.stats.activeAbilities[targetId];
    if (!spec || !state) return false;

    // Check if unlocked
    const lifetime: LifetimeStatistics = androidBridge.getStatistics();
    if (!lifetime.unlockedAbilityIds.includes(targetId)) {
      this.onStatusBanner?.(
        `${spec.name} locked! Collect ${spec.unlockNutrientsRequired} total nutrients to unlock.`,
        '#f59e0b',
      );
      return false;
    }

    if (state.cooldownRemaining > 0) {
      return false;
    }
    if (this.stats.energy < spec.energyCost) {
      this.onStatusBanner?.(`LOW ATP ENERGY — NEED ${spec.energyCost} ATP FOR ${spec.name.toUpperCase()}`, '#f43f5e');
      return false;
    }

    this.stats.energy = Math.max(0, this.stats.energy - spec.energyCost);
    state.activeRemaining = spec.durationSec;
    state.cooldownRemaining = spec.cooldownSec;

    bioAudio.playAbilityActivate(targetId);
    androidBridge.triggerHaptic(35);
    this.onStatusBanner?.(`${spec.name.toUpperCase()} ACTIVATED!`, spec.accentColor);
    return true;
  }

  public stepSimulation(rawDt?: number): void {
    const dt = Math.min(rawDt ?? this.clock.getDelta(), 0.05);

    if (this.screenState !== GameScreenState.PLAYING) {
      // Live 3D background animation during Splash / Main Menu / Pause / Game Over
      const nearestNut = this.arena.findNearestNutrient(this.player.position);
      this.player.updateOrganism(dt, false, false, false, false, false, nearestNut);
      this.arena.updateArena(dt, this.player.position, false, this.camera.position);
      this.enemyManager.updateEnemies(
        dt,
        this.player.position,
        1.0,
        this.arena.nutrients,
        this.arena.obstacles,
        true,
      );
      this.cameraController.updateCamera(
        dt,
        this.player.position,
        this.stats.size,
        this.arena.obstacles,
        this.screenState === GameScreenState.SPLASH ||
          this.screenState === GameScreenState.MAIN_MENU,
      );
      return;
    }

    // Brief hitstop on heavy cellular collision
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.cameraController.updateCamera(
        dt,
        this.player.position,
        this.stats.size,
        this.arena.obstacles,
        false,
      );
      return;
    }

    // Handle player death sequence
    if (this.player.isDead) {
      this.deathDelayTimer += dt;
      this.player.updateOrganism(dt, false, false, false, false, false, null);
      this.arena.updateArena(dt, this.player.position, false, this.camera.position);
      this.cameraController.updateCamera(
        dt,
        this.player.position,
        this.stats.size,
        this.arena.obstacles,
        false,
      );
      if (this.deathDelayTimer >= 1.15) {
        this.finalizeGameOver();
      }
      return;
    }

    const diffPreset =
      DIFFICULTY_PRESETS[this.settings.difficultyLevel] ||
      DIFFICULTY_PRESETS[DifficultyLevel.MEDIUM];

    // 1. Update survival timer, score, and gradual difficulty scaling
    this.stats.survivalTimeSec += dt;
    if (this.stats.activeRegionPowerUp.remainingSec > 0) {
      this.stats.activeRegionPowerUp.remainingSec = Math.max(
        0,
        this.stats.activeRegionPowerUp.remainingSec - dt,
      );
      if (this.stats.activeRegionPowerUp.remainingSec === 0) {
        this.stats.activeRegionPowerUp.id = null;
      }
    }
    const activeRegionId =
      this.stats.activeRegionPowerUp.remainingSec > 0 ? this.stats.activeRegionPowerUp.id : null;
    const isInsulinRush = activeRegionId === RegionPowerUpId.INSULIN_RUSH;
    const isIronCore = activeRegionId === RegionPowerUpId.IRON_CORE;
    const isDopamineSurge = activeRegionId === RegionPowerUpId.DOPAMINE_SURGE;
    const isAdrenalinePulse = activeRegionId === RegionPowerUpId.ADRENALINE_PULSE;
    const isEnzymeBloom = activeRegionId === RegionPowerUpId.ENZYME_BLOOM;
    const isHemoglobinBurst = activeRegionId === RegionPowerUpId.HEMOGLOBIN_BURST;

    this.stats.score +=
      dt *
      10 *
      this.stats.difficultyMultiplier *
      diffPreset.scoreMultiplier *
      (isDopamineSurge ? 2.0 : 1.0);
    this.stats.difficultyMultiplier =
      1.0 + this.stats.survivalTimeSec / diffPreset.rampRateSec;

    // Continuous Adrenaline Pulse cardiac regeneration (+4 HP/s)
    if (isAdrenalinePulse) {
      this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + 4.0 * dt);
    }

    // 2. Update cooldowns & ability timers
    if (this.stats.invulnerableTimer > 0) {
      this.stats.invulnerableTimer = Math.max(0, this.stats.invulnerableTimer - dt);
    }
    if (this.stats.dashCooldown > 0) {
      this.stats.dashCooldown = Math.max(
        0,
        this.stats.dashCooldown - dt * (isDopamineSurge ? 2.5 : 1.0),
      );
    }

    for (const id of Object.values(AbilityId)) {
      const ab = this.stats.activeAbilities[id];
      if (ab.activeRemaining > 0) {
        ab.activeRemaining = Math.max(0, ab.activeRemaining - dt);
      }
      if (ab.cooldownRemaining > 0) {
        ab.cooldownRemaining = Math.max(
          0,
          ab.cooldownRemaining - dt * (isDopamineSurge ? 2.5 : 1.0),
        );
      }
    }

    const isBoostActive =
      this.stats.activeAbilities[AbilityId.FLAGELLA_BOOST].activeRemaining > 0;
    const isShieldActive =
      this.stats.activeAbilities[AbilityId.MEMBRANE_SHIELD].activeRemaining > 0 || isIronCore;
    const isChemotaxisActive =
      this.stats.activeAbilities[AbilityId.CHEMOTAXIS].activeRemaining > 0;
    const isFissionActive =
      this.stats.activeAbilities[AbilityId.BINARY_FISSION].activeRemaining > 0;

    // 3. Read movement input (Virtual Touch Joystick + Keyboard WASD/Arrows)
    let inputX = this.joystickX;
    let inputY = this.joystickY;
    let inputVert = this.verticalInput;

    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) inputY -= 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) inputY += 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) inputX -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) inputX += 1;
    if (this.keysHeld.has('KeyE')) inputVert += 1;
    if (this.keysHeld.has('KeyQ')) inputVert -= 1;

    const isMoving = Math.hypot(inputX, inputY, inputVert) > 0.08;
    const wantsSprint = this.sprintHeld || this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight');
    this.stats.isSprinting = wantsSprint && isMoving && (this.stats.energy > 2 || isInsulinRush);

    // 4. Cellular Energy Metabolism
    const baseDrain = isHemoglobinBurst
      ? 0
      : 1.35 * (1 + (this.stats.size - 1) * 0.2) * diffPreset.energyDrainMultiplier;
    const sprintDrain =
      this.stats.isSprinting && !isInsulinRush
        ? 6.2 * diffPreset.energyDrainMultiplier
        : 0;
    this.stats.energy = Math.max(0, this.stats.energy - (baseDrain + sprintDrain) * dt);

    // If energy reaches 0, gradual cellular starvation damage occurs
    if (this.stats.energy <= 0.01) {
      this.stats.health = Math.max(0, this.stats.health - 4.5 * dt);
      if (this.stats.health <= 0 && !this.player.isDead) {
        this.triggerPlayerDeath();
        return;
      }
    }

    // 5. Compute Player Velocity & Position
    this.cameraController.getCameraRelativeMovement(inputX, inputY, _moveInputVec);
    _moveInputVec.y = THREE.MathUtils.clamp(inputVert, -1, 1) * 0.65;

    let effectiveSpeed = this.player.strain.baseSpeed;
    if (this.stats.energy <= 1 && !isInsulinRush) effectiveSpeed *= 0.62;
    if (this.stats.isSprinting) effectiveSpeed *= 1.42;
    if (isBoostActive) effectiveSpeed *= 1.65;
    if (isInsulinRush) effectiveSpeed *= 1.75;
    else if (isAdrenalinePulse) effectiveSpeed *= 1.6;
    else if (isDopamineSurge || isHemoglobinBurst) effectiveSpeed *= 1.45;

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      this.player.velocity.copy(this.dashDirection).multiplyScalar(effectiveSpeed * 2.35);
    } else {
      this.stats.isDashing = false;
      _moveInputVec.multiplyScalar(effectiveSpeed);
      this.player.velocity.lerp(_moveInputVec, 1 - Math.exp(-8.5 * dt));
    }

    if (isMoving) {
      bioAudio.playFlagellaSwim(this.stats.isSprinting || isBoostActive);
    }

    this.player.position.addScaledVector(this.player.velocity, dt);

    // 6. Arena Boundary & Obstacle Collision Resolution
    const radialDist = Math.hypot(this.player.position.x, this.player.position.z);
    const maxPlayerRadius = ARENA_RADIUS - this.player.getCollisionRadius() - 1.2;
    if (radialDist > maxPlayerRadius) {
      const clampRatio = maxPlayerRadius / radialDist;
      this.player.position.x *= clampRatio;
      this.player.position.z *= clampRatio;
    }
    this.player.position.y = THREE.MathUtils.clamp(
      this.player.position.y,
      -ARENA_VERTICAL_LIMIT + 1.5,
      ARENA_VERTICAL_LIMIT - 1.5,
    );

    for (let i = 0; i < this.arena.obstacles.length; i++) {
      const obs = this.arena.obstacles[i];
      _pushVec.subVectors(this.player.position, obs.position);
      const d = _pushVec.length();
      const minSep = obs.radius + this.player.getCollisionRadius();
      if (d < minSep && d > 0.0001) {
        _pushVec.normalize().multiplyScalar(minSep - d);
        this.player.position.add(_pushVec);
      }
    }

    // 7. Nutrient Collection (by Player and by Binary Fission Sister Clone)
    const pickupRadius = this.player.getCollisionRadius() + (isChemotaxisActive ? 1.45 : 0.65);
    const pickupRadiusSq = pickupRadius * pickupRadius;
    const cloneRadiusSq = 1.6 * 1.6;

    for (let i = 0; i < this.arena.nutrients.length; i++) {
      const nut = this.arena.nutrients[i];
      if (!nut.active) continue;

      const dPlayerSq = this.player.position.distanceToSquared(nut.position);
      const dCloneSq =
        isFissionActive && this.player.fissionCloneActive
          ? this.player.fissionClonePosition.distanceToSquared(nut.position)
          : Infinity;

      if (dPlayerSq <= pickupRadiusSq || dCloneSq <= cloneRadiusSq) {
        this.collectNutrient(nut);
      }
    }

    // 7b. Organ-Specific Region Power-Up Collection
    const powerUpRadiusSq = (this.player.getCollisionRadius() + 2.15) ** 2;
    for (let i = 0; i < this.arena.regionPowerUps.length; i++) {
      const pUp = this.arena.regionPowerUps[i];
      if (!pUp.active) continue;
      const dPlayerSq = this.player.position.distanceToSquared(pUp.position);
      const dCloneSq =
        isFissionActive && this.player.fissionCloneActive
          ? this.player.fissionClonePosition.distanceToSquared(pUp.position)
          : Infinity;
      if (dPlayerSq <= powerUpRadiusSq || dCloneSq <= powerUpRadiusSq) {
        this.collectRegionPowerUp(pUp);
      }
    }

    // 8. Update Player, Arena, and Enemies
    const nearestNutPos = this.arena.findNearestNutrient(
      isFissionActive ? this.player.fissionClonePosition : this.player.position,
    );
    this.player.updateOrganism(
      dt,
      this.stats.isSprinting,
      isBoostActive || isInsulinRush,
      isShieldActive,
      isChemotaxisActive || isEnzymeBloom,
      isFissionActive,
      nearestNutPos,
    );

    this.arena.updateArena(
      dt,
      this.player.position,
      isChemotaxisActive,
      this.camera.position,
      isEnzymeBloom,
    );

    this.enemyManager.updateEnemies(
      dt,
      this.player.position,
      this.stats.difficultyMultiplier,
      this.arena.nutrients,
      this.arena.obstacles,
      isShieldActive,
      diffPreset.initialEnemies,
      diffPreset.enemySpeedMultiplier,
    );

    // 9. Enemy Collision Detection with Player
    const playerColRadius = this.player.getCollisionRadius();
    for (let i = 0; i < this.enemyManager.enemies.length; i++) {
      const e = this.enemyManager.enemies[i];
      if (!e.active) continue;

      const dist = this.player.position.distanceTo(e.position);
      const combinedRadius = playerColRadius + e.collisionRadius;

      if (dist < combinedRadius) {
        // Push apart physically
        _pushVec.subVectors(this.player.position, e.position);
        if (_pushVec.lengthSq() > 0.001) {
          _pushVec.normalize();
        } else {
          _pushVec.set(0, 0, 1);
        }

        if (isShieldActive) {
          // Membrane Shield deflects the predator away harmlessly
          e.position.addScaledVector(_pushVec, -3.2);
          e.velocity.copy(_pushVec).multiplyScalar(-12);
          this.stats.score += 15 * diffPreset.scoreMultiplier;
          androidBridge.triggerHaptic(15);
        } else if (this.stats.invulnerableTimer <= 0) {
          // Apply damage + temporary invulnerability window
          const scaledDamage = Math.round(e.damage * diffPreset.enemyDamageMultiplier);
          this.stats.health = Math.max(0, this.stats.health - scaledDamage);
          this.stats.invulnerableTimer = 1.35;
          this.player.position.addScaledVector(_pushVec, 2.2);
          this.player.velocity.copy(_pushVec).multiplyScalar(11);
          this.player.triggerDamageAnimation();
          this.cameraController.addTrauma(0.68);
          this.hitstopTimer = 0.045;
          bioAudio.playDamage();
          androidBridge.triggerHaptic(65);
          this.onStatusBanner?.(`CELL MEMBRANE DAMAGED (-${scaledDamage} HP)`, '#f43f5e');

          if (this.stats.health <= 0) {
            this.triggerPlayerDeath();
            return;
          }
        }
      }
    }

    // 10. Update Third-Person Follow Camera & HUD
    this.cameraController.updateCamera(
      dt,
      this.player.position,
      this.stats.size,
      this.arena.obstacles,
      false,
    );
    this.onHudUpdate?.(this.stats);
  }

  private collectNutrient(nut: {
    active: boolean;
    position: THREE.Vector3;
    energyValue: number;
    scoreValue: number;
  }): void {
    this.arena.spawnCollectionBurst(nut.position);
    this.arena.respawnNutrient(
      nut as Parameters<BloodstreamArena['respawnNutrient']>[0],
      this.stats.difficultyMultiplier,
      this.player.position,
    );

    const isEnzymeBloom =
      this.stats.activeRegionPowerUp.remainingSec > 0 &&
      this.stats.activeRegionPowerUp.id === RegionPowerUpId.ENZYME_BLOOM;
    const isDopamineSurge =
      this.stats.activeRegionPowerUp.remainingSec > 0 &&
      this.stats.activeRegionPowerUp.id === RegionPowerUpId.DOPAMINE_SURGE;
    const nutMult = isEnzymeBloom ? 2.0 : 1.0;

    this.stats.energy = Math.min(
      this.stats.maxEnergy,
      this.stats.energy + nut.energyValue * nutMult,
    );
    // Tiny cellular regeneration when energy is near full
    if (this.stats.energy >= this.stats.maxEnergy * 0.85) {
      this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + 1.5);
    }
    this.stats.nutrientsCollected += isEnzymeBloom ? 2 : 1;
    this.stats.score +=
      nut.scoreValue *
      this.stats.difficultyMultiplier *
      nutMult *
      (isDopamineSurge ? 2.0 : 1.0);

    // Controlled organism growth system (1.0x up to 2.25x)
    const previousMilestone = Math.floor((this.stats.nutrientsCollected - 1) / 8);
    const currentMilestone = Math.floor(this.stats.nutrientsCollected / 8);
    this.stats.size = Math.min(2.25, 1.0 + this.stats.nutrientsCollected * 0.018);
    this.player.triggerGrowthAnimation(this.stats.size);

    if (currentMilestone > previousMilestone && this.stats.size < 2.25) {
      bioAudio.playGrowth();
      this.onStatusBanner?.(
        `ORGANISM GROWTH: ${(this.stats.size * 100).toFixed(0)}% MASS`,
        '#4ade80',
      );
    } else {
      bioAudio.playNutrientCollect(1.0 + (this.stats.nutrientsCollected % 6) * 0.06);
    }
    androidBridge.triggerHaptic(12);
  }

  private collectRegionPowerUp(powerUp: RegionPowerUpInstance): void {
    this.arena.consumeRegionPowerUp(powerUp);
    const spec = REGION_POWER_UPS[powerUp.powerUpId];
    const diffPreset =
      DIFFICULTY_PRESETS[this.settings.difficultyLevel] ||
      DIFFICULTY_PRESETS[DifficultyLevel.MEDIUM];

    this.stats.activeRegionPowerUp = {
      id: spec.id,
      remainingSec: spec.durationSec,
      durationSec: spec.durationSec,
    };
    this.stats.score += spec.scoreBonus * diffPreset.scoreMultiplier;

    if (spec.id === RegionPowerUpId.INSULIN_RUSH) {
      this.stats.energy = Math.min(this.stats.maxEnergy, this.stats.energy + 40);
      bioAudio.playAbilityActivate(AbilityId.FLAGELLA_BOOST);
    } else if (spec.id === RegionPowerUpId.IRON_CORE) {
      this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + 25);
      this.stats.invulnerableTimer = Math.max(this.stats.invulnerableTimer, spec.durationSec);
      bioAudio.playAbilityActivate(AbilityId.MEMBRANE_SHIELD);
    } else if (spec.id === RegionPowerUpId.DOPAMINE_SURGE) {
      this.stats.energy = Math.min(this.stats.maxEnergy, this.stats.energy + 35);
      this.stats.dashCooldown = 0;
      for (const id of Object.values(AbilityId)) {
        this.stats.activeAbilities[id].cooldownRemaining = 0;
      }
      bioAudio.playAbilityActivate(AbilityId.BINARY_FISSION);
    } else if (spec.id === RegionPowerUpId.ADRENALINE_PULSE) {
      this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + 40);
      this.stats.energy = Math.min(this.stats.maxEnergy, this.stats.energy + 25);
      bioAudio.playAbilityActivate(AbilityId.FLAGELLA_BOOST);
    } else if (spec.id === RegionPowerUpId.ENZYME_BLOOM) {
      this.stats.energy = Math.min(this.stats.maxEnergy, this.stats.energy + 45);
      bioAudio.playAbilityActivate(AbilityId.CHEMOTAXIS);
    } else if (spec.id === RegionPowerUpId.HEMOGLOBIN_BURST) {
      this.stats.energy = this.stats.maxEnergy;
      this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + 30);
      bioAudio.playGrowth();
    }

    androidBridge.triggerHaptic(55);
    this.onStatusBanner?.(spec.bannerText, spec.accentHex);
  }

  private triggerPlayerDeath(): void {
    this.player.triggerDeathAnimation();
    this.deathDelayTimer = 0;
    bioAudio.playGameOver();
    androidBridge.triggerHaptic(120);
  }

  private finalizeGameOver(): void {
    const finalScore = Math.floor(this.stats.score);
    const result = androidBridge.recordCompletedRun({
      timestamp: Date.now(),
      score: finalScore,
      survivalTimeSec: Math.floor(this.stats.survivalTimeSec),
      nutrientsCollected: this.stats.nutrientsCollected,
      enemiesEvadedOrEliminated: Math.floor(this.stats.survivalTimeSec / 4),
      maxSizeReached: Number(this.stats.size.toFixed(2)),
      organismId: this.settings.selectedOrganismId,
    });

    this.setScreenState(GameScreenState.GAME_OVER, {
      score: finalScore,
      survivalTimeSec: Math.floor(this.stats.survivalTimeSec),
      nutrientsCollected: this.stats.nutrientsCollected,
      bestScore: result.stats.bestScore,
      isNewBestScore: result.isNewBestScore,
      newlyUnlockedOrganisms: result.newlyUnlockedOrganisms,
      newlyUnlockedAbilities: result.newlyUnlockedAbilities,
    });
  }

  private bindInputListeners(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('blur', () => {
      this.keysHeld.clear();
      this.joystickX = 0;
      this.joystickY = 0;
      this.sprintHeld = false;
    });

    window.addEventListener('keydown', (e) => {
      this.keysHeld.add(e.code);
      if (this.screenState === GameScreenState.PLAYING) {
        if (e.code === 'Space') {
          e.preventDefault();
          this.triggerDash();
        } else if (e.code === 'Digit1') {
          this.activateAbility(AbilityId.FLAGELLA_BOOST);
        } else if (e.code === 'Digit2') {
          this.activateAbility(AbilityId.MEMBRANE_SHIELD);
        } else if (e.code === 'Digit3') {
          this.activateAbility(AbilityId.CHEMOTAXIS);
        } else if (e.code === 'Digit4') {
          this.activateAbility(AbilityId.BINARY_FISSION);
        } else if (e.code === 'Escape' || e.code === 'KeyP') {
          this.pauseGame();
        }
      } else if (this.screenState === GameScreenState.PAUSED) {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          this.resumeGame();
        }
      } else if (this.screenState === GameScreenState.MAIN_MENU) {
        if (e.code === 'Enter') {
          this.startNewGame();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysHeld.delete(e.code);
    });

    // Android lifecycle & hardware back button events dispatched by MainActivity.kt
    window.addEventListener('bioblitz-lifecycle-pause', () => {
      if (this.screenState === GameScreenState.PLAYING) {
        this.pauseGame();
      }
      bioAudio.stopAmbientBloodstream();
    });

    window.addEventListener('bioblitz-lifecycle-resume', () => {
      if (!this.settings.muted) {
        bioAudio.startAmbientBloodstream();
      }
    });

    window.addEventListener('bioblitz-android-back', () => {
      if (this.screenState === GameScreenState.PLAYING) {
        this.pauseGame();
      } else if (this.screenState === GameScreenState.PAUSED) {
        this.resumeGame();
      }
    });
  }
}
