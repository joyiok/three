import { SOLDIERS, slowOf, soldierDamage, soldierRange } from './config';
import { enemyPos } from './waves';
import type { Enemy, GameState, LevelDef, Projectile, Soldier, Vec } from './types';

const ARROW_SPEED = 8;
const ARROW_HIT_DIST = 0.3;
const PIERCE_HALF_WIDTH = 0.5;

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function damageEnemy(gs: GameState, level: LevelDef, e: Enemy, dmg: number): void {
  if (e.hp <= 0) return;
  e.hp -= dmg;
  const pos = enemyPos(level, e);
  gs.events.push({ t: 'hit', x: pos.x, y: pos.y, damage: dmg });
  if (e.hp <= 0) {
    gs.enemies = gs.enemies.filter((v) => v.id !== e.id);
    gs.food += e.bounty;
    gs.events.push({ t: 'kill', x: pos.x, y: pos.y, bounty: e.bounty });
  }
}

function findTarget(gs: GameState, level: LevelDef, at: Vec, range: number): Enemy | null {
  let best: Enemy | null = null;
  for (const e of gs.enemies) {
    if (dist(at, enemyPos(level, e)) > range) continue;
    if (!best || e.progress > best.progress) best = e;
  }
  return best;
}

function attack(gs: GameState, level: LevelDef, s: Soldier, target: Enemy): void {
  const spec = SOLDIERS[s.kind];
  const at = s.cell!;
  const dmg = soldierDamage(s.kind, s.level);
  const range = soldierRange(s.kind, s.level);
  gs.events.push({ t: 'shoot', kind: s.kind, from: { ...at } });

  if (s.kind === '弓') {
    gs.projectiles.push({
      id: gs.nextId++, x: at.x, y: at.y, targetId: target.id,
      speed: ARROW_SPEED, damage: dmg,
    });
    return;
  }
  if (spec.pierce) {
    const tp = enemyPos(level, target);
    const len = dist(at, tp) || 1;
    const dir = { x: (tp.x - at.x) / len, y: (tp.y - at.y) / len };
    for (const e of [...gs.enemies]) {
      const ep = enemyPos(level, e);
      const rel = { x: ep.x - at.x, y: ep.y - at.y };
      const proj = rel.x * dir.x + rel.y * dir.y;
      if (proj < 0 || proj > range) continue;
      const perp = Math.abs(rel.x * dir.y - rel.y * dir.x);
      if (perp <= PIERCE_HALF_WIDTH) damageEnemy(gs, level, e, dmg);
    }
    return;
  }
  if (spec.splash) {
    const tp = enemyPos(level, target);
    for (const e of [...gs.enemies]) {
      if (dist(tp, enemyPos(level, e)) <= spec.splash) damageEnemy(gs, level, e, dmg);
    }
    return;
  }
  damageEnemy(gs, level, target, dmg);
}

export function tickCombat(gs: GameState, level: LevelDef, dt: number): void {
  if (gs.status !== 'playing') return;

  // 1) 重算减速：取覆盖该敌人的最强忠光环
  for (const e of gs.enemies) {
    const pos = enemyPos(level, e);
    let slow = 0;
    for (const s of gs.soldiers) {
      if (s.kind !== '忠' || !s.cell) continue;
      if (dist(s.cell, pos) <= soldierRange('忠', s.level)) {
        slow = Math.max(slow, slowOf(s.level));
      }
    }
    e.slow = slow;
  }

  // 2) 士兵攻击
  for (const s of gs.soldiers) {
    const spec = SOLDIERS[s.kind];
    if (spec.rate <= 0 || !s.cell) continue;
    s.cooldown -= dt;
    if (s.cooldown > 0) continue;
    const target = findTarget(gs, level, s.cell, soldierRange(s.kind, s.level));
    if (!target) {
      s.cooldown = 0;
      continue;
    }
    s.cooldown = 1 / spec.rate;
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
