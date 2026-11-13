import ManagedSettings
import ManagedSettingsUI
import UIKit

/// The screen shown over a blocked app. Extensions cannot read the app's i18n, so the language
/// follows the device language (Czech unless English).
final class FocusShieldConfiguration: ShieldConfigurationDataSource {
  override func configuration(shielding application: Application) -> ShieldConfiguration {
    makeConfiguration()
  }

  override func configuration(shielding application: Application, in category: ActivityCategory)
    -> ShieldConfiguration
  {
    makeConfiguration()
  }

  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
    makeConfiguration()
  }

  override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory)
    -> ShieldConfiguration
  {
    makeConfiguration()
  }

  private func makeConfiguration() -> ShieldConfiguration {
    // The shield is drawn once per attempt (repeats within a few seconds are merged).
    FocusShared.recordAttempt()

    let english = Locale.preferredLanguages.first?.hasPrefix("en") == true
    let title = english ? "This app is turned off during focus mode" : "Tato aplikace je v režimu soustředění vypnutá"
    let back = english ? "Back" : "Zpět"

    return ShieldConfiguration(
      backgroundBlurStyle: .systemMaterial,
      backgroundColor: nil,
      icon: UIImage(systemName: "moon.stars"),
      title: ShieldConfiguration.Label(text: title, color: .label),
      subtitle: nil,
      primaryButtonLabel: ShieldConfiguration.Label(text: back, color: .white),
      primaryButtonBackgroundColor: UIColor(red: 0.24, green: 0.42, blue: 0.35, alpha: 1),
      secondaryButtonLabel: nil)
  }
}
