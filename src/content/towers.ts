import { fx, type Fx } from '../core/fixed';
import { DmgType, GroundKind, ProjKind, sec, TICK_RATE } from '../sim/types';
import { HEAD, PLATFORM, UNIT } from './art';

const R = (cells: number): Fx => fx(cells);
/** Projectile speed authored in cells-per-second. */
const cps = (cellsPerSecond: number): Fx => Math.floor(fx(cellsPerSecond) / TICK_RATE);

export interface TowerStats {
  damage: number;
  cooldown: number;
  range: Fx;
  splash: Fx;
  dmgType: number;
  targetsAir: boolean;
  targetsGround: boolean;
  projSpeed: Fx;
  projKind: number;
  arcing: boolean;
  pierce: number;
  multiShot: number;
  chains: number;
  chainRange: Fx;
  chainFalloff: number;
  slowPct: number;
  slowT: number;
  burnDps: number;
  burnT: number;
  poisonDps: number;
  poisonT: number;
  stunT: number;
  critPct: number;
  critMult: number;
  executePct: number;
  armorShred: number;
  markPct: number;
  markT: number;
  shieldBreak: number;
  groundKind: number;
  groundRadius: Fx;
  groundLife: number;
  groundDps: number;
  /** Fires an instant pulse centred on itself instead of a projectile. */
  pulse: boolean;
  ramp: number;
  isSupport: boolean;
  auraDamagePct: number;
  auraRangePct: number;
  auraRatePct: number;
  auraCritPct: number;
  /** Gold generated for the owner per second. */
  income: number;
  /** Trains melee soldiers that hold the road instead of shooting. */
  barracks: boolean;
  /** Squad size held at the rally post. */
  unitCount: number;
  unitHp: number;
  unitDamage: number;
  /** Ticks between a soldier's swings. */
  unitCooldown: number;
  unitArmor: number;
  /** Ticks before a fallen soldier is replaced. */
  unitRespawn: number;
  /** Health regenerated per second while out of combat. */
  unitRegen: number;
  unitSpeed: Fx;
  unitArt: number;
  unitScale: Fx;
}

const BASE: TowerStats = {
  damage: 10,
  cooldown: sec(1),
  range: R(3),
  splash: 0,
  dmgType: DmgType.Physical,
  targetsAir: true,
  targetsGround: true,
  projSpeed: cps(14),
  projKind: ProjKind.Bolt,
  arcing: false,
  pierce: 0,
  multiShot: 1,
  chains: 0,
  chainRange: 0,
  chainFalloff: 25,
  slowPct: 0,
  slowT: 0,
  burnDps: 0,
  burnT: 0,
  poisonDps: 0,
  poisonT: 0,
  stunT: 0,
  critPct: 0,
  critMult: 200,
  executePct: 0,
  armorShred: 0,
  markPct: 0,
  markT: 0,
  shieldBreak: 0,
  groundKind: GroundKind.None,
  groundRadius: 0,
  groundLife: 0,
  groundDps: 0,
  pulse: false,
  ramp: 0,
  isSupport: false,
  auraDamagePct: 0,
  auraRangePct: 0,
  auraRatePct: 0,
  auraCritPct: 0,
  income: 0,
  barracks: false,
  unitCount: 0,
  unitHp: 0,
  unitDamage: 0,
  unitCooldown: sec(1),
  unitArmor: 0,
  unitRespawn: sec(6),
  unitRegen: 0,
  unitSpeed: Math.floor(fx(2.4) / TICK_RATE),
  unitArt: UNIT.soldierGreen,
  unitScale: fx(0.78),
};

/** A neutral stat block for payloads that are not owned by a tower. */
export const BASE_STATS: TowerStats = BASE;

