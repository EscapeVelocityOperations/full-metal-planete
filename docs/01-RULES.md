# Full Metal Planète - Game Rules

> Source: Game Cabinet translation by Mark Green, scanned and edited by Mike Siggins (1996)

## 1. Overview

Full Metal Planète is a strategic mining game for 2-4 players. Players land their Astronef (mother ship) on Full Metal Planet for a mining expedition lasting 21-25 turns. Victory is achieved by collecting minerals and evacuating them into orbit before the game ends.

### Key Parameters

| Parameter | Value |
|-----------|-------|
| Players | 2-4 |
| Turns | 21-25 |
| Time per turn | 3 minutes |
| Base action points | 15 |
| Max saved AP | 10 |
| Board hexes | 851 |

---

## 2. Game Components

### 2.1 Per Player Starting Force

| Unit | Quantity | Type |
|------|----------|------|
| Astronef | 1 | Mother ship (4 hexes) |
| Tower | 3 | Combat (on Astronef) |
| Barge | 1 | Sea transporter |
| Crab | 1 | Land transporter |
| Converter | 1 | Builder unit |
| Motor Boat | 2 | Sea combat |
| Tank | 4 | Land combat |
| Super Tank | 1 | Heavy land combat |
| Bridge | 1 | Terrain modifier |

### 2.2 Buildable Units (via Converter)

Additional units can be built from minerals:
- Tanks
- Super Tanks (limit: cannot build 2 per turn)
- Motor Boats
- Crabs (limit: cannot build 2 per turn)
- Bridges (limit: cannot build 2 per turn)
- Barges

### 2.3 Tide Cards

- **Total**: 15 cards
- **Distribution**: 5 Low, 5 Normal, 5 High
- **Usage**: 9 cards drawn at game start, 6 discarded. Reshuffle when exhausted.

---

## 3. Terrain System

### 3.1 Terrain Types

| Terrain | Color | Base State |
|---------|-------|------------|
| Sea | Blue | Water |
| Land | Ochre | Ground |
| Marsh | Ochre with blue spots | Variable |
| Reef | Blue with ochre spots | Variable |
| Mountain | Grey | Ground (elevated) |

### 3.2 Tide Effects on Terrain

| Tide | Marsh | Reef |
|------|-------|------|
| **Low** | Land | Land |
| **Normal** | Land | Sea |
| **High** | Sea | Sea |

### 3.3 Movement Effects by Tide

| Tide | Craft Type | Marsh | Reef |
|------|------------|-------|------|
| **Low** | Sea craft | Grounded | Grounded |
| **Low** | Land craft | May move | May move |
| **Normal** | Sea craft | Grounded | May move |
| **Normal** | Land craft | May move | Stuck |
| **High** | Sea craft | May move | May move |
| **High** | Land craft | Stuck | Stuck |

**Grounded**: Sea craft cannot move until tide rises
**Stuck**: Land craft cannot move until tide falls

### 3.4 Voluntary Neutralization

A unit may voluntarily enter impassable terrain and become stuck/grounded on the first impassable hex.

---

## 4. Action Point System

### 4.1 Base Allocation

- **Standard**: 15 action points per turn
- **Turn 3**: 5 action points only
- **Turn 4**: 10 action points only
- **Turn 5+**: 15 action points

### 4.2 Action Point Costs

| Action | Cost |
|--------|------|
| Movement | 1 AP per hex |
| Loading item | 1 AP per item |
| Unloading item | 1 AP per item |
| Building (Converter) | 1 AP per item |
| Enter/Exit Astronef | 1 AP per unit |
| Combat (destroy) | 2 AP (2 shots) |
| Capture | 1 AP |
| Rebuild Tower | 2 AP |
| Take Off | 1-4 AP (based on turrets destroyed) |

### 4.3 Saving Action Points

- Unused AP can be saved (max 10 saved)
- If 10 AP spent → 5 AP saved
- If 5 AP spent → 10 AP saved (over 2 turns)
- Saved AP carries over indefinitely

### 4.4 Captured Astronef Bonus

Each captured enemy Astronef adds **+5 base AP** per turn.

**Example**: Player with 2 captured Astronefs + max saved = 15 + 5 + 5 + 10 = **35 AP**

### 4.5 Action Finality

Each action or move is **definitive** and cannot be revoked. Invalid actions revert to the last legal state.

---

## 5. Unit Specifications

### 5.1 Combat Units

| Unit | Domain | Range | Mountain Bonus | Notes |
|------|--------|-------|----------------|-------|
| Tank | Land | 2 hex | 3 hex range | Standard combat |
| Super Tank | Land | 3 hex | N/A | Cannot enter mountains |
| Motor Boat | Sea | 2 hex | N/A | - |
| Tower | Fixed | 2 hex | N/A | On Astronef only |

