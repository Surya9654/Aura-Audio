# Aura Audio — Windows 11 Native Widget Board Integration

This component implements a native **Windows 11 Widget Provider** using the **Windows App SDK** and **Adaptive Cards (v1.5)**, enabling Aura 2.0 to display live track controls and telemetry directly inside the Windows 11 Widget Board (`Win + W`).

---

## Architecture Overview

```
 ┌────────────────────────┐                    ┌───────────────────────────────┐
 │   Aura Electron App    │                    │  Native C# Widget Provider    │
 │ (main/widget-bridge.js)│                    │ (AuraWidgetProvider.exe)      │
 └───────────┬────────────┘                    └───────────────┬───────────────┘
             │                                                 │
             │   IPC Named Pipe: \\.\pipe\AuraPlayerWidgetPipe │
             │   • Track state updates (JSON) ───────────────> │ Updates Adaptive Card
             │   <── Action invocations (Play/Pause/Next/Prev) │ (IWidgetProvider)
             │                                                 │
             │                                                 ▼
             │                                    ┌────────────────────────┐
             │                                    │  Windows 11 Widget     │
             │                                    │  Board (Win + W)       │
             └────────────────────────────────────┴────────────────────────┘
```

1. **Adaptive Card Templates (`Templates/`)**:
   - `WidgetCardSmall.json`: Compact 1x1 layout with artwork and play/pause toggle.
   - `WidgetCardMedium.json`: Standard 2x2 layout with cover art, track info, FLAC telemetry chip, progress timeline, and transport controls.
   - `WidgetCardLarge.json`: Full 4x4 layout with audiophile resolution details (sample rate/bit depth), audio endpoint routing, and dynamic range status.

2. **C# WinAppSDK Component (`WidgetProvider.cs` & `Program.cs`)**:
   - Implements `Microsoft.Windows.Widgets.Providers.IWidgetProvider`.
   - Out-of-process COM Server registration (`CLSID: E913B00C-4A2B-4A1C-9E6D-29A61972EA10`).
   - Receives widget lifecycle events from the Windows Shell (`CreateWidget`, `OnActionInvoked`, `OnWidgetContextChanged`, `DeleteWidget`).

3. **Electron Named Pipe Bridge (`src/main/widget-bridge.js`)**:
   - Local IPC Named Pipe server (`\\.\pipe\AuraPlayerWidgetPipe`).
   - Pushes live song title, artist, album, artwork, playback state, and duration whenever audio changes.
   - Receives transport actions from the Widget Board and triggers player callbacks.

---

## Prerequisites for Building

1. **Windows 11** (Build 22000 or newer)
2. **.NET 8.0 SDK** (or newer): [Download .NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
3. **Windows App SDK 1.6 Runtime**: Installed via Visual Studio or `winget install Microsoft.WindowsAppSDK.1.6`

---

## Build & Registration Instructions

### 1. Developer Mode (Required by Windows for local widgets)
To allow Windows 11 to register local widget providers:
1. Open **Settings** > **System** > **For developers** (or run `start ms-settings:developers`).
2. Toggle **Developer Mode** to **ON**.

### 2. Register the Widget
Double-click [windows-widget/register.bat](file:///c:/Users/surya/FLAC_player/windows-widget/register.bat), or run:
```powershell
cd windows-widget
powershell -ExecutionPolicy Bypass -Command "Add-AppxPackage -Register 'bin\Release\net8.0-windows10.0.19041.0\win-x64\AppxManifest.xml'"
```

### 3. Open Windows 11 Widget Board
1. Press **`Win + W`** to open the Windows 11 Widgets Board.
2. Click the **`+`** button (Add Widgets).
3. **Aura Lossless Now Playing** will now appear in your list! Click **Pin**.
4. Play, Pause, Next, and Previous actions clicked on the widget will execute directly in Aura Audio Player via the Named Pipe bridge.
