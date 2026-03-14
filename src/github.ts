import { Octokit } from '@octokit/rest';
import type { Config } from './config.ts';
import type Database from 'better-sqlite3';
import { incrementApiCall } from './db.ts';

export class RateLimitError extends Error {
  constructor(public resetAt: number) {
    super(`Rate limited. Resets at ${new Date(resetAt).toISOString()}`);
    this.name = 'RateLimitError';
  }
}

export interface SearchResult {
  login: string;
  type: string;
}

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt: number;
}

function handleOctokitError(err: unknown): never {
  const e = err as { status?: number; response?: { headers?: { 'x-ratelimit-reset'?: string } } };
  if (e.status === 429 || e.status === 403) {
    const resetHeader = e.response?.headers?.['x-ratelimit-reset'];
    const resetAt = resetHeader ? parseInt(resetHeader, 10) * 1000 : Date.now() + 60_000;
    throw new RateLimitError(resetAt);
  }
  throw err;
}

export function createClient(config: Config) {
  const octokit = new Octokit({ auth: config.githubToken });

  async function searchUsers(query: string, page: number, db: Database.Database): Promise<SearchResult[]> {
    try {
      const res = await octokit.search.users({ q: query, per_page: 30, page });
      incrementApiCall(db);
      return res.data.items.map((u) => ({ login: u.login, type: u.type }));
    } catch (err) {
      handleOctokitError(err);
    }
  }

  async function followUser(username: string, db: Database.Database): Promise<void> {
    try {
      await octokit.users.follow({ username });
      incrementApiCall(db);
    } catch (err) {
      handleOctokitError(err);
    }
  }

  async function unfollowUser(username: string, db: Database.Database): Promise<void> {
    try {
      await octokit.users.unfollow({ username });
      incrementApiCall(db);
    } catch (err) {
      handleOctokitError(err);
    }
  }

  async function checkFollowsBack(viewer: string, target: string, db: Database.Database): Promise<boolean> {
    try {
      await octokit.users.checkFollowingForUser({ username: target, target_user: viewer });
      incrementApiCall(db);
      return true;
    } catch (err) {
      const e = err as { status?: number };
      if (e.status === 404) {
        incrementApiCall(db);
        return false;
      }
      handleOctokitError(err);
    }
  }

  async function getRateLimitStatus(): Promise<RateLimitStatus> {
    const res = await octokit.rateLimit.get();
    const core = res.data.rate;
    return {
      remaining: core.remaining,
      limit: core.limit,
      resetAt: core.reset * 1000,
    };
  }

  return { searchUsers, followUser, unfollowUser, checkFollowsBack, getRateLimitStatus };
}

export type GitHubClient = ReturnType<typeof createClient>;
