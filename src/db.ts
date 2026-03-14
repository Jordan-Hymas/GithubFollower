import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'state.db');

export type UserStatus = 'following' | 'followed_back' | 'unfollowed' | 'never_followed_back';

export interface FollowedUser {
  id: number;
  username: string;
  followed_at: number;
  follow_back_checked_at: number | null;
  follows_back: number;
  unfollowed_at: number | null;
  status: UserStatus;
  skip_reason: string | null;
}

export interface DailyStats {
  date: string;
  follows: number;
  unfollows: number;
  api_calls: number;
}

export interface QueryStats {
  query: string;
  followed: number;
  followed_back: number;
  rate: number;
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS followed_users (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      username                TEXT    NOT NULL UNIQUE,
      followed_at             INTEGER NOT NULL,
      follow_back_checked_at  INTEGER,
      follows_back            INTEGER NOT NULL DEFAULT 0,
      unfollowed_at           INTEGER,
      status                  TEXT    NOT NULL DEFAULT 'following',
      skip_reason             TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
      date      TEXT    PRIMARY KEY,
      follows   INTEGER NOT NULL DEFAULT 0,
      unfollows INTEGER NOT NULL DEFAULT 0,
      api_calls INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS discovery_cache (
      username      TEXT    NOT NULL,
      source_query  TEXT    NOT NULL,
      discovered_at INTEGER NOT NULL,
      PRIMARY KEY (username, source_query)
    );

    CREATE TABLE IF NOT EXISTS query_stats (
      query         TEXT    PRIMARY KEY,
      followed      INTEGER NOT NULL DEFAULT 0,
      followed_back INTEGER NOT NULL DEFAULT 0
    );
  `);

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// --- followed_users helpers ---

export function recordFollowed(db: Database.Database, username: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO followed_users (username, followed_at, status)
    VALUES (?, ?, 'following')
  `).run(username, Date.now());
  incrementDailyStat(db, 'follows');
}

export function recordFollowBack(db: Database.Database, username: string): void {
  db.prepare(`
    UPDATE followed_users
    SET follows_back = 1, follow_back_checked_at = ?, status = 'followed_back'
    WHERE username = ?
  `).run(Date.now(), username);

  // Update per-query analytics
  const cached = db.prepare(
    'SELECT source_query FROM discovery_cache WHERE username = ? LIMIT 1'
  ).get(username) as { source_query: string } | undefined;
  if (cached) {
    db.prepare(`
      INSERT INTO query_stats (query, followed, followed_back) VALUES (?, 0, 1)
      ON CONFLICT(query) DO UPDATE SET followed_back = followed_back + 1
    `).run(cached.source_query);
  }
}

export function recordUnfollowed(db: Database.Database, username: string): void {
  db.prepare(`
    UPDATE followed_users
    SET unfollowed_at = ?, status = 'unfollowed'
    WHERE username = ?
  `).run(Date.now(), username);
  incrementDailyStat(db, 'unfollows');
}

export function recordNeverFollowedBack(db: Database.Database, username: string): void {
  db.prepare(`
    UPDATE followed_users
    SET follow_back_checked_at = ?, status = 'never_followed_back'
    WHERE username = ?
  `).run(Date.now(), username);
}

export function recordQueryFollow(db: Database.Database, query: string): void {
  db.prepare(`
    INSERT INTO query_stats (query, followed, followed_back) VALUES (?, 1, 0)
    ON CONFLICT(query) DO UPDATE SET followed = followed + 1
  `).run(query);
}

export function wasEverFollowed(db: Database.Database, username: string): boolean {
  const row = db.prepare('SELECT 1 FROM followed_users WHERE username = ?').get(username);
  return row !== undefined;
}

export function getActiveFollowing(db: Database.Database): FollowedUser[] {
  return db.prepare(`
    SELECT * FROM followed_users WHERE status IN ('following', 'followed_back')
  `).all() as FollowedUser[];
}

