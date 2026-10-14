# Development and hosting

## Local practice game

Use Node.js **22.13 or newer** (Node 24 is used in CI), npm and Git. The project is React + TypeScript using Vinext/Vite and a Cloudflare Worker with D1. It is not a static HTML export and does not require a model API key.

```sh
git clone https://github.com/Kenshi0905/case-closed.git
cd case-closed
npm run install:ci
npm run build
```

Copy `.env.example` to `.dev.vars` if you need local settings. The default reply engine is scripted. Keep the latter file ignored.

On a **new, empty local database only**, apply the two migrations in this order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_spooky_gunslinger.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_melodic_senator_kelly.sql
npm run dev
```

Open the printed loopback URL (normally `http://127.0.0.1:5173`) and click **PLAY CASE CLOSED**. The public solo route needs no login, creates an isolated case, and goes straight from the opening into investigation. Its HttpOnly session cookie expires after 24 hours.

To exercise the retained workshop flow, use `?workshop=1` and enter `testuser@gmail.com`. This reserved test identity is not a Gmail account and has no facilitator powers. Its six-minute writing stage is intentional.

The migrations are not a reset command. Do not rerun the CREATE TABLE migrations on an initialized database. Local `.wrangler` data is separate from the hosted workshop.

## Hosting a workshop

The reference site uses Sites for deployment, trusted organizer identity and D1. Source changes do not upload local rosters or save files. Forks must provision their **own** hosting project and database; the GitHub export omits the original Site's project identity.

1. Configure your two organizer emails in `app/lib/facilitator-emails.ts`. The original organizer identifiers remain in the source for the reference deployment; they are not credentials.
2. Set `CASE_OWNER_EMAIL` to the primary verified organizer. Owner configuration alone does not replace the two-seat application allowlist.
3. Provision the `DB` D1 binding and apply the schema to the new database.
4. Keep `CASE_AI_PROVIDER=scripted` for the standard game. No relay token is needed for scripted play.
5. Use the installed Sites workflow to register the fork, package the source and deploy. Do not reuse the reference game's project or data.

For local facilitator development, set the first allowlist entry and local `CASE_OWNER_EMAIL` to the starter's loopback-only mock identity, `seedy@sites.test`. Choose a synthetic second seat. Restore real identities for your hosted project. Do not weaken production authentication to make local testing easier.

**Other hosts:** this is a Worker/D1 application with trusted gateway identity. A static GitHub Pages or ordinary Vercel upload is insufficient. Port storage and verified identity before changing hosting. In particular, never trust publicly supplied `oai-authenticated-user-*` request headers without a gateway that verifies and replaces them. See [security notes](../SECURITY.md).

## Checks

```sh
npm test
npm run typecheck
npm run check:public
npm run build
```

Tests use synthetic data. `tests/integration.mjs` and `tests/private-playthrough.mjs` are additional localhost HTTP fixtures; read their prerequisites before running them. Unit test success is not evidence of a 50-browser load test. Do not point write-capable test fixtures at the public workshop.

## Source map

| Path | Responsibility |
| --- | --- |
| `app/page.tsx`, `app/components/` | Login, tutorials, opening, map, dialogue, facilitator controls and ballot |
| `app/lib/server/engine.ts` | Case state, roles, phase gates, movement, evidence and disclosure |
| `app/lib/server/dialogue.ts` | Grounded response planning, approved-account retrieval and tone |
| `app/lib/server/semantic-intents.ts` | Transparent phrase/keyword intent classifier |
| `app/lib/server/store.ts` | D1 persistence, sessions, optional relay and response routing |
| `app/lib/server/story.ts`, `app/lib/story-bank*` | Frozen opening choices and compatible story fragments |
| `app/api/` | Server endpoints |
| `public/assets/` | Original generated portraits and historical opening illustrations |
| `drizzle/`, `db/` | Database schema and migrations |
| `build/`, `scripts/` | Sites integration, build tools and optional model tooling |
| `tests/` | Deterministic tests and local integration fixtures |

## Optional local model

See [the optional Qwen guide](../local-ai/README.md). Server configuration must allow local inference **and** the facilitator must explicitly select it. Leaving a local process running does not activate it. Existing stored local-mode choices cannot override a server configured as scripted.

No paid API, embedding service or sentence-transformer package is required. Runtime dialogue is not a weight fine-tune. Inference failures fall back to the same grounded scripted answer.
