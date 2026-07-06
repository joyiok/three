import {
  BASE_HP,
  BENCH_SIZE,
  DAZE_SLOW,
  DAZE_TIME,
  ENEMIES,
  RECRUIT_BASE,
  RECRUIT_MAX,
  RECRUIT_STEP,
  SELL_REFUND_PER_LEVEL,
  SOLDIERS,
  START_FOOD,
  arrowCount,
  bladeStrikes,
  enemyArmor,
  rollSoldier,
  slowOf,
  soldierDamage,
  soldierRange,
  soldierRate,
  soldierSplash,
} from './config';
import { kindOf, generateMap, type VersusMap } from './versus-map';
import type { CellKind, EnemyKind, SoldierKind, Vec } from './types';

export type Side = 'p1' | 'p2';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'nightmare';
export type GameStatus = 'matching' | 'playing' | 'won' | 'lost' | 'draw';

/** 道具种类 */
export type ItemKind =
  | 'sendGoon' // 攻：向对方发 1 波小怪(贼×5)
  | 'sendSoldier' // 攻：向对方发 1 波甲兵(兵×3)
  | 'sendBoss' // 攻：向对方发 1 个将
  | 'heal' // 守：营寨 +3 血
  | 'foodBoost' // 守：+15 粮
  | 'instantMerge' // 守：随机一对同字同级兵瞬合
  | 'freeze' // 控：冻结对方所有士兵冷却 3 秒
  | 'stealFood' // 控：偷对方 10 粮
  | 'fog' // 控：对方 4 秒看不到我方地图（迷雾）
  | 'terraGrass' // 图：把我方一格变草地（可放兵）
  | 'terraClear'; // 图：移除我方一格岩石(变草地)

export interface ItemDef {
  kind: ItemKind;
  name: string;
  cat: 'attack' | 'defend' | 'control' | 'terra';
  cost: number; // 粮食花费
  desc: string;
}

export const ITEMS: Record<ItemKind, ItemDef> = {
  sendGoon: { kind: 'sendGoon', name: '遣贼', cat: 'attack', cost: 12, desc: '向对方派出 5 个贼' },
  sendSoldier: { kind: 'sendSoldier', name: '遣兵', cat: 'attack', cost: 18, desc: '向对方派出 3 个甲兵' },
  sendBoss: { kind: 'sendBoss', name: '遣将', cat: 'attack', cost: 30, desc: '向对方派出 1 个精英将' },
  heal: { kind: 'heal', name: '修营', cat: 'defend', cost: 14, desc: '营寨恢复 3 点血量' },
  foodBoost: { kind: 'foodBoost', name: '征粮', cat: 'defend', cost: 0, desc: '获得 15 粮食（每场限 2 次）' },
  instantMerge: { kind: 'instantMerge', name: '神合', cat: 'defend', cost: 16, desc: '随机一对同字同级兵瞬间合成升级' },
  freeze: { kind: 'freeze', name: '冻令', cat: 'control', cost: 20, desc: '冻结对方所有士兵冷却 3 秒' },
  stealFood: { kind: 'stealFood', name: '劫粮', cat: 'control', cost: 8, desc: '偷取对方 10 粮食' },
  fog: { kind: 'fog', name: '迷雾', cat: 'control', cost: 22, desc: '对方 4 秒无法观察我方布阵' },
  terraGrass: { kind: 'terraGrass', name: '拓草', cat: 'terra', cost: 10, desc: '把我方一格路面/岩石变为草地' },
  terraClear: { kind: 'terraClear', name: '清障', cat: 'terra', cost: 6, desc: '移除我方一格岩石（变草地）' },
};

export interface Soldier {
  id: number;
  kind: SoldierKind;
  level: number;
  cell: Vec | null;
  cooldown: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  word: string;
  hp: number;
  maxHp: number;
  speed: number;
  slow: number;
  /** 沿自己一方路径的进度 */
  progress: number;
  bounty: number;
  damage: number;
  armor?: number;
  regen?: number;
  dazeUntil?: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  targetId: number;
  speed: number;
  damage: number;
}

export interface PendingWave {
  kind: EnemyKind;
  count: number;
  interval: number;
  delay: number;
  elapsed: number;
  spawned: number;
}

