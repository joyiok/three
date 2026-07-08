import {
  BASE_HP,
  HP_WAVE_GROWTH,
  RALLY_RATE_MULT,
  RALLY_TIME,
  SLOW_ALL_AMOUNT,
  SLOW_ALL_TIME,
  waveCoeff,
} from './config';
import { damageEnemy } from './combat';
import { enemyPos } from './waves';
import type { GameState, ItemKind, LevelDef, Vec } from './types';

/** 火攻作用半径（格） */
export const FIRE_RADIUS = 1.6;

export interface ItemDef {
  kind: ItemKind;
  name: string;
  icon: string;
  desc: string;
  /** true = 需要点选画布一格才能释放（火攻） */
  targeted?: boolean;
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  fire: { kind: 'fire', name: '火攻', icon: '火', desc: '点选一格，烈焰灼烧周围敌军（无视护甲）', targeted: true },
  arrowRain: { kind: 'arrowRain', name: '箭雨', icon: '雨', desc: '万箭齐发，全场敌军各中一矢' },
  rockfall: { kind: 'rockfall', name: '落石', icon: '石', desc: '巨石砸向最前方的敌军（无视护甲）' },
  slowAll: { kind: 'slowAll', name: '缓兵', icon: '缓', desc: `全场敌军减速 ${Math.round(SLOW_ALL_AMOUNT * 100)}%，持续 ${SLOW_ALL_TIME} 秒` },
  rally: { kind: 'rally', name: '鼓舞', icon: '鼓', desc: `全军攻速 +${Math.round((RALLY_RATE_MULT - 1) * 100)}%，持续 ${RALLY_TIME} 秒` },
  heal: { kind: 'heal', name: '修营', icon: '修', desc: '营寨恢复 2 点血量' },
  food: { kind: 'food', name: '征粮', icon: '粮', desc: '立得 15 粮食' },
  merge: { kind: 'merge', name: '神合', icon: '合', desc: '随机一对同字同级士兵立即合成升级' },
};

/** 道具伤害随波次成长（与敌人 HP 同曲线），保证后期不鸡肋 */
function itemDamageScale(gs: GameState, level: LevelDef): number {
  const wave = Math.max(1, gs.waveIndex + 1);
  return (1 + HP_WAVE_GROWTH * (wave - 1)) * waveCoeff(level.coeff, wave);
}

const FIRE_BASE_DMG = 70;
const ARROW_RAIN_BASE_DMG = 30;
const ROCKFALL_BASE_DMG = 220;

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 神合：随机挑一对同字同级士兵合成，优先场上的（立即产生战力） */
function tryInstantMerge(gs: GameState, rand: () => number): boolean {
  const fielded = gs.soldiers.filter((s) => s.cell);
  const benched: { s: NonNullable<GameState['bench'][number]>; i: number }[] = [];
  gs.bench.forEach((s, i) => {
    if (s) benched.push({ s, i });
  });
  type Pair = { consume: () => void; grow: () => void; onField: boolean };
  const pairs: Pair[] = [];
  for (let i = 0; i < fielded.length; i++) {
    for (let j = i + 1; j < fielded.length; j++) {
      const a = fielded[i];
      const b = fielded[j];
      if (a.kind !== b.kind || a.level !== b.level) continue;
      pairs.push({
        consume: () => (gs.soldiers = gs.soldiers.filter((s) => s.id !== a.id)),
        grow: () => {
          b.level += 1;
          b.cooldown = 0;
          gs.events.push({ t: 'merge', cell: { ...b.cell! }, level: b.level, soldierId: b.id });
        },
        onField: true,
      });
    }
  }
  for (const { s: bs, i } of benched) {
    for (const f of fielded) {
      if (bs.kind !== f.kind || bs.level !== f.level) continue;
      pairs.push({
        consume: () => (gs.bench[i] = null),
        grow: () => {
          f.level += 1;
          f.cooldown = 0;
          gs.events.push({ t: 'merge', cell: { ...f.cell! }, level: f.level, soldierId: f.id });
        },
        onField: true,
      });
    }
  }
  for (let i = 0; i < benched.length; i++) {
    for (let j = i + 1; j < benched.length; j++) {
      const a = benched[i];
      const b = benched[j];
      if (a.s.kind !== b.s.kind || a.s.level !== b.s.level) continue;
      pairs.push({
        consume: () => (gs.bench[a.i] = null),
        grow: () => {
          b.s.level += 1;
          b.s.cooldown = 0;
          gs.events.push({ t: 'merge', cell: { x: -1, y: -1 }, level: b.s.level, soldierId: b.s.id });
        },
        onField: false,
      });
    }
  }
  if (pairs.length === 0) return false;
  const onField = pairs.filter((p) => p.onField);
  const pool = onField.length > 0 ? onField : pairs;
  const pick = pool[Math.floor(rand() * pool.length)];
  pick.consume();
  pick.grow();
  return true;
}

/**
 * 使用锦囊中第 index 个道具。
 * targeted 道具（火攻）必须给 targetCell；当前无意义的使用（如满血修营、空场箭雨）
 * 返回 false 且不消耗道具。
 */
export function useItem(
  gs: GameState,
  level: LevelDef,
  index: number,
  targetCell?: Vec,
  rand: () => number = Math.random,
): boolean {
  if (gs.status !== 'playing') return false;
  const item = gs.items[index];
  if (!item) return false;
  const def = ITEM_DEFS[item];
  if (def.targeted && !targetCell) return false;
  const scale = itemDamageScale(gs, level);

  switch (item) {
    case 'fire': {
      const dmg = Math.round(FIRE_BASE_DMG * scale);
      const center = { x: targetCell!.x, y: targetCell!.y };
      const targets = gs.enemies.filter((e) => dist(center, enemyPos(level, e)) <= FIRE_RADIUS);
      if (targets.length === 0) return false;
      for (const e of targets) damageEnemy(gs, level, e, dmg, true);
      break;
    }
    case 'arrowRain': {
      if (gs.enemies.length === 0) return false;
      const dmg = Math.round(ARROW_RAIN_BASE_DMG * scale);
      for (const e of [...gs.enemies]) damageEnemy(gs, level, e, dmg);
      break;
    }
    case 'rockfall': {
      if (gs.enemies.length === 0) return false;
      const dmg = Math.round(ROCKFALL_BASE_DMG * scale);
      const front = gs.enemies.reduce((a, b) => (b.progress > a.progress ? b : a));
      damageEnemy(gs, level, front, dmg, true);
      break;
    }
    case 'slowAll':
      gs.slowAllUntil = gs.time + SLOW_ALL_TIME;
      break;
    case 'rally':
      gs.rallyUntil = gs.time + RALLY_TIME;
      break;
    case 'heal':
      if (gs.baseHp >= BASE_HP) return false;
      gs.baseHp = Math.min(BASE_HP, gs.baseHp + 2);
      break;
    case 'food':
      gs.food += 15;
      break;
    case 'merge':
      if (!tryInstantMerge(gs, rand)) return false;
      break;
  }
  gs.items.splice(index, 1);
  gs.events.push(
    def.targeted ? { t: 'itemUse', item, cell: { ...targetCell! } } : { t: 'itemUse', item },
  );
  return true;
}
