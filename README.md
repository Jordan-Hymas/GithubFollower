# GitHub Follower

Automated GitHub account growth tool. Follows targeted developers, detects who follows back, then unfollows them — keeping your following count low while growing your followers over time.

Runs as a persistent background daemon on a Linux server. No manual intervention required after initial setup.

---

## How It Works

### Strategy

The tool targets developers with **10–50 followers** by default. Accounts this size are:

- Real, active developers (not bots)
- Small enough that a new follower notification stands out
- Far more likely to check their notifications and follow back

### Follow → Check → Unfollow Cycle

```
09:00  Follow session    — follows up to 25 new users (configurable)
10:00  Check session     — checks who followed back, unfollows them
18:00  Check session     — second daily check
```

1. **Follow session** — discovers users via GitHub search API, skips anyone already followed, follows them with randomized delays (45–90s) to mimic human behavior
2. **Check session** — after a 48-hour cooldown, checks if each followed user has followed back; if they have, unfollows them immediately to keep the following count low
3. **State is persisted** in a local SQLite database (`data/state.db`) — survives restarts, tracks every user ever followed

---

## Requirements

- Node.js 20+
- A GitHub personal access token with the `user:follow` scope

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Jordan-Hymas/GithubFollower.git
cd GithubFollower
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Set these two required values:

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

---

## Running

### Daemon mode (recommended for servers)

Runs forever in the foreground. Follow and check sessions trigger automatically at their scheduled times.

```bash
npm run daemon
```

To run in the background and keep it alive after you disconnect:

```bash
nohup npm run daemon >> data/daemon.log 2>&1 &
echo $! > data/daemon.pid
```

To stop it:

```bash
kill $(cat data/daemon.pid)
```

### Manual commands

Run individual sessions on demand:

```bash
npm run follow    # run one follow session now
npm run check     # run one check/unfollow session now
npm run status    # print today's stats and totals
```

---

## Configuration

All settings live in `.env`. Defaults are conservative to avoid triggering GitHub rate limits or account flags.

| Variable | Default | Description |
|---|---|---|
| `GITHUB_TOKEN` | — | **Required.** Personal access token |
| `GITHUB_USERNAME` | — | **Required.** Your GitHub login |
| `DAILY_FOLLOW_MAX` | `25` | Max follows per day (GitHub's informal safe limit is ~50) |
| `FOLLOW_DELAY_MIN_SEC` | `45` | Min seconds between follows |
| `FOLLOW_DELAY_MAX_SEC` | `90` | Max seconds between follows |
| `CHECKBACK_HOURS` | `48` | Hours to wait before checking if someone followed back |
| `MAX_FOLLOWING_TOTAL` | `400` | Hard cap on total active following count |
| `UNFOLLOW_NON_RECIPROCAL` | `false` | Also unfollow users who never followed back |
| `MIN_FOLLOWERS` | `10` | Minimum follower count for discovered users |
| `MAX_FOLLOWERS` | `50` | Maximum follower count for discovered users |
| `LANGUAGE` | `javascript` | Filter discovered users by primary language |
| `SEARCH_QUERIES` | — | Optional comma-separated custom search queries (overrides MIN/MAX/LANGUAGE) |

---

## File Structure

```
GithubFollower/
├── src/
│   ├── daemon.ts       # Continuous background runner — scheduled sessions
│   ├── index.ts        # CLI entry point (follow / check / status)
│   ├── config.ts       # Environment variable loading and validation
│   ├── db.ts           # SQLite schema and query helpers
│   ├── github.ts       # GitHub API client wrapper
│   ├── discovery.ts    # User discovery via GitHub search API
│   ├── scheduler.ts    # Delays, daily limit checks, rate limit handling
│   ├── follow.ts       # Follow session orchestrator
│   ├── unfollow.ts     # Follow-back check and unfollow orchestrator
│   └── logger.ts       # Structured console logging
├── data/
│   ├── state.db        # SQLite database (created at runtime, gitignored)
│   └── daemon.log      # Daemon output log (gitignored)
├── .env                # Your credentials (gitignored — never committed)
├── .env.example        # Template with all available options
└── package.json
```

---

## Database

State is stored in `data/state.db` (SQLite). Three tables:

- **`followed_users`** — every user ever followed, their status (`following`, `followed_back`, `unfollowed`, `never_followed_back`), and timestamps
- **`daily_stats`** — per-day follow/unfollow/API call counts
- **`discovery_cache`** — users already seen in search results (prevents re-querying)

---

## Safety

- Delays between follows are randomized with ±20% jitter to avoid predictable bot patterns
- Daily follow cap defaults to 25 (half of GitHub's informal ~50/day limit)
- Hard cap on total following count prevents runaway ratios
- Never commits `.env` or the database to version control
