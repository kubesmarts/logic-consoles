/** Replaced at build time by the release bundle (esbuild `define`); unbundled builds report a dev version. */
declare const __CONSOLE_VERSION__: string | undefined;

export const consoleVersion: string =
  typeof __CONSOLE_VERSION__ === "string" ? __CONSOLE_VERSION__ : (process.env.CONSOLE_VERSION || "0.0.0-dev");
