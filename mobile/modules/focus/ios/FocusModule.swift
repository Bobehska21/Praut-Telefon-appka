import ExpoModulesCore

public class FocusModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Focus")

    Events("onChange")

    AsyncFunction("setValueAsync") { (value: String) in
      self.sendEvent("onChange", [
        "value": value
      ])
    }
  }
}
