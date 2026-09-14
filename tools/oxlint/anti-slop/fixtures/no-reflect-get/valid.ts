interface LeagueRecord {
	name: string;
}

function readName(record: LeagueRecord) {
	return record.name;
}

export const name = readName({ name: "league" });
