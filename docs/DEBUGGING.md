# Debugging Guide

A practical playbook for diagnosing slowness and errors in edh-karuta. This guide has two halves:

- **Part A (technical)** — for developers with the code checked out.
- **Part B (non-technical)** — step-by-step instructions anyone can follow on the server to check logs and send useful information to a developer.

If you just want to "look at the logs on the server", skip to **Part B**.

---

## Part A — Developer debugging

### 1. Quick triage checklist

1. Is it **slowness** or an **error**? (Different sections below.)
2. Which Discord slash command triggers it? (See `src/commands/`.)
3. Is it **reproducible**? Same user? Same card? Same time of day?
4. Check stdout / server logs (Part B §c) for stack traces or `SLOW QUERY` lines.
5. Is the SQLite database locked? (`.db-wal` / `.db-shm` present is normal; errors mentioning `SQLITE_BUSY` are not.)
6. Is Scryfall reachable? (`curl -I https://api.scryfall.com/`)

### 2. Enabling verbose logging

All logs go to stdout. There is no Sentry / Pino / Winston.

- `LOG_SLOW_QUERY_MS=0 npm run dev` — log **every** Prisma query with its duration. See `src/db.ts:14-21`.
- `LOG_SLOW_QUERY_MS=100 npm run dev` — log only queries slower than 100 ms (default threshold defined in `src/config.ts:14` is 500 ms).
- For ad-hoc timing, wrap the suspect block in `console.time("label")` / `console.timeEnd("label")`.
- Run the bot with `npm run dev` (tsx watch mode) while iterating.

### 3. Debugging slowness

**Slow Prisma queries**
- Enable full query logging (above), reproduce, look at the durations.
- If a specific query is slow, check `prisma/schema.prisma` for missing `@@index`.
- The card pool is cached in `src/repositories/cardRepo.ts` with a 5-minute TTL; a cold cache after restart is expected.

**SQLite contention**
- WAL mode and a 5 s `busy_timeout` are set in `src/db.ts:33-40`. `dev.db-wal` / `dev.db-shm` next to the DB are normal.
- To inspect: `sqlite3 dev.db` then `.timeout 2000`, `PRAGMA wal_checkpoint;`, `EXPLAIN QUERY PLAN <your select>;`.
- If you see `database is locked`, a long-running transaction is holding the writer. Grep for `$transaction` usages.

**Image collage latency**
- `src/services/collageService.ts` uses an LRU cache (200 images, 3 h TTL) plus axios retry with exponential backoff.
- Check whether Scryfall CDN is slow/unreachable, whether `sharp` is pegging the CPU, or whether the cache is being thrashed (too many unique cards in flight).

**Claim queue stalls**
- `src/services/dropService.ts` uses a 120 ms debounce window + per-user async locks from `src/utils/asyncLock.ts`.
- A handler that throws without releasing a lock will appear as "the user can never claim again until restart" — suspect a missing `finally`.

**Scryfall sync**
- `npm run sync:scryfall` imports ~90k cards. It is slow by design. Run off-hours.

**General profiling**
- `node --inspect dist/index.js` + Chrome DevTools → Performance tab.
- `NODE_OPTIONS=--cpu-prof node dist/index.js` produces a `.cpuprofile` file.

### 4. Debugging errors

- Reproduce with the exact slash command from `src/commands/`.
- If the stack trace is truncated, log `error.stack` explicitly.
- **Transaction rollbacks** — look for `$transaction` callers (esp. `dropService.ts`); the root cause is usually a constraint violation inside the transaction.
- **Discord API errors** (`DiscordAPIError`, `Missing Permissions`, `Unknown Interaction`) — verify bot token, gateway intents, channel permissions. If slash commands are missing, re-run `npm run register:commands`.
- **Prisma error codes** — `P2002` unique constraint, `P2025` record not found, `P2034` write conflict. Cross-reference `prisma/schema.prisma`.
- **Config / env validation** — Zod errors from `src/config.ts` on boot mean `.env` or `game.config.json` is wrong.

