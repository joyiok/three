import { tickCombat } from './combat';
import { createGame } from './state';
import { tickWave } from './waves';
import type { GameEvent, GameState, LevelDef } from './types';

/** 单次逻辑步进上限（秒），大 dt 拆分多步保证命中判定稳定 */
const MAX_STEP = 0.05;

export class Engine {
  gs: GameState;
  level: LevelDef;
  speed: 1 | 2 = 1;
  paused = false;

  constructor(level: LevelDef) {
    this.level = level;
    this.gs = createGame(level);
  }

  tick(dt: number): GameEvent[] {
    if (this.paused || this.gs.status !== 'playing') return [];
    let remain = dt * this.speed;
    while (remain > 0 && this.gs.status === 'playing') {
      const step = Math.min(remain, MAX_STEP);
      this.gs.time += step;
      tickWave(this.gs, this.level, step);
      tickCombat(this.gs, this.level, step);
      remain -= step;
    }
    const events = this.gs.events;
    this.gs.events = [];
    return events;
  }
}
