import { app, BrowserWindow, globalShortcut, ipcMain, Notification, screen } from 'electron';
import { join } from 'node:path';
import fs from 'node:fs';

app.setName('Orbit');

type TaskDraft = {
  title: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  daily: boolean;
  listId?: string;
  recurrence?: TaskRecurrence;
};
type TaskUpdatePatch = {
  title: string;
  startTime?: string;
  endTime?: string;
  recurrence: TaskRecurrence;
};
type SettingsPatch = Partial<OrbitData['settings']>;

const isValidClockTime = (value: string) => {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const MIN_ORB_SIZE = 74;
const MEDIUM_ORB_SIZE = 116;
const SIZE_STEP_PX = 38;

const defaultSettings: OrbitData['settings'] = {
  widgetX: 100,
  widgetY: 120,
  widgetSize: 'medium',
  customOrbSize: MEDIUM_ORB_SIZE,
  widgetOpacity: 78,
  showProgressRing: true,
  alwaysOnTop: true,
  desktopOnly: false,
  rememberPosition: true,
  startWithWindows: false,
  defaultTimerMinutes: 25,
  timerSound: true
};
const initialData: OrbitData = {
  lists: [{ id: 'daily', name: 'Daily' }],
  tasks: [],
  completions: {},
  history: {},
  settings: defaultSettings,
  timer: {
    mode: 'countdown',
    durationSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    elapsedSeconds: 0,
    endAt: null,
    startedAt: null,
    running: false
  }
};

let widget: BrowserWindow | null = null;
let dashboard: BrowserWindow | null = null;
let expanded = false;
let panelPinned = false;
let orbHiddenWhilePinned = false;
let expandedPlacement: WidgetData['placement'] = {
  panelRight: true,
  orbX: 0,
  orbY: 0,
  orbSize: MEDIUM_ORB_SIZE,
  panelY: 0,
  panelWidth: 390,
  panelHeight: 560,
  windowWidth: 518,
  windowHeight: 560
};
let pendingExpandedBounds: Electron.Rectangle | null = null;
let pendingCollapsedBounds: Electron.Rectangle | null = null;
let storedData: OrbitData;
let dragStart: { cursorX: number; cursorY: number; windowX: number; windowY: number } | null = null;
let timerInterval: NodeJS.Timeout | null = null;
let timerFinishedOnStartup = false;
let transientInteractionActive = false;

const filePath = () => join(app.getPath('userData'), 'orbit-data.json');
const backupPath = () => `${filePath()}.bak`;
const temporaryPath = () => `${filePath()}.tmp`;
const panelWidth = 390;
const panelHeight = 560;
const panelGap = 12;

function getWorkAreaForWidget() {
  if (widget && !widget.isDestroyed()) {
    return screen.getDisplayMatching(widget.getBounds()).workArea;
  }
  return screen.getDisplayNearestPoint({
    x: storedData?.settings.widgetX ?? 100,
    y: storedData?.settings.widgetY ?? 120
  }).workArea;
}

const maxOrbSize = () => Math.max(240, getWorkAreaForWidget().height);

const widgetSize = (data = storedData) => {
  const ceiling = maxOrbSize();
  if (Number.isFinite(data.settings.customOrbSize)) {
    return Math.max(MIN_ORB_SIZE, Math.min(ceiling, Math.round(data.settings.customOrbSize!)));
  }
  if (data.settings.widgetSize === 'small') return MIN_ORB_SIZE;
  if (data.settings.widgetSize === 'large') return ceiling;
  return MEDIUM_ORB_SIZE;
};

function sizeLabelForPx(px: number): OrbitData['settings']['widgetSize'] {
  if (px <= MIN_ORB_SIZE + 12) return 'small';
  if (px >= maxOrbSize() - 24) return 'large';
  return 'medium';
}

const debugLog = (...values: unknown[]) => {
  if (!app.isPackaged) console.info('[Orbit]', ...values);
};
const dateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function isValidDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTaskScheduledForDate(task: OrbitTask, date: string): boolean {
  if (!isValidDateKey(date)) return false;
  if (task.recurrence?.type === 'once') return task.recurrence.date === date;
  if (task.recurrence?.type === 'daily') return true;
  if (task.recurrence?.type === 'weekly') {
    const [year, month, day] = date.split('-').map(Number);
    return task.recurrence.days.includes(new Date(year, month - 1, day).getDay());
  }
  if (task.daily) return true;
  if (task.date) return task.date === date;
  return isValidDateKey(task.createdAt?.slice(0, 10)) && task.createdAt.slice(0, 10) === date;
}

function normalizeData(value: unknown): OrbitData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Orbit data must contain a JSON object.');
  }
  const input = value as Partial<OrbitData>;
  if (input.tasks !== undefined && !Array.isArray(input.tasks)) throw new Error('Orbit task data is invalid.');
  if (input.lists !== undefined && !Array.isArray(input.lists)) throw new Error('Orbit list data is invalid.');
  if (input.settings !== undefined && (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings))) {
    throw new Error('Orbit settings data is invalid.');
  }
  if (input.completions !== undefined && (!input.completions || typeof input.completions !== 'object' || Array.isArray(input.completions))) {
    throw new Error('Orbit completion data is invalid.');
  }
  if (input.history !== undefined && (!input.history || typeof input.history !== 'object' || Array.isArray(input.history))) {
    throw new Error('Orbit daily history data is invalid.');
  }
  const rawSettings: Partial<OrbitData['settings']> = input.settings ?? {};
  const resolvedSizeLabel = ['small', 'medium', 'large'].includes(rawSettings.widgetSize ?? '')
    ? rawSettings.widgetSize!
    : defaultSettings.widgetSize;
  const fallbackPx = resolvedSizeLabel === 'small' ? MIN_ORB_SIZE : resolvedSizeLabel === 'large' ? 680 : MEDIUM_ORB_SIZE;
  const settings: OrbitData['settings'] = {
    ...defaultSettings,
    ...rawSettings,
    widgetX: Number.isFinite(rawSettings.widgetX) ? rawSettings.widgetX! : defaultSettings.widgetX,
    widgetY: Number.isFinite(rawSettings.widgetY) ? rawSettings.widgetY! : defaultSettings.widgetY,
    widgetSize: resolvedSizeLabel,
    customOrbSize: Number.isFinite(rawSettings.customOrbSize)
      ? Math.max(MIN_ORB_SIZE, Math.round(rawSettings.customOrbSize!))
      : fallbackPx,
    widgetOpacity: Number.isFinite(rawSettings.widgetOpacity)
      ? Math.max(35, Math.min(100, Math.round(rawSettings.widgetOpacity!)))
      : defaultSettings.widgetOpacity,
    defaultTimerMinutes: Number.isFinite(rawSettings.defaultTimerMinutes)
      ? Math.max(1, Math.min(120, Math.round(rawSettings.defaultTimerMinutes!)))
      : defaultSettings.defaultTimerMinutes,
    showProgressRing: typeof rawSettings.showProgressRing === 'boolean' ? rawSettings.showProgressRing : defaultSettings.showProgressRing,
    alwaysOnTop: typeof rawSettings.alwaysOnTop === 'boolean' ? rawSettings.alwaysOnTop : defaultSettings.alwaysOnTop,
    desktopOnly: typeof rawSettings.desktopOnly === 'boolean' ? rawSettings.desktopOnly : defaultSettings.desktopOnly,
    rememberPosition: typeof rawSettings.rememberPosition === 'boolean' ? rawSettings.rememberPosition : defaultSettings.rememberPosition,
    startWithWindows: typeof rawSettings.startWithWindows === 'boolean' ? rawSettings.startWithWindows : defaultSettings.startWithWindows,
    timerSound: typeof rawSettings.timerSound === 'boolean' ? rawSettings.timerSound : defaultSettings.timerSound
  };
  if (settings.desktopOnly) settings.alwaysOnTop = false;
  const mode = input.timer?.mode === 'stopwatch' ? 'stopwatch' : 'countdown';
  const durationSeconds = Number.isFinite(input.timer?.durationSeconds)
    ? Math.max(0, Math.min(86399, Math.round(input.timer!.durationSeconds)))
    : settings.defaultTimerMinutes * 60;
  const timer: OrbitData['timer'] = input.timer
    ? {
        mode,
        durationSeconds,
        remainingSeconds: Number.isFinite(input.timer.remainingSeconds)
          ? Math.max(0, Math.min(86399, Math.round(input.timer.remainingSeconds)))
          : durationSeconds,
        elapsedSeconds: Number.isFinite(input.timer.elapsedSeconds)
          ? Math.max(0, Math.min(86399, Math.round(input.timer.elapsedSeconds)))
          : 0,
        endAt: typeof input.timer.endAt === 'number' ? input.timer.endAt : null,
        startedAt: typeof input.timer.startedAt === 'number' ? input.timer.startedAt : null,
        running: input.timer.running === true
      }
    : {
        mode: 'countdown',
        durationSeconds,
        remainingSeconds: durationSeconds,
        elapsedSeconds: 0,
        endAt: null,
        startedAt: null,
        running: false
      };

  const tasks: OrbitTask[] = (input.tasks ?? []).map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Orbit task ${index + 1} is invalid.`);
    const task = raw as OrbitTask & { recurrence?: TaskRecurrence };
    let recurrence: TaskRecurrence | undefined;
    if (task.recurrence?.type === 'once' && isValidDateKey(task.recurrence.date)) {
      recurrence = { type: 'once', date: task.recurrence.date };
    } else if (task.recurrence?.type === 'daily') {
      recurrence = { type: 'daily' };
    } else if (task.recurrence?.type === 'weekly' && Array.isArray(task.recurrence.days)) {
      const days = [...new Set(task.recurrence.days.filter(day =>
        Number.isInteger(day) && day >= 0 && day <= 6
      ))];
      if (days.length) recurrence = { type: 'weekly', days };
    }
    if (!recurrence) {
      if (task.daily === true) recurrence = { type: 'daily' };
      else if (isValidDateKey(task.date)) recurrence = { type: 'once', date: task.date };
      else if (isValidDateKey(task.createdAt?.slice(0, 10))) {
        recurrence = { type: 'once', date: task.createdAt.slice(0, 10) };
      } else recurrence = { type: 'once', date: dateKey() };
    }
    return {
      ...task,
      recurrence,
      daily: recurrence.type === 'daily',
      date: recurrence.type === 'once' ? recurrence.date : task.date
    };
  });
  const completions = input.completions && typeof input.completions === 'object' ? input.completions : {};
  const history: OrbitData['history'] = {};
  for (const [key, record] of Object.entries(input.history ?? {})) {
    if (!record || typeof record !== 'object' || !Number.isFinite(record.totalTasks) ||
      !Number.isFinite(record.completedTasks) || !Number.isFinite(record.percentage)) {
      throw new Error(`Orbit daily history entry for ${key} is invalid.`);
    }
    history[key] = {
      totalTasks: Math.max(0, Math.round(record.totalTasks)),
      completedTasks: Math.max(0, Math.round(record.completedTasks)),
      percentage: Math.max(0, Math.min(100, Math.round(record.percentage))),
      ...(Array.isArray(record.taskIds)
        ? { taskIds: [...new Set(record.taskIds.filter((id): id is string => typeof id === 'string'))] }
        : {})
    };
  }
  for (const [key, day] of Object.entries(completions)) {
    if (history[key]) continue;
    const dayTasks = tasks.filter(task => task.listId === 'daily' && isTaskScheduledForDate(task, key));
    const completedTasks = Object.values(day ?? {}).filter(Boolean).length;
    const totalTasks = Math.max(dayTasks.length, completedTasks);
    history[key] = {
      totalTasks,
      completedTasks,
      percentage: totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0
    };
  }
  const normalizedLists = (input.lists ?? structuredClone(initialData.lists)).filter(
    (list): list is { id: string; name: string } =>
      Boolean(list && typeof list.id === 'string' && typeof list.name === 'string' && list.name.trim())
  );
  if (!normalizedLists.some(list => list.id === 'daily')) {
    normalizedLists.unshift({ id: 'daily', name: 'Daily' });
  }
  return {
    lists: normalizedLists,
    tasks,
    completions,
    history,
    settings,
    timer
  };
}

function persistData() {
  const path = filePath();
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const temp = temporaryPath();
  const contents = JSON.stringify(storedData, null, 2);
  const fd = fs.openSync(temp, 'w');
  try {
    fs.writeFileSync(fd, contents, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  normalizeData(JSON.parse(fs.readFileSync(temp, 'utf8')));
  if (fs.existsSync(path)) {
    const backupTemp = `${backupPath()}.tmp`;
    fs.copyFileSync(path, backupTemp);
    normalizeData(JSON.parse(fs.readFileSync(backupTemp, 'utf8')));
    fs.renameSync(backupTemp, backupPath());
  }
  fs.renameSync(temp, path);
}

function loadData() {
  const path = filePath();
  if (!fs.existsSync(path) && fs.existsSync(backupPath())) {
    storedData = normalizeData(JSON.parse(fs.readFileSync(backupPath(), 'utf8')));
    persistData();
    return;
  }
  if (!fs.existsSync(path)) {
    storedData = structuredClone(initialData);
    persistData();
    return;
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path, 'utf8'));
    storedData = normalizeData(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(storedData)) persistData();
  } catch (error) {
    try {
      if (!fs.existsSync(backupPath())) throw error;
      storedData = normalizeData(JSON.parse(fs.readFileSync(backupPath(), 'utf8')));
      fs.renameSync(path, `${path}.corrupt-${Date.now()}`);
      persistData();
      console.warn(`Recovered Orbit data from ${backupPath()}; the invalid file was preserved.`, error);
    } catch (backupError) {
      console.error(`Unable to load Orbit data at ${path}. Existing files were left untouched.`, backupError);
      throw backupError;
    }
  }
}

function getTodayTasks(data = storedData) {
  const key = dateKey();
  const tasks = data.tasks.filter(task => task.listId === 'daily' && isTaskScheduledForDate(task, key));
  return [...new Map(tasks.map(task => [task.id, task])).values()];
}

function updateDailyHistory(key: string) {
  const tasks = storedData.tasks.filter(task => task.listId === 'daily' && isTaskScheduledForDate(task, key));
  const taskIds = [...new Set(tasks.map(task => task.id))];
  const completedTasks = taskIds.filter(id => storedData.completions[key]?.[id] === true).length;
  const totalTasks = taskIds.length;
  storedData.history[key] = {
    totalTasks,
    completedTasks,
    percentage: totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0,
    taskIds
  };
}

function widgetPayload(): WidgetData {
  const todayTasks = getTodayTasks();
  const completed = todayTasks.filter(task => storedData.completions[dateKey()]?.[task.id] === true).length;
  return {
    ...storedData,
    percent: todayTasks.length ? Math.round(completed / todayTasks.length * 100) : 0,
    history: storedData.history,
    completions: storedData.completions,
    settings: storedData.settings,
    timer: currentTimer(),
    expanded,
    pinned: panelPinned,
    orbHidden: orbHiddenWhilePinned,
    placement: {
      ...expandedPlacement,
      orbSize: widgetSize()
    }
  };
}

function currentTimer(): OrbitData['timer'] {
  if (storedData.timer.mode === 'stopwatch') {
    if (!storedData.timer.running || !storedData.timer.startedAt) return storedData.timer;
    const elapsedSeconds = Math.min(86399, Math.max(0, Math.floor((Date.now() - storedData.timer.startedAt) / 1000)));
    return { ...storedData.timer, elapsedSeconds, running: true };
  }
  if (!storedData.timer.running || !storedData.timer.endAt) return storedData.timer;
  const remainingSeconds = Math.max(0, Math.ceil((storedData.timer.endAt - Date.now()) / 1000));
  return { ...storedData.timer, remainingSeconds, running: remainingSeconds > 0 };
}

function sendWidgetData() {
  if (widget && !widget.isDestroyed()) widget.webContents.send('orbit:widget-data', widgetPayload());
}

function sendTimerData() {
  const timer = currentTimer();
  sendWidgetData();
  dashboard?.webContents.send('orbit:timer-data', timer);
}

function broadcastDataChanged() {
  sendWidgetData();
  dashboard?.webContents.send('orbit:data-changed');
}

function loadRenderer(target: BrowserWindow, hash: string) {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const rendererPath = join(__dirname, '../renderer/index.html');
  const load = devUrl
    ? (() => {
        const url = new URL(devUrl);
        url.hash = hash;
        debugLog(`Loading ${hash} renderer from ${url.toString()}`);
        return target.loadURL(url.toString());
      })()
    : (() => {
        debugLog(`Loading ${hash} renderer from ${rendererPath}`);
        return target.loadFile(rendererPath, { hash });
      })();
  void load.then(async () => {
    if (app.isPackaged || target.isDestroyed()) return;
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (target.isDestroyed()) return;
  }).catch(error => console.error(`Unable to load or inspect the Orbit ${hash} window.`, error));
}

function clampBounds(x: number, y: number, width: number, height: number) {
  const display = screen.getDisplayMatching({ x, y, width, height });
  const { workArea } = display;
  return {
    x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width)),
    y: Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height))
  };
}

function persistPosition() {
  if (!storedData.settings.rememberPosition || !widget || widget.isDestroyed()) return;
  const [windowX, windowY] = widget.getPosition();
  const widgetX = windowX + (expanded ? expandedPlacement.orbX : 0);
  const widgetY = windowY + (expanded ? expandedPlacement.orbY : 0);
  storedData.settings = { ...storedData.settings, widgetX, widgetY };
  persistData();
}

function getExpandedBounds(circleX: number, circleY: number, size: number): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint({ x: circleX + size / 2, y: circleY + size / 2 });
  const { workArea } = display;
  const rightSpace = Math.max(0, workArea.x + workArea.width - circleX - size);
  const leftSpace = Math.max(0, circleX - workArea.x);
  const panelRight = rightSpace >= panelWidth + panelGap || rightSpace >= leftSpace;
  const availableSideSpace = panelRight ? rightSpace : leftSpace;
  const actualPanelWidth = Math.min(panelWidth, Math.max(0, availableSideSpace - panelGap));
  const actualPanelHeight = Math.min(panelHeight, workArea.height);
  const windowWidth = actualPanelWidth + panelGap + size;
  const windowHeight = Math.max(actualPanelHeight, size);
  const orbX = panelRight ? 0 : actualPanelWidth + panelGap;
  const clampedCircleY = Math.max(workArea.y, Math.min(circleY, workArea.y + workArea.height - size));
  const desiredX = panelRight ? circleX : circleX - windowWidth + size;
  const desiredY = clampedCircleY - Math.round((windowHeight - size) / 2);
  const bounds = {
    x: Math.max(workArea.x, Math.min(desiredX, workArea.x + workArea.width - windowWidth)),
    y: Math.max(workArea.y, Math.min(desiredY, workArea.y + workArea.height - windowHeight))
  };
  const orbY = Math.max(0, Math.min(clampedCircleY - bounds.y, windowHeight - size));
  const panelY = Math.max(0, Math.min(Math.round((windowHeight - actualPanelHeight) / 2), windowHeight - actualPanelHeight));
  expandedPlacement = {
    panelRight,
    orbX,
    orbY,
    orbSize: size,
    panelY,
    panelWidth: actualPanelWidth,
    panelHeight: actualPanelHeight,
    windowWidth,
    windowHeight
  };
  return { ...bounds, width: windowWidth, height: windowHeight };
}

function applyWidgetSettings() {
  if (!widget || widget.isDestroyed()) return;
  const pinOnTop = storedData.settings.alwaysOnTop && !storedData.settings.desktopOnly;
  widget.setAlwaysOnTop(pinOnTop, pinOnTop ? 'floating' : 'normal');
  const size = widgetSize();
  const [x, y] = widget.getPosition();
  if (expanded) {
    const circleX = x + expandedPlacement.orbX;
    const circleY = y + expandedPlacement.orbY;
    widget.setBounds(getExpandedBounds(circleX, circleY, size));
  } else {
    const bounds = clampBounds(x, y, size, size);
    widget.setBounds({ ...bounds, width: size, height: size });
  }
}

function stepWidgetSize(direction: 1 | -1) {
  const currentPx = widgetSize();
  const ceiling = maxOrbSize();
  const nextPx = Math.max(MIN_ORB_SIZE, Math.min(ceiling, currentPx + direction * SIZE_STEP_PX));
  if (nextPx === currentPx) return;
  storedData.settings = {
    ...storedData.settings,
    customOrbSize: nextPx,
    widgetSize: sizeLabelForPx(nextPx)
  };
  persistData();
  applyWidgetSettings();
  broadcastDataChanged();
}

function toggleDesktopOverlayMode() {
  const nextDesktopOnly = !storedData.settings.desktopOnly;
  storedData.settings = {
    ...storedData.settings,
    desktopOnly: nextDesktopOnly,
    alwaysOnTop: !nextDesktopOnly
  };
  persistData();
  applyWidgetSettings();
  broadcastDataChanged();
}

function createWidget() {
  if (widget && !widget.isDestroyed()) {
    if (widget.isMinimized()) widget.restore();
    widget.show();
    applyWidgetSettings();
    return;
  }
  const size = widgetSize();
  const position = storedData.settings.rememberPosition
    ? clampBounds(storedData.settings.widgetX, storedData.settings.widgetY, size, size)
    : clampBounds(100, 120, size, size);
  widget = new BrowserWindow({
    width: size,
    height: size,
    ...position,
    show: true,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: storedData.settings.alwaysOnTop && !storedData.settings.desktopOnly,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  loadRenderer(widget, 'widget');
  widget.on('blur', () => {
    setTimeout(collapseWidgetOnBlur, 120);
  });
  widget.on('closed', () => {
    persistPosition();
    widget = null;
  });
  widget.webContents.on('did-finish-load', sendWidgetData);
}

function createDashboard() {
  if (dashboard && !dashboard.isDestroyed()) {
    if (dashboard.isMinimized()) dashboard.restore();
    dashboard.show();
    dashboard.focus();
    return;
  }
  dashboard = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    title: 'Orbit',
    show: true,
    transparent: false,
    backgroundColor: '#06080b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  loadRenderer(dashboard, 'app');
  dashboard.on('closed', () => { dashboard = null; });
  dashboard.webContents.on('did-finish-load', () => {
    dashboard?.webContents.send('orbit:data-changed');
    dashboard?.webContents.send('orbit:timer-data', currentTimer());
  });
}

function prepareWidgetExpansion() {
  if (!widget || widget.isDestroyed()) return expandedPlacement;
  if (expanded) return expandedPlacement;
  const [windowX, windowY] = widget.getPosition();
  const size = widgetSize();
  const bounds = getExpandedBounds(windowX, windowY, size);
  pendingExpandedBounds = bounds;
  return expandedPlacement;
}

function prepareWidgetCollapse() {
  pendingExpandedBounds = null;
  const size = widgetSize();
  if (!widget || widget.isDestroyed() || !expanded) {
    expandedPlacement = {
      panelRight: true,
      orbX: 0,
      orbY: 0,
      orbSize: size,
      panelY: 0,
      panelWidth,
      panelHeight,
      windowWidth: panelWidth + panelGap + size,
      windowHeight: Math.max(panelHeight, size)
    };
    return expandedPlacement;
  }
  const [windowX, windowY] = widget.getPosition();
  const x = windowX + expandedPlacement.orbX;
  const y = windowY + expandedPlacement.orbY;
  pendingCollapsedBounds = { ...clampBounds(x, y, size, size), width: size, height: size };
  return {
    panelRight: true,
    orbX: 0,
    orbY: 0,
    orbSize: size,
    panelY: 0,
    panelWidth,
    panelHeight,
    windowWidth: panelWidth + panelGap + size,
    windowHeight: Math.max(panelHeight, size)
  };
}

function applyWidgetExpansion(event: Electron.IpcMainEvent) {
  if (!widget || widget.isDestroyed() || event.sender !== widget.webContents || !pendingExpandedBounds) return;
  expanded = true;
  orbHiddenWhilePinned = false;
  pendingCollapsedBounds = null;
  if (dragStart) {
    dragStart.windowX = pendingExpandedBounds.x;
    dragStart.windowY = pendingExpandedBounds.y;
  }
  widget.setBounds(pendingExpandedBounds, true);
  pendingExpandedBounds = null;
  sendWidgetData();
}

function applyWidgetCollapse(event: Electron.IpcMainEvent) {
  if (!widget || widget.isDestroyed() || event.sender !== widget.webContents) return;
  if (expanded && pendingCollapsedBounds) {
    widget.setBounds(pendingCollapsedBounds, true);
    expanded = false;
    panelPinned = false;
    orbHiddenWhilePinned = false;
    transientInteractionActive = false;
    persistPosition();
  }
  pendingCollapsedBounds = null;
  pendingExpandedBounds = null;
  sendWidgetData();
}

function collapseWidgetOnBlur() {
  if (!widget || widget.isDestroyed() || !expanded || widget.isFocused()) return;
  if (panelPinned || transientInteractionActive) return;
  pendingCollapsedBounds = null;
  const circleX = widget.getBounds().x + expandedPlacement.orbX;
  const circleY = widget.getBounds().y + expandedPlacement.orbY;
  const size = widgetSize();
  const bounds = { ...clampBounds(circleX, circleY, size, size), width: size, height: size };
  widget.setBounds(bounds, true);
  expanded = false;
  orbHiddenWhilePinned = false;
  transientInteractionActive = false;
  persistPosition();
  sendWidgetData();
}

function repositionExpandedWidget() {
  if (!widget || widget.isDestroyed() || !expanded) return;
  const [x, y] = widget.getPosition();
  const circleX = x + expandedPlacement.orbX;
  const circleY = y + expandedPlacement.orbY;
  widget.setBounds(getExpandedBounds(circleX, circleY, widgetSize()), true);
  persistPosition();
  sendWidgetData();
}

function notifyTimerComplete(body = 'Your Orbit timer has finished.') {
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'Focus session complete',
    body,
    silent: !storedData.settings.timerSound
  }).show();
}

function syncTimerInterval() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  if (!storedData.timer.running) return;
  if (storedData.timer.mode === 'countdown' && !storedData.timer.endAt) return;
  if (storedData.timer.mode === 'stopwatch' && !storedData.timer.startedAt) return;

  timerInterval = setInterval(() => {
    const timer = currentTimer();
    if (timer.mode === 'stopwatch') {
      sendTimerData();
      return;
    }
    if (timer.remainingSeconds > 0) {
      sendTimerData();
      return;
    }
    storedData.timer = {
      ...storedData.timer,
      remainingSeconds: 0,
      endAt: null,
      running: false
    };
    persistData();
    syncTimerInterval();
    sendTimerData();
    notifyTimerComplete('Your Orbit countdown timer has finished.');
  }, 1000);
}

function validateRecurrence(raw: TaskRecurrence): TaskRecurrence {
  if (!raw || typeof raw !== 'object') throw new Error('Task recurrence is invalid.');
  if (raw.type === 'once') {
    if (!isValidDateKey(raw.date)) throw new Error('The task date is invalid.');
    return { type: 'once', date: raw.date };
  }
  if (raw.type === 'daily') {
    return { type: 'daily' };
  }
  if (raw.type === 'weekly' && Array.isArray(raw.days)) {
    const days = [...new Set(raw.days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))];
    if (!days.length) throw new Error('Select at least one weekday for a custom recurrence.');
    return { type: 'weekly', days };
  }
  throw new Error('Task recurrence is invalid.');
}

function registerIpc() {
  ipcMain.handle('orbit:get-data', () => {
    return { ...storedData, timer: currentTimer() };
  });
  ipcMain.handle('orbit:add-task', (_event, draft: TaskDraft) => {
    if (!draft || typeof draft !== 'object') throw new Error('Task details are invalid.');
    const title = typeof draft.title === 'string' ? draft.title.trim().slice(0, 100) : '';
    if (!title) throw new Error('A task title is required.');
    const listId = typeof draft.listId === 'string' ? draft.listId : 'daily';
    if (!storedData.lists.some(list => list.id === listId)) throw new Error('The selected list does not exist.');
    const hasStartTime = draft.startTime !== undefined;
    const hasEndTime = draft.endTime !== undefined;
    if (hasStartTime !== hasEndTime) throw new Error('Both a start time and end time are required.');
    let startTime: string | undefined;
    let endTime: string | undefined;
    if (hasStartTime && hasEndTime) {
      if (typeof draft.startTime !== 'string' || typeof draft.endTime !== 'string') {
        throw new Error('Task times are invalid.');
      }
      const startMinutes = isValidClockTime(draft.startTime);
      const endMinutes = isValidClockTime(draft.endTime);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        throw new Error('The end time must be later than a valid start time.');
      }
      startTime = draft.startTime;
      endTime = draft.endTime;
    }
    let time: string | undefined;
    if (draft.time !== undefined) {
      if (typeof draft.time !== 'string' || isValidClockTime(draft.time) === null) {
        throw new Error('Task time is invalid.');
      }
      time = draft.time;
    }
    let recurrence: TaskRecurrence;
    if (draft.recurrence) {
      recurrence = validateRecurrence(draft.recurrence);
    } else if (draft.daily === true) {
      recurrence = { type: 'daily' };
    } else {
      recurrence = { type: 'once', date: dateKey() };
    }
    const task: OrbitTask = {
      id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      listId,
      title,
      ...(time ? { time } : {}),
      ...(startTime && endTime ? { startTime, endTime } : {}),
      daily: recurrence.type === 'daily',
      date: recurrence.type === 'once' ? recurrence.date : '',
      recurrence,
      createdAt: new Date().toISOString()
    };
    storedData.tasks.push(task);
    updateDailyHistory(dateKey());
    persistData();
    broadcastDataChanged();
    return task;
  });
  ipcMain.handle('orbit:update-task', (_event, id: string, patch: TaskUpdatePatch) => {
    const task = storedData.tasks.find(item => item.id === id);
    if (!task) throw new Error('The selected task does not exist.');
    if (!patch || typeof patch !== 'object') throw new Error('Task update is invalid.');
    const title = typeof patch.title === 'string' ? patch.title.trim().slice(0, 100) : '';
    if (!title) throw new Error('A task title is required.');

    const hasStartTime = patch.startTime !== undefined && patch.startTime !== '';
    const hasEndTime = patch.endTime !== undefined && patch.endTime !== '';
    if (hasStartTime !== hasEndTime) throw new Error('Both a start time and end time are required.');

    let startTime: string | undefined;
    let endTime: string | undefined;
    if (hasStartTime && hasEndTime) {
      if (typeof patch.startTime !== 'string' || typeof patch.endTime !== 'string') {
        throw new Error('Task times are invalid.');
      }
      const startMinutes = isValidClockTime(patch.startTime);
      const endMinutes = isValidClockTime(patch.endTime);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        throw new Error('The end time must be later than a valid start time.');
      }
      startTime = patch.startTime;
      endTime = patch.endTime;
    }

    const recurrence = validateRecurrence(patch.recurrence);
    task.title = title;
    if (startTime && endTime) {
      task.startTime = startTime;
      task.endTime = endTime;
      delete task.time;
    } else {
      delete task.startTime;
      delete task.endTime;
      delete task.time;
    }
    task.recurrence = recurrence;
    task.daily = recurrence.type === 'daily';
    task.date = recurrence.type === 'once' ? recurrence.date : '';

    updateDailyHistory(dateKey());
    persistData();
    broadcastDataChanged();
    return task;
  });
  ipcMain.handle('orbit:toggle-task', (_event, id: string) => {
    if (!storedData.tasks.some(task => task.id === id)) return;
    const key = dateKey();
    storedData.completions[key] ??= {};
    storedData.completions[key][id] = !storedData.completions[key][id];
    updateDailyHistory(key);
    persistData();
    broadcastDataChanged();
  });
  ipcMain.handle('orbit:remove-task', (_event, id: string) => {
    const task = storedData.tasks.find(item => item.id === id);
    if (!task) return;
    for (const [key, history] of Object.entries(storedData.history)) {
      if (history.taskIds) {
        history.taskIds = history.taskIds.filter(taskId => taskId !== id);
        history.totalTasks = history.taskIds.length;
        history.completedTasks = history.taskIds.filter(taskId => storedData.completions[key]?.[taskId] === true).length;
      } else {
        const createdKey = typeof task.createdAt === 'string' ? task.createdAt.slice(0, 10) : '';
        const scheduled = isTaskScheduledForDate(task, key) &&
          (!createdKey || key >= createdKey);
        if (scheduled) {
          history.totalTasks = Math.max(0, history.totalTasks - 1);
          if (storedData.completions[key]?.[id] === true) {
            history.completedTasks = Math.max(0, history.completedTasks - 1);
          }
        }
      }
      history.percentage = history.totalTasks
        ? Math.round(history.completedTasks / history.totalTasks * 100)
        : 0;
    }
    storedData.tasks = storedData.tasks.filter(task => task.id !== id);
    updateDailyHistory(dateKey());
    persistData();
    broadcastDataChanged();
  });
  ipcMain.handle('orbit:add-list', (_event, name: string) => {
    const cleanName = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    if (!cleanName) throw new Error('A list name is required.');
    if (storedData.lists.some(list => list.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('A list with that name already exists.');
    }
    let id: string;
    do {
      id = `list-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
    } while (storedData.lists.some(list => list.id === id));
    const list = { id, name: cleanName };
    storedData.lists.push(list);
    persistData();
    broadcastDataChanged();
    return list;
  });
  ipcMain.handle('orbit:rename-list', (_event, id: string, name: string) => {
    if (typeof id !== 'string' || id === 'daily') {
      throw new Error('The default Daily list cannot be renamed.');
    }
    const cleanName = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    if (!cleanName) throw new Error('A list name is required.');
    const target = storedData.lists.find(list => list.id === id);
    if (!target) throw new Error('The selected list does not exist.');
    if (storedData.lists.some(list => list.id !== id && list.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('A list with that name already exists.');
    }
    target.name = cleanName;
    persistData();
    broadcastDataChanged();
    return target;
  });
  ipcMain.handle('orbit:remove-list', (_event, id: string) => {
    if (typeof id !== 'string' || id === 'daily') {
      throw new Error('The default Daily list cannot be deleted.');
    }
    if (!storedData.lists.some(list => list.id === id)) return;
    const removedTaskIds = new Set(
      storedData.tasks.filter(task => task.listId === id).map(task => task.id)
    );
    storedData.lists = storedData.lists.filter(list => list.id !== id);
    storedData.tasks = storedData.tasks.filter(task => task.listId !== id);
    for (const dayCompletions of Object.values(storedData.completions)) {
      for (const taskId of removedTaskIds) {
        delete dayCompletions[taskId];
      }
    }
    updateDailyHistory(dateKey());
    persistData();
    broadcastDataChanged();
  });
  ipcMain.handle('orbit:update-settings', (_event, patch: SettingsPatch) => {
    if (!patch || typeof patch !== 'object') throw new Error('Settings update is invalid.');
    const next = { ...storedData.settings, ...patch };
    if (patch.widgetSize) {
      if (!['small', 'medium', 'large'].includes(patch.widgetSize)) throw new Error('Widget size is invalid.');
      if (patch.customOrbSize === undefined) {
        next.customOrbSize = patch.widgetSize === 'small'
          ? MIN_ORB_SIZE
          : patch.widgetSize === 'large'
            ? maxOrbSize()
            : MEDIUM_ORB_SIZE;
      }
    }
    if (patch.customOrbSize !== undefined) {
      next.customOrbSize = Math.max(MIN_ORB_SIZE, Math.min(maxOrbSize(), Math.round(patch.customOrbSize)));
      next.widgetSize = sizeLabelForPx(next.customOrbSize);
    }
    if (patch.widgetOpacity !== undefined) next.widgetOpacity = Math.max(35, Math.min(100, Math.round(patch.widgetOpacity)));
    if (patch.defaultTimerMinutes !== undefined) next.defaultTimerMinutes = Math.max(1, Math.min(120, Math.round(patch.defaultTimerMinutes)));
    if (patch.desktopOnly === true) next.alwaysOnTop = false;
    if (patch.alwaysOnTop === true) next.desktopOnly = false;
    if (patch.rememberPosition === true && widget && !widget.isDestroyed()) {
      const [windowX, windowY] = widget.getPosition();
      const widgetX = windowX + (expanded ? expandedPlacement.orbX : 0);
      const widgetY = windowY + (expanded ? expandedPlacement.orbY : 0);
      next.widgetX = widgetX;
      next.widgetY = widgetY;
    }
    storedData.settings = next;
    if (patch.defaultTimerMinutes !== undefined && !storedData.timer.running && storedData.timer.mode === 'countdown') {
      const durationSeconds = next.defaultTimerMinutes * 60;
      storedData.timer = {
        mode: 'countdown',
        durationSeconds,
        remainingSeconds: durationSeconds,
        elapsedSeconds: 0,
        endAt: null,
        startedAt: null,
        running: false
      };
    }
    if (patch.startWithWindows !== undefined && app.isPackaged && process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: next.startWithWindows, path: process.execPath });
    }
    persistData();
    applyWidgetSettings();
    broadcastDataChanged();
    return storedData.settings;
  });
  ipcMain.handle('orbit:reset-position', () => {
    const position = clampBounds(100, 120, widgetSize(), widgetSize());
    storedData.settings = { ...storedData.settings, widgetX: position.x, widgetY: position.y };
    if (widget && !widget.isDestroyed()) {
      expanded = false;
      panelPinned = false;
      orbHiddenWhilePinned = false;
      transientInteractionActive = false;
      pendingExpandedBounds = null;
      pendingCollapsedBounds = null;
      widget.setBounds({ ...position, width: widgetSize(), height: widgetSize() });
    }
    persistData();
    broadcastDataChanged();
    return true;
  });
  ipcMain.handle('orbit:reset-settings', () => {
    const position = clampBounds(100, 120, MEDIUM_ORB_SIZE, MEDIUM_ORB_SIZE);
    storedData.settings = { ...defaultSettings, widgetX: position.x, widgetY: position.y };
    storedData.timer = {
      mode: 'countdown',
      durationSeconds: 25 * 60,
      remainingSeconds: 25 * 60,
      elapsedSeconds: 0,
      endAt: null,
      startedAt: null,
      running: false
    };
    if (app.isPackaged && process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: false, path: process.execPath });
    expanded = false;
    panelPinned = false;
    orbHiddenWhilePinned = false;
    transientInteractionActive = false;
    pendingExpandedBounds = null;
    pendingCollapsedBounds = null;
    applyWidgetSettings();
    if (widget && !widget.isDestroyed()) widget.setBounds({ ...position, width: widgetSize(), height: widgetSize() });
    persistData();
    syncTimerInterval();
    broadcastDataChanged();
    return storedData.settings;
  });
  ipcMain.handle('orbit:timer-set-duration', (_event, minutes: number) => {
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) throw new Error('Timer duration must be between 1 and 120 minutes.');
    const durationSeconds = Math.round(minutes) * 60;
    storedData.timer = {
      mode: 'countdown',
      durationSeconds,
      remainingSeconds: durationSeconds,
      elapsedSeconds: 0,
      endAt: null,
      startedAt: null,
      running: false
    };
    persistData();
    syncTimerInterval();
    sendTimerData();
  });
  ipcMain.handle('orbit:timer-configure', (_event, config: { mode: 'countdown' | 'stopwatch'; durationSeconds: number }) => {
    const mode = config?.mode === 'stopwatch' ? 'stopwatch' : 'countdown';
    const rawDuration = Number.isFinite(config?.durationSeconds) ? Math.round(config.durationSeconds) : 0;
    if (mode === 'countdown' && (rawDuration < 1 || rawDuration > 86399)) {
      throw new Error('Set at least 1 second for the countdown timer.');
    }
    const durationSeconds = Math.max(0, Math.min(86399, rawDuration));
    storedData.timer = {
      mode,
      durationSeconds,
      remainingSeconds: mode === 'countdown' ? durationSeconds : 0,
      elapsedSeconds: 0,
      endAt: null,
      startedAt: null,
      running: false
    };
    persistData();
    syncTimerInterval();
    sendTimerData();
  });
  ipcMain.handle('orbit:timer-start', () => {
    const active = currentTimer();
    if (active.mode === 'stopwatch') {
      storedData.timer = {
        ...active,
        endAt: null,
        startedAt: Date.now() - active.elapsedSeconds * 1000,
        running: true
      };
    } else {
      const remaining = active.remainingSeconds <= 0 ? Math.max(1, active.durationSeconds) : active.remainingSeconds;
      storedData.timer = {
        ...active,
        remainingSeconds: remaining,
        startedAt: null,
        endAt: Date.now() + remaining * 1000,
        running: true
      };
    }
    persistData();
    syncTimerInterval();
    sendTimerData();
  });
  ipcMain.handle('orbit:timer-pause', () => {
    storedData.timer = {
      ...currentTimer(),
      endAt: null,
      startedAt: null,
      running: false
    };
    persistData();
    syncTimerInterval();
    sendTimerData();
  });
  ipcMain.handle('orbit:timer-reset', () => {
    storedData.timer = {
      ...storedData.timer,
      remainingSeconds: storedData.timer.mode === 'countdown' ? storedData.timer.durationSeconds : 0,
      elapsedSeconds: 0,
      endAt: null,
      startedAt: null,
      running: false
    };
    persistData();
    syncTimerInterval();
    sendTimerData();
  });
  ipcMain.handle('orbit:expand-widget', (event, value: boolean) => {
    if (!widget || event.sender !== widget.webContents) throw new Error('Only the widget can change its expanded state.');
    return value ? prepareWidgetExpansion() : prepareWidgetCollapse();
  });
  ipcMain.handle('orbit:set-panel-pinned', (event, pinned: boolean) => {
    if (!widget || event.sender !== widget.webContents) throw new Error('Only the widget can pin the panel.');
    panelPinned = pinned === true;
    if (!panelPinned) orbHiddenWhilePinned = false;
    sendWidgetData();
    return panelPinned;
  });
  ipcMain.on('orbit:apply-widget-expansion', event => applyWidgetExpansion(event));
  ipcMain.on('orbit:apply-widget-collapse', event => applyWidgetCollapse(event));
  ipcMain.on('orbit:open-dashboard', () => {
    createDashboard();
  });
  ipcMain.on('orbit:begin-widget-drag', (event, point: { x: number; y: number }) => {
    if (!widget || event.sender !== widget.webContents || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
    const [windowX, windowY] = widget.getPosition();
    dragStart = { cursorX: Math.round(point.x), cursorY: Math.round(point.y), windowX, windowY };
  });
  ipcMain.on('orbit:move-widget-drag', (event, point: { x: number; y: number }) => {
    if (!widget || event.sender !== widget.webContents || !dragStart || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
    const [width, height] = widget.getSize();
    const cursorX = Math.round(point.x);
    const cursorY = Math.round(point.y);
    const proposedX = dragStart.windowX + cursorX - dragStart.cursorX;
    const proposedY = dragStart.windowY + cursorY - dragStart.cursorY;
    const display = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY });
    const { workArea } = display;
    const x = Math.round(Math.max(workArea.x, Math.min(proposedX, workArea.x + workArea.width - width)));
    const y = Math.round(Math.max(workArea.y, Math.min(proposedY, workArea.y + workArea.height - height)));
    widget.setPosition(x, y, false);
  });
  ipcMain.on('orbit:end-widget-drag', (event) => {
    if (widget && event.sender === widget.webContents) {
      dragStart = null;
      if (expanded) repositionExpandedWidget();
      persistPosition();
    }
  });
  ipcMain.on('orbit:set-widget-transient-interaction', (event, active: boolean) => {
    if (!widget || event.sender !== widget.webContents) return;
    transientInteractionActive = active === true;
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
app.on('second-instance', () => {
  if (widget && !widget.isDestroyed()) {
    if (widget.isMinimized()) widget.restore();
    widget.show();
    applyWidgetSettings();
  }
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  try {
    loadData();
    if (!storedData.history[dateKey()]) {
      updateDailyHistory(dateKey());
      persistData();
    }
    registerIpc();
    createWidget();
    if (storedData.settings.startWithWindows && app.isPackaged && process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
    }
    if (storedData.timer.running) {
      if (storedData.timer.mode === 'countdown' && storedData.timer.endAt) {
        if (currentTimer().remainingSeconds === 0) {
          storedData.timer = { ...storedData.timer, remainingSeconds: 0, endAt: null, running: false };
          persistData();
          timerFinishedOnStartup = true;
        } else {
          syncTimerInterval();
        }
      } else if (storedData.timer.mode === 'stopwatch' && storedData.timer.startedAt) {
        syncTimerInterval();
      }
    }
    sendWidgetData();

    // Global Shortcuts
    globalShortcut.register('Control+Alt+Space', () => {
      if (!widget || widget.isDestroyed()) return;
      // When dialogue box is pinned, keep dialogue box visible and only toggle the circle!
      if (expanded && panelPinned) {
        if (!widget.isVisible()) {
          widget.show();
          orbHiddenWhilePinned = false;
        } else {
          orbHiddenWhilePinned = !orbHiddenWhilePinned;
        }
        sendWidgetData();
        return;
      }
      if (widget.isVisible()) widget.hide();
      else {
        orbHiddenWhilePinned = false;
        widget.show();
        applyWidgetSettings();
        sendWidgetData();
      }
    });
    globalShortcut.register('Control+Shift+Z', () => {
      stepWidgetSize(1);
    });
    globalShortcut.register('Control+Shift+X', () => {
      stepWidgetSize(-1);
    });
    globalShortcut.register('Control+Shift+Space', () => {
      toggleDesktopOverlayMode();
    });

    app.on('activate', createDashboard);
    app.on('window-all-closed', () => {});
    screen.on('display-metrics-changed', () => applyWidgetSettings());
    screen.on('display-removed', () => applyWidgetSettings());
    if (timerFinishedOnStartup) notifyTimerComplete();
  } catch (error) {
    console.error('Orbit failed to initialize. Existing local data was not intentionally removed.', error);
    app.quit();
  }
});

app.on('will-quit', () => {
  try {
    if (storedData) persistData();
  } catch (error) {
    console.error('Unable to persist Orbit data during shutdown.', error);
  }
  if (timerInterval) clearInterval(timerInterval);
  globalShortcut.unregisterAll();
});