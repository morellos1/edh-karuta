# EDH Karuta

Discord bot inspired by Karuta, focused on MTG cards for Commander-style collection: drops, claims, conditions, gold values, collection, market, trading, wishlists, tagging, PvP Clash battles, and Daily Raids.

## Features

- **Drops** — `/drop` posts a collage of 3 random commander-legal MTG cards (no basic lands). Users claim via buttons (one card per user per drop). Optional per-user cooldown and optional bot auto-drops in a configured channel.
- **Colordrop** — `/colordrop <color>` drops 3 cards with a chosen color identity (white, blue, black, red, green), with a 12-hour cooldown per user.
- **Commander Drop** — `/commanderdrop` drops 3 cards that are eligible as commanders, with a 24-hour cooldown per user.
- **Land Drop** — `/landdrop` drops 3 random nonbasic land cards with rarity-weighted selection (50% common, 30% uncommon, 15% rare, 5% mythic), with a 2-hour cooldown per user.
- **Conditions** — Claimed cards get a random condition (poor / good / mint) with configurable chances and **price multipliers** (see `game.config.json`). Gold value = base USD price × 100 × condition multiplier.
- **Collection** — `/collection` shows paginated collection (instance ID, condition stars, gold value); sort by recent, color, price, or rarity. Supports list and album (grid) view modes. Filter by tag, card name search (`search:` / `s:`), card type (`type:creature`, etc.), or color-specific sorts. `/lookup <id>` shows a single card instance.
- **Card info** — `/card <query>` shows card details, full-size image, total copies in circulation, wishlist count, and all available prints. Query: partial name or `setCode collectorNumber` (e.g. `mh3 123`). Cycle through prints with arrow buttons.
- **Economy** — `/market` shows 6 rotating market slots (from top EDH Rec cards, refreshes every 3 hours). `/buy` purchases a market card for gold. `/give` and `/trade` move cards between users (gold values shown for trade fairness). `/burn` destroys a card for gold. `/bulkburn` burns all cards with a given tag at once.
- **Tool Shop** — `/toolshop` lists purchasable extras. Buy **Extra Claims** to claim cards even while your claim cooldown is active.
- **Tags** — Organize your collection with custom tags: `/tagcreate`, `/tagdelete`, `/tagrename`, `/tag`, `/multitag`, `/tags`, `/untag`. Filter your collection view by tag.
- **Wishlist** — `/wishadd` to watch for specific cards (max 10 per server). When a wished-for card drops, you get pinged. `/wishremove` to stop watching. `/wl` to view your list.
- **Clash** — `/clash` challenges another player to a PvP battle using their set commanders. Turn-based combat with stats derived from card properties, elemental type matchups, keyword abilities, and critical hits. Win/loss records tracked per server.
- **Daily Raid** — `/dailyraid` pits your commander against a powerful daily boss (same boss for everyone each day). Beat the boss to earn 3 cards matching its color identity. One reward per day.
- **Battle Stats** — `/stats <id>` displays a commander's full battle profile: ATK, DEF, HP, Speed, Crit Rate, attack pattern, abilities, and win/loss record.
- **Set Commander** — `/setcommander <id>` sets your active commander for Clash and Daily Raid.
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

## Battle System

### Clash (PvP)

Use `/setcommander <id>` to set a legendary creature from your collection as your active commander, then `/clash` to challenge another player. Both players need a set commander. Challenges expire after 60 seconds. Win/loss records are tracked per server.

### Daily Raid (PvE)

Use `/dailyraid` to view and challenge the daily raid boss. The boss is the same for all servers on the same day (EST), selected deterministically from the commander-eligible card pool. The boss always has **max stats** (Mint condition, maximum bonuses) plus one bonus keyword ability. Defeat the boss to earn **3 cards** with a matching color identity. Rewards are limited to **once per day** per player.

### Stats

Every legendary creature has five battle stats derived from its card properties:

| Stat | Derived From | Range | Notes |
|------|-------------|-------|-------|
| **ATK** | Power (0–15 → 50–1000) | 50–1000+ | Flat bonus 50–200 added based on condition |
| **DEF** | Toughness (0–15 → 50–1000) | 50–1000+ | Flat bonus 50–200 added based on condition |
| **HP** | Oracle text length + CMC | 1300–6000 | Base from word count (×30), CMC adds up to 500 |
| **Speed** | CMC (lower CMC = faster) | 10–100 | `100 − CMC × 8`, clamped 10–100 |
| **Crit Rate** | Condition | 10–30% | Poor: 10%, Good: 20%, Mint: 30%; percentage bonus 5–50% added |

Card **condition** affects bonus quality:
- **Poor** — 1 random roll for bonuses
- **Good** — Best of 2 rolls
- **Mint** — Best of 3 rolls (flat bonuses guaranteed ≥150)