### 5. Database debugging

- `npx prisma studio` — browse and edit data in a local web UI.
- `npx prisma migrate status` — see pending migrations.
- `npx prisma migrate reset` — **dev only**; wipes the DB.
- `npm run reset:collection` — clear user collections to reproduce an issue on a clean slate.
- Direct SQLite: `sqlite3 dev.db`, then `.schema`, `.tables`, `EXPLAIN QUERY PLAN …`.

### 6. Tests as a debug tool

- `npm test` / `npm run test:watch` (Vitest + `tsx --test`).
- Existing tests cover: `dropService`, `clashService`, `cooldownService`, `clashBonusService`, `cardRepo`, `wishlistRepo`, `scryfallSync`.
- When fixing a bug, write a failing test that reproduces it **first**.

### 7. Concurrency gotchas

- Per-user `asyncLock` will deadlock a user forever if a handler forgets to release it. Always release in `finally`.
- The claim queue is first-come-first-served within a 120 ms window, with the dropper prioritized.
- The card pool cache (`cardRepo.ts`) and the image LRU (`collageService.ts`) both persist in memory — after `npm run sync:scryfall`, restart the bot so the caches rebuild.

### 8. Known pitfalls

- Relative `DATABASE_URL` breaks when the working directory changes. Use an absolute path.
- Leftover `dev.db-journal` / `dev.db-wal` after a crash is safe — WAL recovers on the next open.
- Invalid JSON in `game.config.json` → Zod error on boot; the bot will not start.

### 9. Escalation / bug report contents

Include:
- Node version (`node -v`), OS, last commit hash (`git rev-parse HEAD`).
- A stdout log snippet captured with `LOG_SLOW_QUERY_MS=0`.
- Exact Discord command + arguments used to reproduce.
- Redacted `.env` and `game.config.json`.

---

## Part B — Checking logs on the server (no coding experience required)

Follow this section if someone asks you to "look at the logs" or "see why the bot is broken". You do not need to know how to code.

### B.1 Connect to the server

1. Open your terminal (on Mac: **Terminal** app; on Windows: **PowerShell** or **Windows Terminal**).
2. Type:
   ```
   ssh your-username@your-server-ip
   ```
   Replace `your-username` and `your-server-ip` with what the developer gave you. Press Enter.
