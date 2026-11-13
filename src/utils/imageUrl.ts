export function withRefreshTick(
  url: string | null,
  refreshInterval: number | undefined,
  nowSec: number
): string | null {
  if (!url) return null;
  if (!refreshInterval || refreshInterval <= 0) return url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return url;

  const bucket = Math.floor(nowSec / refreshInterval);
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_sd_t=${bucket}`;
}
