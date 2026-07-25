import { fx, type Fx } from '../core/fixed';
import { DmgType, GroundKind, ProjKind, sec, TICK_RATE } from '../sim/types';
import { HEAD, PLATFORM } from './art';

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
};

export interface TowerBranch {
  key: string;
  name: string;
  desc: string;
  head: number;
  headScale: number;
  damagePct: number;
  rangePct: number;
  ratePct: number;
  stats: Partial<TowerStats>;
}

export interface TowerDef {
  id: number;
  key: string;
  name: string;
  role: string;
  desc: string;
  cost: number;
  /** L1->L2, L2->L3, L3->L4 (branch choice), L4->L5. */
  upgradeCosts: readonly [number, number, number, number];
  base: TowerStats;
  growth: { damagePct: number; rangePct: number; ratePct: number };
  head: number;
  headScale: number;
  accent: string;
  branches: readonly [TowerBranch, TowerBranch];
}

export const TOWER = {
  Arrow: 0,
  Cannon: 1,
  Frost: 2,
  Tesla: 3,
  Venom: 4,
  Sniper: 5,
  Flame: 6,
  Beacon: 7,
} as const;

function stats(over: Partial<TowerStats>): TowerStats {
  return { ...BASE, ...over };
}

export const TOWERS: readonly TowerDef[] = [
  {
    id: TOWER.Arrow,
    key: 'arrow',
    name: 'Arrow Nest',
    role: 'Single target',
    desc: 'Cheap, quick and hits air. The backbone of any line.',
    cost: 70,
    upgradeCosts: [55, 100, 165, 260],
    growth: { damagePct: 48, rangePct: 8, ratePct: 12 },
    head: HEAD.dualBarrel,
    headScale: 0.82,
    accent: '#8fd3ff',
    base: stats({
      damage: 13, cooldown: sec(0.55), range: R(3.2),
      projSpeed: cps(16), projKind: ProjKind.Bolt,
    }),
    branches: [
      {
        key: 'ballista', name: 'Ballista',
        desc: 'One massive bolt that skewers everything in a line.',
        head: HEAD.plateNarrow, headScale: 1.0,
        damagePct: 240, rangePct: 30, ratePct: -60,
        stats: { pierce: 4, projSpeed: cps(26), projKind: ProjKind.Slug },
      },
      {
        key: 'volley', name: 'Volley Nest',
        desc: 'Fires at three separate targets at once.',
        head: HEAD.quadRocket, headScale: 0.9,
        damagePct: -20, rangePct: 0, ratePct: 15,
        stats: { multiShot: 3 },
      },
    ],
  },
  {
    id: TOWER.Cannon,
    key: 'cannon',
    name: 'Cannon',
    role: 'Splash',
    desc: 'Lobs shells that shred packed ground troops. Cannot hit air.',
    cost: 110,
    upgradeCosts: [85, 150, 240, 380],
    growth: { damagePct: 52, rangePct: 6, ratePct: 8 },
    head: HEAD.heavyRound,
    headScale: 0.95,
    accent: '#ffb163',
    base: stats({
      damage: 36, cooldown: sec(1.35), range: R(3.0), splash: R(1.0),
      targetsAir: false, projSpeed: cps(9), projKind: ProjKind.Shell, arcing: true,
    }),
    branches: [
      {
        key: 'mortar', name: 'Mortar',
        desc: 'Enormous range and blast radius, glacially slow.',
        head: HEAD.singleRocket, headScale: 1.05,
        damagePct: 85, rangePct: 115, ratePct: -45,
        stats: { splash: R(1.75), projSpeed: cps(7), projKind: ProjKind.Rocket },
      },
      {
        key: 'flak', name: 'Flak Battery',
        desc: 'Rapid airbursts that finally cover the sky.',
        head: HEAD.dualMissile, headScale: 0.9,
        damagePct: -25, rangePct: 15, ratePct: 70,
        stats: { targetsAir: true, splash: R(0.9), projSpeed: cps(15) },
      },
    ],
  },
  {
    id: TOWER.Frost,
    key: 'frost',
    name: 'Frost Spire',
    role: 'Control',
    desc: 'Pulses a chilling wave that slows everything around it.',
    cost: 95,
    upgradeCosts: [75, 130, 210, 330],
    growth: { damagePct: 40, rangePct: 10, ratePct: 10 },
    head: HEAD.flaskGreen,
    headScale: 0.85,
    accent: '#7ee8ff',
    base: stats({
      damage: 9, cooldown: sec(1.1), range: R(2.8), splash: R(2.8),
      dmgType: DmgType.Frost, pulse: true, projSpeed: 0,
      slowPct: 32, slowT: sec(1.6), projKind: ProjKind.Shard,
    }),
    branches: [
      {
        key: 'glacier', name: 'Glacier',
        desc: 'Every pulse briefly freezes non-boss enemies solid.',
        head: HEAD.plateWide, headScale: 1.0,
        damagePct: 40, rangePct: 5, ratePct: -20,
        stats: { stunT: sec(0.45), slowPct: 40, slowT: sec(2.0) },
      },
      {
        key: 'permafrost', name: 'Permafrost',
        desc: 'Wider chill, and frozen targets take extra damage from everyone.',
        head: HEAD.flaskRed, headScale: 0.9,
        damagePct: 0, rangePct: 42, ratePct: 0,
        stats: { splash: R(4.0), slowPct: 52, slowT: sec(2.4), markPct: 25, markT: sec(2.4) },
      },
    ],
  },
  {
    id: TOWER.Tesla,
    key: 'tesla',
    name: 'Tesla Coil',
    role: 'Chain',
    desc: 'Arcs lightning between targets. Melts shields.',
    cost: 130,
    upgradeCosts: [100, 175, 280, 430],
    growth: { damagePct: 45, rangePct: 7, ratePct: 10 },
    head: HEAD.tripleSlot,
    headScale: 0.9,
    accent: '#c39cff',
    base: stats({
      damage: 22, cooldown: sec(0.85), range: R(3.2),
      dmgType: DmgType.Energy, projSpeed: 0, projKind: ProjKind.Spark,
      chains: 3, chainRange: R(1.9), chainFalloff: 22, shieldBreak: 60,
    }),
    branches: [
      {
        key: 'overcharge', name: 'Overcharge',
        desc: 'Six jumps and no damage falloff between them.',
        head: HEAD.dualBarrel, headScale: 1.0,
        damagePct: 35, rangePct: 10, ratePct: 0,
        stats: { chains: 6, chainFalloff: 0, chainRange: R(2.2) },
      },
      {
        key: 'ion', name: 'Ion Storm',
        desc: 'Shorter arcs, but every hit staggers and strips shields.',
        head: HEAD.heavyRound, headScale: 0.95,
        damagePct: 10, rangePct: 0, ratePct: 25,
        stats: { chains: 4, stunT: sec(0.3), shieldBreak: 100 },
      },
    ],
  },
  {
    id: TOWER.Venom,
    key: 'venom',
    name: 'Venom Sprayer',
    role: 'Damage over time',
    desc: 'Weak on impact, but the poison ignores armour entirely.',
    cost: 90,
    upgradeCosts: [70, 125, 200, 320],
    growth: { damagePct: 42, rangePct: 8, ratePct: 12 },
    head: HEAD.flaskGreen,
    headScale: 0.9,
    accent: '#9ff05a',
    base: stats({
      damage: 6, cooldown: sec(0.7), range: R(2.7),
      dmgType: DmgType.Poison, projSpeed: cps(10), projKind: ProjKind.Glob,
      poisonDps: 15, poisonT: sec(4),
    }),
    branches: [
      {
        key: 'plague', name: 'Plague Vat',
        desc: 'Poisoned victims burst into a lingering cloud on death.',
        head: HEAD.flaskRed, headScale: 1.0,
        damagePct: 20, rangePct: 10, ratePct: 0,
        stats: {
          poisonDps: 26, poisonT: sec(5),
          groundKind: GroundKind.PoisonCloud, groundRadius: R(1.3),
          groundLife: sec(4), groundDps: 22,
        },
      },
      {
        key: 'acid', name: 'Acid Sprayer',
        desc: 'Splashing acid melts armour clean off.',
        head: HEAD.dualMissile, headScale: 0.85,
        damagePct: 25, rangePct: 5, ratePct: 10,
        stats: { armorShred: 5, splash: R(0.95), poisonDps: 20 },
      },
    ],
  },
  {
    id: TOWER.Sniper,
    key: 'sniper',
    name: 'Sniper Nest',
    role: 'Elite killer',
    desc: 'Reaches almost the whole map and prefers the biggest target.',
    cost: 150,
    upgradeCosts: [120, 200, 320, 500],
    growth: { damagePct: 55, rangePct: 6, ratePct: 8 },
    head: HEAD.plateNarrow,
    headScale: 0.9,
    accent: '#ff9a9a',
    base: stats({
      damage: 95, cooldown: sec(1.9), range: R(7.0),
      projSpeed: cps(42), projKind: ProjKind.Slug,
      critPct: 25, critMult: 250,
    }),
    branches: [
      {
        key: 'executioner', name: 'Executioner',
        desc: 'Instantly finishes any non-boss below 18% health.',
        head: HEAD.singleRocket, headScale: 1.0,
        damagePct: 30, rangePct: 10, ratePct: 0,
        stats: { executePct: 18 },
      },
      {
        key: 'marksman', name: 'Marksman',
        desc: 'Half the reload, double the crits.',
        head: HEAD.dualBarrel, headScale: 0.95,
        damagePct: -10, rangePct: 0, ratePct: 95,
        stats: { critPct: 45, critMult: 300 },
      },
    ],
  },
  {
    id: TOWER.Flame,
    key: 'flame',
    name: 'Flame Turret',
    role: 'Swarm clear',
    desc: 'Short ranged, relentless, and it sets everything on fire.',
    cost: 100,
    upgradeCosts: [80, 140, 225, 350],
    growth: { damagePct: 44, rangePct: 9, ratePct: 8 },
    head: HEAD.flaskRed,
    headScale: 0.88,
    accent: '#ff7a3c',
    base: stats({
      damage: 8, cooldown: sec(0.18), range: R(2.1), splash: R(0.7),
      dmgType: DmgType.Fire, projSpeed: cps(12), projKind: ProjKind.Ember,
      burnDps: 11, burnT: sec(2.5),
    }),
    branches: [
      {
        key: 'inferno', name: 'Inferno',
        desc: 'Damage ramps up the longer it keeps firing at the same crowd.',
        head: HEAD.heavyRound, headScale: 1.0,
        damagePct: 20, rangePct: 12, ratePct: 0,
        stats: { ramp: 120, burnDps: 18 },
      },
      {
        key: 'napalm', name: 'Napalm Thrower',
        desc: 'Leaves burning ground that keeps working after the wave moves on.',
        head: HEAD.quadRocket, headScale: 0.95,
        damagePct: 0, rangePct: 20, ratePct: -25,
        stats: {
          groundKind: GroundKind.Napalm, groundRadius: R(1.15),
          groundLife: sec(4), groundDps: 30, splash: R(0.9),
        },
      },
    ],
  },
  {
    id: TOWER.Beacon,
    key: 'beacon',
    name: 'Beacon',
    role: 'Support',
    desc: 'Never fires a shot - just makes every tower around it better.',
    cost: 120,
    upgradeCosts: [95, 165, 265, 410],
    growth: { damagePct: 0, rangePct: 12, ratePct: 0 },
    head: HEAD.plateWide,
    headScale: 0.85,
    accent: '#ffe27a',
    base: stats({
      damage: 0, cooldown: sec(1), range: R(3.0),
      isSupport: true, projSpeed: 0,
      auraDamagePct: 15, auraRangePct: 10, auraRatePct: 10,
    }),
    branches: [
      {
        key: 'warhorn', name: 'War Horn',
        desc: 'A huge damage and crit banner for everything nearby.',
        head: HEAD.tripleSlot, headScale: 0.95,
        damagePct: 0, rangePct: 10, ratePct: 0,
        stats: { auraDamagePct: 38, auraCritPct: 12, auraRatePct: 12 },
      },
      {
        key: 'mint', name: 'Mint',
        desc: 'Prints gold for its owner and keeps the neighbours firing fast.',
        head: HEAD.flaskGreen, headScale: 0.95,
        damagePct: 0, rangePct: 20, ratePct: 0,
        stats: { auraRatePct: 22, auraDamagePct: 10, income: 6 },
      },
    ],
  },
];

