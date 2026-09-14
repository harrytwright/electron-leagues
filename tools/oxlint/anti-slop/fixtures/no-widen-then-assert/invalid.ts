export function widen(name: string) {
	const widened: unknown = name;
	// SAFETY: fixture demonstrates widen-then-assert; `name`'s original evidence justifies this.
	return widened as string;
}
