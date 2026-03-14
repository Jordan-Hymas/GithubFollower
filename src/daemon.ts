/**
 * Daemon mode — runs indefinitely until killed (SIGINT / SIGTERM).
 *
 * Schedule (local time):
 *   09:00  — follow session
 *   10:00  — check session
 *   18:00  — check session
 *   Sunday 20:00 — weekly summary
 */

import { config } from './config.ts';
import { getDb, closeDb, getWeekStats } from './db.ts';
import { createClient } from './github.ts';
import { log } from './logger.ts';
import { runFollowSession } from './follow.ts';
import { runCheckbackSession } from './unfollow.ts';
import { notifyWeeklySummary } from './notifications.ts';

const FOLLOW_HOUR = 9;
const CHECK_HOURS = [10, 18];
const WEEKLY_DAY = 0;   // Sunday
const WEEKLY_HOUR = 20;
const POLL_INTERVAL_MS = 60_000;

function dateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentHour(): number { return new Date().getHours(); }
function currentDay(): number  { return new Date().getDay(); }

async function main() {
  const db = getDb();
  const client = createClient(config);

  let lastFollowDate = '';
  const lastCheckDates: Record<number, string> = {};
  let lastWeeklyDate = '';

  function shutdown() {
    log.info('Daemon stopping...');
    closeDb();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log.info('Daemon started. Follow @ 09:00 | Check @ 10:00 & 18:00 | Weekly summary Sundays @ 20:00');

  while (true) {
    const today = dateKey();
    const hour = currentHour();
    const day = currentDay();

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

    // Weekly summary
    if (day === WEEKLY_DAY && hour >= WEEKLY_HOUR && lastWeeklyDate !== today) {
      lastWeeklyDate = today;
      const stats = getWeekStats(db);
      log.info(`=== Weekly Summary ===`);
      log.info(`Follows: ${stats.follows} | Unfollows: ${stats.unfollows} | Followed back: ${stats.followedBack} | Rate: ${stats.followBackRate}%`);

      if (config.discordWebhookUrl) {
        await notifyWeeklySummary(
          config.discordWebhookUrl,
          stats.follows,
          stats.unfollows,
          stats.followedBack,
          stats.followBackRate,
        );
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
