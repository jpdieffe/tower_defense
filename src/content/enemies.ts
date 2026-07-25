import { fx, type Fx } from '../core/fixed';
import { DmgType, sec, TICK_RATE } from '../sim/types';
import { UNIT } from './art';

/** Author speeds in cells-per-second; store cells-per-tick. */
const cps = (cellsPerSecond: number): Fx => Math.floor(fx(cellsPerSecond) / TICK_RATE);

export const EnemyAbility = {
  None: 0,
  Heal: 1,
  Summon: 2,
  ShieldAllies: 3,
  Split: 4,
  Enrage: 5,
} as const;

export interface EnemyDef {
  id: number;
  key: string;
  name: string;
  hp: number;
  speed: Fx;
  armor: number;
  shield: number;
  /** Ticks without damage before the shield starts coming back. */
  shieldDelay: number;
  shieldRegen: number;
  bounty: number;
  xp: number;
  leak: number;
  flying: boolean;
  boss: boolean;
  scale: Fx;
  art: number;
  tint: number;
  /** Percent damage reduction per DmgType; negative means extra damage taken. */
  resist: readonly number[];
  ability: number;
  abilityCd: number;
  abilityPower: number;
  /** Cannot be slowed below this fraction (percent). Bosses shrug off crowd control. */
  ccResist: number;
  desc: string;
}

const noResist = [0, 0, 0, 0, 0, 0];

function def(d: Partial<EnemyDef> & Pick<EnemyDef, 'id' | 'key' | 'name' | 'hp' | 'speed' | 'bounty' | 'art'>): EnemyDef {
  return {
    armor: 0,
    shield: 0,
    shieldDelay: sec(3),
    shieldRegen: 0,
    xp: 3,
    leak: 1,
    flying: false,
    boss: false,
    scale: fx(1),
    tint: 0,
    resist: noResist,
    ability: EnemyAbility.None,
    abilityCd: 0,
    abilityPower: 0,
    ccResist: 0,
    desc: '',
    ...d,
  } as EnemyDef;
}

export const ENEMY = {
  Grunt: 0,
  Runner: 1,
  Swarmling: 2,
  Brute: 3,
  Warden: 4,
  Shaman: 5,
  Splitter: 6,
  Wisp: 7,
  Gunship: 8,
  Necromancer: 9,
  Juggernaut: 10,
  Titan: 11,
  SkyFortress: 12,
} as const;

