# The Judge — Telegram Sentinel Bot

A Telegram bot that scans EVM contract addresses using Sentinel on a2a.family, pays for scans using PonsMCP x402, and delivers real contract-risk rulings directly to Telegram chats and groups.

## Features

- `/start` — Show bot instructions.
- `/judge <contract_address>` — Validate a contract address and request a Sentinel scan.
- `/confirm` — Explicitly authorize one $0.02 USDG payment.
- Display the actual Sentinel analysis, risk verdict, and detected contract flags.
- Include the confirmed payment transaction link.
- Support Telegram groups.
- Restrict paid scan commands to the configured Telegram owner.

## How It Works

1. The user submits an EVM contract address with `/judge`.
2. The bot checks Sentinel's x402 payment requirements.
3. The bot validates the payment amount, recipient, token, network, and resource.
4. The owner explicitly authorizes the payment using `/confirm` within five minutes.
5. PonsMCP submits a $0.02 USDG payment on Robinhood Chain (chain ID 4663).
6. The bot submits the payment proof to Sentinel.
7. Sentinel's actual contract analysis is delivered to the Telegram chat or group.

The bot does not automatically repeat a payment when a scan fails.

## Technology

- Node.js
- Telegraf
- PonsMCP SDK
- Sentinel API — a2a.family
- x402 payments
- Robinhood Chain
- USDG

## Setup

Requirements: Node.js 20+, a Telegram bot token, and a funded Robinhood Chain wallet.

Install dependencies:

    npm install

Create a project `.env` file:

    TELEGRAM_BOT_TOKEN=your_bot_token
    SENTINEL_BASE_URL=https://api.a2a.family/a/sentinel/v1/scan_contract

Create `/home/codespace/.ponsmcp.env` containing:

    PONSMCP_PRIVATE_KEY=your_private_key
    BOT_OWNER_ID=your_telegram_numeric_id
    PONSMCP_RPC_URL=https://rpc.mainnet.chain.robinhood.com
    PONSMCP_POLICY_STATE=/home/codespace/.ponsmcp-policy.json

Secure the private configuration:

    chmod 600 /home/codespace/.ponsmcp.env

Never commit wallet private keys, bot tokens, or private configuration files.

Start the bot:

    npm start

## Payment Safety

- Explicit confirmation is required for each scan.
- Only the configured Telegram owner can request and authorize scans.
- Payment requirements must match the expected USDG token, recipient, chain, and amount.
- Maximum payment per transaction: $0.02 USDG.
- Configured daily payment limit: $0.10 USDG.
- Confirmations expire after five minutes.
- Failed or uncertain payments are not automatically retried.
- Network gas fees may apply.

## Successful Live Test

The bot successfully scanned a contract and delivered Sentinel's actual analysis to Telegram.

**Contract:** `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9`

**Token:** Apple / Robinhood Token (AAPL)

**Sentinel verdict:** HIGH

**Reported risk flags:**
- Upgradeable proxy
- Owner minting capability
- Pausable transfers
- Blocklist functionality
- Administrative burning of holder balances

**Payment:** $0.02 USDG on Robinhood Chain.

**Confirmed transaction:**
https://robinhoodchain.blockscout.com/tx/0x637429674dfb29c710ff5276627f02e5ebeed0dde1c2de82b992796df5d9f3b5

A Telegram group demonstration also returned a Sentinel ruling. Group screenshots and its separate payment transaction can be provided as submission evidence.

**Disclaimer:** Sentinel's output is an automated bytecode and state assessment, not a comprehensive security audit.

## Bounty Demonstration

Telegram bot: https://t.me/Tgrulingbot

GitHub repository:
https://github.com/Dipoxyz/the-judge-telegram-bot
