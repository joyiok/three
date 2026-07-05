import { cellKind } from './levels';
import type { CellKind, Vec } from './types';

export const GRID_W = 7;
export const GRID_H = 10;

/** 简易种子随机（mulberry32） */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从顶部入口到左下营寨（0,9）的一条蛇形随机路径（保留用于单路，双路用 carveLeftPath + 镜像） */

export interface VersusMap {
  grid: string[];
  /** 玩家1路径：顶部入口 → 底部营寨(左侧) */
  pathP1: Vec[];
  /** 玩家2路径：顶部入口 → 底部营寨(右侧) */
  pathP2: Vec[];
}

/** 生成对称的双玩家地图：P1 走左半，P2 走右半（左右镜像） */
export function generateMap(seed: number): VersusMap {
  const rng = makeRng(seed);
  const grid: string[][] = Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => '.'),
  );
  // 左侧路径：从顶部 0..3 随机入口蜿蜒到 (0,9)
  const p1 = carveLeftPath(grid, rng);
  // 镜像到右侧：x -> GRID_W-1-x，作为 P2 路径
  const p2: Vec[] = p1.map((p) => ({ x: GRID_W - 1 - p.x, y: p.y }));
  for (const p of p2) grid[p.y][p.x] = '#';
  // 加岩石装饰（不阻断路径，随机散布在草地）
  const rockCount = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < rockCount; i++) {
    const x = Math.floor(rng() * GRID_W);
    const y = Math.floor(rng() * GRID_H);
    if (grid[y][x] === '.') grid[y][x] = 'r';
  }
  const gridStr = grid.map((row) => row.join(''));
  return { grid: gridStr, pathP1: p1, pathP2: p2 };
}

/** 左半路径雕刻：从顶部 (entryX,0) 蜿蜒到 (0,9) */
function carveLeftPath(grid: string[][], rng: () => number): Vec[] {
  const path: Vec[] = [];
  const entryX = 1 + Math.floor(rng() * 3); // 1..3
  let x = entryX;
  let y = 0;
  grid[y][x] = '#';
  path.push({ x, y });
  let stuck = 0;
  while (y < GRID_H - 1 && stuck < 20) {
    const r = rng();
    let nx = x;
    let ny = y;
    if (r < 0.3 && x > 0) {
      nx = x - 1; // 偏左（朝营寨方向）
    } else if (r < 0.45 && x < 3) {
      nx = x + 1;
    } else {
      ny = y + 1; // 向下
    }
    // 不允许回头走已走过的格
    if (grid[ny]?.[nx] === '#') {
      stuck++;
      continue;
    }
    x = nx;
    y = ny;
    if (y >= GRID_H || x < 0 || x > GRID_W - 1) break;
    grid[y][x] = '#';
    path.push({ x, y });
    stuck = 0;
  }
  // 确保到达底行；若卡住，直线补到 (0,9)
  while (y < GRID_H - 1) {
    y++;
    if (grid[y][x] !== '#') grid[y][x] = '#';
    path.push({ x, y });
  }
  // 把终点拉到 x=0
  while (x > 0) {
    x--;
    if (grid[y][x] !== '#') grid[y][x] = '#';
    path.push({ x, y });
  }
  return path;
}

export function kindOf(map: VersusMap, x: number, y: number): CellKind {
  const c = map.grid[y]?.[x];
  return c === '#' ? 'path' : c === '.' ? 'grass' : 'rock';
}

export { cellKind };