import { log } from './logger.ts';

interface DiscordEmbed {
  title: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
}

async function post(webhookUrl: string, embeds: DiscordEmbed[]): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds }),
    });
    if (!res.ok) {
      log.warn(`Discord webhook returned ${res.status}`);
    }
  } catch (err) {
    log.warn(`Discord notification failed: ${err}`);
  }
}

export async function notifyFollowSession(
  webhookUrl: string,
  followed: number,
  todayTotal: number,
  dailyMax: number,
): Promise<void> {
  await post(webhookUrl, [{
    title: 'Follow Session Complete',
    color: 0x2ecc71,
    fields: [
      { name: 'Followed this session', value: String(followed), inline: true },
      { name: 'Today total', value: `${todayTotal}/${dailyMax}`, inline: true },
    ],
    footer: { text: new Date().toLocaleString() },
  }]);
}

export async function notifyCheckSession(
  webhookUrl: string,
  followedBack: number,
  unfollowed: number,
  neverFollowedBack: number,
): Promise<void> {
  const checked = followedBack + neverFollowedBack;
  const rate = checked > 0 ? ((followedBack / checked) * 100).toFixed(1) : '0.0';
  await post(webhookUrl, [{
    title: 'Check Session Complete',
    color: 0x3498db,
    fields: [
      { name: 'Followed back', value: String(followedBack), inline: true },
      { name: 'Unfollowed', value: String(unfollowed), inline: true },
      { name: 'Never followed back', value: String(neverFollowedBack), inline: true },
      { name: 'Follow-back rate', value: `${rate}%`, inline: true },
    ],
    footer: { text: new Date().toLocaleString() },
  }]);
}

export async function notifyWeeklySummary(
  webhookUrl: string,
  follows: number,
  unfollows: number,
  followedBack: number,
  followBackRate: string,
): Promise<void> {
  await post(webhookUrl, [{
    title: 'Weekly Summary',
    color: 0x9b59b6,
    fields: [
      { name: 'Follows this week', value: String(follows), inline: true },
      { name: 'Unfollows this week', value: String(unfollows), inline: true },
      { name: 'Followed back', value: String(followedBack), inline: true },
      { name: 'Follow-back rate', value: `${followBackRate}%`, inline: true },
    ],
    footer: { text: new Date().toLocaleString() },
  }]);
}
