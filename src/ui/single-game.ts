import { Engine } from '../game/engine';
import { FIRE_RADIUS, ITEM_DEFS, useItem } from '../game/items';
import { moveSoldier, recruit, sellSoldier, soldierAt } from '../game/state';
import { callWave } from '../game/waves';
import type { LevelDef, Loc, SoldierKind, Vec } from '../game/types';
import { Renderer, type DragGhost } from '../render/canvas';
import { Effects } from '../render/effects';
import { Hud } from './hud';
import { Dock } from './dock';
import { ENEMIES } from '../game/config';
import { loadMuted, saveMuted, starsFor } from '../storage';
import { GameAudio } from '../audio';

interface DragState {
  from: Loc;
  kind: SoldierKind;
  level: number;
}

interface Callout {
  text: string;
  className: string;
  duration: number;
}

const COMBO_RESET_MS = 2000;
const ELITE_BOUNTY = ENEMIES['将'].bounty;
const BOSS_BOUNTY = ENEMIES.boss.bounty;
const COMBO_STEPS: Array<{ count: number; phrase: string; tier: number }> = [
  { count: 5, phrase: '势如破竹', tier: 1 },
  { count: 10, phrase: '锐不可当', tier: 2 },
  { count: 15, phrase: '所向披靡', tier: 3 },
  { count: 20, phrase: '万夫莫敌', tier: 4 },
  { count: 30, phrase: '神威盖世', tier: 5 },
];

export class SingleGameScreen {
  private engine: Engine;
  private renderer: Renderer;
  private fx = new Effects();
  private hud: Hud;
  private dock: Dock;
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private lastTs = 0;
  private drag: DragState | null = null;
  private ghost: DragGhost | null = null;
  private selected: Vec | null = null;
  /** 待瞄准的锦囊道具序号（火攻），null=未选 */
  private armedItem: number | null = null;
  /** 瞄准中的画布像素位置 */
  private aim: { px: number; py: number } | null = null;
  private muted = false;
  private audio = new GameAudio();
  private bannerWave: HTMLElement;
  private bannerBoss: HTMLElement;
  private bannerCallout: HTMLElement;
  private bannerCombo: HTMLElement;
  private bossBannerTimer = 0;
  private waveBannerTimer = 0;
  private calloutTimer = 0;
  private comboTimer = 0;
  private comboCount = 0;
  private comboLastKillAt = 0;
  private firstBloodShown = false;
  private waveLeakCount = 0;
  private calloutQueue: Callout[] = [];
  private onFinish: (won: boolean, stars: number) => void;

  constructor(
    private root: HTMLElement,
    level: LevelDef,
    onFinish: (won: boolean, stars: number) => void,
  ) {
    this.onFinish = onFinish;
    this.engine = new Engine(level);
    this.root.innerHTML = `
      <div class="hud" data-hud></div>
      <div class="stage" data-stage>
        <canvas data-canvas></canvas>
        <div class="banner banner-wave" data-banner-wave></div>
        <div class="banner banner-boss" data-banner-boss></div>
        <div class="banner banner-callout" data-banner-callout></div>
        <div class="banner banner-combo" data-banner-combo></div>
      </div>
      <div class="dock" data-dock></div>`;
    this.canvas = root.querySelector('[data-canvas]') as HTMLCanvasElement;
    this.renderer = new Renderer(this.canvas, level);
    this.bannerWave = root.querySelector('[data-banner-wave]') as HTMLElement;
    this.bannerBoss = root.querySelector('[data-banner-boss]') as HTMLElement;
    this.bannerCallout = root.querySelector('[data-banner-callout]') as HTMLElement;
    this.bannerCombo = root.querySelector('[data-banner-combo]') as HTMLElement;

    const hudRoot = root.querySelector('[data-hud]') as HTMLElement;
    const dockRoot = root.querySelector('[data-dock]') as HTMLElement;

    this.muted = loadMuted();
    this.hud = new Hud(hudRoot, {
      onPause: () => {
        this.engine.paused = !this.engine.paused;
        this.syncHud();
      },
      onSpeed: () => {
        this.engine.speed = this.engine.speed === 1 ? 2 : 1;
        this.syncHud();
      },
      onMute: () => {
        this.muted = !this.muted;
        saveMuted(this.muted);
        this.audio.setMuted(this.muted);
        this.syncHud();
      },
    });

    this.dock = new Dock(dockRoot, {
      onRecruit: () => {
        recruit(this.engine.gs);
        this.dock.update(this.engine.gs, this.engine.level);
      },
      onSlotDown: (index, ev) => this.startDrag({ type: 'bench', index }, ev),
      onStartWave: () => {
        if (callWave(this.engine.gs, this.engine.level)) {
          this.dock.update(this.engine.gs, this.engine.level);
        }
      },
      onItemTap: (index) => this.onItemTap(index),
    });

    this.bindCanvasDrag();
    this.bindShovel();

    window.addEventListener('pointerdown', this.initAudio);
    window.addEventListener('resize', this.onResize);

    this.lastTs = performance.now();
    this.loop(this.lastTs);
    document.addEventListener('visibilitychange', this.onVisibility);

    // 仅开发环境：暴露引擎供无头浏览器验证脚本驱动
    if (import.meta.env.DEV) {
      (window as unknown as { __engine?: Engine }).__engine = this.engine;
    }
  }

