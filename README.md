# Logic Consoles

The Authoring Console is the web interface for managing Logic Operator resources, publishing workflows, and running deployed versions.

- [Run the Authoring Console locally](authoring-console/docs/connect-kind.md)
- [Authoring Console documentation on GitHub Pages](https://kubesmarts.org/logic-consoles/)
- [Documentation sources](docs/antora/modules/ROOT/pages/index.adoc)

## Build and preview the documentation

From the repository root, use Node.js 24 to build the Antora site:

```sh
cd docs/antora
npm ci
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory target/generated-docs
```

Open [the local documentation](http://127.0.0.1:8000/). Edit AsciiDoc pages in `modules/ROOT/pages`, register new pages in `modules/ROOT/nav.adoc`, and rebuild to preview changes. The first build downloads the shared Antora UI bundle.

## Publish the documentation

Select **GitHub Actions** under the repository's **Settings → Pages → Build and deployment → Source**. Documentation pull requests build the site for validation. After merge, documentation changes on `main` publish the generated site through the `github-pages` environment. The **Build and deploy console documentation** workflow can also be dispatched manually on `main`.