export interface TowerTrack {
  key: string;
  name: string;
  desc: string;
  head: number;
  headScale: number;
  /** Percentage gained every time this track is picked. */
  pct: number;
  /** Perk unlocked once the track has two picks. */
  t2: Partial<TowerStats>;
  /** Perk unlocked at four picks - a fully specialised tower. */
  t4: Partial<TowerStats>;
  /** Plain-language summary of t2. */
  t2Desc: string;
  /** Plain-language summary of t4. */
  t4Desc: string;
}

export interface TowerDef {
  id: number;
  key: string;
  name: string;
  role: string;
  desc: string;
  cost: number;
  /** L1->L2 through L4->L5. Every step is a Power or Speed choice. */
  upgradeCosts: readonly [number, number, number, number];
  base: TowerStats;
  /** Range grows with every upgrade, whichever track was chosen. */
  growth: { rangePct: number };
  head: number;
  headScale: number;
  accent: string;
  power: TowerTrack;
  speed: TowerTrack;
}

export const TOWER = {
  Guard: 0,
  Cannon: 1,
  Frost: 2,
  Arcane: 3,
  Plague: 4,
  Hunter: 5,
  Brazier: 6,
  Altar: 7,
  Barracks: 8,
  Kennel: 9,
} as const;

function stats(over: Partial<TowerStats>): TowerStats {
  return { ...BASE, ...over };
}

