import { fx, type Fx } from '../core/fixed';
import { DmgType, GroundKind, sec } from '../sim/types';

/**
 * Relics are permanent, per-player passives bought from the between-wave shop.
 * Every field is a plain integer percentage so the simulation stays exact.
 */
export interface RelicDef {
  id: number;
  key: string;
  name: string;
  desc: string;
  cost: number;
  icon: string;
  /** How many copies a single player may own. */
  maxStacks: number;
  mods: {
    damagePct?: number;
    rangePct?: number;
    ratePct?: number;
    goldPct?: number;
    upgradeDiscountPct?: number;
    slowPct?: number;
    dotPct?: number;
    critPct?: number;
    splashPct?: number;
    abilityCdPct?: number;
    heroDamagePct?: number;
    heroHpPct?: number;
    livesBonus?: number;
    startGold?: number;
    executeBonus?: number;
    chainBonus?: number;
  };
}

export const RELICS: readonly RelicDef[] = [
  { id: 0, key: 'whetstone', name: 'Whetstone', icon: '⚔', cost: 260, maxStacks: 4,
    desc: '+10% damage from all of your towers.', mods: { damagePct: 10 } },
  { id: 1, key: 'lens', name: 'Focus Lens', icon: '🔭', cost: 240, maxStacks: 3,
    desc: '+12% range on all of your towers.', mods: { rangePct: 12 } },
  { id: 2, key: 'coil', name: 'Overdrive Coil', icon: '⚡', cost: 300, maxStacks: 3,
    desc: '+12% attack speed on all of your towers.', mods: { ratePct: 12 } },
  { id: 3, key: 'treasury', name: 'Treasury Seal', icon: '💰', cost: 280, maxStacks: 3,
    desc: '+18% gold from every kill you make.', mods: { goldPct: 18 } },
  { id: 4, key: 'blueprint', name: 'Blueprints', icon: '📐', cost: 250, maxStacks: 2,
    desc: 'Your upgrades cost 18% less.', mods: { upgradeDiscountPct: 18 } },
  { id: 5, key: 'cryo', name: 'Cryo Core', icon: '❄', cost: 230, maxStacks: 2,
    desc: 'Your slows are 30% stronger and last 30% longer.', mods: { slowPct: 30 } },
  { id: 6, key: 'ember', name: 'Ember Heart', icon: '🔥', cost: 250, maxStacks: 3,
    desc: '+30% damage from your burns, poisons and ground effects.', mods: { dotPct: 30 } },
  { id: 7, key: 'charm', name: 'Fortune Charm', icon: '🍀', cost: 320, maxStacks: 2,
    desc: '+8% critical chance, and +2 lives right now.', mods: { critPct: 8, livesBonus: 2 } },
  { id: 8, key: 'siege', name: 'Siege Plans', icon: '💥', cost: 270, maxStacks: 2,
    desc: '+25% splash radius on your towers.', mods: { splashPct: 25 } },
  { id: 9, key: 'battery', name: 'Battery Pack', icon: '🔋', cost: 240, maxStacks: 2,
    desc: 'Hero ability cooldowns are 18% shorter.', mods: { abilityCdPct: 18 } },
  { id: 10, key: 'sigil', name: "Champion's Sigil", icon: '🛡', cost: 290, maxStacks: 3,
    desc: '+20% hero damage and +20% hero health.', mods: { heroDamagePct: 20, heroHpPct: 20 } },
  { id: 11, key: 'conduit', name: 'Arc Conduit', icon: '🌩', cost: 300, maxStacks: 2,
    desc: '+2 chain jumps on your chaining towers.', mods: { chainBonus: 2 } },
];

export function relicDef(id: number): RelicDef {
  return RELICS[id] ?? RELICS[0];
}

// ---------------------------------------------------------------- items

export const ItemKind = {
  Meteor: 0,
  FrostNova: 1,
  GoldCache: 2,
  RepairKit: 3,
  TimeWarp: 4,
  TurretKit: 5,
  Overload: 6,
} as const;

export interface ItemDef {
  id: number;
  key: string;
  name: string;
  desc: string;
  cost: number;
  icon: string;
  charges: number;
  kind: number;
  /** Requires the player to tap a target location. */
  targeted: boolean;
  castRange: Fx;
  radius: Fx;
  damage: number;
  dmgType: number;
  duration: number;
  slowPct: number;
  value: number;
  groundKind: number;
  groundDps: number;
  cooldown: number;
}

