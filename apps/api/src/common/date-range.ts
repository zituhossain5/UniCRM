/** Date-only fields are stored at UTC midnight. This keeps classification independent of host timezone. */
export function utcToday(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}
