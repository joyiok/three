import { ITEM_DEFS } from '../game/items';
import type { GameEvent, ItemKind, Vec } from '../game/types';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; ttl: number; size: number; color: string;
  rot?: number; vr?: number; shape?: 'dot' | 'shard';
}

interface Floater {
  x: number; y: number; text: string; color: string;
  life: number; ttl: number; size: number;
  vy: number; pop: number;
}

interface Ring {
  x: number; y: number; r0: number; r1: number;
  life: number; ttl: number; color: string; width: number;
  fill?: string;
}

interface Slash {
  x: number; y: number; angle: number; life: number; ttl: number; color: string;
  shape: 'arc' | 'line';
  reach: number;
  width: number;
}

interface Shockwave {
  x: number; y: number; r: number; life: number; ttl: number; color: string;
}

interface SoldierFx {
  /** 士兵 id；攻击冲刺/合成弹跳用 */
  id: number;
  /** 0..1 攻击冲刺进度 */
  lunge?: { t: number; dirX: number; dirY: number };
  /** 0..1 合成弹跳 */
  mergePop?: number;
  /** 0..1 部署落地 */
  dropPop?: number;
}

interface EnemyFx {
  id: number;
  /** 受击闪白进度 0..1 */
  flash?: number;
  /** 击杀破碎进度（>0 时正在破碎消散） */
  shatter?: number;
  x?: number; y?: number;
}

/** 世界坐标一律用格子单位，绘制时乘以格宽 */
export class Effects {
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private slashes: Slash[] = [];
  private shockwaves: Shockwave[] = [];
  private soldierFx = new Map<number, SoldierFx>();
  private enemyFx = new Map<number, EnemyFx>();
  private shakePower = 0;
  private shakeTime = 0;
  /** 全局命中停顿（秒）——正值时整局慢放 */
  hitstop = 0;
  /** 漏怪红光 0~1 */
  vignette = 0;
  /** 营寨血量条闪红 0..1 */
  hpFlash = 0;

  shake(power: number): void {
    this.shakePower = Math.max(this.shakePower, power);
    this.shakeTime = 0.35;
  }

  praise(tier: number, x: number, y: number): void {
    const level = Math.max(1, Math.min(5, tier));
    const gold = '#c89b3c';
    const ink = '#1f1a16';
    this.inkSplash(x, y, 8 + level * 4, ink);
    this.burst(x, y, 6 + level * 3, level >= 3 ? gold : '#7d2a20', 1.2 + level * 0.18, 0.045 + level * 0.008, 'shard');
    this.ring(x, y, 0.08, 0.55 + level * 0.12, level >= 4 ? gold : ink, 4, 0.32 + level * 0.03, 'rgba(200,155,60,0.10)');
    if (level >= 4) {
      this.shock(x, y, 0.75 + level * 0.05, 'rgba(200,155,60,0.24)');
    }
  }

  /** 士兵发起一次攻击冲刺 */
  soldierLunge(id: number, dirX: number, dirY: number): void {
    const f = this.soldierFx.get(id) ?? { id };
    f.lunge = { t: 0, dirX, dirY };
    this.soldierFx.set(id, f);
  }

  /** 士兵合成升级弹跳 */
  soldierMerge(id: number): void {
    const f = this.soldierFx.get(id) ?? { id };
    f.mergePop = 0;
    this.soldierFx.set(id, f);
  }

  /** 士兵部署落地 */
  soldierDrop(id: number): void {
    const f = this.soldierFx.get(id) ?? { id };
    f.dropPop = 0;
    this.soldierFx.set(id, f);
  }

  /** 敌人受击闪白 */
  enemyFlash(id: number): void {
    const f = this.enemyFx.get(id) ?? { id };
    f.flash = 1;
    this.enemyFx.set(id, f);
  }

  /** 敌人击杀破碎消散 */
  enemyShatter(id: number, x: number, y: number): void {
    const f = this.enemyFx.get(id) ?? { id };
    f.shatter = 0.001;
    f.x = x; f.y = y;
    this.enemyFx.set(id, f);
  }

  /** 取某士兵的视觉偏移（攻击冲刺方向×幅度） */
  soldierOffset(id: number): { dx: number; dy: number; scale: number } {
    const f = this.soldierFx.get(id);
    if (!f) return { dx: 0, dy: 0, scale: 1 };
    let dx = 0, dy = 0, scale = 1;
    if (f.lunge) {
      const k = f.lunge.t;
      // 0→1 期间向前冲再回弹（sin 半波）
      const amp = Math.sin(k * Math.PI) * 0.28;
      dx = f.lunge.dirX * amp;
      dy = f.lunge.dirY * amp;
    }
    if (f.mergePop !== undefined) {
      const k = f.mergePop;
      scale = 1 + Math.sin(k * Math.PI) * 0.45;
    }
    if (f.dropPop !== undefined) {
      const k = f.dropPop;
      scale *= 1 - Math.sin(k * Math.PI) * 0.18;
    }
    return { dx, dy, scale };
  }

