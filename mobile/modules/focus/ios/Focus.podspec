Pod::Spec.new do |s|
  s.name           = 'Focus'
  s.version        = '1.0.0'
  s.summary        = 'Focus mode native module (Screen Time API)'
  s.description    = 'Blocks every app except a user-chosen allowlist using FamilyControls, ManagedSettings and DeviceActivity.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'FamilyControls', 'ManagedSettings', 'DeviceActivity', 'SwiftUI'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  # Top-level Swift files only; tests live outside `ios/` in `swift-tests/`.
  s.source_files = "*.{h,m,mm,swift,hpp,cpp}"
end
