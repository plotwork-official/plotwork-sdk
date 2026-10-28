# Workflows

CI for every change, and publishing to npm under `@plotwork.official` with trusted publishing.

## Standards

Workflows here follow:

- [Supply-chain provenance](../../.standards/docs/standards/core/supply-chain-provenance.md) - packages are built and published in CI, never from a laptop, with an npm provenance statement
- [Dependencies](../../.standards/docs/standards/core/dependencies.md) - actions pinned to a commit, a frozen lockfile, no install scripts

## Contents

| Path | Purpose |
|---|---|
| `ci.yml` | On a pull request and a push to `main`: install, audit, `pnpm check`, build, and pack every package. |
| `publish.yml` | On a tag `<package folder>-v<version>` (`viewer-v0.1.0`): checks the tag against the package's version, runs `pnpm check`, builds, and publishes with OIDC. A version with a `-` (`0.2.0-beta.1`) goes to the `next` dist-tag, any other to `latest`. |

## Publishing a package

| Step | Who | What |
|---|---|---|
| 1 | Owner, once | In GitHub, add the environment `npm` to this repository (add required reviewers to approve each publish). |
| 2 | Owner, once a package | On npmjs.com, in the package's settings under the `plotwork.official` organisation, add a trusted publisher: GitHub Actions, organisation `plotwork-official`, repository `plotwork-sdk`, workflow `publish.yml`, environment `npm`. If npm offers this only for a package that exists, publish the first version once by hand and set the trusted publisher straight after. |
| 3 | Anyone with push | Set `version` in the package's `package.json`, merge, then push the tag: `git tag viewer-v0.1.0 && git push origin viewer-v0.1.0`. |
| 4 | Owner, after the first trusted publish | In the package's settings on npm, require two-factor authentication and disallow tokens, so only this workflow can publish. |
