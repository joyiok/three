import { describe, expect, it } from 'vitest';
import { Engine } from '../src/game/engine';
import { LEVELS, cellKind } from '../src/game/levels';
import { GRID_H, GRID_W } from '../src/game/config';

const level = LEVELS[0];

function deployEverywhere(engine: Engine, kind: '刀' | '弓', lv: number) {
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (cellKind(level, x, y) === 'grass') {
        engine.gs.soldiers.push({ id: engine.gs.nextId++, kind, level: lv, cell: { x, y }, cooldown: 0 });
      }
    }
  }
}

function runUntilEnd(engine: Engine, maxSeconds: number): number {
  let t = 0;
  while (engine.gs.status === 'playing' && t < maxSeconds) {
    engine.tick(0.05);
    t += 0.05;
  }
  return t;
}

describe('engine', () => {
  it('满场高级弓可通关黄巾', () => {
    const engine = new Engine(level);
    deployEverywhere(engine, '弓', 8);
    runUntilEnd(engine, 600);
    expect(engine.gs.status).toBe('won');
  });

  it('空场必败', () => {
    const engine = new Engine(level);
    runUntilEnd(engine, 600);
    expect(engine.gs.status).toBe('lost');
  });

  it('暂停时状态冻结', () => {
    const engine = new Engine(level);
    engine.paused = true;
    for (let i = 0; i < 100; i++) engine.tick(0.05);
    expect(engine.gs.waveIndex).toBe(-1);
    expect(engine.gs.time).toBe(0);
  });

  it('2 倍速推进游戏时间约两倍', () => {
    const a = new Engine(level);
    const b = new Engine(level);
    b.speed = 2;
    for (let i = 0; i < 100; i++) {
      a.tick(0.05);
      b.tick(0.05);
    }
    expect(b.gs.time).toBeCloseTo(a.gs.time * 2, 5);
  });

  it('tick 返回并清空事件队列', () => {
    const engine = new Engine(level);
    const events = engine.tick(5); // 触发第一波开波
    expect(events.some((e) => e.t === 'waveStart')).toBe(true);
    expect(engine.gs.events).toHaveLength(0);
  });

  it('终局后 tick 不再推进', () => {
    const engine = new Engine(level);
    engine.gs.status = 'won';
    const t = engine.gs.time;
    engine.tick(1);
    expect(engine.gs.time).toBe(t);
  });
});
