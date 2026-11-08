import { BIOLOGICAL_ABILITIES, ORGANISM_STRAINS } from '../constants';
import {
  AbilityId,
  ArenaMapId,
  DifficultyLevel,
  GameSettings,
  GraphicsQuality,
  LifetimeStatistics,
  RunSessionResult,
} from '../types';

/**
 * Restricted Kotlin-JavaScript interface exposed by Android WebView
 * via `webView.addJavascriptInterface(BioBlitzJavascriptBridge(...), "BioBlitzAndroid")`
 */
interface NativeAndroidBridge {
  saveRunResult(jsonPayload: string): void;
  getLifetimeStatsJson(): string;
  saveSettingsJson(jsonPayload: string): void;
  getSettingsJson(): string;
  vibrate(durationMs: number): void;
  isXrSupported(): boolean;
}

declare global {
  interface Window {
    BioBlitzAndroid?: NativeAndroidBridge;
  }
}

const STORAGE_KEY_STATS = 'bioblitz_room_db_lifetime_stats_v1';
const STORAGE_KEY_SETTINGS = 'bioblitz_room_db_settings_v1';

const DEFAULT_SETTINGS: GameSettings = {
  graphicsQuality: GraphicsQuality.MEDIUM,
  difficultyLevel: DifficultyLevel.MEDIUM,
  selectedMapId: ArenaMapId.HEART,
  musicVolume: 0.55,
  sfxVolume: 0.75,
  muted: false,
  cameraSensitivity: 1.0,
  vibrationEnabled: true,
  selectedOrganismId: ORGANISM_STRAINS[0].id,
  equippedAbilityId: AbilityId.FLAGELLA_BOOST,
};

const DEFAULT_STATS: LifetimeStatistics = {
  bestScore: 0,
  longestSurvivalSec: 0,
  totalNutrientsCollected: 0,
  totalGamesPlayed: 0,
  totalTimeSurvivedSec: 0,
  unlockedOrganismIds: ORGANISM_STRAINS.filter((s) => s.unlockScoreRequired === 0).map((s) => s.id),
  unlockedAbilityIds: [AbilityId.FLAGELLA_BOOST, AbilityId.MEMBRANE_SHIELD],
  recentRuns: [],
};

export class AndroidBridgeService {
  private statsCache: LifetimeStatistics;
  private settingsCache: GameSettings;

  constructor() {
    this.statsCache = this.loadStats();
    this.settingsCache = this.loadSettings();
  }

  public isRunningInNativeAndroidWebView(): boolean {
    return typeof window !== 'undefined' && Boolean(window.BioBlitzAndroid);
  }

  public getSettings(): GameSettings {
    return { ...this.settingsCache };
  }

  public saveSettings(partial: Partial<GameSettings>): GameSettings {
    this.settingsCache = { ...this.settingsCache, ...partial };
    const serialized = JSON.stringify(this.settingsCache);
    try {
      if (window.BioBlitzAndroid?.saveSettingsJson) {
        window.BioBlitzAndroid.saveSettingsJson(serialized);
      }
      localStorage.setItem(STORAGE_KEY_SETTINGS, serialized);
    } catch {
      // Ignore storage quota errors in restricted webviews
    }
    return this.getSettings();
  }

  public getStatistics(): LifetimeStatistics {
    return {
      ...this.statsCache,
      unlockedOrganismIds: [...this.statsCache.unlockedOrganismIds],
      unlockedAbilityIds: [...this.statsCache.unlockedAbilityIds],
      recentRuns: [...this.statsCache.recentRuns],
    };
  }

