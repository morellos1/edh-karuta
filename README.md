# EDH Karuta

Discord bot inspired by Karuta, focused on MTG cards for Commander-style collection: drops, claims, conditions, gold values, collection, market, trading, wishlists, and tagging.

## Features

- **Drops** — `/drop` posts a collage of 3 random commander-legal MTG cards (no basic lands). Users claim via buttons (one card per user per drop). Optional per-user cooldown and optional bot auto-drops in a configured channel.
- **Colordrop** — `/colordrop <color>` drops 3 cards with a chosen color identity (white, blue, black, red, green), with a 12-hour cooldown per user.
- **Commander Drop** — `/commanderdrop` drops 3 cards that are eligible as commanders, with a 24-hour cooldown per user.
- **Land Drop** — `/landdrop` drops 3 random nonbasic land cards with rarity-weighted selection (50% common, 30% uncommon, 15% rare, 5% mythic), with a 2-hour cooldown per user.
- **Conditions** — Claimed cards get a random condition (poor / good / mint) with configurable chances and **price multipliers** (see `game.config.json`). Gold value = base USD price × 100 × condition multiplier.
- **Collection** — `/collection` shows paginated collection (instance ID, condition stars, gold value); sort by recent, color, price, or rarity. Supports list and album (grid) view modes. `/lookup <id>` shows a single card instance.
- **Card info** — `/card <query>` shows card details, full-size image, total copies in circulation, wishlist count, and all available prints. Query: partial name or `setCode collectorNumber` (e.g. `mh3 123`). Cycle through prints with arrow buttons.
- **Economy** — `/market` shows 6 rotating market slots (from top EDH Rec cards, refreshes every 3 hours). `/buy` purchases a market card for gold. `/give` and `/trade` move cards between users (gold values shown for trade fairness). `/burn` destroys a card for gold.
- **Tags** — Organize your collection with custom tags: `/tagcreate`, `/tagdelete`, `/tagrename`, `/tag`, `/tags`, `/untag`. Filter your collection view by tag.
- **Wishlist** — `/wishadd` to watch for specific cards (max 10 per server). When a wished-for card drops, you get pinged. `/wishremove` to stop watching. `/wl` to view your list.
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

Game behavior (cooldowns, drop expiry, rarity and condition chances, condition price multipliers, wishlist slots) is configured in **`game.config.json`** in the project root. Edit that file to change:

- `claimCooldownSeconds` — Seconds before a user can claim again (default: 60)
- `dropExpireSeconds` — Seconds until drop buttons expire (default: 60)
- `dropCooldownSeconds` — Per-user cooldown for `/drop` (default: 120)
- `colordropCooldownSeconds` — Per-user cooldown for `/colordrop` (default: 43200 = 12h)
- `commanderdropCooldownSeconds` — Per-user cooldown for `/commanderdrop` (default: 86400 = 24h)
- `landdropCooldownSeconds` — Per-user cooldown for `/landdrop` (default: 7200 = 2h)
- `maxWishlistSlots` — Max wishlist entries per user per server (default: 10)
- `autoDropIntervalSeconds` — How often the bot auto-drops (default: 1800 = 30 min)
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

### Dropping & Claiming Cards

| Command | Description |
|---------|-------------|
| `/drop` | Drop 3 random MTG cards for claiming (2 min cooldown) |
| `/colordrop <color>` | Drop 3 cards with chosen color identity — white, blue, black, red, or green (12h cooldown) |
| `/commanderdrop` | Drop 3 commander-eligible cards (24h cooldown) |
| `/landdrop` | Drop 3 random nonbasic land cards (2h cooldown) |
| `/cd` | View your current Grab, Drop, Commanderdrop, and Landdrop cooldowns |
| `/setdropchannel` | Set the current channel for automatic drops every 30 minutes |

### Viewing Cards & Collection

| Command | Description |
|---------|-------------|
| `/collection [user] [sort] [page]` | View paginated collection; sort: recent, color, price_asc, price_desc, rarity; view: album or list |
| `/lookup <id>` | Show a collected card by its 6-character instance ID |
| `/card <query>` | Card details, image, prints, and circulation; query = name or `setCode collectorNumber` |

### Economy & Trading

| Command | Description |
|---------|-------------|
| `/market` | View the 6 rotating market cards (refreshes every 3h) |
| `/buy <slot>` | Buy a market card for gold (slots A–F) |
| `/give <user> <card_id>` | Give a card from your collection to another user |
| `/trade <user> <your_id> <their_id>` | Propose a 1-for-1 trade (gold values shown for fairness) |
| `/burn [id]` | Destroy a card and receive its gold value; omit ID to burn your last card |

### Tags

| Command | Description |
|---------|-------------|
| `/tagcreate <name>` | Create a new tag |
| `/tagdelete <name>` | Delete a tag |
| `/tagrename <old> <new>` | Rename a tag |
| `/tag <tagname> [card_id]` | Apply a tag to a card; omit ID to tag your last card |
| `/tags [user]` | List all tags and card counts |
| `/untag <card_id> [tagname]` | Remove a tag from a card; omit tag to remove all |

