import { describe, expect, it } from 'vitest';
import {
  ITEM_BAG_MAX,
  ITEM_DROP_CHANCE,
  ITEM_KINDS,
  RALLY_RATE_MULT,
  SLOW_ALL_AMOUNT,
  rollItemDrop,
  soldierRate,
} from '../src/game/config';
import { damageEnemy, tickCombat } from '../src/game/combat';
import { FIRE_RADIUS, ITEM_DEFS, useItem } from '../src/game/items';
import { LEVELS } from '../src/game/levels';
import { createGame } from '../src/game/state';
import type { Enemy, GameState, ItemKind, SoldierKind, Vec } from '../src/game/types';

const level = LEVELS[0]; // 路径: (3,0)→(3,4)→(1,4)→(1,8)→(6,8)

function addEnemy(gs: GameState, progress: number, hp = 10000, armor = 0): Enemy {
  const e: Enemy = {
    id: gs.nextId++, kind: '斗', word: '斗', hp, maxHp: hp,
    speed: 0, slow: 0, pathIndex: 0, progress, bounty: 3, damage: 1, armor,
  };
  gs.enemies.push(e);
  return e;
}

function addSoldier(gs: GameState, kind: SoldierKind, lv: number, cell: Vec | null) {
  const s = { id: gs.nextId++, kind, level: lv, cell, cooldown: 0 };
  if (cell) gs.soldiers.push(s);
  return s;
}

describe('道具掉落', () => {
  it('目录完整且每种都有定义', () => {
    expect(ITEM_KINDS).toHaveLength(8);
    for (const k of ITEM_KINDS) {
      expect(ITEM_DEFS[k].name.length).toBeGreaterThan(0);
      expect(ITEM_DEFS[k].desc.length).toBeGreaterThan(0);
    }
  });

  it('rollItemDrop 按概率掉落', () => {
    expect(rollItemDrop('斗', () => 0.999)).toBeNull(); // 未命中
    expect(rollItemDrop('斗', () => 0)).toBe(ITEM_KINDS[0]); // 命中且选第一个
    expect(ITEM_DROP_CHANCE['将']).toBeGreaterThan(ITEM_DROP_CHANCE['斗']);
    expect(ITEM_DROP_CHANCE.boss).toBe(1);
  });

  it('击杀 boss 必掉道具并推送 itemGain 事件', () => {
    const gs = createGame(level);
    const e = addEnemy(gs, 1, 1);
    e.kind = 'boss';
    damageEnemy(gs, level, e, 10);
    expect(gs.items).toHaveLength(1);
    expect(gs.events.some((ev) => ev.t === 'itemGain')).toBe(true);
  });

  it('锦囊满时不再掉落', () => {
    const gs = createGame(level);
    gs.items = ['heal', 'heal', 'heal'];
    const e = addEnemy(gs, 1, 1);
    e.kind = 'boss';
    damageEnemy(gs, level, e, 10);
    expect(gs.items).toHaveLength(ITEM_BAG_MAX);
  });
});

