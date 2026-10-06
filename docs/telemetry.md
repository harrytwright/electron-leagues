# Telemetry

Sentry owns application faults, structured warnings and sampled timings. PostHog owns
product outcomes and renderer session replay. Both remain optional: the existing DSN
and project-key settings control delivery.

## Collection boundaries

`src/shared/telemetry.ts` keeps filesystem and renderer workflows independent of SDK
initialisation. The main and renderer analytics modules install their SDK adapters at
startup. Without an adapter, operations still execute and reporting does nothing.

Unexpected IPC failures are captured once. Recovered failures, such as a failed member
merge or one failed file in a successful batch, are captured at their recovery boundary.
The same Error object is deduplicated if it later reaches the IPC boundary.

`UserFacingError.reason` distinguishes validation, missing files, permission failures,
insufficient space, conflicts and stale revisions. These refusals generate structured
warnings rather than application issues. Failed rollbacks are always application faults,
even when the original write failed for an expected filesystem reason.

Warnings for repeated conditions are limited to once per local key every five minutes.
The cache holds at most 200 keys. A key may contain a local path for deduplication but
is never sent to either service. Invalid member files and roster problems report counts
by problem kind.

Scans tolerate missing optional folders. A missing selected root, unreadable directory or
unreadable metadata file rejects the scan so existing UI error states can explain the
failure. Invalid JSON can still be healed, with a warning recording the recovery.
Season creation and league renaming read metadata and season lists before writing or
moving seasons, so a read failure leaves those changes unapplied and permits a retry.

## Timings

Sentry samples 10% of traces in the main and renderer processes. Electron startup tracing
and browser tracing are enabled. Application spans cover:

| Span                                  | What it measures                                                 |
| ------------------------------------- | ---------------------------------------------------------------- |
| `ipc.<method>`                        | A validated IPC request, including its outcome and channel       |
| `filesystem.scan`                     | A complete tree scan, with league and season counts              |
| `members.snapshot`                    | Member and roster reads, with member, season and problem counts  |
| `import.read`                         | Export reading and parsing, with format, bytes, rows and columns |
| `filesystem.queue`                    | Waiting for earlier writes at the same location                  |
| `filesystem.write`                    | Work after acquiring the location write queue                    |
| `filesystem.import`, `filesystem.zip` | Batch work, with successful and failed counts                    |
| `pdf.render`                          | Hidden-window rendering through PDF completion or timeout        |
| `update.check`, `update.download`     | Update checks and download completion                            |
| `ui.write`                            | A write through its visible refresh outcome                      |
| `ui.refresh`                          | Query cancellation, invalidation and active refetches            |

Import preview, planning and application have separate IPC spans. Picker spans include
time spent in the native dialog. Startup events separately measure process start to the
first shown main window and renderer navigation start to the first ready workspace.
The optional CPU and heap display remains local; it does not upload every sample.

## Product events

Existing success events retain their names. File imports, archive ZIPs, MBD syncs and
player imports include failure counts and a `success` or `partial` outcome. UI writes
emit `write_completed` with their operation, elapsed time and `refreshed`,
`refresh-failed`, `deferred` or `failed` outcome. This separates a completed disk write
from a failed refresh without duplicating its exception report.

Additional events cover location repair and forgetting, failed location switches,
watcher fallback, import preview and review, import cancellation, workspace navigation
and startup readiness. Update events cover checks, completed downloads and installation
requests or refusals. Percentage-by-percentage download progress is not recorded.

Installation requests are recorded before the quit flush. PostHog shuts down before
installation, so a later installation failure is captured by Sentry and flushed again
before exit. A rejected final flush does not prevent quitting. A subsequent `app_opened`
event carries the installed version; an install request alone does not claim the new
version was installed successfully.

## Identity and replay

Both processes attach app version, environment, platform and a random `app_session_id`
for the current launch. The existing machine ID remains the distinct ID.

The renderer reports PostHog session changes through validated IPC. Main-process product
events originating from that renderer carry its `$session_id`. An async context keeps
overlapping windows and long-running requests in their originating sessions. Requests
started before registration adopt the first registered session for events captured after
registration. Later session rotations only affect new requests. Native startup and
background update events have launch context without an invented replay ID.

The full PostHog recorder is bundled locally. Remote script loading is disabled; the CSP
allows configuration JSON from the EU assets host and telemetry ingestion from the EU
API host. Blob workers are allowed for the recorder. Replay still depends on the project's
server-side recording settings.

Early renderer events wait in a queue of at most 100 entries until configuration arrives.
Events are discarded when no key is configured or initialisation fails. Rendering never
waits for that queue. Sentry also initialises in the isolated preload context so bridge
failures can be captured before the application mounts.

## Data and validation

New event properties, log attributes and span attributes use operation names, categorical
reasons, counts and timings. They do not include member records, import rows, query keys,
user-facing labels or filesystem paths. Manually reported recovered exceptions retain
their originating stack frames and error type, with the message replaced by the operation
name. Existing automatic Sentry capture and PostHog replay masking remain SDK/project
settings and should be reviewed separately when those settings change.

Regression tests cover recovery reporting, partial results, scan failures, update error
deduplication, renderer session isolation and startup event delivery. Live ingestion and
server-side replay settings require a configured application smoke test; unit tests do
not send telemetry to production.
