/**
 * Hand-drawn hero sprites.
 *
 * Kenney's tower-defense pack only ships four toy soldiers with rifles, which
 * looks wrong for a fantasy roster (the Paladin was literally holding a gun).
 * Heroes are the four biggest things on the board, so they get bespoke vector
 * art instead: distinct silhouettes, real weapons, and a little life —
 * a sword swing, a drawn bowstring, a pulsing staff orb, a spinning gear.
 *
 * Everything is drawn in unit space: the sprite occupies roughly [-0.5, 0.5]
 * and faces "up" (-Y), matching the tilesheet's orientation, so the renderer
 * can keep using the same rotation it uses for every other unit.
 */

import { HERO } from '../content/heroes';

export interface HeroArtState {
  /** Facing, in radians (same convention as the atlas sprites). */
  rot: number;
  /** Player colour, used for the ground ring so allies stay readable. */
  team: string;
  /** Free-running clock in ms, for idle motion. */
  time: number;
  /** 1 while walking, 0 while standing. */
  walk: number;
  /** 1 the instant an attack lands, decaying to 0. */
  swing: number;
  /** 1 while an ability is active. */
  cast: number;
}

const OUTLINE = 'rgba(22,16,30,0.85)';
const LW = 0.035;

function rounded(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, w: number, h: number, r: number,
): void {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

/** Fill the current path, then trace the shared dark outline over it. */
function ink(ctx: CanvasRenderingContext2D, fill: string, lw = LW): void {
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
}

function cloak(ctx: CanvasRenderingContext2D, color: string, shade: string, spread: number): void {
  ctx.beginPath();
  ctx.moveTo(-0.22, -0.06);
  ctx.quadraticCurveTo(-spread, 0.18, -spread * 0.62, 0.46);
  ctx.quadraticCurveTo(0, 0.56, spread * 0.62, 0.46);
  ctx.quadraticCurveTo(spread, 0.18, 0.22, -0.06);
  ctx.closePath();
  ink(ctx, color);
  ctx.beginPath();
  ctx.moveTo(0, -0.04);
  ctx.lineTo(0, 0.48);
  ctx.lineWidth = 0.025;
  ctx.strokeStyle = shade;
  ctx.stroke();
}

function arm(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number, color: string, w = 0.11,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineCap = 'round';
  ctx.lineWidth = w + LW * 1.4;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function gear(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, teeth: number, angle: number, color: string,
): void {
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = angle + (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.74;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ink(ctx, color, 0.02);
  circle(ctx, cx, cy, r * 0.3);
  ink(ctx, '#3b2f22', 0.015);
}

// --- Paladin --------------------------------------------------------------

function drawPaladin(ctx: CanvasRenderingContext2D, s: HeroArtState): void {
  const steel = '#c6d2e4';
  const darkSteel = '#8d9ab2';
  const tabard = '#2f5fb8';
  const gold = '#f2c14e';

  cloak(ctx, tabard, 'rgba(12,26,60,0.55)', 0.36);

  // Shield arm (left).
  const guard = 0.06 * s.swing;
  ctx.save();
  ctx.translate(-0.26, 0.04);
  ctx.rotate(-0.2 - guard);
  arm(ctx, 0.06, 0.02, 0, -0.08, darkSteel, 0.1);
  ctx.beginPath();
  ctx.moveTo(-0.15, -0.22);
  ctx.lineTo(0.15, -0.22);
  ctx.quadraticCurveTo(0.19, 0.02, 0, 0.2);
  ctx.quadraticCurveTo(-0.19, 0.02, -0.15, -0.22);
  ctx.closePath();
  ink(ctx, gold);
  ctx.beginPath();
  ctx.moveTo(-0.1, -0.18);
  ctx.lineTo(0.1, -0.18);
  ctx.quadraticCurveTo(0.13, 0.01, 0, 0.13);
  ctx.quadraticCurveTo(-0.13, 0.01, -0.1, -0.18);
  ctx.closePath();
  ink(ctx, tabard, 0.02);
  ctx.fillStyle = '#f4f7ff';
  ctx.fillRect(-0.03, -0.16, 0.06, 0.22);
  ctx.fillRect(-0.085, -0.11, 0.17, 0.06);
  ctx.restore();

  // Sword arm (right): chops forward on attack.
  ctx.save();
  ctx.translate(0.24 - s.swing * 0.03, 0.04 - s.swing * 0.07);
  ctx.rotate(0.6 - s.swing * 0.78);
  arm(ctx, -0.06, 0.02, 0.02, -0.1, darkSteel, 0.1);
  // Blade
  ctx.beginPath();
  ctx.moveTo(-0.045, -0.2);
  ctx.lineTo(0.045, -0.2);
  ctx.lineTo(0.035, -0.62);
  ctx.lineTo(0, -0.72);
  ctx.lineTo(-0.035, -0.62);
  ctx.closePath();
  ink(ctx, '#eaf1fb', 0.028);
  ctx.beginPath();
  ctx.moveTo(0, -0.22);
  ctx.lineTo(0, -0.66);
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = 'rgba(120,150,190,0.7)';
  ctx.stroke();
  // Crossguard + grip + pommel
  rounded(ctx, 0, -0.19, 0.26, 0.06, 0.03);
  ink(ctx, gold, 0.022);
  rounded(ctx, 0, -0.11, 0.07, 0.12, 0.03);
  ink(ctx, '#6d4326', 0.022);
  circle(ctx, 0, -0.04, 0.045);
  ink(ctx, gold, 0.022);
  ctx.restore();

  // Torso + pauldrons.
  rounded(ctx, 0, -0.02, 0.44, 0.42, 0.16);
  ink(ctx, steel);
  ctx.save();
  rounded(ctx, 0, -0.02, 0.44, 0.42, 0.16);
  ctx.clip();
  ctx.fillStyle = tabard;
  ctx.fillRect(-0.08, -0.26, 0.16, 0.52);
  ctx.fillStyle = gold;
  ctx.fillRect(-0.11, 0.08, 0.22, 0.035);
  ctx.restore();
  circle(ctx, -0.235, 0.02, 0.115);
  ink(ctx, darkSteel);
  circle(ctx, 0.235, 0.02, 0.115);
  ink(ctx, darkSteel);

  // Helm.
  circle(ctx, 0, -0.17, 0.155);
  ink(ctx, steel);
  rounded(ctx, 0, -0.25, 0.2, 0.06, 0.03);
  ink(ctx, '#2b3346', 0.02);
  // Crest.
  ctx.beginPath();
  ctx.moveTo(0, -0.33);
  ctx.quadraticCurveTo(0.06, -0.18, 0.02, 0.0);
  ctx.quadraticCurveTo(-0.02, -0.18, 0, -0.33);
  ctx.closePath();
  ink(ctx, '#d9433f', 0.022);
}

// --- Sentinel -------------------------------------------------------------

function drawSentinel(ctx: CanvasRenderingContext2D, s: HeroArtState): void {
  const leaf = '#3f9a55';
  const dark = '#26663a';
  const leather = '#8a6a3a';
  const wood = '#a8763f';

  cloak(ctx, dark, 'rgba(8,40,20,0.6)', 0.32);

  // Quiver on the back.
  ctx.save();
  ctx.translate(0.2, 0.14);
  ctx.rotate(0.5);
  rounded(ctx, 0, 0, 0.12, 0.3, 0.05);
  ink(ctx, leather, 0.025);
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 0.035, -0.14);
    ctx.lineTo(i * 0.035, -0.24);
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = i === 0 ? '#f0e6d2' : '#d9433f';
    ctx.stroke();
  }
  ctx.restore();

  // Torso.
  rounded(ctx, 0, 0, 0.34, 0.38, 0.14);
  ink(ctx, leaf);
  rounded(ctx, 0, 0.06, 0.36, 0.07, 0.03);
  ink(ctx, leather, 0.02);

  // Arms reach for the bow.
  const pull = s.swing;
  arm(ctx, -0.16, -0.06, -0.1, -0.28, leaf, 0.09);
  arm(ctx, 0.16, -0.06, 0.05 + pull * 0.02, -0.14 + pull * 0.06, leaf, 0.09);

  // Bow: a C-shaped limb ahead of the archer.
  ctx.save();
  ctx.translate(0, -0.12);
  ctx.beginPath();
  ctx.arc(0, 0, 0.34, Math.PI * 1.16, Math.PI * 1.84);
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.075;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = wood;
  ctx.stroke();
  const a0 = Math.PI * 1.16;
  const a1 = Math.PI * 1.84;
  const x0 = Math.cos(a0) * 0.34;
  const y0 = Math.sin(a0) * 0.34;
  const x1 = Math.cos(a1) * 0.34;
  const y1 = Math.sin(a1) * 0.34;
  const draw = 0.06 + pull * 0.16;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(0, -0.3 + draw * 2, x1, y1);
  ctx.lineWidth = 0.018;
  ctx.strokeStyle = '#f2ead6';
  ctx.stroke();
  // Nocked arrow, only while the string is drawn.
  if (pull > 0.05) {
    ctx.globalAlpha = Math.min(1, pull * 2);
    ctx.beginPath();
    ctx.moveTo(0, -0.3 + draw);
    ctx.lineTo(0, -0.56);
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = '#c9a06a';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -0.62);
    ctx.lineTo(-0.04, -0.53);
    ctx.lineTo(0.04, -0.53);
    ctx.closePath();
    ink(ctx, '#dfe7f2', 0.015);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Hood.
  ctx.beginPath();
  ctx.moveTo(0, 0.1);
  ctx.quadraticCurveTo(-0.17, -0.02, -0.14, -0.16);
  ctx.quadraticCurveTo(0, -0.32, 0.14, -0.16);
  ctx.quadraticCurveTo(0.17, -0.02, 0, 0.1);
  ctx.closePath();
  ink(ctx, dark);
  circle(ctx, 0, -0.15, 0.085);
  ink(ctx, '#1b2b20', 0.02);
  ctx.fillStyle = '#9df0b4';
  ctx.beginPath();
  ctx.arc(-0.035, -0.18, 0.018, 0, Math.PI * 2);
  ctx.arc(0.035, -0.18, 0.018, 0, Math.PI * 2);
  ctx.fill();
}

// --- Archmage -------------------------------------------------------------

function drawArchmage(ctx: CanvasRenderingContext2D, s: HeroArtState): void {
  const robe = '#7a4ec9';
  const deep = '#4a2c86';
  const gold = '#f2c14e';
  const pulse = 0.5 + Math.sin(s.time * 0.005) * 0.5;

  cloak(ctx, deep, 'rgba(20,8,40,0.6)', 0.38);

  // Staff, raised while casting.
  ctx.save();
  ctx.translate(0.26, 0.08);
  ctx.rotate(0.22 - s.cast * 0.5 - s.swing * 0.18);
  ctx.beginPath();
  ctx.moveTo(0, 0.06);
  ctx.lineTo(0, -0.5);
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.075;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = 0.048;
  ctx.strokeStyle = '#6b4a2f';
  ctx.stroke();
  // Claw setting + orb.
  ctx.beginPath();
  ctx.moveTo(-0.06, -0.46);
  ctx.lineTo(0, -0.56);
  ctx.lineTo(0.06, -0.46);
  ctx.closePath();
  ink(ctx, gold, 0.02);
  const glow = ctx.createRadialGradient(0, -0.58, 0.01, 0, -0.58, 0.2);
  glow.addColorStop(0, `rgba(255,180,90,${0.55 + pulse * 0.35 + s.cast * 0.2})`);
  glow.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = glow;
  circle(ctx, 0, -0.58, 0.2);
  ctx.fill();
  circle(ctx, 0, -0.58, 0.075 + pulse * 0.008);
  ink(ctx, '#ffb347', 0.022);
  circle(ctx, -0.02, -0.6, 0.028);
  ctx.fillStyle = 'rgba(255,244,214,0.9)';
  ctx.fill();
  ctx.restore();

  // Robe body.
  circle(ctx, 0, 0, 0.23);
  ink(ctx, robe);
  ctx.beginPath();
  ctx.arc(0, 0, 0.16, Math.PI * 0.15, Math.PI * 0.85);
  ctx.lineWidth = 0.028;
  ctx.strokeStyle = gold;
  ctx.stroke();
  arm(ctx, 0.18, -0.05, 0.26, 0.02, robe, 0.09);
  arm(ctx, -0.18, -0.05, -0.24, -0.14, robe, 0.09);

  // Wizard hat: brim, crown, trailing point.
  ctx.beginPath();
  ctx.moveTo(-0.06, 0.04);
  ctx.quadraticCurveTo(-0.02, 0.24, 0.08, 0.3);
  ctx.quadraticCurveTo(0.02, 0.12, 0.06, 0.03);
  ctx.closePath();
  ink(ctx, deep, 0.022);
  circle(ctx, 0, -0.08, 0.2);
  ink(ctx, robe);
  circle(ctx, 0, -0.08, 0.125);
  ink(ctx, deep, 0.022);
  ctx.beginPath();
  ctx.moveTo(0, -0.28);
  ctx.lineTo(0.03, -0.22);
  ctx.lineTo(-0.03, -0.22);
  ctx.closePath();
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,232,170,0.95)';
  circle(ctx, 0.055, -0.13, 0.022);
  ctx.fill();
}

