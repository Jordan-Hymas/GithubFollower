import 'dotenv/config';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`[ERROR] Missing required environment variable: ${key}`);
    process.exit(1);
  }
  return val;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

function optionalFloat(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseFloat(val) : fallback;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (!val) return fallback;
  return val.toLowerCase() === 'true';
}

function optionalList(key: string): string[] {
  const val = process.env[key];
  return val ? val.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export interface Config {
  githubToken: string;
  githubUsername: string;
  dailyFollowMax: number;
  followDelayMinMs: number;
  followDelayMaxMs: number;
  checkbackHours: number;
  maxFollowingTotal: number;
  unfollowNonReciprocal: boolean;
  minFollowers: number;
  maxFollowers: number;
  language: string;
  searchQueries: string[];
  // Targeting
  targetAccounts: string[];
  // Quality filters
  minAccountAgeDays: number;
  minBioLength: number;
  maxFollowRatio: number;
  // Whitelist
  whitelist: Set<string>;
  // Notifications
  discordWebhookUrl: string | null;
}

export const config: Config = {
  githubToken: requireEnv('GITHUB_TOKEN'),
  githubUsername: requireEnv('GITHUB_USERNAME'),
  dailyFollowMax: optionalInt('DAILY_FOLLOW_MAX', 25),
  followDelayMinMs: optionalInt('FOLLOW_DELAY_MIN_SEC', 45) * 1000,
  followDelayMaxMs: optionalInt('FOLLOW_DELAY_MAX_SEC', 90) * 1000,
  checkbackHours: optionalInt('CHECKBACK_HOURS', 48),
  maxFollowingTotal: optionalInt('MAX_FOLLOWING_TOTAL', 400),
  unfollowNonReciprocal: optionalBool('UNFOLLOW_NON_RECIPROCAL', false),
  minFollowers: optionalInt('MIN_FOLLOWERS', 5),
  maxFollowers: optionalInt('MAX_FOLLOWERS', 10),
  language: process.env.LANGUAGE || 'javascript',
  searchQueries: optionalList('SEARCH_QUERIES'),
  // Targeting
  targetAccounts: optionalList('TARGET_ACCOUNTS'),
  // Quality filters
  minAccountAgeDays: optionalInt('MIN_ACCOUNT_AGE_DAYS', 30),
  minBioLength: optionalInt('MIN_BIO_LENGTH', 0),
  maxFollowRatio: optionalFloat('MAX_FOLLOW_RATIO', 10.0),
  // Whitelist
  whitelist: new Set(optionalList('WHITELIST_USERS').map((u) => u.toLowerCase())),
  // Notifications
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
};
