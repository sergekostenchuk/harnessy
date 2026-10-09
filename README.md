# Harnessy

The owner's window over a team of AI agents: roles (seats) with their own instructions, a shared exchange journal with delivery cursors, an exchange policy, context hand-off between agents, and the owner's veto on everything that has consequences. One repository, three parts:

- **`packages/`** — the new core in TypeScript (Node 22, strict TS, tests next to the code): `providers`, `journal`, `team`, `projects`, `context`, `runtime` merged; `api` is next. See `packages/README.md` for the rules and the module map.
- **`core/`** — the Python engine (aiohttp, `127.0.0.1:3777`) that still runs the product today and serves as the behaviour specification until release 0.1; it is removed in one commit after the switch (tag `mvp-python` marks the state before the rewrite).
- **`ui/`** — the window: design code and screen sketches (`ui/sketches/disarto`), the prototype with the live layer (`ui/deploy`), and the Electron shell (`ui/desktop`). The window is kept as is; the core must serve the same HTTP/SSE contract.

Русская версия: [README.ru.md](README.ru.md).

## Run (today)

```bash
~/Harnessy/core/run.sh          # engine on 127.0.0.1:3777 (needs `claude login` and a Codex login)
~/Harnessy/ui/desktop/run.sh    # Electron window; it starts the engine itself if the port is silent
npm test                        # new core: strict build of all packages + tests (376 as of 2026-10-09)
```

## Six architecture questions

Status marks: **[code]** — merged into `main` and covered by tests; **[contract]** — agreed in `packages/tasks/TS-0N.md`, implementation in progress.

### 1. Is there a single source of truth for project state?

**Yes: the project folder.** Everything about a project lives in `<project>/.harness/` as plain files, the same formats for the Python engine and the new core **[code]**:

| file | holds |
|---|---|
| `team.yaml`, `roles/*.md` | seats, their vendor/model/mode, role instructions and specializations |
| `comms-policy.yaml` | who may write to whom, which kinds, triggers, who may observe whom |
| `state/channel.ndjson` | the exchange journal: append-only, first record is the protocol, `fsync` on every append |
| `state/cursors.json` | per-seat delivery cursors (what each seat has already received) |
| `state/chats.json`, `state/panes.json` | chats with full text and the seats' provider sessions/settings |
| `state/halt.json`, `state/attempts.json`, `state/seat-materialization.json`, `state/ack-events.json` | the owner's stop switch and the durable receipts of unfinished operations (see 2) |
| `MEMORY.md`, `evidence/` | project memory read into role briefings; review and test reports |

Process memory is a cache of these files: the runtime rebuilds panes, chats, cursors, pending owner confirmations and unfinished operations from them on every open. Models remember through their own provider sessions; the core stores only the session identifiers. Owner-level preferences (settings, pins, known projects, connection routes) live in `~/.harness-*.json`, outside any project. There is no database.

### 2. How are unfinished operations saved and restored?

**Durable intent before the effect, durable receipt after it, and "uncertain" is a first-class state** **[code]** for turns and role assignments, **[contract]** for owner confirmations and merges (TS-04c):

- **A model turn.** Before the provider is called, the runtime writes an *attempt* (`attempts.json`: turn id, journal records delivered, start time). After the provider answers, the answer is written into the chat as a result record carrying `deliverySeq` and a receipt (`runtime: {turnInstanceId, recordSeqs, effectsPending, interrupted, nextSeen}`), then the journal cursor advances, then after-turn effects run, then the seat is saved, and only then the receipt is marked complete. On reopen the runtime finishes whatever stage was cut, **without calling the model again**.
- **Failure after the model may have acted** (transport lost, process crash, project closed) leaves the attempt as `uncertain`: the queue is not advanced, the seat is blocked for automatic re-delivery, the owner sees a note, and only the owner's next action to that seat releases it. Two restarts in a row or a message from another agent do not re-run the model.
- **A role assignment** is an operation record (`seat-materialization.json`) written before the first effect with the full normalized input (role, vendor, model, mode, specialization, chosen instructions, expected seat file) and stage marks (team, seat file, chat, status, briefing). A repeat completes only the missing stages, accepts only its own seat file, never duplicates the briefing and never guesses the initiator.
- **Owner confirmations and merges (TS-04c, contract).** A merge intent (original HEAD, full SHA, branch, chosen verdict, initiator) is written under the git lock before git is touched; after a restart it is compared with git: a proven merge gets its result and status, an ambiguous one becomes a typed uncertain state with no automatic re-merge. A recorded owner decision on a confirmation card is finished as recorded, never re-chosen.
- Journal write failures are recoverable: a truncated last line never swallows the next record, and owner-ack decisions are published through `ack-events.json` so a repeat does not deliver twice.

