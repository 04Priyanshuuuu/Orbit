import { FormEvent, PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Clock3, ExternalLink, Plus } from 'lucide-react';
import { calculateListDayProgress, calculateProductivityAnalytics } from '../analytics';
import { formatTaskTime, formatTimeRange, formatRecurrence, isTaskScheduledForDate, isValidTimeRange } from '../taskInput';
import { TimePicker } from './TimePicker';

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

type RecurrencePreset = 'once' | 'daily' | 'weekdays' | 'weekends' | 'custom';

function getRecurrencePreset(recurrence: TaskRecurrence, customMode: boolean): RecurrencePreset {
  if (customMode && recurrence.type === 'weekly') return 'custom';
  if (recurrence.type === 'once') return 'once';
  if (recurrence.type === 'daily') return 'daily';
  const isWeekdays = recurrence.days.length === 5 && [1, 2, 3, 4, 5].every(d => recurrence.days.includes(d));
  if (isWeekdays) return 'weekdays';
  const isWeekends = recurrence.days.length === 2 && [0, 6].every(d => recurrence.days.includes(d));
  if (isWeekends) return 'weekends';
  return 'custom';
}

export function Widget() {
  const [data, setData] = useState<WidgetData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [renamingListId, setRenamingListId] = useState<string | null>(null);
  const [renameListName, setRenameListName] = useState('');
  const [title, setTitle] = useState('');
  const [selectedTime, setSelectedTime] = useState<{ startTime: string; endTime: string } | null>(null);
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('08:00');
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>({ type: 'once', date: dateKey(new Date()) });
  const [customMode, setCustomMode] = useState(false);
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [error, setError] = useState('');
  const taskInputRef = useRef<HTMLInputElement>(null);
  const listInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const addingTask = useRef(false);
  const addingList = useRef(false);
  const renamingList = useRef(false);
  const pointer = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const expandedRef = useRef(false);
  const transitioning = useRef(false);
  const applyExpansion = useRef(false);
  const applyCollapse = useRef(false);

  const syncFromStorage = () =>
    window.orbit.getData().then(value => {
      const today = dateKey(new Date());
      const tasks = value.tasks.filter(task =>
        task.listId === 'daily' && isTaskScheduledForDate(task, today)
      );
      const completed = tasks.filter(task => value.completions[today]?.[task.id] === true).length;
      const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
      setData(current => ({
        ...value,
        percent,
        expanded: current?.expanded ?? expandedRef.current,
        placement: current?.placement ?? {
          panelRight: true,
          orbX: 0,
          orbY: 0,
          panelWidth: 390,
          panelHeight: 560,
          windowWidth: 484,
          windowHeight: 560
        }
      }));
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load Orbit data.'));

  useEffect(() => {
    const unsubscribeWidget = window.orbit.onWidgetData(value => {
      setData(value);
      if (!value.expanded) {
        expandedRef.current = false;
        setExpanded(false);
        setSelectedListId(null);
        setTimePickerOpen(false);
        setCreatingList(false);
        setNewListName('');
        setRenamingListId(null);
        setRenameListName('');
      }
    });
    const unsubscribeData = window.orbit.onDataChanged(() => {
      void syncFromStorage();
    });
    void syncFromStorage();
    return () => {
      unsubscribeWidget();
      unsubscribeData();
    };
  }, []);

  useEffect(() => {
    if (selectedListId && data && !data.lists.some(list => list.id === selectedListId)) {
      setSelectedListId(null);
    }
    if (renamingListId && data && !data.lists.some(list => list.id === renamingListId)) {
      setRenamingListId(null);
      setRenameListName('');
    }
  }, [data, selectedListId, renamingListId]);

  useLayoutEffect(() => {
    if (applyExpansion.current) {
      applyExpansion.current = false;
      window.orbit.applyWidgetExpansion();
    } else if (applyCollapse.current) {
      applyCollapse.current = false;
      window.orbit.applyWidgetCollapse();
    }
  }, [expanded, data?.placement]);

  useEffect(() => {
    window.orbit.setWidgetTransientInteraction(timePickerOpen || creatingList || Boolean(renamingListId));
  }, [timePickerOpen, creatingList, renamingListId]);

  useEffect(() => {
    if (!creatingList) return;
    const frame = requestAnimationFrame(() => {
      listInputRef.current?.focus();
      listInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [creatingList]);

  useEffect(() => {
    if (!renamingListId) return;
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [renamingListId]);

  const togglePanel = async () => {
    if (transitioning.current) return;
    transitioning.current = true;
    setError('');
    try {
      const opening = !expandedRef.current;
      if (!opening) {
        setSelectedListId(null);
        setTimePickerOpen(false);
        setCreatingList(false);
        setNewListName('');
        setRenamingListId(null);
        setRenameListName('');
      } else {
        await syncFromStorage();
      }
      const placement = await window.orbit.expandWidget(opening);
      setData(current => current ? { ...current, placement } : current);
      expandedRef.current = opening;
      if (opening) applyExpansion.current = true;
      else applyCollapse.current = true;
      setExpanded(opening);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to change the widget panel.');
    } finally {
      transitioning.current = false;
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { x: event.screenX, y: event.screenY, dragging: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const active = pointer.current;
    if (!active) return;
    if (!active.dragging && Math.hypot(event.screenX - active.x, event.screenY - active.y) > 4) {
      active.dragging = true;
      window.orbit.beginWidgetDrag({ x: active.x, y: active.y });
    }
    if (active.dragging) window.orbit.moveWidgetDrag({ x: event.screenX, y: event.screenY });
  };

  const onPointerUp = () => {
    const active = pointer.current;
    if (!active) return;
    pointer.current = null;
    if (active.dragging) window.orbit.endWidgetDrag();
    else void togglePanel();
  };

  const onPointerCancel = () => {
    pointer.current = null;
    window.orbit.endWidgetDrag();
  };

  async function addTask(event: FormEvent) {
    event.preventDefault();
    if (addingTask.current) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('A task title is required.');
      return;
    }
    if (recurrence.type === 'weekly' && !recurrence.days.length) {
      setError('Select at least one weekday for a custom recurrence.');
      return;
    }
    setError('');
    addingTask.current = true;
    try {
      const normalizedRecurrence: TaskRecurrence =
        recurrence.type === 'once'
          ? { type: 'once', date: dateKey(new Date()) }
          : recurrence;
      await window.orbit.addTask({
        title: cleanTitle,
        startTime: selectedTime?.startTime,
        endTime: selectedTime?.endTime,
        daily: normalizedRecurrence.type === 'daily',
        recurrence: normalizedRecurrence,
        listId: selectedListId ?? 'daily'
      });
      await syncFromStorage();
      setTitle('');
      setSelectedTime(null);
      setStartTime('07:00');
      setEndTime('08:00');
      setTimePickerOpen(false);
      setRecurrence({ type: 'once', date: dateKey(new Date()) });
      setCustomMode(false);
      setCustomDays([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add this task.');
    } finally {
      addingTask.current = false;
    }
  }

  function confirmTimeSelection() {
    if (!isValidTimeRange(startTime, endTime)) {
      setError('Choose valid times, with the end later than the start.');
      return;
    }
    if (recurrence.type === 'weekly' && !recurrence.days.length) {
      setError('Select at least one weekday for a custom recurrence.');
      return;
    }
    setSelectedTime({ startTime, endTime });
    setTimePickerOpen(false);
    setError('');
    taskInputRef.current?.focus();
  }

  function cancelTimeSelection() {
    setTimePickerOpen(false);
    setStartTime(selectedTime?.startTime ?? '07:00');
    setEndTime(selectedTime?.endTime ?? '08:00');
    setError('');
    taskInputRef.current?.focus();
  }

  function startCreateList() {
    setError('');
    setRenamingListId(null);
    setRenameListName('');
    setNewListName('');
    setCreatingList(true);
  }

  function cancelCreateList() {
    setCreatingList(false);
    setNewListName('');
    setError('');
  }

  async function submitNewList(event: FormEvent) {
    event.preventDefault();
    if (addingList.current) return;
    const clean = newListName.trim();
    if (!clean) {
      setError('A list name is required.');
      return;
    }
    setError('');
    addingList.current = true;
    try {
      const list = await window.orbit.addList(clean);
      await syncFromStorage();
      setSelectedListId(list.id);
      setNewListName('');
      setCreatingList(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create this list.');
    } finally {
      addingList.current = false;
    }
  }

  function startRenameList(list: OrbitList) {
    setError('');
    setCreatingList(false);
    setNewListName('');
    setSelectedListId(list.id);
    setRenamingListId(list.id);
    setRenameListName(list.name);
  }

  function cancelRenameList() {
    setRenamingListId(null);
    setRenameListName('');
    setError('');
  }

  async function submitRenameList(event: FormEvent) {
    event.preventDefault();
    if (!renamingListId || renamingList.current) return;
    const clean = renameListName.trim();
    if (!clean) {
      setError('A list name is required.');
      return;
    }
    setError('');
    renamingList.current = true;
    try {
      await window.orbit.renameList(renamingListId, clean);
      await syncFromStorage();
      setRenamingListId(null);
      setRenameListName('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to rename this list.');
    } finally {
      renamingList.current = false;
    }
  }

  async function deleteList(id: string) {
    setError('');
    try {
      await window.orbit.removeList(id);
      if (selectedListId === id) setSelectedListId(null);
      if (renamingListId === id) {
        setRenamingListId(null);
        setRenameListName('');
      }
      await syncFromStorage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete this list.');
    }
  }

  async function runAction(action: Promise<unknown>) {
    setError('');
    try {
      await action;
      await syncFromStorage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to complete that action.');
    }
  }

  if (!data) return <div className="widget-root"><div className="widget-error">{error || 'Loading…'}</div></div>;

  const now = new Date();
  const today = dateKey(now);
  const activeListId = selectedListId ?? 'daily';
  const visibleTasks = selectedListId
    ? data.tasks.filter(task => task.listId === selectedListId && isTaskScheduledForDate(task, today))
    : data.tasks.filter(task => task.listId === 'daily' && isTaskScheduledForDate(task, today));
  const analytics = calculateProductivityAnalytics(data, now, activeListId);
  const orbPercent = calculateListDayProgress(data, now, activeListId).percent;
  const size = data.settings.widgetSize === 'small' ? 74 : data.settings.widgetSize === 'large' ? 96 : 84;
  const circumference = 2 * Math.PI * 43;
  const activePreset = getRecurrencePreset(recurrence, customMode);
  const rootStyle = {
    '--widget-size': `${size}px`,
    '--widget-opacity': data.settings.widgetOpacity / 100,
    '--orb-left': expanded ? `${data.placement.orbX}px` : '0px',
    '--orb-top': expanded ? `${data.placement.orbY}px` : '0px',
    '--panel-width': `${data.placement.panelWidth}px`,
    '--panel-height': `${data.placement.panelHeight}px`,
    '--window-width': `${data.placement.windowWidth}px`,
    '--window-height': `${data.placement.windowHeight}px`
  } as React.CSSProperties;

  return <div
    className={`widget-root ${expanded ? 'expanded' : ''} ${expanded && !data.placement.panelRight ? 'panel-on-left' : ''}`}
    style={rootStyle}
    onPointerDown={event => {
      if (expandedRef.current && event.target === event.currentTarget) void togglePanel();
    }}
  >
    <button
      className="orb"
      aria-label={expanded ? 'Close task panel' : 'Open task panel'}
      aria-expanded={expanded}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onMouseMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        event.currentTarget.style.setProperty('--tilt-x', `${-y * 9}deg`);
        event.currentTarget.style.setProperty('--tilt-y', `${x * 9}deg`);
      }}
      onMouseLeave={event => {
        event.currentTarget.style.setProperty('--tilt-x', '0deg');
        event.currentTarget.style.setProperty('--tilt-y', '0deg');
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void togglePanel();
        }
      }}
    >
      {data.settings.showProgressRing && <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="orb-track" cx="50" cy="50" r="43" />
        <circle className="orb-progress" cx="50" cy="50" r="43" style={{ strokeDashoffset: circumference * (1 - orbPercent / 100) }} />
      </svg>}
      <span>{orbPercent}%</span>
    </button>
    {expanded && <section className="widget-panel" aria-label="Task panel"
      onPointerDownCapture={() => window.orbit.setWidgetTransientInteraction(true)}>
      <header className="widget-head">
        {creatingList ? (
          <form className="new-list-form" onSubmit={submitNewList}>
            <input
              ref={listInputRef}
              value={newListName}
              onChange={event => setNewListName(event.target.value)}
              placeholder="List name..."
              maxLength={40}
              aria-label="New list name"
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelCreateList();
                }
              }}
            />
            <button type="submit" className="new-list-save" aria-label="Save list" title="Save list">
              <Check size={13} />
            </button>
            <button type="button" className="new-list-cancel" aria-label="Cancel new list" title="Cancel" onClick={cancelCreateList}>
              ×
            </button>
          </form>
        ) : renamingListId ? (
          <form className="new-list-form" onSubmit={submitRenameList}>
            <input
              ref={renameInputRef}
              value={renameListName}
              onChange={event => setRenameListName(event.target.value)}
              placeholder="Rename list..."
              maxLength={40}
              aria-label="Rename list"
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRenameList();
                }
              }}
            />
            <button type="submit" className="new-list-save" aria-label="Save list name" title="Save">
              <Check size={13} />
            </button>
            <button type="button" className="new-list-cancel" aria-label="Cancel rename" title="Cancel" onClick={cancelRenameList}>
              ×
            </button>
          </form>
        ) : (
          <nav className="widget-list-tabs" aria-label="Task lists">
            <button
              type="button"
              className={`list-tab ${selectedListId === null ? 'selected' : ''}`}
              onClick={() => setSelectedListId(null)}
            >My Day</button>
            {data.lists.filter(list => list.id !== 'daily').map(list => (
              <div
                key={list.id}
                className={`list-tab-item ${selectedListId === list.id ? 'selected' : ''}`}
                onDoubleClick={() => startRenameList(list)}
              >
                <button
                  type="button"
                  className="list-tab-name"
                  onClick={() => setSelectedListId(list.id)}
                  title={`${list.name} (double-click to rename)`}
                >{list.name}</button>
                <button
                  type="button"
                  className="delete-list-tab"
                  aria-label={`Delete ${list.name} list`}
                  title={`Delete ${list.name}`}
                  onClick={event => {
                    event.stopPropagation();
                    void deleteList(list.id);
                  }}
                >×</button>
              </div>
            ))}
          </nav>
        )}
        <button type="button" className="add-list-button" aria-label="Create a list" title="Create a list" onClick={startCreateList}>
          <Plus size={15} />
        </button>
        <button type="button" className="open-dashboard-button" aria-label="Open Orbit" title="Open Orbit" onClick={() => window.orbit.openDashboard()}>
          <ExternalLink size={14} />
        </button>
      </header>
      <div className="widget-add-wrap">
        <form className="widget-add" onSubmit={addTask}>
          <input
            ref={taskInputRef}
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Add a task"
            maxLength={100}
            aria-label="Add a task"
          />
          <button type="submit" aria-label="Add task" title="Add task"><Plus size={17} /></button>
          <button
            type="button"
            className={selectedTime || recurrence.type !== 'once' ? 'has-schedule' : ''}
            aria-label="Choose task time"
            title={selectedTime ? formatTimeRange(selectedTime.startTime, selectedTime.endTime) : 'Choose task time'}
            onClick={() => {
              setStartTime(selectedTime?.startTime ?? '07:00');
              setEndTime(selectedTime?.endTime ?? '08:00');
              setTimePickerOpen(open => !open);
              setError('');
            }}
          ><Clock3 size={16} /></button>
        </form>
        {timePickerOpen && <div
          className="scheduling-popup"
          role="group"
          aria-label="Task scheduling controls"
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelTimeSelection();
            }
          }}
        >
          <TimePicker
            startTime={startTime}
            endTime={endTime}
            onStartChange={setStartTime}
            onEndChange={setEndTime}
            onCancel={cancelTimeSelection}
            onConfirm={confirmTimeSelection}
          />
          <div className="recurrence-options" aria-label="Recurrence">
            <button
              type="button"
              className={activePreset === 'once' ? 'selected' : ''}
              onClick={() => {
                setCustomMode(false);
                setRecurrence({ type: 'once', date: dateKey(new Date()) });
              }}
            >Only today</button>
            <button
              type="button"
              className={activePreset === 'daily' ? 'selected' : ''}
              onClick={() => {
                setCustomMode(false);
                setRecurrence({ type: 'daily' });
              }}
            >Daily</button>
            <button
              type="button"
              className={activePreset === 'weekdays' ? 'selected' : ''}
              onClick={() => {
                setCustomMode(false);
                setRecurrence({ type: 'weekly', days: [1, 2, 3, 4, 5] });
              }}
            >Weekdays</button>
            <button
              type="button"
              className={activePreset === 'weekends' ? 'selected' : ''}
              onClick={() => {
                setCustomMode(false);
                setRecurrence({ type: 'weekly', days: [0, 6] });
              }}
            >Weekends</button>
            <button
              type="button"
              className={activePreset === 'custom' ? 'selected' : ''}
              onClick={() => {
                setCustomMode(true);
                setRecurrence({ type: 'weekly', days: customDays });
              }}
            >Custom</button>
          </div>
          {recurrence.type === 'weekly' && <div className="weekday-options">
            {[1, 2, 3, 4, 5, 6, 0].map(day => <button type="button" key={day}
              className={recurrence.days.includes(day) ? 'selected' : ''}
              onClick={() => {
                const next = recurrence.days.includes(day)
                  ? recurrence.days.filter(value => value !== day)
                  : [...recurrence.days, day];
                setCustomMode(true);
                setCustomDays(next);
                setRecurrence({ type: 'weekly', days: next });
              }}
            >{['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]}</button>)}
          </div>}
          <div className="recurrence-summary">
            {selectedTime ? `${formatTimeRange(selectedTime.startTime, selectedTime.endTime)} · ` : ''}
            {formatRecurrence(recurrence)}
          </div>
        </div>}
      </div>
      <div className="widget-tasks" aria-label="Tasks">
        {visibleTasks.length ? visibleTasks.map(task => {
          const done = data.completions[today]?.[task.id] === true;
          const taskTime = task.startTime && task.endTime
            ? formatTimeRange(task.startTime, task.endTime)
            : task.time ? formatTaskTime(task.time) : '';
          return <div className={`widget-task ${done ? 'done' : ''}`} key={task.id}>
            <button
              className="check"
              aria-label={`${done ? 'Mark incomplete' : 'Complete'} ${task.title}`}
              onClick={() => { void runAction(window.orbit.toggleTask(task.id)); }}
            >{done && <Check size={12} />}</button>
            <span className="widget-task-title">{task.title}</span>
            {taskTime && <small>{taskTime}</small>}
            <button className="delete-task" aria-label={`Delete ${task.title}`} title="Delete task" onClick={() => { void runAction(window.orbit.removeTask(task.id)); }}>×</button>
          </div>;
        }) : <p className="empty-state">No tasks yet. Add one above.</p>}
      </div>
      <WidgetAnalytics analytics={analytics} />
      {error && <div className="widget-error" role="alert">{error}</div>}
    </section>}
  </div>;
}

function WidgetAnalytics({ analytics }: { analytics: ReturnType<typeof calculateProductivityAnalytics> }) {
  const cards = [
    { label: 'MONTHLY PROGRESS', progress: analytics.monthly },
    { label: 'WEEKLY PROGRESS', progress: analytics.weekly },
    { label: 'DAILY PROGRESS', progress: analytics.daily }
  ];

  return <footer className="widget-analytics" aria-label="Productivity statistics">
    <div className="analytics-cards">
      {cards.map(({ label, progress }) => {
        const circumference = 2 * Math.PI * 20;
        return <article className="analytics-card" key={label}>
          <div className="analytics-ring" role="img" aria-label={`${label} progress: ${progress.percent}%`}>
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <circle className="analytics-ring-track" cx="24" cy="24" r="20" />
              <circle className="analytics-ring-progress" cx="24" cy="24" r="20" style={{
                strokeDasharray: circumference,
                strokeDashoffset: circumference * (1 - progress.percent / 100)
              }} />
            </svg>
            <span>{progress.percent}%</span>
          </div>
          <strong>{label}</strong>
        </article>;
      })}
    </div>
    <section className="streak-card">
      <strong>Active Streaks</strong>
      {analytics.activeStreaks.length
        ? <ul>{analytics.activeStreaks.slice(0, 3).map(streak => <li key={streak.taskId}>
          <span title={streak.title}>{streak.title}</span>
          <small>{streak.days}d</small>
        </li>)}</ul>
        : <p>No active habit streaks yet.</p>}
    </section>
  </footer>;
}