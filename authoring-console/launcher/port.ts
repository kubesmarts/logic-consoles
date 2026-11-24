import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const preferences = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "logic-authoring-console", "launcher.json");
const defaultPort = 8080;

function parsePort(value: string) {
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Choose a port from 1 to 65535.");
  }
  return port;
}

export async function selectedPort(args: string[]) {
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--port") throw new Error("Usage: npm start -- [--port PORT]");
    return { port: parsePort(args[1]), remember: true };
  }
  if (process.env.PORT) return { port: parsePort(process.env.PORT), remember: false };
  try {
    const { port } = JSON.parse(await readFile(preferences, "utf8"));
    return { port: parsePort(String(port)), remember: false };
  } catch {
    return { port: defaultPort, remember: false };
  }
}

export async function rememberPort(port: number) {
  await mkdir(dirname(preferences), { recursive: true });
  const temporary = preferences + "." + randomUUID();
  await writeFile(temporary, JSON.stringify({ port }), { mode: 0o600 });
  await rename(temporary, preferences);
}
