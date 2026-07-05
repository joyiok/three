export type CellKind = 'path' | 'grass' | 'rock';
export type SoldierKind = '刀' | '枪' | '弓' | '骑' | '忠';
export type EnemyKind = '斗' | '贼' | '兵' | '将' | 'boss';

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
  /** 10 行、每行 7 字符：'#'=path '.'=grass 'r'=rock */
  grid: string[];
  paths: Vec[][];
  waves: WaveDef[];
  bossWord: string;
  bossHp: number;
}

export type GameEvent =
  | { t: 'recruit' }
  | { t: 'deploy' }
  | { t: 'merge'; cell: Vec; level: number }
  | { t: 'sell' }
  | { t: 'shoot'; kind: SoldierKind; from: Vec }
  | { t: 'hit'; x: number; y: number; damage: number }
  | { t: 'kill'; x: number; y: number; bounty: number }
  | { t: 'leak'; damage: number }
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
}