### 5.2 Transporters

| Unit | Domain | Capacity | Can Carry |
|------|--------|----------|-----------|
| Barge | Sea | 4 slots | All units including Converter, Crab |
| Crab | Land | 2 slots | Minerals, Tanks, Super Tanks, Bridges |

**Slot sizes**:
- 1 slot: Mineral, Tank, Super Tank, Bridge
- 2 slots: Converter, Crab

### 5.3 Special Units

| Unit | Function |
|------|----------|
| Converter | Builds units from minerals, predicts tide |
| Bridge | Creates land hex on water, neutral ownership |

### 5.4 Astronef

- **Size**: 4 hexes (cross shape: 1 body + 3 podes)
- **Turrets**: 3 towers, one per pode
- **Capacity**: Unlimited
- **Terrain**: Plain and marsh only (immune to tides)
- **Entry/Exit**: Via podes only

---

## 6. Combat System

### 6.1 Destruction Rule

A unit is destroyed when under **simultaneous fire from 2 combat units** of the same enemy player.

- Cost: 1 AP per shot (2 AP total to destroy)
- Each combat unit may fire **max 2 times per turn**
- Shots can be separated by other actions

### 6.2 Range and Line of Fire

- Combat units can shoot **over any obstacle** (minerals, vehicles, mountains)
- Range is measured in hexes from attacker to target

### 6.3 "Under Fire" Zone

A hex is "under fire" when within range of **2+ combat units** of the same player.

**Restrictions for hexes under fire**:
- Cannot move into (except to eliminate threat)
- Cannot unload cargo into
- Cannot load/unload transporters in

### 6.4 Capture Rule

Two combat units can **capture** an enemy unit by moving adjacent to it.

**Requirements**:
- Both attackers must be adjacent to target
- All involved units must be free from enemy fire
- Cost: 1 AP

**Effects**:
- Unit immediately changes ownership
- New owner can use it that turn
- Transporter contents are captured with it

### 6.5 Retreat and Neutralization

**Retreat**: At start of turn, units under fire may retreat 1 hex to escape.

**Neutralization**: Units unable to retreat are neutralized (cannot act) until rescued by friendly combat units.

**Exception**: Towers cannot be neutralized - they may always fire back.

---

## 7. Transporter Rules

### 7.1 Loading/Unloading

- Pick up from adjacent hex (1 AP per item)
- Unload to adjacent hex (1 AP per item)
- Inside Astronef: free (costs only time)
- Picking up Crab: 1 AP even if Crab has cargo

### 7.2 Restrictions

- Cannot load/unload under enemy fire
- Cannot unload onto sea hexes
- Can unload onto stuck hexes (item becomes stuck)
- Cannot pick up tide-stuck items (except Bridges)

### 7.3 Cargo Rearrangement

Cargo can be rearranged between Crab and Barge (while Barge carries Crab) - costs time but no AP.

### 7.4 Delivery Requirements

Destination hex must be:
- Vacant, OR
- Contain only a Bridge, OR
- Contain a Transporter with spare capacity

---

## 8. Converter Rules

### 8.1 Building Process

1. Pick up mineral (1 AP)
2. Convert to equipment (automatic)
3. Unload equipment (1 AP)

Total: 2 AP minimum per unit built

### 8.2 Building Limits

- Max 2 units per turn
- Cannot build 2 of: Crabs, Bridges (per turn)

### 8.3 Delayed Building

Converter can hold mineral and create equipment on later turn.

### 8.4 Tide Prediction

Operational Converters can view the **next tide card**.

**Operational** means:
- Not in Astronef
- Not on Barge
- Not under enemy fire
- Not stuck by tides

**Multiple Converters**: Can see 2 cards ahead (one per Converter).

---

## 9. Bridge Rules

### 9.1 Properties

- **Neutral**: Any player can use
- **Inert**: Cannot move on its own
- **Effect**: Makes hex count as land

### 9.2 Placement

- Laid or picked up by transporter
- Must connect to land or another bridge
- Cannot be laid/picked up under enemy fire
- Blocks Barges and Motor Boats

### 9.3 Destruction

Bridge is destroyed if:
- Connecting bridge hex is destroyed
- Connecting land hex is submerged by tide

**All units on destroyed bridge are also destroyed.**

---

## 10. Astronef Rules

### 10.1 Structure

```
    [Pode+Tower]
         |
[Pode+Tower]--[Body]--[Pode+Tower]
```

