import { fx, type Fx } from '../core/fixed';
import { DmgType, GroundKind, ProjKind, sec, TICK_RATE } from '../sim/types';
import { UNIT } from './art';

const cps = (cellsPerSecond: number): Fx => Math.floor(fx(cellsPerSecond) / TICK_RATE);

export const AbilityKind = {
  ShieldSlam: 0,
  ArrowStorm: 1,
  Meteor: 2,
  Sentry: 3,
} as const;

export interface HeroAbility {
  kind: number;
  name: string;
  desc: string;
  cooldown: number;
  radius: Fx;
  damage: number;
  damagePerLevel: number;
  stunT: number;
  duration: number;
  /** Ability is aimed at a map point rather than cast on the hero. */
  targeted: boolean;
  castRange: Fx;
}

export interface HeroDef {
  id: number;
  key: string;
  name: string;
  title: string;
  desc: string;
  passiveName: string;
  passiveDesc: string;
  hp: number;
  hpPerLevel: number;
  regen: number;
  damage: number;
  damagePerLevel: number;
  attackCd: number;
  range: Fx;
  splash: Fx;
  dmgType: number;
  projSpeed: Fx;
  projKind: number;
  moveSpeed: Fx;
  respawn: number;
  art: number;
  color: string;
  ability: HeroAbility;
  /** Passive knobs read by the simulation. */
  auraSlowPct: number;
  auraSlowRadius: Fx;
  critPct: number;
  critMult: number;
  burnDps: number;
  burnT: number;
  goldPct: number;
  towerRatePct: number;
  towerAuraRadius: Fx;
}

export const HERO = {
  Paladin: 0,
  Sentinel: 1,
  Archmage: 2,
  Tinker: 3,
} as const;