  /**
   * Records a completed survival session into Room DB (on Android) and local mirror,
   * and evaluates score/nutrient thresholds to unlock new organisms & biological abilities.
   */
  public recordCompletedRun(run: RunSessionResult): {
    stats: LifetimeStatistics;
    newlyUnlockedOrganisms: string[];
    newlyUnlockedAbilities: AbilityId[];
    isNewBestScore: boolean;
  } {
    const isNewBestScore = run.score > this.statsCache.bestScore;
    this.statsCache.bestScore = Math.max(this.statsCache.bestScore, Math.floor(run.score));
    this.statsCache.longestSurvivalSec = Math.max(
      this.statsCache.longestSurvivalSec,
      Math.floor(run.survivalTimeSec),
    );
    this.statsCache.totalNutrientsCollected += run.nutrientsCollected;
    this.statsCache.totalGamesPlayed += 1;
    this.statsCache.totalTimeSurvivedSec += Math.floor(run.survivalTimeSec);

    const runWithId: RunSessionResult = {
      ...run,
      id: Date.now(),
    };
    this.statsCache.recentRuns = [runWithId, ...this.statsCache.recentRuns].slice(0, 15);

    const newlyUnlockedOrganisms: string[] = [];
    for (const strain of ORGANISM_STRAINS) {
      if (
        this.statsCache.bestScore >= strain.unlockScoreRequired &&
        !this.statsCache.unlockedOrganismIds.includes(strain.id)
      ) {
        this.statsCache.unlockedOrganismIds.push(strain.id);
        newlyUnlockedOrganisms.push(strain.name);
      }
    }

    const newlyUnlockedAbilities: AbilityId[] = [];
    for (const ability of Object.values(BIOLOGICAL_ABILITIES)) {
      if (
        this.statsCache.totalNutrientsCollected >= ability.unlockNutrientsRequired &&
        !this.statsCache.unlockedAbilityIds.includes(ability.id)
      ) {
        this.statsCache.unlockedAbilityIds.push(ability.id);
        newlyUnlockedAbilities.push(ability.id);
      }
    }

    try {
      if (window.BioBlitzAndroid?.saveRunResult) {
        window.BioBlitzAndroid.saveRunResult(JSON.stringify(runWithId));
      }
      localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(this.statsCache));
    } catch {
      // Ignore storage errors
    }

    return {
      stats: this.getStatistics(),
      newlyUnlockedOrganisms,
      newlyUnlockedAbilities,
      isNewBestScore,
    };
  }

  public triggerHaptic(durationMs = 25): void {
    if (!this.settingsCache.vibrationEnabled) return;
    try {
      if (window.BioBlitzAndroid?.vibrate) {
        window.BioBlitzAndroid.vibrate(durationMs);
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(durationMs);
      }
    } catch {
      // Ignore on unsupported devices
    }
  }

  public async checkXrCompatibility(): Promise<{
    supported: boolean;
    modeLabel: string;
  }> {
    try {
      if (window.BioBlitzAndroid?.isXrSupported) {
        const nativeSupported = window.BioBlitzAndroid.isXrSupported();
        if (nativeSupported) {
          return { supported: true, modeLabel: 'Android XR Native Bridge Ready' };
        }
      }
      if (typeof navigator !== 'undefined' && 'xr' in navigator && navigator.xr) {
        const arSupported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
        const vrSupported = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
        if (arSupported || vrSupported) {
          return {
            supported: true,
            modeLabel: arSupported ? 'WebXR Immersive AR Ready' : 'WebXR Immersive VR Ready',
          };
        }
      }
    } catch {
      // Ignore XR check failures
    }
    return {
      supported: false,
      modeLabel: 'Standard 3D Touch View (XR Desktop Simulator Available)',
    };
  }

  private loadStats(): LifetimeStatistics {
    try {
      if (window.BioBlitzAndroid?.getLifetimeStatsJson) {
        const raw = window.BioBlitzAndroid.getLifetimeStatsJson();
        if (raw) {
          return { ...DEFAULT_STATS, ...JSON.parse(raw) };
        }
      }
      const saved = localStorage.getItem(STORAGE_KEY_STATS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_STATS,
          ...parsed,
          unlockedOrganismIds: Array.from(
            new Set([...DEFAULT_STATS.unlockedOrganismIds, ...(parsed.unlockedOrganismIds || [])]),
          ),
          unlockedAbilityIds: Array.from(
            new Set([...DEFAULT_STATS.unlockedAbilityIds, ...(parsed.unlockedAbilityIds || [])]),
          ),
        };
      }
    } catch {
      // Fallback to default
    }
    return { ...DEFAULT_STATS };
  }

  private loadSettings(): GameSettings {
    try {
      if (window.BioBlitzAndroid?.getSettingsJson) {
        const raw = window.BioBlitzAndroid.getSettingsJson();
        if (raw) {
          return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        }
      }
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // Fallback to default
    }
    return { ...DEFAULT_SETTINGS };
  }
}

export const androidBridge = new AndroidBridgeService();
