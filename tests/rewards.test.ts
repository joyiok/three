import { describe, expect, it } from 'vitest';
import { BASE_HP, ITEM_BAG_MAX, RECRUIT_BASE } from '../src/game/config';
import { LEVELS } from '../src/game/levels';
import {
  applyRewardChoice,
  availableRewardKinds,
  makeRewardChoices,
} from '../src/game/rewards';
import { createGame } from '../src/game/state';

const level = LEVELS[0];

describe('波末策令三选一', () => {
  it('基础池至少包含粮草与降价，最多给 3 个选项', () => {
    const gs = createGame(level);
    const kinds = availableRewardKinds(gs);
    expect(kinds).toContain('grain');
    expect(kinds).toContain('discount');
    const choices = makeRewardChoices(gs, () => 0);
    expect(choices.length).toBeLessThanOrEqual(3);
    expect(new Set(choices.map((c) => c.kind)).size).toBe(choices.length);
  });

  it('根据局势加入修营/锦囊/精训', () => {
    const gs = createGame(level);
    gs.baseHp = BASE_HP - 1;
    gs.items = [];
    gs.soldiers.push({ id: gs.nextId++, kind: '刀', level: 1, cell: { x: 0, y: 1 }, cooldown: 0 });
    const kinds = availableRewardKinds(gs);
    expect(kinds).toContain('repair');
    expect(kinds).toContain('item');
    expect(kinds).toContain('veteran');
  });

  it('锦囊满时不提供搜获锦囊', () => {
    const gs = createGame(level);
    gs.items = ['food', 'food', 'food'];
    expect(gs.items).toHaveLength(ITEM_BAG_MAX);
    expect(availableRewardKinds(gs)).not.toContain('item');
  });

  it('粮草奖励 +20 并清空选择', () => {
    const gs = createGame(level);
    gs.rewardChoices = [{ kind: 'grain', title: '犒赏三军', desc: '' }];
    const before = gs.food;
    expect(applyRewardChoice(gs, 0)).toBe(true);
    expect(gs.food).toBe(before + 20);
    expect(gs.rewardChoices).toHaveLength(0);
  });

  it('降价不低于初价', () => {
    const gs = createGame(level);
    gs.recruitCost = RECRUIT_BASE + 2;
    gs.rewardChoices = [{ kind: 'discount', title: '整肃军纪', desc: '' }];
    expect(applyRewardChoice(gs, 0)).toBe(true);
    expect(gs.recruitCost).toBe(RECRUIT_BASE);
  });

  it('修营满血时拒绝且不清空选择', () => {
    const gs = createGame(level);
    gs.rewardChoices = [{ kind: 'repair', title: '固守营寨', desc: '' }];
    expect(applyRewardChoice(gs, 0)).toBe(false);
    expect(gs.rewardChoices).toHaveLength(1);
  });

  it('搜获锦囊获得随机道具', () => {
    const gs = createGame(level);
    gs.rewardChoices = [{ kind: 'item', title: '搜获锦囊', desc: '' }];
    expect(applyRewardChoice(gs, 0, () => 0)).toBe(true);
    expect(gs.items).toEqual(['fire']);
  });

  it('精训升级场上士兵并产生 merge 特效事件', () => {
    const gs = createGame(level);
    gs.soldiers.push({ id: gs.nextId++, kind: '弓', level: 2, cell: { x: 0, y: 1 }, cooldown: 3 });
    gs.rewardChoices = [{ kind: 'veteran', title: '精训老兵', desc: '' }];
    expect(applyRewardChoice(gs, 0, () => 0)).toBe(true);
    expect(gs.soldiers[0].level).toBe(3);
    expect(gs.soldiers[0].cooldown).toBe(0);
    expect(gs.events.some((e) => e.t === 'merge')).toBe(true);
  });
});