/** 单方玩家状态 */
export interface PlayerState {
  side: Side;
  hp: number;
  maxHp: number;
  food: number;
  recruitCost: number;
  bench: (Soldier | null)[];
  soldiers: Soldier[];
  enemies: Enemy[]; // 朝该玩家来的敌人（来自对方道具/自动）
  projectiles: Projectile[];
  pendingWaves: PendingWave[]; // 即将到达的自动波
  items: ItemKind[]; // 持有道具（最多4）
  fogUntil: number; // 被迷雾遮蔽的截止时间(秒)；0=无
  freezeUntil: number; // 士兵冷却被冻结的截止时间
  name: string;
  isAi: boolean;
  nextId: number;
}

export interface VersusEvent {
  t:
    | 'recruit' | 'deploy' | 'merge' | 'sell' | 'shoot' | 'hit' | 'kill'
    | 'leak' | 'itemUsed' | 'waveSent' | 'freeze' | 'fog' | 'won' | 'lost' | 'draw';
  side: Side;
  item?: ItemKind;
  x?: number;
  y?: number;
  damage?: number;
  bounty?: number;
  kind?: SoldierKind;
  level?: number;
  enemyId?: number;
  soldierId?: number;
}

export interface VersusGame {
  map: VersusMap;
  p1: PlayerState;
  p2: PlayerState;
  time: number;
  status: GameStatus;
  /** 自动出怪计时器：每隔 autoWaveInterval 秒给双方各发一波自动小怪 */
  autoWaveTimer: number;
  autoWaveIndex: number;
  events: VersusEvent[];
  nextGlobalId: number;
}

export const AUTO_WAVE_INTERVAL = 12; // 每 12 秒自动给双方发一波
export const AUTO_WAVE_GROWTH = 1.1;

export function createVersusGame(
  opts: { seed?: number; p1Name?: string; p2Name?: string; p2Ai?: boolean; difficulty?: Difficulty } = {},
): VersusGame {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const map = generateMap(seed);
  const make = (side: Side, name: string, isAi: boolean): PlayerState => ({
    side,
    hp: BASE_HP,
    maxHp: BASE_HP,
    food: START_FOOD,
    recruitCost: RECRUIT_BASE,
    bench: Array.from({ length: BENCH_SIZE }, () => null),
    soldiers: [],
    enemies: [],
    projectiles: [],
    pendingWaves: [],
    items: [],
    fogUntil: 0,
    freezeUntil: 0,
    name,
    isAi,
    nextId: 1,
  });
  return {
    map,
    p1: make('p1', opts.p1Name ?? '你', false),
    p2: make('p2', opts.p2Name ?? '敌将', opts.p2Ai ?? true),
    time: 0,
    status: 'playing',
    autoWaveTimer: AUTO_WAVE_INTERVAL,
    autoWaveIndex: 0,
    events: [],
    nextGlobalId: 1,
  };
}

// ===== 路径与位置 =====
export function pathFor(game: VersusGame, side: Side): Vec[] {
  return side === 'p1' ? game.map.pathP1 : game.map.pathP2;
}

export function pathLength(path: Vec[]): number {
  return path.length - 1;
}

export function enemyPos(path: Vec[], e: Enemy): Vec {
  const p = Math.max(0, Math.min(e.progress, path.length - 1));
  const i = Math.min(Math.floor(p), path.length - 2);
  const frac = p - i;
  const a = path[i];
  const b = path[i + 1];
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
}

export function cellKindOf(game: VersusGame, _side: Side, x: number, y: number): CellKind {
  return kindOf(game.map, x, y);
}

// ===== 玩家操作 =====
export function recruit(p: PlayerState, rand: () => number = Math.random): boolean {
  if (p.food < p.recruitCost) return false;
  const slot = p.bench.findIndex((s) => s === null);
  if (slot < 0) return false;
  p.food -= p.recruitCost;
  p.recruitCost = Math.min(p.recruitCost + RECRUIT_STEP, RECRUIT_MAX);
  p.bench[slot] = { id: p.nextId++, kind: rollSoldier(rand), level: 1, cell: null, cooldown: 0 };
  return true;
}

export function soldierAt(p: PlayerState, cell: Vec): Soldier | undefined {
  return p.soldiers.find((s) => s.cell && s.cell.x === cell.x && s.cell.y === cell.y);
}

export function canPlace(game: VersusGame, side: Side, cell: Vec): boolean {
  const p = game[side];
  return cellKindOf(game, side, cell.x, cell.y) === 'grass' && !soldierAt(p, cell);
}

