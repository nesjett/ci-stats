export function durationMs(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const d = end - start;
  return d < 0 ? 0 : d;
}

export function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

export function formatDelta(ms: number | null): string {
  if (ms === null) return "—";
  if (ms === 0) return "±0";
  const sign = ms > 0 ? "+" : "-";
  return `${sign}${formatMs(Math.abs(ms))}`;
}
