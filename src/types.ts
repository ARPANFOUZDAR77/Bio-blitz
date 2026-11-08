export enum GameScreenState {
  SPLASH = 'SPLASH',
  MAIN_MENU = 'MAIN_MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
}

export enum MenuSubPanel {
  NONE = 'NONE',
  ORGANISMS = 'ORGANISMS',
  ABILITIES = 'ABILITIES',
  STATISTICS = 'STATISTICS',
  SETTINGS = 'SETTINGS',
  ABOUT = 'ABOUT',
}

export enum GraphicsQuality {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum DifficultyLevel {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
  EXTREME = 'EXTREME',
}

export enum EnemyType {
  HUNTER = 'HUNTER',
  WANDERER = 'WANDERER',
  SCAVENGER = 'SCAVENGER',
  DEFENSIVE = 'DEFENSIVE',
}

export enum AbilityId {
  FLAGELLA_BOOST = 'FLAGELLA_BOOST',
  MEMBRANE_SHIELD = 'MEMBRANE_SHIELD',
  CHEMOTAXIS = 'CHEMOTAXIS',
  BINARY_FISSION = 'BINARY_FISSION',
}

export enum NutrientKind {
  ATP_GLUCOSE = 'ATP_GLUCOSE',
  OXYGEN = 'OXYGEN',
  AMINO_CLUSTER = 'AMINO_CLUSTER',
}

export enum ArenaMapId {
  PANCREAS = 'PANCREAS',
  LIVER = 'LIVER',
  BRAIN = 'BRAIN',
  HEART = 'HEART',
  INTESTINE = 'INTESTINE',
  BLOODSTREAM = 'BLOODSTREAM',
}

export enum RegionPowerUpId {
  INSULIN_RUSH = 'INSULIN_RUSH',
  IRON_CORE = 'IRON_CORE',
  DOPAMINE_SURGE = 'DOPAMINE_SURGE',
  ADRENALINE_PULSE = 'ADRENALINE_PULSE',
  ENZYME_BLOOM = 'ENZYME_BLOOM',
  HEMOGLOBIN_BURST = 'HEMOGLOBIN_BURST',
}

export interface RegionPowerUpSpec {
  id: RegionPowerUpId;
  name: string;
  organId: ArenaMapId;
  organName: string;
  durationSec: number;
  summary: string;
  bannerText: string;
  coreColor: number;
  ringColor: number;
  accentHex: string;
  scoreBonus: number;
}

export interface ArenaMapSpec {
  id: ArenaMapId;
  name: string;
  shortName: string;
  subtitle: string;
  description: string;
  powerUpId: RegionPowerUpId;
  bgColor: number;
  fogColor: number;
  wallColor: number;
  wallEmissive: number;
  capColor: number;
  cellColor: number;
  cellEmissive: number;
  obstacleCoreColor: number;
  obstacleStrandColor: number;
  obstacleAccentColor: number;
  accentHex: string;
  flowSpeed: number;
}

export interface DifficultyPresetConfig {
  level: DifficultyLevel;
  label: string;
  tagline: string;
  initialEnemies: number;
  enemySpeedMultiplier: number;
  enemyDamageMultiplier: number;
  energyDrainMultiplier: number;
  scoreMultiplier: number;
  rampRateSec: number;
  accentColor: string;
}

export interface OrganismStrain {
  id: string;
  name: string;
  classification: string;
  description: string;
  unlockScoreRequired: number;
  baseHealth: number;
  baseEnergy: number;
  baseSpeed: number;
  flagellaCount: number;
  mitochondriaCount: number;
  membraneColor: number;
  cytoplasmColor: number;
  nucleusColor: number;
  mitochondriaColor: number;
  flagellaColor: number;
}

export interface AbilitySpec {
  id: AbilityId;
  name: string;
  cooldownSec: number;
  durationSec: number;
  energyCost: number;
  unlockNutrientsRequired: number;
  description: string;
  accentColor: string;
  hexColor: number;
}

export interface GraphicsPresetConfig {
  quality: GraphicsQuality;
  label: string;
  maxEnemies: number;
  rbcCount: number;
  nutrientCount: number;
  oxygenCount: number;
  pixelRatioCap: number;
  shadowsEnabled: boolean;
  vesselSegments: number;
}

export interface GameSettings {
  graphicsQuality: GraphicsQuality;
  difficultyLevel: DifficultyLevel;
  selectedMapId: ArenaMapId;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  cameraSensitivity: number;
  vibrationEnabled: boolean;
  selectedOrganismId: string;
  equippedAbilityId: AbilityId;
}

export interface RunSessionResult {
  id?: number;
  timestamp: number;
  score: number;
  survivalTimeSec: number;
  nutrientsCollected: number;
  enemiesEvadedOrEliminated: number;
  maxSizeReached: number;
  organismId: string;
  difficultyLevel?: DifficultyLevel;
}

export interface LifetimeStatistics {
  bestScore: number;
  longestSurvivalSec: number;
  totalNutrientsCollected: number;
  totalGamesPlayed: number;
  totalTimeSurvivedSec: number;
  unlockedOrganismIds: string[];
  unlockedAbilityIds: AbilityId[];
  recentRuns: RunSessionResult[];
}

export interface ActivePlayerStats {
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  speed: number;
  size: number;
  survivalTimeSec: number;
  score: number;
  nutrientsCollected: number;
  invulnerableTimer: number;
  isSprinting: boolean;
  isDashing: boolean;
  dashCooldown: number;
  activeAbilities: Record<AbilityId, { cooldownRemaining: number; activeRemaining: number }>;
  activeRegionPowerUp: {
    id: RegionPowerUpId | null;
    remainingSec: number;
    durationSec: number;
  };
  difficultyMultiplier: number;
  difficultyLevel: DifficultyLevel;
}