### 3. Where are the boundaries of an agent's authority?

- **Policy** (`comms-policy.yaml`): routes define which seat may send which kinds to whom; `observe` defines whose chats a role may read; records that require the owner's confirmation wait with `ack: pending` until the owner allows or rejects them **[code]**.
- **Turn scope** **[code]**: every turn gets an immutable `TurnScope {projectDir, seatId, turnInstanceId}`; the agent's tools are closed over it and refuse with `turn_ended` once the turn is over, cancelled or the project changed. The sender is never taken from tool arguments.
- **Process tokens** **[code]**: a Codex process gets a per-process secret; the HTTP bridge maps token → seat → active scope and rejects foreign or revoked tokens (`token_invalid`) and idle processes (`turn_ended`); the scope is re-checked right before each protected effect, after all awaits.
- **Mandate** **[code]**: an orchestrator may create a seat only inside a turn that started from the owner's own record, taken from an immutable snapshot of the turn's records.
- **Permissions and files** **[code]**: a seat's mode (chat / read / check / web / ask / edit / all) is mapped to the provider's canonical permission set; writable roots are the project root or the seat's own worktree; risky actions raise an approval card to the owner.
- **Merging** **[code]/[contract]**: only roles listed in `mergeRoles` and the owner, only a SHA with an accepted verdict, only on the integration branch with a clean tree.
- **The owner's switch** **[code]**: `halt` interrupts running turns and holds every queue; only the owner can lift it.

### 4. How are actions with external consequences separated from text generation?

The model produces text and events; it does not touch the world directly.

- **Through the core only.** Sending to another seat, asking it, reading its chat, assigning a role and merging exist solely as tools that the core implements (`PeerTools` → `RuntimeActions`). Each goes through the journal's policy checks and the owner-confirmation gate, and re-validates the turn scope immediately before the effect **[code]** (merge and ask arrive with TS-04c **[contract]**).
- **Provider-side effects** (edits, commands) are governed by the provider's permission mode and sandbox chosen from the seat's mode, by writable roots, and by approval cards the owner answers in the window **[code]**.
- **Receipts, not retries.** Because external actions are not idempotent, the core never re-runs a turn whose outcome is unknown (see 2). A result that was received but whose local bookkeeping failed is kept and completed; a result that may have happened is left to the owner.
- **Hand-off carries text only.** When a conversation moves between seats or projects, only the text and its metadata move; execution receipts stay with the seat that produced them **[code]**.

### 5. Can a provider be replaced without changing the runtime?

**Yes.** The runtime depends on one interface, `Provider` in `@harnessy/providers`: `runTurn(seat, message, ctx)`, `listSessions`, `sessionMessages`, `auth`, `models`, `reset`, `close`, with a `TurnContext` the runtime supplies (abort signal, event publisher, approval callback, session and handle callbacks, proxy environment, role note, peers, tools, process-token registry, writable roots, `modelStarted`). Two implementations exist — Claude through the Agent SDK and Codex through its app-server JSON-RPC — and the runtime's own tests run on a fake provider through the same interface. Providers are injected as `RuntimeDeps.providers[vendor]` **[code]**. Other models (Qwen, DeepSeek, GLM, Kimi, Ollama) already reach seats through Codex's local provider router without any core change. Adding a third first-class vendor means implementing the interface, registering it in the dependencies and extending the `Vendor` union and model catalog; the turn, queue and recovery logic stay untouched. A fallback Codex transport over `@openai/codex-sdk` is planned for 0.2 behind the same interface.

### 6. How is the desktop shell connected to the backend and the packages?

