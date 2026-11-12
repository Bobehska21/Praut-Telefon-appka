# Focus Mode

A mobile app that helps you concentrate. While **focus mode** is on, only the apps you allowed
in advance (a whitelist) work; everything else is blocked until you stop the mode. On top of that it has
a progress system (XP, levels, quests, achievements, a daily 90-minute goal), detection of other users
nearby over Bluetooth, and an optional multiplayer game, **"Ulov wastemana"** (catch the wasteman), where
players who give up their focus can be "killed" by nearby players.

Project state: **work in progress, not released.** The Android app runs on real phones; iOS is written
but has never been compiled. See [Status](#status).

## What is in this repository

| Path | What |
|---|---|
| [`mobile/`](mobile) | The app: React Native (Expo SDK 58) + TypeScript, with a native `Focus` module in Kotlin (Android) and Swift (iOS) |
| [`server/`](server) | Multiplayer backend: Node + Fastify + PostgreSQL (accounts, points, kills, leaderboard, photos, reports, moderation) |
| [`docs/multiplayer-api.md`](docs/multiplayer-api.md) | Server API, rules, state machine, proximity proof and the limits of server-side verification |
| [`mobile/docs/what-the-app-does.md`](mobile/docs/what-the-app-does.md) | Precise description of everything the app does, with what is tested and what is not |
| [`mobile/README.md`](mobile/README.md) | Build, permissions, platform details and known limitations of the app |
| [`server/README.md`](server/README.md) | Running the server, environment variables, accounts and passwords, operations |
| `.claude/`, `CLAUDE.md`, `deploy/`, `.github/`, `docs/workflow.md` | The Claude Code workflow template this repository started from (agents, hooks, Helm chart, CI). Not specific to the app |

## Features

**Focus mode**
- Profiles (Work, Study, Sleep, your own), each with its own list of allowed apps.
- Start with a timer or "until I stop it"; schedules start it automatically on chosen days and times.
- Android: an accessibility service notices which app comes to the front and brings back the focus screen
  (a grid of allowed apps) when it is not allowed. The notification shade, phone calls, SMS and emergency
  calls keep working. It survives killing the app and rebooting.
- An optional unlock guard for the Stop button (30 s countdown or typing a sentence).
- iOS (not verified): Apple Screen Time APIs with three extensions.

**Progress**
- XP only from quests and achievements; points from minutes in focus mode (+1 per minute beyond 90 a day) and from kills.
- Levels and ranks, daily and weekly quests, achievements, streaks, statistics.

**Nearby players (Android, Bluetooth LE)**
- The advertisement contains only a random-looking token that changes every midnight plus a status byte;
  no name, no location. Details are read only after the other person accepts.

**Multiplayer "Ulov wastemana" (Android)**
- Account with username and password, **no e-mail**. The username is private; others see only a filtered
  nickname, a rank and an optional photo.
- A player who manually stops a running focus mode becomes a wasteman until they start focus again. Anyone
  nearby with at least 90 focus minutes that day can kill a wasteman: +50 points, the victim loses 25% of
  that day's points and is immune for one hour. Kills need a signed proof from the victim's phone over Bluetooth.
- Daily leaderboard, personal statistics, blocking and reporting, multiplayer on/off switch, account deletion.

## Architecture

```
 Phone A (app)                                          Phone B (app, wasteman)
 ┌──────────────────────────┐   Bluetooth LE            ┌──────────────────────────┐
 │ React Native UI + store  │◀────────────────────────▶ │ advertises token+status  │
 │ Kotlin module: focus     │   kill challenge/signature│ signs challenges with a  │
 │ service, accessibility,  │                           │ Keystore key             │
 │ BLE, server sync         │                           └─────────────┬────────────┘
 └─────────────┬────────────┘                                         │
               │ HTTPS (HTTP only in debug)                           │
               ▼                                                      ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │ server: Fastify + PostgreSQL — verifies every rule, credits     │
        │ points from heartbeats, checks the signature, applies the kill  │
        └─────────────────────────────────────────────────────────────────┘
```

The native side is the source of truth for "is focus mode running". The server never trusts the phone:
points are credited from heartbeats, and a kill is applied in one database transaction after the victim's
signature (ECDSA P-256, key in the Android Keystore) has been verified.

## Quick start (development)

Requirements: Node 22.13+, Docker, and for Android JDK 17, the Android SDK and a phone with USB debugging.

```sh
# 1. Server and database (local only)
cd server
npm install
docker compose up -d --wait
export DATABASE_URL=postgresql://focus:<password>@localhost:5433/focus_dev   # see .env.example
export ADMIN_TOKEN=<at least 32 random characters>
npm run migrate && npm run dev          # http://localhost:3000/healthz

# 2. App
cd ../mobile
npm install
npm run android                         # builds a development client; needs Metro (npx expo start)
adb reverse tcp:8081 tcp:8081           # Metro
adb reverse tcp:3000 tcp:3000           # server (repeat both for every phone; USB drops them sometimes)
```

Checks: `npm run typecheck && npm run lint && npm test` in both `mobile/` and `server/`
(the server tests need the Docker database).

## Status

| Part | State |
|---|---|
| App logic (store, scheduler, progress, nickname filter, unlock guard) | done, 198 unit tests |
| Android focus mode | runs on two Xiaomi phones (HyperOS 1.0/Android 14 and HyperOS 3.0/Android 16) |
| Bluetooth nearby detection | tested with two phones (found each other, accepted, stored) |
| Server (accounts, focus, points, kills, nearby, blocks, reports, leaderboard, photos, admin) | 98 automated tests against a real PostgreSQL; typecheck and lint clean |
| Multiplayer client | compiles and is aligned with the API; **the full kill between two phones is not yet tested end to end** |
| iOS | written, **never compiled or run** (needs Xcode, a paid Apple Developer account and Apple's Family Controls approval) |

## Privacy and security

- Focus history, quests, statistics and the list of allowed apps stay on the phone.
- The accessibility service reads only the package name of the front window, never content, and sends nothing.
- Bluetooth: a daily-rotating token, no identity; nobody can follow you for longer than a day.
- Server: passwords are hashed with scrypt and never returned or logged; tokens are stored only as hashes and
  can be revoked; failed logins are throttled durably; photos are re-encoded and stripped of metadata;
  accounts can be deleted with all their data. There is **no password reset** because there is no e-mail.
- Nickname filter (Czech and English, including obfuscation tricks) on the phone and the server; reports are
  stored with evidence for manual review.

## Known limitations

- The server cannot see the real world: **physical proximity and focus mode are not provable**. A relay
  attack or a modified client can cheat. Two accounts of one person can farm kills. Mitigations are
  listed in [`docs/multiplayer-api.md`](docs/multiplayer-api.md); Play Integrity / App Attest are planned, not built.
- A player can avoid becoming a wasteman by never sending the manual stop (offline, app killed).
- Pressing Home or Recents inside an allowed app can briefly show the stock launcher.
- Xiaomi and other vendors may throttle background Bluetooth or kill services despite exemptions.
- The server has no Dockerfile or Helm chart yet; photos are on local disk and rate limits are per replica,
  so only one replica is safe. Before a rolling production deploy see the migration notes
  (legacy `players.token_hash`).
- iOS has no multiplayer or Bluetooth. Package ids are placeholders (`com.example.focusmode`).
- Distribution through Google Play needs declarations for the accessibility service, the foreground service
  (`specialUse`) and the Bluetooth permissions; see [`mobile/README.md`](mobile/README.md).
- No license has been chosen yet.

## Roadmap

1. End-to-end test of the kill flow on two phones, then fixes.
2. Dockerfile, Helm chart, object storage for photos, shared rate-limit store.
3. Play Integrity attestation, anomaly detection on kill pairs.
4. iOS build and, later, iOS Bluetooth and multiplayer.
5. Admin tool for reviewing reports (today: API only).

## Working with Claude Code

The repository includes a Claude Code setup (`CLAUDE.md`, `.claude/`): agents for backend, database,
migrations and Kubernetes, guard hooks that keep production read-only, and slash commands such as
`/preflight`. Details in [`docs/workflow.md`](docs/workflow.md). Database migrations are reviewed by the
`migration-reviewer` agent before they are committed.
