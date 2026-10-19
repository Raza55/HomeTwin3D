export type Repeat = '' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';

export function readRepeat(rule?: string): { repeat: Repeat; interval: number } {
  if (!rule) return { repeat: '', interval: 1 };
  const freq = rule.match(/(?:^|;)FREQ=([^;]+)/)?.[1];
  const interval = Number(rule.match(/(?:^|;)INTERVAL=([^;]+)/)?.[1] ?? 1);
  return { repeat: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq ?? '') ? freq as Repeat : 'CUSTOM', interval };
}

/** Preserve weekdays, end conditions and other clauses when only the interval changes. */
export function repeatRule(repeat: Repeat, interval: number, original?: string): string | undefined {
  if (repeat === 'CUSTOM') return original;
  if (!repeat) return undefined;
  if (!Number.isSafeInteger(interval) || interval < 1) throw new Error('Invalid recurrence interval');
  const old = readRepeat(original);
  if (original && old.repeat === repeat && old.interval === interval) return original;
  const parts = original && old.repeat === repeat ? original.split(';').filter(p => !p.startsWith('INTERVAL=')) : [`FREQ=${repeat}`];
  if (interval !== 1) parts.push(`INTERVAL=${interval}`);
  return parts.join(';');
}
