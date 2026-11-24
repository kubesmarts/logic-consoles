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

## Publish the documentation

Select **GitHub Actions** under the repository's **Settings → Pages → Build and deployment → Source**. Documentation pull requests build the site for validation. After merge, documentation changes on `main` publish the generated site through the `github-pages` environment. The **Build and deploy console documentation** workflow can also be dispatched manually on `main`.
