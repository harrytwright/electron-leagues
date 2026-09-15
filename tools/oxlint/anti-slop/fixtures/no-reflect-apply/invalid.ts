function sum(a: number, b: number) {
	return a + b;
}

export const total = Reflect.apply(sum, undefined, [1, 2]);
