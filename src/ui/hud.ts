import type { GameState, LevelDef } from '../game/types';

export interface HudHandlers {
  onPause: () => void;
  onSpeed: () => void;
  onMute: () => void;
}

export class Hud {
  private foodEl: HTMLElement;
  private hpEl: HTMLElement;
  private nameEl: HTMLElement;
  private waveEl: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private muteBtn: HTMLButtonElement;

  constructor(root: HTMLElement, handlers: HudHandlers) {
    root.className = 'hud';
    root.innerHTML = `
      <div class="hud-left">
        <span class="pill pill-food">🍚 <b data-food>0</b></span>
        <span class="pill pill-hp">♥ <b data-hp>10</b></span>
      </div>
      <div class="hud-center">
        <div class="hud-title" data-name></div>
        <div class="hud-wave" data-wave></div>
      </div>
      <div class="hud-right">
        <button class="icon-btn" data-pause title="暂停">⏸</button>
        <button class="icon-btn" data-speed title="倍速">1x</button>
        <button class="icon-btn" data-mute title="音效">🔊</button>
      </div>`;
    this.foodEl = root.querySelector('[data-food]')!;
    this.hpEl = root.querySelector('[data-hp]')!;
    this.nameEl = root.querySelector('[data-name]')!;
    this.waveEl = root.querySelector('[data-wave]')!;
    this.pauseBtn = root.querySelector('[data-pause]')!;
    this.speedBtn = root.querySelector('[data-speed]')!;
    this.muteBtn = root.querySelector('[data-mute]')!;
    this.pauseBtn.addEventListener('click', handlers.onPause);
    this.speedBtn.addEventListener('click', handlers.onSpeed);
    this.muteBtn.addEventListener('click', handlers.onMute);
  }

  update(gs: GameState, level: LevelDef, ui: { paused: boolean; speed: number; muted: boolean }): void {
    if (this.foodEl.textContent !== String(gs.food)) this.foodEl.textContent = String(gs.food);
    if (this.hpEl.textContent !== String(gs.baseHp)) {
      this.hpEl.textContent = String(gs.baseHp);
      this.hpEl.parentElement!.classList.remove('bump');
      void (this.hpEl.parentElement as HTMLElement).offsetWidth;
      this.hpEl.parentElement!.classList.add('bump');
    }
    this.nameEl.textContent = level.name;
    const waveText =
      gs.waveIndex < 0
        ? `大战将至`
        : `第${gs.waveIndex + 1}波 / 共${level.waves.length}波`;
    if (this.waveEl.textContent !== waveText) this.waveEl.textContent = waveText;
    this.pauseBtn.textContent = ui.paused ? '▶' : '⏸';
    this.speedBtn.textContent = `${ui.speed}x`;
    this.muteBtn.textContent = ui.muted ? '🔇' : '🔊';
  }
}
