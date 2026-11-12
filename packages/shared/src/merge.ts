/** Three-way merge of a record's fields (design D4): base = what the edit started from. */

export interface FieldConflict {
  field: string;
  base: unknown;
  mine: unknown;
  theirs: unknown;
}

export interface MergeResult<T> {
  merged: T;
  conflicts: FieldConflict[];
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Fields only one side changed merge automatically. Fields both sides changed to different
 * values are reported as conflicts; `merged` keeps "theirs" for those until the member picks.
 */
export function threeWayMerge<T extends Record<string, unknown>>(
  base: T,
  mine: T,
  theirs: T,
  ignore: string[] = [],
): MergeResult<T> {
  const merged: Record<string, unknown> = { ...theirs };
  const conflicts: FieldConflict[] = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]);
  for (const key of keys) {
    if (ignore.includes(key)) continue;
    const b = base[key];
    const m = mine[key];
    const t = theirs[key];
    const mineChanged = !same(b, m);
    const theirsChanged = !same(b, t);
    if (mineChanged && !theirsChanged) merged[key] = m;
    else if (mineChanged && theirsChanged && !same(m, t)) conflicts.push({ field: key, base: b, mine: m, theirs: t });
  }
  return { merged: merged as T, conflicts };
}

export function applyChoices<T extends Record<string, unknown>>(
  merged: T,
  conflicts: FieldConflict[],
  choices: Record<string, 'mine' | 'theirs'>,
): T {
  const out: Record<string, unknown> = { ...merged };
  for (const c of conflicts) out[c.field] = choices[c.field] === 'mine' ? c.mine : c.theirs;
  return out as T;
}
