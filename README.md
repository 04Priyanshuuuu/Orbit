# Orbit — TypeScript / TSX MVP

Windows-first offline desktop task tracker. Built with Electron, React, TypeScript, TSX and Vite.

## Requirements
- Windows 10/11, 64-bit
- Node.js 20.19+ or 22 LTS
- npm

## Install and run
Open this folder in VS Code and run:

```powershell
npm install
npm run dev
```

The first `npm install` needs internet to download dependencies and Electron. Once installed, Orbit's app features work offline.

## Features
- Transparent floating glass progress circle with adjustable size, opacity and ring
- Hover tilts and highlights the glass progress circle; click it to open or close the adjacent task panel
- The task panel includes My Day and custom-list tabs, inline task entry and completion, fixed daily/weekly/monthly progress rings, and active habit streaks
- The focus timer remains available in the dashboard and settings, but is not shown in the widget panel
- Drag widget; position is saved and restored when enabled
- `Ctrl + Alt + Space` hides/shows widget
- Daily recurring tasks, custom lists, optional task times (including entries such as `Study DSA 7pm`)
- Shared focus countdown timer with presets, custom duration, pause/resume and completion notification
- Monthly activity overview
- Settings for widget behavior, Windows startup, and timer defaults
- Local JSON persistence, completion history, and recovery backup in Electron `userData`

The widget's Always on top and Desktop-only options are mutually exclusive. Desktop-only disables pinning; Windows may cover the widget with other app windows. Startup with Windows is applied in packaged builds after the Windows user signs in; Orbit opens the floating widget, not the dashboard.

Orbit stores its existing `orbit-data.json` database in Electron's `userData` directory (not the installation directory), and maintains an `.bak` recovery copy. Existing task, list, settings, timer, and completion data is retained when the daily history field is added. Daily completion snapshots preserve historical analytics separately from today's task state.

## Build Windows portable app
```powershell
npm run dist:win
```

## If npm install appears stuck
1. Stop it with `Ctrl + C`.
2. Run `node -v` and `npm -v`.
3. Run `npm cache verify`.
4. Retry `npm install --verbose`.
5. If Electron download is the slow part, try another network or temporarily disable VPN/proxy. Don't repeatedly delete the npm cache.

No cloud service, login, telemetry or network calls are used at runtime. AI voice companion is not part of this MVP.
