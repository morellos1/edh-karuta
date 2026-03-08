# EDH Karuta

Discord bot inspired by Karuta, focused on MTG cards for Commander-style collection: drops, claims, conditions, gold values, collection, market, and trading.

## Features

- **Drops** — `/drop` posts a collage of 3 random commander-legal MTG cards (no basic lands). Users claim via buttons (one card per user per drop). Optional per-user cooldown and optional bot auto-drops in a configured channel.
- **Colordrop** — `/colordrop <color>` drops 3 cards with a chosen color identity (white, blue, black, red, green), with a configurable cooldown per user.
- **Conditions** — Claimed cards get a random condition (poor / good / mint) with configurable chances and **price multipliers** (see `game.config.json`). Gold value = base USD × 100 × condition multiplier.
- **Collection** — `/collection` shows paginated collection (instance ID, condition, gold value); sort by recent, color, price, or rarity. `/lookup <id>` shows a single card instance.
- **Card info** — `/card <query>` shows card details, full-size image, and total copies in circulation. Query: partial name or `setCode collectorNumber` (e.g. `mh3 123`).
- **Economy** — `/market` shows rotating market slots (from `topedhrec.csv`). `/buy` purchases a market card for gold. `/give` and `/trade` move cards between users (gold values for trade fairness). `/burn` destroys a card for gold.
- **Tags** — Tag collected cards: `/tagcreate`, `/tagdelete`, `/tagrename`, `/tag`, `/tags`, `/untag`.
- **Persistence** — SQLite via Prisma. Scryfall bulk sync script to populate/update the card pool (~31,000 unique commander-legal card names, ~90,000+ prints across sets; basic lands excluded from drops).

## Prerequisites

- Node.js 20+
- Discord application and bot token

## Environment

Copy `.env.example` to `.env` and set (Discord and database only):

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot token |
| `DISCORD_CLIENT_ID` | Application ID |
| `DISCORD_GUILD_ID` | Guild (server) ID for command registration |
| `DATABASE_URL` | Prisma DB URL (default `file:./dev.db`) |

## Game configuration

Game behavior (cooldowns, drop expiry, rarity and condition chances, condition price multipliers) is configured in **`game.config.json`** in the project root. Edit that file to change:

- `claimCooldownSeconds` — Seconds before a user can claim again (0 = none)
- `dropExpireSeconds` — Seconds until drop buttons expire
- `dropCooldownSeconds` — Per-user cooldown for `/drop` (0 = none)
- `colordropCooldownSeconds` — Per-user cooldown for `/colordrop` (e.g. 43200 = 12h)
- `autoDropIntervalSeconds` — How often the bot auto-drops (e.g. 1800 = 30 min)
- `dropRarity` — commonChance, uncommonChance, rareChance, mythicChance (0–1, scaled)
- `dropCondition` — poorChance, goodChance, mintChance; poorMultiplier, goodMultiplier, mintMultiplier

All cooldowns in the config file are in **seconds**.

## Install and database

```bash
npm install
npx prisma generate
npx prisma db push
```

Use `npx prisma migrate dev --name <name>` if you prefer migrations.

## Sync card data

```bash
npm run sync:scryfall
```

Downloads Scryfall bulk `default_cards` and upserts commander-legal paper cards. The pool contains **~31,000 unique card names** and **~90,000+ prints** (multiple sets per card). Drops use the full print pool so the same card can appear in different printings. Requires `topedhrec.csv` in the project root for the market card list (see `src/services/marketService.ts`).

## Register commands

```bash
npm run register:commands
```

Registers slash commands in the guild specified by `DISCORD_GUILD_ID`. The bot also registers on startup.

## Run the bot

```bash
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `/drop` | Drop 3 random MTG cards for claiming (cooldown configurable) |
| `/colordrop <color>` | Drop 3 cards with chosen color identity (white/blue/black/red/green) |
| `/cd` | View your current Grab and Drop cooldowns |
| `/setdropchannel` | Set the channel where the bot auto-drops (optional) |
| `/collection [user] [sort] [page]` | Paginated collection; sort: recent, color, price, rarity |
| `/lookup <id>` | Show a collected card by its instance ID |
| `/card <query>` | Card details and image; query = name or `setCode collectorNumber` |
| `/market` | View current market slots (rotating cards) |
| `/buy` | Buy a market card for gold |
| `/give <user> <card_id>` | Give a card from your collection to another user |
| `/trade <user> <your_id> <their_id>` | Propose a trade (gold-valued for fairness) |
| `/burn <id>` | Destroy a card and receive its gold value |
| `/tagcreate <name>` | Create a tag |
| `/tagdelete <name>` | Delete a tag |
| `/tagrename <name> <new_name>` | Rename a tag |
| `/tag <card_id> <tag_name>` | Apply tag to a card |
| `/tags [user]` | List tags (optionally for a user) |
| `/untag <card_id> <tag_name>` | Remove tag from a card |

## Reset collection

To wipe all collected cards and drop state:

```bash
npm run reset:collection
```

## Test and build

```bash
npm test
npm run build
```

## License

See repository license file.