function getAt(p: PlayerState, loc: { type: 'bench'; index: number } | { type: 'cell'; cell: Vec }): Soldier | null {
  if (loc.type === 'bench') return p.bench[loc.index] ?? null;
  return soldierAt(p, loc.cell) ?? null;
}

function setAt(p: PlayerState, loc: { type: 'bench'; index: number } | { type: 'cell'; cell: Vec }, s: Soldier): void {
  if (loc.type === 'bench') {
    s.cell = null;
    p.bench[loc.index] = s;
    p.soldiers = p.soldiers.filter((v) => v.id !== s.id);
  } else {
    s.cell = { ...loc.cell };
    if (!p.soldiers.includes(s)) p.soldiers.push(s);
  }
}

function clearAt(p: PlayerState, loc: { type: 'bench'; index: number } | { type: 'cell'; cell: Vec }): void {
  if (loc.type === 'bench') p.bench[loc.index] = null;
  else {
    const s = soldierAt(p, loc.cell);
    if (s) p.soldiers = p.soldiers.filter((v) => v.id !== s.id);
  }
}

export function moveSoldier(
  game: VersusGame,
  side: Side,
  from: { type: 'bench'; index: number } | { type: 'cell'; cell: Vec },
  to: { type: 'bench'; index: number } | { type: 'cell'; cell: Vec },
): boolean {
  const p = game[side];
  if (from.type === 'bench' && to.type === 'bench' && from.index === to.index) return false;
  const src = getAt(p, from);
  if (!src) return false;
  if (to.type === 'cell' && cellKindOf(game, side, to.cell.x, to.cell.y) !== 'grass') return false;
  const dst = getAt(p, to);
  if (!dst) {
    clearAt(p, from);
    setAt(p, to, src);
    return true;
  }
  if (dst.kind === src.kind && dst.level === src.level) {
    // 合成
    clearAt(p, from);
    dst.level += 1;
    dst.cooldown = 0;
    return true;
  }
  // 互换
  clearAt(p, from);
  clearAt(p, to);
  setAt(p, to, src);
  setAt(p, from, dst);
  return true;
}

export function sellSoldier(p: PlayerState, cell: Vec): boolean {
  const s = soldierAt(p, cell);
  if (!s) return false;
  p.soldiers = p.soldiers.filter((v) => v.id !== s.id);
  p.food += SELL_REFUND_PER_LEVEL * s.level;
  return true;
}

// ===== 道具 =====
/** 把道具加入玩家持有栏（最多4，满了丢弃） */
export function gainItem(p: PlayerState, kind: ItemKind): boolean {
  if (p.items.length >= 4) return false;
  p.items.push(kind);
  return true;
}

/** 战斗中随机掉落道具 */
export function maybeDropItem(p: PlayerState, rand: () => number = Math.random): void {
  if (rand() < 0.08 && p.items.length < 4) {
    const pool: ItemKind[] = ['sendGoon', 'sendSoldier', 'heal', 'foodBoost', 'freeze', 'stealFood', 'fog', 'terraGrass', 'terraClear', 'instantMerge'];
    gainItem(p, pool[Math.floor(rand() * pool.length)]);
  }
}

/** 使用道具。targetSide 为对方（攻/控类）或己方（守/图类） */
export function useItem(game: VersusGame, user: Side, item: ItemKind, targetCell?: Vec): boolean {
  const p = game[user];
  const foe: Side = user === 'p1' ? 'p2' : 'p1';
  const foeP = game[foe];
  const def = ITEMS[item];
  if (!p.items.includes(item)) return false;
  if (p.food < def.cost) return false;
  p.food -= def.cost;
  // 精确移除一个该道具
  const idx = p.items.indexOf(item);
  if (idx >= 0) p.items.splice(idx, 1);

  switch (item) {
    case 'sendGoon':
      foeP.pendingWaves.push({ kind: '贼', count: 5, interval: 0.8, delay: 0, elapsed: 0, spawned: 0 });
      break;
    case 'sendSoldier':
      foeP.pendingWaves.push({ kind: '兵', count: 3, interval: 1.0, delay: 0, elapsed: 0, spawned: 0 });
      break;
    case 'sendBoss':
      foeP.pendingWaves.push({ kind: '将', count: 1, interval: 1, delay: 0, elapsed: 0, spawned: 0 });
      break;
    case 'heal':
      p.hp = Math.min(p.maxHp, p.hp + 3);
      break;
    case 'foodBoost':
      p.food += 15;
      break;
    case 'instantMerge':
      tryInstantMerge(p);
      break;
    case 'freeze':
      foeP.freezeUntil = game.time + 3;
      break;
    case 'stealFood': {
      const stolen = Math.min(10, foeP.food);
      foeP.food -= stolen;
      p.food += stolen;
      break;
    }
    case 'fog':
      foeP.fogUntil = game.time + 4;
      break;
    case 'terraGrass':
      if (targetCell && kindOf(game.map, targetCell.x, targetCell.y) !== 'grass') {
        game.map.grid[targetCell.y] = game.map.grid[targetCell.y].slice(0, targetCell.x) + '.' + game.map.grid[targetCell.y].slice(targetCell.x + 1);
      }
      break;
    case 'terraClear':
      if (targetCell && kindOf(game.map, targetCell.x, targetCell.y) === 'rock') {
        game.map.grid[targetCell.y] = game.map.grid[targetCell.y].slice(0, targetCell.x) + '.' + game.map.grid[targetCell.y].slice(targetCell.x + 1);
      }
      break;
  }
  game.events.push({ t: 'itemUsed', side: user, item });
  return true;
}

