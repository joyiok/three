import {
  BASE_HP,
  ITEM_BAG_MAX,
  ITEM_KINDS,
  RECRUIT_BASE,
} from './config';
import type { GameState, RewardChoice, RewardKind, Soldier } from './types';

const REWARD_META: Record<RewardKind, RewardChoice> = {
  grain: { kind: 'grain', title: '犒赏三军', desc: '+20 粮草，立刻扩军' },
  discount: { kind: 'discount', title: '整肃军纪', desc: '征兵价 -5（不低于初价）' },
  repair: { kind: 'repair', title: '固守营寨', desc: '营寨 +2 血' },
  item: { kind: 'item', title: '搜获锦囊', desc: '获得 1 个随机锦囊' },
  veteran: { kind: 'veteran', title: '精训老兵', desc: '随机 1 名士兵升 1 级' },
};

export function availableRewardKinds(gs: GameState): RewardKind[] {
  const kinds: RewardKind[] = ['grain', 'discount'];
  if (gs.baseHp < BASE_HP) kinds.push('repair');
  if (gs.items.length < ITEM_BAG_MAX) kinds.push('item');
  if (allSoldiers(gs).length > 0) kinds.push('veteran');
  return kinds;
}

export function makeRewardChoices(
  gs: GameState,
  rand: () => number = Math.random,
): RewardChoice[] {
  const pool = [...availableRewardKinds(gs)];
  const choices: RewardChoice[] = [];
  while (pool.length > 0 && choices.length < 3) {
    const idx = Math.floor(rand() * pool.length);
    const [kind] = pool.splice(idx, 1);
    choices.push(REWARD_META[kind]);
  }
  return choices;
}

function allSoldiers(gs: GameState): Soldier[] {
  return [
    ...gs.soldiers,
    ...gs.bench.filter((s): s is Soldier => s !== null),
  ];
}

function pickSoldier(gs: GameState, rand: () => number): Soldier | null {
  const soldiers = allSoldiers(gs);
  if (soldiers.length === 0) return null;
  return soldiers[Math.floor(rand() * soldiers.length)];
}

export function applyRewardChoice(
  gs: GameState,
  index: number,
  rand: () => number = Math.random,
): boolean {
  const choice = gs.rewardChoices[index];
  if (!choice) return false;

  switch (choice.kind) {
    case 'grain':
      gs.food += 20;
      break;
    case 'discount':
      gs.recruitCost = Math.max(RECRUIT_BASE, gs.recruitCost - 5);
      break;
    case 'repair':
      if (gs.baseHp >= BASE_HP) return false;
      gs.baseHp = Math.min(BASE_HP, gs.baseHp + 2);
      break;
    case 'item':
      if (gs.items.length >= ITEM_BAG_MAX) return false;
      gs.items.push(ITEM_KINDS[Math.floor(rand() * ITEM_KINDS.length)]);
      break;
    case 'veteran': {
      const s = pickSoldier(gs, rand);
      if (!s) return false;
      s.level += 1;
      s.cooldown = 0;
      gs.events.push({
        t: 'merge',
        cell: s.cell ? { ...s.cell } : { x: -1, y: -1 },
        level: s.level,
        soldierId: s.id,
      });
      break;
    }
  }
  gs.rewardChoices = [];
  return true;
}
