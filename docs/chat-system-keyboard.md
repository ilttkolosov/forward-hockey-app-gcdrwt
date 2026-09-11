# Android chat keyboard: system insets

Branch: `refactor/native-chat-keyboard`. First test build: 2.4.93 (246).

## Ownership and coordinates

Expo SDK 54 pins `react-native-keyboard-controller` 1.18.5. A single provider above the navigator activates only for `/messenger/room/*`. It owns Android window insets and IME animation. Other Android screens restore the default window behavior; iOS keeps the existing KeyboardAvoidingView and does not mount this provider.

While active, the provider exposes the full window with translucent status/navigation bars. The chat SafeAreaView applies top/bottom system-bar space once. The header, pins and filter remain outside a clipped body. Body layout y is relative to KeyboardFrame inside SafeAreaView, so its window offset is y plus the top safe-area inset. The list and composer share `translate-with-padding`. During motion only translation changes. Padding/list layout changes at transition boundaries, including keyboard-size changes. Do not reintroduce an editor-derived overlap, a second margin or manufacturer checks.

The bottom of the closed body is window height minus navigation inset. The controller calculates the remaining IME overlap; navigation space is not added above the keyboard again. Floating/hardware keyboards with zero bottom IME inset create no synthetic keyboard height. Rotation and resized windows update the controller's window dimensions and body layout.

All editor keyboard geometry observers, timer probes and Xiaomi exceptions were removed. Rich-text colors are processed to native integer colors on Android; iOS keeps UIColor-compatible strings.

## Validation

`npm run check:messenger-android-keyboard` executes the pinned avoiding-view implementation against window, header and system-bar geometry; repeated open/close and height changes; and the actual rich-text wrapper for Android/iOS colors. It also checks that the old geometry paths are absent. These simulated checks do not reproduce vendor firmware.

GitHub Actions performs TypeScript, lint, bundle checks and Android native compilation, followed by an arm64 release APK. Device validation remains required.

## Device checks

Run on Mi 11 Lite / Android 13 and Honor Magic7 Pro / Android 15, with gesture navigation and three-button navigation where available:

- Open chat, open/hide keyboard using its down button, reopen ten times without leaving the input.
- Change keyboard height (emoji/suggestions/language); type multiline text.
- Add/remove photo and video; return from media picker and camera, including cancellation.
- Reply/edit a message and cancel; test with one/multiple pinned messages.
- At latest message, check it remains visible. While reading older messages, keyboard changes must not jump to the latest or interrupt navigation to a pin.
- Rotate, background/resume, enter another chat, leave to registration/search and open a keyboard there.
- Check no gap/overlap, stable header, correct selection/placeholder colors, and no repeated color PropSetException.

Logcat query: `message:ForwardIME`. Expect `system-insets` start/end records with height, bodyTop and navigationInset. No polling/per-frame logs or message content. Report a device video and full log if geometry differs.

## Local build

This change adds a native dependency and needs a fresh binary. Before npm ci on Windows, close Android Studio/Metro and stop Gradle from C:\FH\android (`.\gradlew.bat --stop`). Then update this branch and run npm ci from C:\FH, followed by `.\gradlew.bat assembleRelease` from android. An Expo prebuild is needed only if the local native project is being regenerated; normal autolinking discovers the added module. Do not run Gradle clean after replacing node_modules: if old CMake outputs reference deleted codegen directories, remove only generated android/app/.cxx and android/app/build before rebuilding.

Keep this branch separate until both device checks pass. It is not merged into feat/chat-message-pinning or main.

Sources: https://docs.expo.dev/versions/v54.0.0/sdk/keyboard-controller/ and https://kirillzyusko.github.io/react-native-keyboard-controller/docs/1.18.0/api/components/keyboard-avoiding-view
