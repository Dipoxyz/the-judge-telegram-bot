import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import { PonsMCPClient, CHAIN, settleX402, encodePaymentHeader } from '@ponsmcp/sdk';

dotenv.config();
dotenv.config({ path: '/home/codespace/.ponsmcp.env', override: false });

const token = process.env.TELEGRAM_BOT_TOKEN;
const privateKey = process.env.PONSMCP_PRIVATE_KEY;
const ownerId = process.env.BOT_OWNER_ID;
const sentinelBaseUrl = process.env.SENTINEL_BASE_URL ||
  'https://api.a2a.family/a/sentinel/v1/scan_contract';

if (!ownerId) {
  console.error('Missing BOT_OWNER_ID in private configuration.');
  process.exit(1);
}

if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN in project .env');
  process.exit(1);
}

if (!privateKey) {
  console.error('Wallet key not loaded. Paid scans cannot run.');
  process.exit(1);
}

const USDG = CHAIN.usdg.toLowerCase();
const EXPECTED_PAY_TO = '0x0a64498810C29C3Ac3b9557940b70A095dc745D9'.toLowerCase();
const MAX_PENDING_MS = 5 * 60 * 1000;
const SCAN_AMOUNT = 20000n;

const client = new PonsMCPClient({
  privateKey,
  policy: {
    maxPerTx: SCAN_AMOUNT,
    dailyLimit: 100000n
  }
});

const bot = new Telegraf(token);
const pendingScans = new Map();

function isContractAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || '');
}

function pendingKey(ctx) {
  return `${ctx.chat.id}:${ctx.from.id}`;
}

function responseText(body) {
  if (body === null || body === undefined) return 'No response body.';
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  return text.length > 3000 ? text.slice(0, 3000) + '\n...[truncated]' : text;
}

function isAllowedRequirement(option, resourceUrl) {
  return Boolean(
    option &&
    option.network === 'robinhood' &&
    option.scheme === 'exact' &&
    option.asset?.toLowerCase() === USDG &&
    String(option.maxAmountRequired) === '20000' &&
    option.payTo?.toLowerCase() === EXPECTED_PAY_TO &&
    option.resource === resourceUrl &&
    Number(option.extra?.chainId) === 4663 &&
    option.extra?.symbol === 'USDG' &&
    Number(option.extra?.decimals) === 6
  );
}

bot.start((ctx) => ctx.reply(
  '⚖️ CA Judge Bot\n\n' +
  'Use /judge followed by an EVM contract address.\n' +
  'Example: /judge 0x0000000000000000000000000000000000000000\n\n' +
  'Sentinel scans cost $0.02 USDG. Each scan requires /confirm within 5 minutes.'
));

bot.command('judge', async (ctx) => {
  if (String(ctx.from?.id) !== ownerId) {
    return ctx.reply('⛔ Only the bot owner can use this command.');
  }
  const address = ctx.message.text.split(/\s+/).slice(1)[0]?.trim();

  if (!address || !isContractAddress(address)) {
    return ctx.reply(
      'Provide a valid 0x address with 40 hexadecimal characters.\n' +
      'Usage: /judge 0x0000000000000000000000000000000000000000'
    );
  }

  const key = pendingKey(ctx);
  const existing = pendingScans.get(key);

  if (existing && Date.now() - existing.createdAt < MAX_PENDING_MS) {
    return ctx.reply(
      'You already have a pending scan confirmation. Send /confirm for that scan, ' +
      'or wait for it to expire before requesting another.'
    );
  }

  pendingScans.delete(key);
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
        'Sentinel responded with HTTP ' + response.status + '.\n' +
        'No payment was attempted.\n\n' + responseText(body)
      );
    }

    const options = Array.isArray(body?.accepts) ? body.accepts : [];
    const option = options.find((item) => isAllowedRequirement(item, url.toString()));

    if (!option) {
      return ctx.reply(
        '🛑 No matching $0.02 USDG payment requirement was found.\n' +
        'No payment was attempted.'
      );
    }

    pendingScans.set(key, {
      address,
      url: url.toString(),
      requirement: { ...option, x402Version: body.x402Version ?? 1 },
      createdAt: Date.now()
    });

    return ctx.reply(
      '💳 Sentinel scan is ready.\n\n' +
      'Contract: ' + address + '\n' +
      'Payment: $0.02 USDG\n\n' +
      'No payment has been made yet.\n' +
      'To authorize this one scan, send /confirm within 5 minutes.'
    );
  } catch (error) {
    console.error('Sentinel pre-check failed:', error?.message || String(error));
    return ctx.reply('⚠️ Could not check Sentinel. No payment was attempted.');
  }
});

