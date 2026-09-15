import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { beforeAll, describe, expect, test } from "vitest";

import antiSlopPlugin from "../index.ts";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pluginRoot, "../../..");
// Run oxlint's Node launcher through the current Node binary: the `.bin` shim is a `.cmd`
// file on Windows and cannot be spawned directly.
const oxlintLauncher = path.join(repoRoot, "node_modules/oxlint/bin/oxlint");
const fixturesRoot = path.join(pluginRoot, "fixtures");
// Named rules.oxlintrc.json, not .oxlintrc.json: oxlint auto-discovers any nested ".oxlintrc.json"
// during a plain repo-wide run and lets it override the root config's ignorePatterns for this
// subtree, which would make `npm run lint` fail on these deliberately bad fixtures. A name other
// than the canonical dotfile keeps it invisible to that discovery while still explicitly loadable
// here via `-c`.
const fixturesConfig = path.join(fixturesRoot, "rules.oxlintrc.json");

type OxlintDiagnostic = {
	readonly code: string;
	readonly filename: string;
	readonly message: string;
	readonly severity: string;
};

type OxlintReport = {
	readonly diagnostics: readonly OxlintDiagnostic[];
};

/** Run the real oxlint binary and parse its JSON report, whichever exit path it takes. */
async function runOxlint(configPath: string, targetPath: string): Promise<OxlintReport> {
	try {
		const { stdout } = await execFileAsync(process.execPath, [
			oxlintLauncher,
			"-c",
			configPath,
			"--format",
			"json",
			targetPath,
		]);
		return JSON.parse(stdout) as OxlintReport;
	} catch (error) {
		// oxlint exits non-zero when it finds error-level diagnostics; the report is still on stdout.
		const stdout = (error as { stdout?: unknown }).stdout;
		if (typeof stdout !== "string" || stdout.length === 0) throw error;
		return JSON.parse(stdout) as OxlintReport;
	}
}

const ruleIds = Object.keys(antiSlopPlugin.rules).sort();

describe("anti-slop rule fixtures", () => {
	// index.ts currently registers fifteen rules; this guards against silently dropping one.
	test("index.ts registers the fifteen documented rules", () => {
		expect(ruleIds).toHaveLength(15);
	});

	let diagnosticsByFile: Map<string, OxlintDiagnostic[]>;

	beforeAll(async () => {
		const report = await runOxlint(fixturesConfig, fixturesRoot);
		diagnosticsByFile = new Map();
		for (const diagnostic of report.diagnostics) {
			const relative = path.relative(fixturesRoot, diagnostic.filename);
			const existing = diagnosticsByFile.get(relative) ?? [];
			existing.push(diagnostic);
			diagnosticsByFile.set(relative, existing);
		}
	});

	test.each(ruleIds)("%s has a fixture directory with valid.ts and invalid.ts", (ruleId) => {
		const ruleDir = path.join(fixturesRoot, ruleId);
		expect(existsSync(ruleDir), `missing fixtures/${ruleId}`).toBe(true);
		expect(existsSync(path.join(ruleDir, "valid.ts")), `missing fixtures/${ruleId}/valid.ts`).toBe(
			true,
		);
		expect(
			existsSync(path.join(ruleDir, "invalid.ts")),
			`missing fixtures/${ruleId}/invalid.ts`,
		).toBe(true);
	});

	test.each(ruleIds)("%s valid.ts produces no diagnostics", (ruleId) => {
		const diagnostics = diagnosticsByFile.get(path.join(ruleId, "valid.ts")) ?? [];
		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
	});

	test.each(ruleIds)("%s invalid.ts only reports its own rule", (ruleId) => {
		const diagnostics = diagnosticsByFile.get(path.join(ruleId, "invalid.ts")) ?? [];
		expect(diagnostics.length).toBeGreaterThan(0);
		const expectedCode = `anti-slop(${ruleId})`;
		for (const diagnostic of diagnostics) {
			expect(diagnostic.code).toBe(expectedCode);
		}
	});

	describe("rules with options exercise a valid-with-options fixture", () => {
		for (const ruleId of ruleIds) {
			const schema = antiSlopPlugin.rules[ruleId]?.meta?.schema;
			const hasOptions = Array.isArray(schema) && schema.length > 0;
			if (!hasOptions) continue;

			const ruleDir = path.join(fixturesRoot, ruleId);
			const optionsFixture = path.join(ruleDir, "valid-with-options.ts");
			const optionsConfig = path.join(ruleDir, "valid-with-options.oxlintrc.json");

			test(`${ruleId} has a valid-with-options.ts and its own config`, () => {
				expect(existsSync(optionsFixture), `missing fixtures/${ruleId}/valid-with-options.ts`).toBe(
					true,
				);
				expect(
					existsSync(optionsConfig),
					`missing fixtures/${ruleId}/valid-with-options.oxlintrc.json`,
				).toBe(true);
			});

			test(`${ruleId} valid-with-options.ts is clean under its own options`, async () => {
				const report = await runOxlint(optionsConfig, optionsFixture);
				expect(report.diagnostics).toEqual([]);
			});
		}
	});
});
