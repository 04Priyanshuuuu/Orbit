/// <reference types="vite/client" />

declare global {
  type OrbitList = { id: string; name: string };
  type TaskRecurrence =
    | { type: 'once'; date: string }
    | { type: 'daily' }
    | { type: 'weekly'; days: number[] };
  type OrbitTask = {
    id: string;
    listId: string;
    title: string;
    time?: string;
    startTime?: string;
    endTime?: string;
    daily: boolean;
    date?: string;
    createdAt: string;
    recurrence?: TaskRecurrence;
  };
  type OrbitTaskDraft = {
    title: string;
    time?: string;
    startTime?: string;
    endTime?: string;
    daily: boolean;
    listId?: string;
    recurrence?: TaskRecurrence;
  };
  type OrbitTaskPatch = {
    title: string;
    startTime?: string;
    endTime?: string;
    recurrence: TaskRecurrence;
  };
  type OrbitSettings = {
    widgetX: number;
    widgetY: number;
    widgetSize: 'small' | 'medium' | 'large';
    customOrbSize?: number;
    widgetOpacity: number;
    showProgressRing: boolean;
    alwaysOnTop: boolean;
    desktopOnly: boolean;
    rememberPosition: boolean;
    startWithWindows: boolean;
    defaultTimerMinutes: number;
    timerSound: boolean;
  };
  type OrbitTimer = {
    mode: 'countdown' | 'stopwatch';
    durationSeconds: number;
    remainingSeconds: number;
    elapsedSeconds: number;
    endAt: number | null;
    startedAt: number | null;
    running: boolean;
  };
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
    pinned?: boolean;
    orbHidden?: boolean;
    placement: {
      panelRight: boolean;
      orbX: number;
      orbY: number;
      orbSize?: number;
      panelY?: number;
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
      updateTask: (id: string, patch: OrbitTaskPatch) => Promise<OrbitTask>;
      toggleTask: (id: string) => Promise<void>;
      removeTask: (id: string) => Promise<void>;
      addList: (name: string) => Promise<OrbitList>;
      renameList: (id: string, name: string) => Promise<OrbitList>;
      removeList: (id: string) => Promise<void>;
      updateSettings: (patch: Partial<OrbitSettings>) => Promise<OrbitSettings>;
      resetPosition: () => Promise<boolean>;
      resetSettings: () => Promise<OrbitSettings>;
      setTimerDuration: (minutes: number) => Promise<void>;
      configureTimer: (config: { mode: 'countdown' | 'stopwatch'; durationSeconds: number }) => Promise<void>;
      startTimer: () => Promise<void>;
      pauseTimer: () => Promise<void>;
      resetTimer: () => Promise<void>;
      expandWidget: (value: boolean) => Promise<WidgetData['placement']>;
      setPanelPinned: (pinned: boolean) => Promise<boolean>;
      applyWidgetExpansion: () => void;
      applyWidgetCollapse: () => void;
      openDashboard: () => void;
      beginWidgetDrag: (point: { x: number; y: number }) => void;
      moveWidgetDrag: (point: { x: number; y: number }) => void;
      endWidgetDrag: () => void;
      setWidgetTransientInteraction: (active: boolean) => void;
      onWidgetData: (callback: (data: WidgetData) => void) => () => void;
      onTimerData: (callback: (timer: OrbitTimer) => void) => () => void;
      onDataChanged: (callback: () => void) => () => void;
    };
  }
}

export {};