export const ENEMIES: readonly EnemyDef[] = [
  def({
    id: ENEMY.Grunt, key: 'grunt', name: 'Grunt',
    hp: 62, speed: cps(1.15), armor: 1, bounty: 8, xp: 3,
    art: UNIT.soldierGreen, tint: 0,
    desc: 'Rank and file. Nothing special, but they never stop coming.',
  }),
  def({
    id: ENEMY.Runner, key: 'runner', name: 'Runner',
    hp: 40, speed: cps(2.25), bounty: 9, xp: 3,
    art: UNIT.soldierBlue, tint: 1,
    resist: [0, 0, -15, 0, 0, 0],
    desc: 'Sprints past slow towers. Frost hurts it more than most.',
  }),
  def({
    id: ENEMY.Swarmling, key: 'swarmling', name: 'Swarmling',
    hp: 22, speed: cps(2.6), bounty: 4, xp: 1, scale: fx(0.72),
    art: UNIT.soldierGreen, tint: 4,
    desc: 'Arrives in packs. Splash damage is the only sane answer.',
  }),
  def({
    id: ENEMY.Brute, key: 'brute', name: 'Brute',
    hp: 290, speed: cps(0.82), armor: 9, bounty: 22, xp: 10, leak: 2, scale: fx(1.3),
    art: UNIT.tankSand, tint: 2,
    resist: [0, 30, 0, 0, 0, 0],
    ccResist: 30,
    desc: 'Heavy plating. Fire washes off it; poison and energy do not.',
  }),
  def({
    id: ENEMY.Warden, key: 'warden', name: 'Warden',
    hp: 160, speed: cps(1.0), armor: 3, shield: 170, shieldRegen: 6, bounty: 26, xp: 12,
    art: UNIT.soldierGrey, tint: 3,
    resist: [15, 0, 0, -30, 0, 0],
    desc: 'Regenerating barrier. Tesla weapons tear straight through it.',
  }),
  def({
    id: ENEMY.Shaman, key: 'shaman', name: 'Shaman',
    hp: 140, speed: cps(1.0), bounty: 24, xp: 10,
    art: UNIT.soldierOrange, tint: 5,
    ability: EnemyAbility.Heal, abilityCd: sec(2.0), abilityPower: 26,
    desc: 'Mends nearby allies every couple of seconds. Kill it first.',
  }),
  def({
    id: ENEMY.Splitter, key: 'splitter', name: 'Splitter',
    hp: 120, speed: cps(1.25), bounty: 16, xp: 6, scale: fx(1.1),
    art: UNIT.tankGreen, tint: 0,
    ability: EnemyAbility.Split, abilityPower: 2,
    desc: 'Bursts into two swarmlings when destroyed.',
  }),
  def({
    id: ENEMY.Wisp, key: 'wisp', name: 'Wisp',
    hp: 78, speed: cps(1.85), bounty: 14, xp: 5, flying: true,
    art: UNIT.planeGreen, tint: 4,
    resist: [20, 0, 0, 0, 0, 0],
    desc: 'Flies straight for the core, ignoring every twist of the road.',
  }),
  def({
    id: ENEMY.Gunship, key: 'gunship', name: 'Gunship',
    hp: 380, speed: cps(1.2), armor: 5, bounty: 40, xp: 18, flying: true, leak: 2, scale: fx(1.25),
    art: UNIT.planeGrey, tint: 3,
    resist: [10, 0, 10, 0, 0, 0],
    desc: 'Armoured flyer. If you have no anti-air, this is where you lose.',
  }),
  def({
    id: ENEMY.Necromancer, key: 'necromancer', name: 'Necromancer',
    hp: 220, speed: cps(0.92), bounty: 30, xp: 14,
    art: UNIT.soldierOrange, tint: 6,
    ability: EnemyAbility.Summon, abilityCd: sec(3.5), abilityPower: 2,
    resist: [0, 0, 0, 0, 40, 0],
    desc: 'Raises swarmlings as it walks. Poison barely tickles it.',
  }),
  def({
    id: ENEMY.Juggernaut, key: 'juggernaut', name: 'Juggernaut',
    hp: 3200, speed: cps(0.62), armor: 16, bounty: 220, xp: 90, leak: 6,
    boss: true, scale: fx(1.95), ccResist: 65,
    art: UNIT.tankSand, tint: 7,
    resist: [10, 15, 10, 0, 0, 0],
    ability: EnemyAbility.Enrage, abilityCd: sec(8), abilityPower: 25,
    desc: 'BOSS - speeds up as it takes damage. Shrugs off most crowd control.',
  }),
  def({
    id: ENEMY.Titan, key: 'titan', name: 'Titan',
    hp: 6400, speed: cps(0.52), armor: 22, shield: 2200, shieldRegen: 30,
    bounty: 400, xp: 160, leak: 8, boss: true, scale: fx(2.2), ccResist: 75,
    art: UNIT.tankGreen, tint: 8,
    resist: [20, 10, 20, -15, 0, 0],
    ability: EnemyAbility.ShieldAllies, abilityCd: sec(6), abilityPower: 120,
    desc: 'BOSS - shields its escort. Energy damage is its weakness.',
  }),
  def({
    id: ENEMY.SkyFortress, key: 'sky-fortress', name: 'Sky Fortress',
    hp: 4600, speed: cps(0.72), armor: 13, bounty: 320, xp: 140, leak: 7,
    flying: true, boss: true, scale: fx(2.1), ccResist: 60,
    art: UNIT.planeGrey, tint: 9,
    resist: [25, 0, 0, 0, 15, 0],
    ability: EnemyAbility.Summon, abilityCd: sec(4), abilityPower: 3,
    desc: 'BOSS - an airborne carrier that keeps launching escorts.',
  }),
];

export function enemyDef(id: number): EnemyDef {
  return ENEMIES[id] ?? ENEMIES[0];
}

/** Palette used to recolour the shared soldier/vehicle sprites. */
export const ENEMY_TINTS: readonly string[] = [
  '#5fd36b', // 0 green
  '#4aa8ff', // 1 blue
  '#c98b4b', // 2 tan
  '#9aa7b4', // 3 steel
  '#8ee36b', // 4 lime
  '#ff9c3f', // 5 orange
  '#a76bff', // 6 violet
  '#ff5d4a', // 7 crimson
  '#3ad6c0', // 8 teal
  '#ffd447', // 9 gold
];

export { DmgType };