export const HEROES: readonly HeroDef[] = [
  {
    id: HERO.Paladin,
    key: 'paladin',
    name: 'Paladin',
    title: 'Shield of the Northern Keep',
    desc: 'A walking roadblock in plate. Wade into the lane and hold it.',
    passiveName: 'Devotion Aura',
    passiveDesc: 'Enemies within 2 cells are slowed by 18%.',
    hp: 400, hpPerLevel: 62, regen: 6,
    damage: 24, damagePerLevel: 6,
    attackCd: sec(0.8), range: fx(1.15), splash: fx(0.75),
    dmgType: DmgType.Physical, projSpeed: 0, projKind: ProjKind.HeroShot,
    moveSpeed: cps(2.6), respawn: sec(12),
    art: UNIT.soldierBlue, color: '#5ea8ff',
    ability: {
      kind: AbilityKind.ShieldSlam,
      name: 'Thunder Clap',
      desc: 'Hammer the ground: heavy damage and a 1.2s stun all around you.',
      cooldown: sec(12), radius: fx(2.3), damage: 70, damagePerLevel: 20,
      stunT: sec(1.2), duration: 0, targeted: false, castRange: 0,
    },
    auraSlowPct: 18, auraSlowRadius: fx(2.0),
    critPct: 0, critMult: 200, burnDps: 0, burnT: 0,
    goldPct: 0, towerRatePct: 0, towerAuraRadius: 0,
  },
  {
    id: HERO.Sentinel,
    key: 'sentinel',
    name: 'Sentinel',
    title: 'Eye of the Silverwood',
    desc: 'Fast, fragile, and lethal from range. Kite, never brawl.',
    passiveName: 'Marksmanship',
    passiveDesc: '22% of shots crit for double damage.',
    hp: 235, hpPerLevel: 32, regen: 4,
    damage: 28, damagePerLevel: 8,
    attackCd: sec(0.55), range: fx(3.4), splash: 0,
    dmgType: DmgType.Physical, projSpeed: cps(20), projKind: ProjKind.HeroShot,
    moveSpeed: cps(3.0), respawn: sec(12),
    art: UNIT.soldierGreen, color: '#6ddc72',
    ability: {
      kind: AbilityKind.ArrowStorm,
      name: 'Starfall',
      desc: 'Rain enchanted arrows on a chosen area for 3.5 seconds.',
      cooldown: sec(14), radius: fx(2.4), damage: 48, damagePerLevel: 13,
      stunT: 0, duration: sec(3.5), targeted: true, castRange: fx(6),
    },
    auraSlowPct: 0, auraSlowRadius: 0,
    critPct: 22, critMult: 200, burnDps: 0, burnT: 0,
    goldPct: 0, towerRatePct: 0, towerAuraRadius: 0,
  },
  {
    id: HERO.Archmage,
    key: 'archmage',
    name: 'Archmage',
    title: 'Keeper of the Violet Flame',
    desc: 'Every attack splashes and burns. Best against dense packs.',
    passiveName: 'Searing Brand',
    passiveDesc: 'Attacks set targets alight for 8 damage/s over 2s.',
    hp: 215, hpPerLevel: 28, regen: 4,
    damage: 21, damagePerLevel: 7,
    attackCd: sec(0.9), range: fx(3.0), splash: fx(0.85),
    dmgType: DmgType.Fire, projSpeed: cps(13), projKind: ProjKind.Ember,
    moveSpeed: cps(2.6), respawn: sec(12),
    art: UNIT.soldierOrange, color: '#ff8a45',
    ability: {
      kind: AbilityKind.Meteor,
      name: 'Rain of Fire',
      desc: 'Call down a burning star: huge burst damage plus scorched ground.',
      cooldown: sec(16), radius: fx(2.5), damage: 240, damagePerLevel: 62,
      stunT: 0, duration: sec(4), targeted: true, castRange: fx(6.5),
    },
    auraSlowPct: 0, auraSlowRadius: 0,
    critPct: 0, critMult: 200, burnDps: 8, burnT: sec(2),
    goldPct: 0, towerRatePct: 0, towerAuraRadius: 0,
  },
  {
    id: HERO.Tinker,
    key: 'tinker',
    name: 'Tinker',
    title: 'Quartermaster of the Steamworks',
    desc: 'Weak alone, but she pays for herself and speeds up your line.',
    passiveName: 'Goblin Workshop',
    passiveDesc: '+12% gold, and towers within 2.4 cells fire 15% faster.',
    hp: 250, hpPerLevel: 36, regen: 5,
    damage: 15, damagePerLevel: 4,
    attackCd: sec(0.7), range: fx(2.6), splash: 0,
    dmgType: DmgType.Energy, projSpeed: cps(18), projKind: ProjKind.Spark,
    moveSpeed: cps(2.8), respawn: sec(12),
    art: UNIT.soldierGrey, color: '#c7a2ff',
    ability: {
      kind: AbilityKind.Sentry,
      name: 'Clockwork Sentry',
      desc: 'Assemble a clockwork turret that fights for 20 seconds.',
      cooldown: sec(18), radius: fx(0.5), damage: 0, damagePerLevel: 0,
      stunT: 0, duration: sec(20), targeted: true, castRange: fx(4.5),
    },
    auraSlowPct: 0, auraSlowRadius: 0,
    critPct: 0, critMult: 200, burnDps: 0, burnT: 0,
    goldPct: 12, towerRatePct: 15, towerAuraRadius: fx(2.4),
  },
];

export function heroDef(id: number): HeroDef {
  return HEROES[id] ?? HEROES[0];
}

export const MAX_HERO_LEVEL = 10;

/** Total XP required to reach each level (index 0 = level 1). */
export const HERO_XP_TABLE: readonly number[] = [
  0, 60, 150, 280, 460, 700, 1010, 1400, 1880, 2460,
];

export function heroLevelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < HERO_XP_TABLE.length; i++) {
    if (xp >= HERO_XP_TABLE[i]) lvl = i + 1;
  }
  return Math.min(lvl, MAX_HERO_LEVEL);
}

export const SENTRY_STATS = {
  damage: 26,
  cooldown: sec(0.45),
  range: fx(2.8),
  projSpeed: cps(18),
  dmgType: DmgType.Energy,
  groundKind: GroundKind.None,
};