3. If it asks for a password, type it (you will not see any characters — that's normal) and press Enter.
4. Once you see a new prompt like `user@server:~$`, you are in.
5. Go to the bot's folder:
   ```
   cd ~/edh-karuta
   ```
   If that fails, type `ls` to see what folders exist and try the one that looks right.

### B.2 Is the bot even running?

Try these one at a time. Only one will match your setup.

- **Option 1 — plain process check** (always works):
  ```
  ps aux | grep node
  ```
  If you see a line mentioning `node` and `edh-karuta`, the bot is running. If you only see a line ending in `grep node`, it is **not** running.

- **Option 2 — systemd** (managed as a system service):
  ```
  systemctl status edh-karuta
  ```
  Look for the word **active (running)** in green. If you see **failed** or **inactive**, the bot is down.

- **Option 3 — pm2** (managed by the pm2 tool):
  ```
  pm2 status
  ```
  Look for `edh-karuta` with status `online`. If you see `errored` or `stopped`, it is down.

### B.3 Watch the logs live (as things happen)

Pick the command matching your setup. Press **Ctrl+C** to stop watching (it will not stop the bot).

- **systemd:**
  ```
  journalctl -u edh-karuta -f
  ```
- **pm2:**
  ```
  pm2 logs edh-karuta
  ```
- **Running manually in a terminal:** the logs are already printing in that terminal. If you need it to keep running after you log out, ask a developer to set up `tmux` or `screen`.

### B.4 Look at past logs

- **systemd — last hour:**
  ```
  journalctl -u edh-karuta --since "1 hour ago"
  ```
- **systemd — today:**
  ```
  journalctl -u edh-karuta --since today
  ```
- **systemd — since a specific time:**
  ```
  journalctl -u edh-karuta --since "2026-04-07 10:00"
  ```
- **pm2 — last 500 lines:**
  ```
  pm2 logs edh-karuta --lines 500
  ```
  pm2 log files also live in `~/.pm2/logs/`.

**Save logs to a file you can send to a developer:**
```
journalctl -u edh-karuta --since today > ~/bot-log.txt
```
You can then download `~/bot-log.txt` using `scp` or any SFTP tool.

### B.5 Types of log lines and what they mean

When you read the logs, you will see many lines. Here is how to recognize each kind.

- **Normal / healthy**
  - `Logged in as ...`, `Ready!`, `Command /drop used by ...`
  - **Action:** none. This is fine.

- **Slow database query**
  - Contains the words `SLOW QUERY` or a big number of milliseconds (e.g. `1243 ms`).
  - **Meaning:** the database took too long. Users may feel lag.
  - **Action:** copy the line and send it to a developer.

- **Error with stack trace**
  - Starts with `Error:` or has lines like `at someFunction (file.ts:42)` stacked below.
  - **Meaning:** something broke.
  - **Action:** copy the whole block (the `Error:` line **and** every `at ...` line below it until a blank line).

- **Network / Scryfall problems**
  - Words like `axios`, `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, or the number `429`.
  - **Meaning:** the bot can't reach Scryfall (the card data source), or Scryfall is rate-limiting us.
  - **Action:** often temporary. Wait 5 minutes, try again. If it persists, tell a developer.

- **Database locked / Prisma errors**
  - `SQLITE_BUSY`, `database is locked`, or codes like `P2002`, `P2025`, `P2034`.
  - **Meaning:** database conflict.
  - **Action:** usually clears on its own. If repeating, restart the bot (see B.8) and tell a developer.

- **Discord errors**
  - `DiscordAPIError`, `Missing Permissions`, `Unknown Interaction`, `INTERACTION_ALREADY_ACKNOWLEDGED`.
  - **Meaning:** something about the bot's Discord permissions or timing is wrong.
  - **Action:** check the bot's role and channel permissions in Discord. If unclear, send to a developer.

- **Crash / out of memory**
  - `JavaScript heap out of memory`, `Killed`, or pm2/systemd messages about restarting.
  - **Meaning:** the bot crashed.
  - **Action:** check server health (B.7), then restart (B.8), then tell a developer.

### B.6 Search the logs for a specific problem

Use `grep` to filter. Examples:

- Only lines with the word "error":
  ```
  journalctl -u edh-karuta | grep -i error
  ```
- Only slow query lines:
  ```
  journalctl -u edh-karuta | grep -i "slow query"
  ```
- Everything a specific Discord user did (replace `SomeUser` with their name or ID):
  ```
  journalctl -u edh-karuta | grep SomeUser
  ```

For pm2, replace `journalctl -u edh-karuta` with `pm2 logs edh-karuta --lines 5000 --nostream`.

### B.7 Server health basics

If the bot feels slow, check whether the server itself is struggling:

- **CPU and memory:**
  ```
  top
  ```
  (press `q` to quit). If CPU stays near 100% or memory is full, that is the problem.
- **Disk space:**
  ```
  df -h
  ```
  If the disk with the database is 100% full, SQLite will stop working. Free up space.
- **Free memory:**
  ```
  free -h
  ```

### B.8 Restart the bot (last resort)

- **systemd:**
  ```
  sudo systemctl restart edh-karuta
  ```
- **pm2:**
  ```
  pm2 restart edh-karuta
  ```

Then run the checks from B.2 again to confirm it came back up.

### B.9 What to send to a developer

When asking for help, include:

1. The last ~100 lines of logs around when the problem happened (save with the command in B.4).
2. The exact Discord command that failed, and the username of the person who ran it.
3. The server's current time:
   ```
   date
   ```
4. The output of `systemctl status edh-karuta` or `pm2 status`.
5. A short description of what you expected vs. what happened.

That's enough for a developer to start investigating without needing to ask you more questions.
