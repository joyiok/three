import { describe, expect, it } from 'vitest';
import { soldierDamage } from '../src/game/config';
import { tickCombat } from '../src/game/combat';
import {
  activeFormations,
  formationDamageMultiplier,
  formationHint,
  formationLeakDamage,
} from '../src/game/formations';
import { LEVELS } from '../src/game/levels';
import { createGame } from '../src/game/state';
import type { Enemy, GameState, SoldierKind, Vec } from '../src/game/types';

const level = LEVELS[0];

function addSoldier(gs: GameState, kind: SoldierKind, cell: Vec): void {
  gs.soldiers.push({ id: gs.nextId++, kind, level: 1, cell, cooldown: 0 });
}

function addEnemy(gs: GameState, progress: number, hp = 10000): Enemy {
  const e: Enemy = {
    id: gs.nextId++,
    kind: '斗',
    word: '斗',
    hp,
    maxHp: hp,
    speed: 0,
    slow: 0,
    pathIndex: 0,
    progress,
    bounty: 3,
    damage: 1,
  };
  gs.enemies.push(e);
  return e;
}

describe('战役阵法加成', () => {
  it('刀+骑激活锋骑突阵，枪+弓激活枪弓连营', () => {
    const gs = createGame(level);
    addSoldier(gs, '刀', { x: 0, y: 1 });
    addSoldier(gs, '骑', { x: 2, y: 1 });
    addSoldier(gs, '枪', { x: 4, y: 1 });
    addSoldier(gs, '弓', { x: 5, y: 1 });
    const names = activeFormations(gs).map((f) => f.kind);
    expect(names).toContain('vanguard');
    expect(names).toContain('volley');
    expect(formationDamageMultiplier(gs, '刀')).toBeCloseTo(1.12);
    expect(formationDamageMultiplier(gs, '弓')).toBeCloseTo(1.12);
  });

  it('五兵种齐上激活五军合势并叠加对应小阵', () => {
    const gs = createGame(level);
    addSoldier(gs, '刀', { x: 0, y: 1 });
    addSoldier(gs, '枪', { x: 1, y: 1 });
    addSoldier(gs, '弓', { x: 2, y: 1 });
    addSoldier(gs, '骑', { x: 4, y: 1 });
    addSoldier(gs, '忠', { x: 5, y: 1 });
    expect(activeFormations(gs).map((f) => f.kind)).toContain('fiveForces');
    expect(formationDamageMultiplier(gs, '刀')).toBeCloseTo(1.2 * 1.12);
    expect(formationDamageMultiplier(gs, '枪')).toBeCloseTo(1.2 * 1.12);
    expect(formationDamageMultiplier(gs, '忠')).toBeCloseTo(1.2);
  });

  it('双忠护营降低漏怪伤害但至少为 1', () => {
    const gs = createGame(level);
    addSoldier(gs, '忠', { x: 0, y: 1 });
    addSoldier(gs, '忠', { x: 2, y: 1 });
    expect(activeFormations(gs).map((f) => f.kind)).toContain('loyalGuard');
    expect(formationLeakDamage(gs, 7)).toBe(6);
    expect(formationLeakDamage(gs, 1)).toBe(1);
  });

  it('战斗伤害应用阵法倍率', () => {
    const gs = createGame(level);
    addSoldier(gs, '刀', { x: 2, y: 1 });
    addSoldier(gs, '骑', { x: 4, y: 1 });
    gs.soldiers[1].cooldown = 99;
    const e = addEnemy(gs, 1);
    tickCombat(gs, level, 0.016);
    expect(e.hp).toBe(10000 - Math.round(soldierDamage('刀', 1) * 1.12));
  });

  it('空阵时给出下一步提示', () => {
    const gs = createGame(level);
    expect(formationHint(gs)).toContain('混搭兵种');
    addSoldier(gs, '刀', { x: 0, y: 1 });
    expect(formationHint(gs)).toContain('骑');
  });
});
