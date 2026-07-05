import { describe, expect, it } from 'vitest';
import {
  ENEMIES,
  SOLDIERS,
  enemyHp,
  rollSoldier,
  slowOf,
  soldierDamage,
  soldierRange,
} from '../src/game/config';

describe('config', () => {
  it('士兵伤害按 1.8 倍每级增长', () => {
    expect(soldierDamage('刀', 1)).toBe(10);
    expect(soldierDamage('刀', 3)).toBe(Math.round(10 * 1.8 * 1.8));
    expect(soldierDamage('骑', 2)).toBe(Math.round(25 * 1.8));
  });

  it('射程每级 +0.15', () => {
    expect(soldierRange('弓', 1)).toBeCloseTo(3.5);
    expect(soldierRange('弓', 4)).toBeCloseTo(3.5 + 0.45);
  });

  it('减速 35% 起每级 +5% 封顶 60%', () => {
    expect(slowOf(1)).toBeCloseTo(0.35);
    expect(slowOf(3)).toBeCloseTo(0.45);
    expect(slowOf(10)).toBeCloseTo(0.6);
  });

  it('敌人 HP 随波次与关卡系数缩放', () => {
    expect(enemyHp('斗', 1, 1)).toBe(30);
    expect(enemyHp('斗', 5, 1.4)).toBe(Math.round(30 * (1 + 0.15 * 4) * 1.4));
    expect(enemyHp('boss', 1, 1, 1500)).toBe(1500);
  });

  it('征兵轮盘覆盖权重两端', () => {
    expect(rollSoldier(() => 0)).toBe('刀');
    expect(rollSoldier(() => 0.9999)).toBe('忠');
  });

  it('权重和为 100，敌表完整', () => {
    const total = Object.values(SOLDIERS).reduce((s, v) => s + v.weight, 0);
    expect(total).toBe(100);
    expect(Object.keys(ENEMIES)).toEqual(['斗', '贼', '兵', '将', 'boss']);
  });
});
