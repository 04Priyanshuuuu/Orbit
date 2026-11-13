import { contextBridge, ipcRenderer } from 'electron';

const orbit = {
  getData: (): Promise<OrbitData> => ipcRenderer.invoke('orbit:get-data'),
  addTask: (draft: OrbitTaskDraft): Promise<OrbitTask> => ipcRenderer.invoke('orbit:add-task', draft),
  toggleTask: (id: string): Promise<void> => ipcRenderer.invoke('orbit:toggle-task', id),
  removeTask: (id: string): Promise<void> => ipcRenderer.invoke('orbit:remove-task', id),
  addList: (name: string): Promise<OrbitList> => ipcRenderer.invoke('orbit:add-list', name),
  updateSettings: (patch: Partial<OrbitSettings>): Promise<OrbitSettings> =>
    ipcRenderer.invoke('orbit:update-settings', patch),
  resetPosition: (): Promise<boolean> => ipcRenderer.invoke('orbit:reset-position'),
  resetSettings: (): Promise<OrbitSettings> => ipcRenderer.invoke('orbit:reset-settings'),
  setTimerDuration: (minutes: number): Promise<void> => ipcRenderer.invoke('orbit:timer-set-duration', minutes),
  startTimer: (): Promise<void> => ipcRenderer.invoke('orbit:timer-start'),
  pauseTimer: (): Promise<void> => ipcRenderer.invoke('orbit:timer-pause'),
  resetTimer: (): Promise<void> => ipcRenderer.invoke('orbit:timer-reset'),
  expandWidget: (value: boolean): Promise<WidgetData['placement']> =>
    ipcRenderer.invoke('orbit:expand-widget', value),
  applyWidgetExpansion: (): void => ipcRenderer.send('orbit:apply-widget-expansion'),
  applyWidgetCollapse: (): void => ipcRenderer.send('orbit:apply-widget-collapse'),
  openDashboard: (): void => ipcRenderer.send('orbit:open-dashboard'),
  beginWidgetDrag: (point: { x: number; y: number }): void => ipcRenderer.send('orbit:begin-widget-drag', point),
  moveWidgetDrag: (point: { x: number; y: number }): void => ipcRenderer.send('orbit:move-widget-drag', point),
  endWidgetDrag: (): void => ipcRenderer.send('orbit:end-widget-drag'),
  onWidgetData: (callback: (data: WidgetData) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WidgetData) => callback(data);
    ipcRenderer.on('orbit:widget-data', listener);
    return () => ipcRenderer.removeListener('orbit:widget-data', listener);
  },
  onTimerData: (callback: (timer: OrbitTimer) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, timer: OrbitTimer) => callback(timer);
    ipcRenderer.on('orbit:timer-data', listener);
    return () => ipcRenderer.removeListener('orbit:timer-data', listener);
  },
  onDataChanged: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('orbit:data-changed', listener);
    return () => ipcRenderer.removeListener('orbit:data-changed', listener);
  }
};

contextBridge.exposeInMainWorld('orbit', orbit);
