import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, LayoutList, Plus, Settings2, Target, Trash2 } from 'lucide-react';
import { calculateListDayProgress, calculateProductivityAnalytics } from '../analytics';
import { formatRecurrence, formatTaskTime, formatTimeRange, isTaskScheduledForDate, isValidTimeRange, parseTaskInput } from '../taskInput';;

type Tab = 'today' | 'lists' | 'focus' | 'analytics' | 'settings';
const dateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function Dashboard() {
  const [data, setData] = useState<OrbitData | null>(null);
  const [timer, setTimer] = useState<OrbitTimer | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [listId, setListId] = useState('daily');
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>({ type: 'once', date: dateKey() });
  const [error, setError] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');

  const refresh = () => window.orbit.getData().then(next => {
    setData(next);
    setTimer(next.timer);
    if (!next.lists.some(list => list.id === listId)) {
      setListId('daily');
    }
  }).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load Orbit data.'));

  useEffect(() => {
    void refresh();
    const unsubscribeData = window.orbit.onDataChanged(() => { void refresh(); });
    const unsubscribeTimer = window.orbit.onTimerData(setTimer);
    return () => {
      unsubscribeData();
      unsubscribeTimer();
    };
  }, []);

  const now = new Date();
  const today = dateKey();
  const tasksToday = useMemo(
    () => data?.tasks.filter(task =>
      task.listId === 'daily' && isTaskScheduledForDate(task, today)
    ) ?? [],
    [data, today]
  );
  const done = (id: string) => !!data?.completions[today]?.[id];

  async function addTask(event: FormEvent) {
    event.preventDefault();
    if (!data || !title.trim()) return;
    const parsed = parseTaskInput(title);
    if (!parsed.title) return;
    if ((startTime && !endTime) || (!startTime && endTime)) {
      setError('Both a start time and end time are required.');
      return;
    }
    if (recurrence.type === 'weekly' && !recurrence.days.length) {
      setError('Select at least one weekday for a custom recurrence.');
      return;
    }
    setError('');
    try {
      const normalizedRecurrence: TaskRecurrence =
        recurrence.type === 'once'
          ? { type: 'once', date: dateKey() }
          : recurrence;
      await window.orbit.addTask({
        title: parsed.title,
        time: parsed.time || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        daily: normalizedRecurrence.type === 'daily',
        recurrence: normalizedRecurrence,
        listId: tab === 'today' ? 'daily' : listId
      });
      setTitle('');
      setStartTime('');
      setEndTime('');
      setRecurrence({ type: 'once', date: dateKey() });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add this task.');
    }
  }

  async function submitNewList(event: FormEvent) {
    event.preventDefault();
    const clean = newListName.trim();
    if (!clean) {
      setError('A list name is required.');
      return;
    }
    setError('');
    try {
      const list = await window.orbit.addList(clean);
      setListId(list.id);
      setNewListName('');
      setCreatingList(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create this list.');
    }
  }

  async function deleteSelectedList() {
    if (listId === 'daily') return;
    setError('');
    try {
      await window.orbit.removeList(listId);
      setListId('daily');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete this list.');
    }
  }

  async function updateSettings(patch: Partial<OrbitSettings>) {
    if (!data) return;
    setError('');
    try {
      const settings = await window.orbit.updateSettings(patch);
      setData(current => current ? { ...current, settings } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save settings.');
    }
  }

  async function runAction(action: Promise<unknown>) {
    setError('');
    try {
      await action;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to complete that action.');
    }
  }

  async function setTimerDuration(minutes: number) {
    setError('');
    try {
      await window.orbit.setTimerDuration(minutes);
      setCustomMinutes('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update the timer.');
    }
  }

  async function resetSettings() {
    if (!window.confirm('Reset widget and timer settings to their defaults? Your tasks and lists will be kept.')) return;
    try {
      const settings = await window.orbit.resetSettings();
      setData(current => current ? { ...current, settings } : current);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to reset settings.');
    }
  }

  if (!data) return <div className="loading">{error || 'Loading Orbit…'}</div>;

  const overallAnalytics = calculateProductivityAnalytics(data, now, null);
  const selectedListToday = calculateListDayProgress(data, now, listId);
  const overallTodayCompleted = overallAnalytics.daily.completed;
  const overallTodayTotal = overallAnalytics.daily.total;
  const overallTodayPercent = overallAnalytics.daily.percent;

  const listTasks = data.tasks.filter(task => task.listId === listId);
  const visibleTasks = tab === 'lists' ? listTasks : tasksToday;
  const monthPrefix = today.slice(0, 7);
  const monthDays = Array.from({ length: new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate() }, (_, i) => i + 1);
  const activeDays = monthDays.filter(day => {
    const key = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    const dayCompletions = data.completions[key] ?? {};
    return data.tasks.some(task => dayCompletions[task.id] === true);
  }).length;
  const monthDone = overallAnalytics.monthly.completed;
  const monthPercent = overallAnalytics.monthly.percent;

  const navigation = [
    { id: 'today' as const, label: 'Today', icon: CalendarDays },
    { id: 'lists' as const, label: 'My Lists', icon: LayoutList },
    { id: 'focus' as const, label: 'Focus timer', icon: Clock3 },
    { id: 'analytics' as const, label: 'Analytics', icon: Target },
    { id: 'settings' as const, label: 'Settings', icon: Settings2 }
  ];
  const titles: Record<Tab, string> = {
    today: 'Today',
    lists: 'My Lists',
    focus: 'Focus timer',
    analytics: 'Analytics',
    settings: 'Settings'
  };

  return <div className="dashboard">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon">O</div><div><b>ORBIT</b><small>OFFLINE PRODUCTIVITY</small></div></div>
      <nav>{navigation.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><item.icon size={17} />{item.label}</button>)}</nav>
      <div className="sidebar-foot">LOCAL MODE<br /><span>Your data stays on this device.</span><small>Ctrl + Alt + Space · Hide/show widget</small></div>
    </aside>
    <main className="main">
      <header className="page-header">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</div>
          <h1>{titles[tab]}</h1>
        </div>
        <span className="offline">● Offline</span>
      </header>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {tab === 'today' && <>
        <div className="summary-grid">
          <article className="surface"><label>OVERALL COMPLETION (ALL LISTS)</label><strong className="big-number">{overallTodayPercent}%</strong><p>{overallTodayCompleted} completed out of {overallTodayTotal} tasks across all lists</p><div className="progress-track"><i style={{ width: `${overallTodayPercent}%` }} /></div></article>
          <article className="surface"><label>REMAINING TASKS (ALL LISTS)</label><strong className="big-number">{Math.max(0, overallTodayTotal - overallTodayCompleted)}</strong><p>One step at a time. Keep going.</p></article>
        </div>
        <section className="section">
          <div className="section-title"><h2>Today's schedule (My Day)</h2><span>{tasksToday.length} tasks</span></div>
          <TaskForm {...{ title, setTitle, startTime, setStartTime, endTime, setEndTime, recurrence, setRecurrence, addTask }} />
          <TaskRows tasks={visibleTasks} done={done} toggle={id => { void runAction(window.orbit.toggleTask(id)); }} remove={id => { void runAction(window.orbit.removeTask(id)); }} />
        </section>
      </>}
      {tab === 'lists' && <section className="surface list-surface">
        <div className="section-title">
          <h2>Your lists · {selectedListToday.percent}% today ({selectedListToday.completed}/{selectedListToday.total})</h2>
          <div className="list-header-actions">
            {creatingList ? (
              <form className="dashboard-new-list-form" onSubmit={submitNewList}>
                <input
                  autoFocus
                  value={newListName}
                  onChange={event => setNewListName(event.target.value)}
                  placeholder="List name..."
                  maxLength={40}
                  onKeyDown={event => {
                    if (event.key === 'Escape') {
                      setCreatingList(false);
                      setNewListName('');
                    }
                  }}
                />
                <button type="submit" className="primary">Save</button>
                <button type="button" className="secondary" onClick={() => { setCreatingList(false); setNewListName(''); }}>Cancel</button>
              </form>
            ) : (
              <>
                <button className="secondary" onClick={() => { setError(''); setCreatingList(true); }}><Plus size={14} /> New list</button>
                {listId !== 'daily' && (
                  <button className="danger-button" onClick={() => { void deleteSelectedList(); }} title="Delete selected list">
                    <Trash2 size={14} /> Delete list
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="list-tabs">{data.lists.map(list => (
          <button
            className={list.id === listId ? 'selected' : ''}
            key={list.id}
            onClick={() => setListId(list.id)}
            onDoubleClick={() => {
              if (list.id === 'daily') return;
              const nextName = window.prompt('Rename list:', list.name);
              if (nextName && nextName.trim() && nextName.trim() !== list.name) {
                void runAction(window.orbit.renameList(list.id, nextName.trim()));
              }
            }}
            title={list.id === 'daily' ? list.name : `${list.name} (double-click to rename)`}
          >{list.name}</button>
        ))}</div>
        <TaskForm {...{ title, setTitle, startTime, setStartTime, endTime, setEndTime, recurrence, setRecurrence, addTask }} />
        <TaskRows tasks={visibleTasks} done={done} toggle={id => { void runAction(window.orbit.toggleTask(id)); }} remove={id => { void runAction(window.orbit.removeTask(id)); }} />
      </section>}
      {tab === 'focus' && timer && <section className="surface timer-card">
        <div className="eyebrow">FOCUS SESSION</div>
        <div className="timer">{formatTime(timer.remainingSeconds)}</div>
        <p>Give one task your full attention.</p>
        <div className="timer-progress dashboard-timer-progress"><i style={{ width: `${timer.durationSeconds ? (1 - timer.remainingSeconds / timer.durationSeconds) * 100 : 0}%` }} /></div>
        <div className="timer-presets">{[5, 15, 25, 45, 60].map(minutes => <button className={timer.durationSeconds === minutes * 60 ? 'selected' : ''} key={minutes} onClick={() => { void setTimerDuration(minutes); }}>{minutes} min</button>)}</div>
        <div className="custom-timer"><input type="number" min="1" max="120" value={customMinutes} onChange={event => setCustomMinutes(event.target.value)} placeholder="Custom minutes" /><button className="secondary" disabled={!customMinutes} onClick={() => { void setTimerDuration(Number(customMinutes)); }}>Set duration</button></div>
        <div className="timer-actions">
          <button className="primary" onClick={() => { void runAction(timer.running ? window.orbit.pauseTimer() : window.orbit.startTimer()); }}>{timer.running ? 'Pause' : timer.remainingSeconds < timer.durationSeconds ? 'Resume' : 'Start focus'}</button>
          <button className="secondary" onClick={() => { void runAction(window.orbit.resetTimer()); }}>Reset</button>
        </div>
      </section>}
      {tab === 'analytics' && <>
        <div className="summary-grid three">
          <article className="surface"><label>OVERALL MONTHLY COMPLETION (ALL LISTS)</label><strong className="big-number">{monthPercent}%</strong></article>
          <article className="surface"><label>RECORDED COMPLETIONS (ALL LISTS)</label><strong className="big-number">{monthDone}</strong></article>
          <article className="surface"><label>ACTIVE DAYS</label><strong className="big-number">{activeDays}</strong></article>
        </div>
        <section className="surface analytics">
          <h2>{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · Overall activity</h2>
          <div className="heatmap">{monthDays.map(day => {
            const key = `${monthPrefix}-${String(day).padStart(2, '0')}`;
            const dayCompletions = data.completions[key] ?? {};
            const count = data.tasks.filter(task => dayCompletions[task.id] === true).length;
            return <div key={day} title={`${key}: ${count} completed across all lists`} className={`heat ${count >= 4 ? 'high' : count ? 'low' : ''}`}>{day}</div>;
          })}</div>
          <p>Combined completion across My Day and all custom lists is stored locally.</p>
        </section>
      </>}
      {tab === 'settings' && <SettingsPage
        settings={data.settings}
        updateSettings={updateSettings}
        onResetPosition={() => { void runAction(window.orbit.resetPosition()); }}
        onResetSettings={() => { void resetSettings(); }}
        onLaunchDashboard={() => window.orbit.openDashboard()}
      />}
    </main>
  </div>;
}

function TaskForm(props: {
  title: string;
  setTitle: (value: string) => void;
  startTime: string;
  setStartTime: (value: string) => void;
  endTime: string;
  setEndTime: (value: string) => void;
  recurrence: TaskRecurrence;
  setRecurrence: (value: TaskRecurrence) => void;
  addTask: (event: FormEvent) => void;
}) {
  const timeOptions = Array.from({ length: 48 }, (_, index) => {
    const hours = Math.floor(index / 2);
    const minutes = index % 2 ? '30' : '00';
    const value = `${String(hours).padStart(2, '0')}:${minutes}`;
    const hour12 = hours % 12 || 12;
    return { value, label: `${hour12}:${minutes}${hours < 12 ? 'am' : 'pm'}` };
  });
  const recurrence = props.recurrence;
  const recurrenceMode = recurrence.type === 'once'
    ? 'once'
    : recurrence.type === 'daily'
      ? 'daily'
      : recurrence.days.length === 5 && [1, 2, 3, 4, 5].every(day => recurrence.days.includes(day))
        ? 'weekdays'
        : recurrence.days.length === 2 && [0, 6].every(day => recurrence.days.includes(day))
          ? 'weekends'
          : 'custom';
  const setMode = (mode: string) => {
    if (mode === 'once') props.setRecurrence({ type: 'once', date: dateKey() });
    if (mode === 'daily') props.setRecurrence({ type: 'daily' });
    if (mode === 'weekdays') props.setRecurrence({ type: 'weekly', days: [1, 2, 3, 4, 5] });
    if (mode === 'weekends') props.setRecurrence({ type: 'weekly', days: [0, 6] });
    if (mode === 'custom') props.setRecurrence({ type: 'weekly', days: recurrence.type === 'weekly' ? recurrence.days : [] });
  };
  return <form className="task-form" onSubmit={props.addTask}>
    <input value={props.title} onChange={event => props.setTitle(event.target.value)} placeholder="Add a task... Try 'Study DSA 7pm'" maxLength={100} required />
    <select value={props.startTime} onChange={event => props.setStartTime(event.target.value)} aria-label="Optional start time">
      <option value="">Start</option>{timeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <select value={props.endTime} onChange={event => props.setEndTime(event.target.value)} aria-label="Optional end time">
      <option value="">End</option>{timeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <select value={recurrenceMode} onChange={event => setMode(event.target.value)} aria-label="Task recurrence">
      <option value="once">Only today</option>
      <option value="daily">Daily</option>
      <option value="weekdays">Weekdays</option>
      <option value="weekends">Weekends</option>
      <option value="custom">Custom</option>
    </select>
    {recurrence.type === 'weekly' && <div className="dashboard-weekdays">
      {[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day}>
        <input type="checkbox" checked={recurrence.days.includes(day)} onChange={event => {
          const days = event.target.checked
            ? [...recurrence.days, day]
            : recurrence.days.filter((value: number) => value !== day);
          props.setRecurrence({ type: 'weekly', days });
        }} />
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}
      </label>)}
    </div>}
    <button className="primary"><Plus size={15} /> Add task</button>
  </form>;
}

function TaskRows({ tasks, done, toggle, remove }: {
  tasks: OrbitTask[];
  done: (id: string) => boolean;
  toggle: (id: string) => void;
  remove: (id: string) => void;
}) {
  if (!tasks.length) return <div className="empty">No tasks yet. Add your first task above.</div>;
  return <div className="task-rows">{tasks.map(task => <div className="task-row" key={task.id}>
    <input type="checkbox" checked={done(task.id)} aria-label={`Complete ${task.title}`} onChange={() => toggle(task.id)} />
    <span className={done(task.id) ? 'completed' : ''}>{task.title}</span>
    <small>{task.startTime && task.endTime
      ? formatTimeRange(task.startTime, task.endTime)
      : task.time ? formatTaskTime(task.time) : ''}{task.recurrence ? ` · ${formatRecurrence(task.recurrence)}` : ''}</small>
    <button title="Delete task" aria-label={`Delete ${task.title}`} onClick={() => remove(task.id)}>×</button>
  </div>)}</div>;
}

function SettingsPage({
  settings,
  updateSettings,
  onResetPosition,
  onResetSettings,
  onLaunchDashboard
}: {
  settings: OrbitSettings;
  updateSettings: (patch: Partial<OrbitSettings>) => Promise<void>;
  onResetPosition: () => void;
  onResetSettings: () => void;
  onLaunchDashboard: () => void;
}) {
  return <div className="settings-page">
    <section className="surface settings-group">
      <h2>Widget appearance</h2>
      <div className="setting-row"><div><strong>Widget size</strong><small>Medium is the default compact size.</small></div>
        <div className="size-options">{(['small', 'medium', 'large'] as const).map(size => <button className={settings.widgetSize === size ? 'selected' : ''} key={size} onClick={() => { void updateSettings({ widgetSize: size }); }}>{size}</button>)}</div>
      </div>
      <div className="setting-row"><div><strong>Glass opacity</strong><small>Adjust the widget surface transparency.</small></div>
        <label className="range-value"><input type="range" min="35" max="100" value={settings.widgetOpacity} onChange={event => { void updateSettings({ widgetOpacity: Number(event.target.value) }); }} />{settings.widgetOpacity}%</label>
      </div>
      <SettingToggle title="Show progress ring" description="Display task completion around the circle." checked={settings.showProgressRing} onChange={checked => { void updateSettings({ showProgressRing: checked }); }} />
    </section>
    <section className="surface settings-group">
      <h2>Widget behaviour</h2>
      <SettingToggle title="Always on top" description="Keep Orbit above other application windows." checked={settings.alwaysOnTop} onChange={checked => { void updateSettings({ alwaysOnTop: checked }); }} />
      <SettingToggle title="Desktop-only mode" description="Turn off pinning; Orbit behaves as a normal desktop utility window and can be covered by other apps." checked={settings.desktopOnly} onChange={checked => { void updateSettings({ desktopOnly: checked }); }} />
      <SettingToggle title="Remember widget position" description="Restore the last desktop position after restarting Orbit." checked={settings.rememberPosition} onChange={checked => { void updateSettings({ rememberPosition: checked }); }} />
      <SettingToggle title="Start widget automatically with Windows" description="Starts the floating widget after you sign in to Windows. The dashboard stays closed. Available in packaged builds." checked={settings.startWithWindows} onChange={checked => { void updateSettings({ startWithWindows: checked }); }} />
      <div className="setting-actions"><button className="secondary" onClick={onLaunchDashboard}>Launch dashboard</button><button className="secondary" onClick={onResetPosition}>Reset widget position</button></div>
    </section>
    <section className="surface settings-group">
      <h2>Timer</h2>
      <div className="setting-row"><div><strong>Default duration</strong><small>New and reset focus sessions use this duration.</small></div>
        <label className="default-duration"><input type="number" min="1" max="120" value={settings.defaultTimerMinutes} onChange={event => { const value = Number(event.target.value); if (value >= 1 && value <= 120) void updateSettings({ defaultTimerMinutes: value }); }} /> minutes</label>
      </div>
      <SettingToggle title="Sound notification" description="Play the system notification sound when a timer completes." checked={settings.timerSound} onChange={checked => { void updateSettings({ timerSound: checked }); }} />
    </section>
    <div className="settings-footer"><span>Resetting settings keeps your tasks, lists and completion history.</span><button className="danger-button" onClick={onResetSettings}>Reset settings to defaults</button></div>
  </div>;
}

function SettingToggle({ title, description, checked, onChange }: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="setting-row setting-toggle">
    <div><strong>{title}</strong><small>{description}</small></div>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
  </label>;
}