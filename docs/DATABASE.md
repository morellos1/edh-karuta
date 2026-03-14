# EDH Karuta - Database Schema

**Database:** SQLite (via Prisma ORM)
**Schema file:** [`prisma/schema.prisma`](../prisma/schema.prisma)
**Models:** 15 total
**Migrations:** 16 incremental migrations in `prisma/migrations/`

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──────────────────────┐          ┌──────────────────────┐               │
│   │       Card           │          │       Drop           │               │
│   ├──────────────────────┤          ├──────────────────────┤               │
│   │ id            PK     │◄─┐  ┌──▶│ id            PK     │               │
│   │ scryfallId    UQ     │  │  │   │ guildId              │               │
│   │ name                 │  │  │   │ channelId            │               │
│   │ setCode              │  │  │   │ messageId     UQ     │               │
│   │ setName              │  │  │   │ dropperUserId        │               │
│   │ collectorNumber      │  │  │   │ dropType             │               │
│   │ releasedAt           │  │  │   │ expiresAt            │               │
│   │ lang                 │  │  │   │ resolvedAt           │               │
│   │ usdPrice             │  │  │   │ createdAt            │               │
│   │ manaCost             │  │  │   └──────────┬───────────┘               │
│   │ typeLine             │  │  │              │                            │
│   │ oracleText           │  │  │              │ 1:N                        │
│   │ power                │  │  │              │                            │
│   │ toughness            │  │  │   ┌──────────▼───────────┐               │
│   │ colors               │  │  │   │     DropSlot         │               │
│   │ colorIdentity        │  │  │   ├──────────────────────┤               │
│   │ imagePng             │  ├──┼───│ cardId        FK     │               │
│   │ imageSmall           │  │  │   │ dropId        FK     │──────┘        │
│   │ imageNormal          │  │  │   │ id            PK     │               │
│   │ imageLarge           │  │  │   │ slotIndex            │               │
│   │ isBasicLand          │  │  │   │ claimedByUserId      │               │
│   │ isCommanderLegal     │  │  │   │ claimedAt            │               │
│   │ rarity               │  │  │   │                      │               │
│   │ randomWeight         │  │  │   │ UQ(dropId,slotIndex) │               │
│   │ createdAt            │  │  │   └──────────────────────┘               │
│   │ updatedAt            │  │  │                                           │
│   └──────────────────────┘  │  │                                           │
│              ▲               │  │                                           │
│              │               │  │                                           │
│              │ N:1           │  │                                           │
│              │               │  │                                           │
│   ┌──────────┴───────────┐  │  │                                           │
│   │     UserCard         │  │  │                                           │
│   ├──────────────────────┤  │  │                                           │
│   │ id            PK     │◄─┼──┼──┐                                       │
│   │ displayId     UQ     │  │  │  │                                       │
│   │ userId               │  │  │  │                                       │
│   │ cardId        FK  ───┘  │  │  │                                       │
│   │ dropId        FK  ──────┘  │  │                                       │
│   │ condition            │     │  │                                       │
│   │ claimedAt            │     │  │                                       │
│   └──────────────────────┘     │  │                                       │
│              ▲                  │  │                                       │
│              │                  │  │                                       │
│              │ N:M via join     │  │                                       │
│              │                  │  │                                       │
│   ┌──────────┴───────────┐     │  │    ┌──────────────────────┐           │
│   │    UserCardTag       │     │  │    │       Tag            │           │
│   ├──────────────────────┤     │  │    ├──────────────────────┤           │
│   │ userCardId    FK/PK  │─────┘  │    │ id            PK     │           │
│   │ tagId         FK/PK  │────────┼───▶│ userId               │           │
│   │                      │        │    │ name                 │           │
│   │ PK(userCardId,tagId) │        │    │ createdAt            │           │
│   └──────────────────────┘        │    │                      │           │
│                                   │    │ UQ(userId, name)     │           │
│                                   │    └──────────────────────┘           │
│                                   │                                       │
└───────────────────────────────────┼───────────────────────────────────────┘
                                    │
                                    │
  Standalone Tables (no FKs)        │
  ──────────────────────────        │
                                    │
  ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────┐
  │   UserInventory      │   │     Wishlist         │   │   BotConfig      │
  ├──────────────────────┤   ├──────────────────────┤   ├──────────────────┤
  │ userId        PK     │   │ id            PK     │   │ key         PK   │
  │ gold                 │   │ userId               │   │ value            │
  └──────────────────────┘   │ guildId              │   └──────────────────┘
                             │ cardName             │
                             │ createdAt            │   ┌──────────────────┐
                             │                      │   │  GuildSettings   │
                             │ UQ(userId,guildId,   │   ├──────────────────┤
                             │    cardName)         │   │ guildId     PK   │
                             └──────────────────────┘   │ prefix           │
                                                        │ shortcutsEnabled │
  Cooldown Tables (one per type)                        └──────────────────┘
  ──────────────────────────────
  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
  │ ClaimCooldown    │ │ DropCooldown     │ │ ColordropCooldown        │
  ├──────────────────┤ ├──────────────────┤ ├──────────────────────────┤
  │ userId      PK   │ │ userId      PK   │ │ userId            PK    │
  │ lastClaimedAt    │ │ lastUsedAt       │ │ lastUsedAt              │
  └──────────────────┘ └──────────────────┘ └──────────────────────────┘

  ┌──────────────────────────┐ ┌──────────────────────────┐
  │ CommanderdropCooldown    │ │ LanddropCooldown         │
  ├──────────────────────────┤ ├──────────────────────────┤
  │ userId            PK     │ │ userId            PK     │
  │ lastUsedAt               │ │ lastUsedAt               │
  └──────────────────────────┘ └──────────────────────────┘
