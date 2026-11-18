import { contextBridge, ipcRenderer } from 'electron';

const orbitApi = {
  getData: () => ipcRenderer.invoke('orbit:get-data'),
  addTask: (draft: {
    title: string;
    time?: string;
    startTime?: string;
    endTime?: string;
    daily: boolean;
    listId?: string;
    recurrence?: TaskRecurrence;
  }) => ipcRenderer.invoke('orbit:add-task', draft),
  toggleTask: (id: string) => ipcRenderer.invoke('orbit:toggle-task', id),
  removeTask: (id: string) => ipcRenderer.invoke('orbit:remove-task', id),
  addList: (name: string) => ipcRenderer.invoke('orbit:add-list', name),
  renameList: (id: string, name: string) => ipcRenderer.invoke('orbit:rename-list', id, name),
  removeList: (id: string) => ipcRenderer.invoke('orbit:remove-list', id),
  updateSettings: (patch: Partial<OrbitSettings>) => ipcRenderer.invoke('orbit:update-settings', patch),
  resetPosition: () => ipcRenderer.invoke('orbit:reset-position'),
  resetSettings: () => ipcRenderer.invoke('orbit:reset-settings'),
  setTimerDuration: (minutes: number) => ipcRenderer.invoke('orbit:timer-set-duration', minutes),
  startTimer: () => ipcRenderer.invoke('orbit:timer-start'),
  pauseTimer: () => ipcRenderer.invoke('orbit:timer-pause'),
  resetTimer: () => ipcRenderer.invoke('orbit:timer-reset'),
  expandWidget: (expanded: boolean) => ipcRenderer.invoke('orbit:expand-widget', expanded),
  applyWidgetExpansion: () => ipcRenderer.send('orbit:apply-widget-expansion'),
  applyWidgetCollapse: () => ipcRenderer.send('orbit:apply-widget-collapse'),
  openDashboard: () => ipcRenderer.send('orbit:open-dashboard'),
  beginWidgetDrag: (point: { x: number; y: number }) => ipcRenderer.send('orbit:begin-widget-drag', point),
  moveWidgetDrag: (point: { x: number; y: number }) => ipcRenderer.send('orbit:move-widget-drag', point),
  endWidgetDrag: () => ipcRenderer.send('orbit:end-widget-drag'),
  setWidgetTransientInteraction: (active: boolean) => ipcRenderer.send('orbit:set-widget-transient-interaction', active),
  onWidgetData: (listener: (data: WidgetData) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: WidgetData) => listener(data);
    ipcRenderer.on('orbit:widget-data', wrapped);
    return () => ipcRenderer.removeListener('orbit:widget-data', wrapped);
  },
  onTimerData: (listener: (timer: OrbitTimer) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, timer: OrbitTimer) => listener(timer);
    ipcRenderer.on('orbit:timer-data', wrapped);
    return () => ipcRenderer.removeListener('orbit:timer-data', wrapped);
  },
  onDataChanged: (listener: () => void) => {
    const wrapped = () => listener();
    ipcRenderer.on('orbit:data-changed', wrapped);
    return () => ipcRenderer.removeListener('orbit:data-changed', wrapped);
  }
};

contextBridge.exposeInMainWorld('orbit', orbitApi);