// A SiteSink that records what the landing mirror would write, so tests read
// copyLandingSite's real output without the write permission the test task
// does not grant.

import type { SiteSink } from "../scripts/landing.ts";

export interface Capture extends SiteSink {
  /** HTML the mirror wrote, keyed by destination path. */
  texts: Map<string, string>;
  /** Files the mirror copied unchanged: destination path → source path. */
  copies: Map<string, string>;
  dirs: string[];
}

export function captureSink(): Capture {
  const texts = new Map<string, string>();
  const copies = new Map<string, string>();
  const dirs: string[] = [];
  return {
    texts,
    copies,
    dirs,
    mkdir: (dir) => Promise.resolve(void dirs.push(dir)),
    writeText: (dest, text) => Promise.resolve(void texts.set(dest, text)),
    copy: (src, dest) => Promise.resolve(void copies.set(dest, src)),
  };
}
