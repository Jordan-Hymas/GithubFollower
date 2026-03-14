# Commands & How It Works

## How It Works

The tool follows GitHub users with very few followers (5–10 by default). Small accounts are far more likely to notice a new follower notification and follow back. After 48 hours it checks who followed back and unfollows them — keeping your following count low while your follower count grows.

**The cycle:**
```
Follow (9am) → Wait 48h → Check who followed back → Unfollow them
```

---

## Starting & Stopping

### Start the daemon
```bash
bash restart.sh
```
Runs in the background. Follows at 9am, checks at 10am and 6pm every day.

### Stop the daemon
```bash
kill $(cat data/daemon.pid)
```

### Restart the daemon
```bash
bash restart.sh
```
(Automatically stops the old one first.)

### Watch live logs
```bash
tail -f data/daemon.log
```

---

## Commands

### `npm run status`
Shows today's activity and all-time stats.
```
=== GitHub Follower Status ===
Date:                  2026-03-14
Follows today:         12/25
Unfollows today:       3
API calls today:       28

Active following:      9/400
Total followed (ever): 45
Followed back:         18
Never followed back:   12
Follow-back rate:      60.0%

=== Per-Query Stats ===
  [65.0%] 13/20 — followers:5..10 language:javascript repos:>2
  [40.0%] 5/12  — target:someuser
```

### `npm run follow`
Runs one follow session right now (up to your daily limit).
Use this to test or trigger a session manually outside the 9am schedule.

### `npm run check`
Runs one check session right now — checks who has followed back and unfollows them.
Use this to process follow-backs immediately without waiting for the scheduled 10am/6pm run.

### `npm run daemon`
Starts the daemon in the foreground (logs print to terminal).
Use `bash restart.sh` instead to run it in the background.

---

## Updating on the Server

After changes are pushed to GitHub:
```bash
cd ~/GithubFollower
git pull
npm install
bash restart.sh
```

---

## Configuration (`.env`)

| Variable | Default | What it does |
|---|---|---|
| `GITHUB_TOKEN` | required | Personal access token with `user:follow` scope |
| `GITHUB_USERNAME` | required | Your GitHub login |
| `DAILY_FOLLOW_MAX` | 25 | Max follows per day |
| `FOLLOW_DELAY_MIN_SEC` | 45 | Min seconds between follows |
| `FOLLOW_DELAY_MAX_SEC` | 90 | Max seconds between follows |
| `CHECKBACK_HOURS` | 48 | Hours before checking if someone followed back |
| `MAX_FOLLOWING_TOTAL` | 400 | Hard cap on active following count |
| `UNFOLLOW_NON_RECIPROCAL` | false | Also unfollow people who never follow back |
| `MIN_FOLLOWERS` | 5 | Min follower count of target accounts |
| `MAX_FOLLOWERS` | 10 | Max follower count of target accounts |
| `LANGUAGE` | javascript | Primary language filter for discovery |
| `TARGET_ACCOUNTS` | — | Comma-separated accounts — follow their followers instead of using search |
| `MIN_ACCOUNT_AGE_DAYS` | 30 | Skip accounts newer than this (filters bots) |
| `MIN_BIO_LENGTH` | 0 | Skip accounts with bio shorter than this (0 = off) |
| `MAX_FOLLOW_RATIO` | 10 | Skip if following/followers ratio is too high (filters mass-followers) |
| `WHITELIST_USERS` | — | Comma-separated logins to never unfollow |
| `DISCORD_WEBHOOK_URL` | — | Post session summaries to a Discord channel |

---

## Discord Notifications Setup

1. Open Discord and go to the channel you want notifications in
2. Click the gear icon (Edit Channel) → **Integrations** → **Webhooks** → **New Webhook**
3. Name it anything (e.g. "GitHub Follower"), click **Copy Webhook URL**
4. Add it to your `.env` on the server:
   ```
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
   ```
5. Restart the daemon: `bash restart.sh`

You'll get a message after every follow session, every check session, and a weekly summary every Sunday at 8pm.

---

## Data

All state is stored in `data/state.db` (SQLite). Never delete this file — it tracks every account ever followed so the tool never follows the same person twice.

Logs are written to `data/daemon.log`.