// --- Tinker ---------------------------------------------------------------

function drawTinker(ctx: CanvasRenderingContext2D, s: HeroArtState): void {
  const canvasCol = '#9a7a52';
  const brass = '#d9a441';
  const steel = '#b8c1cc';

  // Backpack boiler with a turning gear.
  rounded(ctx, 0, 0.22, 0.38, 0.28, 0.1);
  ink(ctx, '#6f5637');
  gear(ctx, -0.08, 0.24, 0.085, 8, s.time * 0.0018, brass);
  circle(ctx, 0.1, 0.22, 0.06);
  ink(ctx, '#88d6ff', 0.022);
  // Steam puff.
  ctx.globalAlpha = 0.22 + Math.sin(s.time * 0.004) * 0.12;
  circle(ctx, 0.13, 0.3 + Math.sin(s.time * 0.003) * 0.015, 0.045);
  ctx.fillStyle = '#e8f1ff';
  ctx.fill();
  ctx.globalAlpha = 1;

  // Wrench arm: winds up and cranks over on attack.
  ctx.save();
  ctx.translate(0.2, 0.0);
  ctx.rotate(0.7 - s.swing * 1.3);
  arm(ctx, 0, 0, 0.02, -0.14, canvasCol, 0.1);
  rounded(ctx, 0.02, -0.32, 0.075, 0.34, 0.03);
  ink(ctx, steel, 0.025);
  ctx.beginPath();
  ctx.moveTo(-0.06, -0.44);
  ctx.lineTo(-0.06, -0.56);
  ctx.lineTo(0.02, -0.56);
  ctx.lineTo(0.02, -0.5);
  ctx.lineTo(0.06, -0.5);
  ctx.lineTo(0.06, -0.56);
  ctx.lineTo(0.14, -0.56);
  ctx.lineTo(0.14, -0.44);
  ctx.quadraticCurveTo(0.04, -0.38, -0.06, -0.44);
  ctx.closePath();
  ink(ctx, steel, 0.025);
  ctx.restore();

  // Off hand holding a sparking bolt.
  arm(ctx, -0.18, -0.04, -0.26, -0.2, canvasCol, 0.09);
  circle(ctx, -0.27, -0.24, 0.045);
  ink(ctx, brass, 0.02);
  ctx.globalAlpha = 0.5 + Math.sin(s.time * 0.012) * 0.4;
  circle(ctx, -0.27, -0.24, 0.08);
  ctx.fillStyle = 'rgba(160,220,255,0.5)';
  ctx.fill();
  ctx.globalAlpha = 1;

  // Torso, belt, pouches.
  rounded(ctx, 0, 0, 0.4, 0.36, 0.13);
  ink(ctx, canvasCol);
  rounded(ctx, 0, 0.06, 0.42, 0.07, 0.03);
  ink(ctx, '#5d4429', 0.02);
  circle(ctx, 0.14, 0.07, 0.035);
  ink(ctx, brass, 0.018);
  ctx.beginPath();
  ctx.moveTo(-0.12, -0.16);
  ctx.lineTo(-0.05, 0.05);
  ctx.moveTo(0.12, -0.16);
  ctx.lineTo(0.05, 0.05);
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = '#5d4429';
  ctx.stroke();

  // Head with a flat cap and goggles.
  circle(ctx, 0, -0.12, 0.145);
  ink(ctx, '#e0b083');
  ctx.beginPath();
  ctx.arc(0, -0.12, 0.145, Math.PI * 0.06, Math.PI * 0.94);
  ctx.closePath();
  ink(ctx, '#7d5b8c', 0.022);
  rounded(ctx, 0, -0.2, 0.28, 0.075, 0.03);
  ink(ctx, '#4a3a2c', 0.02);
  ctx.fillStyle = '#8de1ff';
  circle(ctx, -0.07, -0.2, 0.037);
  ctx.fill();
  circle(ctx, 0.07, -0.2, 0.037);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.moveTo(-0.085, -0.215);
  ctx.lineTo(-0.06, -0.215);
  ctx.moveTo(0.055, -0.215);
  ctx.lineTo(0.08, -0.215);
  ctx.stroke();
}

const PAINTERS: Record<number, (ctx: CanvasRenderingContext2D, s: HeroArtState) => void> = {
  [HERO.Paladin]: drawPaladin,
  [HERO.Sentinel]: drawSentinel,
  [HERO.Archmage]: drawArchmage,
  [HERO.Tinker]: drawTinker,
};

/** Draw hero `defId` centred on (x, y), `size` pixels tall, facing `rot`. */
export function drawHeroSprite(
  ctx: CanvasRenderingContext2D,
  defId: number,
  x: number,
  y: number,
  size: number,
  state: HeroArtState,
): void {
  const paint = PAINTERS[defId] ?? drawPaladin;
  const bob = state.walk > 0 ? Math.sin(state.time * 0.014) * size * 0.018 : 0;

  // Contact shadow + team ring stay axis-aligned on the ground.
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, size * 0.15, size * 0.25, size * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = state.team;
  ctx.lineWidth = size * 0.026;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.18, size * 0.42, size * 0.24, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(state.rot);
  ctx.scale(size, size);
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  paint(ctx, state);
  ctx.restore();
}
