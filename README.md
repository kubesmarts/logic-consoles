# Logic Consoles

The Authoring Console is the web interface for managing Logic Operator resources, publishing workflows, and running deployed versions.

- [Run the Authoring Console locally](authoring-console/docs/connect-kind.md)
- [Authoring Console documentation on GitHub Pages](https://kubesmarts.org/logic-consoles/)
- [Documentation sources](docs/antora/modules/ROOT/pages/index.adoc)

## Build and preview the documentation

From the repository root, run `make docs` to build the Antora site with Node.js 24. To build and preview it with Python 3, run:

```sh
make docs-serve
```

Open [the local documentation](http://127.0.0.1:8000/). To choose a different port, use `make docs-serve DOCS_PORT=8001`. Stop the server with Ctrl+C.

Edit pages in `docs/antora/modules/ROOT/pages` and register new pages in `docs/antora/modules/ROOT/nav.adoc`. While the server is running, run `make docs` in another terminal and refresh the browser. The first build installs dependencies and downloads the shared Antora UI bundle.

## Continuous integration

The **Authoring Console CI** workflow runs on every pull request and on pushes to `main`. It lints, type-checks, runs the unit tests, builds the console, and runs the Playwright browser tests on Node 24. The `ci-ok` job summarizes the result. Mark `ci-ok` as the required status check in the repository's branch protection or ruleset settings.

To run the same checks locally from `authoring-console/`, use `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e`.

## Release the Authoring Console

Run the **Release Authoring Console** workflow from `main` and enter the version, for example `2.0.0-Alpha4`. Versions follow the Logic Operator release train. The workflow checks that the version is valid SemVer and that the `v<version>` tag doesn't exist. It then runs the CI checks, builds the launcher executables and creates the tag and the GitHub release with generated notes. A version with a prerelease suffix is published as a prerelease. Group the generated notes with pull request labels, configured in `.github/release.yml`. Nothing is committed: the version is injected at build time through `CONSOLE_VERSION`.

Each release publishes these assets:

| Asset | Platform |
|---|---|
| `authoring-console-<version>-linux-x64.tar.gz` | Linux x86-64 |
| `authoring-console-<version>-linux-arm64.tar.gz` | Linux arm64 |
| `authoring-console-<version>-darwin-arm64.tar.gz` | macOS on Apple silicon |
| `SHA256SUMS` | Checksums for the archives |

Each archive contains one `authoring-console` executable built with [Node.js single executable applications](https://nodejs.org/api/single-executable-applications.html). It embeds the Node.js runtime, the launcher and the web bundle, so Node.js isn't needed on the user's machine. Download it, verify it with `sha256sum -c SHA256SUMS` (`shasum -a 256 -c SHA256SUMS` on macOS), extract it and run `./authoring-console`. Use `--version` to print its version. The macOS executable is ad-hoc signed, not notarized. If Gatekeeper blocks a browser download, run `xattr -d com.apple.quarantine authoring-console`.

To build an executable locally with Node 24, run these commands from `authoring-console/`. The result is in `dist-sea/` and targets the platform you build on.

```sh
npm ci
CONSOLE_VERSION=2.0.0-Alpha4 npm run build
CONSOLE_VERSION=2.0.0-Alpha4 npm run build:sea
```

## Publish the documentation

Select **GitHub Actions** under the repository's **Settings → Pages → Build and deployment → Source**. Documentation pull requests build the site for validation. After merge, documentation changes on `main` publish the generated site through the `github-pages` environment. The **Build and deploy console documentation** workflow can also be dispatched manually on `main`.
