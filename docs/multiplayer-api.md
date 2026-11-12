# Multiplayer API

Authoritative backend for the multiplayer part of the focus app (`server/`). The phone is never trusted: every rule below is enforced on the server.

- Base: `/v1` (players), `/admin` (moderation), `/healthz`, `/readyz`.
- Auth: `Authorization: Bearer <token>` on every `/v1` route except `POST /v1/register`. `/admin/*` uses `Authorization: Bearer <ADMIN_TOKEN>`.
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
| `unauthorized` | 401 | missing/invalid token |
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
| `rate_limited` | 429 | too many requests |
| `unavailable` | 503 | readiness failed / shutting down |
| `internal` | 500 | unexpected; details only in server logs (with the `x-request-id` response header) |

## Endpoints

### Health
- `GET /healthz` (no auth) -> `200 {status:"ok"}`. Liveness, no dependencies.
- `GET /readyz` (no auth) -> `200 {status:"ready"}` or `503 unavailable`. Readiness, checks the database.

### Account
- `POST /v1/register` (no auth, rate limited). Body `{publicKey}`: base64 SPKI DER of an ECDSA P-256 key. -> `201 {playerId, token}`. `token` is 32 random bytes base64url and is shown once; only its SHA-256 is stored. Errors: `validation` (not a P-256 SPKI key), `rate_limited`.
- `DELETE /v1/me` -> `204`. Erases the player (profile, ledger, tokens, notifications, blocks, challenges) and the photo. Kill rows are kept with the player reference set to null. Moderation reports keep their evidence snapshot (nickname text and photo copy) with the reference nulled.

### Profile
- `GET /v1/me` -> `{playerId, nickname, rankKey, level, multiplayerEnabled, timezone, photoUrl, state, immuneUntil, banned}`. `state` is `idle|focus|wasteman` (a stale `focus` shows as `idle`).
- `PUT /v1/me` body `{nickname, rankKey, level, multiplayerEnabled, timezone}` (all required) -> same as GET.
  - `nickname`: the app's rules (Latin letters, digits, space, `.`, `_`, `-`, max 20, blocklist); empty = anonymous. Whitespace is trimmed/collapsed. The server copy of the filter (`server/src/nickname.ts`, `nickname-blocklist.json`) must stay byte-identical to `mobile/src/features/`; a test enforces it. Rejection gives `validation` with `issues[].reason` in `length|chars|blocked`.
  - `rankKey`: `novice|apprentice|adept|warden|master|grandmaster`; `level` 1..999 (both cosmetic).
  - `timezone`: IANA name; defines the player's local day.
- `PUT /v1/me/photo` raw body `image/jpeg|png|webp` (or `application/octet-stream`), max 1 MB. The format is checked by magic bytes, then re-encoded to a 256x256 JPEG (strips EXIF/GPS). -> `{photoUrl}`. `DELETE /v1/me/photo` -> `204`.
- `GET /v1/photos/:playerId` -> `image/jpeg`. 404 if no photo, or the owner has multiplayer off, is banned, or is blocked either way with the caller (own photo is always visible). No photo means `photoUrl: null`; the default avatar is the client's job.
- `GET /v1/me/stats` -> `{killsToday, killsTotal, deathsToday, deathsTotal, pointsToday, pointsTotal, focusMinutesToday}`. "Today" is the player's timezone.

### Focus
All return `{state, focusMinutesToday}` (plus `lost: true` when the server found the player lost).
- `POST /v1/focus/start` -> state `focus` from any state (this is how a wasteman saves themselves).
- `POST /v1/focus/heartbeat` -> credits focus time (see below). In `idle`/`wasteman` it only reports the state.
- `POST /v1/focus/stop` body `{reason: "manual"|"expired"}`.

### Nearby (Bluetooth)
- `PUT /v1/me/ble-token` body `{token, day}`: `token` 6 bytes hex (12 chars), `day` within one day of the player's local today. Replaces the player's token for that day. `(day, token)` is unique: `409 conflict` if taken (pick another).
- `POST /v1/nearby` body `{tokens: string[<=50]}` -> array of `{token, playerId, nickname, rankKey, level, photoUrl, status, immuneUntil, canKill, killBlockedReason, missingMinutes}`.
  - `status`: `focus|wasteman|immune|idle`; `immune` wins over `wasteman` while `immune_until > now`.
  - `canKill` and `killBlockedReason` (`needs_minutes|not_wasteman|immune|null`) are computed for the caller; `missingMinutes` is the caller's gap to 90.
  - Not returned: unknown tokens, the caller, players with multiplayer off, banned players, blocked in either direction. A caller with multiplayer off, or banned, gets `[]`.

