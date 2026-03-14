# GitHub Follower

Automated GitHub account growth tool. Follows targeted developers with very few followers (5–10), detects who follows back, then unfollows them — keeping your following count low while growing your followers over time.

Runs as a persistent background daemon on a Linux server. No manual intervention required after initial setup.

---

## How It Works

### Strategy

The tool targets developers with **5–10 followers** by default. Accounts this size are:

- Real, active developers (not bots)
- Small enough that a new follower notification stands out immediately
- Far more likely to check notifications and follow back
- Not yet overwhelmed by follow-farming attempts

### Follow → Check → Unfollow Cycle

```
09:00  Follow session    — follows up to 25 new users
10:00  Check session     — checks who followed back, unfollows them
18:00  Check session     — second daily check
Sunday 20:00             — weekly summary logged
```

1. **Discovery** — finds candidates via GitHub search API or by pulling followers of specific target accounts
2. **Quality filtering** — skips accounts that are too new, have no bio (if configured), or follow way more than they're followed (mass-followers)
3. **Follow session** — follows candidates with randomized 45–90s delays to mimic human behavior
4. **Check session** — after 48 hours, checks if each followed user followed back; if yes, unfollows them to keep following count low
5. **State** — everything is persisted in a local SQLite database so the tool never follows the same person twice and survives restarts

---

## File Structure

```
GithubFollower/
│
├── src/
│   ├── daemon.ts         # Background runner — polls every 60s, triggers sessions on schedule
│   ├── index.ts          # CLI entry point — follow / check / status commands
│   ├── config.ts         # Loads and validates all environment variables into a typed Config object
│   ├── db.ts             # SQLite schema, migrations, and all query helpers
│   ├── github.ts         # Typed wrapper over @octokit/rest — search, follow, unfollow, profile fetch
│   ├── discovery.ts      # Candidate discovery — target-account followers + search queries + quality filter
│   ├── scheduler.ts      # Random delays with jitter, daily limit checks, rate limit waits
│   ├── follow.ts         # Follow session orchestrator — runs discovery, follows users, handles errors
│   ├── unfollow.ts       # Check session orchestrator — detects follow-backs, unfollows, respects whitelist
│   ├── notifications.ts  # Discord webhook helpers for session and weekly summaries
│   └── logger.ts         # Structured console logger — [INFO/WARN/ERROR/DEBUG] [HH:MM:SS]
│
├── data/                 # Runtime data — gitignored
│   ├── state.db          # SQLite database (all follow state, stats, discovery cache)
│   └── daemon.log        # Daemon output log
│
├── restart.sh            # Stop old daemon + start new one in background
├── github-follower.service  # systemd service file for auto-start on boot
├── COMMANDS.md           # Quick reference for all commands and config options
├── .env                  # Your credentials — never committed
├── .env.example          # Template with every available option documented
├── package.json          # Dependencies and npm scripts
└── tsconfig.json         # TypeScript config — ESNext, bundler resolution, strict
```

### Database tables (`data/state.db`)

| Table | Purpose |
|---|---|
| `followed_users` | Every user ever followed — status, timestamps, follow-back result |
| `daily_stats` | Per-day counts of follows, unfollows, and API calls |
| `discovery_cache` | Users already seen in search results — prevents re-querying |
| `query_stats` | Per-query follow and follow-back counts for analytics |

---

## Requirements

- Node.js 20+
- A GitHub personal access token with the `user:follow` scope

---

## Setup

### 1. Clone and install

```bash
git clone git@github.com:Jordan-Hymas/GithubFollower.git
cd GithubFollower
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Set the two required values:

```env
GITHUB_TOKEN=ghp_yourTokenHere
GITHUB_USERNAME=yourGitHubLogin
```

Generate a token at: GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic) → check `user:follow`.

### 3. Verify setup

```bash
npm run status
```

Should print a stats table with all zeros — confirms the database initialized correctly.

### 4. Start the daemon

```bash
bash restart.sh
```

---

## Commands

```bash
bash restart.sh     # Start (or restart) the daemon in the background
npm run status      # Print today's stats, totals, and per-query follow-back rates
npm run follow      # Run one follow session manually right now
npm run check       # Run one check/unfollow session manually right now
```

**Stop the daemon:**
```bash
kill $(cat data/daemon.pid)
```

**Watch live logs:**
```bash
tail -f data/daemon.log
```

**Update on the server:**
```bash
git pull && npm install && bash restart.sh
```

---

## Configuration

All settings live in `.env`. Defaults are conservative to stay well within GitHub's rate limits.

| Variable | Default | Description |
|---|---|---|
| `GITHUB_TOKEN` | required | Personal access token with `user:follow` scope |
| `GITHUB_USERNAME` | required | Your GitHub login |
| `DAILY_FOLLOW_MAX` | `25` | Max follows per day (~50/day is GitHub's informal limit) |
| `FOLLOW_DELAY_MIN_SEC` | `45` | Min seconds between follows |
| `FOLLOW_DELAY_MAX_SEC` | `90` | Max seconds between follows |
| `CHECKBACK_HOURS` | `48` | Hours before checking if someone followed back |
| `MAX_FOLLOWING_TOTAL` | `400` | Hard cap on active following count |
| `UNFOLLOW_NON_RECIPROCAL` | `false` | Also unfollow people who never follow back |
| `MIN_FOLLOWERS` | `5` | Min follower count of target accounts |
| `MAX_FOLLOWERS` | `10` | Max follower count of target accounts |
| `LANGUAGE` | `javascript` | Primary language filter for search discovery |
| `SEARCH_QUERIES` | — | Custom search queries — overrides MIN/MAX/LANGUAGE if set |
| `TARGET_ACCOUNTS` | — | Follow the followers of these accounts instead of (or before) using search |
| `MIN_ACCOUNT_AGE_DAYS` | `30` | Skip accounts newer than this (filters brand-new/bot accounts) |
| `MIN_BIO_LENGTH` | `0` | Skip accounts with bio shorter than N characters (0 = disabled) |
| `MAX_FOLLOW_RATIO` | `10` | Skip if following/followers ratio exceeds this (filters mass-followers) |
| `WHITELIST_USERS` | — | Comma-separated logins to never unfollow |
| `DISCORD_WEBHOOK_URL` | — | Post session summaries to a Discord channel |

---

## Safety

- Delays between follows are randomized with ±20% jitter to avoid predictable bot patterns
- Daily follow cap defaults to 25 — half of GitHub's informal ~50/day safe limit
- Hard cap on total following count prevents a runaway ratio
- Quality filter skips accounts that are too new or are mass-following accounts
- `.env` and `data/state.db` are gitignored — credentials and state are never committed
