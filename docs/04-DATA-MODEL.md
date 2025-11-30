# Full Metal Planète - Data Model

## 1. Core Types

### 1.1 Coordinates

```typescript
/**
 * Axial hex coordinates (storage format)
 * q = column, r = row
 */
interface HexCoord {
  q: number;
  r: number;
}

/**
 * Cube hex coordinates (calculation format)
 * Constraint: x + y + z = 0
 */
interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

// Conversion functions
function axialToCube(hex: HexCoord): CubeCoord {
  return { x: hex.q, z: hex.r, y: -hex.q - hex.r };
}

function cubeToAxial(cube: CubeCoord): HexCoord {
  return { q: cube.x, r: cube.z };
}
```

### 1.2 Identifiers

```typescript
type PlayerId = string;    // "p1", "p2", "p3", "p4"
type UnitId = string;      // "tank-p1-1", "barge-p2-1"
type MineralId = string;   // "mineral-42"
```

---

## 2. Enumerations

### 2.1 Terrain

```typescript
enum TerrainType {
  Sea = 'sea',
  Land = 'land',
  Marsh = 'marsh',
  Reef = 'reef',
  Mountain = 'mountain',
}
```

### 2.2 Tide

```typescript
enum TideLevel {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
}
```

### 2.3 Unit Types

```typescript
enum UnitType {
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
```

### 2.4 Player Colors

```typescript
enum PlayerColor {
  Red = 'red',
  Blue = 'blue',
  Green = 'green',
  Yellow = 'yellow',
}
```

### 2.5 Game Phases

```typescript
enum GamePhase {
  Landing = 'landing',           // Turn 1
  Deployment = 'deployment',     // Turn 2
  Playing = 'playing',           // Turns 3-25
  LiftOffDecision = 'liftoff',   // Turn 21 decision
  Finished = 'finished',         // Game over
}
```

---

## 3. Unit Definitions

### 3.1 Base Unit

```typescript
interface Unit {
  id: UnitId;
  type: UnitType;
  owner: PlayerId;
  position: HexCoord;

  // Combat state
  shotsRemaining: number;  // Reset each turn (max 2 for combat units)

  // Movement state
  isStuck: boolean;        // Caught by tide
  isNeutralized: boolean;  // Under fire, cannot escape

  // Transporter state (for Barge, Crab, Converter)
  cargo?: UnitId[];

  // Astronef-specific
  turrets?: TurretState[];
  hasLiftedOff?: boolean;
}

interface TurretState {
  podeIndex: number;  // 0, 1, 2
  isDestroyed: boolean;
}
```

### 3.2 Unit Properties

```typescript
const UNIT_PROPERTIES: Record<UnitType, UnitProperties> = {
  [UnitType.Tank]: {
    domain: 'land',
    combatRange: 2,
    mountainRangeBonus: 1,  // 3 range on mountains
    canEnterMountain: true,
    cargoSlots: 0,
    size: 1,
  },
  [UnitType.SuperTank]: {
    domain: 'land',
    combatRange: 3,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: 0,
    size: 1,
  },
  [UnitType.MotorBoat]: {
    domain: 'sea',
    combatRange: 2,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: 0,
    size: 0,  // Not transportable
  },
  [UnitType.Barge]: {
    domain: 'sea',
    combatRange: 0,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: 4,
    canCarryLarge: true,  // Can carry Converter, Crab
    size: 0,
  },
  [UnitType.Crab]: {
    domain: 'land',
    combatRange: 0,
    mountainRangeBonus: 0,
    canEnterMountain: true,
    cargoSlots: 2,
    canCarryLarge: false,
    size: 2,
  },
  [UnitType.Converter]: {
    domain: 'land',
    combatRange: 0,
    mountainRangeBonus: 0,
    canEnterMountain: true,
    cargoSlots: 1,  // For mineral being converted
    size: 2,
    canBuild: true,
    canPredictTide: true,
  },
  [UnitType.Bridge]: {
    domain: 'none',  // Inert
    combatRange: 0,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: 0,
    size: 1,
    isNeutral: true,
  },
  [UnitType.Tower]: {
    domain: 'fixed',
    combatRange: 2,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: 0,
    size: 0,
  },
  [UnitType.Astronef]: {
    domain: 'fixed',
    combatRange: 0,
    mountainRangeBonus: 0,
    canEnterMountain: false,
    cargoSlots: Infinity,
    size: 4,  // 4 hexes
  },
};

interface UnitProperties {
  domain: 'land' | 'sea' | 'fixed' | 'none';
  combatRange: number;
  mountainRangeBonus: number;
  canEnterMountain: boolean;
  cargoSlots: number;
  canCarryLarge?: boolean;
  size: number;  // Cargo slot requirement
  canBuild?: boolean;
  canPredictTide?: boolean;
  isNeutral?: boolean;
}
```

