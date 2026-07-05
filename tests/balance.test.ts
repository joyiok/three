import { describe, expect, it } from 'vitest';
import { SOLDIERS, soldierDamage } from '../src/game/config';
import { Engine } from '../src/game/engine';
import { LEVELS } from '../src/game/levels';
import { createGame } from '../src/game/state';
import { startWave, tickWave } from '../src/game/waves';
import { tickCombat } from '../src/game/combat';
import type { GameState, LevelDef, SoldierKind, Vec } from '../src/game/types';

/** 把单位沿路径全程铺开（覆盖路径所有段） */
function coverPath(level: LevelDef, gs: GameState, lineup: { kind: SoldierKind; level: number }[]): void {
  const cells: Vec[] = [];
  const used = new Set<string>();
  for (const path of level.paths) {
    for (const p of path) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = p.x + dx;
          const y = p.y + dy;
          if (x < 0 || x > 6 || y < 0 || y > 9) continue;
          if (level.grid[y][x] !== '.') continue;
          const key = `${x},${y}`;
          if (used.has(key)) continue;
          used.add(key);
          cells.push({ x, y });
        }
      }
    }
  }
  for (let i = 0; i < lineup.length && i < cells.length; i++) {
    gs.soldiers.push({
      id: gs.nextId++,
      kind: lineup[i].kind,
      level: lineup[i].level,
      cell: { ...cells[i] },
      cooldown: 0,
    });
  }
}

function runSim(level: LevelDef, gs: GameState, maxSec = 600): GameState['status'] {
  let t = 0;
  const dt = 0.05;
  while (t < maxSec && gs.status === 'playing') {
    if (gs.intermission) startWave(gs, level);
    gs.time += dt;
    tickWave(gs, level, dt);
    tickCombat(gs, level, dt);
    t += dt;
  }
  return gs.status;
}

describe('balance 自洽性', () => {
  it('空场必败（黄巾）', () => {
    const level = LEVELS[0];
    const gs = createGame(level);
    const status = runSim(level, gs, 120);
    expect(status).toBe('lost');
  });

  it('强力阵容能通黄巾', () => {
    const level = LEVELS[0];
    const gs = createGame(level);
    const lineup: { kind: SoldierKind; level: number }[] = [
      { kind: '弓', level: 3 },
      { kind: '弓', level: 3 },
      { kind: '刀', level: 3 },
      { kind: '弓', level: 3 },
      { kind: '刀', level: 3 },
      { kind: '弓', level: 3 },
      { kind: '刀', level: 3 },
      { kind: '弓', level: 3 },
      { kind: '刀', level: 2 },
      { kind: '弓', level: 2 },
      { kind: '刀', level: 2 },
      { kind: '弓', level: 2 },
    ];
    coverPath(level, gs, lineup);
    const status = runSim(level, gs, 600);
    expect(status).toBe('won');
  }, 30000);

  it('数值延展：5 级刀兵伤害远超 1 级', () => {
    const d1 = soldierDamage('刀', 1);
    const d5 = soldierDamage('刀', 5);
    expect(d5).toBeGreaterThan(d1 * 8);
    expect(SOLDIERS['刀'].range).toBe(1.3);
  });

  it('引擎可跑完黄巾（强力阵容，通过 Engine 类）', () => {
    const level = LEVELS[0];
    const engine = new Engine(level);
    const gs = engine.gs;
    const lineup: { kind: SoldierKind; level: number }[] = [
      { kind: '弓', level: 3 },
      { kind: '弓', level: 3 },
      { kind: '刀', level: 3 },
      { kind: '弓', level: 3 },
      { kind: '刀', level: 3 },
      { kind: '弓', level: 3 },
      { kind: '刀', level: 3 },
      { kind: '弓', level: 3 },
      { kind: '刀', level: 2 },
      { kind: '弓', level: 2 },
      { kind: '刀', level: 2 },
      { kind: '弓', level: 2 },
    ];
    coverPath(level, gs, lineup);
    let t = 0;
    while (t < 600 && gs.status === 'playing') {
      if (gs.intermission) startWave(gs, level);
      engine.tick(0.05);
      t += 0.05;
    }
    expect(gs.status).toBe('won');
  }, 30000);
});