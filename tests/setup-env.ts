import { readFileSync } from "node:fs";

if (!process.env.DATABASE_URL) {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^(DATABASE_URL)=(.+)\r?$/);
      if (m) process.env.DATABASE_URL = m[2];
    }
  } catch {}
}
