# Releases

Pushing a version tag such as `v0.2.1` starts `.github/workflows/release.yml`.
The tag must match `package.json` and point to a commit on `main`. The workflow
installs from `pnpm-lock.yaml`, builds the bundled app and runtime, runs portable
and real-browser tests, and packs that verified build. It publishes the tarball
to npm with provenance, then creates a GitHub Release with generated notes and
the same tarball attached. Stable versions use npm's `latest` tag; prerelease
versions use `next` and are marked as GitHub prereleases.

## One-time npm setup

In [the package settings](https://www.npmjs.com/package/picasso-studio/access),
add a **GitHub Actions** trusted publisher:

| Setting | Value |
| --- | --- |
| Organization or user | `mehdishahdoost` |
| Repository | `picasso-studio` |
| Workflow filename | `release.yml` |
| Environment | Leave empty |
| Allowed actions | Enable direct publishing with `npm publish` |

The workflow uses Node 24 and OIDC (`id-token: write`); no `NPM_TOKEN` secret is
needed. Configure the publisher shortly before the first automated release:
new configurations must complete their first successful publish within two days.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Publish a new version

1. Update `package.json` to a new version on a branch, for example with
   `npm version 0.2.1 --no-git-tag-version`. Include any release documentation
   changes in the PR and merge it after CI passes.
2. From the updated `main` branch, tag the release and push the tag:

   ```bash
   git switch main
   git pull --ff-only origin main
   git tag v0.2.1
   git push origin v0.2.1
   ```

3. Watch **Release and publish** in GitHub Actions. Verify the npm package version
   and the GitHub Release after it completes.

Version `0.2.0` was published manually before this workflow existed. Start with a
new version; npm versions cannot be overwritten. This workflow does not bump
versions, merge PRs, or push release tags automatically.

## Validation and recovery

`.github/workflows/ci.yml` runs on PRs and pushes to `main`. Both workflows use
`npm run test:ci`, which includes browser, SDK, installer and protocol coverage.
It excludes `test/harness-config.test.ts` because that check needs local Codex,
Claude and Devin CLI installations. `npm test` still runs that check locally;
CI is not proof of full model-driven compatibility with those harnesses.

If a run stops after npm publication, rerun it. The workflow accepts an already
published version only if its registry integrity matches the newly packed
artifact, then retries the GitHub Release and asset upload. A conflicting version
fails with a request to bump the version. Registry authentication or availability
errors also stop the release rather than being treated as a missing version.
