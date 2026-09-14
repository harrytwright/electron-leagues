interface LeagueSummary {
	name: string;
}

export function summarize(name: string): LeagueSummary {
	return { name };
}