bot.command('confirm', async (ctx) => {
  if (String(ctx.from?.id) !== ownerId) {
    return ctx.reply('⛔ Only the bot owner can use this command.');
  }
  const key = pendingKey(ctx);
  const pending = pendingScans.get(key);

  if (!pending) {
    return ctx.reply('No pending scan found. Use /judge <contract_address> first.');
  }

  if (Date.now() - pending.createdAt > MAX_PENDING_MS) {
    pendingScans.delete(key);
    return ctx.reply('⏳ Confirmation expired. Run /judge again to request a fresh scan.');
  }

  if (!isAllowedRequirement(pending.requirement, pending.url)) {
    pendingScans.delete(key);
    return ctx.reply('🛑 Payment requirement failed validation. No payment was attempted.');
  }

  // Consume the confirmation before any payment attempt to prevent duplicate charges.
  pendingScans.delete(key);

  await ctx.reply('⏳ Processing your one-time $0.02 USDG confirmation...');

  let settlement;
  try {
    settlement = await settleX402(client, pending.requirement, { waitMs: 30000 });
  } catch (error) {
    console.error('Settlement error:', error?.message || String(error));
    return ctx.reply(
      '⚠️ Payment status could not be verified. This confirmation will not be retried automatically. ' +
      'Check the wallet and transaction history before requesting another scan.'
    );
  }

  if (!settlement?.ok || !settlement.payment) {
    const payment = settlement?.payment;
    const tx = payment?.explorer || payment?.txHash || '';

    if (payment?.txHash) {
      return ctx.reply(
        '⚠️ A payment transaction may have been submitted, but confirmation failed or timed out.\n' +
        'Do not repeat this scan until you check the transaction.\n' +
        (tx ? 'Transaction: ' + tx : '')
      );
    }

    return ctx.reply(
      '❌ Payment was not confirmed. No automatic retry will be made.\n' +
      'Reason: ' + String(settlement?.error || 'Unknown settlement failure').slice(0, 500) +
      '\nRun /judge again only if you want to start a new attempt.'
    );
  }

  const payment = settlement.payment;
  const txUrl = payment.explorer || '';

  let response;
  try {
    const proof = encodePaymentHeader(
      pending.requirement,
      payment,
      client.address
    );

    response = await fetch(pending.url, {
      headers: {
        Accept: 'application/json',
        'X-PAYMENT': proof
      },
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    console.error('Sentinel retry failed after payment:', error?.message || String(error));
    return ctx.reply(
      '⚠️ Payment is confirmed, but Sentinel could not be reached to retrieve the result.\n' +
      'No second payment will be attempted.\n' +
      (txUrl ? 'Transaction: ' + txUrl : '')
    );
  }

  const raw = await response.text().catch(() => '');
  let result = raw;
  if (raw.trimStart().startsWith('{') || raw.trimStart().startsWith('[')) {
    try {
      result = responseText(JSON.parse(raw));
    } catch {
      result = raw;
    }
  }
  if (!result.trim()) result = 'Sentinel returned an empty response.';
  if (result.length > 3000) result = result.slice(0, 3000) + '\n...[truncated]';

  if (response.status === 402) {
    return ctx.reply(
      '⚠️ Payment is confirmed, but Sentinel still returned HTTP 402. ' +
      'The result was not retrieved, and the bot will not pay again automatically.\n\n' +
      result + (txUrl ? '\n\nTransaction: ' + txUrl : '')
    );
  }

  if (!response.ok) {
    return ctx.reply(
      '⚠️ Payment is confirmed, but Sentinel returned HTTP ' + response.status + '.\n\n' +
      result + (txUrl ? '\n\nTransaction: ' + txUrl : '')
    );
  }

  return ctx.reply(
    '⚖️ Sentinel response for contract:\n' + pending.address +
    '\n\n' + result +
    '\n\n💳 Payment confirmed: $0.02 USDG' +
    (txUrl ? '\nTransaction: ' + txUrl : '')
  );
});

bot.catch((error) => console.error('Telegram bot error:', error?.message || String(error)));

bot.launch()
  .then(() => console.log('CA Judge bot is running. Wallet:', client.address))
  .catch((error) => {
    console.error('Could not start bot:', error?.message || String(error));
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