  private initAudio = (): void => {
    this.audio.init();
    this.audio.startBgm();
    window.removeEventListener('pointerdown', this.initAudio);
  };

  private onResize = (): void => {
    this.renderer.resize();
  };

  /** 点击锦囊道具：需瞄准的进入瞄准态，其余立即释放 */
  private onItemTap(index: number): void {
    const gs = this.engine.gs;
    const item = gs.items[index];
    if (!item) return;
    if (ITEM_DEFS[item].targeted) {
      this.armedItem = this.armedItem === index ? null : index;
      this.dock.armedIndex = this.armedItem;
      this.aim = null;
      if (this.armedItem !== null) {
        this.queueCallout(`点选战场施放「${ITEM_DEFS[item].name}」`, 'callout-item', 1.4);
      }
      return;
    }
    this.armedItem = null;
    this.dock.armedIndex = null;
    if (!useItem(gs, this.engine.level, index)) {
      this.audio.ui('error');
    }
    this.dock.update(gs, this.engine.level);
  }

  private bindCanvasDrag(): void {
    this.canvas.addEventListener('pointerdown', (ev) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const cell = this.renderer.pxToCell(px, py);
      if (!cell) return;
      // 瞄准态：本次点击用于释放道具
      if (this.armedItem !== null) {
        if (useItem(this.engine.gs, this.engine.level, this.armedItem, cell)) {
          this.armedItem = null;
          this.dock.armedIndex = null;
          this.aim = null;
        } else {
          this.audio.ui('error');
        }
        return;
      }
      const s = soldierAt(this.engine.gs, cell);
      if (s) {
        this.startDrag({ type: 'cell', cell }, ev);
      } else {
        this.selected = cell;
      }
    });
    this.canvas.addEventListener('pointermove', (ev) => {
      if (this.armedItem === null) return;
      const rect = this.canvas.getBoundingClientRect();
      this.aim = { px: ev.clientX - rect.left, py: ev.clientY - rect.top };
    });
  }

  private bindShovel(): void {
    const shovel = this.dock.shovelEl;
    shovel.addEventListener('pointerdown', (ev) => {
      if (this.selected) {
        if (sellSoldier(this.engine.gs, this.selected)) {
          this.dock.update(this.engine.gs, this.engine.level);
        }
        this.selected = null;
      }
      ev.stopPropagation();
    });
  }

  private startDrag(from: Loc, ev: PointerEvent): void {
    const gs = this.engine.gs;
    let kind: SoldierKind;
    let level: number;
    if (from.type === 'bench') {
      const s = gs.bench[from.index];
      if (!s) return;
      kind = s.kind;
      level = s.level;
      this.dock.dragIndex = from.index;
      this.dock.update(gs, this.engine.level);
    } else {
      const s = soldierAt(gs, from.cell);
      if (!s) return;
      kind = s.kind;
      level = s.level;
    }
    this.drag = { from, kind, level };
    this.selected = null;
    (ev.target as Element).setPointerCapture(ev.pointerId);

    const move = (e: PointerEvent) => this.onDragMove(e);
    const up = (e: PointerEvent) => {
      this.onDragEnd(e);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.onDragMove(ev);
  }

  private onDragMove(ev: PointerEvent): void {
    if (!this.drag) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    this.ghost = { kind: this.drag.kind, level: this.drag.level, px, py };
  }

  private onDragEnd(ev: PointerEvent): void {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    this.ghost = null;
    this.dock.dragIndex = null;

    const rect = this.canvas.getBoundingClientRect();
    const inCanvas =
      ev.clientX >= rect.left && ev.clientX <= rect.right &&
      ev.clientY >= rect.top && ev.clientY <= rect.bottom;

    let to: Loc | null = null;
    if (inCanvas) {
      const cell = this.renderer.pxToCell(ev.clientX - rect.left, ev.clientY - rect.top);
      if (cell) to = { type: 'cell', cell };
    } else {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const shovelEl = el?.closest('[data-shovel]') as HTMLElement | null;
      if (shovelEl && drag.from.type === 'cell') {
        sellSoldier(this.engine.gs, drag.from.cell);
        this.dock.update(this.engine.gs, this.engine.level);
        return;
      }
      const slotEl = el?.closest('[data-slot]') as HTMLElement | null;
      if (slotEl) {
        const idx = Number(slotEl.dataset.slot);
        if (!Number.isNaN(idx)) to = { type: 'bench', index: idx };
      }
    }
    if (to) moveSoldier(this.engine.level, this.engine.gs, drag.from, to);
    this.dock.update(this.engine.gs, this.engine.level);
  }

  private syncHud(): void {
    this.hud.update(this.engine.gs, this.engine.level, {
      paused: this.engine.paused,
      speed: this.engine.speed,
      muted: this.muted,
    });
  }

  private queueCallout(text: string, className: string, duration = 1.25): void {
    this.calloutQueue.push({ text, className, duration });
    if (this.calloutTimer <= 0 && !this.bannerCallout.classList.contains('show')) {
      this.showNextCallout();
    }
  }

  private showNextCallout(): void {
    const next = this.calloutQueue.shift();
    if (!next) {
      this.bannerCallout.className = 'banner banner-callout';
      this.bannerCallout.textContent = '';
      return;
    }
    this.bannerCallout.className = `banner banner-callout ${next.className}`;
    this.bannerCallout.textContent = next.text;
    this.bannerCallout.classList.add('show');
    this.calloutTimer = next.duration;
  }

  private showComboBanner(text: string, tier: number, duration: number): void {
    this.bannerCombo.className = `banner banner-combo combo-tier-${tier}`;
    this.bannerCombo.textContent = text;
    this.bannerCombo.classList.add('show');
    this.comboTimer = duration;
  }

  private resetCombo(): void {
    this.comboCount = 0;
    this.comboTimer = 0;
    this.bannerCombo.className = 'banner banner-combo';
    this.bannerCombo.textContent = '';
  }

  private handleKill(e: { x: number; y: number; bounty: number }): void {
    this.comboCount += 1;
    this.comboLastKillAt = this.lastTs;

    if (!this.firstBloodShown) {
      this.firstBloodShown = true;
      this.fx.praise(1, e.x, e.y);
      this.queueCallout('首杀', 'callout-first-blood', 1.0);
    }

    if (e.bounty >= BOSS_BOUNTY) {
      this.fx.praise(5, e.x, e.y);
      this.fx.shake(6);
      this.queueCallout('斩王！', 'callout-elite callout-boss', 1.15);
    } else if (e.bounty >= ELITE_BOUNTY) {
      this.fx.praise(4, e.x, e.y);
      this.fx.shake(4);
      this.queueCallout('斩将！', 'callout-elite', 1.0);
    }

    const milestone = COMBO_STEPS.find((step) => step.count === this.comboCount);
    if (milestone) {
      this.fx.praise(milestone.tier, e.x, e.y);
      this.audio.praise(milestone.tier);
      this.showComboBanner(`连斩 ×${milestone.count} · ${milestone.phrase}`, milestone.tier, 1.1 + milestone.tier * 0.1);
    }
  }

  private handleWaveStart(wave: number): void {
    if (wave > 0 && this.waveLeakCount === 0) {
      this.fx.praise(2, 3, 4.5);
      this.queueCallout('完美防守！', 'callout-perfect', 1.25);
    }
    this.waveLeakCount = 0;
  }

  private onVisibility = (): void => {
    if (document.hidden) {
      this.engine.paused = true;
      this.audio.stopBgm();
    }
    this.syncHud();
  };

  private loop = (ts: number): void => {
    const rawDt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    if (this.comboCount > 0 && ts - this.comboLastKillAt > COMBO_RESET_MS) {
      this.resetCombo();
    }
    const dt = this.fx.hitstop > 0 ? rawDt * 0.12 : rawDt;
    const events = this.engine.tick(dt);
    for (const e of events) {
      this.fx.spawn(e);
      this.audio.play(e);
      if (e.t === 'shoot') {
        const dx = e.to.x - e.from.x;
        const dy = e.to.y - e.from.y;
        const len = Math.hypot(dx, dy) || 1;
        this.fx.soldierLunge(e.soldierId, dx / len, dy / len);
      } else if (e.t === 'hit') {
        this.fx.enemyFlash(e.enemyId);
      } else if (e.t === 'merge') {
        this.fx.soldierMerge(e.soldierId);
      } else if (e.t === 'deploy') {
        this.fx.soldierDrop(e.soldierId);
      } else if (e.t === 'kill') {
        this.handleKill(e);
      } else if (e.t === 'leak') {
        this.waveLeakCount += 1;
      }
      if (e.t === 'waveStart') {
        this.bannerWave.textContent = `第 ${e.wave + 1} 波`;
        this.bannerWave.classList.add('show');
        this.waveBannerTimer = 1.6;
        this.handleWaveStart(e.wave);
      } else if (e.t === 'boss') {
        this.bannerBoss.textContent = `❰ ${e.word} 王 来 袭 ❱`;
        this.bannerBoss.classList.add('show');
        this.bossBannerTimer = 2.6;
      } else if (e.t === 'won') {
        if (this.waveLeakCount === 0) {
          this.fx.praise(2, 3, 4.5);
          this.queueCallout('完美防守！', 'callout-perfect', 1.25);
        }
      }
    }
    if (this.waveBannerTimer > 0) {
      this.waveBannerTimer -= dt;
      if (this.waveBannerTimer <= 0) this.bannerWave.classList.remove('show');
    }
    if (this.bossBannerTimer > 0) {
      this.bossBannerTimer -= dt;
      if (this.bossBannerTimer <= 0) this.bannerBoss.classList.remove('show');
    }
    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) {
        this.bannerCallout.classList.remove('show');
        this.calloutTimer = 0;
        this.showNextCallout();
      }
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.bannerCombo.classList.remove('show');
        this.comboTimer = 0;
      }
    }
    this.fx.update(dt);
    this.syncHud();
    this.dock.update(this.engine.gs, this.engine.level);
    this.renderer.draw(this.engine.gs, this.fx, {
      ghost: this.ghost,
      selected: this.selected,
      dragFrom: this.drag && this.drag.from.type === 'cell' ? this.drag.from.cell : null,
      aim: this.armedItem !== null && this.aim ? { ...this.aim, radius: FIRE_RADIUS } : null,
    });
    if (this.engine.gs.status !== 'playing') {
      cancelAnimationFrame(this.raf);
      const won = this.engine.gs.status === 'won';
      const stars = won ? starsFor(this.engine.gs.baseHp) : 0;
      this.onFinish(won, stars);
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  destroy(): void {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointerdown', this.initAudio);
    window.removeEventListener('resize', this.onResize);
    this.audio.stopBgm();
  }
}