function item(d: Partial<ItemDef> & Pick<ItemDef, 'id' | 'key' | 'name' | 'desc' | 'cost' | 'icon'>): ItemDef {
  return {
    // `kind` mirrors `id` for every item; keeping both makes call sites readable.
    kind: d.id,
    charges: 1,
    targeted: false,
    castRange: 0,
    radius: 0,
    damage: 0,
    dmgType: DmgType.True,
    duration: 0,
    slowPct: 0,
    value: 0,
    groundKind: GroundKind.None,
    groundDps: 0,
    cooldown: sec(3),
    ...d,
  } as ItemDef;
}

export const ITEMS: readonly ItemDef[] = [
  item({
    id: ItemKind.Meteor, key: 'meteor', name: 'Meteor Scroll', icon: '☄',
    desc: 'Call a meteor anywhere on the map. 420 fire damage in a wide blast.',
    cost: 180, charges: 2, targeted: true, radius: fx(2.6), damage: 420,
    dmgType: DmgType.Fire, groundKind: GroundKind.Napalm, groundDps: 40, duration: sec(4),
  }),
  item({
    id: ItemKind.FrostNova, key: 'frost-nova', name: 'Frost Nova', icon: '❄',
    desc: 'Freeze every enemy on the map solid for 2.5 seconds.',
    cost: 200, charges: 2, duration: sec(2.5), damage: 60, dmgType: DmgType.Frost,
  }),
  item({
    id: ItemKind.GoldCache, key: 'gold-cache', name: 'Gold Cache', icon: '💰',
    desc: 'Instantly gain 220 gold.',
    cost: 150, charges: 1, value: 220,
  }),
  item({
    id: ItemKind.RepairKit, key: 'repair-kit', name: 'Repair Kit', icon: '🧰',
    desc: 'Restore 4 lives to the keep.',
    cost: 260, charges: 1, value: 4,
  }),
  item({
    id: ItemKind.TimeWarp, key: 'time-warp', name: 'Time Warp', icon: '⏳',
    desc: 'Slow every enemy on the map by 45% for 8 seconds.',
    cost: 190, charges: 2, duration: sec(8), slowPct: 45,
  }),
  item({
    id: ItemKind.TurretKit, key: 'turret-kit', name: 'Turret Kit', icon: '🔧',
    desc: 'Deploy a temporary auto-turret for 25 seconds.',
    cost: 170, charges: 2, targeted: true, duration: sec(25),
  }),
  item({
    id: ItemKind.Overload, key: 'overload', name: 'Overload Rune', icon: '⚡',
    desc: 'All of your towers fire 80% faster for 10 seconds.',
    cost: 210, charges: 2, duration: sec(10), value: 80,
  }),
];

export function itemDef(id: number): ItemDef {
  return ITEMS[id] ?? ITEMS[0];
}

export const MAX_ITEM_SLOTS = 4;

/**
 * Aggregated relic bonuses for a player. Recomputed whenever relics change and
 * kept on the player so combat code stays branch-free.
 */
export interface RelicMods {
  damagePct: number;
  rangePct: number;
  ratePct: number;
  goldPct: number;
  upgradeDiscountPct: number;
  slowPct: number;
  dotPct: number;
  critPct: number;
  splashPct: number;
  abilityCdPct: number;
  heroDamagePct: number;
  heroHpPct: number;
  executeBonus: number;
  chainBonus: number;
}

export function emptyMods(): RelicMods {
  return {
    damagePct: 0, rangePct: 0, ratePct: 0, goldPct: 0, upgradeDiscountPct: 0,
    slowPct: 0, dotPct: 0, critPct: 0, splashPct: 0, abilityCdPct: 0,
    heroDamagePct: 0, heroHpPct: 0, executeBonus: 0, chainBonus: 0,
  };
}

export function accumulateRelics(relicIds: readonly number[]): RelicMods {
  const out = emptyMods();
  for (const id of relicIds) {
    const m = relicDef(id).mods;
    out.damagePct += m.damagePct ?? 0;
    out.rangePct += m.rangePct ?? 0;
    out.ratePct += m.ratePct ?? 0;
    out.goldPct += m.goldPct ?? 0;
    out.upgradeDiscountPct += m.upgradeDiscountPct ?? 0;
    out.slowPct += m.slowPct ?? 0;
    out.dotPct += m.dotPct ?? 0;
    out.critPct += m.critPct ?? 0;
    out.splashPct += m.splashPct ?? 0;
    out.abilityCdPct += m.abilityCdPct ?? 0;
    out.heroDamagePct += m.heroDamagePct ?? 0;
    out.heroHpPct += m.heroHpPct ?? 0;
    out.executeBonus += m.executeBonus ?? 0;
    out.chainBonus += m.chainBonus ?? 0;
  }
  return out;
}
