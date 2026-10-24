/** Sim seconds -> "HH:MM:SS". */
export function formatClock(t: number) {
  const s = Math.floor(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