export const TOWERS: readonly TowerDef[] = [
  {
    id: TOWER.Guard,
    key: 'guard-tower',
    name: 'Guard Tower',
    role: 'Single target',
    desc: 'Cheap, quick and hits air. The backbone of any line.',
    cost: 70,
    upgradeCosts: [55, 100, 165, 260],
    growth: { rangePct: 8 },
    head: HEAD.dualBarrel,
    headScale: 0.82,
    accent: '#8fd3ff',
    base: stats({
      damage: 13, cooldown: sec(0.55), range: R(3.2),
      projSpeed: cps(16), projKind: ProjKind.Bolt,
    }),
    power: {
      key: 'ballista', name: 'Ballista', pct: 46,
      desc: 'Heavier bolts that skewer everything in a line.',
      head: HEAD.plateNarrow, headScale: 1.0,
      t2: { pierce: 2, projSpeed: cps(20) },
      t2Desc: 'Bolts punch through 2 extra enemies.',
      t4: { pierce: 5, projSpeed: cps(28), projKind: ProjKind.Slug },
      t4Desc: 'Siege bolt: pierces 5 and flies twice as fast.',
    },
    speed: {
      key: 'battlements', name: 'Longbow Battlements', pct: 30,
      desc: 'More archers on the wall, loosing at more targets.',
      head: HEAD.quadRocket, headScale: 0.9,
      t2: { multiShot: 2 },
      t2Desc: 'Fires at 2 targets at once.',
      t4: { multiShot: 3, projSpeed: cps(20) },
      t4Desc: 'Fires at 3 targets at once.',
    },
  },
  {
    id: TOWER.Cannon,
    key: 'cannon',
    name: 'Cannon Tower',
    role: 'Splash',
    desc: 'Lobs shot that shreds packed ground troops. Cannot hit air.',
    cost: 110,
    upgradeCosts: [85, 150, 240, 380],
    growth: { rangePct: 6 },
    head: HEAD.heavyRound,
    headScale: 0.95,
    accent: '#ffb163',
    base: stats({
      damage: 36, cooldown: sec(1.35), range: R(3.0), splash: R(1.0),
      targetsAir: false, projSpeed: cps(9), projKind: ProjKind.Shell, arcing: true,
    }),
    power: {
      key: 'mortar', name: 'Mortar Team', pct: 50,
      desc: 'Bigger shells, bigger craters.',
      head: HEAD.singleRocket, headScale: 1.05,
      t2: { splash: R(1.35), range: R(4.2), projKind: ProjKind.Rocket },
      t2Desc: 'Wider blast and much longer range.',
      t4: { splash: R(1.9), range: R(5.4), projKind: ProjKind.Rocket, projSpeed: cps(8) },
      t4Desc: 'Siege mortar: enormous range and blast radius.',
    },
    speed: {
      key: 'scattershot', name: 'Scattershot Bastion', pct: 32,
      desc: 'Quick chain shot that finally covers the sky.',
      head: HEAD.dualMissile, headScale: 0.9,
      t2: { targetsAir: true, projSpeed: cps(13) },
      t2Desc: 'Can shoot flyers.',
      t4: { targetsAir: true, projSpeed: cps(16), multiShot: 2, splash: R(0.9) },
      t4Desc: 'Twin barrels fire two shells at once.',
    },
  },
  {
    id: TOWER.Frost,
    key: 'frost',
    name: 'Frost Ward',
    role: 'Control',
    desc: 'Pulses a chilling wave that slows everything around it.',
    cost: 95,
    upgradeCosts: [75, 130, 210, 330],
    growth: { rangePct: 10 },
    head: HEAD.flaskGreen,
    headScale: 0.85,
    accent: '#7ee8ff',
    base: stats({
      damage: 9, cooldown: sec(1.1), range: R(2.8), splash: R(2.8),
      dmgType: DmgType.Frost, pulse: true, projSpeed: 0,
      slowPct: 32, slowT: sec(1.6), projKind: ProjKind.Shard,
    }),
    power: {
      key: 'glacier', name: 'Glacial Prison', pct: 42,
      desc: 'Deeper cold that locks enemies in place.',
      head: HEAD.plateWide, headScale: 1.0,
      t2: { slowPct: 42, slowT: sec(2.0) },
      t2Desc: 'Slows by 42% for longer.',
      t4: { slowPct: 52, slowT: sec(2.2), stunT: sec(0.45), markPct: 25, markT: sec(2.4) },
      t4Desc: 'Every pulse briefly freezes non-boss enemies solid.',
    },
    speed: {
      key: 'permafrost', name: 'Permafrost Shrine', pct: 30,
      desc: 'Faster, wider pulses of creeping frost.',
      head: HEAD.flaskRed, headScale: 0.9,
      t2: { splash: R(3.4) },
      t2Desc: 'The chill reaches noticeably further.',
      t4: { splash: R(4.2), slowPct: 46, slowT: sec(2.4), markPct: 18, markT: sec(2.0) },
      t4Desc: 'Huge chill field; chilled targets take extra damage from everyone.',
    },
  },
  {
    id: TOWER.Arcane,
    key: 'arcane',
    name: 'Arcane Tower',
    role: 'Chain',
    desc: 'Arcs lightning between targets. Melts wards and barriers.',
    cost: 130,
    upgradeCosts: [100, 175, 280, 430],
    growth: { rangePct: 7 },
    head: HEAD.tripleSlot,
    headScale: 0.9,
    accent: '#c39cff',
    base: stats({
      damage: 22, cooldown: sec(0.85), range: R(3.2),
      dmgType: DmgType.Energy, projSpeed: 0, projKind: ProjKind.Spark,
      chains: 3, chainRange: R(1.9), chainFalloff: 22, shieldBreak: 60,
    }),
    power: {
      key: 'stormcrown', name: 'Storm Crown', pct: 45,
      desc: 'Longer, angrier arcs that lose nothing on the way.',
      head: HEAD.dualBarrel, headScale: 1.0,
      t2: { chains: 4, chainFalloff: 12 },
      t2Desc: 'One more jump, and far less falloff.',
      t4: { chains: 6, chainFalloff: 0, chainRange: R(2.3) },
      t4Desc: 'Six jumps at full damage.',
    },
    speed: {
      key: 'manarift', name: 'Mana Rift', pct: 30,
      desc: 'A stuttering rift that shreds barriers.',
      head: HEAD.heavyRound, headScale: 0.95,
      t2: { shieldBreak: 100 },
      t2Desc: 'Arcs strip shields completely.',
      t4: { shieldBreak: 100, chains: 4, stunT: sec(0.3) },
      t4Desc: 'Every hit staggers whatever it touches.',
    },
  },
  {
    id: TOWER.Plague,
    key: 'plague',
    name: 'Plague Spire',
    role: 'Damage over time',
    desc: 'Weak on impact, but the blight ignores armour entirely.',
    cost: 90,
    upgradeCosts: [70, 125, 200, 320],
    growth: { rangePct: 8 },
    head: HEAD.flaskGreen,
    headScale: 0.9,
    accent: '#9ff05a',
    base: stats({
      damage: 6, cooldown: sec(0.7), range: R(2.7),
      dmgType: DmgType.Poison, projSpeed: cps(10), projKind: ProjKind.Glob,
      poisonDps: 15, poisonT: sec(4),
    }),
    power: {
      key: 'cauldron', name: 'Plague Cauldron', pct: 44,
      desc: 'Thicker, longer-lasting blight.',
      head: HEAD.flaskRed, headScale: 1.0,
      t2: { poisonT: sec(5) },
      t2Desc: 'Poison lingers a second longer.',
      t4: {
        poisonT: sec(5),
        groundKind: GroundKind.PoisonCloud, groundRadius: R(1.3),
        groundLife: sec(4), groundDps: 22,
      },
      t4Desc: 'Poisoned victims burst into a lingering cloud on death.',
    },
    speed: {
      key: 'blight', name: 'Blight Sprayer', pct: 30,
      desc: 'A spraying nozzle that coats whole groups.',
      head: HEAD.dualMissile, headScale: 0.85,
      t2: { splash: R(0.7), armorShred: 2 },
      t2Desc: 'Globs splash and eat away at armour.',
      t4: { splash: R(1.0), armorShred: 5 },
      t4Desc: 'Splashing blight melts armour clean off.',
    },
  },
  {
    id: TOWER.Hunter,
    key: 'hunter',
    name: "Hunter's Roost",
    role: 'Elite killer',
    desc: 'Reaches almost the whole map and prefers the biggest target.',
    cost: 150,
    upgradeCosts: [120, 200, 320, 500],
    growth: { rangePct: 6 },
    head: HEAD.plateNarrow,
    headScale: 0.9,
    accent: '#ff9a9a',
    base: stats({
      damage: 95, cooldown: sec(1.9), range: R(7.0),
      projSpeed: cps(42), projKind: ProjKind.Slug,
      critPct: 25, critMult: 250,
    }),
    power: {
      key: 'executioner', name: 'Executioner', pct: 55,
      desc: 'One shot, one very large hole.',
      head: HEAD.singleRocket, headScale: 1.0,
      t2: { critMult: 275 },
      t2Desc: 'Critical hits land far harder.',
      t4: { critMult: 320, executePct: 18 },
      t4Desc: 'Instantly finishes any non-boss below 18% health.',
    },
    speed: {
      key: 'marksman', name: 'Sharpshooter', pct: 34,
      desc: 'A steady hand that never stops working.',
      head: HEAD.dualBarrel, headScale: 0.95,
      t2: { critPct: 35 },
      t2Desc: '35% chance to crit.',
      t4: { critPct: 50, critMult: 300, projSpeed: cps(52) },
      t4Desc: 'Half its shots are crits.',
    },
  },
  {
    id: TOWER.Brazier,
    key: 'brazier',
    name: 'Burning Brazier',
    role: 'Swarm clear',
    desc: 'Short ranged, relentless, and it sets everything on fire.',
    cost: 100,
    upgradeCosts: [80, 140, 225, 350],
    growth: { rangePct: 9 },
    head: HEAD.flaskRed,
    headScale: 0.88,
    accent: '#ff7a3c',
    base: stats({
      damage: 8, cooldown: sec(0.18), range: R(2.1), splash: R(0.7),
      dmgType: DmgType.Fire, projSpeed: cps(12), projKind: ProjKind.Ember,
      burnDps: 11, burnT: sec(2.5),
    }),
    power: {
      key: 'inferno', name: 'Inferno', pct: 44,
      desc: 'A fire that feeds on itself.',
      head: HEAD.heavyRound, headScale: 1.0,
      t2: { ramp: 60 },
      t2Desc: 'Damage builds the longer it keeps firing.',
      t4: { ramp: 140, burnT: sec(3.5) },
      t4Desc: 'Sustained fire more than doubles its damage.',
    },
    speed: {
      key: 'emberfall', name: 'Emberfall', pct: 26,
      desc: 'A torrent of embers that sets the ground alight.',
      head: HEAD.quadRocket, headScale: 0.95,
      t2: { splash: R(0.85) },
      t2Desc: 'Embers spread wider on impact.',
      t4: {
        splash: R(0.95),
        groundKind: GroundKind.Napalm, groundRadius: R(1.15),
        groundLife: sec(4), groundDps: 30,
      },
      t4Desc: 'Leaves burning ground that works after the wave moves on.',
    },
  },
  {
    id: TOWER.Altar,
    key: 'altar',
    name: 'War Altar',
    role: 'Support',
    desc: 'Never fires a shot - just makes every tower around it better.',
    cost: 120,
    upgradeCosts: [95, 165, 265, 410],
    growth: { rangePct: 12 },
    head: HEAD.plateWide,
    headScale: 0.85,
    accent: '#ffe27a',
    base: stats({
      damage: 0, cooldown: sec(1), range: R(3.0),
      isSupport: true, projSpeed: 0,
      auraDamagePct: 15, auraRangePct: 10, auraRatePct: 10,
    }),
    power: {
      key: 'warhorn', name: 'Horn of War', pct: 34,
      desc: 'A booming banner that makes every shot hit harder.',
      head: HEAD.tripleSlot, headScale: 0.95,
      t2: { auraCritPct: 8 },
      t2Desc: 'Nearby towers gain +8% crit chance.',
      t4: { auraCritPct: 15, income: 3 },
      t4Desc: 'A huge damage and crit banner, plus a little tribute gold.',
    },
    speed: {
      key: 'treasury', name: 'Goblin Treasury', pct: 26,
      desc: 'Keeps the neighbours firing fast and mints gold besides.',
      head: HEAD.flaskGreen, headScale: 0.95,
      t2: { auraRatePct: 16, income: 3 },
      t2Desc: 'Generates 3 gold per second for its owner.',
      t4: { auraRatePct: 24, income: 7 },
      t4Desc: 'Generates 7 gold per second and a big fire-rate banner.',
    },
  },
  {
    id: TOWER.Barracks,
    key: 'barracks',
    name: 'Barracks',
    role: 'Blocker',
    desc: 'A hut, not a turret: it posts a squad on the road that stops ground troops dead.',
    cost: 105,
    upgradeCosts: [80, 140, 225, 350],
    growth: { rangePct: 8 },
    head: PLATFORM.emptyPlot,
    headScale: 0.72,
    accent: '#ffd08a',
    base: stats({
      damage: 0, cooldown: sec(1), range: R(3.4),
      projSpeed: 0, targetsAir: false,
      barracks: true,
      unitCount: 3, unitHp: 190, unitDamage: 13,
      unitCooldown: sec(0.85), unitArmor: 1,
      unitRespawn: sec(7), unitRegen: 16,
      unitSpeed: cps(2.6), unitArt: UNIT.soldierGreen, unitScale: fx(0.8),
    }),
    power: {
      key: 'shieldwall', name: 'Shield Wall', pct: 38,
      desc: 'Heavier armour, heavier blows.',
      head: PLATFORM.emptyPlotAlt, headScale: 0.78,
      t2: { unitArmor: 5, unitArt: UNIT.soldierBlue, unitScale: fx(0.84) },
      t2Desc: 'Guards gain heavy plate (armour 5).',
      t4: {
        unitArmor: 10, unitCount: 4, unitRegen: 26,
        unitArt: UNIT.soldierBlue, unitScale: fx(0.9),
        slowPct: 30, slowT: sec(1.0),
      },
      t4Desc: 'A fourth guard, armour 10, and shield bashes that stagger.',
    },
    speed: {
      key: 'blades', name: 'Blade Company', pct: 30,
      desc: 'Duellists that cut faster than anyone can block.',
      head: PLATFORM.targetPlot, headScale: 0.78,
      t2: { unitCooldown: sec(0.6), unitArt: UNIT.soldierOrange },
      t2Desc: 'Swings land much more often.',
      t4: {
        unitCount: 4, unitCooldown: sec(0.5), unitRespawn: sec(5),
        unitArt: UNIT.soldierOrange, poisonDps: 16, poisonT: sec(3),
      },
      t4Desc: 'A fourth duellist, and every wound is left bleeding.',
    },
  },
  {
    id: TOWER.Kennel,
    key: 'kennel',
    name: 'Hound Kennel',
    role: 'Harass',
    desc: 'Cheap hut that looses fast hounds. They die easily but come straight back.',
    cost: 80,
    upgradeCosts: [65, 115, 185, 290],
    growth: { rangePct: 10 },
    head: PLATFORM.emptyPlot,
    headScale: 0.66,
    accent: '#b7f07a',
    base: stats({
      damage: 0, cooldown: sec(1), range: R(4.2),
      projSpeed: 0, targetsAir: false,
      barracks: true,
      unitCount: 3, unitHp: 105, unitDamage: 10,
      unitCooldown: sec(0.4), unitArmor: 0,
      unitRespawn: sec(4), unitRegen: 22,
      unitSpeed: cps(4.2), unitArt: UNIT.soldierGrey, unitScale: fx(0.66),
    }),
    power: {
      key: 'direpack', name: 'Dire Pack', pct: 40,
      desc: 'Bigger beasts with armour-shredding jaws.',
      head: PLATFORM.emptyPlotAlt, headScale: 0.72,
      t2: { unitScale: fx(0.76), armorShred: 2 },
      t2Desc: 'Larger hounds whose bites shred armour.',
      t4: { unitCount: 4, unitScale: fx(0.86), armorShred: 4, unitArmor: 3 },
      t4Desc: 'A fourth dire hound with tougher hide and deeper bites.',
    },
    speed: {
      key: 'plaguehounds', name: 'Plague Hounds', pct: 28,
      desc: 'A relentless pack that keeps coming back.',
      head: PLATFORM.targetPlot, headScale: 0.72,
      t2: { unitRespawn: sec(3), poisonDps: 14, poisonT: sec(3), unitArt: UNIT.soldierGreen },
      t2Desc: 'Bites inject blight, and losses are replaced quickly.',
      t4: {
        unitCount: 4, unitRespawn: sec(3), unitSpeed: cps(5.2),
        unitArt: UNIT.soldierGreen, poisonDps: 26, poisonT: sec(4),
      },
      t4Desc: 'A fourth hound, faster legs, and blight that never stops.',
    },
  },
];

