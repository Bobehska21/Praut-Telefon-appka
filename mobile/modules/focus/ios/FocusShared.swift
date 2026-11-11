import FamilyControls
import Foundation
import ManagedSettings

/// State and shield handling shared by the app module and the extensions through an App Group.
///
/// KEEP IN SYNC: identical copies live in `targets/device-activity-monitor` and `targets/shield-config`
/// (`src/modules/focus/swift-sync.test.ts` fails if the copies differ).
enum FocusShared {
  // MARK: App Group

  /// `group.<app bundle id>`. Extension bundle ids are `<app bundle id>.<extension>`, so the last
  /// component is dropped when running inside an extension. Must match the entitlement in app.json.
  static var appGroupId: String {
    var id = Bundle.main.bundleIdentifier ?? ""
    if Bundle.main.object(forInfoDictionaryKey: "NSExtension") != nil, let dot = id.lastIndex(of: ".") {
      id = String(id[..<dot])
    }
    return "group.\(id)"
  }

  static var defaults: UserDefaults? { UserDefaults(suiteName: appGroupId) }

  private enum Key {
    static let state = "focus.state"
    static let schedules = "focus.schedules"
    static let attempts = "focus.attempts"
    static func selection(_ profileId: String) -> String { "focus.selection.\(profileId)" }
  }

  // MARK: State

  static func loadState() -> FocusLogic.State {
    guard let data = defaults?.data(forKey: Key.state),
      let state = try? JSONDecoder().decode(FocusLogic.State.self, from: data)
    else { return .inactive }
    return state
  }

  static func saveState(_ state: FocusLogic.State) {
    defaults?.set(try? JSONEncoder().encode(state), forKey: Key.state)
  }

  static func loadSchedules() -> [FocusLogic.Schedule] {
    guard let data = defaults?.data(forKey: Key.schedules),
      let items = try? JSONDecoder().decode([FocusLogic.Schedule].self, from: data)
    else { return [] }
    return items
  }

  static func saveSchedules(_ items: [FocusLogic.Schedule]) {
    defaults?.set(try? JSONEncoder().encode(items), forKey: Key.schedules)
  }

  // MARK: Selection (opaque tokens from the system picker)

  static func loadSelection(profileId: String) -> FamilyActivitySelection? {
    guard let data = defaults?.data(forKey: Key.selection(profileId)) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  static func saveSelection(_ selection: FamilyActivitySelection, profileId: String) {
    defaults?.set(try? JSONEncoder().encode(selection), forKey: Key.selection(profileId))
  }

  static func appCount(_ selection: FamilyActivitySelection) -> Int {
    selection.applicationTokens.count + selection.categoryTokens.count + selection.webDomainTokens.count
  }

  // MARK: Shield

  /// A named store, so clearing it never touches restrictions set by anything else.
  static let store = ManagedSettingsStore(named: .init("focus"))

  /// Whitelist mode: every app category is shielded except the individually chosen apps.
  /// A profile without a selection therefore blocks everything.
  static func applyShield(profileId: String) {
    let selection = loadSelection(profileId: profileId)
    store.shield.applicationCategories = .all(except: selection?.applicationTokens ?? [])
    store.shield.webDomainCategories = .all(except: selection?.webDomainTokens ?? [])
  }

  static func clearShield() {
    store.clearAllSettings()
  }

  // MARK: Blocked attempts

  /// Called by the ShieldConfiguration extension each time a shield is drawn. The system may draw it
  /// more than once per attempt, so repeats within `window` seconds count once.
  static func recordAttempt(now: Date = Date(), window: TimeInterval = 3) {
    guard let defaults else { return }
    var attempts = defaults.array(forKey: Key.attempts) as? [Double] ?? []
    let nowMs = now.timeIntervalSince1970 * 1000
    if let last = attempts.last, nowMs - last < window * 1000 { return }
    attempts.append(nowMs)
    defaults.set(Array(attempts.suffix(2000)), forKey: Key.attempts)
  }

  /// Returns attempts recorded since the last call and clears them.
  static func drainAttempts() -> [Double] {
    guard let defaults else { return [] }
    let attempts = defaults.array(forKey: Key.attempts) as? [Double] ?? []
    defaults.removeObject(forKey: Key.attempts)
    return attempts
  }
}
