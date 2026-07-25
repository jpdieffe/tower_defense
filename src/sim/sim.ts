/**
 * The deterministic game simulation.
 *
 * Rules of this file:
 *   1. Integers and Q16.16 fixed-point only. No `Math.random`, no floats.
 *   2. All iteration order is array order, which is identical on both peers.
 *   3. Nothing here reads wall-clock time, the DOM, or any local setting.
 *
 * Given the same starting state and the same command stream, `step()` produces
 * bit-identical results on every device - which is what makes "your bullet hit
 * but mine missed" impossible.
 */

import {
  FX_ONE, fx, fxDist2, fxDiv, fxMul, fxNormalize, fxSegDist2, pct,
  type Fx, type Vec2,
} from '../core/fixed';
import { chance, nextInt, type RngHolder } from '../core/rng';
import { buildMapRuntime, isBuildable, type MapRuntime } from '../content/maps';
import { enemyDef, ENEMY, EnemyAbility } from '../content/enemies';
import {
  computeTowerStats, MAX_TOWER_LEVEL, TOWER, towerDef, upgradeCost,
  type TowerStats,
} from '../content/towers';
import { AbilityKind, heroDef, heroLevelForXp, MAX_HERO_LEVEL } from '../content/heroes';
import {
  accumulateRelics, emptyMods, ItemKind, itemDef, MAX_ITEM_SLOTS, relicDef,
  type RelicMods,
} from '../content/items';
import { generateWave, WaveMod } from '../content/waves';
import { CmdType, type Command } from './commands';
import {
  BUILD_PHASE_TICKS, DIFFICULTIES, findEnemy, findTower, nextId, refreshShop,
} from './state';
import {
  DmgType, EventKind, GroundKind, Phase, ProjKind, sec, TargetMode, TICK_RATE,
  type Enemy, type GameState, type GroundEffect, type PlayerState,
  type Projectile, type SimOutput, type Tower,
} from './types';

const HIT_RADIUS: Fx = fx(0.34);
const GROUND_TICK = Math.floor(TICK_RATE / 4); // ground effects damage 4x/second
const CONTACT_RANGE: Fx = fx(0.62);
const CORE_REACH: Fx = fx(0.5);

interface Ctx {
  s: GameState;
  out: SimOutput;
  rt: MapRuntime;
  mods: RelicMods[];
  difficultyHpPct: number;
  difficultyGoldPct: number;
  /** Per-tower-index aura bonuses, rebuilt each tick. */
  auraDmg: number[];
  auraRange: number[];
  auraRate: number[];
  auraCrit: number[];
}

const tmpVec: Vec2 = { x: 0, y: 0 };

function emit(
  ctx: Ctx, kind: number, x: Fx, y: Fx,
  a = 0, b = 0, owner = 0, x2: Fx = 0, y2: Fx = 0,
): void {
  ctx.out.events.push({ kind, x, y, x2, y2, a, b, owner });
}

// ============================================================== entry point

export function step(s: GameState, commands: readonly Command[], out: SimOutput): void {
  out.events.length = 0;
  if (s.gameOver) {
    s.tick++;
    return;
  }

  const ctx: Ctx = {
    s,
    out,
    rt: buildMapRuntime(s.mapId),
    mods: s.players.map((p) => accumulateRelics(p.relics)),
    difficultyHpPct: (DIFFICULTIES[s.difficulty] ?? DIFFICULTIES[0]).hpPct,
    difficultyGoldPct: (DIFFICULTIES[s.difficulty] ?? DIFFICULTIES[0]).goldPct,
    auraDmg: [],
    auraRange: [],
    auraRate: [],
    auraCrit: [],
  };

  for (const c of commands) applyCommand(ctx, c);

  savePrevious(s);
  updateGlobalTimers(s);
  updatePhase(ctx);
  spawnQueued(ctx);
  updateEnemyStatus(ctx);
  moveEnemies(ctx);
  enemyAbilities(ctx);
  computeAuras(ctx);
  updateTowers(ctx);
  updateHeroes(ctx);
  updateProjectiles(ctx);
  updateGrounds(ctx);
  reap(ctx);
  checkDefeat(ctx);

  s.tick++;
}

// ============================================================== commands

function applyCommand(ctx: Ctx, c: Command): void {
  const s = ctx.s;
  const p = s.players[c.p];
  if (!p) return;

  switch (c.t) {
    case CmdType.Build: return cmdBuild(ctx, p, c.a, c.b, c.c);
    case CmdType.Upgrade: return cmdUpgrade(ctx, p, c.a);
    case CmdType.ChooseBranch: return cmdBranch(ctx, p, c.a, c.b);
    case CmdType.Sell: return cmdSell(ctx, p, c.a);
    case CmdType.SetTargetMode: return cmdTargetMode(ctx, p, c.a, c.b);
    case CmdType.MoveHero: return cmdMoveHero(p, c.a, c.b);
    case CmdType.UseAbility: return cmdAbility(ctx, p, c.a, c.b);
    case CmdType.UseItem: return cmdUseItem(ctx, p, c.a, c.b, c.c);
    case CmdType.BuyShop: return cmdBuyShop(ctx, p, c.a);
    case CmdType.ToggleReady: {
      if (s.phase === Phase.Build) p.ready = !p.ready;
      return;
    }
    case CmdType.Emote: {
      emit(ctx, EventKind.HeroAbility, p.hero.x, p.hero.y, -1, c.a, p.idx);
      return;
    }
    default: return;
  }
}

function deny(ctx: Ctx, p: PlayerState, x: Fx, y: Fx): void {
  emit(ctx, EventKind.Denied, x, y, 0, 0, p.idx);
}

function cellOccupied(s: GameState, cx: number, cy: number): boolean {
  for (const t of s.towers) {
    if (t.cx === cx && t.cy === cy) return true;
  }
  return false;
}

function cmdBuild(ctx: Ctx, p: PlayerState, defId: number, cx: number, cy: number): void {
  const s = ctx.s;
  const d = towerDef(defId);
  if (defId < 0 || defId >= 8) return;
  if (!isBuildable(ctx.rt, cx, cy) || cellOccupied(s, cx, cy)) {
    deny(ctx, p, cellCenterFx(cx), cellCenterFx(cy));
    return;
  }
  if (p.gold < d.cost) {
    deny(ctx, p, cellCenterFx(cx), cellCenterFx(cy));
    return;
  }
  p.gold -= d.cost;
  p.towersBuilt++;
  const t: Tower = {
    id: nextId(s),
    owner: p.idx,
    defId,
    branch: 0,
    level: 1,
    cx, cy,
    x: cellCenterFx(cx),
    y: cellCenterFx(cy),
    dx: 0, dy: fx(-1),
    cd: 0,
    targetMode: TargetMode.First,
    targetId: 0,
    invested: d.cost,
    charge: 0,
    temp: 0,
    kills: 0,
    damageDealt: 0,
    fireAnim: 0,
    pulse: 0,
  };
  s.towers.push(t);
  emit(ctx, EventKind.TowerBuilt, t.x, t.y, defId, 0, p.idx);
}

function discountedCost(ctx: Ctx, p: PlayerState, cost: number): number {
  const disc = Math.min(60, ctx.mods[p.idx].upgradeDiscountPct);
  return Math.max(1, cost - pct(cost, disc));
}

function cmdUpgrade(ctx: Ctx, p: PlayerState, towerId: number): void {
  const t = findTower(ctx.s, towerId);
  if (!t || t.owner !== p.idx || t.temp > 0) return;
  if (t.level >= MAX_TOWER_LEVEL) return;
  // Level 3 -> 4 requires picking a branch instead.
  if (t.level === 3 && t.branch === 0) return;
  const raw = upgradeCost(t.defId, t.level);
  const cost = discountedCost(ctx, p, raw);
  if (p.gold < cost) {
    deny(ctx, p, t.x, t.y);
    return;
  }
  p.gold -= cost;
  t.invested += cost;
  t.level++;
  emit(ctx, EventKind.TowerUpgraded, t.x, t.y, t.defId, t.level, p.idx);
}

