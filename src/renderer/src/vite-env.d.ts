/// <reference types="vite/client" />

declare global {
  type OrbitList = { id: string; name: string };
  type OrbitTask = {
    id: string;
    listId: string;
    title: string;
    time?: string;
    daily: boolean;
    date?: string;
    createdAt: string;
  };
  type OrbitTaskDraft = { title: string; time?: string; daily: boolean; listId?: string };
  type OrbitSettings = {
    widgetX: number;
    widgetY: number;
    widgetSize: 'small' | 'medium' | 'large';
    widgetOpacity: number;
    showProgressRing: boolean;
    alwaysOnTop: boolean;
    desktopOnly: boolean;
    rememberPosition: boolean;
    startWithWindows: boolean;
    defaultTimerMinutes: number;
    timerSound: boolean;
  };
  type OrbitTimer = { durationSeconds: number; remainingSeconds: number; endAt: number | null; running: boolean };
  type OrbitDailyHistory = {
    totalTasks: number;
    completedTasks: number;
    percentage: number;
    taskIds?: string[];
  };
  type OrbitData = {
    lists: OrbitList[];
    tasks: OrbitTask[];
    completions: Record<string, Record<string, boolean>>;
    history: Record<string, OrbitDailyHistory>;
    settings: OrbitSettings;
    timer: OrbitTimer;
  };
  type WidgetData = OrbitData & {
    percent: number;
    expanded: boolean;
    placement: {
      panelRight: boolean;
      orbX: number;
      orbY: number;
      panelWidth: number;
      panelHeight: number;
      windowWidth: number;
      windowHeight: number;
    };
  };

  interface Window {
    orbit: {
      getData: () => Promise<OrbitData>;
      addTask: (draft: OrbitTaskDraft) => Promise<OrbitTask>;
      toggleTask: (id: string) => Promise<void>;
      removeTask: (id: string) => Promise<void>;
      addList: (name: string) => Promise<OrbitList>;
      updateSettings: (patch: Partial<OrbitSettings>) => Promise<OrbitSettings>;
      resetPosition: () => Promise<boolean>;
      resetSettings: () => Promise<OrbitSettings>;
      setTimerDuration: (minutes: number) => Promise<void>;
      startTimer: () => Promise<void>;
      pauseTimer: () => Promise<void>;
      resetTimer: () => Promise<void>;
      expandWidget: (value: boolean) => Promise<WidgetData['placement']>;
      applyWidgetExpansion: () => void;
      applyWidgetCollapse: () => void;
      openDashboard: () => void;
      beginWidgetDrag: (point: { x: number; y: number }) => void;
      moveWidgetDrag: (point: { x: number; y: number }) => void;
      endWidgetDrag: () => void;
      onWidgetData: (callback: (data: WidgetData) => void) => () => void;
      onTimerData: (callback: (timer: OrbitTimer) => void) => () => void;
      onDataChanged: (callback: () => void) => () => void;
    };
  }
}

export {};
