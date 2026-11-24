/**
 * Instance (Data Index) fixtures and sample execution responses.
 *
 * No execution input or secret payloads are stored — only identity, status and
 * timestamps the history view needs, plus a representative runner output.
 */
import type { ExecuteAsyncResult, ExecuteSyncResult, WorkflowInstance } from "../contracts/index.ts";

export const instanceFixtures: readonly WorkflowInstance[] = [
  {
    id: "1f8c0b3a-0001-4a2b-9c3d-000000000001",
    namespace: "default",
    name: "hello-world",
    version: "1.0.0",
    status: "COMPLETED",
    startedAt: "2026-11-20T10:05:00Z",
    endedAt: "2026-11-20T10:05:01Z",
  },
  {
    id: "1f8c0b3a-0002-4a2b-9c3d-000000000002",
    namespace: "default",
    name: "hello-world",
    version: "1.0.0",
    status: "ACTIVE",
    startedAt: "2026-11-20T10:10:00Z",
  },
];

/** Sync execute response (200 + workflow output). */
export const executeSyncFixture: ExecuteSyncResult = {
  output: { message: "Hello, world!" },
  raw: { workflowdata: { message: "Hello, world!" } },
};

/** Async execute response (202 + instance id). */
export const executeAsyncFixture: ExecuteAsyncResult = {
  instanceId: "1f8c0b3a-0003-4a2b-9c3d-000000000003",
  workflowApplicationId: "hello-runtime-5c9d-abcde",
  raw: {
    instanceId: "1f8c0b3a-0003-4a2b-9c3d-000000000003",
    workflowApplicationId: "hello-runtime-5c9d-abcde",
  },
};