/** Per-level aura growth for support towers (percent of the base aura). */
const AURA_GROWTH = 28;

export function towerDef(id: number): TowerDef {
  return TOWERS[id] ?? TOWERS[0];
}

const up = (v: number, p: number): number => Math.floor((v * (100 + p)) / 100);
const down = (v: number, p: number): number => Math.max(1, Math.floor((v * 100) / (100 + p)));

/** How many Power picks a tower at this level can have. */
export function trackPicks(level: number): number {
  return Math.max(0, Math.min(MAX_TOWER_LEVEL, level) - 1);
}

/** Splits a tower's upgrades into its two tracks. */
export function trackSplit(power: number, level: number): { power: number; speed: number } {
  const picks = trackPicks(level);
  const p = Math.max(0, Math.min(picks, power));
  return { power: p, speed: picks - p };
}

/**
 * Resolve the stat block for a concrete (type, power picks, level) combination.
 *
 * Track perks are applied as plain assignments *before* the percentage growth
 * loops, so unlocking a perk never wipes out the levels already paid for.
 * Pure and integer-only, so both peers derive identical numbers.
 */
export function computeTowerStats(defId: number, power: number, level: number): TowerStats {
  const d = towerDef(defId);
  const s: TowerStats = { ...d.base };
  const t = trackSplit(power, level);

  if (t.power >= 2) Object.assign(s, d.power.t2);
  if (t.power >= 4) Object.assign(s, d.power.t4);
  if (t.speed >= 2) Object.assign(s, d.speed.t2);
  if (t.speed >= 4) Object.assign(s, d.speed.t4);

  // Reach grows with every upgrade, whichever track it went into.
  for (let i = 0; i < t.power + t.speed; i++) {
    s.range = up(s.range, d.growth.rangePct);
    s.splash = up(s.splash, Math.floor(d.growth.rangePct / 2));
    s.chainRange = up(s.chainRange, Math.floor(d.growth.rangePct / 2));
    s.auraRangePct = up(s.auraRangePct, AURA_GROWTH);
  }

  for (let i = 0; i < t.power; i++) {
    s.damage = up(s.damage, d.power.pct);
    s.burnDps = up(s.burnDps, d.power.pct);
    s.poisonDps = up(s.poisonDps, d.power.pct);
    s.groundDps = up(s.groundDps, d.power.pct);
    s.unitDamage = up(s.unitDamage, d.power.pct);
    s.unitHp = up(s.unitHp, d.power.pct);
    s.auraDamagePct = up(s.auraDamagePct, AURA_GROWTH);
    s.auraCritPct = up(s.auraCritPct, AURA_GROWTH);
    s.income = up(s.income, AURA_GROWTH);
  }

  for (let i = 0; i < t.speed; i++) {
    s.cooldown = down(s.cooldown, d.speed.pct);
    s.unitCooldown = down(s.unitCooldown, d.speed.pct);
    s.unitRespawn = down(s.unitRespawn, Math.floor(d.speed.pct / 2));
    s.unitRegen = up(s.unitRegen, d.speed.pct);
    s.auraRatePct = up(s.auraRatePct, AURA_GROWTH);
  }

  return s;
}