---

## 4. Game State

### 4.1 Full State

```typescript
interface GameState {
  // Identity
  gameId: string;

  // Turn management
  turn: number;                    // 1-25
  phase: GamePhase;
  currentPlayer: PlayerId;
  turnOrder: PlayerId[];

  // Timing
  turnStartTime: number;           // Timestamp
  turnTimeLimit: number;           // 180000 (3 min in ms)

  // Action points
  actionPoints: number;            // Current player's remaining AP
  savedActionPoints: Record<PlayerId, number>;  // 0-10 per player

  // Tide
  currentTide: TideLevel;
  tideDeck: TideLevel[];           // Remaining cards
  tideDiscard: TideLevel[];        // Used cards

  // Board
  terrain: HexTerrain[];           // Static terrain data
  minerals: Mineral[];             // Mineral positions
  units: Unit[];                   // All units
  bridges: BridgePlacement[];      // Active bridges

  // Players
  players: Player[];

  // Turn 21 decisions
  liftOffDecisions: Record<PlayerId, boolean | null>;

  // Scores (computed from state)
  scores?: Record<PlayerId, number>;
}
```

### 4.2 Board Definition

```typescript
interface HexTerrain {
  coord: HexCoord;
  type: TerrainType;
  landingZone?: number;  // 1-8 for landing zone boundaries
}

interface Mineral {
  id: MineralId;
  position: HexCoord;
}

interface BridgePlacement {
  id: UnitId;
  position: HexCoord;
  placedBy: PlayerId;  // For tracking, but bridges are neutral
}
```

### 4.3 Player State

```typescript
interface Player {
  id: PlayerId;
  name: string;
  color: PlayerColor;

  // Connection
  isConnected: boolean;
  isReady: boolean;

  // Game state
  astronefPosition: HexCoord[];  // 4 hexes
  hasLiftedOff: boolean;
  liftOffTurn?: number;          // 21 or 25

  // Captured astronefs
  capturedAstronefs: PlayerId[];
}
```

---

## 5. Actions

### 5.1 Action Types

