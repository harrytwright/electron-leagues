function single(value: string) {
	// SAFETY: fixture narrows a domain parameter with one assertion, which is never a chain.
	return value as unknown;
}

// A chain of only const assertions keeps its evidence and is allowed however deep.
const tuple = ([1, 2] as const) as const;

single("league");
tuple;