export function getUsersToCheckBack(db: Database.Database, checkbackHours: number): FollowedUser[] {
  const cutoff = Date.now() - checkbackHours * 60 * 60 * 1000;
  return db.prepare(`
    SELECT * FROM followed_users
    WHERE status = 'following'
      AND followed_at <= ?
      AND follow_back_checked_at IS NULL
    ORDER BY followed_at ASC
  `).all(cutoff) as FollowedUser[];
}

export function getQueryStats(db: Database.Database): QueryStats[] {
  return (db.prepare('SELECT * FROM query_stats ORDER BY followed DESC').all() as {
    query: string;
    followed: number;
    followed_back: number;
  }[]).map((r) => ({
    ...r,
    rate: r.followed > 0 ? (r.followed_back / r.followed) * 100 : 0,
  }));
}

// --- daily_stats helpers ---

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureTodayRow(db: Database.Database): void {
  db.prepare('INSERT OR IGNORE INTO daily_stats (date) VALUES (?)').run(todayStr());
}

function incrementDailyStat(db: Database.Database, col: 'follows' | 'unfollows' | 'api_calls'): void {
  ensureTodayRow(db);
  db.prepare(`UPDATE daily_stats SET ${col} = ${col} + 1 WHERE date = ?`).run(todayStr());
}

export function incrementApiCall(db: Database.Database): void {
  incrementDailyStat(db, 'api_calls');
}

export function getTodayFollowCount(db: Database.Database): number {
  ensureTodayRow(db);
  const row = db.prepare('SELECT follows FROM daily_stats WHERE date = ?').get(todayStr()) as DailyStats;
  return row.follows;
}

export function getTodayStats(db: Database.Database): DailyStats {
  ensureTodayRow(db);
  return db.prepare('SELECT * FROM daily_stats WHERE date = ?').get(todayStr()) as DailyStats;
}

export function getAllStats(db: Database.Database): {
  totalFollowing: number;
  totalFollowedBack: number;
  totalUnfollowed: number;
  totalNeverFollowedBack: number;
} {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'following' THEN 1 ELSE 0 END)           AS totalFollowing,
      SUM(CASE WHEN status = 'followed_back' THEN 1 ELSE 0 END)       AS totalFollowedBack,
      SUM(CASE WHEN status = 'unfollowed' THEN 1 ELSE 0 END)          AS totalUnfollowed,
      SUM(CASE WHEN status = 'never_followed_back' THEN 1 ELSE 0 END) AS totalNeverFollowedBack
    FROM followed_users
  `).get() as { totalFollowing: number; totalFollowedBack: number; totalUnfollowed: number; totalNeverFollowedBack: number };
  return {
    totalFollowing: row.totalFollowing || 0,
    totalFollowedBack: row.totalFollowedBack || 0,
    totalUnfollowed: row.totalUnfollowed || 0,
    totalNeverFollowedBack: row.totalNeverFollowedBack || 0,
  };
}

export function getWeekStats(db: Database.Database): {
  follows: number;
  unfollows: number;
  followedBack: number;
  followBackRate: string;
} {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const daily = db.prepare(`
    SELECT SUM(follows) AS follows, SUM(unfollows) AS unfollows
    FROM daily_stats WHERE date >= ?
  `).get(weekAgo) as { follows: number; unfollows: number };

  const checked = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status IN ('followed_back','unfollowed') THEN 1 ELSE 0 END) AS fb
    FROM followed_users
    WHERE follow_back_checked_at >= ?
  `).get(Date.now() - 7 * 24 * 60 * 60 * 1000) as { total: number; fb: number };

  const rate = checked.total > 0 ? ((checked.fb / checked.total) * 100).toFixed(1) : '0.0';
  return {
    follows: daily.follows || 0,
    unfollows: daily.unfollows || 0,
    followedBack: checked.fb || 0,
    followBackRate: rate,
  };
}

// --- discovery_cache helpers ---

export function wasCached(db: Database.Database, username: string, query: string): boolean {
  const row = db.prepare('SELECT 1 FROM discovery_cache WHERE username = ? AND source_query = ?').get(username, query);
  return row !== undefined;
}

export function cacheDiscovered(db: Database.Database, username: string, query: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO discovery_cache (username, source_query, discovered_at)
    VALUES (?, ?, ?)
  `).run(username, query, Date.now());
}
