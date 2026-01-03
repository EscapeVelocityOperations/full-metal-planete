/**
 * Full Metal Planete - Core Game Types
 *
 * Based on the official game rules and data model specification.
 */

// ============================================================================
// 1. Coordinates
// ============================================================================

/**
 * Axial hex coordinates (storage format)
 * q = column, r = row
 */
export interface HexCoord {
  q: number;
  r: number;
}

/**
 * Cube hex coordinates (calculation format)
 * Constraint: x + y + z = 0
 */
export interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

// ============================================================================
// 2. Identifiers
// ============================================================================

export type PlayerId = string; // "p1", "p2", "p3", "p4"
export type UnitId = string; // "tank-p1-1", "barge-p2-1"
export type MineralId = string; // "mineral-42"

// ============================================================================
// 3. Enumerations
// ============================================================================

export enum TerrainType {
  Sea = 'sea',
  Land = 'land',
  Marsh = 'marsh',
  Reef = 'reef',
  Mountain = 'mountain',
}

export enum TideLevel {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
}

export enum UnitType {
  Astronef = 'astronef',
  Tower = 'tower',
  Tank = 'tank',
  SuperTank = 'supertank',
  MotorBoat = 'motorboat',
  Barge = 'barge',
  Crab = 'crab',
  Converter = 'converter',
  Bridge = 'bridge',
}

export enum PlayerColor {
  Red = 'red',
  Blue = 'blue',
  Green = 'green',
  Yellow = 'yellow',
}

export enum GamePhase {
  Landing = 'landing', // Turn 1
  Deployment = 'deployment', // Turn 2
  Playing = 'playing', // Turns 3-25
  LiftOffDecision = 'liftoff', // Turn 21 decision
  Finished = 'finished', // Game over
}

// ============================================================================
// 4. Unit Domain Types
// ============================================================================

export type UnitDomain = 'land' | 'sea' | 'fixed' | 'none';

export interface UnitProperties {
  domain: UnitDomain;
  combatRange: number;
  mountainRangeBonus: number;
  canEnterMountain: boolean;
  cargoSlots: number;
  canCarryLarge?: boolean;
  size: number; // Cargo slot requirement
  canBuild?: boolean;
  canPredictTide?: boolean;
  isNeutral?: boolean;
  maxShots?: number; // Max shots per turn (2 for combat units)
  movementCost: number; // AP cost per hex (Infinity = cannot move)
}

export const UNIT_PROPERTIES: Record<UnitType, UnitProperties> = {
  [UnitType.Tank]: {
    domain: 'land',
    combatRange: 2,
    mountainRangeBonus: 1, // 3 range on mountains
    canEnterMountain: true,
    cargoSlots: 0,
    size: 1,
    maxShots: 2,
    movementCost: 1,
  },
  [UnitType.SuperTank]: {
    domain: 'land',
    combatRange: 3,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: 0,
    size: 1,
    maxShots: 2,
    movementCost: 2, // GCA - heavy unit
  },
  [UnitType.MotorBoat]: {
    domain: 'sea',
    combatRange: 2,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: 0,
    size: 0, // Not transportable
    maxShots: 2,
    movementCost: 1,
  },
  [UnitType.Barge]: {
    domain: 'sea',
    combatRange: 0,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: 4,
    canCarryLarge: true, // Can carry Converter, Crab
    size: 0,
    movementCost: 2, // Heavy transporter
  },
  [UnitType.Crab]: {
    domain: 'land',
    combatRange: 0,
    mountainRangeBonus: 0,
    canEnterMountain: true,
    cargoSlots: 2,
    canCarryLarge: false,
    size: 2,
    movementCost: 1,
  },
  [UnitType.Converter]: {
    domain: 'land',
    combatRange: 0,
    mountainRangeBonus: 0,
    canEnterMountain: true,
    cargoSlots: 1, // For mineral being converted
    size: 2,
    canBuild: true,
    canPredictTide: true,
    movementCost: 2, // Heavy unit
  },
  [UnitType.Bridge]: {
    domain: 'none', // Inert
    combatRange: 0,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: 0,
    size: 1,
    isNeutral: true,
    movementCost: Infinity, // Cannot move once placed
  },
  [UnitType.Tower]: {
    domain: 'fixed',
    combatRange: 2,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: 0,
    size: 0,
    maxShots: 2,
    movementCost: Infinity, // Fixed on Astronef
  },
  [UnitType.Astronef]: {
    domain: 'fixed',
    combatRange: 0,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: Infinity,
    size: 4, // 4 hexes
    movementCost: Infinity, // Cannot move during game
  },
};

