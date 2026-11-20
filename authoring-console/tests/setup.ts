import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { mockServer } from "../src/fixtures/msw/server";

// jsdom does not implement these browser APIs that PatternFly, React Flow and the
// CNCF diagram editor touch on mount. Polyfill them so component trees mount
// without throwing. The real browser behaviour is exercised by the Playwright
// spike (e2e/spike.spec.ts), not by jsdom.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;

if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// MSW mock HTTP boundary for every test. Fixtures are the only data source in
// this task; no live cluster or gateway is ever contacted.
beforeAll(() => mockServer.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  mockServer.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => mockServer.close());
