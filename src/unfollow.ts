import type { Config } from './config.ts';
import type { GitHubClient } from './github.ts';
import type Database from 'better-sqlite3';
import type { Logger } from './logger.ts';
import {
  getUsersToCheckBack,
  recordFollowBack,
  recordUnfollowed,
  recordNeverFollowedBack,
} from './db.ts';
import { randomDelay, waitForRateLimit } from './scheduler.ts';
import { RateLimitError } from './github.ts';

export async function runCheckbackSession(
  client: GitHubClient,
  db: Database.Database,
  config: Config,
  logger: Logger,
): Promise<void> {
  const users = getUsersToCheckBack(db, config.checkbackHours);

  if (users.length === 0) {
    logger.info(`No users to check yet (need ${config.checkbackHours}h since follow).`);
    return;
  }

  logger.info(`Checking ${users.length} users for follow-backs...`);

  let followedBack = 0;
  let unfollowed = 0;
  let neverFollowedBack = 0;

  for (const user of users) {
    let followsBack: boolean;
    try {
      followsBack = await client.checkFollowsBack(config.githubUsername, user.username, db);
    } catch (err) {
      if (err instanceof RateLimitError) {
        await waitForRateLimit(err.resetAt);
        try {
          followsBack = await client.checkFollowsBack(config.githubUsername, user.username, db);
        } catch {
          logger.error(`Failed to check @${user.username} after rate limit retry. Skipping.`);
          continue;
        }
      } else {
        logger.error(`Unexpected error checking @${user.username}: ${err}`);
        continue;
      }
    }

    if (followsBack) {
      recordFollowBack(db, user.username);
      followedBack++;
      logger.info(`@${user.username} follows back — unfollowing...`);

      try {
        await client.unfollowUser(user.username, db);
        recordUnfollowed(db, user.username);
        unfollowed++;
        logger.info(`Unfollowed @${user.username}`);
      } catch (err) {
        if (err instanceof RateLimitError) {
          await waitForRateLimit(err.resetAt);
          try {
            await client.unfollowUser(user.username, db);
            recordUnfollowed(db, user.username);
            unfollowed++;
            logger.info(`Unfollowed @${user.username}`);
          } catch {
            logger.error(`Failed to unfollow @${user.username} after rate limit retry.`);
          }
        } else {
          logger.error(`Unexpected error unfollowing @${user.username}: ${err}`);
        }
      }
    } else {
      recordNeverFollowedBack(db, user.username);
      neverFollowedBack++;
      logger.info(`@${user.username} did not follow back`);

      if (config.unfollowNonReciprocal) {
        logger.info(`Unfollowing non-reciprocal @${user.username}...`);
        try {
          await client.unfollowUser(user.username, db);
          recordUnfollowed(db, user.username);
          unfollowed++;
          logger.info(`Unfollowed @${user.username}`);
        } catch (err) {
          logger.error(`Failed to unfollow @${user.username}: ${err}`);
        }
      }
    }

    await randomDelay(3000, 10000);
  }

  logger.info(
    `Check session complete. Followed back: ${followedBack}, Unfollowed: ${unfollowed}, Never followed back: ${neverFollowedBack}`,
  );
}
