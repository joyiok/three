import {
  BOSS_ENRAGE_HP,
  BOSS_ENRAGE_SPEED,
  EARLY_CALL_MAX,
  ENEMIES,
  FARM_FOOD_PER_LEVEL,
  INTEREST_CAP,
  INTEREST_UNIT,
  RECRUIT_BASE,
  RECRUIT_DECAY,
  WAVE_AUTO_DELAY,
  WAVE_CLEAR_BONUS,
  enemyArmor,
  enemyHp,
  waveCoeff,
} from './config';
import type { Enemy, GameState, LevelDef, SpawnEvent, Vec } from './types';

export function pathLength(level: LevelDef, pathIndex: number): number {
  return level.paths[pathIndex].length - 1;
}

export function enemyPos(level: LevelDef, e: Enemy): Vec {
  const path = level.paths[e.pathIndex];
  const p = Math.max(0, Math.min(e.progress, path.length - 1));
  const i = Math.min(Math.floor(p), path.length - 2);
  const frac = p - i;
  const a = path[i];
  const b = path[i + 1];
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
}

export function startWave(gs: GameState, level: LevelDef): boolean {
  if (gs.status !== 'playing') return false;
  if (gs.waveIndex >= level.waves.length - 1) return false;
  gs.waveIndex += 1;
  gs.waveClock = 0;
  gs.intermission = false;
  const wave = level.waves[gs.waveIndex];
  const queue: SpawnEvent[] = [];
  for (const grp of wave.groups) {
    for (let i = 0; i < grp.count; i++) {
      queue.push({ at: grp.delay + i * grp.interval, kind: grp.kind, pathIndex: grp.pathIndex ?? 0 });
    }
  }
  queue.sort((a, b) => a.at - b.at);
  gs.spawnQueue = queue;
  gs.events.push({ t: 'waveStart', wave: gs.waveIndex });
  if (wave.groups.some((g) => g.kind === 'boss')) {
    gs.events.push({ t: 'boss', word: level.bossWord });
  }
  return true;
}

/** 手动提前开波：按剩余休整秒数奖励粮食 */
export function callWave(gs: GameState, level: LevelDef): boolean {
  if (!gs.intermission) return false;
  const remaining = Math.max(0, gs.waveTimer);
  if (!startWave(gs, level)) return false;
  const bonus = Math.min(EARLY_CALL_MAX, Math.ceil(remaining));
  if (bonus > 0) {
    gs.food += bonus;
    gs.events.push({ t: 'income', amount: bonus, source: 'early' });
  }
  return true;
}

/** 某一波的敌人构成（合并同字计数），用于 UI 预告 */
export function wavePreview(level: LevelDef, waveIndex: number): { word: string; count: number }[] {
  const wave = level.waves[waveIndex];
  if (!wave) return [];
  const counts = new Map<string, number>();
  for (const grp of wave.groups) {
    const word = grp.kind === 'boss' ? level.bossWord : grp.kind;
    counts.set(word, (counts.get(word) ?? 0) + grp.count);
  }
  return [...counts].map(([word, count]) => ({ word, count }));
}

function spawnEnemy(gs: GameState, level: LevelDef, ev: SpawnEvent): void {
  const spec = ENEMIES[ev.kind];
  const hp = enemyHp(ev.kind, gs.waveIndex + 1, level.coeff, level.bossHp);
  gs.enemies.push({
    id: gs.nextId++,
    kind: ev.kind,
    word: ev.kind === 'boss' ? level.bossWord : ev.kind,
    hp,
    maxHp: hp,
    speed: spec.speed,
    slow: 0,
    pathIndex: ev.pathIndex,
    progress: 0,
    bounty: spec.bounty,
    damage: spec.damage,
    armor: enemyArmor(ev.kind, waveCoeff(level.coeff, gs.waveIndex + 1)),
    regen: spec.regen ?? 0,
    dazeUntil: 0,
  });
}

export function tickWave(gs: GameState, level: LevelDef, dt: number): void {
  if (gs.status !== 'playing') return;

  // 波间休整倒计时
  if (gs.intermission) {
    gs.waveTimer -= dt;
    if (gs.waveTimer <= 0) startWave(gs, level);
    return;
  }

  // 出怪
  gs.waveClock += dt;
  while (gs.spawnQueue.length > 0 && gs.spawnQueue[0].at <= gs.waveClock) {
    spawnEnemy(gs, level, gs.spawnQueue.shift()!);
  }

  // 移动与漏怪
  const survivors: Enemy[] = [];
  for (const e of gs.enemies) {
    // 将「回气」：持续回复
    if ((e.regen ?? 0) > 0 && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + e.regen! * e.maxHp * dt);
    }
    // Boss 半血狂暴提速
    const enraged = e.kind === 'boss' && e.hp < e.maxHp * BOSS_ENRAGE_HP;
    const speed = enraged ? e.speed * BOSS_ENRAGE_SPEED : e.speed;
    e.progress += speed * (1 - e.slow) * dt;
    if (e.progress >= pathLength(level, e.pathIndex)) {
      gs.baseHp = Math.max(0, gs.baseHp - e.damage);
      gs.events.push({ t: 'leak', damage: e.damage });
      if (gs.baseHp <= 0) {
        gs.status = 'lost';
        gs.events.push({ t: 'lost' });
        gs.enemies = [];
        return;
      }
    } else {
      survivors.push(e);
    }
  }
  gs.enemies = survivors;

  // 波清空
  if (gs.spawnQueue.length === 0 && gs.enemies.length === 0) {
    if (gs.waveIndex >= level.waves.length - 1) {
      gs.status = 'won';
      gs.events.push({ t: 'won' });
    } else {
      gs.food += WAVE_CLEAR_BONUS;
      // 利息：每 10 粮 +1，鼓励存粮
      const interest = Math.min(Math.floor(gs.food / INTEREST_UNIT), INTEREST_CAP);
      if (interest > 0) {
        gs.food += interest;
        gs.events.push({ t: 'income', amount: interest, source: 'interest' });
      }
      // 忠「屯田」：场上每个忠按等级产粮
      const farm = gs.soldiers.reduce(
        (sum, s) => sum + (s.kind === '忠' && s.cell ? FARM_FOOD_PER_LEVEL * s.level : 0),
        0,
      );
      if (farm > 0) {
        gs.food += farm;
        gs.events.push({ t: 'income', amount: farm, source: 'farm' });
      }
      // 征兵价随时间回落
      gs.recruitCost = Math.max(RECRUIT_BASE, gs.recruitCost - RECRUIT_DECAY);
      gs.intermission = true;
      gs.waveTimer = WAVE_AUTO_DELAY;
    }
  }
}
