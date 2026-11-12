import DeviceActivity
import ExpoModulesCore
import FamilyControls
import SwiftUI
import UIKit

// MARK: - Records (typed arguments and results)

struct ScheduleRecord: Record {
  @Field var profileId: String = ""
  @Field var days: [Int] = []
  @Field var startMinute: Int = 0
  @Field var endMinute: Int = 0
}

internal final class UnsupportedException: Exception {
  override var reason: String { "This function is not available on iOS" }
}

internal final class NotAuthorizedException: Exception {
  override var reason: String { "Screen Time access has not been granted" }
}

// MARK: - Module

/// iOS implementation. Function names and result shapes mirror `FocusModuleApi`
/// in `src/modules/focus/types.ts`. Apps are opaque tokens: there is no installed-app list.
public class FocusModule: Module {
  /// DeviceActivity allows at most 20 monitored activities per app; one is reserved for the timer.
  private static let maxScheduleMonitors = 19

  public func definition() -> ModuleDefinition {
    Name("Focus")

    AsyncFunction("getInstalledApps") { () -> [String] in
      throw UnsupportedException()
    }

    AsyncFunction("pickAllowedApps") { (profileId: String, promise: Promise) in
      Task { @MainActor in
        if AuthorizationCenter.shared.authorizationStatus != .approved {
          try? await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        }
        let initial = FocusShared.loadSelection(profileId: profileId) ?? FamilyActivitySelection()
        guard let picked = await presentPicker(initial: initial) else {
          promise.resolve(nil)
          return
        }
        FocusShared.saveSelection(picked, profileId: profileId)
        promise.resolve(["selectionId": profileId, "appCount": FocusShared.appCount(picked)])
      }
    }

    // Whitelists live in the shared App Group as picker selections, nothing to push from JS.
    AsyncFunction("setAllowedApps") { (_: String, _: [String]) in }

    // The shield is shown by the system, so iOS cannot enforce the stop guard natively; JS does.
    AsyncFunction("setUnlockGuard") { (_: String) in }

    AsyncFunction("setSchedules") { (items: [ScheduleRecord]) in
      let schedules = items.map {
        FocusLogic.Schedule(
          profileId: $0.profileId, days: $0.days, startMinute: $0.startMinute, endMinute: $0.endMinute)
      }
      FocusShared.saveSchedules(schedules)
      FocusModule.registerScheduleMonitors(schedules)
    }

    AsyncFunction("drainBlockedAttempts") { () -> [[String: Any]] in
      FocusShared.drainAttempts().map { ["at": $0] }
    }

    AsyncFunction("startFocus") { (profileId: String, durationMs: Double?) -> [String: Any] in
      guard AuthorizationCenter.shared.authorizationStatus == .approved else {
        throw NotAuthorizedException()
      }
      let now = Date()
      let nowMs = now.timeIntervalSince1970 * 1000
      let endsAt = durationMs.map { nowMs + $0 }

      FocusShared.applyShield(profileId: profileId)
      FocusShared.saveState(
        FocusLogic.State(
          active: true, profileId: profileId, startedAt: nowMs, endsAt: endsAt,
          source: FocusLogic.manualSource))

      // The system ends the session even if the app is not running. Timers under 15 minutes
      // cannot be monitored; they end the next time the app reads the status.
      if let endsAt, let durationMs, FocusLogic.canUseTimerMonitor(durationMs: durationMs) {
        FocusModule.startTimerMonitor(from: now, to: Date(timeIntervalSince1970: endsAt / 1000))
      }
      return FocusModule.statusDictionary()
    }

    AsyncFunction("stopFocus") { () -> [String: Any] in
      DeviceActivityCenter().stopMonitoring([DeviceActivityName(FocusLogic.timerActivity)])
      FocusShared.clearShield()
      FocusShared.saveState(.inactive)
      return FocusModule.statusDictionary()
    }

    AsyncFunction("getStatus") { () -> [String: Any] in
      var state = FocusShared.loadState()
      if FocusLogic.isExpired(state, nowMs: Date().timeIntervalSince1970 * 1000) {
        FocusShared.clearShield()
        FocusShared.saveState(.inactive)
        state = .inactive
      }
      return FocusModule.statusDictionary(state)
    }

    AsyncFunction("getPermissions") { () -> [String: String] in
      ["screenTime": FocusModule.screenTimeState()]
    }

    AsyncFunction("requestPermission") { (name: String, promise: Promise) in
      guard name == "screenTime" else {
        promise.resolve("unknown")
        return
      }
      Task {
        do {
          try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        } catch {
          // Denied or cancelled: report the resulting state instead of failing.
        }
        promise.resolve(FocusModule.screenTimeState())
      }
    }
  }

