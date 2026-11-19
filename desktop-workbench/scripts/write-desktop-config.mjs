import { mkdirSync, writeFileSync } from "node:fs";
import { readDesktopConfig } from "./desktop-config.mjs";

mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/config.json", import.meta.url), `${JSON.stringify(readDesktopConfig(), null, 2)}\n`);