// ============================================================================
// 5. Unit State
// ============================================================================

export interface TurretState {
  podeIndex: number; // 0, 1, 2
  isDestroyed: boolean;
}

export interface Unit {
  id: UnitId;
  type: UnitType;
  owner: PlayerId;
  position: HexCoord | null; // null when unit is in inventory/not placed

  // Original owner (for captured units - used for visual color display)
  originalOwner?: PlayerId;

  // Rotation for multi-hex units (0-5, each step is 60 degrees clockwise)
  rotation?: number;

  // Combat state
  shotsRemaining: number; // Reset each turn (max 2 for combat units)

  // Movement state
  isStuck: boolean; // Caught by tide
  isNeutralized: boolean; // Under fire, cannot escape

  // Transporter state (for Barge, Crab, Converter)
  cargo?: (UnitId | MineralId)[];

  // Astronef-specific
  turrets?: TurretState[];
  hasLiftedOff?: boolean;
}

// ============================================================================
// 6. Board and Terrain
// ============================================================================

export interface HexTerrain {
  coord: HexCoord;
  type: TerrainType;
  landingZone?: number; // 1-8 for landing zone boundaries
}

export interface Mineral {
  id: MineralId;
  position: HexCoord;
}

export interface BridgePlacement {
  id: UnitId;
  position: HexCoord;
  placedBy: PlayerId; // For tracking, but bridges are neutral
}

// ============================================================================
// 7. Player State
// ============================================================================

export interface Player {
  id: PlayerId;
  name: string;
  color: PlayerColor;

  // Connection
  isConnected: boolean;
  isReady: boolean;

  // Game state
  astronefPosition: HexCoord[]; // 4 hexes
  hasLiftedOff: boolean;
  liftOffTurn?: number; // 21 or 25

  // Captured astronefs
  capturedAstronefs: PlayerId[];
}

// ============================================================================
// 8. Game State
// ============================================================================

export interface GameState {
  // Identity
  gameId: string;

  // Turn management
  turn: number; // 1-25
  phase: GamePhase;
  currentPlayer: PlayerId;
  turnOrder: PlayerId[];

  // Timing
  turnStartTime: number; // Timestamp
  turnTimeLimit: number; // 180000 (3 min in ms)

  // Action points
  actionPoints: number; // Current player's remaining AP
  savedActionPoints: Record<PlayerId, number>; // 0-10 per player

  // Build tracking (per turn)
  buildsThisTurn: UnitType[]; // Unit types built this turn (max 2, no duplicate special types)

  // Tide
  currentTide: TideLevel;
  tideDeck: TideLevel[]; // Remaining cards
  tideDiscard: TideLevel[]; // Used cards

  // Board
  terrain: HexTerrain[]; // Static terrain data
  minerals: Mineral[]; // Mineral positions
  units: Unit[]; // All units
  bridges: BridgePlacement[]; // Active bridges

  // Players
  players: Player[];

  // Turn 21 decisions
  liftOffDecisions: Record<PlayerId, boolean | null>;

  // Scores (computed from state)
  scores?: Record<PlayerId, number>;
}

// ============================================================================
// 9. Actions
// ============================================================================

export interface BaseAction {
  type: string;
  playerId: PlayerId;
  timestamp: number;
}

export interface MoveAction extends BaseAction {
  type: 'MOVE';
  unitId: UnitId;
  path: HexCoord[]; // Full path for animation/validation
  apCost: number;
}

export interface LoadAction extends BaseAction {
  type: 'LOAD';
  transporterId: UnitId;
  cargoId: UnitId | MineralId;
  apCost: number;
}

export interface UnloadAction extends BaseAction {
  type: 'UNLOAD';
  transporterId: UnitId;
  cargoId: UnitId | MineralId;
  destination: HexCoord;
  apCost: number;
}

export interface FireAction extends BaseAction {
  type: 'FIRE';
  attackerIds: [UnitId, UnitId]; // Always 2 units
  targetHex: HexCoord;
  apCost: number; // Always 2
}

export interface CaptureAction extends BaseAction {
  type: 'CAPTURE';
  attackerIds: [UnitId, UnitId];
  targetId: UnitId;
  apCost: number; // Always 1
}