/** Per-level aura growth for support towers (percent of the base aura). */
const AURA_GROWTH = 28;

export function towerDef(id: number): TowerDef {
  return TOWERS[id] ?? TOWERS[0];
}

/**
 * Resolve the stat block for a concrete (type, branch, level) combination.
 * Pure and integer-only, so both peers derive identical numbers.
 */
export function computeTowerStats(defId: number, branch: number, level: number): TowerStats {
  const d = towerDef(defId);
  const s: TowerStats = { ...d.base };

  const applyLevel = (): void => {
    s.damage = Math.floor((s.damage * (100 + d.growth.damagePct)) / 100);
    s.range = Math.floor((s.range * (100 + d.growth.rangePct)) / 100);
    s.cooldown = Math.max(1, Math.floor((s.cooldown * 100) / (100 + d.growth.ratePct)));
    s.splash = Math.floor((s.splash * (100 + Math.floor(d.growth.rangePct / 2))) / 100);
    s.burnDps = Math.floor((s.burnDps * (100 + d.growth.damagePct)) / 100);
    s.poisonDps = Math.floor((s.poisonDps * (100 + d.growth.damagePct)) / 100);
    s.groundDps = Math.floor((s.groundDps * (100 + d.growth.damagePct)) / 100);
    s.auraDamagePct = Math.floor((s.auraDamagePct * (100 + AURA_GROWTH)) / 100);
    s.auraRatePct = Math.floor((s.auraRatePct * (100 + AURA_GROWTH)) / 100);
    s.auraRangePct = Math.floor((s.auraRangePct * (100 + AURA_GROWTH)) / 100);
    s.auraCritPct = Math.floor((s.auraCritPct * (100 + AURA_GROWTH)) / 100);
    s.income = Math.floor((s.income * (100 + AURA_GROWTH)) / 100);
  };

  // Levels 1-3 are plain growth on the base tower.
  const preBranch = Math.min(level, 3);
  for (let i = 1; i < preBranch; i++) applyLevel();

  if (branch > 0 && level >= 4) {
    const b = d.branches[branch - 1];
    Object.assign(s, b.stats);
    s.damage = Math.floor((s.damage * (100 + b.damagePct)) / 100);
    s.range = Math.floor((s.range * (100 + b.rangePct)) / 100);
    s.cooldown = Math.max(1, Math.floor((s.cooldown * 100) / (100 + b.ratePct)));
    s.burnDps = Math.floor((s.burnDps * (100 + b.damagePct)) / 100);
    s.poisonDps = Math.floor((s.poisonDps * (100 + b.damagePct)) / 100);
    for (let i = 3; i < level; i++) applyLevel();
  }

  return s;
}

export function towerHeadArt(defId: number, branch: number, level: number): { head: number; scale: number } {
  const d = towerDef(defId);
  if (branch > 0 && level >= 4) {
    const b = d.branches[branch - 1];
    return { head: b.head, scale: b.headScale };
  }
  return { head: d.head, scale: d.headScale };
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
