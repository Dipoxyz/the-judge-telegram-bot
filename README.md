# The Judge — Telegram Bot

A Telegram bot for submitting EVM contract addresses to The Judge's Sentinel endpoint.

## Features
- `/start` — display usage instructions.
- `/judge <contract_address>` — validate an address and check Sentinel's payment requirements.
- `/confirm` — currently disabled for payment safety.

## Setup
Requirements: Node.js 20+ and a Telegram bot token from [@BotFather](https://t.me/BotFather).

Install dependencies:

    npm install

Create `.env` using `.env.example` and set:

    TELEGRAM_BOT_TOKEN=your_telegram_bot_token
    SENTINEL_BASE_URL=https://api.a2a.family/a/sentinel/v1/scan_contract

Never commit `.env` or share credentials.

Start the bot:

    npm start

## Current Status
Telegram command handling and Sentinel's payment-requirement pre-check have been tested.

Paid scans are disabled. A completed evaluation, real ruling, and successful ruling delivery to a Telegram group have not yet been verified.# the-judge-telegram-bot
Telegram bot that submits contract addresses to The Judge and posts real rulings in group chats
