import Foundation

/// Pure decision logic shared by the app module and the DeviceActivityMonitor extension.
/// Foundation only, so it can be compiled and unit-tested on macOS (see `swift-tests/`).
///
/// KEEP IN SYNC: identical copies live in `targets/device-activity-monitor` and `targets/shield-config`
/// (extensions cannot import code from the app target). `src/modules/focus/swift-sync.test.ts`
/// fails if the copies differ.
enum FocusLogic {
  /// DeviceActivity does not accept intervals shorter than this.
  static let minIntervalMinutes = 15
  static let manualSource = "manual"
  static let timerActivity = "focus.timer"
  static let schedulePrefix = "focus.sched."

  struct Schedule: Codable, Equatable {
    var profileId: String
    /// 0 = Sunday ... 6 = Saturday (same as JS and Android).
    var days: [Int]
    var startMinute: Int
    var endMinute: Int
  }

  /// Persisted in the App Group. Times are epoch milliseconds, like the JS side.
  struct State: Codable, Equatable {
    var active: Bool
    var profileId: String?
    var startedAt: Double?
    var endsAt: Double?
    /// "manual" or "schedule.<index>": who started the session, so a schedule never ends a manual one.
    var source: String?

    static let inactive = State(active: false, profileId: nil, startedAt: nil, endsAt: nil, source: nil)
  }

  // MARK: Schedules

  static func scheduleActivityName(_ index: Int) -> String { "\(schedulePrefix)\(index)" }

  static func scheduleIndex(fromActivity name: String) -> Int? {
    guard name.hasPrefix(schedulePrefix) else { return nil }
    return Int(name.dropFirst(schedulePrefix.count))
  }

  static func lengthMinutes(_ s: Schedule) -> Int {
    if s.endMinute > s.startMinute { return s.endMinute - s.startMinute }
    return s.endMinute + 24 * 60 - s.startMinute
  }

  /// Only schedules the system will accept as a repeating interval are registered.
  static func isMonitorable(_ s: Schedule) -> Bool {
    guard (0..<1440).contains(s.startMinute), (0..<1440).contains(s.endMinute) else { return false }
    guard s.startMinute != s.endMinute, !s.days.isEmpty else { return false }
    return lengthMinutes(s) >= minIntervalMinutes
  }

  static func components(forMinute minute: Int) -> DateComponents {
    DateComponents(hour: minute / 60, minute: minute % 60)
  }

  /// A schedule repeats daily at the system level, so the weekday filter happens in the extension.
  static func startsOn(_ s: Schedule, date: Date, calendar: Calendar = .current) -> Bool {
    s.days.contains(calendar.component(.weekday, from: date) - 1)
  }

  /// End of the occurrence that starts today at `startMinute` (wraps to the next day if needed).
  static func occurrenceEnd(_ s: Schedule, now: Date, calendar: Calendar = .current) -> Date {
    let dayStart = calendar.startOfDay(for: now)
    let start = calendar.date(byAdding: .minute, value: s.startMinute, to: dayStart) ?? now
    return calendar.date(byAdding: .minute, value: lengthMinutes(s), to: start) ?? now
  }

  // MARK: Timers

  static func canUseTimerMonitor(durationMs: Double) -> Bool {
    durationMs >= Double(minIntervalMinutes) * 60_000
  }

  static func fullComponents(_ date: Date, calendar: Calendar = .current) -> DateComponents {
    calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
  }

  static func isExpired(_ state: State, nowMs: Double) -> Bool {
    guard state.active, let endsAt = state.endsAt else { return false }
    return nowMs >= endsAt
  }

  // MARK: Extension decisions

  enum StartDecision: Equatable {
    case ignore
    case apply(profileId: String, endsAt: Double, source: String)
  }

  /// `intervalDidStart` for `activity`: should the shield go up, and for whom?
  static func decideIntervalStart(
    activity: String,
    schedules: [Schedule],
    state: State,
    now: Date,
    calendar: Calendar = .current
  ) -> StartDecision {
    guard let index = scheduleIndex(fromActivity: activity), schedules.indices.contains(index) else {
      return .ignore
    }
    let schedule = schedules[index]
    guard startsOn(schedule, date: now, calendar: calendar) else { return .ignore }
    // Never override a session the user started by hand.
    if state.active { return .ignore }
    let end = occurrenceEnd(schedule, now: now, calendar: calendar)
    return .apply(
      profileId: schedule.profileId,
      endsAt: end.timeIntervalSince1970 * 1000,
      source: "schedule.\(index)"
    )
  }

  /// `intervalDidEnd` for `activity`: true if the shield should come down.
  static func decideIntervalEnd(activity: String, state: State) -> Bool {
    guard state.active else { return false }
    if activity == timerActivity { return state.source == manualSource }
    guard let index = scheduleIndex(fromActivity: activity) else { return false }
    return state.source == "schedule.\(index)"
  }
}