### 10.2 Entry/Exit

- Cost: 1 AP per unit (even Barge)
- Enter via podes only
- Cannot exit via pode with destroyed tower
- Can enter via pode under fire (if outside hex is clear)
- Cannot exit to hex under fire

### 10.3 Cargo Rules

- Minerals in Astronef cannot be converted or removed
- Loading/unloading inside is free (time only)
- All contents visible to all players

### 10.4 Tower Destruction

When all 3 towers destroyed:
- Astronef becomes vulnerable to capture
- Still belongs to original owner until captured

### 10.5 Capture

**To capture an Astronef**:
1. Destroy all 3 towers
2. Enter with hostile combat unit

**Effects**:
- Captor gains +5 AP per turn
- All captured player's units retain original color
- Captor controls mixed-color force

### 10.6 Tower Rebuilding

- Only player who captured/recaptured may rebuild
- Cost: 2 AP per tower
- Cannot rebuild under enemy fire

---

## 11. Turn Structure

### 11.1 Turn 1: Landing

- Each player (3 min) chooses landing zone
- Place Astronef on Full Metal Planet
- Astronef occupies 4 hexes (plain or marsh only)
- Cannot land adjacent to another player's zone
- Must have viable exit paths

### 11.2 Turn 2: Deployment

- All players together (3 min)
- Deploy forces from Astronef to arrival zone
- Boats deploy to adjacent sea hexes
- Transporters may deploy loaded
- Tide is **Normal** (fixed)

### 11.3 Turn 3: First Play Turn

- First player randomly chosen
- Clockwise turn order
- 3 min per player
- **5 AP only**
- First tide card revealed
- Converters may view next tide

### 11.4 Turn 4

- Same as Turn 3
- **10 AP only**

### 11.5 Turns 5-20

- Standard turns
- **15 AP**
- 3 min per player

### 11.6 Turn 21: Lift-off Decision

Each player **secretly** decides:
- **Lift off now**: Leave immediately with Astronef contents
- **Stay until Turn 25**: Continue playing

Players with multiple Astronefs may lift off some and keep others (losing the +5 AP bonus for each that leaves).

### 11.7 Turns 22-24

Standard turns for remaining players.

### 11.8 Turn 25: Final Lift-off

All remaining Astronefs must lift off.

**Take-off cost**: 1 AP + 1 AP per destroyed tower

If player cannot pay take-off cost, Astronef is stranded forever.

---

## 12. Minerals

### 12.1 Placement

- One mineral every 3 hexes
- On plain, marsh, and reef hexes only
- Not on sea hexes

### 12.2 Collection

| Tide | Plain | Marsh | Reef |
|------|-------|-------|------|
| Low | Yes | Yes | Yes |
| Normal | Yes | Yes | No |
| High | Yes | No | No |

### 12.3 Transport

Minerals occupy 1 slot in transporters or Converter.

---

## 13. Scoring

### 13.1 Point Values

| Item | Points |
|------|--------|
| Mineral (evacuated) | 2 |
| Equipment piece (evacuated) | 1 |
| Intact turret | 1 |

### 13.2 Items Left Behind

Minerals and equipment left on planet = **0 points**

### 13.3 Victory

Player with highest total score wins.

---

## 14. Time Rules

### 14.1 Turn Timer

- **Duration**: 3 minutes per player
- Another player acts as timekeeper
- Announcements at suitable intervals

### 14.2 Timer Expiration

When time runs out:
- Current action stops immediately
- Unit stops on current hex
- Turn ends

### 14.3 Strategic Importance

Time pressure is a core mechanic. It forces quick thinking and prevents analysis paralysis.

---

## 15. Diplomatic Rules (Optional)

### 15.1 Negotiations

Players may negotiate:
- Temporary alliances
- Territory agreements
- Trade of captured units

### 15.2 Binding

Agreements are **not enforced** by game rules. Players may break agreements at any time.

---

## Appendix A: Quick Reference

### Action Point Costs

```
Movement:        1 AP / hex
Load/Unload:     1 AP / item
Build:           1 AP / item
Enter/Exit:      1 AP / unit
Destroy:         2 AP (2 shots)
Capture:         1 AP
Rebuild Tower:   2 AP
Take Off:        1-4 AP
```

### Combat Ranges

```
Tank:            2 hex (3 on mountain)
Super Tank:      3 hex (no mountains)
Motor Boat:      2 hex
Tower:           2 hex
```

### Tide Summary

```
LOW:    Marsh=Land, Reef=Land
NORMAL: Marsh=Land, Reef=Sea
HIGH:   Marsh=Sea,  Reef=Sea
```