function tryInstantMerge(p: PlayerState): void {
  const cells = p.soldiers.filter((s) => s.cell);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i];
      const b = cells[j];
      if (a.kind === b.kind && a.level === b.level && a.cell && b.cell) {
        // 合 a 入 b
        b.level += 1;
        p.soldiers = p.soldiers.filter((s) => s.id !== a.id);
        return;
      }
    }
  }
}

// ===== 出怪 =====
function spawnEnemy(p: PlayerState, kind: EnemyKind, _path: Vec[]): void {
  const spec = ENEMIES[kind];
  const hp = kind === 'boss' ? 1500 : spec.hp; // 对战模式不随波次缩放
  p.enemies.push({
    id: p.nextId++,
    kind,
    word: kind === 'boss' ? '王' : kind,
    hp,
    maxHp: hp,
    speed: spec.speed,
    slow: 0,
    progress: 0,
    bounty: spec.bounty,
    damage: spec.damage,
    armor: enemyArmor(kind, 1),
    regen: spec.regen ?? 0,
    dazeUntil: 0,
  });
}

function processPendingWaves(p: PlayerState, path: Vec[], dt: number): void {
  const remain: PendingWave[] = [];
  for (const w of p.pendingWaves) {
    w.elapsed += dt;
    while (w.spawned < w.count && w.elapsed >= w.delay + w.spawned * w.interval) {
      spawnEnemy(p, w.kind, path);
      w.spawned++;
    }
    if (w.spawned < w.count) remain.push(w);
  }
  p.pendingWaves = remain;
}

// ===== 战斗 tick =====
const ARROW_SPEED = 8;
const ARROW_HIT = 0.3;
const PIERCE_W = 0.5;

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function damageEnemy(game: VersusGame, side: Side, path: Vec[], e: Enemy, dmg: number, ignoreArmor = false): void {
  if (e.hp <= 0) return;
  const dealt = Math.max(1, dmg - (ignoreArmor ? 0 : (e.armor ?? 0)));
  e.hp -= dealt;
  const pos = enemyPos(path, e);
  game.events.push({ t: 'hit', side, x: pos.x, y: pos.y, damage: dealt, enemyId: e.id });
  if (e.hp <= 0) {
    const p = game[side];
    p.enemies = p.enemies.filter((v) => v.id !== e.id);
    p.food += e.bounty;
    game.events.push({ t: 'kill', side, x: pos.x, y: pos.y, bounty: e.bounty, enemyId: e.id });
    maybeDropItem(p);
  }
}

function findTarget(p: PlayerState, path: Vec[], s: Soldier, at: Vec, range: number): Enemy | null {
  const isRanged = s.kind === '弓';
  let best: Enemy | null = null;
  let bestKey = -Infinity;
  for (const e of p.enemies) {
    const d = dist(at, enemyPos(path, e));
    if (d > range) continue;
    const key = isRanged ? e.progress : -d;
    if (key > bestKey) {
      bestKey = key;
      best = e;
    }
  }
  return best;
}

