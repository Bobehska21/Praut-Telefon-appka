# Multiplayer API

Authoritative backend for the multiplayer part of the focus app (`server/`). The phone is never trusted: every rule below is enforced on the server.

- Base: `/v1` (players), `/admin` (moderation), `/healthz`, `/readyz`.
- Auth: `Authorization: Bearer <token>` on every `/v1` route except `POST /v1/auth/register` and `POST /v1/auth/login`. `/admin/*` uses `Authorization: Bearer <ADMIN_TOKEN>`.
- Bodies are JSON (`application/json`), max 32 KB, except `PUT /v1/me/photo` (raw image, max 1 MB). CORS is off.
- Compatibility: old app versions stay in the field. Changes only add fields or endpoints; clients must ignore unknown fields.
- Timestamps are ISO 8601 UTC. Days are `YYYY-MM-DD`.

## Errors

Every error has the same shape and never contains stack traces or SQL:

```json
{ "error": { "code": "needs_minutes", "message": "Not enough focus minutes today", "missingMinutes": 12 } }
```

| code | HTTP | Meaning |
|---|---|---|
| `validation` | 400 (413 body too large, 415 media type) | input failed its schema; `issues: [{path, message}]` when applicable |
| `unauthorized` | 401 | missing/invalid/revoked token |
| `invalid_credentials` | 401 | wrong username or password (identical for both) |
| `username_taken` | 409 | username already used (case-insensitive) |
| `forbidden` | 403 | not allowed (self target, banned player, ...) |
| `multiplayer_off` | 403 | killer or victim has multiplayer disabled |
| `blocked` | 403 | one of the players blocked the other |
| `needs_minutes` | 403 | killer has < 90 focus minutes today; `missingMinutes` |
| `not_found` | 404 | unknown or invisible resource |
| `not_wasteman` | 409 | victim is not a wasteman (also when they restarted focus first) |
| `immune` | 409 | victim is immune; `immuneUntil`. Also the loser of a race between two killers |
| `already_killed` | 409 | reserved; races currently resolve as `immune` |
| `conflict` | 409 | duplicate/state conflict (BLE token taken, report already resolved) |
| `expired` | 410 | kill challenge older than 20 s |
| `bad_signature` | 400 | proximity signature does not verify |
| `rate_limited` | 429 | too many requests, or a login lock; `retryAfterSeconds` and a `Retry-After` header on login locks |
| `unavailable` | 503 | readiness failed / shutting down |
| `internal` | 500 | unexpected; details only in server logs (with the `x-request-id` response header) |

## Endpoints

### Health
- `GET /healthz` (no auth) -> `200 {status:"ok"}`. Liveness, no dependencies.
- `GET /readyz` (no auth) -> `200 {status:"ready"}` or `503 unavailable`. Readiness, checks the database.

### Account

Accounts are a private username plus a password. There is no e-mail. The username is only a login name: it is never shown to other players and never returned by player-facing endpoints (the public name is the separate, filtered `nickname`).

- `POST /v1/auth/register` (no auth, rate limited per IP). Body `{username, password, publicKey, timezone?}` -> `201 {playerId, token}`.
  - `username`: 3-20 characters from `A-Za-z0-9._-`, unique case-insensitively (the display case is kept), and it must pass the nickname blocklist (in case it is shown by mistake).
  - `password`: 8-128 characters, no other rules. It is normalised (Unicode NFKC) and hashed; it is never logged or returned.
  - `publicKey`: base64 SPKI DER of the device's ECDSA P-256 key (used for kill proofs). `timezone`: optional IANA name (default `UTC`).
  - `token` is 32 random bytes base64url, shown once; only its SHA-256 is stored.
  - Errors: `validation`, `username_taken`, `rate_limited`.
- `POST /v1/auth/login` (no auth). Body `{username, password, publicKey}` -> `200 {playerId, token, profile}`; `profile` has the shape of `GET /v1/me`.
  - The new `publicKey` replaces the stored device key (kill proofs need the key of the device that is in use) and **every earlier token of the player is revoked** (one active device).
  - Wrong password and unknown username give the same `401 invalid_credentials` and take about the same time (a dummy hash is verified for unknown names). A banned player with the right password gets `403 forbidden`.
  - Brute-force protection: see below. Errors: `invalid_credentials`, `forbidden`, `rate_limited`, `validation`.