```

---

## Table Details

### Card

The MTG card catalog, synced from Scryfall's bulk data API. Each row is a single printing of a card (e.g., "Lightning Bolt" has many rows, one per set it was printed in).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Int | PK, auto-increment | Internal ID |
| `scryfallId` | String | Unique | Scryfall UUID |
| `name` | String | Indexed | Card name (e.g., "Lightning Bolt") |
| `setCode` | String | Indexed (composite) | Set code (e.g., "m21") |
| `setName` | String? | — | Full set name |
| `collectorNumber` | String | Indexed (composite) | Collector number within set |
| `releasedAt` | String? | — | Release date (YYYY-MM-DD) |
| `lang` | String? | Indexed (composite) | Language code (filtered to "en") |
| `usdPrice` | String? | — | Current USD market price |
| `manaCost` | String? | — | Mana cost string (e.g., "{1}{R}") |
| `typeLine` | String? | — | Type line (e.g., "Instant") |
| `oracleText` | String? | — | Rules text |
| `power` | String? | — | Power (creatures only) |
| `toughness` | String? | — | Toughness (creatures only) |
| `colors` | String? | — | Card colors, comma-separated |
| `colorIdentity` | String? | — | Commander color identity |
| `imagePng` | String? | — | Full-res PNG URL |
| `imageSmall` | String? | — | Small image URL |
| `imageNormal` | String? | — | Normal image URL |
| `imageLarge` | String? | — | Large image URL |
| `isBasicLand` | Boolean | Default: false | Whether it's a basic land |
| `isCommanderLegal` | Boolean | Default: false, Indexed (composite) | Commander legality |
| `rarity` | String? | Indexed (composite) | common/uncommon/rare/mythic |
| `randomWeight` | Int | Default: 1 | Weight for random selection |
| `createdAt` | DateTime | Default: now() | Record creation time |
| `updatedAt` | DateTime | Auto-updated | Last update time |

**Indexes:**
- `name` — Fast lookup for wishlist matching and card search
- `(setCode, collectorNumber)` — Unique print identification
- `(isCommanderLegal, lang, isBasicLand, rarity)` — Drop card selection hot path

**Relations:** → UserCard (1:N), → DropSlot (1:N)

---

### UserCard

An individual card instance owned by a user. Created when a user claims a card from a drop.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Int | PK, auto-increment | Internal ID |
| `displayId` | String | Unique | 6-char alphanumeric display code |
| `userId` | String | Indexed (composite) | Discord user ID of owner |
| `cardId` | Int | FK → Card.id, Indexed | Which card this is |
| `dropId` | Int | FK → Drop.id | Which drop it came from |
| `condition` | String | Default: "good" | "poor", "good", or "mint" |
| `claimedAt` | DateTime | Default: now(), Indexed (composite) | When the card was claimed |

**Indexes:**
- `(userId, claimedAt)` — Collection listing sorted by recency
- `(userId, dropId)` — Lookup cards from a specific drop
- `(cardId)` — Circulation count queries

**Relations:** → Card (N:1), → Drop (N:1), → UserCardTag (1:N)

---

### Drop

A drop event that contains 3 card slots. Created when a user runs `/drop` (or variants) or by the auto-drop scheduler.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Int | PK, auto-increment | Internal ID |
| `guildId` | String | — | Discord server ID |
| `channelId` | String | — | Discord channel ID |
| `messageId` | String? | Unique | Discord message ID for the drop |
| `dropperUserId` | String | — | Who initiated the drop |
| `dropType` | String | Default: "regular" | "regular", "colordrop", "commanderdrop", "landdrop" |
| `expiresAt` | DateTime | — | When unclaimed slots expire |
| `resolvedAt` | DateTime? | — | When all slots resolved (claimed or expired) |
| `createdAt` | DateTime | Default: now() | Drop creation time |

**Relations:** → DropSlot (1:N, max 3), → UserCard (1:N)

---

### DropSlot

An individual card slot within a drop. Each drop has exactly 3 slots (indices 0, 1, 2).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Int | PK, auto-increment | Internal ID |
| `dropId` | Int | FK → Drop.id | Parent drop |
| `slotIndex` | Int | Unique (composite) | Slot position (0, 1, or 2) |
| `cardId` | Int | FK → Card.id | Card in this slot |
| `claimedByUserId` | String? | Indexed (composite) | Discord ID of claimer (null if unclaimed) |
| `claimedAt` | DateTime? | — | When claimed (null if unclaimed) |

**Unique constraints:** `(dropId, slotIndex)`
**Indexes:** `(dropId, claimedByUserId)`
**Relations:** → Drop (N:1), → Card (N:1)

---

### UserInventory

Tracks each user's gold balance. Gold is earned by burning cards and spent at the market.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `userId` | String | PK | Discord user ID |
| `gold` | Int | Default: 0 | Current gold balance |

---

### Tag

Custom labels that users create to organize their collections. Each tag belongs to one user.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Int | PK, auto-increment | Internal ID |
| `userId` | String | Indexed | Discord user ID |
| `name` | String | Unique (composite) | Tag name |
| `createdAt` | DateTime | Default: now() | Creation time |

**Unique constraints:** `(userId, name)` — Each user's tag names are unique
**Relations:** → UserCardTag (1:N)

---

### UserCardTag

Join table for the many-to-many relationship between UserCard and Tag. Allows users to assign multiple tags to each card.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `userCardId` | Int | FK → UserCard.id, PK (composite) | Card instance |
| `tagId` | Int | FK → Tag.id, PK (composite) | Tag applied |

**Primary key:** `(userCardId, tagId)`
**Cascade deletes:** Rows are removed if either the UserCard or Tag is deleted.

---

### Wishlist

Per-guild wishlists. Users get notified when a wishlisted card appears in a drop within their server.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Int | PK, auto-increment | Internal ID |
| `userId` | String | Unique (composite) | Discord user ID |
| `guildId` | String | Indexed (composite) | Discord server ID |
| `cardName` | String | Unique (composite), Indexed (composite) | Exact card name to watch for |
| `createdAt` | DateTime | Default: now() | When added to wishlist |

**Unique constraints:** `(userId, guildId, cardName)` — One entry per card per server per user
**Indexes:** `(guildId, cardName)` — Fast lookup when a drop occurs to find watchers

---

### BotConfig

Simple key-value store for bot-wide configuration (e.g., which channel to use for auto-drops).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | String | PK | Config key name |
| `value` | String | — | Config value |

**Known keys:** `dropChannelId` — Channel for auto-drops

---

### GuildSettings

Per-server configuration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `guildId` | String | PK | Discord server ID |
| `prefix` | String | Default: "k" | Text command prefix |
| `shortcutsEnabled` | Boolean | Default: false | Whether text shortcuts are active |

---

### Cooldown Tables

Five separate tables track cooldowns for different actions. Each stores only one row per user (upserted on use).

#### ClaimCooldown

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `userId` | String | PK | Discord user ID |
| `lastClaimedAt` | DateTime | — | Last claim timestamp |

#### DropCooldown

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `userId` | String | PK | Discord user ID |
| `lastUsedAt` | DateTime | — | Last regular drop timestamp |

#### ColordropCooldown

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `userId` | String | PK | Discord user ID |
| `lastUsedAt` | DateTime | — | Last color drop timestamp |

#### CommanderdropCooldown

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `userId` | String | PK | Discord user ID |
| `lastUsedAt` | DateTime | — | Last commander drop timestamp |

#### LanddropCooldown

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `userId` | String | PK | Discord user ID |
| `lastUsedAt` | DateTime | — | Last land drop timestamp |

---

### ExtraCommanderDrop

Purchased items that let users bypass the Commander Drop cooldown. Each row is a single-use token.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | Int | PK, auto-increment | Internal ID |
| `userId` | String | Indexed (composite) | Discord user ID |
| `createdAt` | DateTime | Default: now() | When purchased |
| `usedAt` | DateTime? | Indexed (composite) | When consumed (null = unused) |

**Indexes:** `(userId, usedAt)` — Count/find unused tokens for a user

---

## Relationship Summary

```
Card ──────────── 1:N ────────────▶ UserCard
Card ──────────── 1:N ────────────▶ DropSlot
Drop ──────────── 1:N (max 3) ───▶ DropSlot
Drop ──────────── 1:N ────────────▶ UserCard
UserCard ──────── N:M (via join) ─▶ Tag        (through UserCardTag)
```

### Key Relationships Explained

1. **Card → UserCard** — One card printing can be owned by many users. The `cardId` on UserCard points to the specific printing.

2. **Card → DropSlot** — Each slot in a drop references a specific card printing.

3. **Drop → DropSlot** — Each drop has exactly 3 slots (slotIndex 0, 1, 2).

4. **Drop → UserCard** — When a card is claimed from a drop, the UserCard records which drop it came from.

5. **UserCard ↔ Tag** — Many-to-many through UserCardTag. Users can tag cards in their collection for organization (e.g., "favorites", "trade", "deck-atraxa").

---

## Data Flow: Card Lifecycle

```
Scryfall Bulk API
       │
       │  npm run sync:scryfall
       ▼
