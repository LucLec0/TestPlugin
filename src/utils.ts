export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}
