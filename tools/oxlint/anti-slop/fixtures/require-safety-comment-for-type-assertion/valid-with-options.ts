declare const raw: string;

// Only valid under valid-with-options.oxlintrc.json, which sets markers: ["INVARIANT"].
// INVARIANT: raw has already been validated as one of the two known league tiers upstream.
export const tier = raw as "amateur" | "professional";