function cmdBranch(ctx: Ctx, p: PlayerState, towerId: number, branch: number): void {
  const t = findTower(ctx.s, towerId);
  if (!t || t.owner !== p.idx || t.temp > 0) return;
  if (t.level !== 3 || t.branch !== 0) return;
  if (branch !== 1 && branch !== 2) return;
  const raw = upgradeCost(t.defId, 3);
  const cost = discountedCost(ctx, p, raw);
  if (p.gold < cost) {
    deny(ctx, p, t.x, t.y);
    return;
  }
  p.gold -= cost;
  t.invested += cost;
  t.branch = branch;
  t.level = 4;
  emit(ctx, EventKind.TowerUpgraded, t.x, t.y, t.defId, t.level, p.idx);
}

function cmdSell(ctx: Ctx, p: PlayerState, towerId: number): void {
  const s = ctx.s;
  const idx = s.towers.findIndex((t) => t.id === towerId);
  if (idx < 0) return;
  const t = s.towers[idx];
  if (t.owner !== p.idx || t.temp > 0) return;
  const refund = Math.floor((t.invested * 70) / 100);
  p.gold += refund;
  s.towers.splice(idx, 1);
  emit(ctx, EventKind.TowerSold, t.x, t.y, refund, 0, p.idx);
}

function cmdTargetMode(ctx: Ctx, p: PlayerState, towerId: number, mode: number): void {
  const t = findTower(ctx.s, towerId);
  if (!t || t.owner !== p.idx) return;
  if (mode < 0 || mode > 3) return;
  t.targetMode = mode;
}

function cmdMoveHero(p: PlayerState, x: Fx, y: Fx): void {
  if (!p.hero.alive) return;
  p.hero.mx = x;
  p.hero.my = y;
  p.hero.moving = true;
}

function cmdAbility(ctx: Ctx, p: PlayerState, x: Fx, y: Fx): void {
  const h = p.hero;
  if (!h.alive || h.abilityCd > 0) return;
  const d = heroDef(h.defId);
  const ab = d.ability;
  const power = ab.damage + ab.damagePerLevel * (h.level - 1);
  const heroDmgPct = ctx.mods[p.idx].heroDamagePct;
  const dmg = power + pct(power, heroDmgPct);

  let tx = x;
  let ty = y;
  if (ab.targeted) {
    // Clamp the cast to the ability's range so a bad tap cannot cheat distance.
    const dx = x - h.x;
    const dy = y - h.y;
    const len = fxNormalize(dx, dy, tmpVec);
    if (len > ab.castRange) {
      tx = h.x + fxMul(tmpVec.x, ab.castRange);
      ty = h.y + fxMul(tmpVec.y, ab.castRange);
    }
  } else {
    tx = h.x;
    ty = h.y;
  }

  switch (ab.kind) {
    case AbilityKind.ShieldSlam: {
      for (const e of ctx.s.enemies) {
        if (e.dead || e.flying) continue;
        if (fxDist2(e.x, e.y, h.x, h.y) > fxMul(ab.radius, ab.radius)) continue;
        dealDamage(ctx, e, dmg, DmgType.Physical, p.idx, 0);
        applyStun(e, ab.stunT);
      }
      emit(ctx, EventKind.HeroAbility, h.x, h.y, AbilityKind.ShieldSlam, ab.radius, p.idx);
      break;
    }
    case AbilityKind.ArrowStorm: {
      addGround(ctx, p.idx, GroundKind.ArrowStorm, tx, ty, ab.radius,
        dmg, DmgType.Physical, 0, ab.duration);
      emit(ctx, EventKind.HeroAbility, tx, ty, AbilityKind.ArrowStorm, ab.radius, p.idx);
      break;
    }
    case AbilityKind.Meteor: {
      spawnMeteor(ctx, p.idx, tx, ty, ab.radius, dmg, ab.duration, 46);
      emit(ctx, EventKind.HeroAbility, tx, ty, AbilityKind.Meteor, ab.radius, p.idx);
      break;
    }
    case AbilityKind.Sentry: {
      spawnSentry(ctx, p.idx, tx, ty, ab.duration);
      emit(ctx, EventKind.HeroAbility, tx, ty, AbilityKind.Sentry, ab.radius, p.idx);
      break;
    }
    default: break;
  }

  const cdCut = Math.min(60, ctx.mods[p.idx].abilityCdPct);
  h.abilityCd = Math.max(1, ab.cooldown - pct(ab.cooldown, cdCut));
}

function cmdUseItem(ctx: Ctx, p: PlayerState, slot: number, x: Fx, y: Fx): void {
  const s = ctx.s;
  if (slot < 0 || slot >= p.items.length) return;
  const inv = p.items[slot];
  if (inv.charges <= 0) return;
  const d = itemDef(inv.itemId);

  switch (d.kind) {
    case ItemKind.Meteor:
      spawnMeteor(ctx, p.idx, x, y, d.radius, d.damage, d.duration, d.groundDps);
      break;
    case ItemKind.FrostNova:
      for (const e of s.enemies) {
        if (e.dead) continue;
        dealDamage(ctx, e, d.damage, DmgType.Frost, p.idx, 0);
        applyStun(e, d.duration);
        applySlow(ctx, e, 60, d.duration + sec(1.5), p.idx);
      }
      emit(ctx, EventKind.Freeze, 0, 0, d.duration, 0, p.idx);
      break;
    case ItemKind.GoldCache:
      p.gold += d.value;
      p.goldEarned += d.value;
      emit(ctx, EventKind.GoldGain, p.hero.x, p.hero.y, d.value, 0, p.idx);
      break;
    case ItemKind.RepairKit:
      s.lives = Math.min(s.maxLives, s.lives + d.value);
      break;
    case ItemKind.TimeWarp:
      s.globalSlowPct = Math.max(s.globalSlowPct, d.slowPct);
      s.globalSlowT = Math.max(s.globalSlowT, d.duration);
      break;
    case ItemKind.TurretKit:
      spawnSentry(ctx, p.idx, x, y, d.duration);
      break;
    case ItemKind.Overload:
      s.overload[p.idx] = Math.max(s.overload[p.idx], d.duration);
      break;
    default: break;
  }

  inv.charges--;
  emit(ctx, EventKind.ItemUsed, x, y, d.id, inv.charges, p.idx);
  if (inv.charges <= 0) p.items.splice(slot, 1);
}

function cmdBuyShop(ctx: Ctx, p: PlayerState, slot: number): void {
  const s = ctx.s;
  if (slot < 0 || slot >= s.shop.length) return;
  const offer = s.shop[slot];
  const bit = 1 << p.idx;
  if ((offer.soldTo & bit) !== 0) return;
  if (p.gold < offer.cost) {
    deny(ctx, p, p.hero.x, p.hero.y);
    return;
  }

  if (offer.kind === 0) {
    const rd = relicDef(offer.id);
    const owned = p.relics.filter((r) => r === offer.id).length;
    if (owned >= rd.maxStacks) return;
    p.gold -= offer.cost;
    p.relics.push(offer.id);
    p.relics.sort((a, b) => a - b);
    if (rd.mods.livesBonus) {
      s.maxLives += rd.mods.livesBonus;
      s.lives += rd.mods.livesBonus;
    }
  } else {
    const d = itemDef(offer.id);
    const existing = p.items.find((i) => i.itemId === offer.id);
    if (!existing && p.items.length >= MAX_ITEM_SLOTS) return;
    p.gold -= offer.cost;
    if (existing) existing.charges += d.charges;
    else p.items.push({ itemId: offer.id, charges: d.charges });
  }

  offer.soldTo |= bit;
  emit(ctx, EventKind.Purchase, p.hero.x, p.hero.y, offer.kind, offer.id, p.idx);
}

