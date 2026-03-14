import type { Config } from './config.ts';
import type { GitHubClient, UserProfile } from './github.ts';
import type Database from 'better-sqlite3';
import { wasEverFollowed, wasCached, cacheDiscovered } from './db.ts';
import { RateLimitError } from './github.ts';
import { waitForRateLimit } from './scheduler.ts';
import { log } from './logger.ts';

export interface Candidate {
  username: string;
  sourceQuery: string;
}

function buildSearchQueries(config: Config): string[] {
  if (config.searchQueries.length > 0) return config.searchQueries;
  return [`followers:${config.minFollowers}..${config.maxFollowers} language:${config.language} repos:>2`];
}

function passesQualityFilter(profile: UserProfile, config: Config): { pass: boolean; reason?: string } {
  // Account age check
  if (config.minAccountAgeDays > 0) {
    const ageDays = (Date.now() - new Date(profile.created_at).getTime()) / 86_400_000;
    if (ageDays < config.minAccountAgeDays) {
      return { pass: false, reason: `account too new (${Math.floor(ageDays)}d)` };
    }
  }

  // Bio length check
  if (config.minBioLength > 0 && (profile.bio?.trim().length ?? 0) < config.minBioLength) {
    return { pass: false, reason: 'no bio' };
  }

  // Follow ratio check (skip mass-followers)
  if (config.maxFollowRatio > 0 && profile.followers > 0) {
    const ratio = profile.following / profile.followers;
    if (ratio > config.maxFollowRatio) {
      return { pass: false, reason: `follow ratio too high (${ratio.toFixed(1)}x)` };
    }
  }

  return { pass: true };
}

async function fetchProfile(
  client: GitHubClient,
  db: Database.Database,
  username: string,
): Promise<UserProfile | null> {
  try {
    return await client.getUserProfile(username, db);
  } catch {
    return null;
  }
}

async function* fromTargetAccounts(
  client: GitHubClient,
  db: Database.Database,
  config: Config,
): AsyncGenerator<Candidate> {
  for (const account of config.targetAccounts) {
    const sourceQuery = `target:${account}`;
    let page = 1;

    while (true) {
      let results;
      try {
        results = await client.getFollowers(account, page, db);
      } catch (err) {
        if (err instanceof RateLimitError) {
          await waitForRateLimit(err.resetAt);
          continue;
        }
        log.warn(`Failed to fetch followers of @${account}: ${err}`);
        break;
      }

      if (results.length === 0) break;

      for (const user of results) {
        if (user.login.toLowerCase() === config.githubUsername.toLowerCase()) continue;
        if (wasEverFollowed(db, user.login)) continue;
        if (wasCached(db, user.login, sourceQuery)) continue;

        const profile = await fetchProfile(client, db, user.login);
        if (profile) {
          const { pass, reason } = passesQualityFilter(profile, config);
          if (!pass) {
            log.debug(`Skipping @${user.login}: ${reason}`);
            cacheDiscovered(db, user.login, sourceQuery);
            continue;
          }
        }

        cacheDiscovered(db, user.login, sourceQuery);
        yield { username: user.login, sourceQuery };
      }

      if (results.length < 30) break;
      if (page >= 33) break;
      page++;
    }
  }
}

async function* fromSearchQueries(
  client: GitHubClient,
  db: Database.Database,
  config: Config,
): AsyncGenerator<Candidate> {
  const queries = buildSearchQueries(config);

  for (const query of queries) {
    let page = 1;

    while (true) {
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

      if (results.length === 0) break;

      for (const user of results) {
        if (user.type !== 'User') continue;
        if (user.login.toLowerCase() === config.githubUsername.toLowerCase()) continue;
        if (wasEverFollowed(db, user.login)) continue;
        if (wasCached(db, user.login, query)) continue;

        const profile = await fetchProfile(client, db, user.login);
        if (profile) {
          const { pass, reason } = passesQualityFilter(profile, config);
          if (!pass) {
            log.debug(`Skipping @${user.login}: ${reason}`);
            cacheDiscovered(db, user.login, query);
            continue;
          }
        }

        cacheDiscovered(db, user.login, query);
        yield { username: user.login, sourceQuery: query };
      }

      if (page >= 33) break;
      page++;
    }
  }
}

export async function* discoverUsers(
  client: GitHubClient,
  db: Database.Database,
  config: Config,
): AsyncGenerator<Candidate> {
  // Target-account followers first (higher quality)
  if (config.targetAccounts.length > 0) {
    yield* fromTargetAccounts(client, db, config);
  }
  // Fall through to search queries
  yield* fromSearchQueries(client, db, config);
}
