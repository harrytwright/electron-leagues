declare const includeExtra: boolean;

const extra = { season: "2026" };

export const merged = { ...(includeExtra ? extra : {}) };
