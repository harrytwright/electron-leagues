// Widening a known value is fine so long as nothing later reasserts it back to a narrower type.
export function widenWithoutReassert(name: string) {
	const widened: unknown = name;
	return widened;
}