describe('道具使用', () => {
  function withItem(gs: GameState, item: ItemKind): void {
    gs.items = [item];
  }

  it('火攻烧半径内敌人且无视护甲，未点目标不消耗', () => {
    const gs = createGame(level);
    withItem(gs, 'fire');
    const inRange = addEnemy(gs, 1, 10000, 999); // (3,1)
    const outRange = addEnemy(gs, 6, 10000); // 远处
    // 未给目标格 → 拒绝
    expect(useItem(gs, level, 0)).toBe(false);
    expect(gs.items).toHaveLength(1);
    // 点 (3,1)
    expect(useItem(gs, level, 0, { x: 3, y: 1 })).toBe(true);
    expect(gs.items).toHaveLength(0);
    expect(inRange.hp).toBeLessThan(10000 - 50); // 无视护甲的实伤
    expect(outRange.hp).toBe(10000);
    expect(gs.events.some((e) => e.t === 'itemUse' && e.item === 'fire')).toBe(true);
  });

  it('火攻空放（半径内无敌人）不消耗', () => {
    const gs = createGame(level);
    withItem(gs, 'fire');
    addEnemy(gs, 10, 10000);
    expect(useItem(gs, level, 0, { x: 3, y: 0 })).toBe(false);
    expect(gs.items).toHaveLength(1);
  });

  it('FIRE_RADIUS 覆盖邻格', () => {
    expect(FIRE_RADIUS).toBeGreaterThan(1);
  });

  it('箭雨命中全场，空场不消耗', () => {
    const gs = createGame(level);
    withItem(gs, 'arrowRain');
    expect(useItem(gs, level, 0)).toBe(false); // 空场
    const a = addEnemy(gs, 1);
    const b = addEnemy(gs, 8);
    expect(useItem(gs, level, 0)).toBe(true);
    expect(a.hp).toBeLessThan(10000);
    expect(b.hp).toBeLessThan(10000);
  });

  it('落石重击最前方敌人', () => {
    const gs = createGame(level);
    withItem(gs, 'rockfall');
    const back = addEnemy(gs, 1);
    const front = addEnemy(gs, 9);
    expect(useItem(gs, level, 0)).toBe(true);
    expect(front.hp).toBeLessThan(10000);
    expect(back.hp).toBe(10000);
  });

  it('缓兵全场减速', () => {
    const gs = createGame(level);
    withItem(gs, 'slowAll');
    const e = addEnemy(gs, 8); // 远离所有忠光环
    expect(useItem(gs, level, 0)).toBe(true);
    expect(gs.slowAllUntil).toBeGreaterThan(gs.time);
    tickCombat(gs, level, 0.016);
    expect(e.slow).toBeCloseTo(SLOW_ALL_AMOUNT);
  });

  it('鼓舞提升攻速（冷却更短）', () => {
    const gs = createGame(level);
    withItem(gs, 'rally');
    const s = addSoldier(gs, '刀', 1, { x: 2, y: 1 });
    addEnemy(gs, 1);
    expect(useItem(gs, level, 0)).toBe(true);
    tickCombat(gs, level, 0.016);
    expect(s.cooldown).toBeCloseTo(1 / (soldierRate('刀', 1) * RALLY_RATE_MULT), 3);
  });

  it('修营 +2 封顶，满血不消耗', () => {
    const gs = createGame(level);
    withItem(gs, 'heal');
    expect(useItem(gs, level, 0)).toBe(false); // 满血
    expect(gs.items).toHaveLength(1);
    gs.baseHp = 5;
    expect(useItem(gs, level, 0)).toBe(true);
    expect(gs.baseHp).toBe(7);
  });

  it('征粮 +15', () => {
    const gs = createGame(level);
    withItem(gs, 'food');
    const before = gs.food;
    expect(useItem(gs, level, 0)).toBe(true);
    expect(gs.food).toBe(before + 15);
  });

  it('神合合成场上一对，无对子不消耗', () => {
    const gs = createGame(level);
    withItem(gs, 'merge');
    expect(useItem(gs, level, 0, undefined, () => 0)).toBe(false); // 无兵
    addSoldier(gs, '弓', 2, { x: 0, y: 1 });
    addSoldier(gs, '弓', 2, { x: 2, y: 1 });
    expect(useItem(gs, level, 0, undefined, () => 0)).toBe(true);
    expect(gs.soldiers).toHaveLength(1);
    expect(gs.soldiers[0].level).toBe(3);
  });

  it('神合可合背包中的对子', () => {
    const gs = createGame(level);
    withItem(gs, 'merge');
    gs.bench[0] = { id: gs.nextId++, kind: '骑', level: 1, cell: null, cooldown: 0 };
    gs.bench[3] = { id: gs.nextId++, kind: '骑', level: 1, cell: null, cooldown: 0 };
    expect(useItem(gs, level, 0, undefined, () => 0)).toBe(true);
    expect(gs.bench[0]).toBeNull();
    expect(gs.bench[3]?.level).toBe(2);
  });

  it('终局后不可用', () => {
    const gs = createGame(level);
    withItem(gs, 'food');
    gs.status = 'won';
    expect(useItem(gs, level, 0)).toBe(false);
  });
});
