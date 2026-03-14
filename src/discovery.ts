import type { Config } from './config.ts';
import type { GitHubClient } from './github.ts';
import type Database from 'better-sqlite3';
import { wasEverFollowed, wasCached, cacheDiscovered } from './db.ts';
import { RateLimitError } from './github.ts';
import { waitForRateLimit } from './scheduler.ts';
import { log } from './logger.ts';

function buildQueries(config: Config): string[] {
  if (config.searchQueries.length > 0) {
    return config.searchQueries;
  }
  return [
    `followers:${config.minFollowers}..${config.maxFollowers} language:${config.language} repos:>2`,
  ];
}

export async function* discoverUsers(
  client: GitHubClient,
  db: Database.Database,
  config: Config,
): AsyncGenerator<string> {
  const queries = buildQueries(config);

  for (const query of queries) {
    let page = 1;
    let exhausted = false;

    while (!exhausted) {
      let results;
      try {
        results = await client.searchUsers(query, page, db);
      } catch (err) {
        if (err instanceof RateLimitError) {
          await waitForRateLimit(err.resetAt);
          continue;
        }
        throw err;
      }

      if (results.length === 0) {
        log.debug(`Query exhausted at page ${page}: "${query}"`);
        exhausted = true;
        break;
      }

      for (const user of results) {
        if (user.type !== 'User') {
          log.debug(`Skipping org: ${user.login}`);
          continue;
        }
        if (user.login.toLowerCase() === config.githubUsername.toLowerCase()) {
          log.debug(`Skipping self: ${user.login}`);
          continue;
        }
        if (wasEverFollowed(db, user.login)) {
          log.debug(`Already followed: ${user.login}`);
          continue;
        }
        if (wasCached(db, user.login, query)) {
          log.debug(`Already cached: ${user.login}`);
          continue;
        }

        cacheDiscovered(db, user.login, query);
        yield user.login;
      }

      // GitHub search API caps at 1000 results (page 33 at 30/page)
      if (page >= 33) {
        exhausted = true;
      } else {
        page++;
      }
    }
  }
}
