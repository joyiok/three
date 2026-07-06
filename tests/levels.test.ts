import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W } from '../src/game/config';
import { LEVELS, cellKind } from '../src/game/levels';

describe('levels', () => {
  it('四关顺序与关键参数正确', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(['huangjin', 'julu', 'guandu', 'chibi']);
    expect(LEVELS.map((l) => l.waves.length)).toEqual([10, 11, 11, 12]);
    expect(LEVELS.map((l) => l.coeff)).toEqual([1.0, 1.4, 1.9, 2.2]);
    expect(LEVELS.map((l) => l.bossWord)).toEqual(['角', '瓒', '绍', '操']);
    expect(LEVELS.map((l) => l.bossHp)).toEqual([1500, 2500, 3200, 4500]);
  });

  it('网格为 10 行 × 7 列且只含合法字符', () => {
    for (const l of LEVELS) {
      expect(l.grid.length).toBe(GRID_H);
      for (const row of l.grid) {
        expect(row.length).toBe(GRID_W);
        expect(row).toMatch(/^[.#r]+$/);
      }
    }
  });

  it('路径路点逐格相邻且都在土路上，入口在边界', () => {
    for (const l of LEVELS) {
      expect(l.paths.length).toBeGreaterThan(0);
      for (const path of l.paths) {
        const first = path[0];
        expect(
          first.x === 0 || first.x === GRID_W - 1 || first.y === 0 || first.y === GRID_H - 1,
        ).toBe(true);
        for (let i = 0; i < path.length; i++) {
          const p = path[i];
          expect(cellKind(l, p.x, p.y)).toBe('path');
          if (i > 0) {
            const q = path[i - 1];
            expect(Math.abs(p.x - q.x) + Math.abs(p.y - q.y)).toBe(1);
          }
        }
      }
    }
  });

  it('每关草地格 ≥ 14', () => {
    for (const l of LEVELS) {
      const grass = l.grid.join('').split('').filter((c) => c === '.').length;
      expect(grass).toBeGreaterThanOrEqual(14);
    }
  });

  it('末波含 boss，且所有出怪组路径编号合法', () => {
    for (const l of LEVELS) {
      const last = l.waves[l.waves.length - 1];
      expect(last.groups.some((g) => g.kind === 'boss')).toBe(true);
      for (const wave of l.waves) {
        for (const g of wave.groups) {
          expect((g.pathIndex ?? 0) < l.paths.length).toBe(true);
          expect(g.count).toBeGreaterThan(0);
        }
      }
    }
  });
});
