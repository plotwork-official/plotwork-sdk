# Workflows

CI for every change, and publishing with trusted publishing: to npm under `@plotwork.official`, and to PyPI as `plotwork`.

## Standards

Workflows here follow:

- [Supply-chain provenance](../../.standards/docs/standards/core/supply-chain-provenance.md) - packages are built and published in CI, never from a laptop, with an npm provenance statement or a PyPI attestation
- [Dependencies](../../.standards/docs/standards/core/dependencies.md) - actions pinned to a commit, a frozen lockfile, no install scripts

## Contents

| Path | Purpose |
|---|---|
| `ci.yml` | On a pull request and a push to `main`: install, audit, `pnpm check`, build, and pack every package; for each app in `examples/`, install it from its lockfile with the packed packages swapped in, type check and build it; and, on Python 3.10 and 3.13, test, type check and build the Python package, failing if its wheel declares a `Requires-Dist`. |
| `publish.yml` | On a tag `<package folder>-v<version>` (`viewer-v0.1.0`): checks the tag against the package's version, runs `pnpm check`, builds, and publishes with OIDC. A version with a `-` (`0.2.0-beta.1`) goes to the `next` dist-tag, any other to `latest`. Tags `python-v*` are left to `publish-python.yml`. |
| `publish-python.yml` | On a tag `python-v<version>` (`python-v0.1.0`): checks the tag against `python/pyproject.toml` and `_version.py`, tests, type checks and builds on Python 3.12, then a second job in the environment `pypi` publishes the built files with OIDC and PEP 740 attestations. |

## Publishing a package

| Step | Who | What |
|---|---|---|
| 1 | Owner, once | In GitHub, add the environment `npm` to this repository (add required reviewers to approve each publish). |
| 2 | Owner, once a package | On npmjs.com, in the package's settings under the `plotwork.official` organisation, add a trusted publisher: GitHub Actions, organisation `plotwork-official`, repository `plotwork-sdk`, workflow `publish.yml`, environment `npm`. If npm offers this only for a package that exists, publish the first version once by hand and set the trusted publisher straight after. |
| 3 | Anyone with push | Set `version` in the package's `package.json`, merge, then push the tag: `git tag viewer-v0.1.0 && git push origin viewer-v0.1.0` (`vite-v...`, `sdk-v...` for the others). |
| 4 | Owner, if asked | npm may hold a version in **Staged Packages** of the `plotwork.official` organisation until it is approved; the run succeeds, but the version is not served until then. |
| 5 | Owner, after the first trusted publish | In the package's settings on npm, require two-factor authentication and disallow tokens, so only this workflow can publish. |

## Publishing the Python package

| Step | Who | What |
|---|---|---|
| 1 | Owner, once | In GitHub, add the environment `pypi` to this repository (add required reviewers to approve each publish). |
| 2 | Owner, once (done) | On PyPI, the trusted publisher for the project `plotwork`: GitHub Actions, owner `plotwork-official`, repository `plotwork-sdk`, workflow `publish-python.yml`, environment `pypi`. A pending publisher creates the project on the first publish. |
| 3 | Anyone with push | Set `version` in `python/pyproject.toml` and `__version__` in `python/src/plotwork/_version.py` (a test holds them equal), merge, then push the tag: `git tag python-v0.1.0 && git push origin python-v0.1.0`. |
| 4 | Anyone | Check the release: the files on PyPI show their attestation under **Provenance**, and `python python/smoke.py` with `PLOTWORK_BASE_URL` and `PLOTWORK_API_KEY` runs the installed package against a real deployment. |
| 5 | Owner, after the first trusted publish | In the project's settings on PyPI, keep two-factor authentication on for every owner and create no API token, so only this workflow can publish. |
