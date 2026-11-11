import DeviceActivity
import Foundation

/// Runs in the background when a monitored interval starts or ends, even if the app is closed.
/// Raises the shield for scheduled sessions and lowers it when a timer or schedule ends.
final class FocusMonitor: DeviceActivityMonitor {
  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)

    let now = Date()
    let decision = FocusLogic.decideIntervalStart(
      activity: activity.rawValue,
      schedules: FocusShared.loadSchedules(),
      state: FocusShared.loadState(),
      now: now)

    guard case let .apply(profileId, endsAt, source) = decision else { return }
    FocusShared.applyShield(profileId: profileId)
    FocusShared.saveState(
      FocusLogic.State(
        active: true, profileId: profileId, startedAt: now.timeIntervalSince1970 * 1000,
        endsAt: endsAt, source: source))
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)

    guard FocusLogic.decideIntervalEnd(activity: activity.rawValue, state: FocusShared.loadState()) else {
      return
    }
    FocusShared.clearShield()
    FocusShared.saveState(.inactive)
  }
}
