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
    // 宣纸米黄底，上浅下暖
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#f7eed8');
    grad.addColorStop(0.5, '#f0e6cf');
    grad.addColorStop(1, '#e8d9b5');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    // 纸张噪点（更细密、暖灰）
    for (let i = 0; i < 3000; i++) {
      const a = Math.random() * 0.06;
      g.fillStyle = Math.random() < 0.55 ? `rgba(90,70,50,${a})` : `rgba(255,250,240,${a + 0.02})`;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, 1.2, 1.2);
    }
    // 淡墨横纹（纸面纤维）
    g.strokeStyle = 'rgba(105,88,66,0.05)';
    for (let i = 0; i < 30; i++) {
      g.lineWidth = 4 + Math.random() * 12;
      g.beginPath();
      const y = Math.random() * c.height;
      g.moveTo(-20, y);
      g.bezierCurveTo(c.width * 0.3, y + (Math.random() - 0.5) * 50, c.width * 0.7, y + (Math.random() - 0.5) * 50, c.width + 20, y);
      g.stroke();
    }
    // 远山墨色剪影（顶部装饰）
    g.fillStyle = 'rgba(74,60,47,0.07)';
    g.beginPath();
    g.moveTo(0, c.height * 0.12);
    g.lineTo(c.width * 0.2, c.height * 0.05);
    g.lineTo(c.width * 0.4, c.height * 0.1);
    g.lineTo(c.width * 0.6, c.height * 0.04);
    g.lineTo(c.width * 0.8, c.height * 0.09);
    g.lineTo(c.width, c.height * 0.06);
    g.lineTo(c.width, 0);
    g.lineTo(0, 0);
    g.closePath();
    g.fill();
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
    const gap = Math.max(1, this.cell * 0.04);
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
        // 路径：暖土棕；草地：青绿（带细微明度变化）
        const light = (j - 0.5) * 6;
        const base =
          kind === 'path'
            ? `hsl(28, ${20 + light * 0.5}%, ${60 + light}%)`
            : `hsl(135, ${22 + light * 0.6}%, ${58 + light}%)`;
        c.fillStyle = base;
        this.roundRect(px + gap, py + gap, this.cell - gap * 2, this.cell - gap * 2, this.cell * 0.12);
        c.fill();
        // 描边：手绘感，墨色稍带透明
        c.strokeStyle = kind === 'path' ? 'rgba(90,68,50,0.4)' : 'rgba(54,82,60,0.42)';
        c.lineWidth = 1.2;
        c.stroke();
        if (kind === 'grass') {
          // 草地：两簇小草
          c.strokeStyle = 'rgba(50,82,58,0.35)';
          c.lineWidth = 1.2;
          const gx = px + this.cell * (0.24 + j * 0.4);
          const gy = py + this.cell * (0.3 + j * 0.3);
          c.beginPath();
          c.moveTo(gx, gy + 5);
          c.quadraticCurveTo(gx + 1.5, gy + 1, gx + 4, gy - 2);
          c.moveTo(gx + 6, gy + 5);
          c.quadraticCurveTo(gx + 7, gy + 1, gx + 10, gy - 1);
          c.stroke();
        } else {
          // 土路：石粒与裂纹
          c.fillStyle = 'rgba(90,68,50,0.2)';
          c.beginPath();
          c.arc(px + this.cell * (0.3 + j * 0.4), py + this.cell * (0.6 - j * 0.25), 1.8, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = 'rgba(90,68,50,0.12)';
          c.lineWidth = 0.8;
          c.beginPath();
          c.moveTo(px + this.cell * 0.2, py + this.cell * 0.4);
          c.lineTo(px + this.cell * 0.4, py + this.cell * 0.45);
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
      c.strokeStyle = 'rgba(176,58,46,0.85)';
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
      c.fillStyle = '#b03a2e';
      c.beginPath();
      c.moveTo(0, -this.cell * 0.3);
      c.lineTo(this.cell * 0.34, -this.cell * 0.18);
      c.lineTo(0, -this.cell * 0.06);
      c.closePath();
      c.fill();
      c.restore();
    }
  }

  private drawSoldier(kind: SoldierKind, level: number, px: number, py: number, alpha = 1, scale = 1): void {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.translate(px, py);
    if (scale !== 1) c.scale(scale, scale);
    c.translate(-px, -py);
    // 忠字用深金，其余用主墨色
    const color = kind === '忠' ? '#9a7426' : '#2a2520';
    c.fillStyle = color;
    c.font = `bold ${this.cell * 0.66}px ${KAI}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // 墨晕投影
    c.shadowColor = 'rgba(42,37,32,0.28)';
    c.shadowBlur = 3;
    c.shadowOffsetY = 1.5;
    c.fillText(kind, px, py + this.cell * 0.02);
    c.shadowColor = 'transparent';
    // 等级角标：朱砂底白字小圆
    if (level > 1) {
      const bx = px + this.cell * 0.3;
      const by = py - this.cell * 0.3;
      c.fillStyle = '#b03a2e';
      c.beginPath();
      c.arc(bx, by, this.cell * 0.15, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#7d2a20';
      c.lineWidth = 1;
      c.stroke();
      c.fillStyle = '#f7eed8';
      c.font = `bold ${this.cell * 0.2}px ${KAI}`;
      c.textBaseline = 'middle';
      c.fillText(String(level), bx, by + this.cell * 0.01);
    }
    c.restore();
  }

  private drawRangeCircle(cell: Vec, kind: SoldierKind, level: number): void {
    const c = this.ctx;
    const r = soldierRange(kind, level) * this.cell;
    const cx = (cell.x + 0.5) * this.cell;
    const cy = (cell.y + 0.5) * this.cell;
    c.save();
    c.fillStyle = kind === '忠' ? 'rgba(200,155,60,0.14)' : 'rgba(255,255,255,0.18)';
    c.strokeStyle = kind === '忠' ? 'rgba(200,155,60,0.55)' : 'rgba(255,255,255,0.6)';
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
        // 常显淡金光环
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
      this.drawSoldier(s.kind, s.level, px + off.dx * this.cell, py + off.dy * this.cell, dragging ? 0.35 : 1, off.scale);
    }

    // 敌人
    for (const e of gs.enemies) {
      const pos = enemyPos(this.level, e);
      const px = (pos.x + 0.5) * this.cell;
      const bob = Math.sin(this.time * 6 + e.id) * this.cell * 0.03;
      const py = (pos.y + 0.5) * this.cell + bob;
      const isBoss = e.kind === 'boss';
      const isElite = e.kind === '将';
      const size = this.cell * (isBoss ? 0.82 : isElite ? 0.7 : 0.58);
      const flash = fx.enemyFlashAmt(e.id);
      c.save();
      c.font = `bold ${size}px ${KAI}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      // 朱砂墨晕投影
      c.shadowColor = 'rgba(125,42,32,0.35)';
      c.shadowBlur = isBoss ? 6 : 3;
      c.shadowOffsetY = 1.5;
      if (isBoss) {
        // Boss 朱砂描边 + 加大
        c.strokeStyle = '#7d2a20';
        c.lineWidth = 3;
        c.strokeText(e.word, px, py);
      }
      c.fillStyle = isBoss || isElite ? '#7d2a20' : '#b03a2e';
      c.fillText(e.word, px, py);
      c.shadowColor = 'transparent';
      // 受击闪白
      if (flash > 0) {
        c.globalAlpha = flash * 0.85;
        c.fillStyle = '#fff';
        c.fillText(e.word, px, py);
        c.globalAlpha = 1;
      }
      // 血条：朱砂红条 + 深底 + 描边，更醒目
      const bw = this.cell * (isBoss ? 0.92 : isElite ? 0.72 : 0.6);
      const bx = px - bw / 2;
      const by = py - size * 0.78;
      const bh = isBoss ? 5 : 4;
      // 底
      c.fillStyle = 'rgba(40,20,15,0.6)';
      c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      // 已损
      c.fillStyle = 'rgba(74,40,30,0.7)';
      c.fillRect(bx, by, bw, bh);
      // 剩余
      const ratio = Math.max(0, e.hp / e.maxHp);
      c.fillStyle = ratio > 0.5 ? '#c0392b' : ratio > 0.25 ? '#d4564a' : '#e87163';
      c.fillRect(bx, by, bw * ratio, bh);
      // 减速标记
      if (e.slow > 0) {
        c.fillStyle = '#9a7426';
        c.font = `${this.cell * 0.22}px ${KAI}`;
        c.fillText('缓', px + this.cell * 0.32, py - size * 0.55);
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