export interface BuildAction extends BaseAction {
  type: 'BUILD';
  converterId: UnitId;
  unitType: UnitType;
  apCost: number; // Always 1 to unload
}

export interface EnterAstronefAction extends BaseAction {
  type: 'ENTER_ASTRONEF';
  unitId: UnitId;
  podeIndex: number;
  apCost: number; // Always 1
}

export interface ExitAstronefAction extends BaseAction {
  type: 'EXIT_ASTRONEF';
  unitId: UnitId;
  podeIndex: number;
  destination: HexCoord;
  apCost: number; // Always 1
}

export interface LiftOffAction extends BaseAction {
  type: 'LIFT_OFF';
  decision: 'now' | 'stay'; // Turn 21 only
}

// Landing phase action (Turn 1)
export interface LandAstronefAction extends BaseAction {
  type: 'LAND_ASTRONEF';
  position: HexCoord[]; // 3 positions for astronef podes
}

// Deployment phase action (Turn 2)
export interface DeployUnitAction extends BaseAction {
  type: 'DEPLOY_UNIT';
  unitId: UnitId;
  position: HexCoord;
}

export interface EndTurnAction extends BaseAction {
  type: 'END_TURN';
  savedAP: number;
}

export interface RebuildTowerAction extends BaseAction {
  type: 'REBUILD_TOWER';
  astronefId: UnitId;
  podeIndex: number;
  apCost: number; // Always 2
}

export interface RetreatAction extends BaseAction {
  type: 'RETREAT';
  unitId: UnitId;
  destination: HexCoord;
}

export interface CaptureAstronefAction extends BaseAction {
  type: 'CAPTURE_ASTRONEF';
  combatUnitId: UnitId; // The combat unit entering the astronef
  targetAstronefId: UnitId; // The astronef being captured
  apCost: number; // Cost to move onto astronef hex (movement cost)
}

export interface PlaceBridgeAction extends BaseAction {
  type: 'PLACE_BRIDGE';
  bridgeId: UnitId; // Bridge being placed (from cargo)
  position: HexCoord; // Where to place it
  apCost: number; // Always 1 to unload
}

export interface PickupBridgeAction extends BaseAction {
  type: 'PICKUP_BRIDGE';
  bridgeId: UnitId; // Bridge being picked up
  transporterId: UnitId; // Unit picking up the bridge
  apCost: number; // Always 1 to load
}

export type GameAction =
  | MoveAction
  | LoadAction
  | UnloadAction
  | FireAction
  | CaptureAction
  | BuildAction
  | EnterAstronefAction
  | ExitAstronefAction
  | LiftOffAction
  | LandAstronefAction
  | DeployUnitAction
  | EndTurnAction
  | RebuildTowerAction
  | RetreatAction
  | CaptureAstronefAction
  | PlaceBridgeAction
  | PickupBridgeAction;

// ============================================================================
// 10. Game Constants
// ============================================================================

// ============================================================================
// 10b. Multi-Hex Unit Shapes
// ============================================================================

/**
 * Multi-hex unit shape definitions.
 * Offsets are relative to the "position" (anchor) hex.
 * For Astronef: center hex + 3 podes in a Y shape
 * For Barge: 2 hexes in a line (anchor + 1 neighbor)
 */
export interface UnitShape {
  hexCount: number;
  /** Relative hex offsets from anchor (first is always {q:0, r:0}) */
  offsets: HexCoord[];
  /** Whether the shape can be rotated during placement */
  canRotate: boolean;
}

/**
 * Get relative hex offsets for multi-hex units.
 * Single-hex units return just the anchor [{q:0, r:0}].
 * Astronef: 4 hexes - center + 3 podes in Y pattern
 * Barge: 2 hexes - line of 2
 */
