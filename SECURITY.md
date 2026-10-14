# Security and private data

Do not attach credentials, live rosters, session cookies, character submissions or database exports to a public issue. Report a suspected vulnerability through this repository's private **Report a vulnerability** feature when enabled. If it is unavailable, contact the maintainer without including exploit details in a public thread.

The repository contains source, assets and synthetic tests. It intentionally excludes `.dev.vars`, real `.env` files, `.local-ai`, protected relay settings, model weights, local databases, runtime logs and live conversation archives. The public repository starts with a clean release history rather than copying development history.

Facilitators require a verified identity from the Sites gateway. Participant email entry is roster self-identification, **not verification of mailbox ownership**. The reserved `testuser@gmail.com` identity creates an isolated practice game and never grants host authority.

If deploying outside Sites, replace the trusted identity integration. Never expose a Worker that trusts caller-supplied `oai-authenticated-user-*` headers directly to the Internet. Loopback mock sign-in must remain local-only.

Optional local AI requires a server-side relay secret and explicit configuration. Its monitor binds to loopback. Never copy the original workshop's `.local-ai/relay.secrets`, expose the model port publicly, or include model logs in a release.

Deterministic dialogue limits the information a response can use; it is not a universal security guarantee. Keep dependencies updated and review authorization, serialization and replay boundaries when changing the game.
