/**
 * MSW server for Node/Vitest. Started in tests/setup.ts with
 * `onUnhandledRequest: "error"` so any un-mocked request fails the test loudly —
 * fixtures are the only data source in this task.
 */
import { setupServer } from "msw/node";
import { defaultHandlers } from "./handlers.ts";

export const mockServer = setupServer(...defaultHandlers);
