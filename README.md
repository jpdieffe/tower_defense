# Bulwark — peer-to-peer co-op tower defense

A two-player co-op tower defense game that runs in **any modern phone browser** — Android
Chrome, iPhone Safari, desktop, whatever. No app store, no install, no accounts, and no
Mac needed to build it.

Multiplayer is **peer to peer over WebRTC**. A free broker is used only to introduce the
two phones to each other; after that every packet goes directly between them.

---

## Quick start

```bash
npm install
npm run assets      # one-time: downloads the CC0 art & audio into public/assets
npm run dev         # then open the printed Network URL on your phone
```

`npm run dev` prints a `Network:` address (e.g. `http://192.168.1.70:5173/`). Open that on
both phones while they are on the same Wi-Fi and you can play immediately.

To play over the internet, deploy the static build anywhere (Netlify, Vercel, GitHub Pages,
Cloudflare Pages — it is just files):

```bash
npm run build       # outputs dist/
npm run preview     # sanity-check the production build locally
```

> **HTTPS is required** for WebRTC on real devices. Every static host above gives you
> HTTPS automatically. `localhost` is also treated as secure during development.

### How two people connect

1. Player 1 taps **Host a co-op game** and reads out the four-character room code
   (or uses **Share link**, which sends a URL that joins automatically).
2. Player 2 taps **Join with a code**, types it in, and they land in a shared lobby.
3. Each picks a hero; the host picks the map and difficulty; both tap **Ready up**.

---

## Requirement #1: both screens always show the same fight

This was the hard requirement, so it drove the entire architecture. Bulwark does **not**
stream entity positions between phones — that is exactly the approach where lag makes one
player see a kill the other doesn't. Instead both phones run the *same simulation* and only
exchange button presses.

**Deterministic lockstep**, specifically:

| Concern | How it is handled |
| --- | --- |
| Floating-point drift between devices | The simulation contains **no floats at all**. All positions, speeds and ranges are Q16.16 fixed-point integers ([src/core/fixed.ts](src/core/fixed.ts)). `fxMul` splits operands into 16-bit halves so every partial product stays exact inside JS's 2^53 integer range. |
| `Math.sin` / `Math.pow` differing per engine | Never used in the sim. Facing is stored as a unit vector; angles only exist in the renderer. `Math.sqrt` is IEEE-correctly-rounded (spec-required) and is further pinned by an integer correction loop. |
| Randomness | A seeded xorshift32 generator whose state lives *inside* the game state ([src/core/rng.ts](src/core/rng.ts)). `Math.random()` is banned from the sim and only used for cosmetic particles. |
| Iteration order | Everything is a plain array walked in order. Target ties break on entity id, never on object identity or map ordering. |
| Network latency | Commands are stamped for tick `now + inputDelay` (negotiated from the lobby ping). A tick is **never simulated until every player's input for that exact tick has arrived**. |
| A late packet | The game briefly waits and shows "Waiting for your partner…". Waiting is always better than two different worlds. |
| Silent drift (a bug we missed) | Every 15 ticks the peers swap a 32-bit FNV-1a fingerprint of the entire state. On a mismatch the host ships an authoritative snapshot and the guest resynchronises. |

Because a peer can never run ahead of the inputs it has, **desync is structurally
impossible** rather than merely unlikely: a bullet that hits on your screen has already hit
on theirs.

### Proving it

```bash
npm run check:sim
```

This runs the real simulation headlessly and checks:

```
PASS  fixed-point multiply/divide/sqrt are exact (220k random cases)
PASS  map 0: 160 hash samples identical over 4000 ticks
PASS  map 1: 160 hash samples identical over 4000 ticks
PASS  map 2: 160 hash samples identical over 4000 ticks
PASS  JSON snapshot round-trip stays in sync for 900 further ticks
PASS  different seeds produce different worlds
PASS  soak: 60k ticks reached wave 13 ... gameOver=true
PASS  soak run is reproducible end to end
```

It was also verified live between two browsers on a real WebRTC data channel: after a full
wave both peers independently reported wave 1, 9 kills, 20 lives and gold `[260, 463]`,
with 108 tick-fingerprints confirmed identical and zero desyncs.

### Phones lock and tabs get backgrounded

Mobile browsers kill `requestAnimationFrame` the instant you switch apps, which in naive
lockstep hard-freezes your partner. When Bulwark is hidden it keeps the world ticking from
a timer and publishes a bounded window of empty input ahead, so a glance at a notification
is invisible to the other player. Longer absences deliberately pause both sides rather than
running a game one player cannot influence.

---

## Requirement #2: towers, heroes, items, upgrades

### 8 towers, each with a tier-4 fork

Every tower upgrades through levels 1→3, then **forks into one of two specialisations**
which continue to level 5 — 8 towers but 16 distinct end-game builds.

