import { parseArgs } from 'util';
import { config } from './config.ts';
import { getDb, closeDb, getTodayStats, getAllStats, getTodayFollowCount, getActiveFollowing } from './db.ts';
import { createClient } from './github.ts';
import { log } from './logger.ts';
import { runFollowSession } from './follow.ts';
import { runCheckbackSession } from './unfollow.ts';

const { positionals } = parseArgs({ allowPositionals: true, args: process.argv.slice(2) });
const command = positionals[0];

const db = getDb();

function shutdown() {
  log.info('Shutting down...');
  closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  switch (command) {
    case 'follow': {
      const client = createClient(config);
      await runFollowSession(client, db, config, log);
      break;
    }

    case 'check': {
      const client = createClient(config);
      await runCheckbackSession(client, db, config, log);
      break;
    }

    case 'status': {
      const today = getTodayStats(db);
      const totals = getAllStats(db);
      const active = getActiveFollowing(db);
      const followBackRate =
        totals.totalFollowedBack + totals.totalUnfollowed > 0
          ? (((totals.totalFollowedBack + totals.totalUnfollowed) /
              (totals.totalFollowedBack + totals.totalUnfollowed + totals.totalNeverFollowedBack)) *
              100
            ).toFixed(1)
          : '0.0';

      console.log('');
      console.log('=== GitHub Follower Status ===');
      console.log(`Date:                  ${today.date}`);
      console.log(`Follows today:         ${today.follows}/${config.dailyFollowMax}`);
      console.log(`Unfollows today:       ${today.unfollows}`);
      console.log(`API calls today:       ${today.api_calls}`);
      console.log('');
      console.log(`Active following:      ${active.length}/${config.maxFollowingTotal}`);
      console.log(`Total followed (ever): ${totals.totalFollowing + totals.totalFollowedBack + totals.totalUnfollowed + totals.totalNeverFollowedBack}`);
      console.log(`Followed back:         ${totals.totalFollowedBack + totals.totalUnfollowed}`);
      console.log(`Never followed back:   ${totals.totalNeverFollowedBack}`);
      console.log(`Follow-back rate:      ${followBackRate}%`);
      console.log('');
      break;
    }

    default: {
      console.error(`Unknown command: "${command}"`);
      console.error('Usage: npm run follow | check | status');
      process.exit(1);
    }
  }
}

main().catch((err) => {
  log.error(`Fatal: ${err}`);
  closeDb();
  process.exit(1);
});
