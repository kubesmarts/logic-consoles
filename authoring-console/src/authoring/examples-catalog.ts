import httpExample from "./examples/call-http-query-parameters.yaml?raw";
import multipleExample from "./examples/do-multiple.yaml?raw";

export const catalogSource = "https://github.com/open-workflow-specification/specification/blob/09ad1deea8a8bb9d34bfded261b14c054dcf92c7/examples";

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
  description: "Console starter based on the OWS set task. A self-contained workflow that sets a greeting message",
  license: "Apache 2.0",
  sourceUrl: `${catalogSource}/set.yaml`,
  prerequisites: [],
  yaml: `document:
  dsl: '1.1.0'
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
  description: "Console starter based on the OWS set task. Accepts a name input and returns a personalized greeting",
  license: "Apache 2.0",
  sourceUrl: `${catalogSource}/set.yaml`,
  prerequisites: [],
  yaml: `document:
  dsl: '1.1.0'
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
        message: '\${ "Welcome, " + .name }'
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
  sourceUrl: `${catalogSource}/call-http-query-parameters.yaml`,
  prerequisites: ["Network access", "HTTP endpoint"],
  yaml: httpExample,

};

/**
 * Sequential tasks — demonstrates multiple sequential steps.
 */
const sequentialTasksExample: WorkflowExample = {
  id: "sequential-tasks",
  title: "Sequential Tasks",
  description: "Workflow with multiple sequential steps demonstrating data flow",
  license: "Apache 2.0",
  sourceUrl: `${catalogSource}/do-multiple.yaml`,
  prerequisites: ["Petstore HTTP service and a pet ID"],
  yaml: multipleExample,

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
