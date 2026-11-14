import { createRequire } from "node:module";

export type RobotsFile = {
  isAllowed(url: string, userAgent?: string): boolean | undefined;
  isDisallowed(url: string, userAgent?: string): boolean | undefined;
  getSitemaps(): string[];
};

type RobotsParserFactory = (robotsUrl: string, robotsTxt: string) => RobotsFile;

const require = createRequire(import.meta.url);

/**
 * `robots-parser@3` ships a broken declaration file (an ambient
 * `declare module` shorthand plus a default export), so TypeScript sees the
 * package as a non-callable namespace. Load it through CJS require and type it
 * here instead of patching `node_modules`.
 */
function loadRobotsParser(): RobotsParserFactory {
  const loaded: unknown = require("robots-parser");

  if (typeof loaded !== "function") {
    throw new TypeError("robots-parser did not export a function");
  }

  return loaded as RobotsParserFactory;
}

export const robotsParser = loadRobotsParser();
