import type { EnemyKind, ItemKind, SoldierKind } from './types';

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
export const WAVE_AUTO_DELAY = 8;
/** 开局准备时间（秒）：留给玩家征兵布阵 */
export const PREP_TIME = 25;
/** 提前开波：按剩余秒数奖励粮食，封顶 */
export const EARLY_CALL_MAX = 10;
/** 波末利息：每 10 粮 +1，封顶 */
export const INTEREST_UNIT = 10;
export const INTEREST_CAP = 10;
/** 忠「屯田」：每波结束按等级产粮 */
export const FARM_FOOD_PER_LEVEL = 3;
/** 每波清空征兵价回落 */
export const RECRUIT_DECAY = 1;
export const DMG_GROWTH = 1.8;
export const RANGE_GROWTH = 0.15;
/** 攻速每级 +10%（让合成稳赚不亏） */
export const RATE_GROWTH = 0.1;
/** 骑溅射半径每级成长 */
export const SPLASH_GROWTH = 0.08;
export const HP_WAVE_GROWTH = 0.15;
/** 骑「践踏」（3 级起）：命中减速比例与时长 */
export const DAZE_SLOW = 0.5;
export const DAZE_TIME = 0.8;
/** Boss 低于半血狂暴提速 */
export const BOSS_ENRAGE_HP = 0.5;
export const BOSS_ENRAGE_SPEED = 1.4;
/** 道具「鼓舞」：全军攻速倍率与持续时长（秒） */
export const RALLY_RATE_MULT = 1.5;
export const RALLY_TIME = 8;
/** 道具「缓兵」：全场敌军减速比例与持续时长（秒） */
export const SLOW_ALL_AMOUNT = 0.5;
export const SLOW_ALL_TIME = 5;
/** 锦囊容量 */
export const ITEM_BAG_MAX = 3;

export const ITEM_KINDS: ItemKind[] = [
  'fire', 'arrowRain', 'rockfall', 'slowAll', 'rally', 'heal', 'food', 'merge',
];

/** 各敌种击杀掉落道具的概率 */
export const ITEM_DROP_CHANCE: Record<EnemyKind, number> = {
  斗: 0.03,
  贼: 0.03,
  兵: 0.07,
  将: 0.45,
  boss: 1,
};

/** 击杀掉落判定：返回掉落的道具种类或 null */
export function rollItemDrop(kind: EnemyKind, rand: () => number = Math.random): ItemKind | null {
  if (rand() >= ITEM_DROP_CHANCE[kind]) return null;
  return ITEM_KINDS[Math.floor(rand() * ITEM_KINDS.length)];
}

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
  /** 每次受击减免固定伤害（枪无视），随关卡系数放大 */
  armor?: number;
  /** 每秒回复 maxHp 的比例 */
  regen?: number;
}

export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  斗: { hp: 30, speed: 1.0, bounty: 3, damage: 1 },
  贼: { hp: 20, speed: 1.6, bounty: 3, damage: 1 },
  兵: { hp: 80, speed: 0.8, bounty: 6, damage: 1, armor: 3 },
  将: { hp: 300, speed: 0.7, bounty: 15, damage: 2, armor: 6, regen: 0.008 },
  boss: { hp: 0, speed: 0.45, bounty: 80, damage: 7, armor: 8 },
};

export function soldierDamage(kind: SoldierKind, level: number): number {
  return Math.round(SOLDIERS[kind].damage * DMG_GROWTH ** (level - 1));
}

export function soldierRange(kind: SoldierKind, level: number): number {
  return SOLDIERS[kind].range + RANGE_GROWTH * (level - 1);
}

export function soldierRate(kind: SoldierKind, level: number): number {
  return SOLDIERS[kind].rate * (1 + RATE_GROWTH * (level - 1));
}

export function soldierSplash(level: number): number {
  return (SOLDIERS['骑'].splash ?? 0) + SPLASH_GROWTH * (level - 1);
}

/** 弓「连珠」：3 级双矢、5 级三矢 */
export function arrowCount(level: number): number {
  return level >= 5 ? 3 : level >= 3 ? 2 : 1;
}

/** 刀「连斩」：3 级二连、5 级三连（追加斩 50% 伤害） */
export function bladeStrikes(level: number): number {
  return level >= 5 ? 3 : level >= 3 ? 2 : 1;
}

export function enemyArmor(kind: EnemyKind, coeff: number): number {
  return Math.round((ENEMIES[kind].armor ?? 0) * coeff);
}

export function slowOf(level: number): number {
  const aura = SOLDIERS['忠'].slowAura!;
  return Math.min(aura.base + aura.perLevel * (level - 1), aura.max);
}

/** 关卡系数渐进生效：第 1 波为 1.0，到第 11 波爬满全额，避免后期关卡开局即无解 */
export function waveCoeff(coeff: number, wave: number): number {
  const ramp = Math.min(1, Math.max(0, wave - 1) / 10);
  return 1 + (coeff - 1) * ramp;
}

export function enemyHp(kind: EnemyKind, wave: number, coeff: number, bossHp?: number): number {
  if (kind === 'boss') return Math.round(bossHp ?? 0);
  return Math.round(ENEMIES[kind].hp * (1 + HP_WAVE_GROWTH * (wave - 1)) * waveCoeff(coeff, wave));
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
