import type { Config } from './config.ts';
import type Database from 'better-sqlite3';
import { getTodayFollowCount } from './db.ts';
import { log } from './logger.ts';

export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const jitter = (Math.random() * 0.4 - 0.2); // ±20%
  const base = minMs + Math.random() * (maxMs - minMs);
  const ms = Math.round(base * (1 + jitter));
  log.debug(`Waiting ${(ms / 1000).toFixed(1)}s`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function checkDailyLimit(db: Database.Database, config: Config): boolean {
  const count = getTodayFollowCount(db);
  if (count >= config.dailyFollowMax) {
    log.info(`Daily follow limit reached: ${count}/${config.dailyFollowMax}`);
    return false;
  }
  return true;
}

export async function waitForRateLimit(resetAtEpochMs: number): Promise<void> {
  const waitMs = Math.max(0, resetAtEpochMs - Date.now()) + 2000;
  log.warn(`Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s until reset...`);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
