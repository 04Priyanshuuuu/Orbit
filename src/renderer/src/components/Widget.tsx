import { FormEvent, PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Plus } from 'lucide-react';
import { calculateProductivityAnalytics } from '../analytics';
import { parseTaskInput } from '../taskInput';

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function Widget() {
  const [data, setData] = useState<WidgetData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [daily, setDaily] = useState(true);
  const [error, setError] = useState('');
  const pointer = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const expandedRef = useRef(false);
  const transitioning = useRef(false);
  const applyExpansion = useRef(false);
  const applyCollapse = useRef(false);

  useEffect(() => {
    const unsubscribe = window.orbit.onWidgetData(value => {
      setData(value);
      if (!value.expanded) {
        expandedRef.current = false;
        setExpanded(false);
      }
    });
    window.orbit.getData().then(value => {
      const today = dateKey(new Date());
      const tasks = value.tasks.filter(task =>
        task.daily || task.date === today || (!task.daily && !task.date)
      );
      const completed = tasks.filter(task => value.completions[today]?.[task.id] === true).length;
      setData(current => current ?? {
        ...value,
        percent: tasks.length ? Math.round(completed / tasks.length * 100) : 0,
        expanded: false,
        placement: {
          panelRight: true,
          orbX: 0,
          orbY: 0,
          panelWidth: 390,
          panelHeight: 560,
          windowWidth: 484,
          windowHeight: 560
        }
      });
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load Orbit data.'));
    return unsubscribe;
  }, []);

  useLayoutEffect(() => {
    if (applyExpansion.current) {
      applyExpansion.current = false;
      window.orbit.applyWidgetExpansion();
    } else if (applyCollapse.current) {
      applyCollapse.current = false;
      window.orbit.applyWidgetCollapse();
    }
  }, [expanded, data?.placement]);

  const togglePanel = async () => {
    if (transitioning.current) return;
    transitioning.current = true;
    setError('');
    try {
      const opening = !expandedRef.current;
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
    const parsed = parseTaskInput(title);
    if (!parsed.title) return;
    setError('');
    try {
      await window.orbit.addTask({
        title: parsed.title,
        time: parsed.time || undefined,
        daily,
        listId: selectedListId ?? 'daily'
      });
      setTitle('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add this task.');
    }
  }

  async function addList() {
    const name = prompt('Name your new list:');
    if (!name?.trim()) return;
    setError('');
    try {
      const list = await window.orbit.addList(name);
      setSelectedListId(list.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create this list.');
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

  if (!data) return <div className="widget-root"><div className="widget-error">{error || 'Loading…'}</div></div>;

  const today = dateKey(new Date());
  const visibleTasks = selectedListId
    ? data.tasks.filter(task => task.listId === selectedListId)
    : data.tasks.filter(task => task.daily || task.date === today || (!task.daily && !task.date));
  const analytics = calculateProductivityAnalytics(data);
  const size = data.settings.widgetSize === 'small' ? 74 : data.settings.widgetSize === 'large' ? 96 : 84;
  const circumference = 2 * Math.PI * 43;
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
        <circle className="orb-progress" cx="50" cy="50" r="43" style={{ strokeDashoffset: circumference * (1 - data.percent / 100) }} />
      </svg>}
      <span>{data.percent}%</span>
    </button>
    {expanded && <section className="widget-panel" aria-label="Task panel">
      <header className="widget-head">
        <nav className="widget-list-tabs" aria-label="Task lists">
          <button
            type="button"
            className={`list-tab ${selectedListId === null ? 'selected' : ''}`}
            onClick={() => setSelectedListId(null)}
          >My Day</button>
          {data.lists.filter(list => list.id !== 'daily').map(list => <button
            type="button"
            className={`list-tab ${selectedListId === list.id ? 'selected' : ''}`}
            key={list.id}
            onClick={() => setSelectedListId(list.id)}
            title={list.name}
          >{list.name}</button>)}
          <button type="button" className="new-list-tab" onClick={() => { void addList(); }}>New List</button>
        </nav>
        <button type="button" className="add-list-button" aria-label="Create a list" title="Create a list" onClick={() => { void addList(); }}>
          <Plus size={15} />
        </button>
        <button type="button" className="open-dashboard-button" aria-label="Open Orbit" title="Open Orbit" onClick={() => window.orbit.openDashboard()}>
          <ExternalLink size={14} />
        </button>
      </header>
      <form className="widget-add" onSubmit={addTask}>
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Add a task"
          maxLength={100}
          aria-label="Add a task"
        />
        <button type="submit" aria-label="Add task"><Plus size={17} /></button>
        <label><input type="checkbox" checked={daily} onChange={event => setDaily(event.target.checked)} /> Daily</label>
      </form>
      <div className="widget-tasks" aria-label="Tasks">
        {visibleTasks.length ? visibleTasks.map(task => {
          const done = data.completions[today]?.[task.id] === true;
          return <div className={`widget-task ${done ? 'done' : ''}`} key={task.id}>
            <button
              className="check"
              aria-label={`${done ? 'Mark incomplete' : 'Complete'} ${task.title}`}
              onClick={() => { void runAction(window.orbit.toggleTask(task.id)); }}
            >{done && <Check size={12} />}</button>
            <span className="widget-task-title">{task.title}</span>
            {task.time && <small>{task.time}</small>}
            <button className="delete-task" aria-label={`Delete ${task.title}`} title="Delete task" onClick={() => { void runAction(window.orbit.removeTask(task.id)); }}>×</button>
          </div>;
        }) : <p className="empty-state">No tasks yet. Add one below.</p>}
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