┌──────────────┐
│   Card       │  ~90,000+ rows (all commander-legal English printings)
│   (catalog)  │
└──────┬───────┘
       │
       │  /drop selects 3 random cards
       ▼
┌──────────────┐
│   Drop       │  Created with 3 DropSlots
│   DropSlot   │
└──────┬───────┘
       │
       │  User claims a slot
       ▼
┌──────────────┐
│   UserCard   │  New instance with condition + displayId
└──────┬───────┘
       │
       ├──▶ /collection - View owned cards
       ├──▶ /tag        - Organize with tags  ──▶  Tag + UserCardTag
       ├──▶ /trade      - Trade with others   ──▶  UserCard.userId changes
       ├──▶ /give       - Gift to someone     ──▶  UserCard.userId changes
       └──▶ /burn       - Convert to gold     ──▶  UserCard deleted
                                                    UserInventory.gold increased
```

---

## Index Strategy

| Table | Index | Purpose |
|-------|-------|---------|
| Card | `name` | Wishlist matching, card search |
| Card | `(setCode, collectorNumber)` | Unique print identification during Scryfall sync |
| Card | `(isCommanderLegal, lang, isBasicLand, rarity)` | Drop card selection (avoids full table scan) |
| UserCard | `(userId, claimedAt)` | Collection listing sorted by recency |
| UserCard | `(userId, dropId)` | Check if user already claimed from a drop |
| UserCard | `(cardId)` | Circulation count (how many of this card exist) |
| DropSlot | `(dropId, claimedByUserId)` | Check claim status per drop |
| Tag | `(userId)` | List user's tags |
| Wishlist | `(guildId, cardName)` | Find watchers when a card drops |

---

See also: [Architecture Overview](./ARCHITECTURE.md)
