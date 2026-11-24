/**
 * MSW worker for the browser (dev + Playwright spike). Lets the app run entirely
 * against fixtures with no live cluster or gateway. Requires the generated
 * `public/mockServiceWorker.js` (run `npx msw init public --save`).
 */
import { setupWorker } from "msw/browser";
import { defaultHandlers } from "./handlers.ts";

export const mockWorker = setupWorker(...defaultHandlers);