  /** 敌人受击闪白强度 0..1（>0 时叠加白光） */
  enemyFlashAmt(id: number): number {
    return this.enemyFx.get(id)?.flash ?? 0;
  }

  private burst(x: number, y: number, count: number, color: string, speed: number, size: number, shape: 'dot' | 'shard' = 'dot'): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.9);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.35,
        life: 0, ttl: 0.4 + Math.random() * 0.5, size: size * (0.5 + Math.random()),
        color, shape, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  private inkSplash(x: number, y: number, count: number, color: string): void {
    // 墨渍飞溅：不规则碎片向外
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1.2 + Math.random() * 2.5;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8,
        life: 0, ttl: 0.5 + Math.random() * 0.4,
        size: 0.06 + Math.random() * 0.08,
        color, shape: 'shard', rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  float(x: number, y: number, text: string, color: string, size = 0.32): void {
    this.floaters.push({ x, y, text, color, life: 0, ttl: 0.9, size, vy: -0.9, pop: 0 });
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, width = 3, ttl = 0.45, fill?: string): void {
    this.rings.push({ x, y, r0, r1, life: 0, ttl, color, width, fill });
  }

  shock(x: number, y: number, r: number, color: string): void {
    this.shockwaves.push({ x, y, r, life: 0, ttl: 0.28, color });
  }

  spawn(e: GameEvent): void {
    switch (e.t) {
      case 'hit':
        this.float(e.x + (Math.random() - 0.5) * 0.3, e.y - 0.25, String(e.damage), '#b03a2e', 0.3);
        this.burst(e.x, e.y, 4, '#2a2520', 1.6, 0.05);
        this.hitstop = Math.max(this.hitstop, 0.018);
        break;
      case 'kill':
        this.inkSplash(e.x, e.y, 18, '#1f1a16');
        this.inkSplash(e.x, e.y, 8, '#7d2a20');
        this.ring(e.x, e.y, 0.05, 0.7, '#2a2520', 4, 0.4);
        this.shock(e.x, e.y, 0.6, 'rgba(42,37,32,0.4)');
        this.float(e.x, e.y - 0.5, `+${e.bounty}`, '#c89b3c', 0.36);
        this.shake(3);
        this.hitstop = Math.max(this.hitstop, 0.05);
        break;
      case 'merge':
        if (e.cell.x >= 0) {
          this.ring(e.cell.x, e.cell.y, 0.1, 1.1, '#2a2520', 5, 0.5);
          this.ring(e.cell.x, e.cell.y, 0.05, 0.5, '#c89b3c', 3, 0.55, 'rgba(200,155,60,0.12)');
          this.inkSplash(e.cell.x, e.cell.y, 20, '#2a2520');
          this.inkSplash(e.cell.x, e.cell.y, 10, '#c89b3c');
          this.shock(e.cell.x, e.cell.y, 0.9, 'rgba(200,155,60,0.35)');
          this.float(e.cell.x, e.cell.y - 0.55, `升 ${e.level} 级`, '#9a7426', 0.34);
          this.shake(4);
          this.hitstop = Math.max(this.hitstop, 0.04);
        }
        break;
      case 'leak':
        this.vignette = 1;
        this.hpFlash = 1;
        this.shake(6);
        this.hitstop = Math.max(this.hitstop, 0.06);
        break;
      case 'income': {
        // 收入飘字：按来源错开高度，飘在画面下方营寨一侧
        const label = e.source === 'early' ? '速' : e.source === 'interest' ? '息' : '屯';
        const y = e.source === 'early' ? 7.1 : e.source === 'interest' ? 7.7 : 8.3;
        this.float(3, y, `+${e.amount}🍚 ${label}`, '#9a7426', 0.34);
        break;
      }
      case 'boss':
        this.shake(12);
        this.hitstop = 0.08;
        break;
      case 'itemGain':
        this.float(e.x, e.y - 0.6, `得·${ITEM_DEFS[e.item].name}`, '#9a7426', 0.32);
        this.burst(e.x, e.y, 8, '#c89b3c', 1.5, 0.05, 'shard');
        this.ring(e.x, e.y, 0.06, 0.5, '#c89b3c', 3, 0.4);
        break;
      case 'itemUse':
        this.itemUseFx(e.item, e.cell);
        break;
      case 'shoot':
        // 攻击冲刺由 combat 触发 soldierLunge；此处只做刀光
        if (e.kind === '刀' || e.kind === '骑' || e.kind === '枪') {
          const reach = e.kind === '枪'
            ? Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y) + 0.4
            : e.kind === '骑' ? 0.85 : 0.6;
          this.slashes.push({
            x: e.from.x, y: e.from.y,
            angle: Math.atan2(e.to.y - e.from.y, e.to.x - e.from.x),
            life: 0,
            ttl: e.kind === '骑' ? 0.3 : e.kind === '枪' ? 0.18 : 0.16,
            color: e.kind === '骑' ? '#8a5a3b' : e.kind === '枪' ? '#3d3d3d' : '#2a2520',
            shape: e.kind === '枪' ? 'line' : 'arc',
            reach,
            width: e.kind === '骑' ? 5 : 3.5,
          });
          if (e.kind === '骑') {
            this.ring(e.to.x, e.to.y, 0.15, 0.9, '#8a5a3b', 4, 0.35, 'rgba(138,90,59,0.2)');
            this.shock(e.to.x, e.to.y, 0.8, 'rgba(138,90,59,0.4)');
            this.inkSplash(e.to.x, e.to.y, 10, '#6e4529');
          }
        }
        break;
      default:
        break;
    }
  }

  /** 道具释放特效 */
  private itemUseFx(item: ItemKind, cell?: Vec): void {
    const cx = cell?.x ?? 3;
    const cy = cell?.y ?? 4.5;
    switch (item) {
      case 'fire':
        this.inkSplash(cx, cy, 16, '#c0392b');
        this.inkSplash(cx, cy, 12, '#e07b39');
        this.ring(cx, cy, 0.15, 1.6, '#c0392b', 5, 0.5, 'rgba(224,123,57,0.22)');
        this.shock(cx, cy, 1.4, 'rgba(192,57,43,0.45)');
        this.float(cx, cy - 0.8, '火攻', '#c0392b', 0.4);
        this.shake(7);
        this.hitstop = Math.max(this.hitstop, 0.06);
        break;
      case 'arrowRain':
        // 从天而降的箭矢碎片
        for (let i = 0; i < 26; i++) {
          this.particles.push({
            x: Math.random() * 7 - 0.5,
            y: -0.6 - Math.random() * 1.2,
            vx: (Math.random() - 0.5) * 0.4,
            vy: 5 + Math.random() * 3,
            life: 0,
            ttl: 0.6 + Math.random() * 0.5,
            size: 0.05 + Math.random() * 0.04,
            color: '#4a3c31',
            shape: 'shard',
            rot: Math.PI / 2,
            vr: 0,
          });
        }
        this.float(3, 3.2, '箭雨', '#4a3c31', 0.42);
        this.shake(4);
        break;
      case 'rockfall':
        this.float(3, 3.2, '落石', '#57544e', 0.42);
        this.shake(9);
        this.hitstop = Math.max(this.hitstop, 0.06);
        break;
      case 'slowAll':
        this.ring(3, 4.5, 0.3, 4.6, '#9a7426', 4, 0.7, 'rgba(200,155,60,0.08)');
        this.float(3, 3.2, '缓兵之计', '#9a7426', 0.4);
        break;
      case 'rally':
        this.ring(3, 4.5, 0.3, 4.6, '#b03a2e', 4, 0.7, 'rgba(176,58,46,0.07)');
        this.float(3, 3.2, '擂鼓！全军振奋', '#b03a2e', 0.38);
        this.shake(3);
        break;
      case 'heal':
        this.float(3, 7.6, '+2 ♥ 修营', '#2e7d4f', 0.38);
        this.ring(3, 8.4, 0.1, 0.9, '#2e7d4f', 3, 0.5);
        break;
      case 'food':
        this.float(3, 7.6, '+15🍚 征粮', '#9a7426', 0.38);
        break;
      case 'merge':
        // 合成本身另有 merge 事件特效，这里只标一下来源
        this.float(3, 3.2, '神合', '#9a7426', 0.4);
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
      p.vx *= 0.98;
      if (p.vr !== undefined && p.rot !== undefined) p.rot += p.vr * dt;
    }
    this.particles = upd(this.particles);
    for (const f of this.floaters) {
      f.y += f.vy * dt;
      f.vy *= 0.92;
      f.pop = Math.min(1, f.pop + dt * 8);
    }
    this.floaters = upd(this.floaters);
    this.rings = upd(this.rings);
    this.slashes = upd(this.slashes);
    this.shockwaves = upd(this.shockwaves);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime <= 0) this.shakePower = 0;
    this.vignette = Math.max(0, this.vignette - dt * 2.2);
    this.hpFlash = Math.max(0, this.hpFlash - dt * 3);
    this.hitstop = Math.max(0, this.hitstop - dt);
    // 士兵/敌人 fx 推进
    for (const f of this.soldierFx.values()) {
      if (f.lunge) {
        f.lunge.t += dt * 6;
        if (f.lunge.t >= 1) f.lunge = undefined;
      }
      if (f.mergePop !== undefined) {
        f.mergePop += dt * 3.2;
        if (f.mergePop >= 1) f.mergePop = undefined;
      }
      if (f.dropPop !== undefined) {
        f.dropPop += dt * 4.5;
        if (f.dropPop >= 1) f.dropPop = undefined;
      }
      if (!f.lunge && f.mergePop === undefined && f.dropPop === undefined) {
        this.soldierFx.delete(f.id);
      }
    }
    for (const f of this.enemyFx.values()) {
      if (f.flash !== undefined) {
        f.flash -= dt * 4;
        if (f.flash <= 0) f.flash = undefined;
      }
      if (f.shatter !== undefined) {
        f.shatter += dt * 2.5;
        if (f.shatter >= 1) this.enemyFx.delete(f.id);
      }
      if (f.flash === undefined && f.shatter === undefined) this.enemyFx.delete(f.id);
    }
  }

  offset(): Vec {
    if (this.shakePower <= 0) return { x: 0, y: 0 };
    const p = this.shakePower * (this.shakeTime / 0.35);
    return { x: (Math.random() - 0.5) * 2 * p, y: (Math.random() - 0.5) * 2 * p };
  }

  drawWorld(ctx: CanvasRenderingContext2D, cell: number): void {
    const px = (v: number) => (v + 0.5) * cell;
    // 冲击波
    for (const s of this.shockwaves) {
      const k = s.life / s.ttl;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = (1 - k) * 4 + 1;
      ctx.beginPath();
      ctx.arc(px(s.x), px(s.y), s.r * cell * (0.3 + k * 0.7), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // 刀光
    for (const s of this.slashes) {
      const k = s.life / s.ttl;
      ctx.save();
      ctx.translate(px(s.x), px(s.y));
      ctx.rotate(s.angle);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = (1 - k) * 0.95;
      ctx.lineWidth = s.width * (1 - k * 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (s.shape === 'line') {
        const tip = s.reach * cell * Math.min(1, k * 2.5);
        ctx.moveTo(cell * 0.2, 0);
        ctx.lineTo(tip, 0);
      } else {
        ctx.arc(0, 0, cell * s.reach, -0.85 + k * 0.9, 0.85 + k * 0.9);
      }
      ctx.stroke();
      ctx.restore();
    }
    // 墨圈
    for (const r of this.rings) {
      const k = r.life / r.ttl;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      if (r.fill) {
        ctx.fillStyle = r.fill;
        ctx.beginPath();
        ctx.arc(px(r.x), px(r.y), (r.r0 + (r.r1 - r.r0) * k) * cell, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(px(r.x), px(r.y), (r.r0 + (r.r1 - r.r0) * k) * cell, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // 墨渍碎片
    for (const p of this.particles) {
      const k = p.life / p.ttl;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = p.color;
      if (p.shape === 'shard') {
        ctx.translate(px(p.x), px(p.y));
        ctx.rotate(p.rot ?? 0);
        const sz = p.size * cell * (1 - k * 0.4);
        ctx.fillRect(-sz, -sz * 0.5, sz * 2, sz);
      } else {
        ctx.beginPath();
        ctx.arc(px(p.x), px(p.y), p.size * cell * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // 飘字（带弹出缩放）
    for (const f of this.floaters) {
      const k = f.life / f.ttl;
      const popScale = f.pop < 1 ? 0.6 + f.pop * 0.6 : 1;
      ctx.save();
      ctx.globalAlpha = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
      ctx.translate(px(f.x), px(f.y));
      ctx.scale(popScale, popScale);
      ctx.fillStyle = f.color;
      ctx.font = `bold ${f.size * cell}px "Kaiti SC","KaiTi","STKaiti","Noto Serif SC",serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 2;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.vignette <= 0) return;
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(176,58,46,0)');
    grad.addColorStop(1, `rgba(176,58,46,${0.5 * this.vignette})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}