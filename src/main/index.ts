import { app, BrowserWindow, globalShortcut, ipcMain, Notification, screen } from 'electron';
import { join } from 'node:path';
import fs from 'node:fs';

type TaskDraft = { title: string; time?: string; daily: boolean; listId?: string };
type SettingsPatch = Partial<OrbitData['settings']>;

const defaultSettings: OrbitData['settings'] = {
  widgetX: 100,
  widgetY: 120,
  widgetSize: 'medium',
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
  timer: { durationSeconds: 25 * 60, remainingSeconds: 25 * 60, endAt: null, running: false }
};

let widget: BrowserWindow | null = null;
let dashboard: BrowserWindow | null = null;
let expanded = false;
let expandedPlacement: WidgetData['placement'] = {
  panelRight: true,
  orbX: 0,
  orbY: 0,
  panelWidth: 390,
  panelHeight: 560,
  windowWidth: 484,
  windowHeight: 560
};
let pendingExpandedBounds: Electron.Rectangle | null = null;
let pendingCollapsedBounds: Electron.Rectangle | null = null;
let storedData: OrbitData;
let dragStart: { cursorX: number; cursorY: number; windowX: number; windowY: number } | null = null;
let timerInterval: NodeJS.Timeout | null = null;
let timerFinishedOnStartup = false;

const filePath = () => join(app.getPath('userData'), 'orbit-data.json');
const backupPath = () => `${filePath()}.bak`;
const temporaryPath = () => `${filePath()}.tmp`;
const panelWidth = 390;
const panelHeight = 560;
const panelGap = 10;
const widgetSize = (data = storedData) => data.settings.widgetSize === 'small' ? 74 : data.settings.widgetSize === 'large' ? 96 : 84;
const debugLog = (...values: unknown[]) => {
  if (!app.isPackaged) console.info('[Orbit]', ...values);
};
const dateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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
  const settings = {
    ...defaultSettings,
    ...rawSettings,
    widgetX: Number.isFinite(rawSettings.widgetX) ? rawSettings.widgetX! : defaultSettings.widgetX,
    widgetY: Number.isFinite(rawSettings.widgetY) ? rawSettings.widgetY! : defaultSettings.widgetY,
    widgetSize: ['small', 'medium', 'large'].includes(rawSettings.widgetSize ?? '')
      ? rawSettings.widgetSize!
      : defaultSettings.widgetSize,
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
  const durationSeconds = Number.isFinite(input.timer?.durationSeconds)
    ? Math.max(60, Math.min(7200, input.timer!.durationSeconds))
    : settings.defaultTimerMinutes * 60;
  const timer = input.timer
    ? {
        durationSeconds,
        remainingSeconds: Number.isFinite(input.timer.remainingSeconds)
          ? Math.max(0, Math.min(durationSeconds, input.timer.remainingSeconds))
          : durationSeconds,
        endAt: typeof input.timer.endAt === 'number' ? input.timer.endAt : null,
        running: input.timer.running === true
      }
    : { durationSeconds, remainingSeconds: durationSeconds, endAt: null, running: false };

  const tasks = input.tasks ?? [];
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
    const dayTasks = tasks.filter(task => task.daily || task.date === key || (!task.daily && !task.date));
    const completedTasks = Object.values(day ?? {}).filter(Boolean).length;
    const totalTasks = Math.max(dayTasks.length, completedTasks);
    history[key] = {
      totalTasks,
      completedTasks,
      percentage: totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0
    };
  }
  return {
    lists: input.lists ?? structuredClone(initialData.lists),
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
  const tasks = data.tasks.filter(task => task.daily || task.date === dateKey() || (!task.daily && !task.date));
  return [...new Map(tasks.map(task => [task.id, task])).values()];
}

function updateDailyHistory(key: string) {
  const tasks = storedData.tasks.filter(task =>
    task.daily || task.date === key || (!task.daily && !task.date)
  );
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
    placement: expandedPlacement
  };
}

function currentTimer(): OrbitData['timer'] {
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
    const rendererState = await target.webContents.executeJavaScript(`({
      url: location.href,
      readyState: document.readyState,
      rootFound: !!document.getElementById('root'),
      rootChildren: Array.from(document.getElementById('root')?.children ?? []).map(element => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          textLength: element.textContent?.length ?? 0,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          width: bounds.width,
          height: bounds.height
        };
      }),
      stylesheetCount: document.styleSheets.length,
      orbitBridgeAvailable: typeof window.orbit !== 'undefined',
      viewport: { width: innerWidth, height: innerHeight }
    })`);
    debugLog(`${hash} renderer DOM state`, rendererState);
  }).catch(error => console.error(`Unable to load or inspect the Orbit ${hash} window.`, error));
}