export function towerHeadArt(defId: number, power: number, level: number): { head: number; scale: number } {
  const d = towerDef(defId);
  const t = trackSplit(power, level);
  if (t.power >= 2 && t.power > t.speed) return { head: d.power.head, scale: d.power.headScale };
  if (t.speed >= 2 && t.speed > t.power) return { head: d.speed.head, scale: d.speed.headScale };
  return { head: d.head, scale: d.headScale };
}

/** The name a tower shows once it has specialised. */
export function towerTitle(defId: number, power: number, level: number): string {
  const d = towerDef(defId);
  const t = trackSplit(power, level);
  if (t.power >= 2 && t.power > t.speed) return d.power.name;
  if (t.speed >= 2 && t.speed > t.power) return d.speed.name;
  return d.name;
}

const TOWER_BASE_ART = [PLATFORM.towerBaseP1, PLATFORM.towerBaseP2, PLATFORM.towerBaseP3];

export function towerBaseArt(owner: number): number {
  return TOWER_BASE_ART[owner % TOWER_BASE_ART.length];
}

/** Total gold sunk into a tower at a given level (used for sell value). */
export function towerInvested(defId: number, level: number): number {
  const d = towerDef(defId);
  let total = d.cost;
  for (let i = 1; i < level; i++) total += d.upgradeCosts[i - 1] ?? 0;
  return total;
}

export function upgradeCost(defId: number, level: number): number {
  const d = towerDef(defId);
  if (level >= 5) return 0;
  return d.upgradeCosts[level - 1] ?? 0;
}

export const MAX_TOWER_LEVEL = 5;
