import { GRID_H, GRID_W, soldierRange } from '../game/config';
import { kindOf } from '../game/versus-map';
import {
  ITEMS,
  enemyPos,
  pathFor,
  soldierAt,
  type Side,
  type VersusGame,
} from '../game/versus';
import type { SoldierKind, Vec } from '../game/types';
import type { Effects } from './effects';

export interface VersusDragGhost {
  side: Side;
  kind: SoldierKind;
  level: number;
  px: number;
  py: number;
}

const KAI = '"Kaiti SC","KaiTi","STKaiti","Noto Serif SC","Songti SC",serif';

function hash(x: number, y: number): number {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

/**
 * 对战渲染器：竖屏画布分上下两半，P1 在上半（路径向下到中线营寨），
 * P2 在下半（路径向上到中线营寨）。每方各自 7×5 格的半区。
 * 实际我们让画布仍是 7×10，P1 用上半 0..4 行，P2 用下半 5..9 行，
 * P2 的 y 坐标做镜像 (9 - y) 以便双方都"敌人从顶向己方营寨行进"。
 */
export class VersusRenderer {
  private ctx: CanvasRenderingContext2D;
  private cell = 48;
  private w = 336;
  private h = 480;
  private paper: HTMLCanvasElement | null = null;
  time = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: VersusGame,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = rect.width;
    this.h = (rect.width * GRID_H) / GRID_W;
    this.cell = this.w / GRID_W;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.paper = this.makePaper();
  }

  get height(): number {
    return this.h;
  }

  get cellSize(): number {
    return this.cell;
  }

  private makePaper(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.w));
    c.height = Math.max(1, Math.round(this.h));
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#f7eed8');
    grad.addColorStop(0.5, '#f0e6cf');
    grad.addColorStop(1, '#e8d9b5');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 2800; i++) {
      const a = Math.random() * 0.06;
      g.fillStyle = Math.random() < 0.55 ? `rgba(90,70,50,${a})` : `rgba(255,250,240,${a + 0.02})`;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, 1.2, 1.2);
    }
    g.strokeStyle = 'rgba(105,88,66,0.05)';
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 4 + Math.random() * 12;
      g.beginPath();
      const y = Math.random() * c.height;
      g.moveTo(-20, y);
      g.bezierCurveTo(c.width * 0.3, y + (Math.random() - 0.5) * 50, c.width * 0.7, y + (Math.random() - 0.5) * 50, c.width + 20, y);
      g.stroke();
    }
    return c;
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** 把某一方的逻辑坐标转成画布像素。P2 的 y 镜像到下半。 */
  sideToPx(side: Side, cell: Vec): { x: number; y: number } {
    const x = cell.x * this.cell;
    const y = (side === 'p1' ? cell.y : GRID_H - 1 - cell.y) * this.cell;
    return { x, y };
  }

  /** 画布像素 → 某一方逻辑格 */
  pxToSideCell(side: Side, px: number, py: number): Vec | null {
    const x = Math.floor(px / this.cell);
    const logicalY = Math.floor(py / this.cell);
    const y = side === 'p1' ? logicalY : GRID_H - 1 - logicalY;
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return null;
    return { x, y };
  }

  /** 判断像素落在哪一半（p1=上半, p2=下半） */
  pxToSide(py: number): Side {
    return py < this.h / 2 ? 'p1' : 'p2';
  }

  private drawCells(side: Side): void {
    const c = this.ctx;
    const gap = Math.max(1, this.cell * 0.04);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const kind = kindOf(this.game.map, x, y);
        if (kind === 'rock') {
          const p = this.sideToPx(side, { x, y });
          this.drawRock(p.x, p.y, hash(x, y));
          continue;
        }
        const j = hash(x, y);
        const p = this.sideToPx(side, { x, y });
        const light = (j - 0.5) * 6;
        c.fillStyle =
          kind === 'path'
            ? `hsl(28, ${20 + light * 0.5}%, ${60 + light}%)`
            : `hsl(135, ${22 + light * 0.6}%, ${58 + light}%)`;
        this.roundRect(p.x + gap, p.y + gap, this.cell - gap * 2, this.cell - gap * 2, this.cell * 0.12);
        c.fill();
        c.strokeStyle = kind === 'path' ? 'rgba(90,68,50,0.4)' : 'rgba(54,82,60,0.42)';
        c.lineWidth = 1.2;
        c.stroke();
        if (kind === 'grass') {
          c.strokeStyle = 'rgba(50,82,58,0.35)';
          c.lineWidth = 1.2;
          const gx = p.x + this.cell * (0.24 + j * 0.4);
          const gy = p.y + this.cell * (0.3 + j * 0.3);
          c.beginPath();
          c.moveTo(gx, gy + 5);
          c.quadraticCurveTo(gx + 1.5, gy + 1, gx + 4, gy - 2);
          c.moveTo(gx + 6, gy + 5);
          c.quadraticCurveTo(gx + 7, gy + 1, gx + 10, gy - 1);
          c.stroke();
        }
      }
    }
  }

  private drawRock(px: number, py: number, j: number): void {
    const c = this.ctx;
    const s = this.cell;
    c.save();
    c.translate(px + s / 2, py + s / 2);
    c.rotate((j - 0.5) * 0.5);
    c.fillStyle = '#57544e';
    c.strokeStyle = '#33312d';
    c.lineWidth = 1.5;
    for (const [dx, dy, r] of [
      [-s * 0.18, s * 0.1, s * 0.26],
      [s * 0.15, s * 0.05, s * 0.2],
      [0, -s * 0.14, s * 0.18],
    ] as const) {
      c.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const rr = r * (0.8 + hash(i, Math.round(j * 100)) * 0.4);
        const vx = dx + Math.cos(a) * rr;
        const vy = dy + Math.sin(a) * rr * 0.8;
        i === 0 ? c.moveTo(vx, vy) : c.lineTo(vx, vy);
      }
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.restore();
  }

  private drawCamp(side: Side): void {
    const c = this.ctx;
    const path = pathFor(this.game, side);
    const end = path.at(-1)!;
    const p = this.sideToPx(side, end);
    const cx = p.x + this.cell / 2;
    const cy = p.y + this.cell / 2;
    c.save();
    c.translate(cx, cy);
    // P1 在上半，营寨朝下；P2 在下半，营寨朝上——统一画营帐，不翻转
    c.fillStyle = '#8a5a3b';
    c.strokeStyle = '#6e4529';
    c.lineWidth = 1.5;
    // 顶
    c.beginPath();
    c.moveTo(-this.cell * 0.4, -this.cell * 0.1);
    c.lineTo(0, -this.cell * 0.32);
    c.lineTo(this.cell * 0.4, -this.cell * 0.1);
    c.closePath();
    c.fill();
    c.stroke();
    // 身
    c.fillStyle = '#a86a44';
    c.fillRect(-this.cell * 0.32, -this.cell * 0.1, this.cell * 0.64, this.cell * 0.34);
    c.strokeRect(-this.cell * 0.32, -this.cell * 0.1, this.cell * 0.64, this.cell * 0.34);
    // 旗
    c.fillStyle = '#b03a2e';
    c.fillRect(-1, -this.cell * 0.45, 2, this.cell * 0.15);
    c.beginPath();
    c.moveTo(0, -this.cell * 0.45);
    c.lineTo(this.cell * 0.18, -this.cell * 0.4);
    c.lineTo(0, -this.cell * 0.35);
    c.closePath();
    c.fill();
    c.restore();
  }

  private drawSoldierAt(
    side: Side,
    s: { kind: SoldierKind; level: number; cell: Vec; id: number },
    fx: Effects,
    dragging: boolean,
  ): void {
    const c = this.ctx;
    const p = this.sideToPx(side, s.cell);
    const px = p.x + this.cell / 2;
    const py = p.y + this.cell / 2;
    if (s.kind === '忠') {
      c.save();
      c.globalAlpha = 0.35 + Math.sin(this.time * 2.5) * 0.08;
      c.strokeStyle = '#c89b3c';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(px, py, soldierRange('忠', s.level) * this.cell, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    const off = fx.soldierOffset(s.id);
    this.drawSoldierChar(s.kind, s.level, px + off.dx * this.cell, py + off.dy * this.cell, dragging ? 0.35 : 1, off.scale, side);
  }

  private drawSoldierChar(
    kind: SoldierKind,
    level: number,
    px: number,
    py: number,
    alpha: number,
    scale: number,
    side: Side,
  ): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.translate(px, py);
    if (scale !== 1) c.scale(scale, scale);
    // P2 士兵字翻转，便于对方阅读（可选）；这里不翻，保持统一
    c.fillStyle = side === 'p2' ? '#3a4a5a' : '#2a2520'; // P2 用稍冷墨色区分
    if (kind === '忠') c.fillStyle = side === 'p2' ? '#7a8a3a' : '#9a7426';
    c.font = `bold ${this.cell * 0.66}px ${KAI}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(42,37,32,0.28)';
    c.shadowBlur = 3;
    c.shadowOffsetY = 1.5;
    c.fillText(kind, 0, this.cell * 0.02);
    c.shadowColor = 'transparent';
    if (level > 1) {
      c.fillStyle = '#b03a2e';
      c.beginPath();
      c.arc(this.cell * 0.3, -this.cell * 0.3, this.cell * 0.15, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#7d2a20';
      c.lineWidth = 1;
      c.stroke();
      c.fillStyle = '#f7eed8';
      c.font = `bold ${this.cell * 0.2}px ${KAI}`;
      c.fillText(String(level), this.cell * 0.3, -this.cell * 0.29);
    }
    c.restore();
  }

  private drawEnemies(side: Side, fx: Effects): void {
    const c = this.ctx;
    const p = this.game[side];
    const path = pathFor(this.game, side);
    for (const e of p.enemies) {
      const pos = enemyPos(path, e);
      const sp = this.sideToPx(side, pos);
      const px = sp.x + this.cell / 2;
      const bob = Math.sin(this.time * 6 + e.id) * this.cell * 0.03;
      const py = sp.y + this.cell / 2 + bob;
      const isBoss = e.kind === 'boss';
      const isElite = e.kind === '将';
      const size = this.cell * (isBoss ? 0.82 : isElite ? 0.7 : 0.58);
      const flash = fx.enemyFlashAmt(e.id);
      c.save();
      c.font = `bold ${size}px ${KAI}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor = 'rgba(125,42,32,0.35)';
      c.shadowBlur = isBoss ? 6 : 3;
      c.shadowOffsetY = 1.5;
      if (isBoss) {
        c.strokeStyle = '#7d2a20';
        c.lineWidth = 3;
        c.strokeText(e.word, px, py);
      }
      c.fillStyle = isBoss || isElite ? '#7d2a20' : '#b03a2e';
      c.fillText(e.word, px, py);
      c.shadowColor = 'transparent';
      if (flash > 0) {
        c.globalAlpha = flash * 0.85;
        c.fillStyle = '#fff';
        c.fillText(e.word, px, py);
        c.globalAlpha = 1;
      }
      // 血条
      const bw = this.cell * (isBoss ? 0.92 : isElite ? 0.72 : 0.6);
      const bx = px - bw / 2;
      const by = py - size * 0.78;
      const bh = isBoss ? 5 : 4;
      c.fillStyle = 'rgba(40,20,15,0.6)';
      c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      c.fillStyle = 'rgba(74,40,30,0.7)';
      c.fillRect(bx, by, bw, bh);
      const ratio = Math.max(0, e.hp / e.maxHp);
      c.fillStyle = ratio > 0.5 ? '#c0392b' : ratio > 0.25 ? '#d4564a' : '#e87163';
      c.fillRect(bx, by, bw * ratio, bh);
      c.restore();
    }
  }

  private drawProjectiles(side: Side): void {
    const c = this.ctx;
    const p = this.game[side];
    const path = pathFor(this.game, side);
    c.save();
    c.strokeStyle = '#4a3c31';
    c.lineWidth = 2;
    c.lineCap = 'round';
    for (const proj of p.projectiles) {
      const target = p.enemies.find((e) => e.id === proj.targetId);
      if (!target) continue;
      const tp = enemyPos(path, target);
      const a = Math.atan2(tp.y - proj.y, tp.x - proj.x);
      const sp = this.sideToPx(side, { x: proj.x, y: proj.y });
      const px = sp.x + this.cell / 2;
      const py = sp.y + this.cell / 2;
      c.beginPath();
      c.moveTo(px - Math.cos(a) * 7, py - Math.sin(a) * 7);
      c.lineTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7);
      c.stroke();
    }
    c.restore();
  }

  private drawFog(side: Side): void {
    const p = this.game[side];
    if (p.fogUntil <= 0 || p.fogUntil <= this.time) return;
    const c = this.ctx;
    c.save();
    // 遮住该侧半区
    const yStart = side === 'p1' ? 0 : this.h / 2;
    c.fillStyle = 'rgba(42,37,32,0.5)';
    c.fillRect(0, yStart, this.w, this.h / 2);
    c.fillStyle = 'rgba(180,170,150,0.15)';
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * this.w;
      const y = yStart + Math.random() * (this.h / 2);
      c.beginPath();
      c.arc(x, y, this.cell * 0.6, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  draw(fx: Effects, opts: { ghost?: VersusDragGhost | null; dragFrom?: { side: Side; cell: Vec } | null } = {}): void {
    const c = this.ctx;
    this.time += 1 / 60;
    c.clearRect(0, 0, this.w, this.h);
    const shake = fx.offset();
    c.save();
    c.translate(shake.x, shake.y);

    if (this.paper) c.drawImage(this.paper, 0, 0, this.w, this.h);
    // 双方各自画地图
    this.drawCells('p1');
    this.drawCells('p2');
    // 中线分隔
    c.strokeStyle = 'rgba(125,42,32,0.5)';
    c.lineWidth = 2;
    c.setLineDash([8, 6]);
    c.beginPath();
    c.moveTo(0, this.h / 2);
    c.lineTo(this.w, this.h / 2);
    c.stroke();
    c.setLineDash([]);
    // 营寨
    this.drawCamp('p1');
    this.drawCamp('p2');

    // 拖放高亮
    if (opts.ghost) {
      const side = opts.ghost.side;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (kindOf(this.game.map, x, y) === 'grass') {
            const occupied = !!soldierAt(this.game[side], { x, y });
            const p = this.sideToPx(side, { x, y });
            c.fillStyle = occupied ? 'rgba(200,155,60,0.18)' : 'rgba(255,255,255,0.28)';
            this.roundRect(p.x + 2, p.y + 2, this.cell - 4, this.cell - 4, this.cell * 0.1);
            c.fill();
          }
        }
      }
    }

    // 士兵
    for (const side of ['p1', 'p2'] as Side[]) {
      for (const s of this.game[side].soldiers) {
        if (!s.cell) continue;
        const dragging = !!(opts.dragFrom && opts.dragFrom.side === side && opts.dragFrom.cell.x === s.cell.x && opts.dragFrom.cell.y === s.cell.y);
        this.drawSoldierAt(side, s as { kind: SoldierKind; level: number; cell: Vec; id: number }, fx, dragging);
      }
      this.drawEnemies(side, fx);
      this.drawProjectiles(side);
    }

    fx.drawWorld(c, this.cell);

    // 迷雾遮罩（己方被遮看不到对方半场——这里遮"对方半场"从己方视角）
    // 简化：p1 被迷雾时遮 p2 半场，p2 被迷雾时遮 p1 半场
    if (this.game.p1.fogUntil > this.time) this.drawFog('p2'); // p1 看不清 p2
    if (this.game.p2.fogUntil > this.time) this.drawFog('p1');

    // 拖动幽灵
    if (opts.ghost) {
      const g = opts.ghost;
      this.drawSoldierChar(g.kind, g.level, g.px, g.py, 0.85, 1, g.side);
    }

    c.restore();
    fx.drawOverlay(c, this.w, this.h);
  }
}

export { ITEMS };