function logWindowDiagnostics(name: string, window: BrowserWindow, transparent: boolean) {
  if (app.isPackaged) return;
  const [width, height] = window.getSize();
  debugLog(`${name} created`, {
    bounds: window.getBounds(),
    size: { width, height },
    visible: window.isVisible(),
    minimized: window.isMinimized(),
    transparent
  });
  window.on('ready-to-show', () => {
    debugLog(`${name} ready-to-show`, { visible: window.isVisible(), bounds: window.getBounds() });
    if (!window.isVisible()) window.show();
  });
  window.on('show', () => debugLog(`${name} shown`));
  window.on('hide', () => debugLog(`${name} hidden`));
  window.on('minimize', () => debugLog(`${name} minimized`));
  window.on('restore', () => debugLog(`${name} restored`));
  window.on('focus', () => debugLog(`${name} focused`));
  window.on('closed', () => debugLog(`${name} closed`));
  window.webContents.on('did-finish-load', () => debugLog(`${name} renderer finished loading`, window.webContents.getURL()));
  window.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    console.error(`[Orbit] ${name} renderer failed to load`, { code, description, validatedURL, isMainFrame });
  });
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[Orbit] ${name} preload failed`, { preloadPath, error });
  });
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[Orbit] ${name} renderer console`, { level, message, line, sourceId });
    else if (level === 1) console.warn(`[Orbit] ${name} renderer console`, { message, line, sourceId });
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[Orbit] ${name} renderer process exited`, details);
  });
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
  const windowHeight = actualPanelHeight;
  const orbX = panelRight ? 0 : actualPanelWidth + panelGap;
  const desiredX = panelRight ? circleX : circleX - windowWidth + size;
  const desiredY = circleY - Math.round((windowHeight - size) / 2);
  const bounds = {
    x: desiredX,
    y: Math.max(workArea.y, Math.min(desiredY, workArea.y + workArea.height - windowHeight))
  };
  expandedPlacement = {
    panelRight,
    orbX,
    orbY: circleY - bounds.y,
    panelWidth: actualPanelWidth,
    panelHeight: actualPanelHeight,
    windowWidth,
    windowHeight
  };
  return { ...bounds, width: windowWidth, height: windowHeight };
}

function applyWidgetSettings() {
  if (!widget || widget.isDestroyed()) return;
  widget.setAlwaysOnTop(storedData.settings.alwaysOnTop && !storedData.settings.desktopOnly);
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
  logWindowDiagnostics('Widget', widget, true);
  loadRenderer(widget, 'widget');
  widget.on('blur', () => {
    setTimeout(collapseWidgetOnBlur, 80);
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
    debugLog('Reused existing dashboard window', { bounds: dashboard.getBounds() });
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
    backgroundColor: '#0b1119',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  logWindowDiagnostics('Dashboard', dashboard, false);
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
  if (!widget || widget.isDestroyed() || !expanded) {
    expandedPlacement = {
      panelRight: true,
      orbX: 0,
      orbY: 0,
      panelWidth,
      panelHeight,
      windowWidth: panelWidth + panelGap + widgetSize(),
      windowHeight: panelHeight
    };
    return expandedPlacement;
  }
  const [windowX, windowY] = widget.getPosition();
  const size = widgetSize();
  const x = windowX + expandedPlacement.orbX;
  const y = windowY + expandedPlacement.orbY;
  pendingCollapsedBounds = { ...clampBounds(x, y, size, size), width: size, height: size };
  return {
    panelRight: true,
    orbX: 0,
    orbY: 0,
    panelWidth,
    panelHeight,
    windowWidth: panelWidth + panelGap + size,
    windowHeight: panelHeight
  };
}

function applyWidgetExpansion(event: Electron.IpcMainEvent) {
  if (!widget || widget.isDestroyed() || event.sender !== widget.webContents || !pendingExpandedBounds) return;
  expanded = true;
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
    persistPosition();
  }
  pendingCollapsedBounds = null;
  pendingExpandedBounds = null;
  sendWidgetData();
}

function collapseWidgetOnBlur() {
  if (!widget || widget.isDestroyed() || !expanded || widget.isFocused()) return;
  pendingCollapsedBounds = null;
  const circleX = widget.getBounds().x + expandedPlacement.orbX;
  const circleY = widget.getBounds().y + expandedPlacement.orbY;
  const size = widgetSize();
  const bounds = { ...clampBounds(circleX, circleY, size, size), width: size, height: size };
  widget.setBounds(bounds, true);
  expanded = false;
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

function notifyTimerComplete() {
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'Focus session complete',
    body: 'Your Orbit timer has finished.',
    silent: !storedData.settings.timerSound
  }).show();
}

function syncTimerInterval() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  if (!storedData.timer.running || !storedData.timer.endAt) return;
  timerInterval = setInterval(() => {
    const timer = currentTimer();
    if (timer.remainingSeconds > 0) {
      sendTimerData();
      return;
    }
    storedData.timer = { ...storedData.timer, remainingSeconds: 0, endAt: null, running: false };
    persistData();
    syncTimerInterval();
    sendTimerData();
    notifyTimerComplete();
  }, 1000);
}

function registerIpc() {
  ipcMain.handle('orbit:get-data', event => {
    debugLog('Received orbit:get-data', event.sender.getURL());
    return { ...storedData, timer: currentTimer() };
  });
  ipcMain.handle('orbit:add-task', (_event, draft: TaskDraft) => {
    const title = typeof draft.title === 'string' ? draft.title.trim().slice(0, 100) : '';
    if (!title) throw new Error('A task title is required.');
    const task: OrbitTask = {
      id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      listId: typeof draft.listId === 'string' && storedData.lists.some(list => list.id === draft.listId) ? draft.listId : 'daily',
      title,
      time: typeof draft.time === 'string' && /^\d{2}:\d{2}$/.test(draft.time) ? draft.time : undefined,
      daily: draft.daily === true,
      date: draft.daily ? '' : dateKey(),
      createdAt: new Date().toISOString()
    };
    storedData.tasks.push(task);
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
        const scheduled = task.daily
          ? key >= createdKey
          : task.date ? task.date === key : key >= createdKey;
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
    const list = { id: `list-${Date.now()}`, name: cleanName };
    storedData.lists.push(list);
    persistData();
    broadcastDataChanged();
    return list;
  });
  ipcMain.handle('orbit:update-settings', (_event, patch: SettingsPatch) => {
    if (!patch || typeof patch !== 'object') throw new Error('Settings update is invalid.');
    const next = { ...storedData.settings, ...patch };
    if (patch.widgetSize && !['small', 'medium', 'large'].includes(patch.widgetSize)) throw new Error('Widget size is invalid.');
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
    if (patch.defaultTimerMinutes !== undefined && !storedData.timer.running) {
      const durationSeconds = next.defaultTimerMinutes * 60;
      storedData.timer = { durationSeconds, remainingSeconds: durationSeconds, endAt: null, running: false };
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
      pendingExpandedBounds = null;
      pendingCollapsedBounds = null;
      widget.setBounds({ ...position, width: widgetSize(), height: widgetSize() });
    }
    persistData();
    broadcastDataChanged();
    return true;
  });
  ipcMain.handle('orbit:reset-settings', () => {
    const position = clampBounds(100, 120, 84, 84);
    storedData.settings = { ...defaultSettings, widgetX: position.x, widgetY: position.y };
    storedData.timer = { durationSeconds: 25 * 60, remainingSeconds: 25 * 60, endAt: null, running: false };
    if (app.isPackaged && process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: false, path: process.execPath });
    expanded = false;
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
    storedData.timer = { durationSeconds, remainingSeconds: durationSeconds, endAt: null, running: false };
    persistData();
    syncTimerInterval();
    sendTimerData();
  });
  ipcMain.handle('orbit:timer-start', () => {
    if (storedData.timer.remainingSeconds <= 0) {
      storedData.timer.remainingSeconds = storedData.timer.durationSeconds;
    }
    storedData.timer = {
      ...storedData.timer,
      endAt: Date.now() + storedData.timer.remainingSeconds * 1000,
      running: true
    };
    persistData();
    syncTimerInterval();
    sendTimerData();
  });
  ipcMain.handle('orbit:timer-pause', () => {
    storedData.timer = { ...currentTimer(), endAt: null, running: false };
    persistData();
    syncTimerInterval();
    sendTimerData();
  });
  ipcMain.handle('orbit:timer-reset', () => {
    storedData.timer = {
      durationSeconds: storedData.timer.durationSeconds,
      remainingSeconds: storedData.timer.durationSeconds,
      endAt: null,
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
  ipcMain.on('orbit:apply-widget-expansion', event => applyWidgetExpansion(event));
  ipcMain.on('orbit:apply-widget-collapse', event => applyWidgetCollapse(event));
  ipcMain.on('orbit:open-dashboard', () => {
    debugLog('Received orbit:open-dashboard');
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
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
app.on('second-instance', () => {
  if (widget && !widget.isDestroyed()) {
    if (widget.isMinimized()) widget.restore();
    widget.show();
    applyWidgetSettings();
    debugLog('Second instance requested widget visibility');
  }
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  debugLog('Application ready', {
    packaged: app.isPackaged,
    rendererUrl: process.env.ELECTRON_RENDERER_URL ?? null,
    userDataPath: app.getPath('userData')
  });
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
    if (storedData.timer.running && storedData.timer.endAt) {
      if (currentTimer().remainingSeconds === 0) {
        storedData.timer = { ...storedData.timer, remainingSeconds: 0, endAt: null, running: false };
        persistData();
        timerFinishedOnStartup = true;
      } else {
        syncTimerInterval();
      }
    }
    sendWidgetData();
    globalShortcut.register('Control+Alt+Space', () => {
      if (!widget || widget.isDestroyed()) return;
      if (widget.isVisible()) widget.hide();
      else { widget.show(); applyWidgetSettings(); }
    });
    debugLog('Registered Ctrl+Alt+Space widget visibility shortcut');
    app.on('activate', createDashboard);
    app.on('window-all-closed', () => debugLog('All windows closed; keeping widget process and timer alive'));
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
