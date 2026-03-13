#!/usr/bin/env bash
# setup-ios.sh — Run this on macOS to install iOS CocoaPods dependencies.
# Prerequisites: Ruby + CocoaPods installed (`sudo gem install cocoapods`)
#
# Usage:
#   chmod +x setup-ios.sh
#   ./setup-ios.sh
set -euo pipefail

echo "▶ Building web assets..."
npm run build

echo "▶ Syncing Capacitor..."
npx cap sync ios

echo "▶ Installing CocoaPods..."
cd ios/App
pod install --repo-update

echo ""
echo "✅ iOS setup complete."
echo "   Open ios/App/App.xcworkspace in Xcode to build and run."
