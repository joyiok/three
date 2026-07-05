import { describe, expect, it } from 'vitest';
import { ENEMIES, slowOf, soldierDamage } from '../src/game/config';
import { tickCombat } from '../src/game/combat';
import { LEVELS } from '../src/game/levels';
import { createGame } from '../src/game/state';
import type { Enemy, GameState, SoldierKind, Vec } from '../src/game/types';

const level = LEVELS[0]; // 路径: (3,0)→(3,4)→(1,4)→(1,8)→(6,8)

function addSoldier(gs: GameState, kind: SoldierKind, lv: number, cell: Vec) {
  const s = { id: gs.nextId++, kind, level: lv, cell, cooldown: 0 };
  gs.soldiers.push(s);
  return s;
}

function addEnemy(gs: GameState, progress: number, hp = 10000): Enemy {
  const e: Enemy = {
    id: gs.nextId++, kind: '斗', word: '斗', hp, maxHp: hp,
    speed: 0, slow: 0, pathIndex: 0, progress, bounty: ENEMIES['斗'].bounty, damage: 1,
  };
  gs.enemies.push(e);
  return e;
}

describe('combat 索敌与攻击', () => {
  it('近战优先距离最近（眼前）的敌人', () => {
    const gs = createGame(level);
    addSoldier(gs, '刀', 3, { x: 2, y: 1 }); // 射程1.6
    const near = addEnemy(gs, 1); // (3,1) 距1
    const far = addEnemy(gs, 2);  // (3,2) 距1.41 <1.6，也在射程内但progress更大
    tickCombat(gs, level, 0.016);
    const dmg = soldierDamage('刀', 3);
    expect(near.hp).toBe(10000 - dmg); // 近战打最近的
    expect(far.hp).toBe(10000);
  });

  it('弓优先 progress 最大的敌人', () => {
    const gs = createGame(level);
    addSoldier(gs, '弓', 1, { x: 1, y: 1 }); // 射程3.5
    const near = addEnemy(gs, 1); // (3,1) 距2
    const far = addEnemy(gs, 2);  // (3,2) 距2.24，progress更大
    tickCombat(gs, level, 0.016);
    expect(gs.projectiles).toHaveLength(1);
    expect(gs.projectiles[0].targetId).toBe(far.id);
    expect(near.hp).toBe(10000);
  });

  it('攻击射程内 progress 最大的敌人', () => {
    const gs = createGame(level);
    addSoldier(gs, '刀', 1, { x: 2, y: 1 }); // 射程1.3
    const near = addEnemy(gs, 1); // (3,1) 距离1
    const far = addEnemy(gs, 2); // (3,2) 距离√2≈1.41 超出刀程
    tickCombat(gs, level, 0.016);
    expect(near.hp).toBe(10000 - soldierDamage('刀', 1));
    expect(far.hp).toBe(10000);
    expect(gs.events.some((e) => e.t === 'shoot' && e.kind === '刀')).toBe(true);
  });

  it('攻击后进入冷却，冷却中不攻击', () => {
    const gs = createGame(level);
    const s = addSoldier(gs, '刀', 1, { x: 2, y: 1 });
    const e = addEnemy(gs, 1);
    tickCombat(gs, level, 0.016);
    const hpAfterFirst = e.hp;
    expect(s.cooldown).toBeCloseTo(1 / 1.2, 3);
    tickCombat(gs, level, 0.016);
    expect(e.hp).toBe(hpAfterFirst);
    tickCombat(gs, level, 1.0);
    expect(e.hp).toBeLessThan(hpAfterFirst);
  });

  it('骑兵溅射伤害目标周围敌人', () => {
    const gs = createGame(level);
    addSoldier(gs, '骑', 1, { x: 2, y: 2 }); // 射程2
    const a = addEnemy(gs, 2);   // (3,2)
    const b = addEnemy(gs, 2.5); // (3,2.5) 目标（progress更大），与a距离0.5<0.8
    const c = addEnemy(gs, 4.9); // (2.1,4) 距 b 远，不受溅射
    tickCombat(gs, level, 0.016);
    const dmg = soldierDamage('骑', 1);
    expect(b.hp).toBe(10000 - dmg);
    expect(a.hp).toBe(10000 - dmg);
    expect(c.hp).toBe(10000);
  });

  it('枪直线穿刺同向敌人，不伤侧向', () => {
    const gs = createGame(level);
    addSoldier(gs, '枪', 1, { x: 4, y: 4 }); // 射程2.5
    const far2 = addEnemy(gs, 5);  // (2,4) 目标（最远progress，距2）
    const mid = addEnemy(gs, 4);   // (3,4) 在直线上
    const side = addEnemy(gs, 3);  // (3,3) 射程内但不在线上
    tickCombat(gs, level, 0.016);
    const dmg = soldierDamage('枪', 1);
    expect(far2.hp).toBe(10000 - dmg);
    expect(mid.hp).toBe(10000 - dmg);
    expect(side.hp).toBe(10000);
  });

  it('弓生成弹道并追踪命中', () => {
    const gs = createGame(level);
    addSoldier(gs, '弓', 1, { x: 1, y: 1 }); // 射程3.5
    const e = addEnemy(gs, 3); // (3,3) 距离√8≈2.83
    tickCombat(gs, level, 0.016);
    expect(gs.projectiles).toHaveLength(1);
    expect(e.hp).toBe(10000);
    for (let i = 0; i < 15; i++) tickCombat(gs, level, 0.05); // 0.75s：箭已命中且未到第二发冷却
    expect(e.hp).toBe(10000 - soldierDamage('弓', 1));
    expect(gs.projectiles).toHaveLength(0);
  });

  it('击杀得赏金并移除敌人', () => {
    const gs = createGame(level);
    addSoldier(gs, '刀', 1, { x: 2, y: 1 });
    addEnemy(gs, 1, 1);
    const before = gs.food;
    tickCombat(gs, level, 0.016);
    expect(gs.enemies).toHaveLength(0);
    expect(gs.food).toBe(before + 3);
    expect(gs.events.some((e) => e.t === 'kill')).toBe(true);
  });
});

describe('combat 忠减速光环', () => {
  it('光环内减速，多光环取最强不叠乘', () => {
    const gs = createGame(level);
    addSoldier(gs, '忠', 1, { x: 2, y: 1 }); // 半径1.5
    const e = addEnemy(gs, 1); // (3,1) 距1
    tickCombat(gs, level, 0.016);
    expect(e.slow).toBeCloseTo(slowOf(1));
    addSoldier(gs, '忠', 3, { x: 2, y: 2 }); // (3,1) 距√2 в半径内
    tickCombat(gs, level, 0.016);
    expect(e.slow).toBeCloseTo(slowOf(3)); // 0.45 而非叠乘
  });

  it('忠等级 10 封顶 60%，且不产生攻击事件', () => {
    const gs = createGame(level);
    addSoldier(gs, '忠', 10, { x: 2, y: 1 });
    const e = addEnemy(gs, 1);
    tickCombat(gs, level, 0.016);
    expect(e.slow).toBeCloseTo(0.6);
    expect(gs.events.some((ev) => ev.t === 'shoot')).toBe(false);
  });

  it('离开光环减速清零', () => {
    const gs = createGame(level);
    addSoldier(gs, '忠', 1, { x: 2, y: 1 });
    const e = addEnemy(gs, 1);
    tickCombat(gs, level, 0.016);
    expect(e.slow).toBeGreaterThan(0);
    e.progress = 8; // 远离
    tickCombat(gs, level, 0.016);
    expect(e.slow).toBe(0);
  });
});
