import Foundation

// Minimal assertion harness: `swiftc` has no XCTest here, so this exits non-zero on any failure.
// Run: ./run.sh

var failures = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String, line: Int = #line) {
  if !condition() {
    failures += 1
    print("FAIL (line \(line)): \(message)")
  }
}

var utc = Calendar(identifier: .gregorian)
utc.timeZone = TimeZone(identifier: "UTC")!

// 2026-11-09 is a Monday.
func date(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
  utc.date(from: DateComponents(year: 2026, month: 11, day: day, hour: hour, minute: minute))!
}

typealias S = FocusLogic.Schedule
typealias State = FocusLogic.State

let work = S(profileId: "work", days: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60)
let night = S(profileId: "sleep", days: [1], startMinute: 22 * 60, endMinute: 6 * 60)

// lengthMinutes / monitorable
check(FocusLogic.lengthMinutes(work) == 480, "work length")
check(FocusLogic.lengthMinutes(night) == 480, "night wraps midnight")
check(FocusLogic.isMonitorable(work), "work monitorable")
check(!FocusLogic.isMonitorable(S(profileId: "p", days: [1], startMinute: 600, endMinute: 600)), "equal start/end rejected")
check(!FocusLogic.isMonitorable(S(profileId: "p", days: [1], startMinute: 600, endMinute: 610)), "10 min rejected")
check(FocusLogic.isMonitorable(S(profileId: "p", days: [1], startMinute: 600, endMinute: 615)), "15 min accepted")
check(!FocusLogic.isMonitorable(S(profileId: "p", days: [], startMinute: 600, endMinute: 700)), "no days rejected")
check(!FocusLogic.isMonitorable(S(profileId: "p", days: [1], startMinute: -1, endMinute: 700)), "negative minute rejected")
check(!FocusLogic.isMonitorable(S(profileId: "p", days: [1], startMinute: 0, endMinute: 1440)), "1440 rejected")

// activity names
check(FocusLogic.scheduleActivityName(3) == "focus.sched.3", "activity name")
check(FocusLogic.scheduleIndex(fromActivity: "focus.sched.3") == 3, "index parse")
check(FocusLogic.scheduleIndex(fromActivity: "focus.timer") == nil, "timer is not a schedule")
check(FocusLogic.scheduleIndex(fromActivity: "focus.sched.x") == nil, "garbage index")

// weekday filter and occurrence end
check(FocusLogic.startsOn(work, date: date(9, 9), calendar: utc), "Monday is a work day")
check(!FocusLogic.startsOn(work, date: date(8, 9), calendar: utc), "Sunday is not")
check(FocusLogic.occurrenceEnd(work, now: date(9, 9, 1), calendar: utc) == date(9, 17), "work ends 17:00")
check(FocusLogic.occurrenceEnd(night, now: date(9, 22, 1), calendar: utc) == date(10, 6), "night ends next day 06:00")

// timers
check(!FocusLogic.canUseTimerMonitor(durationMs: 14 * 60_000), "14 min timer not monitorable")
check(FocusLogic.canUseTimerMonitor(durationMs: 25 * 60_000), "25 min timer monitorable")
check(FocusLogic.isExpired(State(active: true, profileId: "p", startedAt: 0, endsAt: 1000, source: "manual"), nowMs: 1000), "expired at end")
check(!FocusLogic.isExpired(State(active: true, profileId: "p", startedAt: 0, endsAt: nil, source: "manual"), nowMs: 9e12), "open-ended never expires")
check(!FocusLogic.isExpired(State.inactive, nowMs: 9e12), "inactive never expires")

// intervalDidStart decisions
let schedules = [work, night]
let mondayMorning = date(9, 9, 0)
switch FocusLogic.decideIntervalStart(activity: "focus.sched.0", schedules: schedules, state: .inactive, now: mondayMorning, calendar: utc) {
case let .apply(profileId, endsAt, source):
  check(profileId == "work", "applies work profile")
  check(endsAt == date(9, 17).timeIntervalSince1970 * 1000, "endsAt is 17:00")
  check(source == "schedule.0", "source tagged")
case .ignore:
  check(false, "work schedule should apply on Monday")
}
check(FocusLogic.decideIntervalStart(activity: "focus.sched.0", schedules: schedules, state: .inactive, now: date(8, 9), calendar: utc) == .ignore, "ignored on Sunday")
check(
  FocusLogic.decideIntervalStart(
    activity: "focus.sched.0", schedules: schedules,
    state: State(active: true, profileId: "study", startedAt: 1, endsAt: nil, source: "manual"),
    now: mondayMorning, calendar: utc) == .ignore,
  "never overrides a manual session")
check(FocusLogic.decideIntervalStart(activity: "focus.sched.9", schedules: schedules, state: .inactive, now: mondayMorning, calendar: utc) == .ignore, "unknown index ignored")
check(FocusLogic.decideIntervalStart(activity: "focus.timer", schedules: schedules, state: .inactive, now: mondayMorning, calendar: utc) == .ignore, "timer start ignored")

// intervalDidEnd decisions
let manual = State(active: true, profileId: "p", startedAt: 1, endsAt: 2, source: "manual")
let sched0 = State(active: true, profileId: "p", startedAt: 1, endsAt: 2, source: "schedule.0")
check(FocusLogic.decideIntervalEnd(activity: "focus.timer", state: manual), "timer end clears manual session")
check(!FocusLogic.decideIntervalEnd(activity: "focus.timer", state: sched0), "timer end leaves schedule session")
check(FocusLogic.decideIntervalEnd(activity: "focus.sched.0", state: sched0), "schedule end clears its own session")
check(!FocusLogic.decideIntervalEnd(activity: "focus.sched.1", state: sched0), "other schedule end ignored")
check(!FocusLogic.decideIntervalEnd(activity: "focus.sched.0", state: manual), "schedule end never clears manual session")
check(!FocusLogic.decideIntervalEnd(activity: "focus.sched.0", state: .inactive), "nothing to clear when inactive")

// State round-trips through JSON (this is how it crosses the App Group)
let encoded = try! JSONEncoder().encode(sched0)
check((try? JSONDecoder().decode(State.self, from: encoded)) == sched0, "state JSON round-trip")

if failures == 0 {
  print("OK: all FocusLogic checks passed")
} else {
  print("\(failures) check(s) failed")
  exit(1)
}
