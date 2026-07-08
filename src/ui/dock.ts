import { BENCH_SIZE, EARLY_CALL_MAX, ITEM_BAG_MAX } from '../game/config';
import { ITEM_DEFS } from '../game/items';
import { wavePreview } from '../game/waves';
import type { GameState, LevelDef } from '../game/types';

export interface DockHandlers {
  onRecruit: () => void;
  /** 在某个背包槽上按下（开始拖动） */
  onSlotDown: (index: number, ev: PointerEvent) => void;
  /** 手动立即开波（休整态时可用） */
  onStartWave: () => void;
  /** 点击锦囊道具 */
  onItemTap: (index: number) => void;
}

export class Dock {
  readonly shovelEl: HTMLElement;
  private slotEls: HTMLElement[] = [];
  private recruitBtn: HTMLButtonElement;
  private costEl: HTMLElement;
  private waveBtn: HTMLButtonElement;
  private previewEl: HTMLElement;

  constructor(root: HTMLElement, handlers: DockHandlers) {
    root.className = 'dock';
    const slots = Array.from(
      { length: BENCH_SIZE },
      (_, i) => `<div class="slot" data-slot="${i}"></div>`,
    ).join('');
    root.innerHTML = `
      <div class="wave-preview" data-preview></div>
      <div class="item-bar" data-items></div>
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
    this.previewEl = root.querySelector('[data-preview]')!;
    this.itemsEl = root.querySelector('[data-items]')!;
    this.recruitBtn.addEventListener('click', handlers.onRecruit);
    this.waveBtn.addEventListener('click', handlers.onStartWave);
    // 事件委托：道具按钮内容会重建，监听器只绑一次
    this.itemsEl.addEventListener('click', (ev) => {
      const btn = (ev.target as Element).closest<HTMLElement>('[data-item-idx]');
      if (!btn) return;
      const idx = Number(btn.dataset.itemIdx);
      if (!Number.isNaN(idx)) handlers.onItemTap(idx);
    });
    for (let i = 0; i < BENCH_SIZE; i++) {
      const el = root.querySelector<HTMLElement>(`[data-slot="${i}"]`)!;
      this.slotEls.push(el);
      el.addEventListener('pointerdown', (ev) => handlers.onSlotDown(i, ev));
    }
  }

  /** 拖动中的背包槽（半透明显示） */
  dragIndex: number | null = null;
  /** 已选中待瞄准的道具序号（火攻） */
  armedIndex: number | null = null;
  private itemsEl: HTMLElement;
  private lastItemsHtml = '';

  update(gs: GameState, level: LevelDef): void {
    for (let i = 0; i < BENCH_SIZE; i++) {
      const s = gs.bench[i];
      const el = this.slotEls[i];
      const html = s
        ? `<span class="slot-word${s.kind === '忠' ? ' word-loyal' : ''}">${s.kind}</span>${
            s.level > 1 ? `<span class="slot-level${s.level >= 3 ? ' slot-level-gold' : ''}">${s.level}</span>` : ''
          }`
        : '';
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('slot-dragging', this.dragIndex === i);
    }
    // 锦囊道具栏（内容变化才重建 DOM，事件走委托）
    const itemsHtml =
      gs.items
        .map((k, i) => {
          const d = ITEM_DEFS[k];
          const armed = this.armedIndex === i ? ' item-armed' : '';
          return `<button class="item-btn${armed}" data-item-idx="${i}" title="${d.desc}"><span class="item-icon">${d.icon}</span>${d.name}</button>`;
        })
        .join('') +
      Array.from(
        { length: ITEM_BAG_MAX - gs.items.length },
        () => '<span class="item-empty">囊</span>',
      ).join('');
    if (itemsHtml !== this.lastItemsHtml) {
      this.itemsEl.innerHTML = itemsHtml;
      this.lastItemsHtml = itemsHtml;
    }
    const canBuy = gs.food >= gs.recruitCost && gs.bench.some((s) => s === null);
    this.recruitBtn.disabled = !canBuy;
    if (this.costEl.textContent !== String(gs.recruitCost)) {
      this.costEl.textContent = String(gs.recruitCost);
    }
    // 下一波预告
    const preview = wavePreview(level, gs.waveIndex + 1);
    const isLastDone = gs.waveIndex >= level.waves.length - 1;
    const previewHtml =
      !isLastDone && preview.length > 0
        ? `<span class="wave-preview-label">${gs.intermission ? '将至' : '下波'}</span>` +
          preview
            .map((p) => `<span class="wave-preview-item"><b>${p.word}</b>×${p.count}</span>`)
            .join('')
        : '';
    if (this.previewEl.innerHTML !== previewHtml) this.previewEl.innerHTML = previewHtml;
    this.previewEl.classList.toggle('show', previewHtml !== '');

    let waveHtml: string;
    if (gs.intermission) {
      const sec = Math.max(0, Math.ceil(gs.waveTimer));
      const bonus = Math.min(EARLY_CALL_MAX, sec);
      const label = gs.waveIndex < 0 ? '开 战' : '开 波';
      waveHtml = `${label} <span class="wave-bonus">+${bonus}🍚</span> <span class="wave-count">(${sec}s)</span>`;
      this.waveBtn.disabled = false;
    } else {
      waveHtml = `第 ${gs.waveIndex + 1} 波`;
      this.waveBtn.disabled = true;
    }
    if (this.waveBtn.innerHTML !== waveHtml) this.waveBtn.innerHTML = waveHtml;
  }
}
