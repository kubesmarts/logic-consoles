# OWS DSL Schema

Bundled schema for monaco-yaml DSL validation in the authoring workspace (E1).

## workflow-dsl-1.0.0.yaml

- **Source**: https://github.com/open-workflow-specification/specification/blob/main/schema/workflow.yaml
- **Revision**: main branch @ 2026-11-20
- **Schema ID**: https://open-workflow-specification.org/schemas/1.1.0/workflow.yaml
- **JSON Schema Version**: draft/2020-12
- **DSL Version**: 1.0.0

This schema is loaded at runtime by `src/editors/monaco-setup.ts` and provides:
- Schema completion (Ctrl+Space in YAML editor)
- Hover help for DSL properties
- Live validation with inline diagnostics

The schema is pinned offline so GitHub availability cannot interrupt authoring. Update this
file when upgrading to a newer OWS release.
