import {
  BASE_HP,
  BENCH_SIZE,
  RECRUIT_BASE,
  RECRUIT_MAX,
  RECRUIT_STEP,
  SELL_REFUND_PER_LEVEL,
  START_FOOD,
  WAVE_AUTO_DELAY,
  rollSoldier,
} from './config';
import { cellKind } from './levels';
import type { GameState, LevelDef, Loc, Soldier, Vec } from './types';

export function createGame(level: LevelDef): GameState {
  return {
    levelId: level.id,
    food: START_FOOD,
    recruitCost: RECRUIT_BASE,
    baseHp: BASE_HP,
    bench: Array.from({ length: BENCH_SIZE }, () => null),
    soldiers: [],
    enemies: [],
    projectiles: [],
    waveIndex: -1,
    waveTimer: WAVE_AUTO_DELAY,
    waveClock: 0,
    spawnQueue: [],
    status: 'playing',
    events: [],
    nextId: 1,
    time: 0,
  };
}

export function recruit(gs: GameState, rand: () => number = Math.random): boolean {
  if (gs.food < gs.recruitCost) return false;
  const slot = gs.bench.findIndex((s) => s === null);
  if (slot < 0) return false;
  gs.food -= gs.recruitCost;
  gs.recruitCost = Math.min(gs.recruitCost + RECRUIT_STEP, RECRUIT_MAX);
  gs.bench[slot] = { id: gs.nextId++, kind: rollSoldier(rand), level: 1, cell: null, cooldown: 0 };
  gs.events.push({ t: 'recruit' });
  return true;
}

export function soldierAt(gs: GameState, cell: Vec): Soldier | undefined {
  return gs.soldiers.find((s) => s.cell && s.cell.x === cell.x && s.cell.y === cell.y);
}

export function canPlace(level: LevelDef, gs: GameState, cell: Vec): boolean {
  return cellKind(level, cell.x, cell.y) === 'grass' && !soldierAt(gs, cell);
}

function getAt(gs: GameState, loc: Loc): Soldier | null {
  if (loc.type === 'bench') return gs.bench[loc.index] ?? null;
  return soldierAt(gs, loc.cell) ?? null;
}

/** 把士兵放到目标位置（不检查占用，调用方保证） */
function setAt(gs: GameState, loc: Loc, s: Soldier): void {
  if (loc.type === 'bench') {
    s.cell = null;
    gs.bench[loc.index] = s;
    gs.soldiers = gs.soldiers.filter((v) => v.id !== s.id);
  } else {
    s.cell = { ...loc.cell };
    if (!gs.soldiers.includes(s)) gs.soldiers.push(s);
  }
}

function clearAt(gs: GameState, loc: Loc): void {
  if (loc.type === 'bench') gs.bench[loc.index] = null;
  else {
    const s = soldierAt(gs, loc.cell);
    if (s) gs.soldiers = gs.soldiers.filter((v) => v.id !== s.id);
  }
}

function sameLoc(a: Loc, b: Loc): boolean {
  if (a.type === 'bench' && b.type === 'bench') return a.index === b.index;
  if (a.type === 'cell' && b.type === 'cell') return a.cell.x === b.cell.x && a.cell.y === b.cell.y;
  return false;
}

export function moveSoldier(level: LevelDef, gs: GameState, from: Loc, to: Loc): boolean {
  if (sameLoc(from, to)) return false;
  const src = getAt(gs, from);
  if (!src) return false;
  if (to.type === 'cell' && cellKind(level, to.cell.x, to.cell.y) !== 'grass') return false;
  const dst = getAt(gs, to);

  if (!dst) {
    clearAt(gs, from);
    setAt(gs, to, src);
    if (to.type === 'cell') gs.events.push({ t: 'deploy' });
    return true;
  }
  if (dst.kind === src.kind && dst.level === src.level) {
    clearAt(gs, from);
    dst.level += 1;
    dst.cooldown = 0;
    if (to.type === 'cell') gs.events.push({ t: 'merge', cell: { ...to.cell }, level: dst.level });
    else gs.events.push({ t: 'merge', cell: { x: -1, y: -1 }, level: dst.level });
    return true;
  }
  // 互换
  clearAt(gs, from);
  clearAt(gs, to);
  setAt(gs, to, src);
  setAt(gs, from, dst);
  return true;
}

export function sellSoldier(gs: GameState, cell: Vec): boolean {
  const s = soldierAt(gs, cell);
  if (!s) return false;
  gs.soldiers = gs.soldiers.filter((v) => v.id !== s.id);
  gs.food += SELL_REFUND_PER_LEVEL * s.level;
  gs.events.push({ t: 'sell' });
  return true;
}
