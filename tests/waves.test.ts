import { describe, expect, it } from 'vitest';
import { BASE_HP, WAVE_AUTO_DELAY, WAVE_CLEAR_BONUS } from '../src/game/config';
import { LEVELS } from '../src/game/levels';
import { applyRewardChoice } from '../src/game/rewards';
import { createGame } from '../src/game/state';
import { enemyPos, pathLength, startWave, tickWave } from '../src/game/waves';

const level = LEVELS[0]; // 单路径，长 15 段

describe('waves', () => {
  it('startWave 展开出怪队列并推进波次', () => {
    const gs = createGame(level);
    expect(startWave(gs, level)).toBe(true);
    expect(gs.waveIndex).toBe(0);
    expect(gs.spawnQueue).toHaveLength(6); // 第 1 波 斗×6
    const ats = gs.spawnQueue.map((s) => s.at);
    [0, 0.9, 1.8, 2.7, 3.6, 4.5].forEach((v, i) => expect(ats[i]).toBeCloseTo(v));
    expect(gs.events.some((e) => e.t === 'waveStart')).toBe(true);
  });

  it('末波 startWave 触发 boss 事件', () => {
    const gs = createGame(level);
    gs.waveIndex = level.waves.length - 2;
    startWave(gs, level);
    expect(gs.events.some((e) => e.t === 'boss' && e.word === '角')).toBe(true);
  });

  it('tickWave 按时出怪且 HP 缩放', () => {
    const gs = createGame(level);
    startWave(gs, level);
    tickWave(gs, level, 0.01);
    expect(gs.enemies).toHaveLength(1);
    expect(gs.enemies[0].hp).toBe(30);
    tickWave(gs, level, 1.3);
    expect(gs.enemies).toHaveLength(2);
  });

  it('敌人沿路径移动并插值坐标', () => {
    const gs = createGame(level);
    startWave(gs, level);
    tickWave(gs, level, 0.01);
    const e = gs.enemies[0];
    tickWave(gs, level, 1.0); // 速度 1 格/s
    expect(e.progress).toBeCloseTo(1.01, 1);
    const pos = enemyPos(level, e);
    expect(pos.x).toBeCloseTo(3);
    expect(pos.y).toBeCloseTo(e.progress, 1);
  });

  it('走完路径漏怪扣血并移除', () => {
    const gs = createGame(level);
    startWave(gs, level);
    tickWave(gs, level, 0.01);
    tickWave(gs, level, pathLength(level, 0) + 1);
    expect(gs.enemies.find((e) => e.progress > pathLength(level, 0))).toBeUndefined();
    expect(gs.baseHp).toBeLessThan(BASE_HP);
    expect(gs.events.some((e) => e.t === 'leak')).toBe(true);
  });

  it('血量归零判负', () => {
    const gs = createGame(level);
    gs.baseHp = 1;
    startWave(gs, level);
    tickWave(gs, level, 0.01);
    tickWave(gs, level, 99);
    expect(gs.status).toBe('lost');
    expect(gs.events.some((e) => e.t === 'lost')).toBe(true);
  });

  it('非末波清空发粮（含利息）并生成策令，选择后倒计时自动开波', () => {
    const gs = createGame(level);
    startWave(gs, level);
    gs.spawnQueue = [];
    gs.enemies = [];
    const before = gs.food;
    tickWave(gs, level, 0.1);
    const interest = Math.floor((before + WAVE_CLEAR_BONUS) / 10);
    expect(gs.food).toBe(before + WAVE_CLEAR_BONUS + interest);
    expect(gs.rewardChoices.length).toBeGreaterThan(0);
    expect(gs.waveTimer).toBeCloseTo(WAVE_AUTO_DELAY - 0, 5);
    tickWave(gs, level, WAVE_AUTO_DELAY + 0.1);
    expect(gs.waveIndex).toBe(0); // 未选策令前暂停自动开波
    expect(applyRewardChoice(gs, 0, () => 0)).toBe(true);
    tickWave(gs, level, WAVE_AUTO_DELAY + 0.1);
    expect(gs.waveIndex).toBe(1);
  });

  it('末波清空判胜', () => {
    const gs = createGame(level);
    gs.waveIndex = level.waves.length - 1;
    gs.intermission = false;
    gs.spawnQueue = [];
    gs.enemies = [];
    tickWave(gs, level, 0.1);
    expect(gs.status).toBe('won');
    expect(gs.events.some((e) => e.t === 'won')).toBe(true);
  });
});
