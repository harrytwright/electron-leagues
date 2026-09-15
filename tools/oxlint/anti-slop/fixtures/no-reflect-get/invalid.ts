interface LeagueRecord {
	name: string;
}

function readName(record: LeagueRecord) {
	return Reflect.get(record, "name");
}

export const name = readName({ name: "league" });
