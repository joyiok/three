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
import { showLevelSelect, showMenu, showResult } from './ui/screens';
import { loadMuted, loadProgress, saveMuted, saveStars, starsFor } from './storage';
import { GameAudio } from './audio';

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
  private audio = new GameAudio();
  private bannerWave: HTMLElement;
  private bannerBoss: HTMLElement;
  private bossBannerTimer = 0;
  private waveBannerTimer = 0;
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
      </div>
      <div class="dock" data-dock></div>`;
    this.canvas = root.querySelector('[data-canvas]') as HTMLCanvasElement;
    this.renderer = new Renderer(this.canvas, level);
    this.bannerWave = root.querySelector('[data-banner-wave]') as HTMLElement;
    this.bannerBoss = root.querySelector('[data-banner-boss]') as HTMLElement;

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

    // 首次交互启动音频
    const initAudio = () => {
      this.audio.init();
      this.audio.startBgm();
      window.removeEventListener('pointerdown', initAudio);
    };
    window.addEventListener('pointerdown', initAudio);

    this.lastTs = performance.now();
    this.loop(this.lastTs);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private bindCanvasDrag(): void {
    this.canvas.addEventListener('pointerdown', (ev) => {
      const rect = this.canvas.getBoundingClientRect();
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
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const shovelEl = el?.closest('[data-shovel]') as HTMLElement | null;
      if (shovelEl && drag.from.type === 'cell') {
        sellSoldier(this.engine.gs, drag.from.cell);
        this.dock.update(this.engine.gs);
        return;
      }
      const slotEl = el?.closest('[data-slot]') as HTMLElement | null;
      if (slotEl) {
        const idx = Number(slotEl.dataset.slot);
        if (!Number.isNaN(idx)) to = { type: 'bench', index: idx };
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
    // 命中停顿期间大幅减慢逻辑，但视觉继续
    const dt = this.fx.hitstop > 0 ? rawDt * 0.12 : rawDt;
    const events = this.engine.tick(dt);
    for (const e of events) {
      this.fx.spawn(e);
      this.audio.play(e);
      if (e.t === 'shoot') {
        // 攻击冲刺：朝目标方向
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
      }
      if (e.t === 'waveStart') {
        this.bannerWave.textContent = `第 ${e.wave + 1} 波`;
        this.bannerWave.classList.add('show');
        this.waveBannerTimer = 1.6;
      } else if (e.t === 'boss') {
        this.bannerBoss.textContent = `❰ ${e.word} 王 来 袭 ❱`;
        this.bannerBoss.classList.add('show');
        this.bossBannerTimer = 2.6;
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
    this.fx.update(dt);
    this.syncHud();
    this.dock.update(this.engine.gs);

    this.renderer.draw(this.engine.gs, this.fx, {
      ghost: this.ghost,
      selected: this.selected,
      dragFrom: this.drag && this.drag.from.type === 'cell' ? this.drag.from.cell : null,
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
    this.audio.stopBgm();
  }
}

// ===== Router =====
class App {
  private root: HTMLElement;
  private levelIndex = 0;
  private game: GameScreen | null = null;
  private lastResult: { won: boolean; stars: number } = { won: false, stars: 0 };
  private progress = loadProgress();

  constructor() {
    this.root = document.querySelector<HTMLDivElement>('#app')!;
    this.showMenu();
  }

  private showMenu(): void {
    this.clearGame();
    showMenu(this.root, () => this.showLevelSelect());
  }

  private showLevelSelect(): void {
    this.clearGame();
    this.progress = loadProgress();
    showLevelSelect(
      this.root,
      this.progress,
      (i) => {
        this.levelIndex = i;
        this.startGame();
      },
      () => this.showMenu(),
    );
  }

  private startGame(): void {
    this.clearGame();
    this.root.innerHTML = '';
    const level = LEVELS[this.levelIndex];
    this.game = new GameScreen(this.root, level, (won, stars) => {
      this.lastResult = { won, stars };
      if (won) saveStars(level.id, stars);
      this.progress = loadProgress();
      // 延迟一帧再切到结算页，避免 canvas 抖动
      setTimeout(() => this.showResult(), 400);
    });
  }

  private showResult(): void {
    this.clearGame();
    const hasNext = this.levelIndex < LEVELS.length - 1;
    showResult(this.root, {
      won: this.lastResult.won,
      stars: this.lastResult.stars,
      hasNext,
      onRetry: () => this.startGame(),
      onNext: () => {
        this.levelIndex++;
        this.startGame();
      },
      onBack: () => this.showLevelSelect(),
    });
  }

  private clearGame(): void {
    if (this.game) {
      this.game.destroy();
      this.game = null;
    }
  }
}

new App();