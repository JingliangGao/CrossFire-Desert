export interface ScoreRow {
  score: number;
  kills: number;
  headshots: number;
  time: number;
  date: string;
}

const KEY = "cf.scores.v1";
export const MAX_ROWS = 5;

export function loadScores(): ScoreRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ScoreRow[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((r) => typeof r?.score === "number").sort((a, b) => b.score - a.score).slice(0, MAX_ROWS);
  } catch {
    return [];
  }
}

export function saveScore(row: ScoreRow): { rows: ScoreRow[]; rank: number } {
  const rows = loadScores();
  rows.push(row);
  rows.sort((a, b) => b.score - a.score);
  const trimmed = rows.slice(0, MAX_ROWS);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
  const rank = trimmed.indexOf(row);
  return { rows: trimmed, rank: rank < 0 ? -1 : rank + 1 };
}

export function formatDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
