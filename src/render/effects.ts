import type { GameEvent, Vec } from '../game/types';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; ttl: number; size: number; color: string;
}

interface Floater {
  x: number; y: number; text: string; color: string;
  life: number; ttl: number; size: number;
}

interface Ring {
  x: number; y: number; r0: number; r1: number;
  life: number; ttl: number; color: string; width: number;
}

interface Slash {
  x: number; y: number; angle: number; life: number; ttl: number; color: string;
  /** line = 直刺（枪），arc = 弧形刀光 */
  shape: 'arc' | 'line';
  reach: number;
}

/** 世界坐标一律用格子单位，绘制时乘以格宽 */
export class Effects {
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private slashes: Slash[] = [];
  private shakePower = 0;
  private shakeTime = 0;
  /** 漏怪红光 0~1 */
  vignette = 0;

  shake(power: number): void {
    this.shakePower = Math.max(this.shakePower, power);
    this.shakeTime = 0.35;
  }

  private burst(x: number, y: number, count: number, color: string, speed: number, size: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3,
        life: 0, ttl: 0.4 + Math.random() * 0.4, size: size * (0.5 + Math.random()), color,
      });
    }
  }

  float(x: number, y: number, text: string, color: string, size = 0.32): void {
    this.floaters.push({ x, y, text, color, life: 0, ttl: 0.8, size });
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, width = 3, ttl = 0.45): void {
    this.rings.push({ x, y, r0, r1, life: 0, ttl, color, width });
  }

  spawn(e: GameEvent): void {
    switch (e.t) {
      case 'hit':
        this.float(e.x + (Math.random() - 0.5) * 0.3, e.y - 0.3, String(e.damage), '#8c3b2e', 0.26);
        this.burst(e.x, e.y, 3, '#4a3c31', 1.2, 0.05);
        break;
      case 'kill':
        this.burst(e.x, e.y, 12, '#3a3129', 2.2, 0.07);
        this.float(e.x, e.y - 0.5, `+${e.bounty}`, '#9a7b1c', 0.3);
        break;
      case 'merge':
        if (e.cell.x >= 0) {
          this.ring(e.cell.x, e.cell.y, 0.1, 0.9, '#2b2b2b', 4);
          this.burst(e.cell.x, e.cell.y, 16, '#2b2b2b', 2.6, 0.06);
          this.float(e.cell.x, e.cell.y - 0.55, `${e.level} 级！`, '#2b6136', 0.3);
        }
        break;
      case 'leak':
        this.vignette = 1;
        this.shake(4);
        break;
      case 'boss':
        this.shake(10);
        break;
      case 'shoot':
        if (e.kind === '刀' || e.kind === '骑' || e.kind === '枪') {
          const reach = e.kind === '枪'
            ? Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y) + 0.4
            : 0.55;
          this.slashes.push({
            x: e.from.x, y: e.from.y,
            angle: Math.atan2(e.to.y - e.from.y, e.to.x - e.from.x),
            life: 0,
            ttl: e.kind === '骑' ? 0.28 : e.kind === '枪' ? 0.18 : 0.16,
            color: e.kind === '骑' ? '#6e4529' : e.kind === '枪' ? '#3d3d3d' : '#2b2b2b',
            shape: e.kind === '枪' ? 'line' : 'arc',
            reach,
          });
          if (e.kind === '骑') this.ring(e.to.x, e.to.y, 0.15, 0.8, '#8a6f52', 3, 0.3);
        }
        break;
      default:
        break;
    }
  }

  update(dt: number): void {
    const upd = <T extends { life: number; ttl: number }>(arr: T[]) => {
      for (const p of arr) p.life += dt;
      return arr.filter((p) => p.life < p.ttl);
    };
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 3.5 * dt;
    }
    this.particles = upd(this.particles);
    for (const f of this.floaters) f.y -= 0.8 * dt;
    this.floaters = upd(this.floaters);
    this.rings = upd(this.rings);
    this.slashes = upd(this.slashes);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime <= 0) this.shakePower = 0;
    this.vignette = Math.max(0, this.vignette - dt * 2.2);
  }

  offset(): Vec {
    if (this.shakePower <= 0) return { x: 0, y: 0 };
    const p = this.shakePower * (this.shakeTime / 0.35);
    return { x: (Math.random() - 0.5) * 2 * p, y: (Math.random() - 0.5) * 2 * p };
  }

  drawWorld(ctx: CanvasRenderingContext2D, cell: number): void {
    const px = (v: number) => (v + 0.5) * cell;
    for (const s of this.slashes) {
      const k = s.life / s.ttl;
      ctx.save();
      ctx.translate(px(s.x), px(s.y));
      ctx.rotate(s.angle);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (s.shape === 'line') {
        const tip = s.reach * cell * Math.min(1, k * 2.5);
        ctx.moveTo(cell * 0.2, 0);
        ctx.lineTo(tip, 0);
      } else {
        ctx.arc(0, 0, cell * s.reach, -0.7 + k * 0.8, 0.7 + k * 0.8);
      }
      ctx.stroke();
      ctx.restore();
    }
    for (const r of this.rings) {
      const k = r.life / r.ttl;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(px(r.x), px(r.y), (r.r0 + (r.r1 - r.r0) * k) * cell, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const p of this.particles) {
      const k = p.life / p.ttl;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px(p.x), px(p.y), p.size * cell * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const f of this.floaters) {
      const k = f.life / f.ttl;
      ctx.save();
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      ctx.fillStyle = f.color;
      ctx.font = `bold ${f.size * cell}px "Kaiti SC","KaiTi","STKaiti","Noto Serif SC",serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, px(f.x), px(f.y));
      ctx.restore();
    }
  }

  drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.vignette <= 0) return;
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(164,57,44,0)');
    grad.addColorStop(1, `rgba(164,57,44,${0.45 * this.vignette})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}