  // MARK: Helpers

  private static func screenTimeState() -> String {
    switch AuthorizationCenter.shared.authorizationStatus {
    case .approved: return "granted"
    case .denied: return "denied"
    default: return "unknown"
    }
  }

  private static func statusDictionary(_ state: FocusLogic.State = FocusShared.loadState()) -> [String: Any] {
    // JS expects `null` (not a missing key) for "no value".
    let profileId: Any = state.profileId.map { $0 as Any } ?? NSNull()
    let startedAt: Any = (state.active ? state.startedAt : nil).map { $0 as Any } ?? NSNull()
    let endsAt: Any = (state.active ? state.endsAt : nil).map { $0 as Any } ?? NSNull()
    return [
      "active": state.active,
      "profileId": profileId,
      "startedAt": startedAt,
      "endsAt": endsAt,
      "blockedAttempts": 0,
    ]
  }

  private static func startTimerMonitor(from start: Date, to end: Date) {
    let schedule = DeviceActivitySchedule(
      intervalStart: FocusLogic.fullComponents(start),
      intervalEnd: FocusLogic.fullComponents(end),
      repeats: false)
    // Errors (e.g. intervalTooShort) leave the lazy expiry in getStatus as the fallback.
    try? DeviceActivityCenter().startMonitoring(DeviceActivityName(FocusLogic.timerActivity), during: schedule)
  }

  /// One repeating daily interval per schedule; the extension filters by weekday.
  private static func registerScheduleMonitors(_ schedules: [FocusLogic.Schedule]) {
    let center = DeviceActivityCenter()
    center.stopMonitoring((0..<maxScheduleMonitors).map { DeviceActivityName(FocusLogic.scheduleActivityName($0)) })

    for (index, schedule) in schedules.enumerated().prefix(maxScheduleMonitors) {
      guard FocusLogic.isMonitorable(schedule) else { continue }
      let interval = DeviceActivitySchedule(
        intervalStart: FocusLogic.components(forMinute: schedule.startMinute),
        intervalEnd: FocusLogic.components(forMinute: schedule.endMinute),
        repeats: true)
      try? center.startMonitoring(DeviceActivityName(FocusLogic.scheduleActivityName(index)), during: interval)
    }
  }
}

// MARK: - System picker

private struct PickerScreen: View {
  @State private var selection: FamilyActivitySelection
  let onFinish: (FamilyActivitySelection?) -> Void

  init(initial: FamilyActivitySelection, onFinish: @escaping (FamilyActivitySelection?) -> Void) {
    _selection = State(initialValue: initial)
    self.onFinish = onFinish
  }

  private var isEnglish: Bool { Locale.preferredLanguages.first?.hasPrefix("en") == true }

  var body: some View {
    NavigationStack {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle(isEnglish ? "Allowed apps" : "Povolené aplikace")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(isEnglish ? "Cancel" : "Zrušit") { onFinish(nil) }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button(isEnglish ? "Done" : "Hotovo") { onFinish(selection) }
          }
        }
    }
  }
}

@MainActor
private func presentPicker(initial: FamilyActivitySelection) async -> FamilyActivitySelection? {
  guard let top = topViewController() else { return nil }
  return await withCheckedContinuation { continuation in
    var host: UIViewController?
    var finished = false
    let screen = PickerScreen(initial: initial) { result in
      guard !finished else { return }  // guards against a double tap resuming twice
      finished = true
      host?.dismiss(animated: true) { continuation.resume(returning: result) }
    }
    let controller = UIHostingController(rootView: screen)
    // Swiping the sheet away would never resume the continuation, so require Cancel or Done.
    controller.isModalInPresentation = true
    host = controller
    top.present(controller, animated: true)
  }
}

@MainActor
private func topViewController() -> UIViewController? {
  let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
  let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
  var top = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
  while let presented = top?.presentedViewController { top = presented }
  return top
}
