/** Vite base-aware public asset URL (GitHub Pages uses /hermes-agent-area/). */
export function assetUrl(path) {
  const base = import.meta.env.BASE_URL || "/";
  const p = String(path).replace(/^\//, "");
  return `${base}${p}`;
}