### Wishlist

| Command | Description |
|---------|-------------|
| `/wishadd <cardname>` | Add a card to your wishlist (max 10 per server) — you get pinged when it drops |
| `/wishremove <cardname>` | Remove a card from your wishlist |
| `/wl [user]` | View your or another user's wishlist |

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

---

## Discord #how-to Message

Copy and paste the message below into your Discord `#how-to` channel:

---

```
# EDH Karuta — How to Play

Welcome to **EDH Karuta**! Collect, trade, and show off Magic: The Gathering cards right here in Discord. Here's everything you need to know.

---

## Dropping & Claiming Cards

Cards appear in **drops** — a set of 3 random commander-legal MTG cards. Click the button under a card to claim it!

- `/drop` — Drop 3 random cards. **2 min cooldown.**
- `/colordrop white|blue|black|red|green` — Drop 3 cards of a specific color identity. **12 hour cooldown.**
- `/commanderdrop` — Drop 3 commander-eligible cards. **24 hour cooldown.**
- `/landdrop` — Drop 3 random nonbasic land cards. **2 hour cooldown.**
- `/cd` — Check your remaining cooldowns for Grab, Drop, Commanderdrop, and Landdrop.

You can only claim **one card per drop**, and you have **60 seconds** before the drop expires. The bot also **auto-drops cards every 30 minutes** in the designated channel — be ready!

---

## Card Conditions & Gold Value

Every card you claim gets a random **condition**:
- ★☆☆ **Poor** — 1x gold value (50% chance)
- ★★☆ **Good** — 3x gold value (40% chance)
- ★★★ **Mint** — 10x gold value (10% chance)

Gold value = the card's real-world USD price × 100 × condition multiplier. Mint cards are rare and valuable!

---

## Viewing Your Collection

- `/collection` — Browse your cards (paginated). Add a sort: `recent`, `color`, `price_asc`, `price_desc`, or `rarity`. Switch between **list** and **album** (grid) views.
- `/collection @user` — View someone else's collection.
- `/lookup ABC123` — View the full details of a specific card by its 6-character ID.
- `/card Shock` — Look up any MTG card's details, image, rarity, all available prints, and how many copies are in circulation.

---

## The Market

The **Black Market** offers 6 rotating cards sourced from top EDH recommendations. It refreshes every **3 hours**.

- `/market` — View what's currently for sale.
- `/buy A` — Buy a card from the market (slots A through F). Costs gold from your balance.

---

## Trading & Gifting

- `/give @player ABC123` — Gift one of your cards to someone. They accept or decline.
- `/trade @player ABC123 XYZ789` — Propose a 1-for-1 trade. Both cards' gold values are shown so you can judge fairness. The other player accepts or declines.
- `/burn ABC123` — Destroy a card and get its gold value added to your balance. Use `/burn` with no ID to burn your most recently collected card.

---

## Tags — Organize Your Collection

Create custom tags to organize your cards however you like:

- `/tagcreate Favorites` — Create a new tag.
- `/tag Favorites ABC123` — Tag a card. Omit the card ID to tag your most recent card.
- `/tags` — See all your tags and how many cards are in each.
- `/untag ABC123 Favorites` — Remove a tag from a card.
- `/tagrename Favorites Keepers` — Rename a tag.
- `/tagdelete OldTag` — Delete a tag.

You can filter your `/collection` by tag to quickly find grouped cards.

---

## Wishlist — Never Miss a Card

- `/wishadd Rhystic Study` — Add a card to your wishlist (up to 10 per server). When that card appears in a drop, **you'll get pinged!**
- `/wishremove Rhystic Study` — Remove a card from your wishlist.
- `/wl` — View your wishlist. `/wl @player` to see someone else's.

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `/drop` | Drop 3 random cards (2 min cd) |
| `/colordrop <color>` | Drop 3 cards by color (12h cd) |
| `/commanderdrop` | Drop 3 commanders (24h cd) |
| `/landdrop` | Drop 3 nonbasic lands (2h cd) |
| `/cd` | Check your cooldowns |
| `/collection` | View your cards |
| `/lookup <id>` | View a specific card you own |
| `/card <name>` | Look up any MTG card |
| `/market` | See market cards for sale |
| `/buy <slot>` | Buy from the market |
| `/give @user <id>` | Gift a card |
| `/trade @user <id> <id>` | Trade cards 1-for-1 |
| `/burn [id]` | Burn a card for gold |
| `/tagcreate <name>` | Create a tag |
| `/tag <name> [id]` | Tag a card |
| `/tags` | List your tags |
| `/untag <id> [tag]` | Remove a tag |
| `/wishadd <card>` | Watch for a card |
| `/wishremove <card>` | Stop watching |
| `/wl` | View your wishlist |

Happy collecting! May your pulls be mythic and your conditions be mint.
```