function cellCenterFx(c: number): Fx {
  return c * FX_ONE + (FX_ONE >> 1);
}

// ============================================================== phase / waves

function savePrevious(s: GameState): void {
  for (const e of s.enemies) { e.px = e.x; e.py = e.y; }
  for (const p of s.projectiles) { p.px = p.x; p.py = p.y; }
  for (const pl of s.players) { pl.hero.px = pl.hero.x; pl.hero.py = pl.hero.y; }
}

function updateGlobalTimers(s: GameState): void {
  if (s.globalSlowT > 0) {
    s.globalSlowT--;
    if (s.globalSlowT === 0) s.globalSlowPct = 0;
  }
  for (let i = 0; i < s.overload.length; i++) {
    if (s.overload[i] > 0) s.overload[i]--;
  }
}

function updatePhase(ctx: Ctx): void {
  const s = ctx.s;
  if (s.phase === Phase.Build) {
    const everyoneReady = s.players.length > 0 && s.players.every((p) => p.ready);
    if (s.phaseTimer > 0) s.phaseTimer--;
    if (everyoneReady || s.phaseTimer <= 0) {
      // Calling the wave early pays a bounty for the seconds you skipped.
      if (everyoneReady && s.phaseTimer > 0) {
        const bonus = 4 + Math.floor(s.phaseTimer / TICK_RATE) * 5;
        for (const p of s.players) {
          p.gold += bonus;
          p.goldEarned += bonus;
        }
      }
      startWave(ctx);
    }
    return;
  }

  if (s.phase === Phase.Combat) {
    s.phaseTimer++;
    const cleared = s.spawns.length === 0 && !s.enemies.some((e) => !e.dead);
    if (cleared) {
      const reward = s.waveReward;
      for (const p of s.players) {
        p.gold += reward;
        p.goldEarned += reward;
        p.ready = false;
      }
      s.score += reward * 2 + s.wave * 25;
      s.bestWave = Math.max(s.bestWave, s.wave);
      s.phase = Phase.Build;
      s.phaseTimer = BUILD_PHASE_TICKS;
      refreshShop(s, s.wave + 1);
      emit(ctx, EventKind.WaveCleared, 0, 0, s.wave, reward, 0);
    }
  }
}

function startWave(ctx: Ctx): void {
  const s = ctx.s;
  s.wave++;
  for (const p of s.players) p.ready = false;

  const plan = generateWave(s.seed, s.wave, ctx.rt.lanes.length);
  s.waveMod = plan.mod;
  s.waveReward = plan.reward;
  s.spawns = plan.orders.map((o) => ({ ...o, at: o.at + s.tick }));
  s.phase = Phase.Combat;
  s.phaseTimer = 0;
  refreshShop(s, s.wave + 1);
  emit(ctx, EventKind.WaveStart, 0, 0, s.wave, plan.mod, plan.isBoss ? 1 : 0);
}

function spawnQueued(ctx: Ctx): void {
  const s = ctx.s;
  if (s.spawns.length === 0) return;
  let i = 0;
  while (i < s.spawns.length) {
    const o = s.spawns[i];
    if (o.at > s.tick) { i++; continue; }
    spawnEnemy(ctx, o.defId, o.lane, o.wave, o.hpPct, o.mod, o.boss);
    s.spawns.splice(i, 1);
  }
}

function spawnEnemy(
  ctx: Ctx, defId: number, lane: number, wave: number,
  hpPct: number, mod: number, boss: boolean,
): Enemy {
  const s = ctx.s;
  const d = enemyDef(defId);
  const laneIdx = lane % ctx.rt.lanes.length;
  const path = ctx.rt.lanes[laneIdx];
  const start = path.pts[0];

  const scaled = pct(hpPct, ctx.difficultyHpPct);
  const maxHp = Math.max(1, pct(d.hp, scaled));
  let shield = d.shield > 0 ? Math.max(1, pct(d.shield, scaled)) : 0;
  let armor = d.armor;
  if (mod === WaveMod.Armoured) armor += 5;
  if (mod === WaveMod.Shielded) shield += Math.floor(maxHp * 35 / 100);

  // A tiny deterministic lateral offset stops columns overlapping perfectly.
  const off = nextInt(s as RngHolder, 2000) - 1000;
  const off2 = nextInt(s as RngHolder, 2000) - 1000;

  const e: Enemy = {
    id: nextId(s),
    defId,
    lane: laneIdx,
    wp: 1,
    x: start.x, y: start.y, px: start.x, py: start.y,
    dx: 0, dy: fx(1),
    offX: Math.floor((off * FX_ONE) / 5000),
    offY: Math.floor((off2 * FX_ONE) / 5000),
    hp: maxHp,
    maxHp,
    shield,
    maxShield: shield,
    shieldCd: 0,
    armor,
    armorShred: 0,
    baseSpeed: d.speed,
    dist: 0,
    slowPct: 0,
    slowT: 0,
    stunT: 0,
    burnDps: 0, burnT: 0, burnOwner: 0,
    poisonDps: 0, poisonT: 0, poisonOwner: 0, poisonStacks: 0,
    plagueDps: 0,
    speedBonus: mod === WaveMod.Hasted ? 30 : 0,
    markT: 0, markPct: 0,
    abilityCd: d.abilityCd,
    spawnT: sec(0.4),
    bounty: d.bounty,
    xp: d.xp,
    flying: d.flying,
    boss: boss || d.boss,
    dead: false,
    wave,
    mod,
    regenAcc: 0,
    tint: d.tint,
    scale: d.scale,
    anim: 0,
  };
  s.enemies.push(e);
  if (e.boss) emit(ctx, EventKind.BossSpawn, e.x, e.y, defId, 0, 0);
  return e;
}

// ============================================================== enemies

function updateEnemyStatus(ctx: Ctx): void {
  const s = ctx.s;
  for (const e of s.enemies) {
    if (e.dead) continue;
    if (e.spawnT > 0) e.spawnT--;
    e.anim++;

    if (e.slowT > 0) { e.slowT--; if (e.slowT === 0) e.slowPct = 0; }
    if (e.stunT > 0) e.stunT--;
    if (e.markT > 0) { e.markT--; if (e.markT === 0) e.markPct = 0; }

    if (e.burnT > 0) {
      e.burnT--;
      const perTick = Math.max(1, Math.floor(e.burnDps / TICK_RATE));
      if (s.tick % 2 === 0) dealDamage(ctx, e, perTick * 2, DmgType.Fire, e.burnOwner, 0, true);
      if (e.burnT === 0) e.burnDps = 0;
    }
    if (e.dead) continue;

    if (e.poisonT > 0) {
      e.poisonT--;
      const perTick = Math.max(1, Math.floor(e.poisonDps / TICK_RATE));
      if (s.tick % 2 === 1) dealDamage(ctx, e, perTick * 2, DmgType.Poison, e.poisonOwner, 0, true);
      if (e.poisonT === 0) { e.poisonDps = 0; e.poisonStacks = 0; }
    }
    if (e.dead) continue;

    // Shield regeneration once the target has been left alone for a moment.
    if (e.shieldCd > 0) e.shieldCd--;
    const d = enemyDef(e.defId);
    if (d.shieldRegen > 0 && e.shieldCd === 0 && e.shield < e.maxShield) {
      e.shield = Math.min(e.maxShield, e.shield + Math.max(1, Math.floor(d.shieldRegen / TICK_RATE)));
    }

    if (e.mod === WaveMod.Regenerating && e.hp < e.maxHp) {
      e.regenAcc += Math.floor((e.maxHp * 15) / 1000);
      const heal = Math.floor(e.regenAcc / TICK_RATE);
      if (heal > 0) {
        e.regenAcc -= heal * TICK_RATE;
        e.hp = Math.min(e.maxHp, e.hp + heal);
      }
    }
  }
}

