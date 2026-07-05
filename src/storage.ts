import { BASE_HP } from './game/config';
import { LEVELS } from './game/levels';

export interface Progress {
  stars: Record<string, number>;
}

const PROGRESS_KEY = 'sgtd.progress';
const MUTED_KEY = 'sgtd.muted';

const memoryProgress: Progress = { stars: {} };
let memoryMuted = false;

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { stars: {} };
    const parsed = JSON.parse(raw) as Progress;
    if (!parsed.stars || typeof parsed.stars !== 'object') return { stars: {} };
    return { stars: parsed.stars };
  } catch {
    return memoryProgress;
  }
}

export function saveStars(levelId: string, stars: number): void {
  const cur = loadProgress();
  const prev = cur.stars[levelId] ?? 0;
  if (stars > prev) cur.stars[levelId] = stars;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(cur));
  } catch {
    memoryProgress.stars = cur.stars;
  }
}

export function isUnlocked(levelIndex: number, progress: Progress): boolean {
  if (levelIndex === 0) return true;
  const prevId = LEVELS[levelIndex - 1].id;
  return (progress.stars[prevId] ?? 0) >= 1;
}

export function starsFor(baseHp: number): 1 | 2 | 3 {
  if (baseHp >= 9) return 3;
  if (baseHp >= 5) return 2;
  return 1;
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return memoryMuted;
  }
}

export function saveMuted(m: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, m ? '1' : '0');
  } catch {
    memoryMuted = m;
  }
}

export { BASE_HP };