import { BENCH_SIZE } from '../game/config';
import {
  AI_CONFIGS,
  ITEMS,
  aiTick,
  createVersusGame,
  moveSoldier as vsMove,
  recruit as vsRecruit,
  sellSoldier as vsSell,
  soldierAt,
  tickVersus,
  useItem,
  type AiConfig,
  type Difficulty,
  type Side,
  type VersusGame,
} from '../game/versus';
import type { SoldierKind, Vec } from '../game/types';
import { VersusRenderer, type VersusDragGhost } from '../render/versus-canvas';
import { Effects } from '../render/effects';
import { loadMuted, saveMuted } from '../storage';
import { GameAudio } from '../audio';

interface VsDragState {
  side: Side;
  from: { type: 'bench'; index: number } | { type: 'cell'; cell: Vec };
  kind: SoldierKind;
  level: number;
}

const AI_NAMES = ['张角', '董卓', '吕布', '袁绍', '刘表', '孙坚', '公孙瓒', '马腾'];

export interface VersusOpts {
  difficulty: Difficulty;
  localTwoPlayer?: boolean; // 本地双人热座
  p2Name?: string;
  seed?: number;
}

export class VersusScreen {
  private game: VersusGame;
  private renderer: VersusRenderer;
  private fx = new Effects();
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private lastTs = 0;
  private drag: VsDragState | null = null;
  private ghost: VersusDragGhost | null = null;
  private muted = false;
  private audio = new GameAudio();
  private aiCfg: AiConfig;
  private onFinish: (result: 'won' | 'lost' | 'draw') => void;
  private localTwoPlayer: boolean;

