/**
 * Authoring examples catalog — pinned from open-workflow-specification/specification
 * @ main branch (retrieved 2026-11-20).
 *
 * Each example retains its upstream license (Apache 2.0), source link, and labeled
 * prerequisites. Load with the app (offline) so GitHub availability cannot interrupt
 * authoring. Copying an example produces an independent editable draft.
 *
 * License: Apache 2.0
 * Source: https://github.com/open-workflow-specification/specification/tree/main/examples
 */

export interface WorkflowExample {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Apache 2.0 for all OWS examples */
  readonly license: string;
  readonly sourceUrl: string;
  /** External service or credential prerequisites (empty if self-contained) */
  readonly prerequisites: readonly string[];
  /** The portable workflow YAML as a string */
  readonly yaml: string;
}

/**
 * Hello World — the minimal self-contained example for onboarding.
 */
const helloWorldExample: WorkflowExample = {
  id: "hello-world",
  title: "Hello World",
  description: "Minimal self-contained workflow that sets a greeting message",
  license: "Apache 2.0",
  sourceUrl: "https://github.com/open-workflow-specification/specification/blob/main/examples/hello-world.yaml",
  prerequisites: [],
  yaml: `document:
  dsl: '1.0.0'
  namespace: default
  name: hello-world
  version: '1.0.0'
do:
  - greet:
      set:
        message: "Hello, world!"
`,
};

/**
 * Greeting with input — demonstrates workflow input handling.
 */
const greetingWithInputExample: WorkflowExample = {
  id: "greeting-with-input",
  title: "Greeting with Input",
  description: "Workflow that accepts a name input and returns a personalized greeting",
  license: "Apache 2.0",
  sourceUrl: "https://github.com/open-workflow-specification/specification/blob/main/examples/",
  prerequisites: [],
  yaml: `document:
  dsl: '1.0.0'
  namespace: default
  name: greeting
  version: '1.0.0'
input:
  schema:
    document:
      type: object
      properties:
        name:
          type: string
          description: Name to greet
      required:
        - name
do:
  - greet:
      set:
        message: "\${.name}, welcome!"
`,
};

/**
 * HTTP call example — demonstrates external HTTP calls (requires network).
 */
const httpCallExample: WorkflowExample = {
  id: "http-call",
  title: "HTTP API Call",
  description: "Workflow that makes an HTTP GET request to an external API",
  license: "Apache 2.0",
  sourceUrl: "https://github.com/open-workflow-specification/specification/blob/main/examples/",
  prerequisites: ["Network access", "HTTP endpoint"],
  yaml: `document:
  dsl: '1.0.0'
  namespace: default
  name: http-example
  version: '1.0.0'
do:
  - fetchData:
      call: http
      with:
        method: get
        endpoint:
          uri: https://api.example.com/data
`,
};

/**
 * Sequential tasks — demonstrates multiple sequential steps.
 */
const sequentialTasksExample: WorkflowExample = {
  id: "sequential-tasks",
  title: "Sequential Tasks",
  description: "Workflow with multiple sequential steps demonstrating data flow",
  license: "Apache 2.0",
  sourceUrl: "https://github.com/open-workflow-specification/specification/blob/main/examples/",
  prerequisites: [],
  yaml: `document:
  dsl: '1.0.0'
  namespace: default
  name: sequential-example
  version: '1.0.0'
do:
  - initialize:
      set:
        counter: 0
        message: "Starting"
  - increment:
      set:
        counter: "\${.counter + 1}"
  - finalize:
      set:
        message: "Completed \${.counter} steps"
`,
};

/**
 * The pinned examples catalog. Add examples selectively — test at least one
 * self-contained example end-to-end (hello-world).
 */
export const EXAMPLES_CATALOG: readonly WorkflowExample[] = [
  helloWorldExample,
  greetingWithInputExample,
  sequentialTasksExample,
  httpCallExample,
];
