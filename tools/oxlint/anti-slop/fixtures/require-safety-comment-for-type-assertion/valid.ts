declare const raw: string;

// SAFETY: raw has already been validated as one of the two known league tiers upstream.
export const tier = raw as "amateur" | "professional";

export const frozen = [1, 2] as const;
