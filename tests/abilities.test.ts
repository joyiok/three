import { describe, expect, it } from 'vitest';
import {
  BOSS_ENRAGE_SPEED,
  DAZE_SLOW,
  EARLY_CALL_MAX,
  FARM_FOOD_PER_LEVEL,
  PREP_TIME,
  RECRUIT_BASE,
  WAVE_CLEAR_BONUS,
  arrowCount,
  bladeStrikes,
  enemyArmor,
  soldierDamage,
  soldierRate,
  soldierSplash,
} from '../src/game/config';
import { damageEnemy, tickCombat } from '../src/game/combat';
import { LEVELS } from '../src/game/levels';
import { createGame } from '../src/game/state';
import { callWave, tickWave } from '../src/game/waves';
import type { Enemy, GameState, SoldierKind, Vec } from '../src/game/types';

const level = LEVELS[0]; // coeff 1.0，路径 (3,0)→(3,4)→(1,4)→(1,8)→(6,8)

function addSoldier(gs: GameState, kind: SoldierKind, lv: number, cell: Vec) {
  const s = { id: gs.nextId++, kind, level: lv, cell, cooldown: 0 };
  gs.soldiers.push(s);
  return s;
}

function addEnemy(gs: GameState, progress: number, hp = 10000, extra: Partial<Enemy> = {}): Enemy {
  const e: Enemy = {
    id: gs.nextId++, kind: '斗', word: '斗', hp, maxHp: hp,
    speed: 0, slow: 0, pathIndex: 0, progress, bounty: 3, damage: 1,
    ...extra,
  };
  gs.enemies.push(e);
  return e;
}

describe('等级成长', () => {
  it('攻速每级 +10%', () => {
    expect(soldierRate('刀', 1)).toBeCloseTo(1.2);
    expect(soldierRate('刀', 3)).toBeCloseTo(1.2 * 1.2);
  });

  it('里程碑：3/5 级解锁连斩与连珠', () => {
    expect(bladeStrikes(2)).toBe(1);
    expect(bladeStrikes(3)).toBe(2);
    expect(bladeStrikes(5)).toBe(3);
    expect(arrowCount(2)).toBe(1);
    expect(arrowCount(3)).toBe(2);
    expect(arrowCount(5)).toBe(3);
  });

  it('骑溅射半径随等级成长', () => {
    expect(soldierSplash(1)).toBeCloseTo(0.8);
    expect(soldierSplash(3)).toBeCloseTo(0.96);
  });
});

describe('护甲与破甲', () => {
  it('护甲减免固定伤害，至少造成 1 点', () => {
    const gs = createGame(level);
    const e = addEnemy(gs, 1, 100, { armor: 5 });
    damageEnemy(gs, level, e, 12);
    expect(e.hp).toBe(100 - 7);
    damageEnemy(gs, level, e, 3); // 3-5 → 保底 1
    expect(e.hp).toBe(100 - 8);
  });

  it('枪穿刺无视护甲', () => {
    const gs = createGame(level);
    addSoldier(gs, '枪', 1, { x: 4, y: 4 }); // 射程2.5，指向 (3,4)
    const e = addEnemy(gs, 4, 100, { armor: 6 }); // (3,4)
    tickCombat(gs, level, 0.016);
    expect(e.hp).toBe(100 - soldierDamage('枪', 1)); // 8 全额
  });

  it('enemyArmor 随关卡系数缩放', () => {
    expect(enemyArmor('兵', 1)).toBe(3);
    expect(enemyArmor('将', 2)).toBe(12);
    expect(enemyArmor('斗', 2.5)).toBe(0);
  });
});

