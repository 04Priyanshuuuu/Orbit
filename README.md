# 🌌 Orbit — Your Productivity, in Orbit

<p align="center">
  <b>A tiny floating widget. A calmer, more focused desktop.</b>
</p>

<p align="center">
  Orbit is an offline-first desktop productivity companion that turns your daily tasks, habits, and focus sessions into a simple visual experience — all inside a floating progress orb.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-33-47848F?style=flat-square&logo=electron" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-Ready-3178C6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/Offline--First-Local%20Storage-success?style=flat-square" />
  <img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=flat-square&logo=windows" />
</p>

---

## ✦ The Idea

Most productivity apps demand your attention.

**Orbit doesn't.**

It quietly sits on your desktop, keeping your progress visible without interrupting your workflow. Check your tasks, start a focus session, build streaks, and keep moving — without opening another heavy application.

> Your goals stay visible. Your workflow stays uninterrupted.

---

## 🪐 Experience Orbit

<!-- Replace these placeholders with actual screenshots/GIFs -->

<p align="center">
  <img src="docs/images/orbit-preview.gif" width="70%" alt="Orbit floating widget preview" />
</p>

<p align="center">
  <i>A floating progress orb that expands into your personal productivity space.</i>
</p>

<details>
<summary>✨ What happens when you interact with Orbit?</summary>

- View your daily progress through a live circular ring.
- Expand the orb to access your tasks.
- Switch between different task lists.
- Start a countdown or stopwatch.
- Resize and reposition Orbit according to your workspace.
- Keep your task panel pinned while working.

</details>

---

## 🚀 Features

<table>
<tr>
<td width="50%">

### 🌑 Floating Progress Orb

A minimal widget designed to stay out of your way.

- Live task completion ring
- Dynamic resizing from **74px** to full focus mode
- Always-on-top or desktop-layer mode
- Remembers position across restarts
- Multi-monitor positioning support

</td>
<td width="50%">

### ⏱️ Focus & Study Timer

Turn focused work into measurable sessions.

- Countdown & stopwatch modes
- Custom hour, minute & second inputs
- Quick presets: `5m` · `25m` · `45m` · `1h
- Pause, resume & reset
- Live timer inside the orb
- Completion notifications with optional sound

</td>
</tr>

<tr>
<td width="50%">

### ✅ Smart Task Management

Keep your day organized without a bulky task manager.

- My Day & custom lists
- Create, rename & delete lists
- Inline task editing
- Optional start & end times
- Recurring tasks
- Adaptive task drawer positioning

</td>
<td width="50%">

### 📌 Pin & Stay Focused

Keep important tasks visible while switching apps.

- Pin the task panel to your desktop
- Hide or reveal only the orb
- Keep the pinned panel visible
- Quick controls available directly from the orb

</td>
</tr>

<tr>
<td width="50%">

### 📊 Progress & Streaks

Make consistency visible.

- Daily completion tracking
- Weekly progress
- Monthly progress
- Current streak
- Longest streak
- Productivity history

</td>
<td width="50%">

### 🔒 Offline by Design

Your productivity data stays on your machine.

- No account required
- No cloud dependency
- Local data storage
- Automatic atomic writes
- Backup & recovery support

</td>
</tr>
</table>

---

## ⏳ Focus Modes

Choose how you work.

<details open>
<summary><b>Countdown Timer</b></summary>

Set a fixed duration for your next focus session.

Perfect for:

- Pomodoro sessions
- Coding practice
- DSA problem solving
- Study sessions
- Short breaks

**Quick start:** `5m` → `25m` → `45m` → `1h`

</details>

<details>
<summary><b>Study Stopwatch</b></summary>

Start working and let Orbit track your time.

An optional target duration lets you stay accountable without forcing a countdown.

</details>

---

## 📋 Task Scheduling

Orbit adapts to the way you plan your day.

| Schedule | Description |
|---|---|
| `Only Today` | One-time task for the current day |
| `Daily` | Repeats every day |
| `Weekdays` | Monday–Friday |
| `Weekends` | Saturday & Sunday |
| `Custom Weekdays` | Choose specific days |

Tasks can also have optional time ranges, such as `7:00 AM – 8:00 AM`.

---

## 🎮 Keyboard Shortcuts

Move around Orbit without reaching for your mouse.

| Shortcut | Action |
|---|---|
| `Ctrl + Alt + Space` | Toggle widget visibility |
| `Ctrl + Shift + Z` | Increase orb size |
| `Ctrl + Shift + X` | Decrease orb size |
| `Ctrl + Shift + Space` | Toggle Always on Top / Desktop Only mode |

<details>
<summary>📌 Special behavior when the task panel is pinned</summary>

When the panel is pinned, `Ctrl + Alt + Space` toggles only the orb — your pinned task panel remains visible.

</details>

---

## 🎨 Built for a Quiet Workspace

Orbit follows a minimal, dark monochrome design philosophy.

- No clutter
- No unnecessary animations
- No distracting dashboards
- No constant interruptions

Just a small visual reminder of where you are and where you're going.

---

## 🛠️ Built With

<p align="center">
  <img src="https://skillicons.dev/icons?i=electron,react,ts,vite,nodejs" alt="Tech stack" />
</p>

| Technology | Purpose |
|---|---|
| **Electron 33** | Desktop runtime |
| **React 18** | User interface |
| **TypeScript** | Type safety |
| **Vite / electron-vite** | Development & build tooling |
| **Lucide React** | Minimal icons |
| **electron-builder** | Windows packaging |

---

## ⚙️ Getting Started

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) `v18+`
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/04priyanshuuuu/orbit.git

# Navigate into the project
cd orbit

# Install dependencies
npm install
```

### Run in Development

```bash
npm run dev
```

Orbit will launch as a desktop widget in development mode.

---

## 📦 Build

Orbit uses `electron-builder` to package the application.

```bash
npm run build
```

<details>
<summary>🪟 Windows Portable Build</summary>

Generate a portable Windows executable that can be run without a traditional installation.

Check your project's `electron-builder` configuration for the exact output location.

</details>

---

## 💾 Data & Privacy

Orbit stores its information locally.

```text
userData/
└── orbit-data.json
```

Your:

- Tasks
- Completion history
- Streaks
- Preferences
- Widget position & settings

are stored locally, with automatic writes and backup recovery.

**No cloud. No account. No unnecessary data collection.**

---

## 🗺️ Roadmap

- [x] Floating productivity orb
- [x] Daily task tracking
- [x] Custom task lists
- [x] Focus countdown
- [x] Study stopwatch
- [x] Habit streaks
- [x] Offline local storage
- [x] Desktop pinning modes
- [x] Keyboard shortcuts
- [ ] More productivity analytics
- [ ] Additional themes & customization
- [ ] More focus session insights

---

## 💡 Philosophy

> Small progress, repeated daily, creates extraordinary results.

Orbit is built around a simple idea:

**You don't need another app demanding your attention. You need one quietly reminding you to use it well.**

---

<p align="center">
  <b>Stay focused. Keep moving. Stay in Orbit. 🪐</b>
</p>

<p align="center">
  Made with ☕ and a little obsession for productivity.
</p>