### Elemental Type System (Color Wheel)

Attacks cycle through a color pattern derived from the commander's mana cost. Each attack's color is checked against the defender's color identity for type effectiveness:

```
W (White) → strong vs → B (Black) → strong vs → G (Green) → strong vs → U (Blue) → strong vs → R (Red) → strong vs → W (White)
```

| Matchup | Multiplier |
|---------|-----------|
| Super effective (e.g. White vs Black) | **1.5×** |
| Weak (e.g. White vs Red) | **0.5×** |
| Neutral | **1.0×** |
| Colorless (either side) | **1.0×** |

Multi-color defenders: effectiveness is the **average** of individual matchups (e.g. White attack vs Blue+Red = (1.0 + 0.5) / 2 = 0.75×).

Hybrid mana in the cost randomly resolves to one of its two colors per attack. Generic and snow mana contribute colorless (C) to the pattern.

### Damage Formula

```
baseDamage    = 100 + (ATK × 0.8)
defenseFactor = 1 − (DEF / 4000)
typeMultiplier = color matchup (0.5×, 1.0×, or 1.5×)
critMultiplier = 1.5× on crit, else 1.0×

finalDamage = max(1, round(baseDamage × defenseFactor × typeMultiplier × critMultiplier))
```

### Turn Order

Each commander attacks on a timer based on Speed: `150000 / (30 + Speed)` milliseconds per attack. Faster commanders get more attacks over the course of a battle. Battles last up to **100 total attacks** before a stalemate.

### Keyword Abilities in Combat

Keyword abilities on the card grant combat effects and stat multipliers:

| Ability | Effect |
|---------|--------|
| **First Strike** | Next attack fires instantly (cancels out if both have it) |
| **Double Strike** | Second hit at 20% damage after the main attack |
| **Deathtouch** | Instant kill when defender drops to ≤10% HP |
| **Indestructible** | Survives one lethal hit at 1 HP (once per battle, blocks Deathtouch) |
| **Lifelink** | Heals attacker by 15% of damage dealt |
| **Flying / Trample** | +20% ATK |
| **Defender** | +25% DEF |
| **Hexproof / Reach** | +20% DEF |
| **Haste / Flash / Vigilance** | +25% Speed |

