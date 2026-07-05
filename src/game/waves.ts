import { ENEMIES, WAVE_AUTO_DELAY, WAVE_CLEAR_BONUS, enemyHp } from './config';
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
    e.progress += e.speed * (1 - e.slow) * dt;
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
      gs.intermission = true;
      gs.waveTimer = WAVE_AUTO_DELAY;
    }
  }
}
