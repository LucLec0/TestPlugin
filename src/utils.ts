export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function averageBy<T>(items: T[], getter: (item: T) => number): number {
  if (items.length === 0) {
    return 0;
  }
  const total = items.reduce((sum, item) => sum + getter(item), 0);
  return Math.round(total / items.length);
}

export function sliderColor(value: number): string {
  if (value >= 75) {
    return "#22c55e";
  }
  if (value >= 50) {
    return "#eab308";
  }
  if (value >= 25) {
    return "#f97316";
  }
  return "#ef4444";
}

export function playerMapById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>;
}

export function tribeMapById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>;
}
