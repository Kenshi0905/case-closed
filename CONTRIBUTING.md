# Contributing

Start with the [local setup](docs/development.md), then use a branch and a pull request. Keep visual changes consistent with the navy, teal and parchment game palette.

Before opening a PR:

```sh
npm test
npm run typecheck
npm run check:public
npm run build
```

For dialogue changes, include the exact question, approved character fields, inspected evidence and expected answer. Test all six characters. A fluent response must not invent a witness, reveal an unearned secret, identify the culprit prematurely or confuse a personal recollection with a public record.

Use synthetic players and a private local case. Do not run destructive fixtures against the public workshop. Do not commit credentials, participant data, screenshots of private submissions or downloaded model binaries.

Contributions are submitted under the repository's MIT license, subject to the third-party notices. New media must have a documented source and redistribution permission. Do not contribute commercial game assets or copied music.
