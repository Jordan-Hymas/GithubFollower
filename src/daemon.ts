/**
 * Daemon mode — runs indefinitely until killed (SIGINT / SIGTERM).
 *
 * Schedule (all times local):
 *   09:00  — follow session
 *   10:00  — check session
 *   18:00  — check session
 *
 * Polls every 60 seconds to decide if a session is due.
 * Tracks which sessions already ran today to avoid double-runs.
 */

import { config } from './config.ts';
import { getDb, closeDb } from './db.ts';
import { createClient } from './github.ts';
import { log } from './logger.ts';
import { runFollowSession } from './follow.ts';
import { runCheckbackSession } from './unfollow.ts';

const FOLLOW_HOUR = 9;        // 09:00
const CHECK_HOURS = [10, 18]; // 10:00 and 18:00
const POLL_INTERVAL_MS = 60_000;

function dateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentHour(): number {
  return new Date().getHours();
}

async function main() {
  const db = getDb();
  const client = createClient(config);

  let lastFollowDate = '';
  const lastCheckDates: Record<number, string> = {};

  function shutdown() {
    log.info('Daemon stopping...');
    closeDb();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log.info('Daemon started. Follow @ 09:00, Check @ 10:00 and 18:00.');

  while (true) {
    const today = dateKey();
    const hour = currentHour();

    // Follow session
    if (hour >= FOLLOW_HOUR && lastFollowDate !== today) {
      lastFollowDate = today;
      log.info('=== Follow session starting ===');
      await runFollowSession(client, db, config, log);
      log.info('=== Follow session done ===');
    }

    // Check sessions
    for (const checkHour of CHECK_HOURS) {
      if (hour >= checkHour && lastCheckDates[checkHour] !== today) {
        lastCheckDates[checkHour] = today;
        log.info(`=== Check session starting (${checkHour}:00 slot) ===`);
        await runCheckbackSession(client, db, config, log);
        log.info(`=== Check session done ===`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  log.error(`Fatal: ${err}`);
  closeDb();
  process.exit(1);
});
