declare const includeExtra: boolean;

const extra = { season: "2026" };
const base = { name: "league" };

export const merged = { ...(includeExtra ? extra : base) };
