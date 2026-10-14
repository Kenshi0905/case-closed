# Local dialogue for Case Closed

> **Optional self-hosting feature.** The public game's default is scripted and makes no local-model requests. These tools are retained for experimentation. A GitHub clone does not include the original laptop's binaries, weights, credentials or configuration.

## First setup on your own computer

1. Run your own copy of the application and database using [the development guide](../docs/development.md).
2. Obtain a compatible `llama-server` from [llama.cpp](https://github.com/ggml-org/llama.cpp) and a properly licensed Qwen2.5 1.5B Instruct GGUF. The original setup used the Q4_K_M quantization. Verify upstream downloads and their licenses.
3. On Windows, place the runtime and its required DLLs in `.local-ai/runtime/` and the weights at `.local-ai/qwen2.5-1.5b-instruct-q4_k_m.gguf`. These paths are ignored.
4. Configure **your own** server with `CASE_AI_PROVIDER=local` and a strong random `CASE_RELAY_TOKEN`. Never use the public workshop's credentials.
5. Run `powershell -File scripts/configure-local-ai.ps1 -SiteUrl https://your-own-site.example`. Paste the same token at the hidden prompt. The file is encrypted with Windows DPAPI, bound to your Windows account. This helper targets public HTTPS app origins; private Sites may additionally need a service-access credential.
6. Start the Windows launcher below. Then explicitly select **Local AI** in your own facilitator controls. Configuring the server alone does not switch a case to local inference.

The desktop launchers and encrypted configuration helper are Windows-specific. For another OS, adapt the process supervisor and secure secret storage rather than copying DPAPI files. Core relay/model protocol code remains available for that port. The default scripted game works independently of these optional tools.

---

## Original workshop implementation notes

The measurements and hardware below describe the original workshop laptop, not a performance guarantee for a fresh clone.

The workshop can use **Qwen2.5 1.5B Instruct, Q4_K_M** through a portable llama.cpp Vulkan server on this computer. The model is approximately 1.1 GB. This option makes no paid model calls.

The hosted app sends the current question, authoritative answer, current suspect's approved workshop fields/personality, and at most two recent same-suspect turns to an outbound relay. The model selects a natural delivery from a finite personality bank; the application preserves the approved facts unchanged. It processes one request at a time and caches up to 128 responses, keyed by the approved context and intent. Other suspects' secrets and the sealed solution never enter the model prompt.

## Local files

- `.local-ai/runtime/llama-server.exe`: portable local runtime.
- `.local-ai/qwen2.5-1.5b-instruct-q4_k_m.gguf`: downloaded model.
- `.local-ai/relay.secrets`: Windows-protected relay configuration.
- `scripts/local-ai-relay.mjs`: outbound relay, with no external packages required.

The `.local-ai` directory is ignored by version control. Production relay credentials are encrypted with Windows DPAPI for the current Windows account. The relay decrypts them only in memory. It never prints credentials, character prompts, approved answers, or dialogue.

The protected configuration contains `siteUrl`, `relayToken`, and optionally `siteBypassToken`, `localUrl`, and `model`. The default local endpoint is `http://127.0.0.1:8081/v1/chat/completions`; the default model name is `qwen2.5-1.5b-instruct`. Do not save production credentials as plaintext JSON.

## Start and stop

Double-click **Start Local AI.cmd** in the `case-closed` folder from the Windows account used during setup. It reuses a verified running model or starts the GPU model, waits for readiness, then starts the hosted relay. Both helpers run in hidden windows. The launcher confirms startup and can then be closed.

Keep this computer awake and online while live local dialogue is needed. Double-click **Stop Local AI.cmd** after the workshop. It checks each saved process ID against the exact executable and project command before stopping it; a reused or unrelated process is left alone. No startup entry or firewall rule is created.

The model uses Vulkan GPU offload, a 4,096-token context, six CPU threads, and one generation slot. Its local alias is `case-closed-local`. The contextual selector emits only six tokens in the measured requests (16-token cap). The 12-request benchmark accepted all responses: fresh-character requests took **0.65–1.10 seconds**, immediately repeated prompts **0.19–0.28 seconds**, before transport overhead. Actual latency varies with prompt length and GPU load. Run `node scripts/benchmark-local-ai.mjs` to measure again.

Open **View Local AI.cmd** to watch process health, timings, cache hits and fallbacks in a console. Closing that viewer leaves the model running. It prints neither credentials nor character dialogue. Open `http://127.0.0.1:8081/` for the readable model-status page; `/health` supplies the health response. The former homepage 404 came from disabled static UI, not a missing model. The status page checks model readiness only; use the console or facilitator panel to check the hosted relay. Raw runtime logs are under `.local-ai/`. The Windows launchers remain the preferred way to start and stop verified project processes.

For a read-only check from the project folder:

```powershell
powershell -NoProfile -ExecutionPolicy RemoteSigned -File scripts/start-local-ai.ps1 -Check
node scripts/local-ai-relay.mjs --check
```

The launcher `-Check` verifies local files and model health without starting services or decrypting credentials. The relay `--check` loads the protected config and requests model health; it never generates dialogue or contacts the hosted relay. `scripts/start-local-ai.ps1 -ModelOnly` starts or reuses only the local model. `scripts/stop-local-ai.ps1 -Check` verifies process ownership without stopping anything.

The relay also supports `--once` to process at most one queued job and `--config .local-ai/another.secrets` to select another protected configuration inside this project. Plain JSON configurations are accepted only for loopback development Sites without a Site access credential.

No inbound port exposure is required: the relay polls the hosted Site over HTTPS, and llama.cpp listens only on `127.0.0.1:8081`.

## What happens during a question

1. The server selects the facts this character is allowed to say.
2. For evidence questions, the case engine composes three complete replies using the character's approved context, permitted evidence, and knowledge limits. Qwen receives those replies, the question and recent conversation, then selects the best complete answer using a bounded choice index. It no longer merely adds a stock preface to the clue card. Other question types retain the bounded delivery selector. Both use at most 16 output tokens.
3. The relay rejects invalid indices and extra fields. Evidence replies must exactly match a complete candidate from that job; other replies preserve the canonical facts with an optional approved preface. The hosted server validates independently. Old impersonal evidence recordings are accepted only in archived replay, so current games receive the revised character answers.
4. The hosted server validates the result again before displaying it.

The model never receives the sealed solution. It cannot award clues, change votes, move the detective, or change workshop permissions. These actions remain with the application server.

If the model is unavailable, exceeds 6.5 seconds, or produces invalid output, the relay submits the original approved answer with a `scripted` marker. Hosted model waiting is capped at eight seconds. The same intent and personality planner answers when the relay is disconnected; it does not depend on a model or embedding download.

This is prompt/runtime tuning, not a model-weight fine-tune. The bounded question domain uses keyword, typo and phrase matching to distinguish time, witness, alibi, guilt and evidence intents. A second embedding model was not added to the laptop or public client. The implementation uses llama.cpp's documented [prompt caching and schema-constrained output](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md). [Sentence-transformer semantic search](https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html) remains an optional future approach for a substantially wider question domain; it is not required for this game's offline fallback.

## Recorded workshop and replay

Accepted workshop dialogue is recorded by the hosted application. Published replay uses the recorded exchanges, so visitors can revisit the workshop without keeping this computer or its local model running. Recording and replay stay in the application database; the relay cache is temporary and is cleared when the relay stops.

## Offline opening possibilities

The case briefing retains atmospheric variation from a shipped bank. The opening itself uses concise authored actions and consequences, without distracting atmospheric footnotes. Each entry records its scene slot and whether it was authored (`curated`) or actually generated on this computer (`local-qwen`). The 120 authored entries provide a complete fallback; accepted local generations add visual variety. The case engine owns the actions, five clues, identities, death at 21:17, and alarm at 21:19. Atmospheric text cannot change those facts.

With the local model running, generate another small cycle from the project folder:

```powershell
node scripts/generate-story-bank.mjs --batches 6
node --test tests/story-bank-generation.test.mjs
```

Generation is serial and restricted to a loopback endpoint. Each request proposes four short fragments, which pass length, name, time, action, unsupported-detail, and duplicate checks. Review newly accepted sentences before publishing. The deployable result is `app/lib/story-bank.generated.json`; raw proposals and rejected candidates remain in the ignored `.local-ai/story-bank-generation/` folder. `--dry-run` revalidates the existing bank and reports actual counts without making model calls.

The reported combination count multiplies the available choices across the six scene slots. It describes possible atmospheric sequences, not distinct murder solutions. The hosted app makes no model calls to select this content, and each workshop retains its selected sequence for replay.

## Diagnostics

Logs and process records are saved in `.local-ai/`: `server.stdout.log`, `server.stderr.log`, `relay.stdout.log`, `relay.stderr.log`, `server.pid`, and `relay.pid`.

Relay logs contain operational events, latency, and token counts where available. They contain no conversation contents or credentials. Common events include `local_response`, `local_cache_hit`, `scripted_fallback`, `relay_retry`, and `job_expired`.

- Failed health check: start the local model and wait for it to finish loading.
- Relay access rejected: refresh the protected configuration using the configured Windows account.
- Repeated scripted fallback: inspect model health and generation speed; the workshop can continue with its scripted case engine.
- Expired job: the server already stopped waiting; the relay discards the late result and continues.

Vulkan acceleration depends on the installed graphics driver. The actual measured latency on this computer is the useful performance measure; model size alone does not guarantee a particular response time.
