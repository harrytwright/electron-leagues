export function wrapError(message: string, cause: unknown) {
	return new Error(message, { cause });
}