```typescript
type GameAction =
  | MoveAction
  | LoadAction
  | UnloadAction
  | FireAction
  | CaptureAction
  | BuildAction
  | EnterAstronefAction
  | ExitAstronefAction
  | LiftOffAction
  | EndTurnAction;

interface BaseAction {
  type: string;
  playerId: PlayerId;
  timestamp: number;
}

interface MoveAction extends BaseAction {
  type: 'MOVE';
  unitId: UnitId;
  path: HexCoord[];  // Full path for animation/validation
  apCost: number;
}

interface LoadAction extends BaseAction {
  type: 'LOAD';
  transporterId: UnitId;
  cargoId: UnitId | MineralId;
  apCost: number;
}

interface UnloadAction extends BaseAction {
  type: 'UNLOAD';
  transporterId: UnitId;
  cargoId: UnitId | MineralId;
  destination: HexCoord;
  apCost: number;
}

interface FireAction extends BaseAction {
  type: 'FIRE';
  attackerIds: [UnitId, UnitId];  // Always 2 units
  targetHex: HexCoord;
  apCost: number;  // Always 2
}

interface CaptureAction extends BaseAction {
  type: 'CAPTURE';
  attackerIds: [UnitId, UnitId];
  targetId: UnitId;
  apCost: number;  // Always 1
}

interface BuildAction extends BaseAction {
  type: 'BUILD';
  converterId: UnitId;
  unitType: UnitType;
  apCost: number;  // Always 1 to unload
}

interface EnterAstronefAction extends BaseAction {
  type: 'ENTER_ASTRONEF';
  unitId: UnitId;
  podeIndex: number;
  apCost: number;  // Always 1
}

interface ExitAstronefAction extends BaseAction {
  type: 'EXIT_ASTRONEF';
  unitId: UnitId;
  podeIndex: number;
  destination: HexCoord;
  apCost: number;  // Always 1
}

interface LiftOffAction extends BaseAction {
  type: 'LIFT_OFF';
  decision: 'now' | 'stay';  // Turn 21 only
}

interface EndTurnAction extends BaseAction {
  type: 'END_TURN';
  savedAP: number;
}
```

---

## 6. Computed State

### 6.1 Effective Terrain

```typescript
function getEffectiveTerrainType(
  terrain: TerrainType,
  tide: TideLevel
): 'land' | 'sea' {
  if (terrain === TerrainType.Sea) return 'sea';
  if (terrain === TerrainType.Land) return 'land';
  if (terrain === TerrainType.Mountain) return 'land';

  if (terrain === TerrainType.Marsh) {
    return tide === TideLevel.High ? 'sea' : 'land';
  }

  if (terrain === TerrainType.Reef) {
    return tide === TideLevel.Low ? 'land' : 'sea';
  }

  return 'land';
}
```

### 6.2 Under Fire Calculation

```typescript
function getHexesUnderFire(
  state: GameState,
  byPlayer: PlayerId
): Set<string> {
  const underFire = new Set<string>();
  const combatUnits = state.units.filter(
    u => u.owner === byPlayer &&
         UNIT_PROPERTIES[u.type].combatRange > 0 &&
         !u.isStuck &&
         !u.isNeutralized
  );

  // For each hex, count how many combat units can reach it
  // If >= 2, mark as under fire
  const coverage = new Map<string, number>();

  for (const unit of combatUnits) {
    const range = getCombatRange(unit, state);
    const reachableHexes = getHexesInRange(unit.position, range);

    for (const hex of reachableHexes) {
      const key = `${hex.q},${hex.r}`;
      coverage.set(key, (coverage.get(key) || 0) + 1);
    }
  }

  for (const [key, count] of coverage) {
    if (count >= 2) {
      underFire.add(key);
    }
  }

  return underFire;
}
```

### 6.3 Score Calculation

```typescript
function calculateScore(state: GameState, playerId: PlayerId): number {
  const player = state.players.find(p => p.id === playerId);
  if (!player || !player.hasLiftedOff) return 0;

  let score = 0;

  // Find astronef
  const astronef = state.units.find(
    u => u.type === UnitType.Astronef && u.owner === playerId
  );

  if (!astronef) return 0;

  // Minerals in astronef: 2 points each
  const mineralsInAstronef = state.minerals.filter(
    m => isInsideAstronef(m.position, astronef)
  );
  score += mineralsInAstronef.length * 2;

  // Equipment in astronef: 1 point each
  const unitsInAstronef = state.units.filter(
    u => u.owner === playerId &&
         u.type !== UnitType.Astronef &&
         u.type !== UnitType.Tower &&
         isInsideAstronef(u.position, astronef)
  );
  score += unitsInAstronef.length;

  // Intact turrets: 1 point each
  const intactTurrets = astronef.turrets?.filter(t => !t.isDestroyed).length || 0;
  score += intactTurrets;

  return score;
}
```

---

## 7. Initial State Factory