function attack(game: VersusGame, side: Side, path: Vec[], s: Soldier, target: Enemy): void {
  const p = game[side];
  const spec = SOLDIERS[s.kind];
  const at = s.cell!;
  const dmg = soldierDamage(s.kind, s.level);
  const range = soldierRange(s.kind, s.level);
  game.events.push({ t: 'shoot', side, kind: s.kind, x: at.x, y: at.y, soldierId: s.id });
  if (s.kind === '弓') {
    // 连珠：射程内 progress 前 n 名各一矢
    const targets = p.enemies
      .filter((e) => dist(at, enemyPos(path, e)) <= range)
      .sort((a, b) => b.progress - a.progress)
      .slice(0, arrowCount(s.level));
    for (const t of targets) {
      p.projectiles.push({ id: p.nextId++, x: at.x, y: at.y, targetId: t.id, speed: ARROW_SPEED, damage: dmg });
    }
    return;
  }
  if (spec.pierce) {
    // 破甲穿刺
    const tp = enemyPos(path, target);
    const len = dist(at, tp) || 1;
    const dir = { x: (tp.x - at.x) / len, y: (tp.y - at.y) / len };
    for (const e of [...p.enemies]) {
      const ep = enemyPos(path, e);
      const rel = { x: ep.x - at.x, y: ep.y - at.y };
      const proj = rel.x * dir.x + rel.y * dir.y;
      if (proj < 0 || proj > range) continue;
      const perp = Math.abs(rel.x * dir.y - rel.y * dir.x);
      if (perp <= PIERCE_W) damageEnemy(game, side, path, e, dmg, true);
    }
    return;
  }
  if (spec.splash) {
    // 溅射成长 + 3 级践踏
    const tp = enemyPos(path, target);
    const radius = soldierSplash(s.level);
    const daze = s.level >= 3;
    for (const e of [...p.enemies]) {
      if (dist(tp, enemyPos(path, e)) > radius) continue;
      if (daze) e.dazeUntil = game.time + DAZE_TIME;
      damageEnemy(game, side, path, e, dmg);
    }
    return;
  }
  // 刀连斩
  damageEnemy(game, side, path, target, dmg);
  for (let i = 1; i < bladeStrikes(s.level); i++) {
    damageEnemy(game, side, path, target, Math.max(1, Math.round(dmg * 0.5)));
  }
}

function tickPlayerCombat(game: VersusGame, side: Side, dt: number): void {
  const p = game[side];
  const path = pathFor(game, side);
  const frozen = p.freezeUntil > game.time;
  // 减速光环（与骑践踏取较大者）
  for (const e of p.enemies) {
    const pos = enemyPos(path, e);
    let slow = game.time < (e.dazeUntil ?? 0) ? DAZE_SLOW : 0;
    for (const s of p.soldiers) {
      if (s.kind !== '忠' || !s.cell) continue;
      if (dist(s.cell, pos) <= soldierRange('忠', s.level)) slow = Math.max(slow, slowOf(s.level));
    }
    e.slow = slow;
  }
  // 士兵攻击
  for (const s of p.soldiers) {
    const spec = SOLDIERS[s.kind];
    if (spec.rate <= 0 || !s.cell) continue;
    if (!frozen) s.cooldown -= dt;
    if (s.cooldown > 0) continue;
    const target = findTarget(p, path, s, s.cell, soldierRange(s.kind, s.level));
    if (!target) {
      s.cooldown = 0;
      continue;
    }
    s.cooldown = 1 / soldierRate(s.kind, s.level);
    attack(game, side, path, s, target);
  }
  // 弹道
  const alive: Projectile[] = [];
  for (const proj of p.projectiles) {
    const target = p.enemies.find((e) => e.id === proj.targetId);
    if (!target) continue;
    const tp = enemyPos(path, target);
    const d = dist(proj, tp);
    const step = proj.speed * dt;
    if (d <= ARROW_HIT || step >= d) {
      damageEnemy(game, side, path, target, proj.damage);
    } else {
      proj.x += ((tp.x - proj.x) / d) * step;
      proj.y += ((tp.y - proj.y) / d) * step;
      alive.push(proj);
    }
  }
  p.projectiles = alive;
}

function tickPlayerMovement(game: VersusGame, side: Side, dt: number): void {
  const p = game[side];
  const path = pathFor(game, side);
  processPendingWaves(p, path, dt);
  const survivors: Enemy[] = [];
  for (const e of p.enemies) {
    if ((e.regen ?? 0) > 0 && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + e.regen! * e.maxHp * dt);
    }
    e.progress += e.speed * (1 - e.slow) * dt;
    if (e.progress >= pathLength(path)) {
      p.hp = Math.max(0, p.hp - e.damage);
      game.events.push({ t: 'leak', side, damage: e.damage });
    } else {
      survivors.push(e);
    }
  }
  p.enemies = survivors;
}

