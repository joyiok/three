import type { Progress } from '../storage';
import { LEVELS } from '../game/levels';
import { isUnlocked } from '../storage';
import type { Difficulty } from '../game/versus';

function el(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild as HTMLElement;
}

/** 水墨晕开转场覆盖层 */
function inkTransition(root: HTMLElement, done: () => void): void {
  const overlay = el('<div class="ink-fade"></div>');
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('ink-fade-in'));
  setTimeout(() => {
    done();
    overlay.classList.remove('ink-fade-in');
    overlay.classList.add('ink-fade-out');
    setTimeout(() => overlay.remove(), 450);
  }, 220);
}

function resultFlavor(won: boolean, stars: number): string {
  if (!won) return '胜败乃兵家常事，卷土重来！';
  if (stars >= 3) return '谈笑间，樯橹灰飞烟灭';
  if (stars === 2) return '力保营寨，胜！';
  return '惨胜如败，险守此关';
}

function victoryConfetti(): string {
  const colors = ['var(--gold)', 'var(--cinnabar)', 'var(--ink)', 'var(--paper-soft)'];
  return `
    <div class="result-confetti" aria-hidden="true">
      ${Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const spread = 70 + (i % 5) * 18;
        const dx = Math.cos(angle) * spread;
        const dy = -80 - Math.sin(angle) * 36 - (i % 4) * 18;
        const size = 6 + (i % 3) * 2;
        const delay = (i % 6) * 0.05;
        return `<span style="--dx:${dx}px;--dy:${dy}px;--rot:${180 + i * 19}deg;--delay:${delay}s;--size:${size}px;--confetti-color:${colors[i % colors.length]}"></span>`;
      }).join('')}
    </div>`;
}