function effectiveSpeed(ctx: Ctx, e: Enemy): Fx {
  if (e.stunT > 0) return 0;
  const d = enemyDef(e.defId);
  let slow = e.slowPct;
  const global = ctx.s.globalSlowT > 0 ? ctx.s.globalSlowPct : 0;
  if (global > slow) slow = global;
  if (slow > 0 && d.ccResist > 0) slow = Math.max(0, slow - pct(slow, d.ccResist));
  slow = Math.min(85, slow);
  let speed = e.baseSpeed;
  if (e.speedBonus > 0) speed += pct(speed, e.speedBonus);
  if (slow > 0) speed -= pct(speed, slow);
  return Math.max(0, speed);
}

function moveEnemies(ctx: Ctx): void {
  const s = ctx.s;
  const rt = ctx.rt;
  for (const e of s.enemies) {
    if (e.dead) continue;
    const speed = effectiveSpeed(ctx, e);
    if (speed <= 0) continue;

    if (e.flying) {
      const len = fxNormalize(rt.coreX - e.x, rt.coreY - e.y, tmpVec);
      e.dx = tmpVec.x;
      e.dy = tmpVec.y;
      if (len <= CORE_REACH) { leak(ctx, e); continue; }
      const stepLen = Math.min(speed, len);
      e.x += fxMul(tmpVec.x, stepLen);
      e.y += fxMul(tmpVec.y, stepLen);
      e.dist += stepLen;
      continue;
    }

    const path = rt.lanes[e.lane];
    let remaining = speed;
    let guard = 0;
    while (remaining > 0 && guard++ < 4) {
      if (e.wp >= path.pts.length) { leak(ctx, e); break; }
      const wpt = path.pts[e.wp];
      const isLast = e.wp === path.pts.length - 1;
      const tx = wpt.x + (isLast ? 0 : e.offX);
      const ty = wpt.y + (isLast ? 0 : e.offY);
      const len = fxNormalize(tx - e.x, ty - e.y, tmpVec);
      if (len <= remaining) {
        e.x = tx;
        e.y = ty;
        e.dist += len;
        remaining -= len;
        e.wp++;
        if (e.wp >= path.pts.length) { leak(ctx, e); break; }
      } else {
        e.dx = tmpVec.x;
        e.dy = tmpVec.y;
        e.x += fxMul(tmpVec.x, remaining);
        e.y += fxMul(tmpVec.y, remaining);
        e.dist += remaining;
        remaining = 0;
      }
    }
  }
}

function leak(ctx: Ctx, e: Enemy): void {
  const s = ctx.s;
  const d = enemyDef(e.defId);
  e.dead = true;
  s.lives -= d.leak;
  s.leaked++;
  emit(ctx, EventKind.Leak, ctx.rt.coreX, ctx.rt.coreY, d.leak, e.defId, 0);
}

function enemyAbilities(ctx: Ctx): void {
  const s = ctx.s;
  for (const e of s.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = enemyDef(e.defId);
    if (d.ability === EnemyAbility.None) continue;

    if (d.ability === EnemyAbility.Split) continue; // handled on death

    if (d.ability === EnemyAbility.Enrage) {
      if (e.abilityCd > 0) { e.abilityCd--; continue; }
      const missingPct = 100 - Math.floor((e.hp * 100) / Math.max(1, e.maxHp));
      e.speedBonus = Math.min(80, Math.floor((missingPct * d.abilityPower) / 100));
      e.abilityCd = d.abilityCd;
      continue;
    }

    if (e.abilityCd > 0) { e.abilityCd--; continue; }
    e.abilityCd = d.abilityCd;

    if (d.ability === EnemyAbility.Heal) {
      const r2 = fxMul(fx(2.5), fx(2.5));
      for (const o of s.enemies) {
        if (o.dead || o === e) continue;
        if (fxDist2(o.x, o.y, e.x, e.y) > r2) continue;
        o.hp = Math.min(o.maxHp, o.hp + d.abilityPower);
      }
      emit(ctx, EventKind.HeroAbility, e.x, e.y, -2, 0, 0);
    } else if (d.ability === EnemyAbility.Summon) {
      for (let i = 0; i < d.abilityPower; i++) {
        const spawn = spawnEnemy(ctx, ENEMY.Skeleton, e.lane, e.wave,
          Math.max(60, Math.floor(e.maxHp * 8 / 100)), WaveMod.None, false);
        spawn.x = e.x;
        spawn.y = e.y;
        spawn.px = e.x;
        spawn.py = e.y;
        spawn.wp = e.wp;
        spawn.dist = e.dist;
        spawn.flying = false;
      }
    } else if (d.ability === EnemyAbility.ShieldAllies) {
      const r2 = fxMul(fx(3.5), fx(3.5));
      for (const o of s.enemies) {
        if (o.dead || o === e) continue;
        if (fxDist2(o.x, o.y, e.x, e.y) > r2) continue;
        o.maxShield = Math.max(o.maxShield, d.abilityPower);
        o.shield = Math.min(o.maxShield, o.shield + d.abilityPower);
      }
    }
  }
}

// ============================================================== damage

function applySlow(ctx: Ctx, e: Enemy, slowPct: number, ticks: number, owner: number): void {
  if (slowPct <= 0 || ticks <= 0) return;
  const bonus = ctx.mods[owner]?.slowPct ?? 0;
  const strength = slowPct + pct(slowPct, bonus);
  const dur = ticks + pct(ticks, bonus);
  if (strength >= e.slowPct) {
    e.slowPct = strength;
    e.slowT = Math.max(e.slowT, dur);
  } else {
    e.slowT = Math.max(e.slowT, Math.floor(dur / 2));
  }
}

function applyStun(e: Enemy, ticks: number): void {
  if (ticks <= 0) return;
  const d = enemyDef(e.defId);
  let t = ticks;
  if (d.ccResist > 0) t = Math.max(1, t - pct(t, d.ccResist));
  e.stunT = Math.max(e.stunT, t);
}

function applyBurn(ctx: Ctx, e: Enemy, dps: number, ticks: number, owner: number): void {
  if (dps <= 0 || ticks <= 0) return;
  const boost = ctx.mods[owner]?.dotPct ?? 0;
  const v = dps + pct(dps, boost);
  if (v >= e.burnDps) { e.burnDps = v; e.burnOwner = owner; }
  e.burnT = Math.max(e.burnT, ticks);
}

function applyPoison(ctx: Ctx, e: Enemy, dps: number, ticks: number, owner: number, plague: number): void {
  if (dps <= 0 || ticks <= 0) return;
  const boost = ctx.mods[owner]?.dotPct ?? 0;
  const v = dps + pct(dps, boost);
  // Poison stacks up to 5 times, each stack adding 40% of the base tick.
  if (e.poisonOwner === owner && e.poisonT > 0 && e.poisonStacks < 5) {
    e.poisonStacks++;
    e.poisonDps = Math.max(e.poisonDps, v) + pct(v, 40);
  } else if (v >= e.poisonDps || e.poisonT === 0) {
    e.poisonDps = v;
    e.poisonStacks = 1;
    e.poisonOwner = owner;
  }
  e.poisonT = Math.max(e.poisonT, ticks);
  if (plague > 0) e.plagueDps = Math.max(e.plagueDps, plague + pct(plague, boost));
}

/**
 * The single funnel through which every point of damage passes.
 * Returns the amount actually removed from health.
 */