- `POST /v1/auth/logout` -> `204`. Revokes the token used for the call.
- `POST /v1/auth/password` body `{oldPassword, newPassword}` -> `204`. Revokes all other tokens (the current one stays valid). The old password is checked with the same lock/backoff as login. Errors: `invalid_credentials`, `rate_limited`, `validation`.
- `DELETE /v1/me` -> `204`. Erases the player: profile, account row (username, password hash), tokens, login throttle rows, ledger, BLE tokens, notifications, blocks, challenges and the photo. Kill rows are kept with the player reference set to null. Moderation reports keep their evidence snapshot (nickname text and photo copy) with the reference nulled.
- The anonymous `POST /v1/register` no longer exists (404).

#### Passwords and brute-force protection

- Hash: scrypt from `node:crypto` (no native dependency; Node's built-in argon2 only exists from Node 24 and the service supports Node 22), random 16-byte salt per user, 32-byte key, default cost N=2^15, r=8, p=3 (about 32 MiB and ~100 ms, an OWASP-listed configuration). The stored string is `scrypt$<log2N>$<r>$<p>$<salt>$<hash>`, so the cost can be raised later (`PASSWORD_SCRYPT_LOG2N`); weaker hashes are upgraded transparently on the next successful login. Hashes live in their own `accounts` table and are never selected by player or admin queries.
- Per-IP rate limits on `register` and `login` use the selected `RATE_LIMIT_STORE` (`@fastify/rate-limit`): PostgreSQL shared across replicas in production, memory per replica in development, on top of the global limit.
- Failed logins are counted **durably in PostgreSQL** (shared by all replicas) under two keys, by the typed username whether or not the account exists, so the answer never reveals which names exist:
  - username + client IP: locks after 5 failures;
  - username from any source: locks after 20 failures (distributed guessing).
  A lock starts at 15 s and doubles with every further failure, capped at **5 minutes**. While locked, attempts get `429 rate_limited` (even with the right password) and are not counted, so hammering does not extend a lock. The counter restarts after 15 quiet minutes and after a successful login.
- Why a guesser cannot lock the owner out for good: the per-source lock hits only the guesser's address; the per-username lock needs 20 failures and ends within 5 minutes. A determined attacker with many addresses can still make an account hard to reach by repeating this every 5 minutes; that is the price of having no second factor, and the per-IP limits and the 5-minute cap bound the damage.
- **No e-mail means no password reset.** A player who forgets the password cannot recover the account (an operator can only ban or erase it). The client should say so at sign-up.

### Profile
- `GET /v1/me` -> `{playerId, nickname, rankKey, level, multiplayerEnabled, timezone, photoUrl, state, immuneUntil, banned, shields}`. `shields` (0..3) is visible to the owner only; it is in no other player's view (nearby, leaderboard, blocks, kill results). `state` is `idle|focus|wasteman` (a stale `focus` shows as `idle`).
- `PUT /v1/me` body `{nickname?, rankKey, level, multiplayerEnabled, timezone}` (all except `nickname` required) -> same as GET. Omitting `nickname` preserves the current server value, including an admin's replacement; an explicit empty string clears it.
  - `nickname`: the app's rules (Latin letters, digits, space, `.`, `_`, `-`, max 20, blocklist); empty = anonymous. Whitespace is trimmed/collapsed. The server copy of the filter (`server/src/nickname.ts`, `nickname-blocklist.json`) must stay byte-identical to `mobile/src/features/`; a test enforces it. Rejection gives `validation` with `issues[].reason` in `length|chars|blocked`.
  - `rankKey`: `novice|apprentice|adept|warden|master|grandmaster`; `level` 1..999 (both cosmetic).
  - `timezone`: IANA name; defines the player's local day.
- `PUT /v1/me/photo` raw body `image/jpeg|png|webp` (or `application/octet-stream`), max 1 MB. The format is checked by magic bytes, then re-encoded to a 256x256 JPEG (strips EXIF/GPS). -> `{photoUrl}`. `DELETE /v1/me/photo` -> `204`.
- `GET /v1/photos/:playerId` -> `image/jpeg`. 404 if no photo, or the owner has multiplayer off, is banned, or is blocked either way with the caller (own photo is always visible). No photo means `photoUrl: null`; the default avatar is the client's job.
- `GET /v1/me/stats` -> `{killsToday, killsTotal, deathsToday, deathsTotal, pointsToday, pointsTotal, focusMinutesToday}`. "Today" is the player's timezone.

### Focus
All return `{state, focusMinutesToday}` (plus `lost: true` when the server found the player lost).
- `POST /v1/focus/start` body optional `{multiplier?: 1|2|5|10, stakePoints?, durationMs?}` (multiplier default 1, anything else is `400`) -> state `focus` from any state (this is how a wasteman saves themselves). A multiplier above 1 is a session bet, see Session bets.
- `POST /v1/focus/heartbeat` -> credits focus time (see below). In `idle`/`wasteman` it only reports the state.
- `POST /v1/focus/stop` body `{reason: "manual"|"expired"}`.

### Dev only: fake focus minutes
- `POST /v1/dev/focus-minutes` body `{minutes: 1..600, creditSession?: boolean}` -> `{focusMinutesToday, shields}`. With `creditSession: true` and the caller in `focus`, the same minutes are also added to the open focus session's credited time and the shield check runs, so shields can be tested without waiting 5 hours. **Exists only when the server runs with `DEV_FAKE_MINUTES=true`** (otherwise 404); the server refuses to start with that flag when `NODE_ENV=production`. It adds a normal `minute` ledger row for the caller's local today (same points rules as heartbeats), so the 90-minute gate, stats and points are consistent. Never enable it on a shared or production environment: it defeats the focus-time requirement.

### Nearby (Bluetooth)
- `PUT /v1/me/ble-token` body `{token, day}`: `token` 6 bytes hex (12 chars), `day` within one day of the player's local today. Replaces the player's token for that day. `(day, token)` is unique: `409 conflict` if taken (pick another).
- `POST /v1/nearby` body `{tokens: string[<=50]}` -> array of `{token, playerId, nickname, rankKey, level, photoUrl, status, immuneUntil, canKill, killBlockedReason, missingMinutes}`.
  - `status`: `focus|wasteman|immune|idle`; `immune` wins over `wasteman` while `immune_until > now`.
  - `canKill` and `killBlockedReason` (`needs_minutes|not_wasteman|immune|null`) are computed for the caller; `missingMinutes` is the caller's gap to 90.
  - Not returned: unknown tokens, the caller, players with multiplayer off, banned players, blocked in either direction. A caller with multiplayer off, or banned, gets `[]`.

### Kills
- `POST /v1/kills/challenge` body `{targetPlayerId}` (rate limited) -> `201 {challengeId, nonce, expiresAt}`. Checks all preconditions; errors as in the table (`needs_minutes`, `not_wasteman`, `immune`, `multiplayer_off`, `blocked`, `forbidden`, `not_found`).
- `POST /v1/kills` body `{challengeId, signature}` -> `201 {challengeId, victimPlayerId, pointsGained: 50, victimPointsLost, victimImmuneUntil, killedAt, shieldBlocked}`. `shieldBlocked` is always present. When it is `true`, a shield absorbed the attack: `pointsGained` and `victimPointsLost` are 0, `victimImmuneUntil` is 10 minutes after `killedAt`, and it is **not a kill** (see Shields). Only the player who created the challenge can complete it.
  - Idempotent: repeating a succeeded challenge returns the same result with `201`; repeating a failed/expired one returns the stored error.
  - `bad_signature` does not consume the challenge.

### Blocks
- `POST /v1/blocks {playerId}` -> `201 {playerId}` (idempotent). `DELETE /v1/blocks/:playerId` -> `204`. `GET /v1/blocks` -> `[{playerId, nickname, rankKey, level, blockedAt}]`.
- Blocking is symmetric in effect: neither side sees the other in nearby lookups, neither can kill the other, photos are hidden.

### Leaderboard
- `GET /v1/leaderboard?date=YYYY-MM-DD` (default: today in `LEADERBOARD_TZ`) -> `{date, top: [{rank, nickname, rankKey, level, photoUrl, kills, isMe}], me: {rank|null, kills}}`. Top 50 by kills that day, ties by earliest last kill; multiplayer-off and banned players are excluded. `me.rank` is the caller's real rank even below 50, `null` when unranked.

### Events (for the victim)
- `GET /v1/events?after=<id>&wait=<0..25>` -> `[{id, kind, payload, createdAt}]`. Kinds: `killed` `{killerNickname, pointsLost}`; `shield_earned` `{shields}` (the new count); `shield_blocked` `{killerNickname, shields}` (the remaining count); `admin_nickname` `{nickname}` (an admin changed the nickname); `admin_photo` `{}` (an admin removed the photo). Clients must ignore kinds they do not know. Long poll: returns as soon as something is available, otherwise `[]` after `wait` seconds (default 0). With `after` it returns everything with `id > after`; without it only undelivered notifications. The wait polls the database briefly and holds no connection, so it works with any replica.

### Reports
- `POST /v1/reports` body `{targetPlayerId, kind: "nickname"|"photo"|"player", note?<=500}` (rate limited per reporter, plus a durable per-hour DB limit) -> `201 {status:"received"}`. Stores the reporter, target, kind, note and a snapshot of the target's nickname and a copy of the photo at that moment.

### Admin (`/admin/*`, `ADMIN_TOKEN`, constant-time compare)
- `GET /admin/reports?status=open|resolved|all&limit&offset`; `GET /admin/reports/:id` (with snapshot and current target state); `GET /admin/reports/:id/photo` (snapshot JPEG).
- `POST /admin/reports/:id/resolve {action: "dismiss"|"remove_photo"|"reset_nickname"|"ban", note?}`. Resolving twice gives `409`. Actions other than `dismiss` need the target to still exist.
- `GET /admin/players?search=&banned=&limit&offset` (nickname or username substring, or exact player id); `POST /admin/players/:playerId/unban`.
- Every admin action is written to `admin_audit`. Admin routes expose the internal ids players do not see, and the private login name in the player list (searchable) so moderators can find an account; password hashes are never selected.

## Admin API (in-app)

Separate from the token-protected `/admin/*` moderation API. These routes live under `/v1/admin/*`, use the normal
player token and are allowed only for accounts with `accounts.is_admin = true`. The flag is read from the database on
every request and nothing in the API can set it; the operator sets it (`npm run seed:admin` in development, which is
refused when `NODE_ENV=production`, or SQL). Anyone else, signed in or not, gets 404 (anonymous: 401).

| Route | What |
|---|---|
| `GET /v1/admin/whoami` | `{ admin: true }`; the app uses it to decide whether to show the admin screen |
| `GET /v1/admin/players?q=&limit=&offset=` | all players: id, username, nickname, photoUrl, createdAt, pointsTotal, isAdmin; `q` searches username and nickname |
| `POST /v1/admin/players/:id/points` | `{ points, note? }`, a non-zero integer up to 100000 in absolute value, positive or negative; writes a ledger row `admin_adjust` (so it counts in `/v1/me/stats`) |

| `PUT /v1/admin/players/:id/nickname` | `{ nickname, note? }`; the new name must pass the nickname filter. The player gets an `admin_nickname` notification (`{ nickname }`) |
| `DELETE /v1/admin/players/:id/photo` | `{ note? }` (optional body); removes the photo and its file (409 if there is none). The player gets an `admin_photo` notification |

An admin can also open any player's photo (`GET /v1/photos/:id`), including players with multiplayer off, to review it.

`PUT /v1/me` accepts the nickname as optional: a client that has not edited its nickname omits it, so a name replaced by
an admin is not overwritten by the phone's old one. The app sends it only when the user changed it since the last sync.

Every action writes an `admin_audit` row in the same transaction: action, actor (`actor_player_id`), target, note,
details and time. Note: the daily leaderboard ranks by kills, so a points adjustment shows in the player's stats,
not in the leaderboard.

## Focus state machine

```
            start                         start (from anywhere)
  idle ───────────────▶ focus ◀──────────────────────────────── wasteman
   ▲                     │  │                                      ▲
   │  stop(expired)      │  │ stop(manual)                         │
   └─────────────────────┘  └──────────────────────────────────────┘
   ▲                     │
   └── no heartbeat >10 min (reason "lost", no wasteman)
```

- `focus --stop(manual)--> wasteman`; `focus --stop(expired)--> idle`.
- No heartbeat for more than 10 minutes while `focus` -> `idle` (`lost`). This is evaluated lazily on the next read/write of that player, so no background job is needed.
- A player who was never in focus is `idle`. Manual stop from `idle` or `wasteman` changes nothing. A wasteman stays wasteman until they start focus.
- Immunity (after being killed) is independent of the state; the victim stays wasteman afterwards unless they restarted focus.

## Session bets

- The player stakes points, picks a multiplier and the timer length: `POST /v1/focus/start {multiplier: 2|5|10, stakePoints, durationMs}`. All three are required with a multiplier above 1 (`400 validation` otherwise). 1 (or no body) is the old behaviour: no bonus, no penalty.
- Limits, checked by the server at start: `durationMs` at least **15 min x multiplier** (30, 75, 150 min); `stakePoints` at least 1 and at most the player's **net points of today** (local day), so the day never goes below 0. A player with no points today cannot bet.
- When the session ends (`stop` manual/expired, a restart, or a lost gap settled on the next start) the server writes one ledger row: credited focus reached the timer (a 2-minute grace covers missed heartbeats) -> `bet_bonus` = stake x (multiplier - 1), e.g. 100 points at 2x = +100; ended earlier -> `bet_penalty` = minus the stake, capped at the day's net at that moment.
- `POST /v1/focus/stop` returns `bet: {multiplier, outcome: "bonus"|"penalty", points}` when a bet was settled in that call. Settlements on restart or lost gap are visible only in the points ledger / stats.
- The multiplier has **no effect on kills**: the victim still loses 25 % of the day's gross points and the killer gains the flat 50. Shields and the 90-minute kill gate use real credited time. Bets are an Android multiplayer feature (the native client sends the bet; iOS does not).

## Shields

- A player earns **one shield** when a single focus session reaches **5 hours of credited focus time** (only heartbeat credit counts, each capped at 90 s, so a phone left on is not enough). Maximum **3**. The count is visible only to its owner (`GET/PUT /v1/me`).
- The session must be uninterrupted by construction: a manual stop, a restart (`focus/start` while in focus) and a lost gap (no heartbeat for more than 10 minutes) close the session; the next one starts at 0. The credit of the final heartbeat or stop still counts for the session it closes. At most one shield per session: a session that reaches 5 h at the cap of 3 is marked awarded but grants nothing and sends no notification. A `shield_earned` notification is sent when the count actually increased.
- Effect: when all kill preconditions pass (needs_minutes, not_wasteman, immune, blocks, ... are unchanged and checked first) and the victim has a shield, one shield is consumed instead of the kill. **No points move** (no killer gain, no victim penalty), it creates no `kills` row (so `killsToday`/`killsTotal`/`deathsToday`/`deathsTotal` and the leaderboard never count it), the victim is immune for **10 minutes** (instead of 1 hour) so shields cannot be sniped in a row, and gets a `shield_blocked` notification. The killer sees `shieldBlocked: true` with no points. Killers cannot tell in advance who has a shield (nearby shows nothing about it).
- Replaying the same `challengeId` returns the identical shield-blocked result. Two killers racing on a shielded wasteman: exactly one consumes the shield, the other gets `immune`.

## Points

- Earned on the server from heartbeats. Each heartbeat (and the final stop) credits `min(elapsed since the previous heartbeat, 90 s)` of focus time, stored in `points_ledger` (`kind=minute`, with the player's local day, exact milliseconds).
- 1 point per whole credited minute of the local day, plus 1 extra per minute beyond the first 90 (2 per minute after 90). Computed from the day's cumulative time, so partial minutes are never lost.
- Kill: killer +50 (`kind=kill`).
- Victim penalty: `floor(25% of the gross positive points the victim earned that local day)`, capped so the victim's net for that day never goes below 0 (`kind=penalty`, negative). Gross counts minute and kill points, not penalties.
- XP is local to the phone and out of scope.
- The 90-minute gate counts whole credited focus minutes of the killer's local day; below it the error is `needs_minutes` with `missingMinutes`.

## Proximity proof

1. Killer calls `POST /v1/kills/challenge`; the server checks the preconditions and returns `{challengeId (uuid), nonce (16 random bytes, base64), expiresAt (now + 20 s)}`. The challenge is single use.
2. Killer's phone sends it to the victim's phone over Bluetooth.
3. Victim's phone signs the UTF-8 canonical string

   `focus-kill-v1|{challengeId}|{nonceBase64}|{victimPlayerId}|{killerPlayerId}`

   with its device key: **ECDSA P-256, SHA-256, signature DER, base64**. The public key was registered as SPKI DER base64 in `POST /v1/register`.
4. Killer sends `POST /v1/kills {challengeId, signature}`. The server checks challenge owner, expiry and use, verifies the signature against the victim's registered key, and performs the kill in one transaction.

Concurrency: the transaction locks the victim and killer rows with `SELECT ... FOR UPDATE` in id order, re-reads the challenge `FOR UPDATE`, and re-checks every precondition. Two killers racing on the same wasteman: exactly one gets `201`, the other `409 immune`. If the victim's `focus/start` takes the lock first, the kill returns `409 not_wasteman`. A wasteman who left Bluetooth range never signs, and the challenge simply expires after 20 s. Retrying the same `challengeId` is safe (`kills.challenge_id` is unique, and the outcome of a challenge is stored).

Other rules enforced in that transaction: not self, nobody banned, multiplayer on for both, no block either way, killer has >= 90 minutes, victim is `wasteman` and not immune. After the kill the victim is immune for exactly 1 hour (`immune_until <= now` means not immune), and receives a `killed` notification. There is no revenge mechanic or other advantage.

## Limits of server-side verification

The server enforces rules over the data it receives; it cannot see the real world.

- **Physical proximity is not proven.** A valid signature shows that the victim's key signed this challenge, not that the phones were close. A relay attack (forwarding the challenge to a remote victim phone, or a compromised victim device signing anything) defeats it. The key can also be extracted from a rooted device.
- **Focus mode is not verified.** Heartbeats come from the client. A modified client can send heartbeats without being in focus mode, or run a script on a PC. Only the 90 s cap per heartbeat limits the rate: credit can never exceed wall-clock time, but wall-clock time is all that is needed.
- **Offline avoidance of wasteman.** A player can avoid becoming wasteman by never sending the manual stop (kill the app, stay offline): the server sees only a lost heartbeat and sets `idle`.
- **Collusion and farming.** Two accounts of one person can kill each other to farm +50 (the penalty is only 25% of the victim's gross, immunity is 1 hour). Registration needs only a username and password (no e-mail, no phone), so sybil accounts cannot be prevented. A player can also change the profile timezone to move day boundaries (for example to get the 90-minute bonus twice).
- **Nickname and photo** are filtered (nickname rules, re-encoded images) but the filter is not exhaustive; reports and moderation are the backstop.
- **Rate limiting** uses shared PostgreSQL counters in production (memory per replica in development; reports and failed logins also have durable domain counters); IP-based limits are weak behind shared NATs and mobile carrier NAT.
- **Accounts:** with no e-mail there is no password recovery and no way to prove ownership of an account; a forgotten password means a new account. A stolen token or a phished password gives full control, and logging in on a new device revokes the old one by design.

Mitigations in place: heartbeat cap, 20 s single-use challenges bound to killer, victim and nonce, per-route rate limits, immunity, symmetric blocking, ban, audit log. Planned: Play Integrity / App Attest attestation of the app and device on register and on kill, anomaly detection on kill pairs, a limit on timezone changes, load testing of the shared PostgreSQL rate-limit store.