export const UNIT_SHAPES: Record<UnitType, UnitShape> = {
  [UnitType.Astronef]: {
    hexCount: 4,
    // Center + 3 podes: NE, W, SE (flat-top hex, forms a Y with tower at SE)
    offsets: [
      { q: 0, r: 0 },   // Center (anchor/main body)
      { q: 1, r: -1 },  // Pode 1: Northeast (upper right)
      { q: -1, r: 0 },  // Pode 2: West (left)
      { q: 0, r: 1 },   // Pode 3: Southeast (lower right, tower position)
    ],
    canRotate: true,
  },
  [UnitType.Barge]: {
    hexCount: 2,
    // Line of 2 hexes: anchor + East neighbor
    offsets: [
      { q: 0, r: 0 },   // Anchor
      { q: 1, r: 0 },   // East neighbor
    ],
    canRotate: true,
  },
  // Single-hex units (canRotate enables visual sprite rotation)
  [UnitType.Tower]: {
    hexCount: 1,
    offsets: [{ q: 0, r: 0 }],
    canRotate: true,
  },
  [UnitType.Tank]: {
    hexCount: 1,
    offsets: [{ q: 0, r: 0 }],
    canRotate: true,
  },
  [UnitType.SuperTank]: {
    hexCount: 1,
    offsets: [{ q: 0, r: 0 }],
    canRotate: true,
  },
  [UnitType.MotorBoat]: {
    hexCount: 1,
    offsets: [{ q: 0, r: 0 }],
    canRotate: true,
  },
  [UnitType.Crab]: {
    hexCount: 1,
    offsets: [{ q: 0, r: 0 }],
    canRotate: true,
  },
  [UnitType.Converter]: {
    hexCount: 1,
    offsets: [{ q: 0, r: 0 }],
    canRotate: true,
  },
  [UnitType.Bridge]: {
    hexCount: 1,
    offsets: [{ q: 0, r: 0 }],
    canRotate: true,
  },
};

export const GAME_CONSTANTS = {
  // Turns
  MIN_TURNS: 21,
  MAX_TURNS: 25,

  // Action Points
  BASE_AP: 15,
  TURN_3_AP: 5,
  TURN_4_AP: 10,
  MAX_SAVED_AP: 10,
  CAPTURED_ASTRONEF_BONUS_AP: 5,

  // Time
  TURN_TIME_LIMIT_MS: 180000, // 3 minutes

  // Board
  TOTAL_HEXES: 851,

  // Tide deck
  TIDE_CARDS_TOTAL: 15,
  TIDE_CARDS_LOW: 5,
  TIDE_CARDS_NORMAL: 5,
  TIDE_CARDS_HIGH: 5,
  TIDE_CARDS_ACTIVE: 9,
  TIDE_CARDS_DISCARDED: 6,

  // Combat
  SHOTS_PER_UNIT_PER_TURN: 2,
  UNITS_REQUIRED_TO_DESTROY: 2,
  UNITS_REQUIRED_TO_CAPTURE: 2,
  AP_COST_FIRE: 2, // Total cost (1 per shot)
  AP_COST_CAPTURE: 1,

  // Movement costs
  AP_COST_MOVE: 1,
  AP_COST_LOAD: 1,
  AP_COST_UNLOAD: 1,
  AP_COST_ENTER_ASTRONEF: 1,
  AP_COST_EXIT_ASTRONEF: 1,
  AP_COST_BUILD: 1,
  AP_COST_REBUILD_TOWER: 2,

  // Scoring
  POINTS_PER_MINERAL: 2,
  POINTS_PER_EQUIPMENT: 1,
  POINTS_PER_TURRET: 1,

  // Starting force per player
  STARTING_FORCE: {
    [UnitType.Astronef]: 1,
    [UnitType.Tower]: 3,
    [UnitType.Barge]: 1,
    [UnitType.Crab]: 1,
    [UnitType.Converter]: 1,
    [UnitType.MotorBoat]: 2,
    [UnitType.Tank]: 4,
    [UnitType.SuperTank]: 1,
    [UnitType.Bridge]: 1,
  },

  // Building limits per turn
  MAX_BUILDS_PER_TURN: 2,
  MAX_SPECIAL_BUILDS_PER_TURN: 1, // Crabs, Bridges
} as const;

// ============================================================================
// 11. Effective Terrain Type
// ============================================================================

export type EffectiveTerrainType = 'land' | 'sea';

// ============================================================================
// 12. Validation Result
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  apCost?: number;
}

// ============================================================================
// 13. Serialization Types (Compact Format)
// ============================================================================

export interface CompactGameState {
  t: number; // turn
  p: string; // current player
  ap: number; // action points
  tide: 0 | 1 | 2; // low/normal/high
  u: CompactUnit[];
  m: [number, number][]; // mineral positions
}

export interface CompactUnit {
  i: string; // id
  t: number; // type (enum index)
  o: string; // owner
  p: [number, number]; // position
  c?: string[]; // cargo
  s?: number; // shots remaining
}

export interface PersistedState {
  version: number;
  savedAt: string;
  state: GameState;
}
