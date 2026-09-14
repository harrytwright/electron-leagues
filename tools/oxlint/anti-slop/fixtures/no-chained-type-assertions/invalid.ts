function chain(value: string) {
	// SAFETY: fixture intentionally chains assertions to trigger no-chained-type-assertions.
	return value as unknown as number;
}

chain("league");