function dealDamage(
  ctx: Ctx, e: Enemy, rawAmount: number, dmgType: number,
  owner: number, shieldBreakPct: number, silent = false,
): number {
  if (e.dead || rawAmount <= 0) return 0;
  const d = enemyDef(e.defId);

  let amount = rawAmount;

  // Resistances (negative resist = extra damage taken).
  const resist = d.resist[dmgType] ?? 0;
  if (resist !== 0) amount -= pct(amount, resist);

  // Vulnerability mark (Permafrost).
  if (e.markT > 0 && e.markPct > 0) amount += pct(amount, e.markPct);

  // Armour only blunts physical hits; poison and true damage bypass it.
  if (dmgType === DmgType.Physical) {
    const eff = Math.max(0, e.armor - e.armorShred);
    amount -= eff;
  }
  if (amount < 1) amount = 1;

  let dealt = 0;

  if (e.shield > 0 && dmgType !== DmgType.True) {
    let toShield = amount;
    if (shieldBreakPct > 0) toShield += pct(amount, shieldBreakPct);
    if (toShield >= e.shield) {
      const overflow = amount - e.shield;
      e.shield = 0;
      amount = Math.max(0, overflow);
    } else {
      e.shield -= toShield;
      amount = 0;
    }
    e.shieldCd = sec(3);
  }

  if (amount > 0) {
    dealt = Math.min(e.hp, amount);
    e.hp -= amount;
  }

  const p = ctx.s.players[owner];
  if (p) p.damage += dealt;

  if (!silent && dealt > 0) {
    emit(ctx, EventKind.Hit, e.x, e.y, dealt, dmgType, owner);
  }

  if (e.hp <= 0) killEnemy(ctx, e, owner);
  return dealt;
}

function killEnemy(ctx: Ctx, e: Enemy, owner: number): void {
  if (e.dead) return;
  const s = ctx.s;
  e.dead = true;
  e.hp = 0;
  s.killCount++;

  const d = enemyDef(e.defId);
  const p = s.players[owner];
  if (p) {
    const hd = heroDef(p.hero.defId);
    const goldPct = ctx.mods[owner].goldPct + hd.goldPct;
    const base = pct(e.bounty, ctx.difficultyGoldPct);
    const gold = base + pct(base, goldPct);
    p.gold += gold;
    p.goldEarned += gold;
    p.kills++;
    s.score += e.bounty * 3;
    emit(ctx, EventKind.GoldGain, e.x, e.y, gold, 0, owner);
  }

  // Shared XP keeps both heroes relevant, with a bonus for the killer.
  for (const pl of s.players) {
    const gain = pl.idx === owner ? e.xp : Math.max(1, pct(e.xp, 60));
    grantXp(ctx, pl, gain);
  }

  emit(ctx, EventKind.EnemyDeath, e.x, e.y, e.defId, e.boss ? 1 : 0, owner);

  if (e.plagueDps > 0) {
    addGround(ctx, e.poisonOwner, GroundKind.PoisonCloud, e.x, e.y,
      fx(1.3), e.plagueDps, DmgType.Poison, 0, sec(4));
  }

  if (d.ability === EnemyAbility.Split) {
    for (let i = 0; i < d.abilityPower; i++) {
      const sp = spawnEnemy(ctx, ENEMY.Skeleton, e.lane, e.wave,
        Math.max(80, Math.floor((e.maxHp * 25) / 100)), e.mod, false);
      sp.x = e.x + (i === 0 ? fx(0.25) : fx(-0.25));
      sp.y = e.y;
      sp.px = sp.x;
      sp.py = sp.y;
      sp.wp = e.wp;
      sp.dist = e.dist;
      sp.spawnT = 0;
    }
  }
}

function grantXp(ctx: Ctx, p: PlayerState, amount: number): void {
  const h = p.hero;
  if (h.level >= MAX_HERO_LEVEL) return;
  h.xp += amount;
  const lvl = heroLevelForXp(h.xp);
  if (lvl > h.level) {
    const d = heroDef(h.defId);
    const gained = lvl - h.level;
    h.level = lvl;
    const bonusHp = d.hpPerLevel * gained;
    h.maxHp += bonusHp;
    h.hp = Math.min(h.maxHp, h.hp + bonusHp);
    emit(ctx, EventKind.HeroLevel, h.x, h.y, h.level, 0, p.idx);
  }
}

// ============================================================== towers

const statsCache = new Map<number, TowerStats>();

function cachedStats(defId: number, branch: number, level: number): TowerStats {
  const key = defId * 100 + branch * 10 + level;
  let st = statsCache.get(key);
  if (!st) {
    st = computeTowerStats(defId, branch, level);
    statsCache.set(key, st);
  }
  return st;
}

function computeAuras(ctx: Ctx): void {
  const s = ctx.s;
  const n = s.towers.length;
  ctx.auraDmg = new Array<number>(n).fill(0);
  ctx.auraRange = new Array<number>(n).fill(0);
  ctx.auraRate = new Array<number>(n).fill(0);
  ctx.auraCrit = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i++) {
    const src = s.towers[i];
    const st = cachedStats(src.defId, src.branch, src.level);
    if (!st.isSupport) continue;
    const r2 = fxMul(st.range, st.range);
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dst = s.towers[j];
      if (fxDist2(dst.x, dst.y, src.x, src.y) > r2) continue;
      ctx.auraDmg[j] += st.auraDamagePct;
      ctx.auraRange[j] += st.auraRangePct;
      ctx.auraRate[j] += st.auraRatePct;
      ctx.auraCrit[j] += st.auraCritPct;
    }
  }

  // The Tinkerer's workshop passive behaves like a mobile support tower.
  for (const p of s.players) {
    const hd = heroDef(p.hero.defId);
    if (hd.towerRatePct <= 0 || !p.hero.alive) continue;
    const r2 = fxMul(hd.towerAuraRadius, hd.towerAuraRadius);
    for (let j = 0; j < n; j++) {
      if (fxDist2(s.towers[j].x, s.towers[j].y, p.hero.x, p.hero.y) > r2) continue;
      ctx.auraRate[j] += hd.towerRatePct;
    }
  }
}

/** Base stats plus relic, aura and overload modifiers, as an owned copy. */
function effStats(ctx: Ctx, t: Tower, index: number): TowerStats {
  const st = { ...cachedStats(t.defId, t.branch, t.level) };
  const m = ctx.mods[t.owner] ?? emptyMods();

  let dmgPct = m.damagePct + (ctx.auraDmg[index] ?? 0);
  let rangePct = m.rangePct + (ctx.auraRange[index] ?? 0);
  let ratePct = m.ratePct + (ctx.auraRate[index] ?? 0);
  if (ctx.s.overload[t.owner] > 0) ratePct += 80;

  if (dmgPct !== 0) {
    st.damage += pct(st.damage, dmgPct);
    st.burnDps += pct(st.burnDps, dmgPct);
    st.poisonDps += pct(st.poisonDps, dmgPct);
    st.groundDps += pct(st.groundDps, dmgPct);
  }
  if (m.dotPct !== 0) {
    // DoT relic is applied where the DoT is inflicted; nothing to do here.
  }
  if (rangePct !== 0) st.range += pct(st.range, rangePct);
  if (ratePct !== 0) st.cooldown = Math.max(1, Math.floor((st.cooldown * 100) / (100 + ratePct)));
  if (m.splashPct !== 0 && st.splash > 0) st.splash += pct(st.splash, m.splashPct);
  st.critPct += m.critPct + (ctx.auraCrit[index] ?? 0);
  if (st.chains > 0) st.chains += m.chainBonus;
  if (st.executePct > 0) st.executePct += m.executeBonus;
  return st;
}

