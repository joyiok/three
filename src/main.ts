import './style.css';
import { LEVELS } from './game/levels';
import { Engine } from './game/engine';
import { moveSoldier, recruit, sellSoldier, soldierAt } from './game/state';
import { startWave } from './game/waves';
import type { LevelDef, Loc, SoldierKind, Vec } from './game/types';
import { Renderer, type DragGhost } from './render/canvas';
import { Effects } from './render/effects';
import { Hud } from './ui/hud';
import { Dock } from './ui/dock';

interface DragState {
  from: Loc;
  kind: SoldierKind;
  level: number;
}

export class GameScreen {
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
  private muted = false;
  private onExit: () => void;

  constructor(
    private root: HTMLElement,
    level: LevelDef,
    onExit: () => void,
  ) {
    this.onExit = onExit;
    this.engine = new Engine(level);
    this.root.innerHTML = `
      <div class="hud" data-hud></div>
      <div class="stage" data-stage>
        <canvas data-canvas></canvas>
      </div>
      <div class="dock" data-dock></div>`;
    this.canvas = root.querySelector('[data-canvas]') as HTMLCanvasElement;
    this.renderer = new Renderer(this.canvas, level);

    const hudRoot = root.querySelector('[data-hud]') as HTMLElement;
    const dockRoot = root.querySelector('[data-dock]') as HTMLElement;

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
        this.syncHud();
      },
    });

    this.dock = new Dock(dockRoot, {
      onRecruit: () => {
        recruit(this.engine.gs);
        this.dock.update(this.engine.gs);
      },
      onSlotDown: (index, ev) => this.startDrag({ type: 'bench', index }, ev),
      onStartWave: () => {
        if (this.engine.gs.intermission) {
          startWave(this.engine.gs, this.engine.level);
          this.dock.update(this.engine.gs);
        }
      },
    });

    this.bindCanvasDrag();
    this.bindShovel();

    this.lastTs = performance.now();
    this.loop(this.lastTs);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => {
    if (document.hidden) this.engine.paused = true;
    this.syncHud();
  };

  private bindCanvasDrag(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (ev) => {
      const rect = c.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const cell = this.renderer.pxToCell(px, py);
      if (!cell) return;
      const s = soldierAt(this.engine.gs, cell);
      if (s) {
        this.startDrag({ type: 'cell', cell }, ev);
      } else {
        this.selected = cell;
      }
    });
  }

  private bindShovel(): void {
    const shovel = this.dock.shovelEl;
    shovel.addEventListener('pointerdown', (ev) => {
      if (this.selected) {
        if (sellSoldier(this.engine.gs, this.selected)) {
          this.dock.update(this.engine.gs);
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
      this.dock.update(gs);
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

    // 找落点
    const rect = this.canvas.getBoundingClientRect();
    const inCanvas =
      ev.clientX >= rect.left &&
      ev.clientX <= rect.right &&
      ev.clientY >= rect.top &&
      ev.clientY <= rect.bottom;

    let to: Loc | null = null;
    if (inCanvas) {
      const cell = this.renderer.pxToCell(ev.clientX - rect.left, ev.clientY - rect.top);
      if (cell) to = { type: 'cell', cell };
    } else {
      // 检查是否落在某个背包槽
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const slotEl = el?.closest('[data-slot]') as HTMLElement | null;
      if (slotEl) {
        const idx = Number(slotEl.dataset.slot);
        if (!Number.isNaN(idx)) to = { type: 'bench', index: idx };
      }
      // 检查是否落在铲子
      const shovelEl = el?.closest('[data-shovel]') as HTMLElement | null;
      if (shovelEl && drag.from.type === 'cell') {
        sellSoldier(this.engine.gs, drag.from.cell);
        this.dock.update(this.engine.gs);
        return;
      }
    }

    if (to) moveSoldier(this.engine.level, this.engine.gs, drag.from, to);
    this.dock.update(this.engine.gs);
  }

  private syncHud(): void {
    this.hud.update(this.engine.gs, this.engine.level, {
      paused: this.engine.paused,
      speed: this.engine.speed,
      muted: this.muted,
    });
  }

  private loop = (ts: number): void => {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    const events = this.engine.tick(dt);
    for (const e of events) this.fx.spawn(e);
    this.fx.update(dt);
    this.syncHud();
    this.dock.update(this.engine.gs);

    const opts = {
      ghost: this.ghost,
      selected: this.selected,
      dragFrom:
        this.drag && this.drag.from.type === 'cell' ? this.drag.from.cell : null,
    };
    this.renderer.draw(this.engine.gs, this.fx, opts);

    if (this.engine.gs.status !== 'playing') {
      cancelAnimationFrame(this.raf);
      this.onExit();
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  destroy(): void {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}

// 临时入口：直接启动第一关，循环到下一关
function start(): void {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  let levelIndex = 0;
  let screen: GameScreen | null = null;

  const launch = () => {
    if (screen) screen.destroy();
    const level = LEVELS[levelIndex];
    screen = new GameScreen(app, level, () => {
      if (levelIndex < LEVELS.length - 1) {
        levelIndex++;
        launch();
      } else {
        app.innerHTML = `<h1 style="text-align:center;margin-top:40vh">通关！</h1>`;
      }
    });
  };
  launch();
}

start();