import type { Config } from './config.ts';
import type { GitHubClient } from './github.ts';
import type Database from 'better-sqlite3';
import type { Logger } from './logger.ts';
import { recordFollowed, getTodayFollowCount, getActiveFollowing } from './db.ts';
import { discoverUsers } from './discovery.ts';
import { checkDailyLimit, randomDelay, waitForRateLimit } from './scheduler.ts';
import { RateLimitError } from './github.ts';

export async function runFollowSession(
  client: GitHubClient,
  db: Database.Database,
  config: Config,
  logger: Logger,
): Promise<void> {
  if (!checkDailyLimit(db, config)) {
    return;
  }

  const active = getActiveFollowing(db);
  if (active.length >= config.maxFollowingTotal) {
    logger.warn(`Following cap reached: ${active.length}/${config.maxFollowingTotal}. Run 'check' first.`);
    return;
  }

  logger.info(`Starting follow session. Today: ${getTodayFollowCount(db)}/${config.dailyFollowMax}`);

  let followed = 0;

  for await (const username of discoverUsers(client, db, config)) {
    if (!checkDailyLimit(db, config)) break;

    const currentActive = getActiveFollowing(db);
    if (currentActive.length >= config.maxFollowingTotal) {
      logger.warn(`Following cap reached mid-session.`);
      break;
    }

    logger.info(`Following @${username}...`);

    try {
      await client.followUser(username, db);
    } catch (err) {
      if (err instanceof RateLimitError) {
        await waitForRateLimit(err.resetAt);
        // retry once
        try {
          await client.followUser(username, db);
        } catch {
          logger.error(`Failed to follow @${username} after rate limit retry. Stopping session.`);
          break;
        }
      } else {
        logger.error(`Unexpected error following @${username}: ${err}`);
        break;
      }
    }

    recordFollowed(db, username);
    followed++;
    logger.info(`Followed @${username} (${getTodayFollowCount(db)}/${config.dailyFollowMax} today)`);

    if (!checkDailyLimit(db, config)) break;

    await randomDelay(config.followDelayMinMs, config.followDelayMaxMs);
  }

  logger.info(`Follow session complete. Followed ${followed} users this session.`);
}
