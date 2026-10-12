# Harnessy model service

`@harnessy/llm` performs one streamed model request. It never invokes CLI agents,
executes tools, retries, or owns the conversation loop. TS-21b consumes this API.
The design follows the adapter/service/message contracts in DeepSeek Harness
`packages/llm/llm-pi-ai` and `docs/subsystems/llm-streaming.md`.

## Usage

```ts
import {createLlmService} from '@harnessy/llm';
const llm = createLlmService({
  routes: () => ownerSettings.llmProviders(),
  resolveKey: keyRef => keyStore.resolveKey(keyRef),
});
for await (const chunk of llm.stream({
  provider: 'local', model: 'my-model', signal,
  messages: [{role: 'user', content: [{type: 'text', text: 'Hello'}]}],
})) {
  // block-start/deltas/block-end, usage, then exactly one finish.
}
```

`Runtime.llm` creates a service bound to the current project's trace store. Capture
it once for a turn. Configuration is copied at `stream()` invocation. A change
before dispatch produces `route_changed`; it never sends a new key to an old URL.
After dispatch the request owns its copy. Cancelling the signal, or breaking out
of iteration, cancels HTTP. Setup and provider failures end with a typed `finish`;
model-list/configuration/discovery operations throw `LlmError` with a stable code.
Successful finish includes the assistant message and usage. Store that message
(including replay metadata/signatures) and append `role: 'tool'` messages with
`toolCallId`/`toolName` for subsequent calls. Tool arguments are JSON objects.

The service emits `llm.request` and `llm.response` metadata only: request id,
route/model, duration, outcome/code and counts. No prompts, results, URLs, keys,
or provider error bodies. Raw provider errors are used only for classification.
SDK retries are disabled; `retryPolicy()` returns the route policy for the loop.

## Owner configuration

Routes live in owner `llmProviders`, keyed by route id (`[a-z][a-z0-9_-]{0,63}`).
One keychain record belongs to one route: `keyRef`, when present, must equal id.
Keys travel to the Security.framework helper over stdin, never argv/environment.
No CLI credentials, environment API keys or owner configuration files are read.
A missing configured key fails closed. Omitted keyRef means an unauthenticated
endpoint; no fallback to another credential source occurs.

```json
{
  "local": {
    "displayName": "Local gateway",
    "api": "openai-completions",
    "baseURL": "http://127.0.0.1:11434/v1",
    "models": [{"id": "my-model", "contextWindow": 32768, "maxTokens": 4096}],
    "retryPolicy": {"mode": "normal", "maxRetries": 3}
  },
  "anthropic": {"catalog": "anthropic", "keyRef": "anthropic"}
}
```

Catalog providers supply protocol, endpoint and models without network access.
`models` replaces the catalog; `modelOverrides` alters named catalog entries and
cannot coexist with `models`. Route/model `compat` and `reasoningEfforts`, and
route `defaultContextWindow`/`defaultMaxTokens`, are validated before saving.
Explicit custom protocols: OpenAI Completions, OpenAI Responses, Anthropic
Messages. Catalog routes additionally support Mistral
Conversations. OAuth, Bedrock, Vertex and Azure configuration are not expressible
by a key+endpoint route and are refused. Unspecified custom model limits default
to 32768/4096 as configuration defaults, not measured service capabilities.
HTTPS or loopback HTTP only; credentials/query strings in URLs and arbitrary
headers/secret fields are refused. Discovery on custom endpoints is a bounded
GET `/models` (Anthropic `/v1/models`), with no redirects and no inference. It
returns candidates without rewriting the configured models. Missing pagination
is not followed; a response is bounded to 2 MiB and 5000 models.

## HTTP

All doors are owner-only, under `/api/llm/providers`:

- `GET /`: configured routes, resolved models, route revision, catalog ids.
- `GET /catalog/:id`: installed catalog models, no network.
- `GET /:id`: one route and revision.
- `POST /:id {config, revision?}`: create (revision omitted/null), replace (current
  revision required). Different routes merge under the settings-file lock;
  stale same-route writes return `llm_conflict`.
- `POST /:id/check {}`: validate configuration and key presence; explicitly returns
  `checked: "configuration"`, without claiming network authentication.
- `POST /:id/discover {}`: model discovery with the stored key when configured.
- `GET /:id/key`: `{present, mask, updatedAt}` only.
- `POST /:id/key {secret, revision}`: insert/replace key; sets keyRef=id.
- `POST /:id/key/delete {revision}`: remove key, retain keyRef (future calls fail
  closed instead of silently switching to unauthenticated access).
- `POST /:id/delete {revision}`: remove the key, then owner route. A failed
  settings write is reported and may be retried; it never leaves a usable orphan
  credential. General `/api/settings` cannot bypass the route validator.

Successful writes publish `llm.routes` to owner SSE and `onRoutesChanged` listeners.

## Dependency and tests

Pinned `@earendil-works/pi-ai` **1.1.0**, MIT, Node >=22.19.0. Compared with DSH's
0.87.1 line it provides a per-request fetch boundary and normalized transcript
system messages. The boundary permits redirect rejection, exact HTTP status
classification and explicit credential handling without global fetch patches.
No local fork or DSH performance patch is installed. HTTP doubles cover the
three custom wire protocols, tool replay, usage/cache semantics, safe failures,
no implicit retries, cancellation, truncation and route changes. Keychain tests
use doubles; they do not touch the owner's keychain or send live model requests.

Google’s native pi-ai adapter rejects guarded fetch; it is excluded with non-retryable `transport_unsupported`. Configure Google via a custom OpenAI-compatible address (`https://generativelanguage.googleapis.com/v1beta/openai`) and explicit models instead. Custom routes require a nonempty `models` list.

### Owner connection form (TS-21c)

Connections → “Подключить по API” edits an in-memory draft. Keys are held only in the password input and explicit request; closed drafts discard them. Discovery never saves a route, checks catalog entries offline, and calls a custom endpoint only on an owner click. Selected models are required to save. Saved routes appear as `api:<route-id>` groups in the chat model picker.

- `POST /api/llm/providers/discover {id,config,secret?}` validates a draft (models may be empty only here) and returns candidate models. A stored key can be used only with the same catalog, protocol and base URL; otherwise `credential_target_changed`. Redirects are refused.
- `POST /api/llm/providers/:id/save {config,revision,secret?}` validates before writes and checks revision under the owner settings lock. Keys use immutable generation slots: `keyRef` remains the route id; `keyGeneration` is a server-generated UUID. Readers capture both fields with the endpoint and resolve exactly that slot. Save stages a new generation, atomically publishes endpoint + generation under revision/lock, then removes the previous generation. A failed config write removes the unpublished generation and leaves the old config, key and timestamp unchanged. Cleanup failures are typed errors, never silent success.
- The existing key metadata/delete and route delete endpoints handle explicit owner actions. No HTTP response, trace or config includes the key itself.

`discoverDraft` is separate from the runtime service: its allowance for an empty model selection cannot reach settings persistence or model execution.

`resolveKey(ref, generation?)` receives the captured generation. `keySlot(ref, generation)` maps it to the KeyStore account; omitted generation reads legacy TS-21a slots, which HTTP writes never overwrite. The key-only save door uses the same publication path. Key deletion publishes a fresh missing generation (fail closed, new revision), and route deletion removes its captured slot after config publication. Recreating a route uses a new UUID, so an old snapshot cannot alias a new secret. A client may echo the current generation, but cannot choose another one.
