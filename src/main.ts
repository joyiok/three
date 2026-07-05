import './style.css';
import { LEVELS } from './game/levels';
import type { Difficulty } from './game/versus';
import { SingleGameScreen } from './ui/single-game';
import { VersusScreen } from './ui/versus-game';
import { showLevelSelect, showMatch, showMenu, showResult, showVersusResult } from './ui/screens';
import { loadProgress, saveStars } from './storage';

class App {
  private root: HTMLElement;
  private levelIndex = 0;
  private singleGame: SingleGameScreen | null = null;
  private versusGame: VersusScreen | null = null;
  private lastResult: { won: boolean; stars: number } = { won: false, stars: 0 };
  private vsDifficulty: Difficulty = 'normal';
  private vsLocal = false;
  private progress = loadProgress();

  constructor() {
    this.root = document.querySelector<HTMLDivElement>('#app')!;
    this.showMenu();
  }

  private showMenu(): void {
    this.clearAll();
    showMenu(
      this.root,
      () => this.showLevelSelect(), // 战役
      () => this.showMatch(), // 对战
    );
  }

  private showLevelSelect(): void {
    this.clearAll();
    this.progress = loadProgress();
    showLevelSelect(
      this.root,
      this.progress,
      (i) => {
        this.levelIndex = i;
        this.startSingle();
      },
      () => this.showMenu(),
    );
  }

  private showMatch(): void {
    this.clearAll();
    showMatch(this.root, {
      onMatched: (diff, local) => {
        this.vsDifficulty = diff;
        this.vsLocal = local;
        this.startVersus();
      },
      onBack: () => this.showMenu(),
    });
  }

  private startSingle(): void {
    this.clearAll();
    this.root.innerHTML = '';
    const level = LEVELS[this.levelIndex];
    this.singleGame = new SingleGameScreen(this.root, level, (won, stars) => {
      this.lastResult = { won, stars };
      if (won) saveStars(level.id, stars);
      this.progress = loadProgress();
      setTimeout(() => this.showResult(), 400);
    });
  }

  private startVersus(): void {
    this.clearAll();
    this.root.innerHTML = '';
    this.versusGame = new VersusScreen(
      this.root,
      { difficulty: this.vsDifficulty, localTwoPlayer: this.vsLocal },
      (result) => {
        setTimeout(() => this.showVersusResult(result), 400);
      },
    );
  }

  private showResult(): void {
    this.clearAll();
    const hasNext = this.levelIndex < LEVELS.length - 1;
    showResult(this.root, {
      won: this.lastResult.won,
      stars: this.lastResult.stars,
      hasNext,
      onRetry: () => this.startSingle(),
      onNext: () => {
        this.levelIndex++;
        this.startSingle();
      },
      onBack: () => this.showLevelSelect(),
    });
  }

  private showVersusResult(result: 'won' | 'lost' | 'draw'): void {
    this.clearAll();
    showVersusResult(
      this.root,
      result,
      () => this.startVersus(),
      () => this.showMatch(),
    );
  }

  private clearAll(): void {
    if (this.singleGame) {
      this.singleGame.destroy();
      this.singleGame = null;
    }
    if (this.versusGame) {
      this.versusGame.destroy();
      this.versusGame = null;
    }
  }
}

new App();