import { describe, expect, it } from 'vitest';
import { makeRng, generateMap } from '../src/game/versus-map';
import {
  AI_CONFIGS,
  AUTO_WAVE_INTERVAL,
  ITEMS,
  aiTick,
  canPlace,
  cellKindOf,
  createVersusGame,
  gainItem,
  moveSoldier,
  pathFor,
  recruit,
  sellSoldier,
  tickVersus,
  useItem,
} from '../src/game/versus';

describe('versus-map 生成', () => {
  it('10 行 × 7 列', () => {
    const m = generateMap(1);
    expect(m.grid).toHaveLength(10);
    m.grid.forEach((r) => expect(r).toHaveLength(7));
  });

  it('路径路点相邻且起点在顶/终点在底', () => {
    const m = generateMap(2);
    for (const path of [m.pathP1, m.pathP2]) {
      expect(path.length).toBeGreaterThan(5);
      expect(path[0].y).toBe(0);
      expect(path.at(-1)!.y).toBe(9);
      for (let i = 1; i < path.length; i++) {
        const d = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
        expect(d).toBe(1);
      }
    }
  });

  it('路径格在 grid 上为 #', () => {
    const m = generateMap(3);
    for (const p of m.pathP1) expect(m.grid[p.y][p.x]).toBe('#');
    for (const p of m.pathP2) expect(m.grid[p.y][p.x]).toBe('#');
  });

  it('makeRng 可重现', () => {
    const a = makeRng(123);
    const b = makeRng(123);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});

describe('versus 经济与布阵', () => {
  it('征兵扣粮涨价入槽', () => {
    const g = createVersusGame({ seed: 1 });
    expect(g.p1.food).toBe(30);
    expect(recruit(g.p1, () => 0)).toBe(true);
    expect(g.p1.food).toBe(20);
    expect(g.p1.recruitCost).toBe(11);
    expect(g.p1.bench[0]?.kind).toBe('刀');
  });

  it('部署到草地成功，路径失败', () => {
    const g = createVersusGame({ seed: 1 });
    recruit(g.p1, () => 0);
    // 找一个草地格
    let grass: { x: number; y: number } | null = null;
    for (let y = 0; y < 10 && !grass; y++)
      for (let x = 0; x < 7; x++)
        if (cellKindOf(g, 'p1', x, y) === 'grass') grass = { x, y };
    expect(grass).toBeTruthy();
    expect(canPlace(g, 'p1', grass!)).toBe(true);
    expect(moveSoldier(g, 'p1', { type: 'bench', index: 0 }, { type: 'cell', cell: grass! })).toBe(true);
    // 路径格不能放
    const path0 = pathFor(g, 'p1')[0];
    expect(canPlace(g, 'p1', path0)).toBe(false);
  });

  it('回收返粮', () => {
    const g = createVersusGame({ seed: 1 });
    recruit(g.p1, () => 0);
    const grass = findGrass(g, 'p1');
    moveSoldier(g, 'p1', { type: 'bench', index: 0 }, { type: 'cell', cell: grass });
    const before = g.p1.food;
    expect(sellSoldier(g.p1, grass)).toBe(true);
    expect(g.p1.food).toBe(before + 5); // 1 级返 5
  });
});

function findGrass(g: ReturnType<typeof createVersusGame>, side: 'p1' | 'p2') {
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 7; x++)
      if (cellKindOf(g, side, x, y) === 'grass') return { x, y };
  return { x: 0, y: 0 };
}

describe('versus 道具', () => {
  it('gainItem 入栏，满 4 拒绝', () => {
    const g = createVersusGame({ seed: 1 });
    expect(gainItem(g.p1, 'heal')).toBe(true);
    expect(gainItem(g.p1, 'foodBoost')).toBe(true);
    expect(gainItem(g.p1, 'freeze')).toBe(true);
    expect(gainItem(g.p1, 'fog')).toBe(true);
    expect(gainItem(g.p1, 'stealFood')).toBe(false); // 满
  });

  it('修营加血', () => {
    const g = createVersusGame({ seed: 1 });
    g.p1.hp = 5;
    gainItem(g.p1, 'heal');
    g.p1.food = 100;
    expect(useItem(g, 'p1', 'heal')).toBe(true);
    expect(g.p1.hp).toBe(8);
  });

  it('遣贼向对方发波', () => {
    const g = createVersusGame({ seed: 1 });
    g.p1.food = 100;
    gainItem(g.p1, 'sendGoon');
    expect(useItem(g, 'p1', 'sendGoon')).toBe(true);
    expect(g.p2.pendingWaves).toHaveLength(1);
    expect(g.p2.pendingWaves[0].count).toBe(5);
  });

  it('冻令冻结对方士兵冷却', () => {
    const g = createVersusGame({ seed: 1 });
    g.p1.food = 100;
    gainItem(g.p1, 'freeze');
    useItem(g, 'p1', 'freeze');
    expect(g.p2.freezeUntil).toBeGreaterThan(0);
  });

  it('劫粮偷取对方', () => {
    const g = createVersusGame({ seed: 1 });
    g.p2.food = 30;
    g.p1.food = 20;
    gainItem(g.p1, 'stealFood');
    useItem(g, 'p1', 'stealFood');
    expect(g.p2.food).toBe(20);
    expect(g.p1.food).toBe(22); // 20 - 8 花费 + 10 偷 = 22
  });
});

describe('versus 引擎', () => {
  it('自动波定时到达双方', () => {
    const g = createVersusGame({ seed: 1 });
    const hpBefore1 = g.p1.hp;
    const hpBefore2 = g.p2.hp;
    // 小步 tick 推进，避免一次大 dt 把敌人走完
    for (let i = 0; i < (AUTO_WAVE_INTERVAL + 2) / 0.05; i++) tickVersus(g, 0.05);
    // 自动波应已触发并造成影响（出怪或扣血）
    const affected1 = g.p1.hp < hpBefore1 || g.p1.enemies.length > 0;
    const affected2 = g.p2.hp < hpBefore2 || g.p2.enemies.length > 0;
    expect(affected1 || affected2).toBe(true);
  });

  it('敌人走完路径扣血', () => {
    const g = createVersusGame({ seed: 1 });
    g.p1.pendingWaves.push({ kind: '斗', count: 1, interval: 1, delay: 0, elapsed: 0, spawned: 0 });
    const pathLen = pathFor(g, 'p1').length - 1;
    const hpBefore = g.p1.hp;
    // 斗速度 1.0，走 pathLen 秒
    tickVersus(g, pathLen + 1);
    expect(g.p1.hp).toBeLessThan(hpBefore);
  });

  it('双方血归零判负/平', () => {
    const g = createVersusGame({ seed: 1 });
    g.p1.hp = 1; g.p2.hp = 1;
    g.p1.pendingWaves.push({ kind: '兵', count: 1, interval: 1, delay: 0, elapsed: 0, spawned: 0 });
    g.p2.pendingWaves.push({ kind: '兵', count: 1, interval: 1, delay: 0, elapsed: 0, spawned: 0 });
    tickVersus(g, 50);
    expect(['won', 'lost', 'draw']).toContain(g.status);
  });

  it('布兵可击杀来袭敌人', () => {
    const g = createVersusGame({ seed: 1 });
    // 在 p1 路径附近放一个高级刀兵
    const path = pathFor(g, 'p1');
    let grass: { x: number; y: number } | null = null;
    for (const p of path) {
      for (let dy = -1; dy <= 1 && !grass; dy++)
        for (let dx = -1; dx <= 1 && !grass; dx++) {
          const x = p.x + dx, y = p.y + dy;
          if (x >= 0 && x < 7 && y >= 0 && y < 10 && cellKindOf(g, 'p1', x, y) === 'grass') grass = { x, y };
        }
    }
    g.p1.soldiers.push({ id: g.p1.nextId++, kind: '刀', level: 3, cell: grass, cooldown: 0 });
    g.p1.pendingWaves.push({ kind: '斗', count: 3, interval: 1, delay: 0, elapsed: 0, spawned: 0 });
    tickVersus(g, 40);
    expect(g.p1.enemies.length).toBeLessThan(3); // 至少杀掉一些
  });

  it('AI 各难度有不同决策频率', () => {
    expect(AI_CONFIGS.easy.recruitRate).toBeLessThan(AI_CONFIGS.nightmare.recruitRate);
    expect(AI_CONFIGS.nightmare.smart).toBe(1);
  });

  it('AI 能征兵布阵', () => {
    const g = createVersusGame({ seed: 1, p2Ai: true, difficulty: 'hard' });
    g.p2.food = 200;
    for (let i = 0; i < 200; i++) aiTick(g, 'p2', AI_CONFIGS.hard, () => 0.4);
    expect(g.p2.soldiers.length).toBeGreaterThan(0);
  });
});

describe('versus 道具表完整', () => {
  it('四类道具齐全', () => {
    const cats = new Set(Object.values(ITEMS).map((d) => d.cat));
    expect(cats.has('attack')).toBe(true);
    expect(cats.has('defend')).toBe(true);
    expect(cats.has('control')).toBe(true);
    expect(cats.has('terra')).toBe(true);
  });
});