## Install and database

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run sync:scryfall
```

- `prisma migrate deploy` creates the SQLite database and applies all migrations.
- `sync:scryfall` downloads Scryfall bulk card data and populates the card pool (~31,000 unique commander-legal card names, ~90,000+ prints). **Required before drops will work.** Takes a few minutes.

The market feature also requires a `topedhrec.csv` file in the project root (see `src/services/marketService.ts`).

### Migrating an existing database to a new machine

Copy `prisma/dev.db` from the old machine to the same path on the new one, then run:

```bash
npx prisma migrate deploy
```

If any migrations fail with "table already exists" or "duplicate column" errors (because the data was already present), mark them as applied and retry:

```bash
npx prisma migrate resolve --applied <migration_name>
npx prisma migrate deploy
```

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
| `/cd` | View your current Claim, Drop, Color Drop, Commander Drop, and Land Drop cooldowns |
| `/setdropchannel` | Set the current channel for automatic drops every 30 minutes (admin only) |

### Clash & Battle

| Command | Description |
|---------|-------------|
| `/setcommander <id>` | Set your active commander for Clash and Daily Raid |
| `/clash` | Challenge another player to a PvP Clash battle |
| `/dailyraid` | View and challenge today's daily raid boss |
| `/stats <id>` | View a commander's full battle stats, abilities, and W/L record |

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
| `/buy <slot>` | Buy a market card for gold (slots A–L) |
| `/give <user> <card_id>` | Give a card from your collection to another user |
| `/trade <user> <your_id> <their_id>` | Propose a 1-for-1 trade (gold values shown for fairness) |
| `/burn [id]` | Destroy a card and receive its gold value; omit ID to burn your last card |
| `/bulkburn <tag>` | Burn all cards with a given tag in exchange for gold |
| `/toolshop` | Browse the Tool Shop for extra tools and power-ups |

### Tags

| Command | Description |
|---------|-------------|
| `/tagcreate <name>` | Create a new tag |
| `/tagdelete <name>` | Delete a tag |
| `/tagrename <old> <new>` | Rename a tag |
| `/tag <tagname> [card_id]` | Apply a tag to a card; omit ID to tag your last card |
| `/multitag <tagname> <cardids>` | Tag multiple cards at once (space-separated IDs) |
| `/tags [user]` | List all tags and card counts |
| `/untag <card_id> [tagname]` | Remove a tag from a card; omit tag to remove all |

### Wishlist

| Command | Description |
|---------|-------------|
| `/wishadd <cardname>` | Add a card to your wishlist (max 10 per server) — you get pinged when it drops |
| `/wishremove <cardname>` | Remove a card from your wishlist |
| `/wl [user]` | View your or another user's wishlist |

### Server Administration

| Command | Description |
|---------|-------------|
| `/setdropchannel` | Set the current channel for automatic bot drops (admin only) |
| `/shortcut <enable\|disable>` | Enable or disable text shortcuts for this server (admin only) |
| `/setprefix <char>` | Set the single-character prefix for text shortcuts, default `k` (admin only) |

## Text Shortcuts

Text shortcuts let users type short commands in chat instead of using slash commands. They are **disabled by default** — a server admin must run `/shortcut enable` to activate them.

The default prefix is `k`. Admins can change it with `/setprefix`. For example, with prefix `k`:

| Shortcut | Equivalent | Arguments |
|----------|-----------|-----------|
| `kd` | `/drop` | none |
| `kld` | `/landdrop` | none |
| `kcmd` | `/commanderdrop` | none |
| `kcld <color>` | `/colordrop` | required: white, blue, black, red, or green |
| `kc [args]` | `/collection` | flexible (see below) |
| `km` | `/market` | none |
| `kbuy <slot>` | `/buy` | market slot A–L |
| `kbuy extra claim [qty]` | buy extra claims | optional quantity (default 1) |
| `kts` | `/toolshop` | none |
| `kb [id]` | `/burn` | optional 6-char card ID |
| `kcd` | `/cd` | none |
| `kt <tag> [id]` | `/tag` | required tag name, optional card ID |
| `kmt <tag> <ids>` | `/multitag` | required tag name and space-separated card IDs |
| `klu [id]` | `/lookup` | optional 6-char card ID (defaults to last collected) |
| `kg @user <id>` | `/give` | required: mention and card ID |
| `kwa <card name>` | `/wishadd` | required card name |
| `kwr <card name>` | `/wishremove` | required card name |

**Collection shortcut (`kc`) arguments** — combine freely in any order:
- **User mention:** `@user` — view someone else's collection
- **Sort:** `recent`, `color`, `white`, `blue`, `black`, `red`, `green`, `uncolored`, `price`, `price_asc`, `price_desc`, `rarity`
- **View mode:** `album` or `list`
- **Tag filter:** any tag name (e.g. `favorites`)
- **Name search:** `search:cardname` or `s:cardname`
- **Type filter:** `type:creature`, `type:artifact`, `type:enchantment`, `type:instant`, `type:sorcery`, `type:land`, `type:planeswalker` — or just the type name as a keyword (e.g. `creature`)

**Examples:**
- `kd` — drop 3 cards
- `kld` — drop 3 nonbasic lands
- `kcmd` — drop 3 commander-eligible cards
- `kcld blue` — drop 3 blue cards
- `kc @User rarity album` — view someone's collection sorted by rarity in album view
- `kc favorites` — view your collection filtered by the "favorites" tag
- `kc s:rhystic creature` — search for cards named "rhystic" that are creatures
- `kc type:enchantment price_desc` — view enchantments sorted by price (high to low)
- `kb ABC123` — burn card with ID ABC123
- `kbuy A` — buy market slot A
- `kbuy extra claim 3` — buy 3 extra claims
- `kts` — browse the tool shop
- `kt burn ABC123` — tag card ABC123 with tag "burn"
- `kmt deck ABC123 DEF456 GHI789` — tag multiple cards into "deck"
- `klu` — look up your last collected card
- `kg @User ABC123` — give card ABC123 to a user
- `kwa Rhystic Study` — add Rhystic Study to your wishlist
- `kwr Rhystic Study` — remove Rhystic Study from your wishlist

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
- `/cd` — Check your remaining cooldowns for Claim, Drop, Color Drop, Commander Drop, and Land Drop.

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

- `/collection` — Browse your cards (paginated). Add a sort: `recent`, `color`, `price_asc`, `price_desc`, or `rarity`. Switch between **list** and **album** (grid) views. Filter by tag, search by card name, or filter by card type.
- `/collection @user` — View someone else's collection.
- `/lookup ABC123` — View the full details of a specific card by its 6-character ID.
- `/card Shock` — Look up any MTG card's details, image, rarity, all available prints, and how many copies are in circulation.

---

## The Market

The **Black Market** offers 6 rotating cards sourced from top EDH recommendations. It refreshes every **3 hours**.

- `/market` — View what's currently for sale.
- `/buy A` — Buy a card from the market (slots A through L). Costs gold from your balance.

---

## Trading & Gifting

- `/give @player ABC123` — Gift one of your cards to someone. They accept or decline.
- `/trade @player ABC123 XYZ789` — Propose a 1-for-1 trade. Both cards' gold values are shown so you can judge fairness. The other player accepts or declines.
- `/burn ABC123` — Destroy a card and get its gold value added to your balance. Use `/burn` with no ID to burn your most recently collected card.
- `/bulkburn Jank` — Burn **all** cards tagged with "Jank" at once and receive gold for each.

---

## Tool Shop

- `/toolshop` — Browse the Tool Shop for extra tools and power-ups.
- **Extra Claim** — Lets you claim a card even when your claim cooldown is active. Buy with `/buy extra claim` or the text shortcut `kbuy extra claim`.

---

## Tags — Organize Your Collection

Create custom tags to organize your cards however you like:

- `/tagcreate Favorites` — Create a new tag.
- `/tag Favorites ABC123` — Tag a card. Omit the card ID to tag your most recent card.
- `/multitag Deck ABC123 DEF456 GHI789` — Tag multiple cards at once.
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
| `/toolshop` | Browse the Tool Shop |
| `/give @user <id>` | Gift a card |
| `/trade @user <id> <id>` | Trade cards 1-for-1 |
| `/burn [id]` | Burn a card for gold |
| `/bulkburn <tag>` | Burn all cards with a tag |
| `/tagcreate <name>` | Create a tag |
| `/tag <name> [id]` | Tag a card |
| `/multitag <name> <ids>` | Tag multiple cards at once |
| `/tags` | List your tags |
| `/untag <id> [tag]` | Remove a tag |
| `/wishadd <card>` | Watch for a card |
| `/wishremove <card>` | Stop watching |
| `/wl` | View your wishlist |
| `/setcommander <id>` | Set your clash/raid commander |
| `/clash` | PvP commander battle |
| `/dailyraid` | Fight the daily raid boss |
| `/stats <id>` | View commander battle stats |

---

## Text Shortcuts

Your server may have **text shortcuts** enabled — quick commands you can type in chat instead of using slash commands. Ask an admin if shortcuts are enabled and what the prefix is (default: `k`).

| Shortcut | What it does |
|----------|-------------|
| `kd` | Drop 3 cards |
| `kld` | Drop 3 nonbasic lands |
| `kcmd` | Drop 3 commanders |
| `kcld <color>` | Drop 3 cards by color |
| `kc [args]` | View your collection (sort, filter, search) |
| `km` | View the market |
| `kbuy <slot>` | Buy from market (A–L) |
| `kts` | Browse the Tool Shop |
| `kb [id]` | Burn a card for gold |
| `kcd` | Check cooldowns |
| `kt <tag> [id]` | Tag a card |
| `kmt <tag> <ids>` | Tag multiple cards |
| `klu [id]` | Look up a card |
| `kg @user <id>` | Give a card |
| `kwa <name>` | Add to wishlist |
| `kwr <name>` | Remove from wishlist |

Examples: `kd`, `kld`, `kcld blue`, `kc @User rarity album`, `kc s:rhystic`, `kb ABC123`, `kbuy A`, `kt favorites`, `kmt deck ABC123 DEF456`, `kg @User ABC123`, `kwa Rhystic Study`

---

## Clash — PvP Commander Battles

Battle your legendary creatures against other players!

1. **Set your commander:** `/setcommander <id>` — pick a legendary creature from your collection.
2. **Challenge:** `/clash` — challenge another player in the server. They have 60 seconds to accept.
3. **View stats:** `/stats <id>` — see ATK, DEF, HP, Speed, Crit Rate, abilities, type, and W/L record.

### How Battles Work
- Commanders attack in turns based on **Speed** (lower CMC = faster).
- Each attack cycles through a **color pattern** from the card's mana cost.
- **Type matchups** follow a color wheel: **W > B > G > U > R > W** (1.5× super effective, 0.5× weak).
- **Crit hits** deal 1.5× damage. Crit rate depends on card condition (Poor: 10%, Good: 20%, Mint: 30%).
- Battles last up to 100 total attacks before a stalemate.

### Keyword Abilities
Cards with combat keywords get special effects:
- **First Strike** — attack first | **Double Strike** — bonus hit at 20% damage
- **Deathtouch** — instant kill at ≤10% HP | **Indestructible** — survive one lethal hit
- **Lifelink** — heal 15% of damage dealt
- **Flying/Trample** — +20% ATK | **Defender** — +25% DEF | **Haste/Flash** — +25% Speed

### Stats at a Glance
| Stat | Based On |
|------|----------|
| ATK | Power |
| DEF | Toughness |
| HP | Text length + CMC |
| Speed | CMC (lower = faster) |
| Crit Rate | Card condition |

---

## Daily Raid — PvE Boss Battle

Every day a new **raid boss** appears — the same for all servers!

- `/dailyraid` — View and fight the daily boss.
- The boss has **max stats** (Mint condition, max bonuses) plus a bonus ability.
- **Reward:** 3 cards matching the boss's color identity (once per day).

---

Happy collecting! May your pulls be mythic and your conditions be mint.
```