describe('弓连珠', () => {
  it('3 级弓一次向两个目标各发一矢', () => {
    const gs = createGame(level);
    addSoldier(gs, '弓', 3, { x: 1, y: 1 });
    addEnemy(gs, 1);
    addEnemy(gs, 2);
    addEnemy(gs, 3);
    tickCombat(gs, level, 0.016);
    expect(gs.projectiles).toHaveLength(2);
    const ids = gs.projectiles.map((p) => p.targetId);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('骑践踏', () => {
  it('3 级骑命中后目标获得践踏减速', () => {
    const gs = createGame(level);
    addSoldier(gs, '骑', 3, { x: 2, y: 2 });
    const e = addEnemy(gs, 2);
    gs.time = 10;
    tickCombat(gs, level, 0.016);
    expect(e.dazeUntil).toBeGreaterThan(10);
    tickCombat(gs, level, 0.016); // 下一帧重算 slow
    expect(e.slow).toBeCloseTo(DAZE_SLOW);
  });

  it('1 级骑不践踏', () => {
    const gs = createGame(level);
    addSoldier(gs, '骑', 1, { x: 2, y: 2 });
    const e = addEnemy(gs, 2);
    tickCombat(gs, level, 0.016);
    expect(e.dazeUntil ?? 0).toBe(0);
  });
});

describe('敌人机制', () => {
  it('将回气：每秒回复 maxHp 比例', () => {
    const gs = createGame(level);
    gs.intermission = false;
    gs.waveIndex = 0;
    const e = addEnemy(gs, 1, 1000, { regen: 0.012, speed: 0 });
    e.hp = 500;
    tickWave(gs, level, 1);
    expect(e.hp).toBeCloseTo(500 + 12, 0);
  });

  it('Boss 半血狂暴提速', () => {
    const gs = createGame(level);
    gs.intermission = false;
    gs.waveIndex = 0;
    const slowBoss = addEnemy(gs, 0, 1000, { kind: 'boss', speed: 1 });
    tickWave(gs, level, 1);
    expect(slowBoss.progress).toBeCloseTo(1);
    slowBoss.hp = 400; // 半血以下
    tickWave(gs, level, 1);
    expect(slowBoss.progress).toBeCloseTo(1 + BOSS_ENRAGE_SPEED);
  });
});

describe('经济与节奏', () => {
  it('开局有准备期', () => {
    const gs = createGame(level);
    expect(gs.waveTimer).toBe(PREP_TIME);
    expect(gs.intermission).toBe(true);
  });

  it('提前开波按剩余秒数奖励粮（封顶）', () => {
    const gs = createGame(level);
    gs.waveTimer = 6.3;
    const before = gs.food;
    expect(callWave(gs, level)).toBe(true);
    expect(gs.food).toBe(before + 7);
    expect(gs.intermission).toBe(false);

    const gs2 = createGame(level);
    gs2.waveTimer = 25; // 准备期封顶
    const before2 = gs2.food;
    callWave(gs2, level);
    expect(gs2.food).toBe(before2 + EARLY_CALL_MAX);
  });

  it('非休整期不能 callWave', () => {
    const gs = createGame(level);
    callWave(gs, level);
    expect(callWave(gs, level)).toBe(false);
  });

  it('波末结算：忠屯田产粮、征兵价回落', () => {
    const gs = createGame(level);
    callWave(gs, level);
    addSoldier(gs, '忠', 2, { x: 0, y: 1 });
    gs.recruitCost = 14;
    gs.spawnQueue = [];
    gs.enemies = [];
    gs.food = 0;
    tickWave(gs, level, 0.1);
    const interest = Math.floor(WAVE_CLEAR_BONUS / 10);
    expect(gs.food).toBe(WAVE_CLEAR_BONUS + interest + FARM_FOOD_PER_LEVEL * 2);
    expect(gs.recruitCost).toBe(13);
    expect(gs.events.some((e) => e.t === 'income' && e.source === 'farm')).toBe(true);
  });

  it('征兵价不低于基准价', () => {
    const gs = createGame(level);
    callWave(gs, level);
    gs.recruitCost = RECRUIT_BASE;
    gs.spawnQueue = [];
    gs.enemies = [];
    tickWave(gs, level, 0.1);
    expect(gs.recruitCost).toBe(RECRUIT_BASE);
  });
});
