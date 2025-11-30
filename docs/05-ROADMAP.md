# Full Metal Planète - Roadmap

## Version Overview

| Version | Focus | Status |
|---------|-------|--------|
| v1.0 | MVP - Playable multiplayer game | **Current** |
| v1.1 | Polish - Animations, replay | Planned |
| v2.0 | Accounts - Users, matchmaking | Future |
| v3.0 | Advanced - AI, tournaments | Future |

---

## v1.0 - Minimum Viable Product

### Goal
Fully playable web implementation of Full Metal Planète with all rules, multiplayer support via shared links.

### Features

#### Core Game Engine
- [ ] Complete rules implementation
- [ ] Action point system
- [ ] Tide mechanics
- [ ] Combat system (destroy + capture)
- [ ] Transporter rules
- [ ] Converter building
- [ ] Bridge placement
- [ ] Astronef mechanics
- [ ] Turn structure (1-25)
- [ ] Scoring

#### Rendering
- [ ] WebGPU hex grid renderer
- [ ] WebGL2 fallback
- [ ] Terrain visualization
- [ ] Unit sprites
- [ ] Movement highlighting
- [ ] Fire range indicators
- [ ] "Under fire" zone display

#### UI
- [ ] HUD (AP, turn, tide, timer)
- [ ] Unit selection panel
- [ ] Action buttons
- [ ] Turn 21 decision modal
- [ ] Game lobby
- [ ] Link sharing

#### Backend
- [ ] Game room creation
- [ ] WebSocket sync
- [ ] Player join/leave
- [ ] Action broadcast
- [ ] Basic persistence (reconnection)

### Technical Debt Accepted
- No server-side rule validation
- No replay system
- Minimal animations
- No mobile optimization
- No accessibility features

---

## v1.1 - Polish Release

### Goal
Improve player experience with visual polish and quality-of-life features.

### Features

#### Animations
- [ ] Unit movement animations
- [ ] Combat effects (explosion, capture)
- [ ] Tide change transitions
- [ ] Turn change effects
- [ ] Lift-off sequence

#### Replay System
- [ ] Record all actions
- [ ] Playback controls
- [ ] Export replay file
- [ ] Share replay link

#### Server Improvements
- [ ] Server-side rule validation
- [ ] Anti-cheat detection
- [ ] Improved reconnection
- [ ] Spectator mode

#### UX Improvements
- [ ] Undo/redo (where rules allow)
- [ ] Action confirmation
- [ ] Better error messages
- [ ] Tutorial/hints

#### Audio
- [ ] Sound effects
- [ ] Background music
- [ ] Volume controls
- [ ] Mute option

---

## v2.0 - Account System

### Goal
Persistent user accounts with matchmaking and rankings.

### Features

#### User Accounts
- [ ] Email/password registration
- [ ] OAuth (Google, Discord)
- [ ] User profiles
- [ ] Avatar selection
- [ ] Display names

#### Matchmaking
- [ ] Quick match queue
- [ ] Skill-based matching
- [ ] Friend invites
- [ ] Private rooms with passwords

#### Rankings
- [ ] ELO rating system
- [ ] Leaderboards (global, regional)
- [ ] Seasonal rankings
- [ ] Achievement badges

#### Social
- [ ] Friend list
- [ ] Game history
- [ ] Stats tracking
- [ ] Chat system

#### Persistence
- [ ] PostgreSQL database
- [ ] Game history storage
- [ ] User preferences
- [ ] Cloud save

---

## v3.0 - Advanced Features

### Goal
AI opponents, tournaments, and mobile support.

### Features

#### AI Opponents
- [ ] Easy difficulty (random valid moves)
- [ ] Medium difficulty (heuristic-based)
- [ ] Hard difficulty (minimax/MCTS)
- [ ] AI personalities (aggressive, defensive, economic)

#### Tournament Mode
- [ ] Tournament creation
- [ ] Bracket generation
- [ ] Swiss-system support
- [ ] Prize pool tracking
- [ ] Tournament history

#### Mobile
- [ ] Responsive design
- [ ] Touch controls
- [ ] Mobile-optimized UI
- [ ] PWA support
- [ ] Offline vs AI

#### Spectator Features
- [ ] Live game viewing
- [ ] Commentary tools
- [ ] Streaming integration
- [ ] VOD library

#### Modding Support
- [ ] Custom board layouts
- [ ] Custom rules variants
- [ ] Map editor
- [ ] Rule configuration

---

## Technical Milestones

### Infrastructure

| Phase | Infrastructure |
|-------|---------------|
| v1.0 | Single server, Redis, in-memory |
| v1.1 | Load balancing, monitoring |
| v2.0 | Database, auth service, CDN |
| v3.0 | Multi-region, auto-scaling |

### Performance Targets

| Metric | v1.0 | v2.0 | v3.0 |
|--------|------|------|------|
| Concurrent games | 100 | 10,000 | 100,000 |
| Latency (p95) | 200ms | 100ms | 50ms |
| Initial load | 5s | 3s | 2s |

---

## Development Phases

### Phase 1: Foundation (v1.0)
1. Project setup (TypeScript, WebGPU)
2. Hex grid renderer
3. Game state machine
4. Rules engine
5. Basic UI
6. WebSocket sync
7. Integration testing
8. Alpha release

### Phase 2: Enhancement (v1.1)
1. Animation system
2. Replay recording
3. Server validation
4. Audio integration
5. UX polish
6. Beta release

### Phase 3: Platform (v2.0)
1. Database schema
2. Auth system
3. User API
4. Matchmaking service
5. Ranking system
6. Public release

### Phase 4: Growth (v3.0)
1. AI development
2. Mobile optimization
3. Tournament system
4. Modding framework
5. Scaling infrastructure

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebGPU adoption | Medium | WebGL2 fallback ready |
| Performance issues | High | Profiling from start |
| Sync bugs | High | Extensive testing, replay debugging |
| Scaling challenges | Medium | Design for horizontal scale |

### Product Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Low player count | High | Start with friend groups, Discord |
| Rule interpretation disputes | Medium | Clear documentation, community input |
| Cheating | Medium | Server validation in v1.1 |

---

## Success Metrics

### v1.0
- [ ] Complete game with all rules
- [ ] 10+ completed test games
- [ ] <5 critical bugs
- [ ] 60 FPS rendering

### v1.1
- [ ] 100+ games played
- [ ] Positive feedback on polish
- [ ] <1% disconnect issues

### v2.0
- [ ] 1,000+ registered users
- [ ] 50+ daily active users
- [ ] Stable matchmaking (<2min queue)

### v3.0
- [ ] 10,000+ registered users
- [ ] Active competitive scene
- [ ] Mobile usage >20%
