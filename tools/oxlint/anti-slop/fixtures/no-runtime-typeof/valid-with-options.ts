// Only valid under valid-with-options.oxlintrc.json, which sets allowInTypeGuards: true.
export function isString(value: unknown): value is string {
	return typeof value === "string";
}
