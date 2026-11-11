#!/bin/sh
# Compiles the Foundation-only logic with the macOS Swift toolchain and runs its checks.
# The Screen Time frameworks (FamilyControls, ManagedSettings, DeviceActivity) are iOS-only,
# so everything that imports them can only be built in Xcode; keep logic here when possible.
set -eu
cd "$(dirname "$0")"
OUT="$(mktemp -d)"
swiftc -o "$OUT/focus-logic-tests" ../ios/FocusLogic.swift main.swift
"$OUT/focus-logic-tests"