- **Electron is a thin shell** (`ui/desktop`): `main.js` opens `http://localhost:3777/sketches/proto/10-new-chat.html`, checks `/api/status`, and if the port is silent starts the engine itself (`run.sh`) and waits. The renderer runs with context isolation and no Node; the only native bridge is `window.harnessy.pickFolder` (preload) for the Finder folder picker **[code]**.
- **The window is a web app** served by the engine itself from `ui/deploy/out/site` under `/sketches`: the live layer (`live.js`, `cx.js`, `ctx.js`, `set.js`, `conn.js`) talks to the engine over HTTP and SSE (`/api/events`) on `127.0.0.1:3777`. Requests are protected by Host/Origin/`Sec-Fetch-Site`/Content-Type checks so a foreign page in the browser cannot drive the engine **[code]**.
- **Backend = packages.** Today the engine is `core/` (Python). The `api` package (TS-05, **[contract]**) reproduces the same routes and JSON forms byte for byte on top of `runtime`, `projects` and `journal`, and `core/run.sh` becomes a shim that starts the Node entry point, so neither the window nor Electron changes when the core switches (TS-06).

## Roadmap: publishing projects and connecting models

Harnessy plans to embed two infrastructure services: **deployment** of applications to servers and managed proxy connectivity to AI providers. In the module map (`packages/README.md`) these are the `network` package (release 0.2: network routes, proxy/VPN, mandatory routing, egress diagnostics) and the `infra` package (release 0.6: partners, VPS, deployment).

### Publishing projects

The user will pick a server, a configuration and a location, see the price and start publishing with one button. Harnessy will create or attach a VPS, prepare the environment, deploy the application, set up the address and HTTPS, verify that it works and show the URL. Later publications will update the application without creating a new server.

Recommended implementation:
- The VPS provider's API — to create and manage the server.
- Coolify — as the execution layer for publishing behind Harnessy's own interface; it provides an API and tooling for managing servers and deployments [1][2].
- For the MVP — one provider, a Git repository with a Dockerfile, and the user's own account. Selling infrastructure inside Harnessy can be added later through a reseller programme.

### Proxy traffic for models

The user will be able to enable a proxy separately for a chosen AI provider, pick the exit country and set a spending limit. Routing will affect only the required connections, not all Harnessy traffic. (The groundwork exists: per-provider routes, egress checks and expected-IP verification live in the `projects` package and on the "Connections" screen.)

Recommended implementation:
- A partner Reseller API — to issue separate accesses to users, cap traffic and collect statistics. DataImpulse and NSTData describe such capabilities [3][4].
- ISP/static or residential sticky — the primary options for testing; mobile — an additional mode when needed.
- Master partner keys stay on the backend; the user receives a limited access.
- Before enabling, the exit IP, country and health of the chosen service are checked. On failure the route never silently falls back to a direct connection.

### Common principles

Paid actions require explicit confirmation. Harnessy persists the state of operations, shows progress and errors, prevents buying a resource twice, and keeps "delete the application" separate from "delete the server".

Model access, proxy traffic and server infrastructure are accounted separately. Choosing an exit country is not presented as a guarantee of access to an AI service; compatibility and acceptable use are verified per provider.

Sources:
[1] List | Coolify Docs — https://coolify.io/docs/api/endpoints/resources/list-resources
[2] coollabsio/coolify-cli — https://github.com/coollabsio/coolify-cli
[3] Reseller API — managing sub-users and traffic — DataImpulse — https://help.dataimpulse.com/en/articles/15931714-reseller-api-managing-sub-users-and-traffic
[4] Proxy Reseller Program — White Label Proxy Solutions — https://www.nstdata.io/resell
[5] VPS providers with partner APIs — https://www.perplexity.ai/search/80ea31d4-d563-4a34-ae4c-78bbee15e87d

## Where to look

- `packages/README.md` — rules of the new core, storage principle, module map, the main acceptance scenario (our own team's work reproduced inside Harnessy).
- `packages/tasks/TS-0N.md` — the outcome tables and contracts each package was built against.
- `core/app/server.py` — the Python engine: the behaviour the new core reproduces.