```typescript
function createInitialGameState(
  gameId: string,
  players: Player[]
): GameState {
  // Shuffle tide cards (15 total, use 9, discard 6)
  const allTides = [
    ...Array(5).fill(TideLevel.Low),
    ...Array(5).fill(TideLevel.Normal),
    ...Array(5).fill(TideLevel.High),
  ];
  const shuffled = shuffle(allTides);
  const tideDeck = shuffled.slice(0, 9);
  const tideDiscard = shuffled.slice(9);

  // Initialize player units
  const units: Unit[] = [];
  for (const player of players) {
    units.push(...createStartingForce(player.id));
  }

  // Place minerals
  const minerals = generateMineralPlacements(BOARD_TERRAIN);

  return {
    gameId,
    turn: 1,
    phase: GamePhase.Landing,
    currentPlayer: players[0].id,
    turnOrder: players.map(p => p.id),
    turnStartTime: Date.now(),
    turnTimeLimit: 180000,
    actionPoints: 0,  // No AP during landing
    savedActionPoints: Object.fromEntries(players.map(p => [p.id, 0])),
    currentTide: TideLevel.Normal,
    tideDeck,
    tideDiscard,
    terrain: BOARD_TERRAIN,
    minerals,
    units,
    bridges: [],
    players,
    liftOffDecisions: Object.fromEntries(players.map(p => [p.id, null])),
  };
}

function createStartingForce(playerId: PlayerId): Unit[] {
  return [
    createUnit(UnitType.Barge, playerId),
    createUnit(UnitType.Crab, playerId),
    createUnit(UnitType.Converter, playerId),
    createUnit(UnitType.MotorBoat, playerId),
    createUnit(UnitType.MotorBoat, playerId),
    createUnit(UnitType.Tank, playerId),
    createUnit(UnitType.Tank, playerId),
    createUnit(UnitType.Tank, playerId),
    createUnit(UnitType.Tank, playerId),
    createUnit(UnitType.SuperTank, playerId),
    createUnit(UnitType.Bridge, playerId),
  ];
}
```

---

## 8. Serialization

### 8.1 Network Format

For WebSocket transmission, use a compact format:

```typescript
interface CompactGameState {
  t: number;      // turn
  p: string;      // current player
  ap: number;     // action points
  tide: 0|1|2;    // low/normal/high
  u: CompactUnit[];
  m: [number, number][];  // mineral positions
}

interface CompactUnit {
  i: string;      // id
  t: number;      // type (enum index)
  o: string;      // owner
  p: [number, number];  // position
  c?: string[];   // cargo
  s?: number;     // shots remaining
}
```

### 8.2 Persistence Format

For Redis/database storage, use full JSON with version:

```typescript
interface PersistedState {
  version: number;
  savedAt: string;
  state: GameState;
}
```

---

## 9. Board Definition

### 9.1 Hex Map Generation

The board is 851 hexes. Define terrain statically or generate from seed:

```typescript
// Static board definition (abbreviated)
const BOARD_TERRAIN: HexTerrain[] = [
  { coord: { q: 0, r: 0 }, type: TerrainType.Sea },
  { coord: { q: 1, r: 0 }, type: TerrainType.Land },
  // ... 849 more hexes
];

// Or generate procedurally
function generateBoard(seed: number): HexTerrain[] {
  const rng = seedRandom(seed);
  const terrain: HexTerrain[] = [];

  // Generate based on original board layout
  // Islands, seas, marshes, reefs, mountains in specific patterns

  return terrain;
}
```

### 9.2 Landing Zones

```typescript
const LANDING_ZONES = [
  { zone: 1, hexes: [/* hex coords */] },
  { zone: 2, hexes: [/* hex coords */] },
  // ... 8 zones total
];

function canLandIn(astronef: HexCoord[], zone: number): boolean {
  const zoneHexes = LANDING_ZONES.find(z => z.zone === zone)?.hexes || [];
  return astronef.every(hex =>
    zoneHexes.some(zh => zh.q === hex.q && zh.r === hex.r)
  );
}
```
