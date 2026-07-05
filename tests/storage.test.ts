import { beforeEach, describe, expect, it } from 'vitest';
import { LEVELS } from '../src/game/levels';
import {
  isUnlocked,
  loadMuted,
  loadProgress,
  saveMuted,
  saveStars,
  starsFor,
} from '../src/storage';

// 简易内存 localStorage，覆盖全局
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

let store: MemStorage;

beforeEach(() => {
  store = new MemStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    store as unknown as Storage;
});

describe('starsFor', () => {
  it('≥9 三星, ≥5 两星, 否则一星', () => {
    expect(starsFor(10)).toBe(3);
    expect(starsFor(9)).toBe(3);
    expect(starsFor(8)).toBe(2);
    expect(starsFor(5)).toBe(2);
    expect(starsFor(4)).toBe(1);
    expect(starsFor(0)).toBe(1);
  });
});

describe('saveStars 只升不降', () => {
  it('首次写入', () => {
    saveStars(LEVELS[0].id, 3);
    expect(loadProgress().stars[LEVELS[0].id]).toBe(3);
  });
  it('低星不覆盖高星', () => {
    saveStars(LEVELS[0].id, 3);
    saveStars(LEVELS[0].id, 1);
    expect(loadProgress().stars[LEVELS[0].id]).toBe(3);
  });
  it('高星覆盖低星', () => {
    saveStars(LEVELS[0].id, 1);
    saveStars(LEVELS[0].id, 2);
    expect(loadProgress().stars[LEVELS[0].id]).toBe(2);
  });
});

describe('损坏 JSON 降级', () => {
  it('返回空进度', () => {
    store.setItem('sgtd.progress', '{not json');
    expect(loadProgress().stars).toEqual({});
  });
  it('非对象 stars 降级', () => {
    store.setItem('sgtd.progress', JSON.stringify({ stars: 5 }));
    expect(loadProgress().stars).toEqual({});
  });
});

describe('解锁链', () => {
  it('第 0 关恒解锁', () => {
    expect(isUnlocked(0, { stars: {} })).toBe(true);
  });
  it('第 1 关未通关前锁住', () => {
    expect(isUnlocked(1, { stars: {} })).toBe(false);
  });
  it('前一关 1 星解锁', () => {
    expect(isUnlocked(1, { stars: { [LEVELS[0].id]: 1 } })).toBe(true);
    expect(isUnlocked(1, { stars: { [LEVELS[0].id]: 0 } })).toBe(false);
  });
  it('第 3 关需要第 2 关星', () => {
    expect(isUnlocked(3, { stars: { [LEVELS[0].id]: 3, [LEVELS[1].id]: 2 } })).toBe(false);
    expect(
      isUnlocked(3, { stars: { [LEVELS[0].id]: 3, [LEVELS[1].id]: 2, [LEVELS[2].id]: 1 } }),
    ).toBe(true);
  });
});

describe('静音存档', () => {
  it('默认不静音', () => {
    expect(loadMuted()).toBe(false);
  });
  it('保存后读取', () => {
    saveMuted(true);
    expect(loadMuted()).toBe(true);
    saveMuted(false);
    expect(loadMuted()).toBe(false);
  });
});