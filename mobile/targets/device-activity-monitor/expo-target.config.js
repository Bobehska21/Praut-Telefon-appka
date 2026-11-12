/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "device-activity-monitor",
  deploymentTarget: "16.0",
  frameworks: ["FamilyControls", "ManagedSettings", "DeviceActivity"],
  entitlements: {
    // Needs Apple's Family Controls approval for this extension's bundle id (see README).
    "com.apple.developer.family-controls": true,
    // Same group as the app, from app.json, so app and extensions share state.
    "com.apple.security.application-groups":
      config.ios?.entitlements?.["com.apple.security.application-groups"] ?? [],
  },
});
