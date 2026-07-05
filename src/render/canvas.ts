import { GRID_H, GRID_W, soldierRange } from '../game/config';
import { cellKind } from '../game/levels';
import { enemyPos } from '../game/waves';
import type { GameState, LevelDef, SoldierKind, Vec } from '../game/types';
import type { Effects } from './effects';

export interface DragGhost {
  kind: SoldierKind;
  level: number;
  /** 画布 CSS 像素坐标 */
  px: number;
  py: number;
}

export interface DrawOpts {
  ghost?: DragGhost | null;
  /** 选中的已部署士兵格（显示射程圈） */
  selected?: Vec | null;
  /** 拖动中的源格，绘制时半透明 */
  dragFrom?: Vec | null;
}

const KAI = '"Kaiti SC","KaiTi","STKaiti","Noto Serif SC",serif';

function hash(x: number, y: number): number {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cell = 48;
  private w = 336;
  private h = 480;
  private paper: HTMLCanvasElement | null = null;
  time = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private level: LevelDef,
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

  cellToPx(cell: Vec): { x: number; y: number; size: number } {
    return { x: cell.x * this.cell, y: cell.y * this.cell, size: this.cell };
  }

  pxToCell(px: number, py: number): Vec | null {
    const x = Math.floor(px / this.cell);
    const y = Math.floor(py / this.cell);
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return null;
    return { x, y };
  }

  get height(): number {
    return this.h;
  }

  private makePaper(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.w));
    c.height = Math.max(1, Math.round(this.h));
    const g = c.getContext('2d')!;
    g.fillStyle = '#e0d6c2';
    g.fillRect(0, 0, c.width, c.height);
    // 纸张噪点
    for (let i = 0; i < 2200; i++) {
      const a = Math.random() * 0.05;
      g.fillStyle = Math.random() < 0.5 ? `rgba(90,70,50,${a})` : `rgba(255,250,240,${a})`;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, 1.5, 1.5);
    }
    // 淡墨笔触
    g.strokeStyle = 'rgba(105,88,66,0.06)';
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 4 + Math.random() * 14;
      g.beginPath();
      const y = Math.random() * c.height;
      g.moveTo(-20, y);
      g.bezierCurveTo(c.width * 0.3, y + (Math.random() - 0.5) * 60, c.width * 0.7, y + (Math.random() - 0.5) * 60, c.width + 20, y);
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

  private drawCells(): void {
    const c = this.ctx;
    const gap = Math.max(1, this.cell * 0.03);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const kind = cellKind(this.level, x, y);
        const j = hash(x, y);
        const px = x * this.cell;
        const py = y * this.cell;
        if (kind === 'rock') {
          this.drawRock(px, py, j);
          continue;
        }
        const light = (j - 0.5) * 8;
        c.fillStyle =
          kind === 'path'
            ? `hsl(24, ${18 + light * 0.4}%, ${63 + light}%)`
            : `hsl(140, ${16 + light * 0.5}%, ${63 + light}%)`;
        this.roundRect(px + gap, py + gap, this.cell - gap * 2, this.cell - gap * 2, this.cell * 0.1);
        c.fill();
        c.strokeStyle = kind === 'path' ? 'rgba(96,74,58,0.35)' : 'rgba(58,92,66,0.35)';
        c.lineWidth = 1;
        c.stroke();
        // 草地纹理：两撇小草
        if (kind === 'grass') {
          c.strokeStyle = 'rgba(52,84,60,0.28)';
          c.lineWidth = 1;
          const gx = px + this.cell * (0.25 + j * 0.4);
          const gy = py + this.cell * (0.28 + j * 0.35);
          c.beginPath();
          c.moveTo(gx, gy + 4);
          c.quadraticCurveTo(gx + 1, gy, gx + 4, gy - 2);
          c.moveTo(gx + 5, gy + 4);
          c.quadraticCurveTo(gx + 6, gy + 1, gx + 9, gy);
          c.stroke();
        } else {
          // 土路石粒
          c.fillStyle = 'rgba(96,74,58,0.18)';
          c.beginPath();
          c.arc(px + this.cell * (0.3 + j * 0.4), py + this.cell * (0.6 - j * 0.25), 1.6, 0, Math.PI * 2);
          c.fill();
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

  private drawPortals(): void {
    const c = this.ctx;
    for (const path of this.level.paths) {
      const start = path[0];
      const end = path[path.length - 1];
      // 入口：红色双箭头
      const sp = this.cellToPx(start);
      c.save();
      c.translate(sp.x + this.cell / 2, sp.y + this.cell / 2);
      const n = path[1];
      c.rotate(Math.atan2(n.y - start.y, n.x - start.x) + Math.PI / 2);
      c.strokeStyle = 'rgba(164,57,44,0.85)';
      c.lineWidth = 3;
      c.lineCap = 'round';
      for (const off of [-4, 4]) {
        c.beginPath();
        c.moveTo(-this.cell * 0.2, off - this.cell * 0.08);
        c.lineTo(0, off + this.cell * 0.1);
        c.lineTo(this.cell * 0.2, off - this.cell * 0.08);
        c.stroke();
      }
      c.restore();
      // 出口：营旗
      const ep = this.cellToPx(end);
      c.save();
      c.translate(ep.x + this.cell / 2, ep.y + this.cell / 2);
      c.strokeStyle = '#4a3c31';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, this.cell * 0.28);
      c.lineTo(0, -this.cell * 0.3);
      c.stroke();
      c.fillStyle = '#a4392c';
      c.beginPath();
      c.moveTo(0, -this.cell * 0.3);
      c.lineTo(this.cell * 0.34, -this.cell * 0.18);
      c.lineTo(0, -this.cell * 0.06);
      c.closePath();
      c.fill();
      c.restore();
    }
  }

  private drawSoldier(kind: SoldierKind, level: number, px: number, py: number, alpha = 1): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = kind === '忠' ? '#7a5b2f' : '#2b2b2b';
    c.font = `${this.cell * 0.62}px ${KAI}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.25)';
    c.shadowBlur = 2;
    c.shadowOffsetY = 1;
    c.fillText(kind, px, py + this.cell * 0.03);
    c.shadowColor = 'transparent';
    if (level > 1) {
      c.font = `bold ${this.cell * 0.22}px ${KAI}`;
      c.fillStyle = '#8c3b2e';
      c.fillText(String(level), px + this.cell * 0.3, py - this.cell * 0.28);
    }
    c.restore();
  }

  private drawRangeCircle(cell: Vec, kind: SoldierKind, level: number): void {
    const c = this.ctx;
    const r = soldierRange(kind, level) * this.cell;
    const cx = (cell.x + 0.5) * this.cell;
    const cy = (cell.y + 0.5) * this.cell;
    c.save();
    c.fillStyle = kind === '忠' ? 'rgba(184,134,11,0.12)' : 'rgba(255,255,255,0.16)';
    c.strokeStyle = kind === '忠' ? 'rgba(184,134,11,0.5)' : 'rgba(255,255,255,0.55)';
    c.lineWidth = 1.5;
    c.setLineDash([6, 4]);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  }

  draw(gs: GameState, fx: Effects, opts: DrawOpts = {}): void {
    const c = this.ctx;
    this.time += 1 / 60;
    c.clearRect(0, 0, this.w, this.h);
    const shake = fx.offset();
    c.save();
    c.translate(shake.x, shake.y);

    if (this.paper) c.drawImage(this.paper, 0, 0, this.w, this.h);
    this.drawCells();
    this.drawPortals();

    // 拖动/选中提示：可放置格高亮
    if (opts.ghost) {
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (cellKind(this.level, x, y) === 'grass') {
            const occupied = gs.soldiers.some((s) => s.cell?.x === x && s.cell?.y === y);
            c.fillStyle = occupied ? 'rgba(184,134,11,0.18)' : 'rgba(255,255,255,0.28)';
            this.roundRect(x * this.cell + 2, y * this.cell + 2, this.cell - 4, this.cell - 4, this.cell * 0.1);
            c.fill();
          }
        }
      }
    }

    // 士兵
    for (const s of gs.soldiers) {
      if (!s.cell) continue;
      const dragging =
        opts.dragFrom && s.cell.x === opts.dragFrom.x && s.cell.y === opts.dragFrom.y;
      const px = (s.cell.x + 0.5) * this.cell;
      const py = (s.cell.y + 0.5) * this.cell;
      if (s.kind === '忠') {
        // 常显淡光环
        c.save();
        c.globalAlpha = 0.35 + Math.sin(this.time * 2.5) * 0.08;
        c.strokeStyle = '#b8860b';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(px, py, soldierRange('忠', s.level) * this.cell, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
      this.drawSoldier(s.kind, s.level, px, py, dragging ? 0.35 : 1);
    }

    // 敌人
    for (const e of gs.enemies) {
      const pos = enemyPos(this.level, e);
      const px = (pos.x + 0.5) * this.cell;
      const bob = Math.sin(this.time * 6 + e.id) * this.cell * 0.03;
      const py = (pos.y + 0.5) * this.cell + bob;
      const isBoss = e.kind === 'boss';
      const size = this.cell * (isBoss ? 0.8 : e.kind === '将' ? 0.68 : 0.55);
      c.save();
      c.font = `${size}px ${KAI}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (isBoss) {
        c.strokeStyle = '#a4392c';
        c.lineWidth = 2.5;
        c.strokeText(e.word, px, py);
      }
      c.fillStyle = e.kind === '将' || isBoss ? '#6b1f14' : '#7b3a2e';
      c.fillText(e.word, px, py);
      // 血条
      if (e.hp < e.maxHp) {
        const bw = this.cell * (isBoss ? 0.9 : 0.6);
        const bx = px - bw / 2;
        const by = py - size * 0.75;
        c.fillStyle = 'rgba(40,20,15,0.55)';
        c.fillRect(bx, by, bw, 4);
        c.fillStyle = '#c0392b';
        c.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 4);
      }
      // 减速标记
      if (e.slow > 0) {
        c.fillStyle = 'rgba(122,91,47,0.9)';
        c.font = `${this.cell * 0.2}px ${KAI}`;
        c.fillText('缓', px - this.cell * 0.3, py - size * 0.5);
      }
      c.restore();
    }

    // 箭矢
    c.save();
    c.strokeStyle = '#4a3c31';
    c.lineWidth = 2;
    c.lineCap = 'round';
    for (const p of gs.projectiles) {
      const target = gs.enemies.find((e) => e.id === p.targetId);
      if (!target) continue;
      const tp = enemyPos(this.level, target);
      const a = Math.atan2(tp.y - p.y, tp.x - p.x);
      const px = (p.x + 0.5) * this.cell;
      const py = (p.y + 0.5) * this.cell;
      c.beginPath();
      c.moveTo(px - Math.cos(a) * 7, py - Math.sin(a) * 7);
      c.lineTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7);
      c.stroke();
    }
    c.restore();

    // 选中射程圈
    if (opts.selected) {
      const s = gs.soldiers.find((v) => v.cell?.x === opts.selected!.x && v.cell?.y === opts.selected!.y);
      if (s) this.drawRangeCircle(opts.selected, s.kind, s.level);
    }

    fx.drawWorld(c, this.cell);

    // 拖动幽灵
    if (opts.ghost) {
      const g = opts.ghost;
      const cellUnder = this.pxToCell(g.px, g.py);
      if (cellUnder && cellKind(this.level, cellUnder.x, cellUnder.y) === 'grass') {
        this.drawRangeCircle(cellUnder, g.kind, g.level);
      }
      this.drawSoldier(g.kind, g.level, g.px, g.py - this.cell * 0.5, 0.85);
    }

    c.restore();
    fx.drawOverlay(c, this.w, this.h);
  }
}
