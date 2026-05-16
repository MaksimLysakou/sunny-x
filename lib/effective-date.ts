const DAY_START_HOUR = 5;

export function getEffectiveDate(now: Date = new Date()): Date {
  const d = new Date(now);
  if (d.getHours() < DAY_START_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEffectiveDateKey(now: Date = new Date()): string {
  const d = getEffectiveDate(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
