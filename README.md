# Orbit

**Orbit** is a minimalist, offline-first floating desktop productivity widget and focus timer built with **Electron**, **React**, and **TypeScript**. Designed with a dark monochrome aesthetic, Orbit lives quietly on your desktop as an interactive circular progress orb that expands into a lightweight daily task manager, streak tracker, and focus timer.

---

## Key Features

### Floating Progress Orb
- **Live Daily Progress Ring**: Displays real-time completion percentage for your **My Day** tasks or any selected custom list.
- **Continuous Dynamic Resizing**: Smoothly scale the orb from compact (`74px`) up to full-height focus mode using keyboard shortcuts (`Ctrl + Shift + Z` / `Ctrl + Shift + X`) or the dashboard slider.
- **True Desktop-Layer Pinning**: Switch between **Always on Top** (floats above active apps while studying or working) and **Desktop Only** mode (attaches directly to the Windows desktop wallpaper layer so it stays underneath open windows while remaining visible during *Show Desktop* / `Win + D` / 4-finger swipe down).
- **Position Memory**: Automatically remembers its exact screen coordinates across restarts and multi-monitor setups.

### Built-In Focus & Study Timer
- **Dual Timer Modes**:
  - **Countdown Timer**: Ideal for Pomodoro sprints or timed practice sessions (`Hr : Min : Sec` custom input + quick `5m`, `25m`, `45m`, `1h` presets).
  - **Study Stopwatch**: Track open-ended study sessions with an optional target duration.
- **Live Orb Integration**: When a timer is active, the orb switches to a crisp tabular clock display with a live progress ring.
- **Quick Hover Controls**: Hovering over the active timer orb reveals sleek inline controls right beneath the digits to **Configure**, **Pause/Resume**, or **Reset** without opening the full panel.
- **Desktop Notifications**: Optional audio-enabled system notification when a countdown session finishes.

### Quick-Access Task Panel & Pinned Mode
- **Expandable Floating Panel**: Click the orb to open a compact task drawer beside it (automatically adapts to left or right placement depending on screen edge proximity).
- **Pin-to-Screen Mode**: Pin the dialogue box onto your desktop so it stays open while you work. While pinned, pressing `Ctrl + Alt + Space` hides or reveals **only the circular orb** while keeping your pinned task list visible.
- **Custom Lists**: Organize tasks across **My Day** and custom lists (create, double-click to rename, or delete lists).
- **Flexible Scheduling & Recurrence**:
  - Schedule tasks with optional start/end time ranges (`7am–8am`).
  - Supports **Only Today**, **Daily**, **Weekdays**, **Weekends**, and **Custom Weekday** recurrences.
  - Double-click any task in the panel to edit its title, time range, or recurrence inline.

### Analytics, Streaks & Full Dashboard
- **Live Progress Rings**: Track **Daily**, **Weekly**, and **Monthly** completion percentages directly inside the widget footer and full dashboard.
- **Habit Streaks**: Automatically tracks your **Current Streak** and **Max Streak** for daily habits.
- **Full Desktop Dashboard**: Open the expanded dashboard (`↗`) to view long-term productivity history, manage all lists/tasks, and customize widget behavior.
- **100% Offline & Local**: All tasks, completion history, and settings are stored locally on your machine (`userData/orbit-data.json`) with automatic atomic writes and backup recovery.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Alt + Space` | Toggle widget visibility (when panel is pinned, toggles only the orb while keeping the panel visible) |
| `Ctrl + Shift + Z` | Increase orb size smoothly |
| `Ctrl + Shift + X` | Decrease orb size smoothly |
| `Ctrl + Shift + Space` | Toggle between **Always on Top** and **Desktop Only** wallpaper mode |

---

## Tech Stack

- **Desktop Runtime**: Electron 33
- **Frontend**: React 18, TypeScript, Vite (`electron-vite`)
- **Icons**: Lucide React
- **Packaging**: `electron-builder` (Windows Portable `.exe`)

---

## Getting Started (Development)

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation & Run
```bash
# Clone the repository
git clone [https://github.com/](https://github.com/)<your-username>/orbit.git
cd orbit

# Install dependencies
npm install

# Start in development mode
npm run dev