/** 每 AUTO_WAVE_INTERVAL 秒给双方各发一波自动小怪，难度渐增 */
function maybeAutoWave(game: VersusGame, dt: number): void {
  game.autoWaveTimer -= dt;
  if (game.autoWaveTimer > 0) return;
  game.autoWaveTimer = AUTO_WAVE_INTERVAL;
  game.autoWaveIndex++;
  const idx = game.autoWaveIndex;
  const waveKind: EnemyKind = idx % 4 === 0 ? '兵' : '斗';
  const count = 4 + Math.floor(idx / 2);
  for (const side of ['p1', 'p2'] as Side[]) {
    game[side].pendingWaves.push({
      kind: waveKind,
      count,
      interval: 0.9,
      delay: 0,
      elapsed: 0,
      spawned: 0,
    });
  }
}

export function tickVersus(game: VersusGame, dt: number): void {
  if (game.status !== 'playing') return;
  game.time += dt;
  maybeAutoWave(game, dt);
  for (const side of ['p1', 'p2'] as Side[]) {
    tickPlayerMovement(game, side, dt);
    tickPlayerCombat(game, side, dt);
  }
  // 胜负判定
  if (game.p1.hp <= 0 && game.p2.hp <= 0) {
    game.status = 'draw';
    game.events.push({ t: 'draw', side: 'p1' });
  } else if (game.p1.hp <= 0) {
    game.status = 'lost';
    game.events.push({ t: 'lost', side: 'p1' });
  } else if (game.p2.hp <= 0) {
    game.status = 'won';
    game.events.push({ t: 'won', side: 'p1' });
  }
}

// ===== AI =====
export interface AiConfig {
  difficulty: Difficulty;
  recruitRate: number; // 每秒尝试征兵概率
  deployRate: number;
  itemRate: number;
  sendRate: number;
  smart: number; // 0..1 决策质量
}

export const AI_CONFIGS: Record<Difficulty, AiConfig> = {
  easy: { difficulty: 'easy', recruitRate: 0.15, deployRate: 0.2, itemRate: 0.05, sendRate: 0.05, smart: 0.3 },
  normal: { difficulty: 'normal', recruitRate: 0.3, deployRate: 0.35, itemRate: 0.1, sendRate: 0.1, smart: 0.6 },
  hard: { difficulty: 'hard', recruitRate: 0.5, deployRate: 0.5, itemRate: 0.18, sendRate: 0.18, smart: 0.85 },
  nightmare: { difficulty: 'nightmare', recruitRate: 0.8, deployRate: 0.7, itemRate: 0.3, sendRate: 0.3, smart: 1 },
};

/** AI 每帧决策。state 给随机源便于测试 */
export function aiTick(game: VersusGame, side: Side, cfg: AiConfig, rand: () => number = Math.random): void {
  const p = game[side];
  // 征兵
  if (rand() < cfg.recruitRate && p.food >= p.recruitCost && p.bench.some((s) => s === null)) {
    recruit(p, rand);
  }
  // 部署：把背包兵放到路径附近的草地
  if (rand() < cfg.deployRate && p.bench.some((s) => s !== null)) {
    const path = pathFor(game, side);
    const candidates: Vec[] = [];
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 7; x++) {
        if (cellKindOf(game, side, x, y) !== 'grass') continue;
        const near = path.some((pt) => Math.abs(pt.x - x) + Math.abs(pt.y - y) <= 2);
        if (near && !soldierAt(p, { x, y })) candidates.push({ x, y });
      }
    }
    if (candidates.length > 0) {
      const cell = candidates[Math.floor(rand() * candidates.length)];
      const slot = p.bench.findIndex((s) => s !== null);
      if (slot >= 0) moveSoldier(game, side, { type: 'bench', index: slot }, { type: 'cell', cell });
    }
  }
  // 用道具
  if (rand() < cfg.itemRate && p.items.length > 0) {
    const item = p.items[Math.floor(rand() * p.items.length)];
    const def = ITEMS[item];
    if (p.food >= def.cost) {
      if (def.cat === 'terra') {
        // 找己方可改格
        const path = pathFor(game, side);
        const cell = path.length > 0 ? path[0] : { x: 0, y: 0 };
        useItem(game, side, item, cell);
      } else {
        useItem(game, side, item);
      }
    }
  }
}