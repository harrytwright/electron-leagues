# PostHog Self-driving setup report

## Summary

Session Replay, Error Tracking, and Support were enabled server-side; 7 signal sources were wired up; the GitHub App was connected; a 5-scout troop is running; 1 custom scout was created; and 2 Replay Vision scanners are armed and waiting for recordings. Findings will start appearing in the [Self-driving inbox](https://eu.posthog.com/project/262555/inbox) within ~30 minutes.

---

## AI data processing

**Approved.** Organisation-level AI data processing approval was confirmed before this run started.

---

## GitHub

**Connected during this run.** GitHub App integration id `81633`, account `harrytwright`. One repository is accessible: `harrytwright/electron-leagues`.

---

## Products enabled

All three products were newly enabled (none were already on).

| Product                 | Status          | Notes                                                                                                                                                                                    |
| ----------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session Replay          | Enabled — inert | Server flip is on. This app uses `posthog-node` in the Electron main process only; no `posthog-js` in the renderer, so no recordings will be captured until it is added. See follow-ups. |
| Error Tracking          | Enabled — inert | Same reason — exception autocapture requires `posthog-js` in the renderer.                                                                                                               |
| Support (Conversations) | Enabled         | Tickets only arrive once an inbound channel (email / inbox / Slack) is connected in PostHog. See follow-ups.                                                                             |

---

## Signal sources

| source_product | source_type              | Action                                        |
| -------------- | ------------------------ | --------------------------------------------- |
| signals_scout  | cross_source_issue       | On by default — no config row needed          |
| health_checks  | health_issue             | Enabled (new)                                 |
| error_tracking | issue_created            | Enabled (new)                                 |
| error_tracking | issue_reopened           | Enabled (new)                                 |
| error_tracking | issue_spiking            | Enabled (new)                                 |
| session_replay | session_analysis_cluster | Enabled (new, server default sample rate 0.1) |
| conversations  | ticket                   | Enabled (new)                                 |
| github         | issue                    | Enabled (dormant — no warehouse source yet)   |
| sentry         | issue                    | Enabled (dormant — no warehouse source yet)   |

---

## Connected tools

| Tool          | Status                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Issues | Selected, no source connected (dormant). User skipped the repo connection step. Responder is armed and will activate once the warehouse source is added. |
| Sentry        | Selected, no source connected (dormant). User skipped credential entry. Responder is armed and will activate once the Sentry source is added.            |

Only the `issues` table would sync for each — more tables can be enabled in the PostHog UI later.

---

## Scout troop

**5 scouts enabled** (daily cadence, 100 runs/day budget, 0 used today).

> Early-access banner: "Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."

### Enabled

| Scout                                    | What it watches                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| signals-scout-general                    | Cross-product correlations and surfaces no specialist covers                           |
| signals-scout-product-analytics          | Saved funnel, retention, and lifecycle insights for conversion or retention regression |
| signals-scout-health-checks              | PostHog setup health issues worth acting on                                            |
| signals-scout-observability-gaps         | Events with significant volume but no insight, dashboard, or alert coverage            |
| signals-scout-onedrive-health _(custom)_ | `document_opened` events for spikes in `cloud-only` OneDrive availability              |

### Disabled

All 23 remaining canonical scouts are disabled. Notable intentional decisions:

| Scout                           | Reason                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| signals-scout-error-tracking    | Covered by the native `error_tracking` signal sources — would duplicate |
| signals-scout-session-replay    | Covered by the native `session_replay` signal source — would duplicate  |
| signals-scout-web-analytics     | Desktop app — no web traffic or page-view routing                       |
| signals-scout-web-vitals        | Desktop app — no `$web_vitals` events                                   |
| signals-scout-ai-observability  | No LLM/AI usage in this project                                         |
| signals-scout-revenue-analytics | No payment SDK detected                                                 |
| signals-scout-feature-flags     | No feature flags in use                                                 |
| signals-scout-experiments       | No A/B experiments                                                      |
| signals-scout-surveys           | No surveys configured                                                   |
| signals-scout-inbox-validation  | Fresh project — no resolved reports to validate yet                     |
| All others                      | Surface not in use on this project                                      |

Enable any of these later from the [Self-driving inbox](https://eu.posthog.com/project/262555/inbox).

---

## Custom scouts

### Created

**`signals-scout-onedrive-health`**

- **Surface**: `document_opened` events with an `onedrive` property that can be `local`, `cloud-only`, or `unknown`. The `cloud-only` state means the file is a Windows Files On-Demand placeholder that hasn't been downloaded — opening it stalls.
- **Discriminator**: share of `document_opened` events where `onedrive = 'cloud-only'` exceeds 20% of all opens in the last 7 days, across ≥2 distinct users.
- **Why no built-in covers it**: No canonical scout watches a desktop app's cloud-storage dependency. The `signals-scout-general` and `signals-scout-product-analytics` scouts watch PostHog's own product surfaces, not application-specific third-party integrations.
- **Noise escape hatch**: if the scout generates too many reports, set `emit: false` on its config in PostHog to switch it to dry-run.

### Considered and ruled out

| Candidate                                                                | Reason not proposed / declined |
| ------------------------------------------------------------------------ | ------------------------------ |
| App daily engagement drop (`app_opened` volume cliff)                    | Declined by user               |
| First-run completion rate (`root_initialised` → `league_created` funnel) | Declined by user               |

---

## Replay Vision scanners

Replay Vision scanners are LLM agents that watch individual session recordings on a schedule and push what they find — broken UI, frustrated users — directly into the Self-driving inbox. Each finding lands at half weight; two independent findings on the same issue are needed before a full report is promoted.

**This project has no recordings yet** — `posthog-js` is not installed in the Electron renderer. Both scanners are armed and will start scanning the day recordings begin, with no second setup.

| Scanner                             | Type                  | What it watches                                                                                                                                  | Query scope                                             | Sampling rate | Monthly credits       |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------- | --------------------- |
| League and season creation failures | Monitor (breakage)    | Visible UI failures: blank sidebar after setup, dialogs that close without effect, document opens that fail silently, ZIP exports with no output | All sessions (single-page Electron app, no URL routing) | 50%           | 0 (no recordings yet) |
| Leagues app navigation frustration  | Monitor (frustration) | Rage-click sessions where users repeatedly hammer unresponsive elements: Create League/Season buttons, folder picker, cloud-only document links  | `$rageclick`-gated                                      | 100%          | 0 (no recordings yet) |

Credit spend sizing: the `creating-replay-vision-scanners` skill was not available on this deploy — spend was not formally verified. At these defaults and with no recordings, current spend is $0.

---

## Follow-ups

- [ ] **Add `posthog-js` to the Electron renderer** to activate Session Replay and Error Tracking. The renderer currently has no PostHog SDK; `posthog-node` in the main process captures product events only. Once `posthog-js` is initialised in the renderer, check that `disable_session_recording` and `capture_exceptions` are not overridden to `false` in the `init` call.
- [ ] **Connect a Support inbound channel** (email / inbox / Slack) in PostHog so Conversations tickets start flowing. [Support settings](https://eu.posthog.com/project/262555/settings/environment-integrations)
- [ ] **Connect GitHub Issues warehouse source** for `harrytwright/electron-leagues`. [New source](https://eu.posthog.com/project/262555/pipeline/new/source)
- [ ] **Connect Sentry credentials** at [https://eu.posthog.com/project/262555/data-warehouse/connect?kind=Sentry](https://eu.posthog.com/project/262555/data-warehouse/connect?kind=Sentry) — then the Sentry responder will start syncing issues automatically.

---

## What happens next

The scout coordinator picks up fresh configs within ~30 minutes. Each enabled scout draws one run from the project's daily budget (100 runs/day default during early access). Findings cluster into reports in the [Self-driving inbox](https://eu.posthog.com/project/262555/inbox); immediately-actionable ones can launch coding tasks automatically.
