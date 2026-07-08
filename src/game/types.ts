export type CellKind = 'path' | 'grass' | 'rock';
export type SoldierKind = '刀' | '枪' | '弓' | '骑' | '忠';
export type EnemyKind = '斗' | '贼' | '兵' | '将' | 'boss';

/** 战役消耗型道具（击杀掉落，存入锦囊） */
export type ItemKind =
  | 'fire' // 火攻：点选一格，范围灼烧（无视护甲）
  | 'arrowRain' // 箭雨：全场敌军各中一矢
  | 'rockfall' // 落石：重创最前方敌军（无视护甲）
  | 'slowAll' // 缓兵：全场敌军减速数秒
  | 'rally' // 鼓舞：全军攻速提升数秒
  | 'heal' // 修营：营寨回血
  | 'food' // 征粮：立得粮食
  | 'merge'; // 神合：随机一对同字同级士兵立即合成

export interface Vec {
  x: number;
  y: number;
}

export interface Soldier {
  id: number;
  kind: SoldierKind;
  level: number;
  /** null 表示在背包中 */
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
  /** 当前帧减速比例 0~0.6，每帧由光环重算 */
  slow: number;
  pathIndex: number;
  /** 沿路径已走距离（格） */
  progress: number;
  bounty: number;
  damage: number;
  /** 护甲：每次受击减免固定伤害（枪无视） */
  armor?: number;
  /** 每秒回复 maxHp 的比例（将的回气） */
  regen?: number;
  /** 骑兵践踏减速的截止时刻（gs.time） */
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

export type Loc = { type: 'bench'; index: number } | { type: 'cell'; cell: Vec };

export interface SpawnEvent {
  /** 波内时刻（秒） */
  at: number;
  kind: EnemyKind;
  pathIndex: number;
}

export interface WaveGroup {
  kind: EnemyKind;
  count: number;
  interval: number;
  delay: number;
  pathIndex?: number;
}

export interface WaveDef {
  groups: WaveGroup[];
}

export interface LevelDef {
  id: string;
  name: string;
  coeff: number;
  /** 起始粮食（缺省用 START_FOOD）；双路关卡给更多 */
  startFood?: number;
  /** 10 行、每行 7 字符：'#'=path '.'=grass 'r'=rock */
  grid: string[];
  paths: Vec[][];
  waves: WaveDef[];
  bossWord: string;
  bossHp: number;
}

export type GameEvent =
  | { t: 'recruit' }
  | { t: 'deploy'; cell: Vec; soldierId: number }
  | { t: 'merge'; cell: Vec; level: number; soldierId: number }
  | { t: 'sell' }
  | { t: 'shoot'; kind: SoldierKind; from: Vec; to: Vec; soldierId: number }
  | { t: 'hit'; x: number; y: number; damage: number; enemyId: number }
  | { t: 'kill'; x: number; y: number; bounty: number; enemyId: number }
  | { t: 'leak'; damage: number }
  | { t: 'income'; amount: number; source: 'early' | 'interest' | 'farm' }
  | { t: 'itemGain'; item: ItemKind; x: number; y: number }
  | { t: 'itemUse'; item: ItemKind; cell?: Vec }
  | { t: 'waveStart'; wave: number }
  | { t: 'boss'; word: string }
  | { t: 'won' }
  | { t: 'lost' };

export interface GameState {
  levelId: string;
  food: number;
  recruitCost: number;
  baseHp: number;
  bench: (Soldier | null)[];
  soldiers: Soldier[];
  enemies: Enemy[];
  projectiles: Projectile[];
  /** -1 表示尚未开始第一波 */
  waveIndex: number;
  /** 距自动开下一波的倒计时（秒） */
  waveTimer: number;
  /** true = 波间休整中（含开局），倒计时结束自动开波 */
  intermission: boolean;
  /** 当前波已进行时间（秒） */
  waveClock: number;
  spawnQueue: SpawnEvent[];
  status: 'playing' | 'won' | 'lost';
  events: GameEvent[];
  nextId: number;
  time: number;
  /** 锦囊：击杀掉落的消耗型道具 */
  items: ItemKind[];
  /** 鼓舞（全军攻速加成）截止时刻 */
  rallyUntil: number;
  /** 缓兵（全场敌军减速）截止时刻 */
  slowAllUntil: number;
}