function updateTowers(ctx: Ctx): void {
  const s = ctx.s;
  for (let i = 0; i < s.towers.length; i++) {
    const t = s.towers[i];
    if (t.fireAnim > 0) t.fireAnim--;
    if (t.pulse > 0) t.pulse--;
    if (t.temp > 0) {
      t.temp--;
      if (t.temp === 0) continue;
    }
    if (t.cd > 0) t.cd--;

    const st = effStats(ctx, t, i);

    if (st.isSupport) {
      if (st.income > 0 && s.tick % TICK_RATE === 0) {
        const p = s.players[t.owner];
        if (p) {
          p.gold += st.income;
          p.goldEarned += st.income;
        }
      }
      continue;
    }

    if (t.cd > 0) {
      // Inferno's ramp decays whenever it is not shooting.
      if (st.ramp > 0 && t.charge > 0 && s.tick % 6 === 0) t.charge = Math.max(0, t.charge - 1);
      continue;
    }

    if (st.pulse) {
      firePulse(ctx, t, st);
      continue;
    }

    const shots = Math.max(1, st.multiShot);
    const targets: Enemy[] = [];
    for (let k = 0; k < shots; k++) {
      const tgt = acquireTarget(ctx, t, st, targets);
      if (!tgt) break;
      targets.push(tgt);
    }
    if (targets.length === 0) {
      if (st.ramp > 0 && t.charge > 0 && s.tick % 6 === 0) t.charge = Math.max(0, t.charge - 1);
      continue;
    }

    faceTarget(t, targets[0]);
    t.cd = st.cooldown;
    t.fireAnim = Math.min(8, st.cooldown);
    if (st.ramp > 0) t.charge = Math.min(100, t.charge + 2);

    for (const tgt of targets) fireAt(ctx, t, st, tgt, i);
    emit(ctx, EventKind.Shot, t.x, t.y, t.defId, st.projKind, t.owner, targets[0].x, targets[0].y);
  }
}

function faceTarget(t: Tower, e: Enemy): void {
  fxNormalize(e.x - t.x, e.y - t.y, tmpVec);
  if (tmpVec.x !== 0 || tmpVec.y !== 0) {
    t.dx = tmpVec.x;
    t.dy = tmpVec.y;
  }
}