  constructor(
    private root: HTMLElement,
    opts: VersusOpts,
    onFinish: (result: 'won' | 'lost' | 'draw') => void,
  ) {
    this.onFinish = onFinish;
    this.localTwoPlayer = !!opts.localTwoPlayer;
    this.aiCfg = AI_CONFIGS[opts.difficulty];
    this.game = createVersusGame({
      seed: opts.seed,
      p2Name: opts.p2Name ?? AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)],
      p2Ai: !opts.localTwoPlayer,
      difficulty: opts.difficulty,
    });
    this.muted = loadMuted();
    this.buildDom();
    this.canvas = root.querySelector('[data-canvas]') as HTMLCanvasElement;
    this.renderer = new VersusRenderer(this.canvas, this.game);
    this.bindCanvasDrag();
    this.bindDock('p1');
    if (this.localTwoPlayer) this.bindDock('p2');

    window.addEventListener('pointerdown', this.initAudio);
    window.addEventListener('resize', this.onResize);

    this.lastTs = performance.now();
    this.loop(this.lastTs);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private initAudio = (): void => {
    this.audio.init();
    this.audio.startBgm();
    window.removeEventListener('pointerdown', this.initAudio);
  };

  private onResize = (): void => {
    this.renderer.resize();
  };

  private buildDom(): void {
    const p2Label = this.localTwoPlayer ? '玩家二' : this.game.p2.name;
    this.root.innerHTML = `
      <div class="vs-hud">
        <div class="vs-side vs-p1">
          <div class="vs-name">你</div>
          <div class="vs-hp" data-hp1>♥ 10</div>
          <div class="vs-food" data-food1>🍚 30</div>
        </div>
        <div class="vs-center">
          <button class="icon-btn" data-pause title="暂停">⏸</button>
          <button class="icon-btn" data-mute title="音效">🔊</button>
        </div>
        <div class="vs-side vs-p2">
          <div class="vs-name">${p2Label}</div>
          <div class="vs-hp" data-hp2>♥ 10</div>
          <div class="vs-food" data-food2>🍚 30</div>
        </div>
      </div>
      <div class="stage" data-stage>
        <canvas data-canvas></canvas>
        <div class="banner banner-vs" data-banner></div>
      </div>
      <div class="vs-dock" data-dock-p1></div>
      ${this.localTwoPlayer ? '<div class="vs-dock vs-dock-p2" data-dock-p2></div>' : ''}`;

    this.root.querySelector('[data-pause]')!.addEventListener('click', () => {
      this.paused = !this.paused;
      (this.root.querySelector('[data-pause]') as HTMLElement).textContent = this.paused ? '▶' : '⏸';
    });
    this.root.querySelector('[data-mute]')!.addEventListener('click', () => {
      this.muted = !this.muted;
      saveMuted(this.muted);
      this.audio.setMuted(this.muted);
      (this.root.querySelector('[data-mute]') as HTMLElement).textContent = this.muted ? '🔇' : '🔊';
    });
  }

  private paused = false;

  private bindDock(side: Side): void {
    const dockRoot = this.root.querySelector(side === 'p1' ? '[data-dock-p1]' : '[data-dock-p2]') as HTMLElement;
    dockRoot.className = 'vs-dock' + (side === 'p2' ? ' vs-dock-p2' : '');
    const slots = Array.from({ length: BENCH_SIZE }, (_, i) => `<div class="slot" data-slot="${side}-${i}"></div>`).join('');
    dockRoot.innerHTML = `
      <div class="vs-dock-row">
        <div class="camp"><div class="camp-roof"></div><div class="camp-body">营</div></div>
        <div class="slot slot-shovel" data-shovel="${side}">⛏</div>
        ${slots}
      </div>
      <div class="vs-items" data-items="${side}"></div>
      <button class="recruit-btn" data-recruit="${side}"><span>征 兵</span><span class="recruit-cost">🍚 <b data-cost="${side}">10</b></span></button>`;
    // 征兵
    dockRoot.querySelector(`[data-recruit="${side}"]`)!.addEventListener('click', () => {
      vsRecruit(this.game[side]);
      this.syncDock(side);
    });
    // 背包槽拖动
    for (let i = 0; i < BENCH_SIZE; i++) {
      const el = dockRoot.querySelector(`[data-slot="${side}-${i}"]`) as HTMLElement;
      el.addEventListener('pointerdown', (ev) => this.startDrag(side, { type: 'bench', index: i }, ev));
    }
    // 铲子
    const shovelEl = dockRoot.querySelector(`[data-shovel="${side}"]`) as HTMLElement;
    shovelEl.addEventListener('pointerdown', (ev) => {
      if (this.selected && this.selectedSide === side) {
        vsSell(this.game[side], this.selected);
        this.selected = null;
        this.syncDock(side);
      }
      ev.stopPropagation();
    });
    // 道具栏：事件委托，只绑一次（按钮内容会随状态重建）
    const itemsEl = dockRoot.querySelector(`[data-items="${side}"]`) as HTMLElement;
    itemsEl.addEventListener('click', (ev) => {
      const btn = (ev.target as Element).closest<HTMLElement>('[data-item]');
      if (!btn || !btn.dataset.item) return;
      const idx = Number(btn.dataset.item.split('-')[1]);
      const kind = this.game[side].items[idx];
      if (!kind) return;
      const def = ITEMS[kind];
      if (this.game[side].food < def.cost) return;
      const target = this.selected && this.selectedSide === side ? this.selected : undefined;
      if (!useItem(this.game, side, kind, target)) {
        this.audio.ui('error');
      }
      this.syncDock(side);
    });
  }

  private bindCanvasDrag(): void {
    this.canvas.addEventListener('pointerdown', (ev) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const side = this.renderer.pxToSide(py);
      const cell = this.renderer.pxToSideCell(side, px, py);
      if (!cell) return;
      const s = soldierAt(this.game[side], cell);
      if (s) {
        this.startDrag(side, { type: 'cell', cell }, ev);
      } else {
        this.selected = cell;
        this.selectedSide = side;
      }
    });
  }

  private selected: Vec | null = null;
  private selectedSide: Side = 'p1';
  private lastItemsHtml: Record<Side, string> = { p1: '', p2: '' };
  private bannerTimer = 0;

  private startDrag(side: Side, from: VsDragState['from'], ev: PointerEvent): void {
    const p = this.game[side];
    let kind: SoldierKind;
    let level: number;
    if (from.type === 'bench') {
      const s = p.bench[from.index];
      if (!s) return;
      kind = s.kind;
      level = s.level;
    } else {
      const s = soldierAt(p, from.cell);
      if (!s) return;
      kind = s.kind;
      level = s.level;
    }
    this.drag = { side, from, kind, level };
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
    this.ghost = { side: this.drag.side, kind: this.drag.kind, level: this.drag.level, px, py };
  }

  private onDragEnd(ev: PointerEvent): void {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    this.ghost = null;
    const rect = this.canvas.getBoundingClientRect();
    const inCanvas = ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
    let to: { type: 'bench'; index: number } | { type: 'cell'; cell: Vec } | null = null;
    if (inCanvas) {
      const py = ev.clientY - rect.top;
      const side = this.renderer.pxToSide(py);
      // 只能放到自己半场
      if (side === drag.side) {
        const cell = this.renderer.pxToSideCell(side, ev.clientX - rect.left, py);
        if (cell) to = { type: 'cell', cell };
      }
    } else {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const shovelEl = el?.closest('[data-shovel]') as HTMLElement | null;
      if (shovelEl && shovelEl.dataset.shovel && drag.side === (shovelEl.dataset.shovel as Side) && drag.from.type === 'cell') {
        vsSell(this.game[drag.side], drag.from.cell);
        this.syncDock(drag.side);
        return;
      }
      const slotEl = el?.closest('[data-slot]') as HTMLElement | null;
      if (slotEl && slotEl.dataset.slot) {
        const [sideStr, idxStr] = slotEl.dataset.slot.split('-');
        if (sideStr === drag.side) {
          const idx = Number(idxStr);
          if (!Number.isNaN(idx)) to = { type: 'bench', index: idx };
        }
      }
    }
    if (to) {
      vsMove(this.game, drag.side, drag.from, to);
      this.syncDock(drag.side);
    }
  }

  private syncDock(side: Side): void {
    const root = this.root.querySelector(side === 'p1' ? '[data-dock-p1]' : '[data-dock-p2]') as HTMLElement;
    const p = this.game[side];
    for (let i = 0; i < BENCH_SIZE; i++) {
      const el = root.querySelector(`[data-slot="${side}-${i}"]`) as HTMLElement;
      const s = p.bench[i];
      const html = s
        ? `<span class="slot-word${s.kind === '忠' ? ' word-loyal' : ''}">${s.kind}</span>${s.level > 1 ? `<span class="slot-level">${s.level}</span>` : ''}`
        : '';
      if (el.innerHTML !== html) el.innerHTML = html;
    }
    const costEl = root.querySelector(`[data-cost="${side}"]`) as HTMLElement;
    if (costEl) costEl.textContent = String(p.recruitCost);
    const recBtn = root.querySelector(`[data-recruit="${side}"]`) as HTMLButtonElement;
    if (recBtn) recBtn.disabled = p.food < p.recruitCost || !p.bench.some((s) => s === null);
    // 道具栏：内容变化才重建 DOM（每帧重建会吞掉点击），事件走 bindDock 的委托
    const itemsEl = root.querySelector(`[data-items="${side}"]`) as HTMLElement;
    if (itemsEl) {
      const html = p.items
        .map((k, i) => {
          const d = ITEMS[k];
          const disabled = p.food < d.cost ? ' vs-item-disabled' : '';
          return `<button class="vs-item vs-item-${d.cat}${disabled}" data-item="${side}-${i}" title="${d.desc}">${d.name}</button>`;
        })
        .join('');
      if (this.lastItemsHtml[side] !== html) {
        itemsEl.innerHTML = html;
        this.lastItemsHtml[side] = html;
      }
    }
  }

  private showBanner(text: string): void {
    const el = this.root.querySelector('[data-banner]') as HTMLElement;
    el.textContent = text;
    el.classList.add('show');
    this.bannerTimer = 1.4;
  }

  private syncHud(): void {
    const h1 = this.root.querySelector('[data-hp1]') as HTMLElement;
    const h2 = this.root.querySelector('[data-hp2]') as HTMLElement;
    const f1 = this.root.querySelector('[data-food1]') as HTMLElement;
    const f2 = this.root.querySelector('[data-food2]') as HTMLElement;
    h1.textContent = `♥ ${this.game.p1.hp}`;
    h2.textContent = `♥ ${this.game.p2.hp}`;
    f1.textContent = `🍚 ${this.game.p1.food}`;
    f2.textContent = `🍚 ${this.game.p2.food}`;
  }

  private onVisibility = (): void => {
    if (document.hidden) {
      this.paused = true;
      this.audio.stopBgm();
    }
  };

  private loop = (ts: number): void => {
    const rawDt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    const dt = this.fx.hitstop > 0 ? rawDt * 0.12 : rawDt;
    if (!this.paused && this.game.status === 'playing') {
      tickVersus(this.game, dt);
      // AI 决策
      if (!this.localTwoPlayer && this.game.p2.isAi) {
        aiTick(this.game, 'p2', this.aiCfg);
      }
      // 事件 → fx（音效暂用简化映射）
      for (const e of this.game.events) {
        if (e.t === 'hit') {
          this.fx.enemyFlash(e.enemyId ?? 0);
        } else if (e.t === 'itemUsed' && e.item) {
          const who = e.side === 'p1' ? this.game.p1.name : this.game.p2.name;
          this.showBanner(`${who} 用「${ITEMS[e.item].name}」`);
          this.audio.ui('click');
        }
      }
      this.game.events = [];
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= rawDt;
      if (this.bannerTimer <= 0) {
        (this.root.querySelector('[data-banner]') as HTMLElement).classList.remove('show');
      }
    }
    this.fx.update(rawDt);
    this.syncHud();
    this.syncDock('p1');
    if (this.localTwoPlayer) this.syncDock('p2');

    this.renderer.draw(this.fx, {
      ghost: this.ghost,
      dragFrom: this.drag ? { side: this.drag.side, cell: this.drag.from.type === 'cell' ? this.drag.from.cell : { x: -1, y: -1 } } : null,
    });

    if (this.game.status !== 'playing') {
      cancelAnimationFrame(this.raf);
      const r = this.game.status === 'won' ? 'won' : this.game.status === 'lost' ? 'lost' : 'draw';
      this.onFinish(r as 'won' | 'lost' | 'draw');
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