import type { EnemyKind, SoldierKind } from './types';

export const GRID_W = 7;
export const GRID_H = 10;
export const BENCH_SIZE = 6;
export const START_FOOD = 30;
export const BASE_HP = 10;
export const RECRUIT_BASE = 10;
export const RECRUIT_STEP = 1;
export const RECRUIT_MAX = 24;
export const SELL_REFUND_PER_LEVEL = 5;
export const WAVE_CLEAR_BONUS = 15;
export const WAVE_AUTO_DELAY = 3;
export const DMG_GROWTH = 1.8;
export const RANGE_GROWTH = 0.15;
export const HP_WAVE_GROWTH = 0.15;

export interface SoldierSpec {
  range: number;
  /** 次/秒；0 表示不攻击（光环型） */
  rate: number;
  damage: number;
  weight: number;
  splash?: number;
  pierce?: boolean;
  slowAura?: { base: number; perLevel: number; max: number };
}

export const SOLDIERS: Record<SoldierKind, SoldierSpec> = {
  刀: { range: 1.3, rate: 1.2, damage: 10, weight: 28 },
  枪: { range: 2.5, rate: 0.8, damage: 8, weight: 24, pierce: true },
  弓: { range: 3.5, rate: 1.0, damage: 12, weight: 24 },
  骑: { range: 2.0, rate: 0.5, damage: 25, weight: 14, splash: 0.8 },
  忠: { range: 1.5, rate: 0, damage: 0, weight: 10, slowAura: { base: 0.35, perLevel: 0.05, max: 0.6 } },
};

export const SOLDIER_KINDS = Object.keys(SOLDIERS) as SoldierKind[];

export interface EnemySpec {
  hp: number;
  speed: number;
  bounty: number;
  damage: number;
}

export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  斗: { hp: 30, speed: 1.0, bounty: 3, damage: 1 },
  贼: { hp: 20, speed: 1.6, bounty: 3, damage: 1 },
  兵: { hp: 80, speed: 0.8, bounty: 6, damage: 1 },
  将: { hp: 300, speed: 0.7, bounty: 15, damage: 2 },
  boss: { hp: 0, speed: 0.5, bounty: 80, damage: 10 },
};

export function soldierDamage(kind: SoldierKind, level: number): number {
  return Math.round(SOLDIERS[kind].damage * DMG_GROWTH ** (level - 1));
}

export function soldierRange(kind: SoldierKind, level: number): number {
  return SOLDIERS[kind].range + RANGE_GROWTH * (level - 1);
}

export function slowOf(level: number): number {
  const aura = SOLDIERS['忠'].slowAura!;
  return Math.min(aura.base + aura.perLevel * (level - 1), aura.max);
}

export function enemyHp(kind: EnemyKind, wave: number, coeff: number, bossHp?: number): number {
  if (kind === 'boss') return Math.round(bossHp ?? 0);
  return Math.round(ENEMIES[kind].hp * (1 + HP_WAVE_GROWTH * (wave - 1)) * coeff);
}

export function rollSoldier(rand: () => number): SoldierKind {
  const total = SOLDIER_KINDS.reduce((s, k) => s + SOLDIERS[k].weight, 0);
  let r = rand() * total;
  for (const k of SOLDIER_KINDS) {
    r -= SOLDIERS[k].weight;
    if (r < 0) return k;
  }
  return SOLDIER_KINDS[SOLDIER_KINDS.length - 1];
}
