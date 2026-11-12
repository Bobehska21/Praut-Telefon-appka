# What the app does

A precise description of the Focus Mode app (`mobile/`) and its multiplayer server (`server/`), written from the code.
Each section ends with its **status**, so it is clear what has been tested on a real phone and what has not.

Legend: **tested** = run on a real device; **compiles** = builds and passes lint/unit tests only; **not written** = does not exist.

---

## 1. Core: focus mode

Focus mode turns the phone into a whitelist: while it is on, only apps the user allowed can be used.

### Profiles
- A profile is a name plus a list of allowed apps (Android: package names; iOS: an opaque Screen Time selection).
- Default profiles: Work, Study, Sleep. The user can add, rename and delete profiles (the running one cannot be deleted, and at least one must remain).

### Starting and stopping
- The user picks a profile and a duration (a timer, or "until I stop it") and starts focus mode.
- A timer ends by itself. Stopping early is done with the Stop button and may be protected by the **unlock guard** (Settings):
  - none,
  - a 30 second countdown,
  - typing a sentence exactly.
  The guard protects only the in-app Stop button. It is a nudge, not parental control (the app can be uninstalled, permissions revoked).
- **Schedules** start focus mode automatically on chosen weekdays and times (a range may wrap past midnight). The Schedule screen is currently hidden from the tab bar; the scheduling logic is still there.

### What gets blocked (Android)
- An accessibility service learns the package name of every window that comes to the front (it reads no text or content, `canRetrieveWindowContent=false`, and sends nothing anywhere).
- If the package is not allowed, the app's own focus screen is relaunched at once, with a short hint, and the attempt is counted in Statistics.
- Always allowed: dialer/phone, SMS, emergency packages, keyboards, system UI (so the notification shade keeps working) and permission dialogs. Incoming and emergency calls keep working.
- Home and Recents keys are filtered by the accessibility service. Pressing them inside an allowed app can still show the stock launcher briefly; this is a known limit.
- The focus screen is a grid of the allowed apps with a Stop button (native, with the guard).
- A notification listener dismisses notifications of non-allowed apps.
- It survives the app being killed and a reboot: foreground service with a persistent notification, `START_STICKY`, a boot receiver and an alarm.
- Status: **tested** on two Xiaomi phones (HyperOS 1.0/Android 14 and HyperOS 3.0/Android 16). The accessibility service must be enabled by the user and sometimes turns off after a reinstall.

### iOS
- Uses Apple's Screen Time APIs (Family Controls, Managed Settings, Device Activity) with 3 extensions.
- Status: **compiles only** as far as the Swift logic tests go; the Xcode project was never built or run. Needs a paid Apple Developer account and Apple's approval.

---

## 2. Progress: two currencies

### XP (levels and rank)
- XP comes **only** from completing quests and from achievements. Focus minutes alone give no XP.
- Level `n` needs `50 * (n-1) * n` total XP (0, 100, 300, 600, 1000, ...). Ranks by level: novice (<3), apprentice (<5), adept (<7), warden (<10), master (<15), grandmaster (15+).
- **Daily quests** (one easy, one medium, one hard, chosen deterministically from the date): 20 / 45 / 90 minutes of focus, 1 or 2 completed sessions, an early session (started before 10:00, at least 10 minutes), a 50-minute session. Rewards 20-70 XP.
- **Weekly quests:** 300 focus minutes in the week, or 5 active days (at least 5 minutes each). 150 XP each.
- **Achievements** (one-time XP): first session, 10 and 50 completed sessions, streaks of 3 / 7 / 30 days, 10 and 50 hours total, a 90-minute session, early bird (before 07:00), night owl (after 22:00), level 5.
- A claimed quest or unlocked achievement is remembered with the XP it gave, so later rule changes never rewrite history.

### Points
- 1 point per minute in focus mode, counting at most 120 minutes of a single session (so an overnight session is not a free win).
- **Daily goal: 90 minutes.** Each minute beyond 90 on the same local day earns 1 extra point. The day resets at local midnight.
- Kills (multiplayer) add points, see below.
- Streak: consecutive days with at least 5 minutes of focus; an empty today does not break it yet.

### Screens
- **Home:** start button, profile choice, daily-goal card.
- **Progress:** level and rank, XP bar, points, quests, achievements, a button to Statistics.
- **Profiles:** edit profiles and allowed apps.
- **Statistics:** focus time per day and blocked attempts.
- **Settings:** unlock guard, accessibility mode, language (system / Czech / English), nickname, nearby switch.
- A reward modal appears after a session, quest, achievement or level-up.
- Status: **tested** (198 unit tests of the logic, UI used on the phones).

---

## 3. Nearby players (Android, Bluetooth)

