import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import { PonsMCPClient, CHAIN } from '@ponsmcp/sdk';
import { settleX402, encodePaymentHeader } from '@ponsmcp/sdk';

dotenv.config();
dotenv.config({ path: '/home/codespace/.ponsmcp.env', override: false });

const token = process.env.TELEGRAM_BOT_TOKEN;
const sentinelBaseUrl = process.env.SENTINEL_BASE_URL ||
  'https://api.a2a.family/a/sentinel/v1/scan_contract';

if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN in project .env');
  process.exit(1);
}

const bot = new Telegraf(token);
const pendingScans = new Map();
const USDG = CHAIN.usdg.toLowerCase();
const EXPECTED_PAY_TO = '0x0a64498810C29C3Ac3b9557940b70A095dc745D9'.toLowerCase();
const MAX_PENDING_MS = 5 * 60 * 1000;

function isContractAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || '');
}

function pendingKey(ctx) {
  return String(ctx.chat.id) + ':' + String(ctx.from.id);
}

function responseText(body) {
  if (body === null || body === undefined) return 'No response body.';
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  return text.length > 3000 ? text.slice(0, 3000) + '\n...[truncated]' : text;
}

bot.use((ctx, next) => {
  console.log('Telegram update received:', ctx.message?.text || ctx.updateType);
  return next();
});

bot.start((ctx) => ctx.reply(
  '⚖️ CA Judge Bot\n\n' +
  'Use /judge followed by an EVM contract address.\n' +
  'Example: /judge 0x0000000000000000000000000000000000000000\n\n' +
  'A paid scan requires a separate /confirm command.'
));

bot.command('judge', async (ctx) => {
  const address = ctx.message.text.split(/\s+/).slice(1)[0]?.trim();

  if (!address || !isContractAddress(address)) {
    return ctx.reply(
      'Provide a valid 0x address with 40 hexadecimal characters.\n' +
      'Usage: /judge 0x0000000000000000000000000000000000000000'
    );
  }

await ctx.reply('🔎 Checking Sentinel requirements for:\n' + address);

  try {
    const url = new URL(sentinelBaseUrl);
    url.searchParams.set('token', address);

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.json().catch(() => null);

    if (response.status !== 402) {
      return ctx.reply(
  'Sentinel responded with HTTP ' + response.status + '.\n\n' +
        'No payment was made. Response:\n' + responseText(body)
      );
    }

    const options = Array.isArray(body?.accepts) ? body.accepts : [];
    const option = options.find((item) =>
      item.network === 'robinhood' &&
      item.scheme === 'exact' &&
      item.asset?.toLowerCase() === USDG &&
      String(item.maxAmountRequired) === '20000' &&
      item.payTo?.toLowerCase() === EXPECTED_PAY_TO &&
      item.resource === url.toString() &&
      Number(item.extra?.chainId) === 4663 &&
      item.extra?.symbol === 'USDG' &&
      Number(item.extra?.decimals) === 6
    );

    if (!option) {
      return ctx.reply(
        '🛑 No matching $0.02 USDG payment option was found.\nNo payment was made.'
      );
    }

    pendingScans.set(pendingKey(ctx), {
      address,
      url: url.toString(),
      requirement: { ...option, x402Version: body.x402Version ?? 1 },
      createdAt: Date.now()
    });

    return ctx.reply(
      '💳 Sentinel scan is ready.\n\n' +
 'Contract: ' + address + '\nPayment: $0.02 USDG\n\n' +
      'No payment has been made yet.\n' +
      'To authorize this one scan, send /confirm within 5 minutes.'
    );
  } catch (error) {
    console.error('Sentinel pre-check failed:', error.message);
    return ctx.reply('⚠️ Could not check Sentinel. No payment was made.');
  }
});

bot.command('confirm', async (ctx) => {
  pendingScans.delete(pendingKey(ctx));
  return ctx.reply('Paid scans are disabled during setup. No payment was attempted.');
});

bot.catch((error) => console.error('Telegram bot error:', error.message));

bot.launch()
  .then(() => console.log('CA Judge bot is running.'))
  .catch((error) => {
    console.error('Could not start bot:', error.message);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
