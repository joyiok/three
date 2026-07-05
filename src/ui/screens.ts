import type { Progress } from '../storage';
import { LEVELS } from '../game/levels';
import { isUnlocked } from '../storage';

function el(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild as HTMLElement;
}

/** 水墨晕开转场覆盖层 */
function inkTransition(root: HTMLElement, done: () => void): void {
  const overlay = el('<div class="ink-fade"></div>');
  root.appendChild(overlay);
  // 触发动画
  requestAnimationFrame(() => overlay.classList.add('ink-fade-in'));
  setTimeout(() => {
    done();
    overlay.classList.remove('ink-fade-in');
    overlay.classList.add('ink-fade-out');
    setTimeout(() => overlay.remove(), 450);
  }, 220);
}

export function showMenu(root: HTMLElement, onStart: () => void): void {
  root.innerHTML = `
    <div class="screen menu-screen">
      <div class="title-block">
        <div class="subtitle">三国</div>
        <h1 class="main-title">字守</h1>
        <div class="tagline">墨守营寨 · 字御千军</div>
      </div>
      <div class="menu-art">山</div>
      <button class="big-btn menu-start">开 始</button>
      <div class="hint">拖放士兵至草地，同字同级可合成</div>
    </div>`;
  root.querySelector('.menu-start')!.addEventListener('click', () => {
    inkTransition(root, onStart);
  });
}

export function showLevelSelect(
  root: HTMLElement,
  progress: Progress,
  onPick: (index: number) => void,
  onBack: () => void,
): void {
  const cards = LEVELS.map((lv, i) => {
    const unlocked = isUnlocked(i, progress);
    const stars = progress.stars[lv.id] ?? 0;
    const starHtml = [1, 2, 3]
      .map((n) => (n <= stars ? '★' : '☆'))
      .join('');
    return `
      <div class="lv-card ${unlocked ? '' : 'locked'}" data-index="${i}">
        <div class="lv-no">第 ${i + 1} 关</div>
        <div class="lv-name">${lv.name}</div>
        <div class="lv-stars">${unlocked ? starHtml : '🔒'}</div>
        <div class="lv-info">${lv.waves.length} 波 · ${lv.bossWord}王</div>
      </div>`;
  }).join('');
  root.innerHTML = `
    <div class="screen lv-screen">
      <div class="screen-head">
        <button class="back-btn" data-back>←</button>
        <h2>选 关</h2>
      </div>
      <div class="lv-list">${cards}</div>
    </div>`;
  root.querySelector('[data-back]')!.addEventListener('click', onBack);
  root.querySelectorAll<HTMLElement>('.lv-card').forEach((card) => {
    card.addEventListener('click', () => {
      const i = Number(card.dataset.index);
      if (isUnlocked(i, progress)) {
        inkTransition(root, () => onPick(i));
      }
    });
  });
}

export interface ResultOpts {
  won: boolean;
  stars: number;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function showResult(root: HTMLElement, opts: ResultOpts): void {
  const { won, stars, hasNext } = opts;
  const starsHtml = [1, 2, 3]
    .map((_, i) => `<span class="result-star ${i < stars ? 'lit' : ''}" style="animation-delay:${i * 0.18}s">★</span>`)
    .join('');
  root.innerHTML = `
    <div class="screen result-screen">
      <h2 class="result-title">${won ? '胜 利' : '营寨失守'}</h2>
      ${won ? `<div class="result-stars">${starsHtml}</div>` : '<div class="result-fail-mark">败</div>'}
      <div class="result-actions">
        <button class="big-btn" data-retry>${won ? '再 战' : '重 来'}</button>
        ${hasNext && won ? '<button class="big-btn next-btn" data-next>下 一 关</button>' : ''}
        <button class="text-btn" data-back>选关</button>
      </div>
    </div>`;
  root.querySelector('[data-retry]')!.addEventListener('click', opts.onRetry);
  root.querySelector('[data-back]')!.addEventListener('click', opts.onBack);
  const next = root.querySelector('[data-next]');
  if (next) next.addEventListener('click', opts.onNext);
}