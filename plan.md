# Endless Tower Mode - Implementation Plan

## Overview
An endless, floor-based PvE mode where players fight increasingly difficult random bosses. Tracks records per-commander and per-user. Rewards gold + cards for first-time floor clears.

---

## 1. Database Schema Changes (`prisma/schema.prisma`)

### New Model: `EndlessTowerRecord`
Tracks the best floor reached per commander (UserCard) per user per guild.

```prisma
model EndlessTowerRecord {
  id          Int    @id @default(autoincrement())
  discordId   String
  guildId     String
  userCardId  Int
  bestFloor   Int    @default(0)
  updatedAt   DateTime @updatedAt

  userCard    UserCard @relation(fields: [userCardId], references: [id], onDelete: Cascade)

  @@unique([discordId, guildId, userCardId])
  @@index([discordId, guildId])
}
```

### New Model: `EndlessTowerReward`
Tracks which floors a user has already claimed rewards for (first-clear-only).

```prisma
model EndlessTowerReward {
  id        Int    @id @default(autoincrement())
  userId    String
  floor     Int
  claimedAt DateTime @default(now())

  @@unique([userId, floor])
  @@index([userId])
}
```

### Update `UserCard` model
Add relation: `endlessTowerRecords EndlessTowerRecord[]`

---

## 2. New Service: `src/services/endlessTowerService.ts`

### Boss Generation
- `generateFloorBoss(floor: number)`:
  - Pick a random creature card from the full card pool (not just commander-legal)
  - Build stats using `buildClashStats()` with "mint" condition and moderate base bonuses
  - **Floor 1 baseline**: Use lower bonuses than daily boss (e.g., `bonusAttack: 50, bonusDefense: 50, bonusHp: 50, bonusSpeed: 10, bonusCritRate: 10`) and NO HP boost (daily boss has +50% HP and max 200 bonuses)
  - **Scaling**: Multiply each stat by `1 + (floor - 1) * 0.05` (5% increase per floor)
  - **Ability gain**: Every 5 floors, add 1 random keyword ability the boss doesn't already have (with corresponding stat bonuses via `applyAbilityBonus()`)

### Record Management
- `getRecord(discordId, guildId, userCardId)`: Get best floor for this commander
- `getBestRecord(discordId, guildId)`: Get user's overall best floor across all commanders
- `updateRecord(discordId, guildId, userCardId, floor)`: Update if new floor > current best

### Reward Management
- `hasClaimedFloorReward(userId, floor)`: Check if user already claimed this floor
- `claimFloorRewards(userId, floor, bossCard)`:
  - If not already claimed: award 1000 gold + (if floor % 5 === 0) 3 random cards matching boss color identity
  - Mark floor as claimed in `EndlessTowerReward`

---

## 3. New Command: `src/commands/endless.ts`

- Slash command `/endless`
- Loads user's set commander via `loadClashCreature()`
- Shows an embed with:
  - Commander name, image, and stats
  - Best floor record for this commander
  - User's overall best floor record
- Buttons: **"Challenge Endless Tower"** (green) and **"Cancel"** (red)

---

## 4. New Interaction Handler: `src/interactions/endlessTowerButton.ts`

### Challenge Button (`endless_challenge`)
1. Load player's commander stats
2. Generate floor 1 boss
3. Run `simulateBattle()` (same as daily raid)
4. Animate battle with `buildBattleEmbed()` updates (2s delay)
5. On **victory**:
   - Show green embed: "Floor X Conquered!"
   - Process rewards (gold + cards if first clear)
   - Show reward summary in the embed
   - Buttons: **"Proceed to Floor X+1"** and **"Stop (Record: Floor X)"**
6. On **defeat**:
   - Show red embed: "Defeated on Floor X!"
   - Update record if `floor - 1` > current best (they cleared up to `floor - 1`)
   - Show final record
   - No proceed button

### Proceed Button (`endless_proceed_<floor>`)
1. Commander heals to full HP
2. Generate next floor boss
3. Run battle same as above
4. Repeat victory/defeat handling

### Stop Button (`endless_stop`)
1. Save current record (floors cleared so far)
2. Show summary embed with final record

### State Management
- Use a Map (like `activeBattles` in daily raid) to track active endless tower sessions
- Store: `userId -> { currentFloor, guildId, userCardId, commanderStats }`
- Prevent double-clicks and concurrent sessions

---

## 5. Shortcut Handler Update (`src/handlers/shortcutHandler.ts`)

Add `endless` shortcut so `kendless` (or `<prefix>endless`) triggers the endless tower command.

---

## 6. Stats Display Updates

### `clashstats.ts` / stats embed
- When viewing a commander's stats, show its endless tower best floor if one exists
- Format: `Endless Tower: Floor X` in the embed

---

## 7. Registration (`src/index.ts`)

- Import and register the new `/endless` command

---

## File Changes Summary

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `EndlessTowerRecord` and `EndlessTowerReward` models, update `UserCard` relations |
| `src/services/endlessTowerService.ts` | **New** - Boss generation, scaling, record tracking, rewards |
| `src/commands/endless.ts` | **New** - `/endless` slash command |
| `src/interactions/endlessTowerButton.ts` | **New** - Button handlers for challenge/proceed/stop/cancel |
| `src/handlers/shortcutHandler.ts` | Add `endless` shortcut |
| `src/index.ts` | Register new command + interaction handler |
| `src/commands/clashstats.ts` or `src/utils/clashFormatting.ts` | Show endless tower record in stats embed |

---

## Boss Scaling Example

| Floor | Stat Multiplier | Bonus Abilities |
|-------|----------------|-----------------|
| 1     | 1.00×          | 0 extra         |
| 5     | 1.20×          | 1 extra         |
| 10    | 1.45×          | 2 extra         |
| 15    | 1.70×          | 3 extra         |
| 20    | 1.95×          | 4 extra         |
| 50    | 3.45×          | 10 extra        |

Floor 1 boss starts weaker than the daily boss because:
- Lower base bonuses (50 vs 200 for each stat)
- No +50% HP boost
- No bonus abilities at floor 1

The daily boss roughly corresponds to around floor 15-20 in difficulty.
