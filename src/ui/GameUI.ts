import {
  ARENA_MAPS,
  BIOLOGICAL_ABILITIES,
  DIFFICULTY_PRESETS,
  GRAPHICS_PRESETS,
  ORGANISM_STRAINS,
  REGION_POWER_UPS,
} from '../constants';
import { BioBlitzGameEngine, GameOverSummary } from '../engine/BioBlitzGameEngine';
import { androidBridge } from '../services/androidBridge';
import { bioAudio } from '../services/audioEngine';
import {
  AbilityId,
  ActivePlayerStats,
  ArenaMapId,
  DifficultyLevel,
  GameScreenState,
  GraphicsQuality,
  MenuSubPanel,
} from '../types';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export class GameUIManager {
  private engine: BioBlitzGameEngine;
  private rootOverlay: HTMLElement;

  // Screen containers
  private splashEl!: HTMLElement;
  private mainMenuEl!: HTMLElement;
  private subPanelModalEl!: HTMLElement;
  private hudEl!: HTMLElement;
  private pauseModalEl!: HTMLElement;
  private gameOverModalEl!: HTMLElement;

  // HUD live DOM elements
  private healthBarFill!: HTMLElement;
  private healthValueText!: HTMLElement;
  private energyBarFill!: HTMLElement;
  private energyValueText!: HTMLElement;
  private lowEnergyAlertEl!: HTMLElement;
  private scoreValueText!: HTMLElement;
  private timerValueText!: HTMLElement;
  private nutrientValueText!: HTMLElement;
  private sizeValueText!: HTMLElement;
  private levelValueText!: HTMLElement;
  private mapValueText!: HTMLElement;
  private statusBannerEl!: HTMLElement;
  private regionPowerUpBoxEl!: HTMLElement;
  private regionPowerUpNameEl!: HTMLElement;
  private regionPowerUpTimerEl!: HTMLElement;
  private regionPowerUpBarEl!: HTMLElement;

  // Mobile right-side touch controls
  private sprintBtnEl!: HTMLButtonElement;
  private dashBtnEl!: HTMLButtonElement;
  private dashCooldownText!: HTMLElement;
  private specialAbilityBtnEl!: HTMLButtonElement;
  private specialAbilityNameText!: HTMLElement;
  private specialAbilityCdText!: HTMLElement;

  // Touch joystick state
  private joystickZoneEl!: HTMLElement;
  private joystickShaftEl!: HTMLElement;
  private joystickKnobEl!: HTMLElement;
  private joystickPointerId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private readonly joystickMaxRadius = 42;

  // Camera touch-drag & pinch-zoom state
  private cameraLookZoneEl!: HTMLElement;
  private activeCameraPointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist: number | null = null;

  private bannerTimeout: number | null = null;

  constructor(engine: BioBlitzGameEngine, mountContainer: HTMLElement) {
    this.engine = engine;

    this.rootOverlay = document.createElement('div');
    this.rootOverlay.className = 'fixed inset-0 z-20 pointer-events-none select-none overflow-hidden';
    mountContainer.appendChild(this.rootOverlay);

    this.buildAllScreens();
    this.bindCameraGestureHandlers();

    this.engine.setCallbacks({
      onHudUpdate: (stats) => this.updateHud(stats),
      onScreenStateChange: (state, summary) => this.handleScreenStateChange(state, summary),
      onStatusBanner: (msg, color) => this.showBanner(msg, color),
    });

    // Splash Screen -> Main Menu
    this.handleScreenStateChange(GameScreenState.SPLASH);
    window.setTimeout(() => {
      if (this.engine.screenState === GameScreenState.SPLASH) {
        this.engine.setScreenState(GameScreenState.MAIN_MENU);
      }
    }, 1600);
  }

  private buildAllScreens(): void {
    // 1. Splash Screen
    this.splashEl = document.createElement('div');
    this.splashEl.className =
      'absolute inset-0 flex flex-col items-center justify-center p-8 pointer-events-auto';
    this.splashEl.innerHTML = `
      <div class="flex flex-col items-center text-center max-w-md">
        <svg class="w-24 h-24 mb-4" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="46" stroke="#38BDF8" stroke-width="3" stroke-dasharray="10 6" fill="rgba(2,132,199,0.18)" />
          <ellipse cx="60" cy="60" rx="34" ry="26" fill="rgba(56,189,248,0.28)" stroke="#7DD3FC" stroke-width="2.5" />
          <circle cx="54" cy="58" r="12" fill="#A855F7" stroke="#E9D5FF" stroke-width="2" />
          <circle cx="51" cy="56" r="4" fill="#FEF08A" />
          <rect x="70" y="48" width="10" height="6" rx="3" fill="#F97316" />
          <rect x="68" y="64" width="10" height="6" rx="3" fill="#F97316" />
          <path d="M94 56 C106 48, 110 68, 118 58" stroke="#7DD3FC" stroke-width="3" stroke-linecap="round" />
          <path d="M94 64 C106 72, 110 52, 118 64" stroke="#7DD3FC" stroke-width="3" stroke-linecap="round" />
        </svg>
        <h1 class="text-5xl sm:text-6xl font-extrabold tracking-tight text-white">
          BIO<span class="text-sky-400">BLITZ</span>
        </h1>
        <p class="text-sm sm:text-base uppercase tracking-[0.28em] text-rose-300 font-semibold mt-1">
          MICRO SURVIVAL
        </p>
        <div class="w-56 h-2 bg-rose-950/90 rounded-full overflow-hidden mt-8 border border-rose-500/30">
          <div class="h-full bg-sky-400" style="width: 100%"></div>
        </div>
      </div>
    `;
    this.splashEl.addEventListener('pointerdown', () => {
      bioAudio.init();
      this.engine.setScreenState(GameScreenState.MAIN_MENU);
    });

    // 2. Main Menu Screen
    this.mainMenuEl = document.createElement('div');
    this.mainMenuEl.className =
      'absolute inset-0 flex flex-col justify-between p-5 sm:p-8 pointer-events-none hidden';

    // 3. Sub-Panel Modal (Organisms, Abilities, Statistics, Settings, About)
    this.subPanelModalEl = document.createElement('div');
    this.subPanelModalEl.className =
      'absolute inset-0 flex items-center justify-center p-4 bg-black/75 pointer-events-auto hidden z-30';

    // 4. Gameplay HUD + Mobile Touchscreen Controls
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'absolute inset-0 pointer-events-none hidden';
    this.buildGameplayHud();

    // 5. Pause Menu Modal
    this.pauseModalEl = document.createElement('div');
    this.pauseModalEl.className =
      'absolute inset-0 flex items-center justify-center p-4 bg-black/75 pointer-events-auto hidden z-30';
    this.buildPauseModal();

    // 6. Game Over Modal
    this.gameOverModalEl = document.createElement('div');
    this.gameOverModalEl.className =
      'absolute inset-0 flex items-center justify-center p-4 bg-black/80 pointer-events-auto hidden z-30';

    this.rootOverlay.append(
      this.splashEl,
      this.mainMenuEl,
      this.hudEl,
      this.subPanelModalEl,
      this.pauseModalEl,
      this.gameOverModalEl,
    );

    this.renderMainMenuContent();
  }

  private renderMainMenuContent(): void {
    const stats = androidBridge.getStatistics();
    const settings = this.engine.settings;
    const unlockedStrains = ORGANISM_STRAINS.filter(
      (s) => s.unlockScoreRequired === 0 || stats.unlockedOrganismIds.includes(s.id),
    );
    const currentStrain =
      ORGANISM_STRAINS.find((s) => s.id === settings.selectedOrganismId) ||
      ORGANISM_STRAINS[0];
    const currentStrainIdx = Math.max(
      0,
      unlockedStrains.findIndex((s) => s.id === currentStrain.id),
    );
    const currentAbility = BIOLOGICAL_ABILITIES[settings.equippedAbilityId];

    this.mainMenuEl.innerHTML = `
      <!-- Top Website Header Bar -->
      <div class="flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        <div class="flex items-center gap-3 bio-surface px-4 py-2 rounded-xl">
          <svg class="w-8 h-8 shrink-0" viewBox="0 0 120 120" fill="none">
            <circle cx="60" cy="60" r="46" stroke="#38BDF8" stroke-width="4" fill="rgba(2,132,199,0.2)" />
            <circle cx="55" cy="58" r="15" fill="#A855F7" />
            <path d="M92 56 C106 48, 110 68, 118 58" stroke="#7DD3FC" stroke-width="4" stroke-linecap="round" />
          </svg>
          <div>
            <div class="text-lg font-extrabold tracking-tight leading-none text-white">
              BIO<span class="text-sky-400">BLITZ</span>
            </div>
            <div class="text-[11px] uppercase tracking-widest text-rose-300 mt-0.5">
              Micro Survival
            </div>
          </div>
        </div>

        <!-- Top Center Creator Signature Badge -->
        <div class="pro-top-pill px-4 py-2 rounded-full text-xs sm:text-sm font-bold tracking-wide text-white flex items-center gap-2">
          <span>made with 💖 Arpan</span>
        </div>

        <div class="flex items-center gap-3 bio-surface px-4 py-2 rounded-xl text-xs font-mono-tabular">
          <div>
            <span class="text-slate-400">BEST SCORE:</span>
            <span class="text-emerald-400 font-bold ml-1">${stats.bestScore}</span>
          </div>
          <span class="text-slate-600">|</span>
          <div>
            <span class="text-slate-400">NUTRIENTS:</span>
            <span class="text-amber-300 font-bold ml-1">${stats.totalNutrientsCollected}</span>
          </div>
        </div>
      </div>

      <!-- Center Left: Active Organism Card & Play Button -->
      <div class="my-auto flex flex-col items-start max-w-sm pointer-events-auto">
        <div class="bio-surface p-4 sm:p-5 rounded-2xl w-full space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono-tabular uppercase tracking-widest text-sky-400">
              ${currentStrain.classification}
            </span>
            <span class="text-[10px] font-mono-tabular text-emerald-300 font-bold">
              ORGANISM ${currentStrainIdx + 1}/${unlockedStrains.length} FREE
            </span>
          </div>

          <div class="flex items-center justify-between gap-2">
            <button id="menu-prev-strain-btn" aria-label="Previous Organism" class="px-2.5 py-1.5 rounded-lg bio-btn-secondary text-xs font-bold cursor-pointer">
              ◀
            </button>
            <h2 class="text-xl font-extrabold text-white leading-tight text-center flex-1 truncate">${currentStrain.name}</h2>
            <button id="menu-next-strain-btn" aria-label="Next Organism" class="px-2.5 py-1.5 rounded-lg bio-btn-secondary text-xs font-bold cursor-pointer">
              ▶
            </button>
          </div>

          <p class="text-xs text-slate-300 leading-relaxed">${currentStrain.description}</p>
          <div class="grid grid-cols-3 gap-2 pt-0.5 text-center font-mono-tabular text-xs">
            <div class="bg-black/40 p-1.5 rounded-lg border border-white/10">
              <div class="text-[10px] text-slate-400">HEALTH</div>
              <div class="text-emerald-400 font-bold">${currentStrain.baseHealth}</div>
            </div>
            <div class="bg-black/40 p-1.5 rounded-lg border border-white/10">
              <div class="text-[10px] text-slate-400">ENERGY</div>
              <div class="text-amber-300 font-bold">${currentStrain.baseEnergy}</div>
            </div>
            <div class="bg-black/40 p-1.5 rounded-lg border border-white/10">
              <div class="text-[10px] text-slate-400">ABILITY</div>
              <div class="text-sky-300 font-bold truncate">${currentAbility.name}</div>
            </div>
          </div>

          <div class="pt-0.5">
            <div class="flex items-center justify-between text-[10px] font-mono-tabular uppercase tracking-wider text-slate-400 mb-1">
              <span>ORGAN MAP (10X SIZE)</span>
              <span class="font-bold" style="color:${(ARENA_MAPS[settings.selectedMapId] || ARENA_MAPS[ArenaMapId.HEART]).accentHex}">${(ARENA_MAPS[settings.selectedMapId] || ARENA_MAPS[ArenaMapId.HEART]).name}</span>
            </div>
            <div class="grid grid-cols-3 gap-1">
              ${(
                [
                  ArenaMapId.PANCREAS,
                  ArenaMapId.LIVER,
                  ArenaMapId.BRAIN,
                  ArenaMapId.HEART,
                  ArenaMapId.INTESTINE,
                  ArenaMapId.BLOODSTREAM,
                ] as ArenaMapId[]
              )
                .map((mId) => {
                  const mSpec = ARENA_MAPS[mId];
                  const active = (settings.selectedMapId || ArenaMapId.HEART) === mId;
                  return `
                    <button
                      data-select-map="${mId}"
                      class="py-1.5 px-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider cursor-pointer truncate ${
                        active ? 'bio-btn-primary' : 'bio-btn-secondary'
                      }"
                    >
                      ${mSpec.shortName}
                    </button>
                  `;
                })
                .join('')}
            </div>
            ${(() => {
              const activeMap =
                ARENA_MAPS[settings.selectedMapId] || ARENA_MAPS[ArenaMapId.HEART];
              const pSpec = REGION_POWER_UPS[activeMap.powerUpId];
              return `
                <div class="mt-1.5 bg-black/45 px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-mono-tabular">
                  <div class="flex items-center justify-between">
                    <span class="uppercase text-slate-400">ORGAN POWER-UP:</span>
                    <span class="font-extrabold uppercase" style="color:${pSpec.accentHex}">★ ${pSpec.name}</span>
                  </div>
                  <div class="text-slate-300 text-[10px] truncate mt-0.5">${pSpec.summary}</div>
                </div>
              `;
            })()}
          </div>

          <div class="pt-0.5">
            <div class="flex items-center justify-between text-[10px] font-mono-tabular uppercase tracking-wider text-slate-400 mb-1">
              <span>GAME LEVEL</span>
              <span class="text-amber-300 font-bold">${DIFFICULTY_PRESETS[settings.difficultyLevel]?.scoreMultiplier ?? 1}x SCORE</span>
            </div>
            <div class="grid grid-cols-4 gap-1.5">
              ${(
                [
                  DifficultyLevel.EASY,
                  DifficultyLevel.MEDIUM,
                  DifficultyLevel.HARD,
                  DifficultyLevel.EXTREME,
                ] as DifficultyLevel[]
              )
                .map((lvl) => {
                  const preset = DIFFICULTY_PRESETS[lvl];
                  const active = settings.difficultyLevel === lvl;
                  return `
                    <button
                      data-select-level="${lvl}"
                      class="py-1.5 px-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider cursor-pointer ${
                        active ? 'bio-btn-primary' : 'bio-btn-secondary'
                      }"
                    >
                      ${preset.label}
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>

          <button id="menu-play-btn" class="w-full py-3 rounded-xl bio-btn-primary font-extrabold text-base uppercase tracking-wider cursor-pointer shadow-lg">
            PLAY
          </button>
        </div>
      </div>

      <!-- Professional Website Footer Bar -->
      <footer class="pro-footer-bar rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        <div class="flex flex-wrap items-center gap-2">
          <button data-subpanel="${MenuSubPanel.ORGANISMS}" class="px-3.5 py-2 rounded-xl pro-footer-nav-btn text-xs font-bold uppercase tracking-wider cursor-pointer">
            Organisms (${unlockedStrains.length})
          </button>
          <button data-subpanel="${MenuSubPanel.ABILITIES}" class="px-3.5 py-2 rounded-xl pro-footer-nav-btn text-xs font-bold uppercase tracking-wider cursor-pointer">
            Abilities
          </button>
          <button data-subpanel="${MenuSubPanel.STATISTICS}" class="px-3.5 py-2 rounded-xl pro-footer-nav-btn text-xs font-bold uppercase tracking-wider cursor-pointer">
            Statistics
          </button>
          <button data-subpanel="${MenuSubPanel.SETTINGS}" class="px-3.5 py-2 rounded-xl pro-footer-nav-btn text-xs font-bold uppercase tracking-wider cursor-pointer">
            Settings
          </button>
          <button data-subpanel="${MenuSubPanel.ABOUT}" class="px-3.5 py-2 rounded-xl pro-footer-nav-btn text-xs font-bold uppercase tracking-wider cursor-pointer">
            About
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-3 text-[11px] font-mono-tabular text-slate-400">
          <span class="hidden sm:inline text-emerald-400 font-bold">● 6 ORGAN ARENAS (10X)</span>
          <span class="hidden sm:inline text-slate-600">|</span>
          <span class="text-sky-300 font-semibold">🕹️ JOYSTICK READY</span>
          <span class="text-slate-600">|</span>
          <span class="text-slate-300 font-medium">© 2026 BIOBLITZ · 3D WEBGL</span>
        </div>
      </footer>
    `;

    this.mainMenuEl.querySelector('#menu-play-btn')?.addEventListener('click', () => {
      this.engine.startNewGame();
    });

    const cycleStrain = (dir: number) => {
      const nextIdx =
        (currentStrainIdx + dir + unlockedStrains.length) % unlockedStrains.length;
      const nextStrain = unlockedStrains[nextIdx];
      this.engine.applyUpdatedSettings({ selectedOrganismId: nextStrain.id });
      bioAudio.playNutrientCollect(1.15);
      this.renderMainMenuContent();
    };

    this.mainMenuEl.querySelector('#menu-prev-strain-btn')?.addEventListener('click', () => {
      cycleStrain(-1);
    });
    this.mainMenuEl.querySelector('#menu-next-strain-btn')?.addEventListener('click', () => {
      cycleStrain(1);
    });

    this.mainMenuEl.querySelectorAll('[data-select-map]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mapId = (btn as HTMLElement).getAttribute('data-select-map') as ArenaMapId;
        this.engine.applyUpdatedSettings({ selectedMapId: mapId });
        bioAudio.playNutrientCollect(1.08);
        this.renderMainMenuContent();
      });
    });

    this.mainMenuEl.querySelectorAll('[data-select-level]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lvl = (btn as HTMLElement).getAttribute('data-select-level') as DifficultyLevel;
        this.engine.applyUpdatedSettings({ difficultyLevel: lvl });
        bioAudio.playNutrientCollect(1.1);
        this.renderMainMenuContent();
      });
    });

    this.mainMenuEl.querySelectorAll('[data-subpanel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = (btn as HTMLElement).getAttribute('data-subpanel') as MenuSubPanel;
        this.openSubPanel(panel);
      });
    });
  }

  private openSubPanel(panel: MenuSubPanel): void {
    if (panel === MenuSubPanel.NONE) {
      this.subPanelModalEl.classList.add('hidden');
      this.renderMainMenuContent();
      return;
    }

    this.subPanelModalEl.classList.remove('hidden');
    const stats = androidBridge.getStatistics();
    const settings = this.engine.settings;

    if (panel === MenuSubPanel.ORGANISMS) {
      this.subPanelModalEl.innerHTML = `
        <div class="bio-surface rounded-2xl max-w-3xl w-full max-h-[86vh] flex flex-col p-6">
          <div class="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h3 class="text-xl font-extrabold text-white">ORGANISMS</h3>
              <p class="text-xs text-slate-400">Reach higher survival scores to unlock new microorganisms.</p>
            </div>
            <button id="close-subpanel-btn" class="px-3 py-1.5 rounded-lg bio-btn-secondary text-xs font-bold cursor-pointer">✕ Close</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4 bio-scroll pr-1">
            ${ORGANISM_STRAINS.map((strain) => {
              const unlocked =
                strain.unlockScoreRequired === 0 ||
                stats.unlockedOrganismIds.includes(strain.id);
              const selected = settings.selectedOrganismId === strain.id;
              return `
                <div class="bio-card p-4 rounded-xl flex flex-col justify-between ${selected ? 'ring-2' : ''}">
                  <div>
                    <div class="flex items-center justify-between">
                      <span class="text-base font-bold text-white">${strain.name}</span>
                      <span class="text-[11px] font-mono-tabular px-2 py-0.5 rounded ${
                        unlocked ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                      }">
                        ${unlocked ? (selected ? 'SELECTED' : strain.unlockScoreRequired === 0 ? 'FREE' : 'UNLOCKED') : `SCORE ${strain.unlockScoreRequired}`}
                      </span>
                    </div>
                    <div class="text-[11px] text-sky-300 font-mono-tabular mt-0.5">${strain.classification}</div>
                    <p class="text-xs text-slate-300 mt-2 leading-relaxed">${strain.description}</p>
                  </div>
                  <div class="mt-4 pt-3 border-t border-white/10">
                    <div class="grid grid-cols-4 gap-1.5 text-center font-mono-tabular text-[11px] mb-3">
                      <div class="bg-black/40 p-1.5 rounded"><span class="text-slate-400 block text-[9px]">HEALTH</span>${strain.baseHealth}</div>
                      <div class="bg-black/40 p-1.5 rounded"><span class="text-slate-400 block text-[9px]">ENERGY</span>${strain.baseEnergy}</div>
                      <div class="bg-black/40 p-1.5 rounded"><span class="text-slate-400 block text-[9px]">SPEED</span>${strain.baseSpeed}</div>
                      <div class="bg-black/40 p-1.5 rounded"><span class="text-slate-400 block text-[9px]">FLAGELLA</span>${strain.flagellaCount}</div>
                    </div>
                    <button
                      data-select-strain="${strain.id}"
                      ${!unlocked ? 'disabled' : ''}
                      class="w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer ${
                        selected
                          ? 'bio-btn-primary'
                          : unlocked
                            ? 'bio-btn-secondary'
                            : 'bg-slate-900 text-slate-500 cursor-not-allowed'
                      }"
                    >
                      ${selected ? 'Selected' : unlocked ? 'Select Organism' : `Requires ${strain.unlockScoreRequired} Best Score`}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      this.subPanelModalEl.querySelectorAll('[data-select-strain]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const strainId = (btn as HTMLElement).getAttribute('data-select-strain')!;
          this.engine.applyUpdatedSettings({ selectedOrganismId: strainId });
          bioAudio.playNutrientCollect(1.2);
          this.openSubPanel(MenuSubPanel.ORGANISMS);
        });
      });
    } else if (panel === MenuSubPanel.ABILITIES) {
      this.subPanelModalEl.innerHTML = `
        <div class="bio-surface rounded-2xl max-w-3xl w-full max-h-[86vh] flex flex-col p-6">
          <div class="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h3 class="text-xl font-extrabold text-white">BIOLOGICAL ABILITIES</h3>
              <p class="text-xs text-slate-400">Collect nutrients across sessions to unlock new cellular abilities.</p>
            </div>
            <button id="close-subpanel-btn" class="px-3 py-1.5 rounded-lg bio-btn-secondary text-xs font-bold cursor-pointer">✕ Close</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4 bio-scroll pr-1">
            ${Object.values(BIOLOGICAL_ABILITIES)
              .map((ab) => {
                const unlocked = stats.unlockedAbilityIds.includes(ab.id);
                const equipped = settings.equippedAbilityId === ab.id;
                return `
                  <div class="bio-card p-4 rounded-xl flex flex-col justify-between ${equipped ? 'ring-2' : ''}">
                    <div>
                      <div class="flex items-center justify-between">
                        <span class="text-base font-bold" style="color:${ab.accentColor}">${ab.name}</span>
                        <span class="text-[11px] font-mono-tabular px-2 py-0.5 rounded ${
                          unlocked ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'
                        }">
                          ${unlocked ? (equipped ? 'EQUIPPED' : 'UNLOCKED') : `NEEDS ${ab.unlockNutrientsRequired} NUTRIENTS`}
                        </span>
                      </div>
                      <p class="text-xs text-slate-200 mt-2 leading-relaxed">${ab.description}</p>
                    </div>
                    <div class="mt-4 pt-3 border-t border-white/10">
                      <div class="flex justify-between text-[11px] font-mono-tabular text-slate-300 mb-3">
                        <span>DURATION: <b>${ab.durationSec}s</b></span>
                        <span>COOLDOWN: <b>${ab.cooldownSec}s</b></span>
                        <span>ENERGY: <b>${ab.energyCost}</b></span>
                      </div>
                      <button
                        data-equip-ability="${ab.id}"
                        ${!unlocked ? 'disabled' : ''}
                        class="w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer ${
                          equipped
                            ? 'bio-btn-primary'
                            : unlocked
                              ? 'bio-btn-secondary'
                              : 'bg-slate-900 text-slate-500 cursor-not-allowed'
                        }"
                      >
                        ${equipped ? 'Equipped Special Ability' : unlocked ? 'Equip Special Ability' : `Collect ${ab.unlockNutrientsRequired} Total Nutrients`}
                      </button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;

      this.subPanelModalEl.querySelectorAll('[data-equip-ability]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const abId = (btn as HTMLElement).getAttribute('data-equip-ability') as AbilityId;
          this.engine.applyUpdatedSettings({ equippedAbilityId: abId });
          this.refreshEquippedAbilityButton();
          bioAudio.playAbilityActivate(abId);
          this.openSubPanel(MenuSubPanel.ABILITIES);
        });
      });
    } else if (panel === MenuSubPanel.STATISTICS) {
      this.subPanelModalEl.innerHTML = `
        <div class="bio-surface rounded-2xl max-w-3xl w-full max-h-[86vh] flex flex-col p-6">
          <div class="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h3 class="text-xl font-extrabold text-white">STATISTICS</h3>
              <p class="text-xs text-slate-400">Local survival records and high-score history.</p>
            </div>
            <button id="close-subpanel-btn" class="px-3 py-1.5 rounded-lg bio-btn-secondary text-xs font-bold cursor-pointer">✕ Close</button>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 font-mono-tabular">
            <div class="bio-card p-3.5 rounded-xl text-center">
              <div class="text-[10px] text-slate-400 uppercase">BEST SCORE</div>
              <div class="text-2xl font-extrabold text-emerald-400 mt-1">${stats.bestScore}</div>
            </div>
            <div class="bio-card p-3.5 rounded-xl text-center">
              <div class="text-[10px] text-slate-400 uppercase">LONGEST SURVIVAL</div>
              <div class="text-2xl font-extrabold text-sky-400 mt-1">${formatTime(stats.longestSurvivalSec)}</div>
            </div>
            <div class="bio-card p-3.5 rounded-xl text-center">
              <div class="text-[10px] text-slate-400 uppercase">NUTRIENTS</div>
              <div class="text-2xl font-extrabold text-amber-300 mt-1">${stats.totalNutrientsCollected}</div>
            </div>
            <div class="bio-card p-3.5 rounded-xl text-center">
              <div class="text-[10px] text-slate-400 uppercase">GAMES PLAYED</div>
              <div class="text-2xl font-extrabold text-rose-300 mt-1">${stats.totalGamesPlayed}</div>
            </div>
          </div>

          <div class="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">Recent Survival Runs</div>
          <div class="bio-scroll flex-1 border border-white/10 rounded-xl bg-black/40 p-3">
            ${
              stats.recentRuns.length === 0
                ? `<div class="text-center text-xs text-slate-400 py-8">No survival sessions recorded yet.</div>`
                : `<table class="w-full text-left text-xs font-mono-tabular">
                    <thead>
                      <tr class="text-slate-400 border-b border-white/10">
                        <th class="pb-2">SCORE</th>
                        <th class="pb-2">SURVIVAL TIME</th>
                        <th class="pb-2">NUTRIENTS</th>
                        <th class="pb-2">MAX SIZE</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${stats.recentRuns
                        .map(
                          (r) => `
                        <tr class="border-b border-white/5">
                          <td class="py-2 font-bold text-emerald-400">${r.score}</td>
                          <td class="py-2 text-sky-300">${formatTime(r.survivalTimeSec)}</td>
                          <td class="py-2 text-amber-300">${r.nutrientsCollected}</td>
                          <td class="py-2">${Math.round(r.maxSizeReached * 100)}%</td>
                        </tr>
                      `,
                        )
                        .join('')}
                    </tbody>
                  </table>`
            }
          </div>
        </div>
      `;
    } else if (panel === MenuSubPanel.SETTINGS) {
      this.subPanelModalEl.innerHTML = `
        <div class="bio-surface rounded-2xl max-w-xl w-full flex flex-col p-6 space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <h3 class="text-xl font-extrabold text-white">SETTINGS</h3>
              <p class="text-xs text-slate-400">Graphics quality, sound volume, camera sensitivity, and vibration.</p>
            </div>
            <button id="close-subpanel-btn" class="px-3 py-1.5 rounded-lg bio-btn-secondary text-xs font-bold cursor-pointer">✕ Close</button>
          </div>

          <div class="space-y-4 text-xs">
            <div>
              <label class="block font-bold uppercase tracking-wider text-slate-300 mb-2">Organ Map (10x Arena & Exclusive Power-Up)</label>
              <div class="grid grid-cols-3 gap-1.5">
                ${(
                  [
                    ArenaMapId.PANCREAS,
                    ArenaMapId.LIVER,
                    ArenaMapId.BRAIN,
                    ArenaMapId.HEART,
                    ArenaMapId.INTESTINE,
                    ArenaMapId.BLOODSTREAM,
                  ] as ArenaMapId[]
                )
                  .map(
                    (mId) => `
                  <button
                    data-organ-map="${mId}"
                    class="py-2 px-1 rounded-lg font-bold uppercase cursor-pointer text-[11px] truncate ${
                      (settings.selectedMapId || ArenaMapId.HEART) === mId ? 'bio-btn-primary' : 'bio-btn-secondary'
                    }"
                  >
                    ${ARENA_MAPS[mId].shortName} (${REGION_POWER_UPS[ARENA_MAPS[mId].powerUpId].name})
                  </button>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <div>
              <label class="block font-bold uppercase tracking-wider text-slate-300 mb-2">Game Level</label>
              <div class="grid grid-cols-4 gap-2">
                ${(
                  [
                    DifficultyLevel.EASY,
                    DifficultyLevel.MEDIUM,
                    DifficultyLevel.HARD,
                    DifficultyLevel.EXTREME,
                  ] as DifficultyLevel[]
                )
                  .map(
                    (lvl) => `
                  <button
                    data-diff-level="${lvl}"
                    class="py-2.5 px-2 rounded-lg font-bold uppercase cursor-pointer ${
                      settings.difficultyLevel === lvl ? 'bio-btn-primary' : 'bio-btn-secondary'
                    }"
                  >
                    ${DIFFICULTY_PRESETS[lvl].label}
                  </button>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <div>
              <label class="block font-bold uppercase tracking-wider text-slate-300 mb-2">Graphics Mode</label>
              <div class="grid grid-cols-3 gap-2">
                ${([GraphicsQuality.LOW, GraphicsQuality.MEDIUM, GraphicsQuality.HIGH] as GraphicsQuality[])
                  .map(
                    (q) => `
                  <button
                    data-gfx-mode="${q}"
                    class="py-2.5 px-3 rounded-lg font-bold uppercase cursor-pointer ${
                      settings.graphicsQuality === q ? 'bio-btn-primary' : 'bio-btn-secondary'
                    }"
                  >
                    ${GRAPHICS_PRESETS[q].label}
                  </button>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <div>
              <div class="flex justify-between font-mono-tabular mb-1">
                <span class="font-bold uppercase text-slate-300">Music Volume</span>
                <span id="music-vol-label">${Math.round(settings.musicVolume * 100)}%</span>
              </div>
              <input id="music-vol-slider" type="range" min="0" max="100" value="${Math.round(settings.musicVolume * 100)}" class="w-full cursor-pointer" />
            </div>

            <div>
              <div class="flex justify-between font-mono-tabular mb-1">
                <span class="font-bold uppercase text-slate-300">Sound Effects Volume</span>
                <span id="sfx-vol-label">${Math.round(settings.sfxVolume * 100)}%</span>
              </div>
              <input id="sfx-vol-slider" type="range" min="0" max="100" value="${Math.round(settings.sfxVolume * 100)}" class="w-full cursor-pointer" />
            </div>

            <div>
              <div class="flex justify-between font-mono-tabular mb-1">
                <span class="font-bold uppercase text-slate-300">Camera Sensitivity</span>
                <span id="cam-sens-label">${settings.cameraSensitivity.toFixed(1)}x</span>
              </div>
              <input id="cam-sens-slider" type="range" min="40" max="200" value="${Math.round(settings.cameraSensitivity * 100)}" class="w-full cursor-pointer" />
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-white/10">
              <span class="font-bold uppercase text-slate-300">Vibration Feedback</span>
              <button id="toggle-vib-btn" class="px-4 py-2 rounded-lg font-bold cursor-pointer ${settings.vibrationEnabled ? 'bio-btn-primary' : 'bio-btn-secondary'}">
                ${settings.vibrationEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div class="flex items-center justify-between">
              <span class="font-bold uppercase text-slate-300">Mute All Audio</span>
              <button id="toggle-mute-btn" class="px-4 py-2 rounded-lg font-bold cursor-pointer ${settings.muted ? 'bg-rose-700 text-white' : 'bio-btn-secondary'}">
                ${settings.muted ? 'MUTED' : 'ACTIVE'}
              </button>
            </div>
          </div>
        </div>
      `;

      this.subPanelModalEl.querySelectorAll('[data-organ-map]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mId = (btn as HTMLElement).getAttribute('data-organ-map') as ArenaMapId;
          this.engine.applyUpdatedSettings({ selectedMapId: mId });
          this.openSubPanel(MenuSubPanel.SETTINGS);
        });
      });

      this.subPanelModalEl.querySelectorAll('[data-diff-level]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const lvl = (btn as HTMLElement).getAttribute('data-diff-level') as DifficultyLevel;
          this.engine.applyUpdatedSettings({ difficultyLevel: lvl });
          this.openSubPanel(MenuSubPanel.SETTINGS);
        });
      });

      this.subPanelModalEl.querySelectorAll('[data-gfx-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const q = (btn as HTMLElement).getAttribute('data-gfx-mode') as GraphicsQuality;
          this.engine.applyUpdatedSettings({ graphicsQuality: q });
          this.openSubPanel(MenuSubPanel.SETTINGS);
        });
      });

      const musicSlider = this.subPanelModalEl.querySelector('#music-vol-slider') as HTMLInputElement;
      const musicLabel = this.subPanelModalEl.querySelector('#music-vol-label')!;
      musicSlider?.addEventListener('input', () => {
        const val = Number(musicSlider.value) / 100;
        musicLabel.textContent = `${musicSlider.value}%`;
        this.engine.applyUpdatedSettings({ musicVolume: val });
      });

      const sfxSlider = this.subPanelModalEl.querySelector('#sfx-vol-slider') as HTMLInputElement;
      const sfxLabel = this.subPanelModalEl.querySelector('#sfx-vol-label')!;
      sfxSlider?.addEventListener('input', () => {
        const val = Number(sfxSlider.value) / 100;
        sfxLabel.textContent = `${sfxSlider.value}%`;
        this.engine.applyUpdatedSettings({ sfxVolume: val });
        bioAudio.playNutrientCollect(1.0);
      });

      const camSlider = this.subPanelModalEl.querySelector('#cam-sens-slider') as HTMLInputElement;
      const camLabel = this.subPanelModalEl.querySelector('#cam-sens-label')!;
      camSlider?.addEventListener('input', () => {
        const val = Number(camSlider.value) / 100;
        camLabel.textContent = `${val.toFixed(1)}x`;
        this.engine.applyUpdatedSettings({ cameraSensitivity: val });
      });

      this.subPanelModalEl.querySelector('#toggle-vib-btn')?.addEventListener('click', () => {
        this.engine.applyUpdatedSettings({ vibrationEnabled: !this.engine.settings.vibrationEnabled });
        androidBridge.triggerHaptic(30);
        this.openSubPanel(MenuSubPanel.SETTINGS);
      });

      this.subPanelModalEl.querySelector('#toggle-mute-btn')?.addEventListener('click', () => {
        this.engine.applyUpdatedSettings({ muted: !this.engine.settings.muted });
        this.openSubPanel(MenuSubPanel.SETTINGS);
      });
    } else if (panel === MenuSubPanel.ABOUT) {
      this.subPanelModalEl.innerHTML = `
        <div class="bio-surface rounded-2xl max-w-xl w-full flex flex-col p-6 space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-white/10">
            <h3 class="text-xl font-extrabold text-white">ABOUT BIOBLITZ: MICRO SURVIVAL</h3>
            <button id="close-subpanel-btn" class="px-3 py-1.5 rounded-lg bio-btn-secondary text-xs font-bold cursor-pointer">✕ Close</button>
          </div>
          <div class="text-xs text-slate-300 space-y-3 leading-relaxed bio-scroll max-h-[70vh] pr-1">
            <p>
              <b>BIOBLITZ: Micro Survival</b> is a 3D microscopic survival game set inside a dynamic bloodstream arena. Control a single-celled microorganism, collect floating nutrients and oxygen particles to maintain cellular energy, grow in size, and survive against hostile organisms.
            </p>
            <div class="bio-card p-3.5 rounded-xl space-y-1.5">
              <div class="font-bold text-sky-300 uppercase">Hostile Microorganisms</div>
              <div>• <b>Hunter:</b> Tracks and attacks your organism directly.</div>
              <div>• <b>Wanderer:</b> Drifts unpredictably through bloodstream currents.</div>
              <div>• <b>Scavenger:</b> Seeks out and consumes nearby nutrients.</div>
              <div>• <b>Defensive:</b> Protects its territory and lunges when approached.</div>
            </div>
            <div class="bio-card p-3.5 rounded-xl space-y-1.5">
              <div class="font-bold text-emerald-300 uppercase">Biological Abilities</div>
              <div>• <b>Flagella Boost:</b> High-speed propulsion burst.</div>
              <div>• <b>Membrane Shield:</b> Temporary invulnerability against predator attacks.</div>
              <div>• <b>Chemotaxis:</b> Highlights and attracts nearby nutrient particles.</div>
              <div>• <b>Binary Fission:</b> Spawns a temporary duplicate organism that gathers nutrients for you.</div>
            </div>
            <div class="bio-card p-3.5 rounded-xl space-y-1.5">
              <div class="font-bold text-amber-300 uppercase">Region-Specific Organ Power-Ups</div>
              <div>• <b>Pancreas — Insulin Rush:</b> +75% hyper-speed & zero sprint energy drain.</div>
              <div>• <b>Liver — Iron Core:</b> Ferritin invulnerability & predator knockback armor.</div>
              <div>• <b>Brain — Dopamine Surge:</b> +45% speed, instant ability reset & 2x score.</div>
              <div>• <b>Heart — Adrenaline Pulse:</b> +60% speed & +40 HP cardiac repair.</div>
              <div>• <b>Intestine — Enzyme Bloom:</b> 35m nutrient vortex pull & 2x nutrient growth.</div>
              <div>• <b>Bloodstream — Hemoglobin Burst:</b> 100% full ATP energy, +30 HP & oxygen speed.</div>
            </div>
          </div>
        </div>
      `;
    }

    this.subPanelModalEl.querySelector('#close-subpanel-btn')?.addEventListener('click', () => {
      this.openSubPanel(MenuSubPanel.NONE);
    });
  }

  private buildGameplayHud(): void {
    const equippedSpec = BIOLOGICAL_ABILITIES[this.engine.settings.equippedAbilityId];

    this.hudEl.innerHTML = `
      <!-- Camera Touch-Drag & Pinch-Zoom Layer -->
      <div id="hud-camera-look-zone" class="absolute inset-0 pointer-events-auto"></div>

      <!-- Top HUD Bar: Compact Health, Energy, Score, Timer, Pause & Quit -->
      <div class="relative z-10 flex flex-wrap items-start justify-between gap-2 p-2.5 sm:p-4 pointer-events-none">
        <!-- Top-Left: Compact Health & Energy Bars -->
        <div class="bio-surface p-2.5 rounded-xl w-48 sm:w-56 space-y-1.5 pointer-events-auto">
          <div>
            <div class="flex justify-between text-[10px] font-mono-tabular font-bold mb-0.5">
              <span class="text-rose-300">HEALTH</span>
              <span id="hud-health-text" class="text-white">100 / 100</span>
            </div>
            <div class="w-full h-2 bg-black/70 rounded-full overflow-hidden border border-rose-500/30">
              <div id="hud-health-fill" class="h-full bg-gradient-to-r from-rose-600 to-emerald-400 transition-all duration-100" style="width: 100%"></div>
            </div>
          </div>

          <div>
            <div class="flex justify-between text-[10px] font-mono-tabular font-bold mb-0.5">
              <span class="text-amber-300">ENERGY</span>
              <span id="hud-energy-text" class="text-white">100 / 100</span>
            </div>
            <div class="w-full h-2 bg-black/70 rounded-full overflow-hidden border border-amber-500/30">
              <div id="hud-energy-fill" class="h-full bg-gradient-to-r from-amber-500 to-sky-400 transition-all duration-100" style="width: 100%"></div>
            </div>
          </div>

          <div id="hud-low-energy-alert" class="hidden text-[10px] font-mono-tabular font-bold text-rose-400 bg-rose-950/90 px-1.5 py-0.5 rounded text-center border border-rose-500/50">
            ⚠ LOW ENERGY
          </div>

          <div id="hud-region-powerup-box" class="hidden pt-1 border-t border-white/10">
            <div class="flex justify-between text-[10px] font-mono-tabular font-bold mb-0.5">
              <span id="hud-region-powerup-name" class="text-cyan-300 truncate">★ INSULIN RUSH</span>
              <span id="hud-region-powerup-timer" class="text-white">9.0s</span>
            </div>
            <div class="w-full h-1.5 bg-black/70 rounded-full overflow-hidden border border-white/20">
              <div id="hud-region-powerup-bar" class="h-full bg-cyan-400 transition-all duration-75" style="width: 100%"></div>
            </div>
          </div>
        </div>

        <!-- Top-Center Status Banner -->
        <div id="hud-status-banner" class="bio-hud-pill px-3.5 py-1 rounded-full text-xs font-mono-tabular font-bold tracking-wider uppercase text-sky-300 transition-opacity duration-300 opacity-0">
          SURVIVE
        </div>

        <!-- Top-Right: Score, Survival Timer, Nutrients, Size, Level & Pause/Quit Buttons -->
        <div class="flex items-center gap-2 pointer-events-auto">
          <div class="bio-surface px-3 py-1.5 rounded-xl flex items-center gap-2.5 font-mono-tabular text-xs">
            <div>
              <span class="text-[9px] text-slate-400 block">SCORE</span>
              <span id="hud-score-text" class="text-sm font-extrabold text-emerald-400">0</span>
            </div>
            <div class="border-l border-white/10 pl-2.5">
              <span class="text-[9px] text-slate-400 block">TIME</span>
              <span id="hud-timer-text" class="text-sm font-extrabold text-sky-300">00:00.0</span>
            </div>
            <div class="border-l border-white/10 pl-2.5 hidden sm:block">
              <span class="text-[9px] text-slate-400 block">NUTRIENTS</span>
              <span id="hud-nutrient-text" class="text-sm font-extrabold text-amber-300">0</span>
            </div>
            <div class="border-l border-white/10 pl-2.5 hidden md:block">
              <span class="text-[9px] text-slate-400 block">SIZE</span>
              <span id="hud-size-text" class="text-xs font-bold text-white">100%</span>
            </div>
            <div class="border-l border-white/10 pl-2.5 hidden sm:block">
              <span class="text-[9px] text-slate-400 block">MAP</span>
              <span id="hud-map-text" class="text-xs font-extrabold uppercase text-sky-300">HEART</span>
            </div>
            <div class="border-l border-white/10 pl-2.5">
              <span class="text-[9px] text-slate-400 block">LEVEL</span>
              <span id="hud-level-text" class="text-xs font-extrabold uppercase text-rose-300">NORMAL</span>
            </div>
          </div>

          <button id="hud-pause-btn" aria-label="Pause" class="w-9 h-9 rounded-xl bio-surface flex items-center justify-center text-white font-bold text-sm cursor-pointer">
            ❚❚
          </button>

          <button id="hud-quit-btn" aria-label="Quit Game" class="w-9 h-9 rounded-xl bio-surface flex items-center justify-center text-rose-300 font-bold text-sm cursor-pointer">
            ✕
          </button>
        </div>
      </div>

      <!-- Bottom Touchscreen Controls: Left 3D Arcade Joystick 🕹️ + Right Sprint, Dash, and Special Ability Buttons -->
      <div class="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between p-3.5 sm:p-5 pointer-events-none">
        <!-- Left Side: 3D Arcade Joystick 🕹️ for Movement -->
        <div class="flex flex-col items-center pointer-events-auto">
          <div
            id="hud-joystick-zone"
            aria-label="Arcade Joystick"
            class="arcade-joystick-base cursor-pointer"
          >
            <span class="arcade-joystick-dir dir-up">▲</span>
            <span class="arcade-joystick-dir dir-down">▼</span>
            <span class="arcade-joystick-dir dir-left">◀</span>
            <span class="arcade-joystick-dir dir-right">▶</span>
            <div class="arcade-joystick-socket"></div>
            <div
              id="hud-joystick-shaft"
              class="arcade-joystick-shaft"
              style="transform: translate(0px, 0px);"
            ></div>
            <div
              id="hud-joystick-knob"
              class="arcade-joystick-ball"
              style="transform: translate(0px, 0px);"
            >
              <span class="text-base leading-none select-none pointer-events-none">🕹️</span>
            </div>
          </div>
          <span class="mt-1 text-[9px] font-mono-tabular font-bold uppercase tracking-widest text-sky-300">
            🕹️ JOYSTICK
          </span>
        </div>

        <!-- Right Side: Sprint Button, Dash Button, Special Ability Button -->
        <div class="flex items-center gap-2 pointer-events-auto">
          <button
            id="hud-dash-btn"
            class="w-20 h-12 rounded-2xl bio-btn-secondary flex flex-col items-center justify-center cursor-pointer border-2 border-sky-400/50"
          >
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-white">DASH</span>
            <span id="hud-dash-cd" class="text-[9px] font-mono-tabular text-sky-300">READY</span>
          </button>

          <button
            id="hud-special-btn"
            class="w-24 h-12 rounded-2xl bio-btn-secondary flex flex-col items-center justify-center cursor-pointer border-2 border-purple-500/40"
          >
            <span id="hud-special-name" class="text-[11px] font-extrabold uppercase tracking-wider text-white truncate px-1">${equippedSpec.name}</span>
            <span id="hud-special-cd" class="text-[9px] font-mono-tabular text-emerald-300">READY</span>
          </button>

          <button
            id="hud-sprint-btn"
            class="w-24 h-12 rounded-2xl bio-btn-primary flex flex-col items-center justify-center cursor-pointer shadow-lg"
          >
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-white">SPRINT</span>
            <span class="text-[9px] font-mono-tabular text-sky-100">HOLD</span>
          </button>
        </div>
      </div>
    `;

    this.cameraLookZoneEl = this.hudEl.querySelector('#hud-camera-look-zone')!;
    this.healthBarFill = this.hudEl.querySelector('#hud-health-fill')!;
    this.healthValueText = this.hudEl.querySelector('#hud-health-text')!;
    this.energyBarFill = this.hudEl.querySelector('#hud-energy-fill')!;
    this.energyValueText = this.hudEl.querySelector('#hud-energy-text')!;
    this.lowEnergyAlertEl = this.hudEl.querySelector('#hud-low-energy-alert')!;
    this.scoreValueText = this.hudEl.querySelector('#hud-score-text')!;
    this.timerValueText = this.hudEl.querySelector('#hud-timer-text')!;
    this.nutrientValueText = this.hudEl.querySelector('#hud-nutrient-text')!;
    this.sizeValueText = this.hudEl.querySelector('#hud-size-text')!;
    this.levelValueText = this.hudEl.querySelector('#hud-level-text')!;
    this.mapValueText = this.hudEl.querySelector('#hud-map-text')!;
    this.statusBannerEl = this.hudEl.querySelector('#hud-status-banner')!;
    this.regionPowerUpBoxEl = this.hudEl.querySelector('#hud-region-powerup-box')!;
    this.regionPowerUpNameEl = this.hudEl.querySelector('#hud-region-powerup-name')!;
    this.regionPowerUpTimerEl = this.hudEl.querySelector('#hud-region-powerup-timer')!;
    this.regionPowerUpBarEl = this.hudEl.querySelector('#hud-region-powerup-bar')!;
    this.dashBtnEl = this.hudEl.querySelector('#hud-dash-btn')!;
    this.dashCooldownText = this.hudEl.querySelector('#hud-dash-cd')!;
    this.specialAbilityBtnEl = this.hudEl.querySelector('#hud-special-btn')!;
    this.specialAbilityNameText = this.hudEl.querySelector('#hud-special-name')!;
    this.specialAbilityCdText = this.hudEl.querySelector('#hud-special-cd')!;
    this.sprintBtnEl = this.hudEl.querySelector('#hud-sprint-btn')!;
    this.joystickZoneEl = this.hudEl.querySelector('#hud-joystick-zone')!;
    this.joystickShaftEl = this.hudEl.querySelector('#hud-joystick-shaft')!;
    this.joystickKnobEl = this.hudEl.querySelector('#hud-joystick-knob')!;

    this.hudEl.querySelector('#hud-pause-btn')?.addEventListener('click', () => {
      this.engine.pauseGame();
    });

    this.hudEl.querySelector('#hud-quit-btn')?.addEventListener('click', () => {
      this.engine.returnToMainMenu();
    });

    this.dashBtnEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.engine.triggerDash();
    });

    this.specialAbilityBtnEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.engine.activateAbility(this.engine.settings.equippedAbilityId);
    });

    const setSprint = (active: boolean) => {
      this.engine.sprintHeld = active;
      this.sprintBtnEl.style.transform = active ? 'scale(0.95)' : 'scale(1)';
    };
    this.sprintBtnEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      setSprint(true);
    });
    this.sprintBtnEl.addEventListener('pointerup', () => setSprint(false));
    this.sprintBtnEl.addEventListener('pointercancel', () => setSprint(false));
    this.sprintBtnEl.addEventListener('pointerleave', () => setSprint(false));

    this.bindVirtualJoystick();
  }

  private refreshEquippedAbilityButton(): void {
    const spec = BIOLOGICAL_ABILITIES[this.engine.settings.equippedAbilityId];
    if (this.specialAbilityNameText && spec) {
      this.specialAbilityNameText.textContent = spec.name;
    }
  }

  private bindVirtualJoystick(): void {
    const updateKnob = (clientX: number, clientY: number) => {
      const dx = clientX - this.joystickCenter.x;
      const dy = clientY - this.joystickCenter.y;
      const dist = Math.hypot(dx, dy);
      const clampedDist = Math.min(dist, this.joystickMaxRadius);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;

      this.joystickKnobEl.style.transform = `translate(${kx}px, ${ky}px)`;
      this.joystickShaftEl.style.transform = `translate(${kx * 0.45}px, ${ky * 0.45}px)`;
      this.engine.joystickX = kx / this.joystickMaxRadius;
      this.engine.joystickY = ky / this.joystickMaxRadius;
    };

    const resetJoystick = () => {
      this.joystickPointerId = null;
      this.joystickKnobEl.style.transform = 'translate(0px, 0px)';
      this.joystickShaftEl.style.transform = 'translate(0px, 0px)';
      this.engine.joystickX = 0;
      this.engine.joystickY = 0;
    };

    this.joystickZoneEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.joystickZoneEl.setPointerCapture(e.pointerId);
      this.joystickPointerId = e.pointerId;
      const rect = this.joystickZoneEl.getBoundingClientRect();
      this.joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      updateKnob(e.clientX, e.clientY);
    });

    this.joystickZoneEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      e.stopPropagation();
      updateKnob(e.clientX, e.clientY);
    });

    this.joystickZoneEl.addEventListener('pointerup', (e) => {
      if (e.pointerId === this.joystickPointerId) {
        resetJoystick();
      }
    });

    this.joystickZoneEl.addEventListener('pointercancel', (e) => {
      if (e.pointerId === this.joystickPointerId) {
        resetJoystick();
      }
    });
  }

  private bindCameraGestureHandlers(): void {
    this.cameraLookZoneEl.addEventListener('pointerdown', (e) => {
      this.cameraLookZoneEl.setPointerCapture(e.pointerId);
      this.activeCameraPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activeCameraPointers.size === 2) {
        const pts = Array.from(this.activeCameraPointers.values());
        this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    });

    this.cameraLookZoneEl.addEventListener('pointermove', (e) => {
      const prev = this.activeCameraPointers.get(e.pointerId);
      if (!prev) return;

      if (this.activeCameraPointers.size === 1) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        this.engine.cameraController.addYawPitchDelta(dx * 0.0055, dy * 0.0045);
        prev.x = e.clientX;
        prev.y = e.clientY;
      } else if (this.activeCameraPointers.size === 2) {
        prev.x = e.clientX;
        prev.y = e.clientY;
        const pts = Array.from(this.activeCameraPointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.lastPinchDist !== null) {
          const delta = this.lastPinchDist - dist;
          this.engine.cameraController.addZoomDelta(delta * 0.03);
        }
        this.lastPinchDist = dist;
      }
    });

    const removePointer = (e: PointerEvent) => {
      this.activeCameraPointers.delete(e.pointerId);
      if (this.activeCameraPointers.size < 2) {
        this.lastPinchDist = null;
      }
    };
    this.cameraLookZoneEl.addEventListener('pointerup', removePointer);
    this.cameraLookZoneEl.addEventListener('pointercancel', removePointer);

    window.addEventListener(
      'wheel',
      (e) => {
        if (this.engine.screenState === GameScreenState.PLAYING) {
          this.engine.cameraController.addZoomDelta(e.deltaY * 0.006);
        }
      },
      { passive: true },
    );
  }

  private buildPauseModal(): void {
    this.pauseModalEl.innerHTML = `
      <div class="bio-surface rounded-2xl max-w-sm w-full p-6 flex flex-col gap-3 text-center">
        <h3 class="text-2xl font-extrabold text-white mb-2">PAUSED</h3>
        <button id="pause-resume-btn" class="w-full py-3 rounded-xl bio-btn-primary font-bold uppercase tracking-wider cursor-pointer">
          Resume
        </button>
        <button id="pause-restart-btn" class="w-full py-3 rounded-xl bio-btn-secondary font-bold uppercase tracking-wider cursor-pointer">
          Restart
        </button>
        <button id="pause-settings-btn" class="w-full py-3 rounded-xl bio-btn-secondary font-bold uppercase tracking-wider cursor-pointer">
          Settings
        </button>
        <button id="pause-menu-btn" class="w-full py-3 rounded-xl bio-btn-secondary font-bold uppercase tracking-wider cursor-pointer text-rose-300">
          Quit Game
        </button>
      </div>
    `;

    this.pauseModalEl.querySelector('#pause-resume-btn')?.addEventListener('click', () => {
      this.engine.resumeGame();
    });
    this.pauseModalEl.querySelector('#pause-restart-btn')?.addEventListener('click', () => {
      this.engine.startNewGame();
    });
    this.pauseModalEl.querySelector('#pause-settings-btn')?.addEventListener('click', () => {
      this.openSubPanel(MenuSubPanel.SETTINGS);
    });
    this.pauseModalEl.querySelector('#pause-menu-btn')?.addEventListener('click', () => {
      this.engine.returnToMainMenu();
    });
  }

  private renderGameOverModal(summary: GameOverSummary): void {
    const unlocksHtml =
      summary.newlyUnlockedOrganisms.length > 0 || summary.newlyUnlockedAbilities.length > 0
        ? `<div class="bg-emerald-950/90 border border-emerald-500/40 rounded-xl p-3 text-xs text-emerald-300 font-mono-tabular">
            <div class="font-bold uppercase">NEW UNLOCKS!</div>
            ${summary.newlyUnlockedOrganisms.map((n) => `<div>• Organism: <b>${n}</b></div>`).join('')}
            ${summary.newlyUnlockedAbilities.map((a) => `<div>• Ability: <b>${BIOLOGICAL_ABILITIES[a].name}</b></div>`).join('')}
          </div>`
        : '';

    this.gameOverModalEl.innerHTML = `
      <div class="bio-surface rounded-2xl max-w-md w-full p-6 flex flex-col gap-4 text-center">
        <div>
          <h3 class="text-3xl font-extrabold text-white">GAME OVER</h3>
          ${
            summary.isNewBestScore
              ? `<span class="inline-block mt-1 px-3 py-0.5 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-xs font-mono-tabular font-bold">NEW BEST SCORE!</span>`
              : ''
          }
        </div>

        <div class="grid grid-cols-2 gap-2.5 font-mono-tabular">
          <div class="bio-card p-3 rounded-xl">
            <div class="text-[10px] text-slate-400 uppercase">FINAL SCORE</div>
            <div class="text-2xl font-extrabold text-emerald-400">${summary.score}</div>
          </div>
          <div class="bio-card p-3 rounded-xl">
            <div class="text-[10px] text-slate-400 uppercase">BEST SCORE</div>
            <div class="text-2xl font-extrabold text-amber-300">${summary.bestScore}</div>
          </div>
          <div class="bio-card p-3 rounded-xl">
            <div class="text-[10px] text-slate-400 uppercase">SURVIVAL TIME</div>
            <div class="text-xl font-bold text-sky-300">${formatTime(summary.survivalTimeSec)}</div>
          </div>
          <div class="bio-card p-3 rounded-xl">
            <div class="text-[10px] text-slate-400 uppercase">NUTRIENTS COLLECTED</div>
            <div class="text-xl font-bold text-white">${summary.nutrientsCollected}</div>
          </div>
        </div>

        ${unlocksHtml}

        <div class="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button id="gameover-retry-btn" class="flex-1 py-3.5 rounded-xl bio-btn-primary font-extrabold uppercase tracking-wider cursor-pointer">
            Play Again
          </button>
          <button id="gameover-menu-btn" class="flex-1 py-3.5 rounded-xl bio-btn-secondary font-bold uppercase tracking-wider cursor-pointer text-rose-300">
            Quit Game
          </button>
        </div>
      </div>
    `;

    this.gameOverModalEl.querySelector('#gameover-retry-btn')?.addEventListener('click', () => {
      this.engine.startNewGame();
    });
    this.gameOverModalEl.querySelector('#gameover-menu-btn')?.addEventListener('click', () => {
      this.engine.returnToMainMenu();
    });
  }

  private updateHud(stats: ActivePlayerStats): void {
    const hpPct = Math.max(0, Math.min(100, (stats.health / stats.maxHealth) * 100));
    this.healthBarFill.style.width = `${hpPct}%`;
    this.healthValueText.textContent = `${Math.ceil(stats.health)} / ${stats.maxHealth}`;

    const enPct = Math.max(0, Math.min(100, (stats.energy / stats.maxEnergy) * 100));
    this.energyBarFill.style.width = `${enPct}%`;
    this.energyValueText.textContent = `${Math.ceil(stats.energy)} / ${stats.maxEnergy}`;

    if (enPct < 22) {
      this.lowEnergyAlertEl.classList.remove('hidden');
    } else {
      this.lowEnergyAlertEl.classList.add('hidden');
    }

    this.scoreValueText.textContent = `${Math.floor(stats.score)}`;
    this.timerValueText.textContent = formatTime(stats.survivalTimeSec);
    this.nutrientValueText.textContent = `${stats.nutrientsCollected}`;
    this.sizeValueText.textContent = `${Math.round(stats.size * 100)}%`;
    this.levelValueText.textContent = (
      DIFFICULTY_PRESETS[stats.difficultyLevel]?.label || 'NORMAL'
    ).toUpperCase();
    const activeMap =
      ARENA_MAPS[this.engine.settings.selectedMapId] || ARENA_MAPS[ArenaMapId.HEART];
    this.mapValueText.textContent = activeMap.shortName.toUpperCase();
    this.mapValueText.style.color = activeMap.accentHex;

    if (stats.activeRegionPowerUp.id && stats.activeRegionPowerUp.remainingSec > 0) {
      const pSpec = REGION_POWER_UPS[stats.activeRegionPowerUp.id];
      const pct = Math.max(
        0,
        Math.min(100, (stats.activeRegionPowerUp.remainingSec / stats.activeRegionPowerUp.durationSec) * 100),
      );
      this.regionPowerUpBoxEl.classList.remove('hidden');
      this.regionPowerUpNameEl.textContent = `★ ${pSpec.name.toUpperCase()}`;
      this.regionPowerUpNameEl.style.color = pSpec.accentHex;
      this.regionPowerUpTimerEl.textContent = `${stats.activeRegionPowerUp.remainingSec.toFixed(1)}s`;
      this.regionPowerUpBarEl.style.width = `${pct}%`;
      this.regionPowerUpBarEl.style.backgroundColor = pSpec.accentHex;
    } else {
      this.regionPowerUpBoxEl.classList.add('hidden');
    }

    if (stats.dashCooldown > 0) {
      this.dashCooldownText.textContent = `${stats.dashCooldown.toFixed(1)}s`;
      this.dashBtnEl.style.opacity = '0.6';
    } else {
      this.dashCooldownText.textContent = 'READY';
      this.dashBtnEl.style.opacity = '1';
    }

    // Update Special Ability button state
    const eqId = this.engine.settings.equippedAbilityId;
    const eqState = stats.activeAbilities[eqId];
    if (eqState) {
      if (eqState.activeRemaining > 0) {
        this.specialAbilityCdText.textContent = `ACTIVE ${eqState.activeRemaining.toFixed(1)}s`;
        this.specialAbilityBtnEl.style.opacity = '1';
      } else if (eqState.cooldownRemaining > 0) {
        this.specialAbilityCdText.textContent = `${eqState.cooldownRemaining.toFixed(1)}s`;
        this.specialAbilityBtnEl.style.opacity = '0.65';
      } else {
        this.specialAbilityCdText.textContent = 'READY';
        this.specialAbilityBtnEl.style.opacity = '1';
      }
    }
  }

  private showBanner(message: string, colorHex = '#38bdf8'): void {
    if (!this.statusBannerEl) return;
    this.statusBannerEl.textContent = message;
    this.statusBannerEl.style.color = colorHex;
    this.statusBannerEl.style.opacity = '1';

    if (this.bannerTimeout !== null) {
      window.clearTimeout(this.bannerTimeout);
    }
    this.bannerTimeout = window.setTimeout(() => {
      this.statusBannerEl.style.opacity = '0';
    }, 2400);
  }

  private handleScreenStateChange(
    state: GameScreenState,
    summary?: GameOverSummary,
  ): void {
    const isInGame =
      state === GameScreenState.PLAYING || state === GameScreenState.PAUSED;

    this.splashEl.classList.toggle('hidden', state !== GameScreenState.SPLASH);
    this.mainMenuEl.classList.toggle('hidden', state !== GameScreenState.MAIN_MENU);
    this.hudEl.classList.toggle('hidden', !isInGame);
    this.pauseModalEl.classList.toggle('hidden', state !== GameScreenState.PAUSED);
    this.gameOverModalEl.classList.toggle('hidden', state !== GameScreenState.GAME_OVER);

    if (state === GameScreenState.MAIN_MENU) {
      this.openSubPanel(MenuSubPanel.NONE);
      this.renderMainMenuContent();
    } else if (state === GameScreenState.PLAYING) {
      this.refreshEquippedAbilityButton();
    } else if (state === GameScreenState.GAME_OVER && summary) {
      this.renderGameOverModal(summary);
    }
  }
}
