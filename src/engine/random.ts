export class RNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    this.state >>>= 0;
    return result;
  }

  getState(): number {
    return this.state >>> 0;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min = 0, max = 1): number {
    return this.next() * (max - min) + min;
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  pick<T>(items: T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index);
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  weightedPick<T>(items: T[], weightFn: (item: T) => number): T {
    const weights = items.map((item) => Math.max(0.001, weightFn(item)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let roll = this.float(0, total);
    for (let index = 0; index < items.length; index += 1) {
      roll -= weights[index];
      if (roll <= 0) {
        return items[index];
      }
    }
    return items[items.length - 1];
  }

  centeredNoise(magnitude: number): number {
    return (this.next() - 0.5) * 2 * magnitude;
  }
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