### Kills
- `POST /v1/kills/challenge` body `{targetPlayerId}` (rate limited) -> `201 {challengeId, nonce, expiresAt}`. Checks all preconditions; errors as in the table (`needs_minutes`, `not_wasteman`, `immune`, `multiplayer_off`, `blocked`, `forbidden`, `not_found`).
- `POST /v1/kills` body `{challengeId, signature}` -> `201 {challengeId, victimPlayerId, pointsGained: 50, victimPointsLost, victimImmuneUntil, killedAt}`. Only the player who created the challenge can complete it.
  - Idempotent: repeating a succeeded challenge returns the same result with `201`; repeating a failed/expired one returns the stored error.
  - `bad_signature` does not consume the challenge.

### Blocks
- `POST /v1/blocks {playerId}` -> `201 {playerId}` (idempotent). `DELETE /v1/blocks/:playerId` -> `204`. `GET /v1/blocks` -> `[{playerId, nickname, rankKey, level, blockedAt}]`.
- Blocking is symmetric in effect: neither side sees the other in nearby lookups, neither can kill the other, photos are hidden.

### Leaderboard
- `GET /v1/leaderboard?date=YYYY-MM-DD` (default: today in `LEADERBOARD_TZ`) -> `{date, top: [{rank, nickname, rankKey, level, photoUrl, kills, isMe}], me: {rank|null, kills}}`. Top 50 by kills that day, ties by earliest last kill; multiplayer-off and banned players are excluded. `me.rank` is the caller's real rank even below 50, `null` when unranked.

### Events (for the victim)
- `GET /v1/events?after=<id>&wait=<0..25>` -> `[{id, kind: "killed", payload: {killerNickname, pointsLost}, createdAt}]`. Long poll: returns as soon as something is available, otherwise `[]` after `wait` seconds (default 0). With `after` it returns everything with `id > after`; without it only undelivered notifications. The wait polls the database briefly and holds no connection, so it works with any replica.

### Reports
- `POST /v1/reports` body `{targetPlayerId, kind: "nickname"|"photo"|"player", note?<=500}` (rate limited per reporter, plus a durable per-hour DB limit) -> `201 {status:"received"}`. Stores the reporter, target, kind, note and a snapshot of the target's nickname and a copy of the photo at that moment.

### Admin (`/admin/*`, `ADMIN_TOKEN`, constant-time compare)
- `GET /admin/reports?status=open|resolved|all&limit&offset`; `GET /admin/reports/:id` (with snapshot and current target state); `GET /admin/reports/:id/photo` (snapshot JPEG).
- `POST /admin/reports/:id/resolve {action: "dismiss"|"remove_photo"|"reset_nickname"|"ban", note?}`. Resolving twice gives `409`. Actions other than `dismiss` need the target to still exist.
- `GET /admin/players?search=&banned=&limit&offset` (nickname substring or exact player id); `POST /admin/players/:playerId/unban`.
- Every admin action is written to `admin_audit`. Admin routes expose the internal ids players do not see.

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
- **Collusion and farming.** Two accounts of one person can kill each other to farm +50 (the penalty is only 25% of the victim's gross, immunity is 1 hour). Registration is anonymous and free, so sybil accounts cannot be prevented. A player can also change the profile timezone to move day boundaries (for example to get the 90-minute bonus twice).
- **Nickname and photo** are filtered (nickname rules, re-encoded images) but the filter is not exhaustive; reports and moderation are the backstop.
- **Rate limiting** is per replica in memory (reports also have a durable DB limit); IP-based limits are weak behind shared NATs.

Mitigations in place: heartbeat cap, 20 s single-use challenges bound to killer, victim and nonce, per-route rate limits, immunity, symmetric blocking, ban, audit log. Planned: Play Integrity / App Attest attestation of the app and device on register and on kill, anomaly detection on kill pairs, a limit on timezone changes, a shared rate-limit store.
