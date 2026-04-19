import type { GameConfig, GameState } from "./types";

const CONFIG_KEY = "survivor-sim-config-v1";
const STATE_KEY = "survivor-sim-state-v1";

export function saveConfig(config: GameConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function loadConfig(): GameConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as GameConfig;
  } catch {
    return null;
  }
}

export function saveState(state: GameState): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function loadState(): GameState | null {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}
