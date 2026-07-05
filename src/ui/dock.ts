import { BENCH_SIZE } from '../game/config';
import type { GameState } from '../game/types';

export interface DockHandlers {
  onRecruit: () => void;
  /** 在某个背包槽上按下（开始拖动） */
  onSlotDown: (index: number, ev: PointerEvent) => void;
  /** 手动立即开波（休整态时可用） */
  onStartWave: () => void;
}

export class Dock {
  readonly shovelEl: HTMLElement;
  private slotEls: HTMLElement[] = [];
  private recruitBtn: HTMLButtonElement;
  private costEl: HTMLElement;
  private waveBtn: HTMLButtonElement;

  constructor(root: HTMLElement, handlers: DockHandlers) {
    root.className = 'dock';
    const slots = Array.from(
      { length: BENCH_SIZE },
      (_, i) => `<div class="slot" data-slot="${i}"></div>`,
    ).join('');
    root.innerHTML = `
      <div class="dock-row">
        <div class="camp"><div class="camp-roof"></div><div class="camp-body">营</div></div>
        <div class="slot slot-shovel" data-shovel>⛏</div>
        ${slots}
      </div>
      <button class="recruit-btn" data-recruit>
        <span class="recruit-label">征 兵</span>
        <span class="recruit-cost">🍚 <b data-cost>10</b></span>
      </button>
      <button class="wave-btn" data-wave>开 波</button>`;
    this.shovelEl = root.querySelector('[data-shovel]')!;
    this.recruitBtn = root.querySelector('[data-recruit]')!;
    this.costEl = root.querySelector('[data-cost]')!;
    this.waveBtn = root.querySelector('[data-wave]') as HTMLButtonElement;
    this.recruitBtn.addEventListener('click', handlers.onRecruit);
    this.waveBtn.addEventListener('click', handlers.onStartWave);
    for (let i = 0; i < BENCH_SIZE; i++) {
      const el = root.querySelector<HTMLElement>(`[data-slot="${i}"]`)!;
      this.slotEls.push(el);
      el.addEventListener('pointerdown', (ev) => handlers.onSlotDown(i, ev));
    }
  }

  /** 拖动中的背包槽（半透明显示） */
  dragIndex: number | null = null;

  update(gs: GameState): void {
    for (let i = 0; i < BENCH_SIZE; i++) {
      const s = gs.bench[i];
      const el = this.slotEls[i];
      const html = s
        ? `<span class="slot-word${s.kind === '忠' ? ' word-loyal' : ''}">${s.kind}</span>${
            s.level > 1 ? `<span class="slot-level">${s.level}</span>` : ''
          }`
        : '';
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('slot-dragging', this.dragIndex === i);
    }
    const canBuy = gs.food >= gs.recruitCost && gs.bench.some((s) => s === null);
    this.recruitBtn.disabled = !canBuy;
    if (this.costEl.textContent !== String(gs.recruitCost)) {
      this.costEl.textContent = String(gs.recruitCost);
    }
    if (gs.intermission && gs.waveIndex < 0) {
      this.waveBtn.textContent = '开 战';
      this.waveBtn.disabled = false;
    } else if (gs.intermission) {
      const sec = Math.max(0, Math.ceil(gs.waveTimer));
      this.waveBtn.textContent = `开 波 (${sec}s)`;
      this.waveBtn.disabled = false;
    } else {
      this.waveBtn.textContent = `第 ${gs.waveIndex + 1} 波`;
      this.waveBtn.disabled = true;
    }
  }
}