function acquireTarget(ctx: Ctx, t: Tower, st: TowerStats, exclude: readonly Enemy[]): Enemy | null {
  const s = ctx.s;
  const r2 = fxMul(st.range, st.range);
  let best: Enemy | null = null;
  let bestScore = 0;

  for (const e of s.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (e.flying && !st.targetsAir) continue;
    if (!e.flying && !st.targetsGround) continue;
    if (exclude.includes(e)) continue;
    const d2 = fxDist2(e.x, e.y, t.x, t.y);
    if (d2 > r2) continue;

    let score: number;
    switch (t.targetMode) {
      case TargetMode.Last: score = -e.dist; break;
      case TargetMode.Strongest: score = e.hp + e.shield; break;
      case TargetMode.Closest: score = -d2; break;
      case TargetMode.First:
      default: score = e.dist; break;
    }

    if (best === null || score > bestScore || (score === bestScore && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

function rollCrit(ctx: Ctx, st: TowerStats, damage: number): number {
  if (st.critPct <= 0) return damage;
  if (!chance(ctx.s as RngHolder, Math.min(100, st.critPct))) return damage;
  return Math.floor((damage * st.critMult) / 100);
}

function firePulse(ctx: Ctx, t: Tower, st: TowerStats): void {
  const s = ctx.s;
  const r2 = fxMul(st.splash, st.splash);
  let hitAny = false;
  for (const e of s.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (e.flying && !st.targetsAir) continue;
    if (fxDist2(e.x, e.y, t.x, t.y) > r2) continue;
    hitAny = true;
    dealDamage(ctx, e, rollCrit(ctx, st, st.damage), st.dmgType, t.owner, st.shieldBreak);
    if (e.dead) continue;
    applySlow(ctx, e, st.slowPct, st.slowT, t.owner);
    if (st.stunT > 0 && !e.boss) applyStun(e, st.stunT);
    if (st.markPct > 0) {
      e.markPct = Math.max(e.markPct, st.markPct);
      e.markT = Math.max(e.markT, st.markT);
    }
  }
  t.cd = st.cooldown;
  t.pulse = 10;
  if (hitAny) emit(ctx, EventKind.Shot, t.x, t.y, t.defId, ProjKind.Shard, t.owner, t.x, t.y);
}

function fireAt(ctx: Ctx, t: Tower, st: TowerStats, target: Enemy, index: number): void {
  void index;
  let damage = st.damage;
  if (st.ramp > 0) damage += pct(damage, Math.floor((t.charge * st.ramp) / 100));
  damage = rollCrit(ctx, st, damage);

  // Chain weapons resolve instantly - there is no travelling bolt to argue about.
  if (st.chains > 0) {
    fireChain(ctx, t, st, target, damage);
    return;
  }

  if (st.projSpeed <= 0) {
    resolveHit(ctx, t.owner, t.id, st, target, damage, target.x, target.y);
    return;
  }

  const p = makeProjectile(ctx, t.owner, t.id, st, t.x, t.y, damage);
  p.targetId = target.id;
  p.tx = target.x;
  p.ty = target.y;
  fxNormalize(target.x - t.x, target.y - t.y, tmpVec);
  p.vx = fxMul(tmpVec.x, st.projSpeed);
  p.vy = fxMul(tmpVec.y, st.projSpeed);
  if (st.pierce > 0) {
    p.homing = false;
    p.pierce = st.pierce;
    const reach = st.range + fx(1);
    p.life = Math.max(1, Math.floor(fxDiv(reach, st.projSpeed) / FX_ONE) + 1);
  }
  ctx.s.projectiles.push(p);
}

function makeProjectile(
  ctx: Ctx, owner: number, towerId: number, st: TowerStats,
  x: Fx, y: Fx, damage: number,
): Projectile {
  return {
    id: nextId(ctx.s),
    owner,
    towerId,
    kind: st.projKind,
    x, y, px: x, py: y,
    vx: 0, vy: 0,
    tx: x, ty: y,
    targetId: 0,
    speed: st.projSpeed,
    damage,
    dmgType: st.dmgType,
    splash: st.splash,
    life: sec(4),
    homing: true,
    arcing: st.arcing,
    pierce: 0,
    hits: [],
    slowPct: st.slowPct,
    slowT: st.slowT,
    burnDps: st.burnDps,
    burnT: st.burnT,
    poisonDps: st.poisonDps,
    poisonT: st.poisonT,
    stunT: st.stunT,
    chains: 0,
    chainRange: st.chainRange,
    armorShred: st.armorShred,
    groundKind: st.groundKind,
    groundRadius: st.groundRadius,
    groundLife: st.groundLife,
    scale: FX_ONE,
  };
}

function fireChain(ctx: Ctx, t: Tower, st: TowerStats, first: Enemy, damage: number): void {
  const hit: number[] = [];
  let current = first;
  let dmg = damage;
  let fromX = t.x;
  let fromY = t.y;
  const chainR2 = fxMul(st.chainRange, st.chainRange);

  for (let jump = 0; jump <= st.chains; jump++) {
    hit.push(current.id);
    emit(ctx, EventKind.Chain, fromX, fromY, jump, 0, t.owner, current.x, current.y);
    resolveHit(ctx, t.owner, t.id, st, current, dmg, current.x, current.y);
    fromX = current.x;
    fromY = current.y;
    if (st.chainFalloff > 0) dmg = Math.max(1, dmg - pct(dmg, st.chainFalloff));

    let next: Enemy | null = null;
    let bestD2 = chainR2;
    for (const e of ctx.s.enemies) {
      if (e.dead || e.spawnT > 0 || hit.includes(e.id)) continue;
      if (e.flying && !st.targetsAir) continue;
      const d2 = fxDist2(e.x, e.y, fromX, fromY);
      if (d2 <= bestD2 && (next === null || d2 < bestD2 || e.id < next.id)) {
        next = e;
        bestD2 = d2;
      }
    }
    if (!next) break;
    current = next;
  }
}

/** Applies one weapon's full effect payload to a single enemy (plus splash). */
function resolveHit(
  ctx: Ctx, owner: number, towerId: number, st: TowerStats,
  target: Enemy | null, damage: number, x: Fx, y: Fx,
): void {
  void towerId;
  if (st.splash > 0) {
    const r2 = fxMul(st.splash, st.splash);
    for (const e of ctx.s.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (e.flying && !st.targetsAir) continue;
      if (!e.flying && !st.targetsGround) continue;
      const d2 = fxDist2(e.x, e.y, x, y);
      if (d2 > r2) continue;
      // Full damage at the centre, 45% at the rim.
      const falloff = e === target ? 100 : 100 - Math.floor((55 * d2) / Math.max(1, r2));
      applyPayload(ctx, e, st, owner, Math.max(1, pct(damage, falloff)));
    }
    emit(ctx, EventKind.Explosion, x, y, st.splash, st.dmgType, owner);
  } else if (target && !target.dead) {
    applyPayload(ctx, target, st, owner, damage);
  }

  if (st.groundKind !== GroundKind.None && st.groundRadius > 0) {
    addGround(ctx, owner, st.groundKind, x, y, st.groundRadius,
      st.groundDps, st.dmgType, st.slowPct, st.groundLife);
  }
}

function applyPayload(ctx: Ctx, e: Enemy, st: TowerStats, owner: number, damage: number): void {
  let dmg = damage;
  if (st.executePct > 0 && !e.boss) {
    const threshold = Math.floor((e.maxHp * st.executePct) / 100);
    if (e.hp <= threshold) dmg = e.hp + e.shield + 1;
  }
  if (st.armorShred > 0) e.armorShred = Math.min(e.armor, e.armorShred + st.armorShred);
  dealDamage(ctx, e, dmg, st.dmgType, owner, st.shieldBreak);
  if (e.dead) return;
  applySlow(ctx, e, st.slowPct, st.slowT, owner);
  if (st.stunT > 0 && !e.boss) applyStun(e, st.stunT);
  applyBurn(ctx, e, st.burnDps, st.burnT, owner);
  applyPoison(ctx, e, st.poisonDps, st.poisonT, owner,
    st.groundKind === GroundKind.PoisonCloud ? st.groundDps : 0);
  if (st.markPct > 0) {
    e.markPct = Math.max(e.markPct, st.markPct);
    e.markT = Math.max(e.markT, st.markT);
  }
}

// ============================================================== projectiles

function updateProjectiles(ctx: Ctx): void {
  const s = ctx.s;
  for (const p of s.projectiles) {
    if (p.life <= 0) continue;
    p.life--;

    if (p.pierce > 0) {
      p.x += p.vx;
      p.y += p.vy;
      const r2 = fxMul(HIT_RADIUS + fx(0.2), HIT_RADIUS + fx(0.2));
      for (const e of s.enemies) {
        if (e.dead || e.spawnT > 0 || p.hits.includes(e.id)) continue;
        if (fxSegDist2(e.x, e.y, p.px, p.py, p.x, p.y) > r2) continue;
        p.hits.push(e.id);
        detonate(ctx, p, e, e.x, e.y);
        p.pierce--;
        if (p.pierce <= 0) { p.life = 0; break; }
      }
      continue;
    }

    let tx = p.tx;
    let ty = p.ty;
    if (p.homing && p.targetId !== 0) {
      const tgt = findEnemy(s, p.targetId);
      if (tgt && !tgt.dead) {
        tx = tgt.x;
        ty = tgt.y;
        p.tx = tx;
        p.ty = ty;
      } else {
        p.targetId = 0;
      }
    }

    const len = fxNormalize(tx - p.x, ty - p.y, tmpVec);
    if (len <= p.speed) {
      p.x = tx;
      p.y = ty;
      const tgt = p.targetId !== 0 ? findEnemy(s, p.targetId) : null;
      detonate(ctx, p, tgt && !tgt.dead ? tgt : null, tx, ty);
      p.life = 0;
      continue;
    }
    p.vx = fxMul(tmpVec.x, p.speed);
    p.vy = fxMul(tmpVec.y, p.speed);
    p.x += p.vx;
    p.y += p.vy;
    if (p.life <= 0) detonate(ctx, p, null, p.x, p.y);
  }
}

/** A projectile carries its own copy of the payload it was fired with. */
function projectileStats(p: Projectile): TowerStats {
  return {
    damage: p.damage,
    cooldown: 1,
    range: 0,
    splash: p.splash,
    dmgType: p.dmgType,
    targetsAir: true,
    targetsGround: true,
    projSpeed: p.speed,
    projKind: p.kind,
    arcing: p.arcing,
    pierce: 0,
    multiShot: 1,
    chains: 0,
    chainRange: 0,
    chainFalloff: 0,
    slowPct: p.slowPct,
    slowT: p.slowT,
    burnDps: p.burnDps,
    burnT: p.burnT,
    poisonDps: p.poisonDps,
    poisonT: p.poisonT,
    stunT: p.stunT,
    critPct: 0,
    critMult: 200,
    executePct: 0,
    armorShred: p.armorShred,
    markPct: 0,
    markT: 0,
    shieldBreak: 0,
    groundKind: p.groundKind,
    groundRadius: p.groundRadius,
    groundLife: p.groundLife,
    groundDps: Math.max(1, Math.floor(p.damage / 6)),
    pulse: false,
    ramp: 0,
    isSupport: false,
    auraDamagePct: 0,
    auraRangePct: 0,
    auraRatePct: 0,
    auraCritPct: 0,
    income: 0,
  };
}

function detonate(ctx: Ctx, p: Projectile, target: Enemy | null, x: Fx, y: Fx): void {
  const st = projectileStats(p);
  resolveHit(ctx, p.owner, p.towerId, st, target, p.damage, x, y);
  if (p.splash > 0 || p.kind === ProjKind.Meteor) {
    emit(ctx, EventKind.Explosion, x, y, p.splash, p.dmgType, p.owner);
  }
}

function spawnMeteor(
  ctx: Ctx, owner: number, x: Fx, y: Fx, radius: Fx,
  damage: number, groundLife: number, groundDps: number,
): void {
  const p: Projectile = {
    id: nextId(ctx.s),
    owner,
    towerId: 0,
    kind: ProjKind.Meteor,
    x: x + fx(2.2), y: y - fx(5.0),
    px: x + fx(2.2), py: y - fx(5.0),
    vx: 0, vy: 0,
    tx: x, ty: y,
    targetId: 0,
    speed: fx(0.55),
    damage,
    dmgType: DmgType.Fire,
    splash: radius,
    life: sec(3),
    homing: false,
    arcing: false,
    pierce: 0,
    hits: [],
    slowPct: 0, slowT: 0,
    burnDps: 0, burnT: 0,
    poisonDps: 0, poisonT: 0,
    stunT: 0,
    chains: 0, chainRange: 0,
    armorShred: 0,
    groundKind: groundDps > 0 ? GroundKind.Napalm : GroundKind.None,
    groundRadius: radius,
    groundLife,
    scale: fx(1.8),
  };
  ctx.s.projectiles.push(p);
}

function spawnSentry(ctx: Ctx, owner: number, x: Fx, y: Fx, duration: number): void {
  const s = ctx.s;
  const cx = Math.floor(x / FX_ONE);
  const cy = Math.floor(y / FX_ONE);
  const t: Tower = {
    id: nextId(s),
    owner,
    defId: TOWER.Guard,
    branch: 2,
    level: 4,
    cx, cy,
    x: cellCenterFx(cx),
    y: cellCenterFx(cy),
    dx: 0, dy: fx(-1),
    cd: 0,
    targetMode: TargetMode.First,
    targetId: 0,
    invested: 0,
    charge: 0,
    temp: duration,
    kills: 0,
    damageDealt: 0,
    fireAnim: 0,
    pulse: 0,
  };
  s.towers.push(t);
  emit(ctx, EventKind.TowerBuilt, t.x, t.y, TOWER.Guard, 1, owner);
}

// ============================================================== ground effects

function addGround(
  ctx: Ctx, owner: number, kind: number, x: Fx, y: Fx, radius: Fx,
  dps: number, dmgType: number, slowPct: number, life: number,
): void {
  if (life <= 0 || radius <= 0) return;
  const boost = ctx.mods[owner]?.dotPct ?? 0;
  const g: GroundEffect = {
    id: nextId(ctx.s),
    owner,
    kind,
    x, y,
    radius,
    dps: dps + pct(dps, boost),
    dmgType,
    slowPct,
    life,
    maxLife: life,
    acc: 0,
  };
  ctx.s.grounds.push(g);
}

function updateGrounds(ctx: Ctx): void {
  const s = ctx.s;
  for (const g of s.grounds) {
    if (g.life <= 0) continue;
    g.life--;
    g.acc++;
    if (g.acc < GROUND_TICK) continue;
    g.acc = 0;

    const damage = Math.max(1, Math.floor(g.dps / 4));
    const r2 = fxMul(g.radius, g.radius);
    for (const e of s.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (e.flying && g.kind !== GroundKind.ArrowStorm) continue;
      if (fxDist2(e.x, e.y, g.x, g.y) > r2) continue;
      dealDamage(ctx, e, damage, g.dmgType, g.owner, 0, true);
      if (!e.dead && g.slowPct > 0) applySlow(ctx, e, g.slowPct, sec(0.8), g.owner);
    }
  }
}

// ============================================================== heroes

function updateHeroes(ctx: Ctx): void {
  const s = ctx.s;
  for (const p of s.players) {
    const h = p.hero;
    const d = heroDef(h.defId);
    const m = ctx.mods[p.idx];

    if (h.abilityCd > 0) h.abilityCd--;

    if (!h.alive) {
      if (h.respawn > 0) h.respawn--;
      if (h.respawn <= 0) {
        h.alive = true;
        h.x = ctx.rt.coreX;
        h.y = ctx.rt.coreY - fx(1.5);
        h.px = h.x;
        h.py = h.y;
        h.mx = h.x;
        h.my = h.y;
        h.moving = false;
        h.maxHp = d.hp + d.hpPerLevel * (h.level - 1) + pct(d.hp, m.heroHpPct);
        h.hp = h.maxHp;
      }
      continue;
    }

    h.anim++;
    h.maxHp = d.hp + d.hpPerLevel * (h.level - 1) + pct(d.hp, m.heroHpPct);

    // Regeneration
    h.regenAcc += d.regen;
    const heal = Math.floor(h.regenAcc / TICK_RATE);
    if (heal > 0) {
      h.regenAcc -= heal * TICK_RATE;
      h.hp = Math.min(h.maxHp, h.hp + heal);
    }

    // Movement
    if (h.moving) {
      const len = fxNormalize(h.mx - h.x, h.my - h.y, tmpVec);
      if (len <= d.moveSpeed) {
        h.x = h.mx;
        h.y = h.my;
        h.moving = false;
      } else {
        h.dx = tmpVec.x;
        h.dy = tmpVec.y;
        h.x += fxMul(tmpVec.x, d.moveSpeed);
        h.y += fxMul(tmpVec.y, d.moveSpeed);
      }
      clampToMap(ctx, h);
    }

    // Contact damage from ground enemies standing on the hero.
    const contactR2 = fxMul(CONTACT_RANGE, CONTACT_RANGE);
    for (const e of s.enemies) {
      if (e.dead || e.flying || e.spawnT > 0 || e.stunT > 0) continue;
      if (fxDist2(e.x, e.y, h.x, h.y) > contactR2) continue;
      const ed = enemyDef(e.defId);
      const dps = Math.min(70, Math.max(3, Math.floor(ed.hp / 9)));
      const perTick = Math.max(1, Math.floor(dps / TICK_RATE));
      h.hp -= perTick;
    }

    if (h.hp <= 0) {
      h.alive = false;
      h.hp = 0;
      h.moving = false;
      h.respawn = d.respawn;
      emit(ctx, EventKind.HeroDeath, h.x, h.y, 0, 0, p.idx);
      continue;
    }

    // Slow aura passive
    if (d.auraSlowPct > 0) {
      const r2 = fxMul(d.auraSlowRadius, d.auraSlowRadius);
      for (const e of s.enemies) {
        if (e.dead || e.flying) continue;
        if (fxDist2(e.x, e.y, h.x, h.y) > r2) continue;
        applySlow(ctx, e, d.auraSlowPct, sec(0.5), p.idx);
      }
    }

    // Auto attack
    if (h.attackCd > 0) { h.attackCd--; continue; }
    const target = heroTarget(ctx, h, d.range);
    if (!target) continue;

    fxNormalize(target.x - h.x, target.y - h.y, tmpVec);
    h.dx = tmpVec.x;
    h.dy = tmpVec.y;
    h.targetId = target.id;
    h.attackCd = d.attackCd;

    let damage = d.damage + d.damagePerLevel * (h.level - 1);
    damage += pct(damage, m.heroDamagePct);
    const critPct = d.critPct + m.critPct;
    if (critPct > 0 && chance(s as RngHolder, Math.min(100, critPct))) {
      damage = Math.floor((damage * d.critMult) / 100);
    }

    const st = heroAttackStats(d, damage);
    if (d.projSpeed <= 0) {
      resolveHit(ctx, p.idx, 0, st, target, damage, target.x, target.y);
      emit(ctx, EventKind.Shot, h.x, h.y, -1, d.projKind, p.idx, target.x, target.y);
    } else {
      const proj = makeProjectile(ctx, p.idx, 0, st, h.x, h.y, damage);
      proj.targetId = target.id;
      proj.tx = target.x;
      proj.ty = target.y;
      s.projectiles.push(proj);
      emit(ctx, EventKind.Shot, h.x, h.y, -1, d.projKind, p.idx, target.x, target.y);
    }
  }
}

function heroAttackStats(d: ReturnType<typeof heroDef>, damage: number): TowerStats {
  return {
    damage,
    cooldown: d.attackCd,
    range: d.range,
    splash: d.splash,
    dmgType: d.dmgType,
    targetsAir: true,
    targetsGround: true,
    projSpeed: d.projSpeed,
    projKind: d.projKind,
    arcing: false,
    pierce: 0,
    multiShot: 1,
    chains: 0,
    chainRange: 0,
    chainFalloff: 0,
    slowPct: 0,
    slowT: 0,
    burnDps: d.burnDps,
    burnT: d.burnT,
    poisonDps: 0,
    poisonT: 0,
    stunT: 0,
    critPct: 0,
    critMult: d.critMult,
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
}

function heroTarget(ctx: Ctx, h: GameState['players'][number]['hero'], range: Fx): Enemy | null {
  const r2 = fxMul(range, range);
  let best: Enemy | null = null;
  let bestD2 = 0;
  for (const e of ctx.s.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d2 = fxDist2(e.x, e.y, h.x, h.y);
    if (d2 > r2) continue;
    if (best === null || d2 < bestD2 || (d2 === bestD2 && e.id < best.id)) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

function clampToMap(ctx: Ctx, h: GameState['players'][number]['hero']): void {
  const { w, h: mh } = ctx.rt.def;
  const lo = fx(0.4);
  const hiX = w * FX_ONE - lo;
  const hiY = mh * FX_ONE - lo;
  if (h.x < lo) h.x = lo;
  if (h.y < lo) h.y = lo;
  if (h.x > hiX) h.x = hiX;
  if (h.y > hiY) h.y = hiY;
}

// ============================================================== cleanup

function reap(ctx: Ctx): void {
  const s = ctx.s;
  if (s.enemies.some((e) => e.dead)) s.enemies = s.enemies.filter((e) => !e.dead);
  if (s.projectiles.some((p) => p.life <= 0)) s.projectiles = s.projectiles.filter((p) => p.life > 0);
  if (s.grounds.some((g) => g.life <= 0)) s.grounds = s.grounds.filter((g) => g.life > 0);
  if (s.towers.some((t) => t.temp === 0 && t.invested === 0)) {
    s.towers = s.towers.filter((t) => !(t.temp === 0 && t.invested === 0));
  }
}

function checkDefeat(ctx: Ctx): void {
  const s = ctx.s;
  if (s.lives > 0 || s.gameOver) return;
  s.lives = 0;
  s.gameOver = true;
  s.phase = Phase.Defeat;
  emit(ctx, EventKind.Defeat, 0, 0, s.wave, s.score, 0);
}