- While focus mode is on, or while the player is a wasteman (see below), the phone advertises over Bluetooth Low Energy and scans for other users of the app.
- The advertisement holds no name and no location: a 6-byte token that **changes every midnight** (HMAC of a per-install secret and the date) plus one status byte (0 = focus, 1 = wasteman).
- A non-multiplayer encounter shows a notification with Accept / Decline. Nothing about the other person is read until Accept; then one small Bluetooth characteristic is read (nickname, rank, level, streak).
- It needs Bluetooth on and the runtime permissions. The setting can be turned off.
- **Nickname rules:** only Latin letters, digits, space, `.`, `_`, `-`, at most 20 characters. Racist, sexist, vulgar and insulting words in Czech and English are refused, including tricks like `N3gr` or `p i z d a`. The check runs when typing, before sending, on the server, and on every nickname received from another phone. The list cannot be complete; extend `nickname-blocklist.json` when a gap is found.
- Status: **tested** with two phones: both found each other, accepted, and the encounter was stored. Xiaomi may throttle background scanning. iOS: **not written**.

---

## 4. Multiplayer "Ulov wastemana" (Android)

Needs the server in `server/`. Joining creates an anonymous account (no name, no e-mail). Multiplayer can be switched off, and the account and all its data deleted, at any time.

### Wasteman
- A player becomes a **wasteman** by **manually stopping a focus mode that is running**. A timer that expires does not make a wasteman.
- A wasteman stays one until they start focus mode again. While a wasteman, nothing is blocked, but the phone keeps advertising over Bluetooth so it can be found.

### Killing
- Only a **nearby** (Bluetooth) player can be killed, and only a wasteman who is not immune.
- The killer needs **at least 90 focus minutes that day**. Otherwise the button is disabled and shows the missing minutes.
- The kill needs proof of proximity: the server issues a 20 second single-use challenge, the killer's phone sends it to the victim's phone over Bluetooth, the victim's phone signs it with a key kept in the Android Keystore (ECDSA P-256), and the server verifies the signature. A wasteman who left range never signs, so the challenge simply expires.
- Result: the killer gets **+50 points**; the victim loses 25% of the points earned that day (never below 0 for the day).
- The victim is **immune for 1 hour** (the time left is shown) and is notified who killed them and how many points were lost. There is no revenge mechanic.
- Two killers at the same moment: the first wins, the other gets "immune".
- You cannot kill yourself, a blocked player (either direction), a banned player, or anyone with multiplayer off.

### Players screen
- **Nearby:** nickname, rank, photo and status (in focus / wasteman / immune / not in focus), with a Kill button where it applies. New wastemen raise no alert.
- **Leaderboard:** daily hunters; players with multiplayer off are excluded.
- **Me:** kills and deaths today and in total, profile photo (gallery, camera, change, remove; a default avatar otherwise), join / leave, blocked players.
- **Block** (symmetric) and **Report** (nickname, photo or player). Reports are stored with a snapshot of the evidence for manual review.

### Server (`server/`, Node + Fastify + PostgreSQL)
- Verifies every rule itself: points are credited from heartbeats (at most 90 s of credit per heartbeat), the 90-minute gate, immunity, signatures, races, day boundaries (timezone `LEADERBOARD_TZ`, default Europe/Prague).
- Photos are re-encoded and stripped of metadata. Moderation is by reports plus manual review through `/admin/*` (protected by `ADMIN_TOKEN`).
- Events (e.g. "you were killed") reach the phone by long polling from the foreground service, no Firebase.
- When offline, start/stop events are queued on the phone and sent in order later.
- Full API and rules: `docs/multiplayer-api.md`.
- Status: server **tested** (72 automated tests against a real PostgreSQL; typecheck and lint clean). Android client **compiles** and passes lint. **Not yet tested together on the two phones**, and the client has not yet been reconciled field by field with the final API.

### Known limits of multiplayer
- The server cannot see the real world: physical proximity is not proven (a relay attack or a modified client defeats it), and focus mode itself is not verified (a modified client can send heartbeats).
- A player can avoid becoming a wasteman by never sending the manual stop (offline, app killed); the server then only sees lost heartbeats.
- Two accounts of one person can farm kills; free anonymous registration cannot prevent that. Planned: Play Integrity / App Attest, anomaly detection.
- No Dockerfile or Helm chart for the server yet; photos are stored on local disk and rate limits are per replica, so only one replica is safe.
- iOS multiplayer and Bluetooth: **not written**. Cleartext HTTP to the server is allowed only in debug builds.

---

## 5. Privacy summary

| Data | Where | Who sees it |
|---|---|---|
| Focus history, quests, achievements, statistics | on the phone only | nobody else |
| Allowed apps | on the phone only | nobody else |
| Bluetooth token (changes daily) | broadcast nearby | anyone in range sees only a random-looking token and a status byte |
| Nickname, rank, level, streak | read over Bluetooth after Accept | the person who accepted |
| Nickname, photo, rank, points, kills (multiplayer) | server | other players; real name and e-mail are never stored |
| Reports | server | the operator, for review |

The accessibility service reads only the package name of the front window.

---

## 6. Platform and build facts

- React Native (Expo SDK 58), TypeScript, Zustand + MMKV, expo-router. Android native code in `modules/focus/android` (Kotlin), iOS in `modules/focus/ios` and `targets/` (Swift).
- Android package `com.example.focusmode` is a placeholder; iOS needs `ios.appleTeamId`.
- Google Play: needs a prominent in-app disclosure for the accessibility service, and declarations for the foreground service type `specialUse` and the Bluetooth permissions.
- Setup, permissions and per-platform limitations in more detail: `mobile/README.md`.
