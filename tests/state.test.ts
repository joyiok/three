import { describe, expect, it } from 'vitest';
import { BENCH_SIZE, START_FOOD } from '../src/game/config';
import { LEVELS } from '../src/game/levels';
import {
  canPlace,
  createGame,
  moveSoldier,
  recruit,
  sellSoldier,
  soldierAt,
} from '../src/game/state';
import type { GameState, Soldier, SoldierKind } from '../src/game/types';

const level = LEVELS[0]; // 黄巾：(3,0) 是路，(0,1) 是草，(0,0) 是石

function benchWith(gs: GameState, index: number, kind: SoldierKind, lv: number): Soldier {
  const s: Soldier = { id: gs.nextId++, kind, level: lv, cell: null, cooldown: 0 };
  gs.bench[index] = s;
  return s;
}

describe('state 征兵', () => {
  it('初始状态正确', () => {
    const gs = createGame(level);
    expect(gs.food).toBe(START_FOOD);
    expect(gs.recruitCost).toBe(10);
    expect(gs.baseHp).toBe(10);
    expect(gs.bench).toHaveLength(BENCH_SIZE);
    expect(gs.waveIndex).toBe(-1);
    expect(gs.status).toBe('playing');
  });

  it('征兵扣粮、涨价、入空槽', () => {
    const gs = createGame(level);
    expect(recruit(gs, () => 0)).toBe(true);
    expect(gs.food).toBe(START_FOOD - 10);
    expect(gs.recruitCost).toBe(11);
    expect(gs.bench[0]?.kind).toBe('刀');
    expect(gs.bench[0]?.level).toBe(1);
  });

  it('粮不足拒绝', () => {
    const gs = createGame(level);
    gs.food = 9;
    expect(recruit(gs, () => 0)).toBe(false);
    expect(gs.bench[0]).toBeNull();
  });

  it('背包满拒绝且不扣粮', () => {
    const gs = createGame(level);
    gs.food = 999;
    for (let i = 0; i < BENCH_SIZE; i++) benchWith(gs, i, '刀', 1);
    const before = gs.food;
    expect(recruit(gs, () => 0)).toBe(false);
    expect(gs.food).toBe(before);
  });

  it('征兵价格封顶 24', () => {
    const gs = createGame(level);
    gs.food = 9999;
    for (let i = 0; i < 15; i++) {
      recruit(gs, () => 0);
      gs.bench = gs.bench.map(() => null); // 腾空以便继续买
    }
    expect(gs.recruitCost).toBe(24);
  });
});

describe('state 部署与合成', () => {
  it('部署到草地成功，路/石/占用格失败', () => {
    const gs = createGame(level);
    benchWith(gs, 0, '刀', 1);
    expect(canPlace(level, gs, { x: 3, y: 0 })).toBe(false); // 路
    expect(canPlace(level, gs, { x: 0, y: 0 })).toBe(false); // 石
    expect(moveSoldier(level, gs, { type: 'bench', index: 0 }, { type: 'cell', cell: { x: 0, y: 1 } })).toBe(true);
    expect(gs.bench[0]).toBeNull();
    expect(soldierAt(gs, { x: 0, y: 1 })?.kind).toBe('刀');
    // 已占用
    benchWith(gs, 1, '枪', 1);
    expect(canPlace(level, gs, { x: 0, y: 1 })).toBe(false);
  });

  it('同字同级合成为 +1 级', () => {
    const gs = createGame(level);
    benchWith(gs, 0, '弓', 2);
    benchWith(gs, 1, '弓', 2);
    moveSoldier(level, gs, { type: 'bench', index: 0 }, { type: 'cell', cell: { x: 0, y: 1 } });
    expect(moveSoldier(level, gs, { type: 'bench', index: 1 }, { type: 'cell', cell: { x: 0, y: 1 } })).toBe(true);
    const merged = soldierAt(gs, { x: 0, y: 1 })!;
    expect(merged.level).toBe(3);
    expect(gs.bench[1]).toBeNull();
    expect(gs.soldiers).toHaveLength(1);
    expect(gs.events.some((e) => e.t === 'merge')).toBe(true);
  });

  it('异字或异级互换位置', () => {
    const gs = createGame(level);
    benchWith(gs, 0, '刀', 1);
    benchWith(gs, 1, '弓', 1);
    moveSoldier(level, gs, { type: 'bench', index: 0 }, { type: 'cell', cell: { x: 0, y: 1 } });
    expect(moveSoldier(level, gs, { type: 'bench', index: 1 }, { type: 'cell', cell: { x: 0, y: 1 } })).toBe(true);
    expect(soldierAt(gs, { x: 0, y: 1 })?.kind).toBe('弓');
    expect(gs.bench[1]?.kind).toBe('刀');
  });

  it('背包内合成', () => {
    const gs = createGame(level);
    benchWith(gs, 0, '骑', 1);
    benchWith(gs, 3, '骑', 1);
    expect(moveSoldier(level, gs, { type: 'bench', index: 0 }, { type: 'bench', index: 3 })).toBe(true);
    expect(gs.bench[0]).toBeNull();
    expect(gs.bench[3]?.level).toBe(2);
  });

  it('部署到非法格返回 false 且不动', () => {
    const gs = createGame(level);
    benchWith(gs, 0, '刀', 1);
    expect(moveSoldier(level, gs, { type: 'bench', index: 0 }, { type: 'cell', cell: { x: 3, y: 0 } })).toBe(false);
    expect(gs.bench[0]?.kind).toBe('刀');
  });
});

describe('state 回收', () => {
  it('铲除返 5×等级 粮', () => {
    const gs = createGame(level);
    benchWith(gs, 0, '刀', 3);
    moveSoldier(level, gs, { type: 'bench', index: 0 }, { type: 'cell', cell: { x: 0, y: 1 } });
    const before = gs.food;
    expect(sellSoldier(gs, { x: 0, y: 1 })).toBe(true);
    expect(gs.food).toBe(before + 15);
    expect(gs.soldiers).toHaveLength(0);
    expect(sellSoldier(gs, { x: 0, y: 1 })).toBe(false);
  });
});