export function showMenu(
  root: HTMLElement,
  onCampaign: () => void,
  onVersus: () => void,
): void {
  root.innerHTML = `
    <div class="screen menu-screen">
      <div class="title-block">
        <div class="subtitle">三国</div>
        <h1 class="main-title">字守</h1>
        <div class="tagline">墨守营寨 · 字御千军</div>
      </div>
      <div class="menu-art">山</div>
      <div class="menu-btns">
        <button class="big-btn menu-campaign">战 役</button>
        <button class="big-btn menu-versus next-btn">对 战</button>
      </div>
      <div class="hint">战役单人闯关 · 对战 1v1 匹配</div>
    </div>`;
  root.querySelector('.menu-campaign')!.addEventListener('click', () => inkTransition(root, onCampaign));
  root.querySelector('.menu-versus')!.addEventListener('click', () => inkTransition(root, onVersus));
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
        <div class="lv-card-left">
          <div class="lv-no">第 ${i + 1} 关</div>
          <div class="lv-name">${lv.name}</div>
          <div class="lv-stars">${unlocked ? starHtml : '🔒'}</div>
        </div>
        <div class="lv-card-right">
          <div class="lv-info">${lv.waves.length} 波</div>
          <div class="lv-info">${lv.bossWord}王</div>
        </div>
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
      ${won ? victoryConfetti() : ''}
      <div class="result-panel">
        <h2 class="result-title">${won ? '胜 利' : '营寨失守'}</h2>
        ${won ? `<div class="result-stars">${starsHtml}</div>` : '<div class="result-fail-mark">败</div>'}
        <div class="result-flavor">${resultFlavor(won, stars)}</div>
        <div class="result-actions">
          <button class="big-btn" data-retry>${won ? '再 战' : '重 来'}</button>
          ${hasNext && won ? '<button class="big-btn next-btn" data-next>下 一 关</button>' : ''}
          <button class="text-btn" data-back>选关</button>
        </div>
      </div>
    </div>`;
  root.querySelector('[data-retry]')!.addEventListener('click', opts.onRetry);
  root.querySelector('[data-back]')!.addEventListener('click', opts.onBack);
  const next = root.querySelector('[data-next]');
  if (next) next.addEventListener('click', opts.onNext);
}

/** 对战模式选择 + 假匹配动画 */
export interface MatchOpts {
  onMatched: (difficulty: Difficulty, localTwoPlayer: boolean) => void;
  onBack: () => void;
}

const DIFF_INFO: Record<Difficulty, { name: string; desc: string }> = {
  easy: { name: '新 手', desc: 'AI 反应慢、布阵稀' },
  normal: { name: '普 通', desc: '均衡对手' },
  hard: { name: '困 难', desc: 'AI 主动进攻用道具' },
  nightmare: { name: '噩 梦', desc: 'AI 高频征兵+连发' },
};

export function showMatch(root: HTMLElement, opts: MatchOpts): void {
  root.innerHTML = `
    <div class="screen match-screen">
      <div class="screen-head">
        <button class="back-btn" data-back>←</button>
        <h2>对 战</h2>
      </div>
      <div class="match-body">
        <div class="match-section-title">选择难度（匹配 AI）</div>
        <div class="match-diffs">
          ${(['easy', 'normal', 'hard', 'nightmare'] as Difficulty[])
            .map(
              (d) => `<button class="diff-card diff-${d}" data-diff="${d}">
                <div class="diff-name">${DIFF_INFO[d].name}</div>
                <div class="diff-desc">${DIFF_INFO[d].desc}</div>
              </button>`,
            )
            .join('')}
        </div>
        <div class="match-section-title">或</div>
        <button class="big-btn match-local" data-local>本 地 双 人</button>
        <div class="hint">同设备轮流操作上下半场</div>
      </div>
    </div>`;
  root.querySelector('[data-back]')!.addEventListener('click', opts.onBack);
  root.querySelectorAll<HTMLElement>('[data-diff]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = btn.dataset.diff as Difficulty;
      showMatchSpinner(root, d, false, opts.onMatched);
    });
  });
  root.querySelector('[data-local]')!.addEventListener('click', () => {
    showMatchSpinner(root, 'normal', true, opts.onMatched);
  });
}

function showMatchSpinner(
  root: HTMLElement,
  diff: Difficulty,
  local: boolean,
  onMatched: (d: Difficulty, l: boolean) => void,
): void {
  root.innerHTML = `
    <div class="screen match-spinner-screen">
      <div class="spinner-title">寻 找 对 手</div>
      <div class="spinner">
        <div class="spinner-dot"></div>
        <div class="spinner-dot"></div>
        <div class="spinner-dot"></div>
      </div>
      <div class="spinner-hint" data-hint>匹配中…</div>
    </div>`;
  const hint = root.querySelector('[data-hint]') as HTMLElement;
  const steps = ['匹配中…', '正在连接…', '找到对手！'];
  let i = 0;
  const timer = setInterval(() => {
    i++;
    if (i >= steps.length) {
      clearInterval(timer);
      inkTransition(root, () => onMatched(diff, local));
      return;
    }
    hint.textContent = steps[i];
  }, 600);
}

/** 对战结算 */
export function showVersusResult(
  root: HTMLElement,
  result: 'won' | 'lost' | 'draw',
  onRetry: () => void,
  onBack: () => void,
): void {
  const title = result === 'won' ? '大 捷' : result === 'lost' ? '兵 败' : '势 均 力 敌';
  const mark = result === 'won' ? '胜' : result === 'lost' ? '败' : '和';
  root.innerHTML = `
    <div class="screen result-screen">
      <h2 class="result-title">${title}</h2>
      <div class="result-fail-mark">${mark}</div>
      <div class="result-actions">
        <button class="big-btn" data-retry>再 战</button>
        <button class="text-btn" data-back>返回</button>
      </div>
    </div>`;
  root.querySelector('[data-retry]')!.addEventListener('click', onRetry);
  root.querySelector('[data-back]')!.addEventListener('click', onBack);
}