import {
  DAZE_SLOW,
  DAZE_TIME,
  ITEM_BAG_MAX,
  RALLY_RATE_MULT,
  SLOW_ALL_AMOUNT,
  SOLDIERS,
  arrowCount,
  bladeStrikes,
  rollItemDrop,
  slowOf,
  soldierDamage,
  soldierRange,
  soldierRate,
  soldierSplash,
} from './config';
import { formationDamageMultiplier } from './formations';
import { enemyPos } from './waves';
import type { Enemy, GameState, LevelDef, Projectile, Soldier, Vec } from './types';

const ARROW_SPEED = 8;
const ARROW_HIT_DIST = 0.3;
const PIERCE_HALF_WIDTH = 0.5;
/** 连斩追加斩的伤害比例 */
const EXTRA_STRIKE_RATIO = 0.5;

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 结算一次伤害：默认吃护甲减免（至少 1 点），枪破甲可无视 */
export function damageEnemy(
  gs: GameState,
  level: LevelDef,
  e: Enemy,
  dmg: number,
  ignoreArmor = false,
): void {
  if (e.hp <= 0) return;
  const armor = ignoreArmor ? 0 : (e.armor ?? 0);
  const dealt = Math.max(1, dmg - armor);
  e.hp -= dealt;
  const pos = enemyPos(level, e);
  gs.events.push({ t: 'hit', x: pos.x, y: pos.y, damage: dealt, enemyId: e.id });
  if (e.hp <= 0) {
    gs.enemies = gs.enemies.filter((v) => v.id !== e.id);
    gs.food += e.bounty;
    gs.events.push({ t: 'kill', x: pos.x, y: pos.y, bounty: e.bounty, enemyId: e.id });
    // 击杀掉落锦囊道具
    if (gs.items.length < ITEM_BAG_MAX) {
      const item = rollItemDrop(e.kind);
      if (item) {
        gs.items.push(item);
        gs.events.push({ t: 'itemGain', item, x: pos.x, y: pos.y });
      }
    }
  }
}

/** 索敌：远程（弓）打 progress 最大；其余近战打距离最近（眼前优先） */
function findTarget(gs: GameState, level: LevelDef, s: Soldier, at: Vec, range: number): Enemy | null {
  const isRanged = s.kind === '弓';
  let best: Enemy | null = null;
  let bestKey = -Infinity;
  for (const e of gs.enemies) {
    const d = dist(at, enemyPos(level, e));
    if (d > range) continue;
    const key = isRanged ? e.progress : -d;
    if (key > bestKey) {
      bestKey = key;
      best = e;
    }
  }
  return best;
}

/** 弓「连珠」：取射程内 progress 前 n 名 */
function findArrowTargets(gs: GameState, level: LevelDef, at: Vec, range: number, n: number): Enemy[] {
  return gs.enemies
    .filter((e) => dist(at, enemyPos(level, e)) <= range)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, n);
}

function attack(gs: GameState, level: LevelDef, s: Soldier, target: Enemy): void {
  const spec = SOLDIERS[s.kind];
  const at = s.cell!;
  const dmg = Math.round(soldierDamage(s.kind, s.level) * formationDamageMultiplier(gs, s.kind));
  const range = soldierRange(s.kind, s.level);
  gs.events.push({ t: 'shoot', kind: s.kind, from: { ...at }, to: enemyPos(level, target), soldierId: s.id });

  if (s.kind === '弓') {
    for (const t of findArrowTargets(gs, level, at, range, arrowCount(s.level))) {
      gs.projectiles.push({
        id: gs.nextId++, x: at.x, y: at.y, targetId: t.id,
        speed: ARROW_SPEED, damage: dmg,
      });
    }
    return;
  }
  if (spec.pierce) {
    // 枪「破甲」：直线穿刺且无视护甲
    const tp = enemyPos(level, target);
    const len = dist(at, tp) || 1;
    const dir = { x: (tp.x - at.x) / len, y: (tp.y - at.y) / len };
    for (const e of [...gs.enemies]) {
      const ep = enemyPos(level, e);
      const rel = { x: ep.x - at.x, y: ep.y - at.y };
      const proj = rel.x * dir.x + rel.y * dir.y;
      if (proj < 0 || proj > range) continue;
      const perp = Math.abs(rel.x * dir.y - rel.y * dir.x);
      if (perp <= PIERCE_HALF_WIDTH) damageEnemy(gs, level, e, dmg, true);
    }
    return;
  }
  if (spec.splash) {
    // 骑：溅射半径随等级成长；3 级起「践踏」命中减速
    const tp = enemyPos(level, target);
    const radius = soldierSplash(s.level);
    const daze = s.level >= 3;
    for (const e of [...gs.enemies]) {
      if (dist(tp, enemyPos(level, e)) > radius) continue;
      if (daze) e.dazeUntil = gs.time + DAZE_TIME;
      damageEnemy(gs, level, e, dmg);
    }
    return;
  }
  // 刀「连斩」：3 级起追加斩（50% 伤害）
  damageEnemy(gs, level, target, dmg);
  for (let i = 1; i < bladeStrikes(s.level); i++) {
    damageEnemy(gs, level, target, Math.max(1, Math.round(dmg * EXTRA_STRIKE_RATIO)));
  }
}

export function tickCombat(gs: GameState, level: LevelDef, dt: number): void {
  if (gs.status !== 'playing') return;

  // 1) 重算减速：取覆盖该敌人的最强忠光环，与骑践踏/道具「缓兵」取较大者
  const globalSlow = gs.time < gs.slowAllUntil ? SLOW_ALL_AMOUNT : 0;
  for (const e of gs.enemies) {
    const pos = enemyPos(level, e);
    let slow = Math.max(globalSlow, gs.time < (e.dazeUntil ?? 0) ? DAZE_SLOW : 0);
    for (const s of gs.soldiers) {
      if (s.kind !== '忠' || !s.cell) continue;
      if (dist(s.cell, pos) <= soldierRange('忠', s.level)) {
        slow = Math.max(slow, slowOf(s.level));
      }
    }
    e.slow = slow;
  }

  // 2) 士兵攻击（道具「鼓舞」期间全军攻速加成）
  const rateMult = gs.time < gs.rallyUntil ? RALLY_RATE_MULT : 1;
  for (const s of gs.soldiers) {
    const spec = SOLDIERS[s.kind];
    if (spec.rate <= 0 || !s.cell) continue;
    s.cooldown -= dt;
    if (s.cooldown > 0) continue;
    const target = findTarget(gs, level, s, s.cell, soldierRange(s.kind, s.level));
    if (!target) {
      s.cooldown = 0;
      continue;
    }
    s.cooldown = 1 / (soldierRate(s.kind, s.level) * rateMult);
    attack(gs, level, s, target);
  }

  // 3) 弹道飞行
  const alive: Projectile[] = [];
  for (const p of gs.projectiles) {
    const target = gs.enemies.find((e) => e.id === p.targetId);
    if (!target) continue; // 目标已死，箭矢消散
    const tp = enemyPos(level, target);
    const d = dist(p, tp);
    const step = p.speed * dt;
    if (d <= ARROW_HIT_DIST || step >= d) {
      damageEnemy(gs, level, target, p.damage);
    } else {
      p.x += ((tp.x - p.x) / d) * step;
      p.y += ((tp.y - p.y) / d) * step;
      alive.push(p);
    }
  }
  gs.projectiles = alive;
}
