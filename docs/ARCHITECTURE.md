# EDH Karuta - Architecture Overview

EDH Karuta is a Discord bot inspired by the card collection game [Karuta](https://karuta.com/), built around **Magic: The Gathering** Commander-legal cards. Users collect cards through "drops" (random card reveals), manage collections with tagging, trade cards, and participate in a gold-based economy.

---

## Tech Stack

| Layer              | Technology                          |
|--------------------|-------------------------------------|
| **Language**       | TypeScript (strict mode)            |
| **Runtime**        | Node.js 20+                         |
| **Bot Framework**  | discord.js v14                       |
| **ORM**            | Prisma v6                            |
| **Database**       | SQLite (WAL mode)                    |
| **Image Processing** | sharp                              |
| **HTTP Client**    | axios                                |
| **Validation**     | Zod                                  |
| **Testing**        | Vitest                               |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Discord                                        │
│                                                                             │
│    Users send slash commands (/drop, /collection, /trade, etc.)             │
│    Users click buttons (Claim, Accept Trade, Burn Confirm, etc.)            │
│    Users send text messages (shortcut commands like "k drop")               │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         discord.js Client                                   │
│                         (src/index.ts)                                       │
│                                                                             │
│  Listens for events:                                                        │
│    • interactionCreate  ──→  Routes slash commands & button clicks           │
│    • messageCreate      ──→  Routes text shortcut commands                   │
│    • ready              ──→  Starts scheduler, cleanup, SQLite pragmas       │
└────────┬──────────────────────┬──────────────────────┬──────────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   27 Slash      │  │   7 Button/         │  │   Shortcut          │
│   Commands      │  │   Interaction       │  │   Handler           │
│   (src/commands)│  │   Handlers          │  │   (src/handlers)    │
│                 │  │   (src/interactions) │  │                     │
│ • drop          │  │                     │  │ Converts text       │
│ • colordrop     │  │ • claimButton       │  │ commands like       │
│ • commanderdrop │  │ • collectionButton  │  │ "k drop" into       │
│ • landdrop      │  │ • marketButton      │  │ slash command       │
│ • collection    │  │ • cardPrintButton   │  │ invocations         │
│ • lookup        │  │ • burnButton        │  │                     │
│ • card          │  │ • bulkBurnButton    │  └─────────────────────┘
│ • market / buy  │  │ • tradeGiveButton   │
│ • burn/bulkburn │  │                     │
│ • give / trade  │  └──────────┬──────────┘
│ • tag commands  │             │
│ • wishlist cmds │             │
│ • config cmds   │             │
│ • cd (cooldowns)│             │
└────────┬────────┘             │
         │                      │
         └──────────┬───────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Services Layer                                     │
│                          (src/services)                                      │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  dropService      │  │  cooldownService │  │  conditionService        │  │
│  │                   │  │                  │  │                          │  │
│  │  • Create drops   │  │  • Check/set     │  │  • Assign card condition │  │
│  │  • Process claims │  │    cooldowns     │  │    (poor/good/mint)      │  │
│  │  • Claim queue    │  │  • Format time   │  │  • Calculate gold value  │  │
│  │    with debouncing│  │    remaining     │  │  • Condition multipliers │  │
│  │  • Per-user locks │  │                  │  │                          │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  marketService    │  │  botDropScheduler│  │  scryfallSync            │  │
│  │                   │  │                  │  │                          │  │
│  │  • 6-card rotating│  │  • Auto-drops    │  │  • Bulk card import      │  │
│  │    market display │  │    every 30 min  │  │    from Scryfall API     │  │
│  │  • Seeded RNG for │  │  • Posts to      │  │  • Streaming JSON parser │  │
│  │    deterministic  │  │    configured    │  │  • Filters commander-    │  │
│  │    card selection │  │    channel       │  │    legal English cards   │  │
│  │  • 3-hour refresh │  │                  │  │                          │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  wishlistService  │  │  collageService  │  │  dropCleanupService      │  │
│  │                   │  │                  │  │                          │  │
│  │  • Build wishlist │  │  • Compose card  │  │  • Marks expired drops   │  │
│  │    notifications  │  │    image collages│  │    as resolved           │  │
│  │    on drops       │  │  • In-memory LRU │  │                          │  │
│  │                   │  │    image cache   │  │                          │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Repository Layer                                     │
│                        (src/repositories)                                    │
│                                                                             │
│  ┌───────────────┐ ┌──────────────┐ ┌────────────────┐ ┌───────────────┐   │
│  │ cardRepo      │ │ userCardRepo │ │ collectionRepo │ │ inventoryRepo │   │
│  │               │ │              │ │                │ │               │   │
│  │ Card queries, │ │ User card    │ │ Paginated      │ │ Gold balance  │   │
│  │ rarity-based  │ │ lookups,     │ │ collection w/  │ │ operations    │   │
│  │ random picks, │ │ circulation  │ │ dynamic sort   │ │ (credit/debit)│   │
│  │ pool caching  │ │ counts       │ │ (raw SQL)      │ │               │   │
│  └───────────────┘ └──────────────┘ └────────────────┘ └───────────────┘   │
│                                                                             │
│  ┌───────────────┐ ┌──────────────┐ ┌────────────────┐ ┌───────────────┐   │
│  │ wishlistRepo  │ │ tagRepo      │ │ botConfigRepo  │ │ guildSettings │   │
│  │               │ │              │ │                │ │ Repo          │   │
│  │ Wishlist CRUD │ │ Tag CRUD,    │ │ Key-value      │ │               │   │
│  │ + watcher     │ │ card-tag     │ │ config store,  │ │ Per-guild     │   │
│  │ lookups       │ │ associations │ │ all cooldown   │ │ settings      │   │
│  │               │ │              │ │ operations     │ │ (prefix, etc) │   │
│  └───────────────┘ └──────────────┘ └────────────────┘ └───────────────┘   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Prisma ORM + SQLite                                  │
│                        (src/db.ts + prisma/schema.prisma)                   │
│                                                                             │
│  SQLite with performance pragmas:                                           │
│    • WAL mode (concurrent reads during writes)                              │
│    • 5s busy timeout                                                        │
│    • 20 MB page cache                                                       │
│    • Foreign keys enforced                                                  │
│                                                                             │
│  14 models  •  16 migrations  •  Indexed hot paths                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
edh-karuta/
├── src/
│   ├── index.ts                # Entry point: client setup, event routing
│   ├── config.ts               # Env vars + game.config.json loading
│   ├── db.ts                   # Prisma client + SQLite pragma init
│   ├── commands/               # 27 slash command implementations
│   │   ├── drop.ts             #   Regular drop (3 random cards)
│   │   ├── colordrop.ts        #   Color-filtered drop
│   │   ├── commanderdrop.ts    #   Commander-eligible drop
│   │   ├── landdrop.ts        #   Nonbasic land drop
│   │   ├── collection.ts       #   Paginated collection viewer
│   │   ├── lookup.ts           #   Single card by display ID
│   │   ├── card.ts             #   Card details + all prints
│   │   ├── market.ts           #   Rotating market display
│   │   ├── buy.ts              #   Purchase from market
│   │   ├── burn.ts             #   Burn card for gold
│   │   ├── bulkburn.ts         #   Burn multiple cards
│   │   ├── give.ts             #   Give card to user
│   │   ├── trade.ts            #   1-for-1 card trade
│   │   ├── tagcreate.ts        #   Create collection tag
│   │   ├── tagdelete.ts        #   Delete tag
│   │   ├── tagrename.ts        #   Rename tag
│   │   ├── tag.ts              #   Tag a card
│   │   ├── tags.ts             #   List tags
│   │   ├── untag.ts            #   Remove tag from card
│   │   ├── wishadd.ts          #   Add to wishlist
│   │   ├── wishremove.ts       #   Remove from wishlist
│   │   ├── wl.ts               #   View wishlist
│   │   ├── setdropchannel.ts   #   Set auto-drop channel (admin)
│   │   ├── setprefix.ts        #   Set command prefix
│   │   ├── shortcut.ts         #   Toggle text shortcuts
│   │   └── cd.ts               #   View cooldowns
│   ├── interactions/           # Button/interaction handlers
│   │   ├── claimButton.ts      #   Drop slot claiming
│   │   ├── collectionButton.ts #   Collection pagination
│   │   ├── marketButton.ts     #   Market pagination
│   │   ├── cardPrintButton.ts  #   Card print cycling
│   │   ├── burnButton.ts       #   Burn confirmation
│   │   ├── bulkBurnButton.ts   #   Bulk burn confirmation
│   │   └── tradeGiveButton.ts  #   Trade/give accept/decline
│   ├── services/               # Business logic
│   │   ├── dropService.ts      #   Drop creation & claim processing
│   │   ├── cooldownService.ts  #   Cooldown management
│   │   ├── conditionService.ts #   Card condition & gold values
│   │   ├── marketService.ts    #   Market rotation logic
│   │   ├── botDropScheduler.ts #   Auto-drop scheduler
│   │   ├── scryfallSync.ts     #   Card data import
│   │   ├── wishlistService.ts  #   Wishlist notifications
│   │   ├── collageService.ts   #   Image composition
│   │   └── dropCleanupService.ts # Expired drop cleanup
│   ├── repositories/           # Data access layer
│   │   ├── cardRepo.ts         #   Card queries & pool cache
│   │   ├── userCardRepo.ts     #   User card lookups
│   │   ├── collectionRepo.ts   #   Paginated collections
│   │   ├── inventoryRepo.ts    #   Gold balance ops
│   │   ├── wishlistRepo.ts     #   Wishlist CRUD
│   │   ├── tagRepo.ts          #   Tag management
│   │   ├── botConfigRepo.ts    #   Config + cooldowns
│   │   ├── extraCommanderDropRepo.ts # Extra commanderdrop inventory
│   │   └── guildSettingsRepo.ts#   Guild settings
│   ├── handlers/
│   │   └── shortcutHandler.ts  # Text command → slash command routing
│   ├── utils/
│   │   ├── cardFormatting.ts   #   Color emojis, gold formatting
│   │   ├── cooldownFormatting.ts#  Human-readable cooldowns
│   │   ├── displayId.ts        #   6-char alphanumeric ID generation
│   │   └── asyncLock.ts        #   Per-key mutex for concurrency
│   └── types/                  # TypeScript type definitions
├── prisma/
│   ├── schema.prisma           # Database schema (14 models)
│   ├── migrations/             # 16 migration files
│   └── recompute-colors.ts     # Utility script
├── scripts/
│   ├── registerCommands.ts     # Register slash commands in Discord
│   └── resetCollection.ts      # Admin: reset user collections
├── game.config.json            # Game balance tuning
├── topedhrec.csv               # Top EDH recommendations for market
├── .env.example                # Environment variable template
├── package.json
└── tsconfig.json
```

---

## Core Game Mechanics

### Drop System

Drops are the primary way users acquire cards. Each drop reveals 3 random cards that anyone in the channel can claim.

```
User runs /drop
       │
       ▼
┌──────────────┐     ┌───────────────────┐     ┌──────────────────┐
│ Check drop   │────▶│ Select 3 random   │────▶│ Compose image    │
│ cooldown     │     │ cards (weighted    │     │ collage (sharp)  │
│ (2 min)      │     │ by rarity)        │     │                  │
└──────────────┘     └───────────────────┘     └────────┬─────────┘
                                                        │
                                                        ▼
                                                ┌──────────────────┐
                                                │ Post to Discord  │
                                                │ with Claim       │
                                                │ buttons (1/2/3)  │
                                                └────────┬─────────┘
                                                         │
                           ┌─────────────────────────────┤
                           ▼                             ▼
                   ┌──────────────┐             ┌──────────────────┐
                   │ User clicks  │             │ Drop expires     │
                   │ Claim button │             │ after 60 seconds │
                   └──────┬───────┘             │ (unclaimed slots │
                          │                     │  are lost)       │
                          ▼                     └──────────────────┘
                   ┌──────────────────────────────┐
                   │ Claim Queue (120ms debounce) │
                   │ • Dropper gets priority       │
                   │ • Per-user async lock          │
                   │ • Check claim cooldown (60s)   │
                   │ • Assign condition             │
                   │ • Create UserCard in DB        │
                   └──────────────────────────────┘
```

### Drop Types

| Type | Command | Cooldown | Card Pool |
|------|---------|----------|-----------|
| Regular | `/drop` | 2 min | All commander-legal |
| Color | `/colordrop <color>` | 12 hours | Matching color identity |
| Commander | `/commanderdrop` | 24 hours | Creature/planeswalker commanders |
| Land | `/landdrop` | 2 hours | Nonbasic lands |
| Auto | *(scheduled)* | 30 min | All commander-legal |

### Card Conditions & Economy

```
Card dropped
     │
     ▼
┌────────────────────────────────┐
│ Random condition assignment:   │
│   • Poor:  50% chance  (1x)   │
│   • Good:  40% chance  (3x)   │
│   • Mint:  10% chance  (10x)  │
└────────────────┬───────────────┘
                 │
                 ▼
┌────────────────────────────────┐
│ Gold Value Calculation:        │
│                                │
│   gold = USD price × 100      │
│          × condition multiplier│
│                                │
│ Example: $2.50 card, mint     │
│   = 250 × 10 = 2,500 gold    │
└────────────────────────────────┘
```

### Card Selection Algorithm

```
┌─────────────────────────────────────────────┐
│ Card Pool (cached, 5-min TTL)               │
│                                             │
│ 1. Filter: commander-legal, English,        │
│    non-basic-land                           │
│ 2. Group by card name                       │
│ 3. Weight = log(print_count) compression    │
│    (prevents cards with many prints from    │
│     dominating the pool)                    │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│ Rarity Roll (per card slot)                 │
│                                             │
│   Common:   50%                             │
│   Uncommon: 30%                             │
│   Rare:     15%                             │
│   Mythic:    5%                             │
│                                             │
│ Pick random card name from rarity pool,     │
│ then pick random print of that card.        │
└─────────────────────────────────────────────┘
```

---

## Request Flow

### Slash Command Flow

```
Discord API  ──▶  discord.js client  ──▶  interactionCreate event
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │ Route by command  │
                                          │ name to handler   │
                                          └────────┬─────────┘
                                                   │
                                          ┌────────▼─────────┐
                                          │ Command.execute() │
                                          │  1. Validate args │
                                          │  2. Defer reply   │
                                          │  3. Call services  │
                                          │  4. Call repos     │
                                          │  5. Edit reply     │
                                          └──────────────────┘
```

### Button Interaction Flow

```
User clicks button  ──▶  interactionCreate event
                                   │
                                   ▼
                         ┌──────────────────────┐
                         │ Parse customId:       │
                         │  "claim:dropId:slot"  │
                         │  "col:userId:page"    │
                         │  "burn:cardId:confirm" │
                         └────────┬──────────────┘
                                  │
                                  ▼
                         ┌──────────────────────┐
                         │ Route to interaction  │
                         │ handler by prefix     │
                         └──────────────────────┘
```

---

## Concurrency & Performance

### Claim Serialization

The drop claim system handles race conditions with a two-tier locking strategy:

```
Multiple users click "Claim" simultaneously
              │
              ▼
┌─────────────────────────────────────┐
│ Per-Drop Claim Queue                │
│                                     │
│ • 120ms debounce window             │
│ • Dropper gets priority if they     │
│   claimed within the window         │
│ • Batched processing after debounce │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ Per-User Async Lock                 │
│                                     │
│ • Prevents same user from claiming  │
│   across multiple drops at once     │
│ • Serializes claim transactions     │
│   per user                          │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ Database Transaction                │
│                                     │
│ • Verify slot not already claimed   │
│ • Verify user cooldown not active   │
│ • Create UserCard + set cooldown    │
│ • All within single transaction     │
└─────────────────────────────────────┘
```

### Caching Strategy

| Cache | TTL | Max Size | Purpose |
|-------|-----|----------|---------|
| Card Pool | 5 min | — | Avoid expensive groupBy on every drop |
| Image Cache | 30 min | 200 images (~60 MB) | Avoid re-downloading card art |
| Market Cards | Per 3-hour slot | — | Deterministic market via seeded RNG |

### SQLite Optimizations

| Pragma | Value | Purpose |
|--------|-------|---------|
| `journal_mode` | WAL | Concurrent readers during writes |
| `busy_timeout` | 5000 ms | Wait on lock contention |
| `cache_size` | -20000 (20 MB) | Larger page cache |
| `foreign_keys` | ON | Enforce referential integrity |

---

## External Services

```
┌──────────────┐        ┌──────────────┐
│  Scryfall    │        │  Discord     │
│  Bulk API    │        │  API         │
│              │        │              │
│  Card data   │        │  Bot login   │
│  Images      │        │  Commands    │
│  Prices      │        │  Messages    │
│              │        │  Buttons     │
└──────┬───────┘        └──────┬───────┘
       │                       │
       │   HTTPS               │   WebSocket + REST
       │                       │
       ▼                       ▼
┌─────────────────────────────────────┐
│           EDH Karuta Bot            │
└─────────────────────────────────────┘
```

- **Scryfall** — MTG card database. Used for bulk card import (~90k+ prints). Provides card names, sets, prices, images, legality, and color data.
- **Discord** — Bot framework. Handles slash commands, button interactions, message events, embeds, and file attachments.

---

## Configuration

### Environment Variables (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot authentication token |
| `DISCORD_CLIENT_ID` | Yes | Application ID for command registration |
| `DISCORD_GUILD_ID` | No | Restrict commands to a single server |
| `DATABASE_URL` | No | SQLite path (default: `file:./dev.db`) |
| `LOG_SLOW_QUERY_MS` | No | Log queries slower than this threshold |

### Game Balance (`game.config.json`)

All gameplay parameters are externalized for easy tuning:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `claimCooldownSeconds` | 60 | Time between claims |
| `dropCooldownSeconds` | 120 | Time between regular drops |
| `colordropCooldownSeconds` | 43200 | Color drop cooldown (12h) |
| `commanderdropCooldownSeconds` | 86400 | Commander drop cooldown (24h) |
| `landdropCooldownSeconds` | 7200 | Land drop cooldown (2h) |
| `dropExpireSeconds` | 60 | Seconds before unclaimed cards expire |
| `maxWishlistSlots` | 10 | Max wishlist entries per server |
| `autoDropIntervalSeconds` | 1800 | Auto-drop frequency (30 min) |
| `toolshop.extraClaimPrice` | 25000 | Extra Claim cost (gold) |
| `toolshop.extraCommanderDropPrice` | 10000 | Extra CommanderDrop cost (gold) |

---

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Discord bot token and client ID

# Initialize database
npx prisma generate
npx prisma migrate deploy

# Import card data from Scryfall (~90k cards)
npm run sync:scryfall

# Register slash commands in Discord
npm run register:commands

# Start the bot
npm run dev
```

See also: [Database Schema](./DATABASE.md)