| Tower | Role | Fork A | Fork B |
| --- | --- | --- | --- |
| Arrow Nest | fast single target, hits air | **Ballista** – piercing line shot | **Volley Nest** – 3 targets at once |
| Cannon | ground-only splash | **Mortar** – huge range & blast | **Flak Battery** – rapid, covers air |
| Frost Spire | slowing pulse aura | **Glacier** – freezes non-bosses | **Permafrost** – wider, +25% damage taken |
| Tesla Coil | chain lightning, shreds shields | **Overcharge** – 6 jumps, no falloff | **Ion Storm** – staggers, strips shields |
| Venom Sprayer | poison that ignores armour | **Plague Vat** – corpses burst into clouds | **Acid Sprayer** – melts armour |
| Sniper Nest | very long range, crits | **Executioner** – executes below 18% | **Marksman** – double rate & crit |
| Flame Turret | short-range swarm clear | **Inferno** – damage ramps while firing | **Napalm** – leaves burning ground |
| Beacon | support aura, never fires | **War Horn** – big damage/crit banner | **Mint** – generates gold |

Each tower also has four targeting modes (First / Last / Strongest / Closest).

### 4 heroes

Player-controlled units you move by tapping the map. They auto-attack, gain XP to level 10,
have a passive and an active ability, and respawn on a timer if they die.

- **Vanguard** — tank. Passive slows nearby enemies; **Shield Slam** stuns everything around him.
- **Ranger** — ranged crit damage; **Arrow Storm** rains on an area you aim at.
- **Pyromancer** — splash + burn; **Meteor** for huge burst plus burning ground.
- **Tinkerer** — +12% gold and speeds up nearby towers; **Deploy Sentry** drops a temporary turret.

### Relics and consumables

Between waves a shared **Quartermaster** shop offers seeded stock (both players see the same
offers, each can buy once). 12 stacking relics (`+damage`, `+range`, `+fire rate`, `+gold`,
cheaper upgrades, stronger slows, stronger damage-over-time, crit, splash, ability cooldown,
hero power, extra chain jumps) and 7 consumables (Meteor Scroll, Frost Nova, Gold Cache,
Repair Kit, Time Warp, Turret Kit, Overload Rune).

### Enemies and waves

Endless procedurally generated waves — grunts, runners, swarmlings, armoured brutes,
shield wardens, healing shamans, splitters, two kinds of flyer, summoning necromancers, and
three rotating bosses. Waves roll modifiers (Hasted, Armoured, Shielded, Swarm,
Regenerating) and every fifth wave is a boss. Three maps, three difficulties.

**Co-op rules:** separate gold and separate tower ownership (so nobody spends your money),
but a **shared pool of lives**. Both players must tap READY to call a wave early, which pays
a bonus — so there is a real reason to talk to each other.

---

## Requirement #3: graphics, sprites, sound and music

All bundled art and audio is **CC0 / public domain** by [Kenney](https://kenney.nl), fetched
by [scripts/fetch-assets.mjs](scripts/fetch-assets.mjs) (which includes a tiny inline ZIP
reader so it needs no extra tooling):

- **Sprites** — *Tower Defense (Top-Down)*: a 23×13 sheet of 64px tiles used for terrain,
  roads, tower platforms, turret heads, units, projectiles and effects. Enemy variety comes
  from multiply-blend tinting baked into cached offscreen canvases.
- **Sound effects** — *Interface Sounds* and *Impact Sounds*, played through a small Web
  Audio graph with per-category volume, random pitch variation, stereo panning and
  rate-limiting so a flame turret cannot machine-gun the mixer.
- **Stingers** — *Music Jingles* for wave start, wave cleared, boss, level up and defeat.

The looping soundtrack is **synthesised at runtime** ([src/audio/music.ts](src/audio/music.ts)):
a step sequencer over a minor progression whose layers and tempo scale with how badly the
fight is going. Build phases are sparse and calm; boss waves get bass, drums, pads and a
lead. It adds zero download weight and reacts to the game.

Credits are written to `public/assets/CREDITS.txt` during asset fetch.

---

## Project layout

```
src/
  core/      fixed.ts (Q16.16 maths), rng.ts (seeded PRNG)
  sim/       the deterministic simulation - types, state, commands, sim.ts
  content/   data tables: towers, enemies, heroes, items, waves, maps, art indices
  net/       protocol.ts, peer.ts (WebRTC), lockstep.ts (the sync engine)
  render/    atlas.ts (sprites + tinting), renderer.ts, fx.ts (particles)
  audio/     audio.ts (SFX), music.ts (adaptive soundtrack)
  ui/        dom.ts, menus.ts, game.ts (HUD, input gestures, game loop)
  tests/     determinism.ts - headless verification
scripts/     fetch-assets.mjs, check-sim.mjs
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server, exposed on your LAN so phones can reach it |
| `npm run build` | Type-check then produce `dist/` |
| `npm run preview` | Serve the production build |
| `npm run check:sim` | Headless determinism + balance soak test |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run assets` | Re-download the CC0 art and audio |

## Controls

- **Build** — tap a tower in the bar, drag onto a highlighted tile, release.
- **Upgrade / sell / retarget** — tap a tower you own.
- **Move your hero** — tap open ground.
- **Ability & items** — tap the button; aimed ones ask you to drag and release.
- **Shop** — between waves.
