import { FormEvent, PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Clock3, ExternalLink, Flame, Pause, Pin, PinOff, Play, Plus, RotateCcw, SlidersHorizontal, Timer } from 'lucide-react';
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

function formatClockDisplay(totalSeconds: number, forceHours = false): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0 || forceHours) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function Widget() {
  const [data, setData] = useState<WidgetData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [orbHidden, setOrbHidden] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [renamingListId, setRenamingListId] = useState<string | null>(null);
  const [renameListName, setRenameListName] = useState('');
  const [timerPopupOpen, setTimerPopupOpen] = useState(false);
  const [timerTab, setTimerTab] = useState<'countdown' | 'stopwatch'>('countdown');
  const [cdHours, setCdHours] = useState('0');
  const [cdMinutes, setCdMinutes] = useState('25');
  const [cdSeconds, setCdSeconds] = useState('0');
  const [swTargetHours, setSwTargetHours] = useState('1');
  const [swTargetMinutes, setSwTargetMinutes] = useState('0');
  const [swTargetSeconds, setSwTargetSeconds] = useState('0');
  const [title, setTitle] = useState('');
  const [selectedTime, setSelectedTime] = useState<{ startTime: string; endTime: string } | null>(null);
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('08:00');
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>({ type: 'once', date: dateKey(new Date()) });
  const [customMode, setCustomMode] = useState(false);
  const [customDays, setCustomDays] = useState<number[]>([]);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editHasTime, setEditHasTime] = useState(false);
  const [editStartTime, setEditStartTime] = useState('07:00');
  const [editEndTime, setEditEndTime] = useState('08:00');
  const [editRecurrence, setEditRecurrence] = useState<TaskRecurrence>({ type: 'once', date: dateKey(new Date()) });
  const [editCustomMode, setEditCustomMode] = useState(false);
  const [editCustomDays, setEditCustomDays] = useState<number[]>([]);

  const [error, setError] = useState('');
  const taskInputRef = useRef<HTMLInputElement>(null);
  const listInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const editTitleInputRef = useRef<HTMLInputElement>(null);
  const addingTask = useRef(false);
  const savingTaskEdit = useRef(false);
  const addingList = useRef(false);
  const renamingList = useRef(false);
  const pointer = useRef<{ x: number; y: number; dragging: boolean; source: 'orb' | 'panel' } | null>(null);
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
        pinned: current?.pinned ?? pinned,
        orbHidden: current?.orbHidden ?? orbHidden,
        placement: current?.placement ?? {
          panelRight: true,
          orbX: 0,
          orbY: 0,
          orbSize: value.settings.customOrbSize ?? 116,
          panelY: 0,
          panelWidth: 390,
          panelHeight: 560,
          windowWidth: 518,
          windowHeight: 560
        }
      }));
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load Orbit data.'));

  useEffect(() => {
    const unsubscribeWidget = window.orbit.onWidgetData(value => {
      setData(value);
      setPinned(Boolean(value.pinned));
      setOrbHidden(Boolean(value.orbHidden));
      if (!value.expanded) {
        expandedRef.current = false;
        setExpanded(false);
        setPinned(false);
        setOrbHidden(false);
        setSelectedListId(null);
        setTimePickerOpen(false);
        setTimerPopupOpen(false);
        setCreatingList(false);
        setNewListName('');
        setRenamingListId(null);
        setRenameListName('');
        setEditingTaskId(null);
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
    if (editingTaskId && data && !data.tasks.some(task => task.id === editingTaskId)) {
      setEditingTaskId(null);
    }
  }, [data, selectedListId, renamingListId, editingTaskId]);

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
    window.orbit.setWidgetTransientInteraction(
      pinned || timePickerOpen || timerPopupOpen || creatingList || Boolean(renamingListId) || Boolean(editingTaskId)
    );
  }, [pinned, timePickerOpen, timerPopupOpen, creatingList, renamingListId, editingTaskId]);

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

  useEffect(() => {
    if (!editingTaskId) return;
    const frame = requestAnimationFrame(() => {
      editTitleInputRef.current?.focus();
      editTitleInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editingTaskId]);

  const togglePanel = async (openTimerAfterExpand = false) => {
    if (transitioning.current) return;
    transitioning.current = true;
    setError('');
    try {
      const opening = openTimerAfterExpand ? true : !expandedRef.current;
      if (!opening) {
        setPinned(false);
        setOrbHidden(false);
        setSelectedListId(null);
        setTimePickerOpen(false);
        setTimerPopupOpen(false);
        setCreatingList(false);
        setNewListName('');
        setRenamingListId(null);
        setRenameListName('');
        setEditingTaskId(null);
      } else {
        await syncFromStorage();
      }
      if (opening !== expandedRef.current) {
        const placement = await window.orbit.expandWidget(opening);
        setData(current => current ? { ...current, placement } : current);
        expandedRef.current = opening;
        if (opening) applyExpansion.current = true;
        else applyCollapse.current = true;
        setExpanded(opening);
      }
      if (openTimerAfterExpand && data) {
        setTimePickerOpen(false);
        setTimerTab(data.timer.mode);
        const total = data.timer.durationSeconds;
        const hrs = Math.floor(total / 3600);
        const mins = Math.floor((total % 3600) / 60);
        const secs = total % 60;
        if (data.timer.mode === 'countdown') {
          setCdHours(String(hrs));
          setCdMinutes(String(mins));
          setCdSeconds(String(secs));
        } else {
          setSwTargetHours(String(hrs));
          setSwTargetMinutes(String(mins));
          setSwTargetSeconds(String(secs));
        }
        setTimerPopupOpen(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to change the widget panel.');
    } finally {
      transitioning.current = false;
    }
  };

  async function togglePinPanel() {
    setError('');
    try {
      const next = await window.orbit.setPanelPinned(!pinned);
      setPinned(next);
      if (!next) setOrbHidden(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to pin panel.');
    }
  }

  const onOrbPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('.orb-hover-controls')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { x: event.screenX, y: event.screenY, dragging: false, source: 'orb' };
  };

  const onPanelPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, label, select, textarea, a, .widget-tasks, .orb-timer-popover, .scheduling-popup')) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { x: event.screenX, y: event.screenY, dragging: false, source: 'panel' };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
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
    if (active.dragging) {
      window.orbit.endWidgetDrag();
    } else if (active.source === 'orb') {
      void togglePanel();
    }
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

  function startEditTask(task: OrbitTask) {
    setError('');
    setTimePickerOpen(false);
    setTimerPopupOpen(false);
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    if (task.startTime && task.endTime) {
      setEditHasTime(true);
      setEditStartTime(task.startTime);
      setEditEndTime(task.endTime);
    } else if (task.time) {
      setEditHasTime(true);
      setEditStartTime(task.time);
      const [h, m] = task.time.split(':').map(Number);
      const nextH = (h + 1) % 24;
      setEditEndTime(`${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    } else {
      setEditHasTime(false);
      setEditStartTime('07:00');
      setEditEndTime('08:00');
    }
    const baseRec: TaskRecurrence = task.recurrence
      ?? (task.daily ? { type: 'daily' } : { type: 'once', date: task.date || dateKey(new Date()) });
    setEditRecurrence(baseRec);
    if (baseRec.type === 'weekly') {
      setEditCustomDays(baseRec.days);
      const preset = getRecurrencePreset(baseRec, false);
      setEditCustomMode(preset === 'custom');
    } else {
      setEditCustomDays([]);
      setEditCustomMode(false);
    }
  }

  function cancelEditTask() {
    setEditingTaskId(null);
    setError('');
  }

  async function submitEditTask(event: FormEvent) {
    event.preventDefault();
    if (!editingTaskId || savingTaskEdit.current) return;
    const cleanTitle = editTitle.trim();
    if (!cleanTitle) {
      setError('A task title is required.');
      return;
    }
    if (editHasTime && !isValidTimeRange(editStartTime, editEndTime)) {
      setError('Choose valid times, with the end later than the start.');
      return;
    }
    if (editRecurrence.type === 'weekly' && !editRecurrence.days.length) {
      setError('Select at least one weekday for a custom recurrence.');
      return;
    }
    setError('');
    savingTaskEdit.current = true;
    try {
      const normalizedRecurrence: TaskRecurrence =
        editRecurrence.type === 'once'
          ? { type: 'once', date: editRecurrence.date || dateKey(new Date()) }
          : editRecurrence;
      await window.orbit.updateTask(editingTaskId, {
        title: cleanTitle,
        startTime: editHasTime ? editStartTime : undefined,
        endTime: editHasTime ? editEndTime : undefined,
        recurrence: normalizedRecurrence
      });
      await syncFromStorage();
      setEditingTaskId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update this task.');
    } finally {
      savingTaskEdit.current = false;
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
    setTimerPopupOpen(false);
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
    setTimerPopupOpen(false);
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

  function toggleTimerPopover() {
    setError('');
    setTimePickerOpen(false);
    if (!timerPopupOpen && data) {
      setTimerTab(data.timer.mode);
      const total = data.timer.durationSeconds;
      const hrs = Math.floor(total / 3600);
      const mins = Math.floor((total % 3600) / 60);
      const secs = total % 60;
      if (data.timer.mode === 'countdown') {
        setCdHours(String(hrs));
        setCdMinutes(String(mins));
        setCdSeconds(String(secs));
      } else {
        setSwTargetHours(String(hrs));
        setSwTargetMinutes(String(mins));
        setSwTargetSeconds(String(secs));
      }
    }
    setTimerPopupOpen(open => !open);
  }

  function parseHmsSeconds(h: string, m: string, s: string): number {
    const hrs = Math.max(0, Math.min(23, Math.floor(Number(h) || 0)));
    const mins = Math.max(0, Math.min(59, Math.floor(Number(m) || 0)));
    const secs = Math.max(0, Math.min(59, Math.floor(Number(s) || 0)));
    return hrs * 3600 + mins * 60 + secs;
  }

  async function handleStartConfiguredTimer(event?: FormEvent) {
    event?.preventDefault();
    setError('');
    try {
      if (timerTab === 'countdown') {
        const totalSeconds = parseHmsSeconds(cdHours, cdMinutes, cdSeconds);
        if (totalSeconds < 1) {
          setError('Set at least 1 second for the countdown.');
          return;
        }
        const isCurrentSamePaused =
          data?.timer.mode === 'countdown' &&
          !data.timer.running &&
          data.timer.durationSeconds === totalSeconds &&
          data.timer.remainingSeconds > 0 &&
          data.timer.remainingSeconds < totalSeconds;
        if (!isCurrentSamePaused) {
          await window.orbit.configureTimer({ mode: 'countdown', durationSeconds: totalSeconds });
        }
        await window.orbit.startTimer();
      } else {
        const targetSeconds = parseHmsSeconds(swTargetHours, swTargetMinutes, swTargetSeconds);
        const isCurrentSamePaused =
          data?.timer.mode === 'stopwatch' &&
          !data.timer.running &&
          data.timer.durationSeconds === targetSeconds &&
          data.timer.elapsedSeconds > 0;
        if (!isCurrentSamePaused) {
          await window.orbit.configureTimer({ mode: 'stopwatch', durationSeconds: targetSeconds });
        }
        await window.orbit.startTimer();
      }
      await syncFromStorage();
      setTimerPopupOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start timer.');
    }
  }

  async function handleResumeActiveTimer() {
    setError('');
    try {
      await window.orbit.startTimer();
      await syncFromStorage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to resume timer.');
    }
  }

  async function handlePauseTimer() {
    setError('');
    try {
      await window.orbit.pauseTimer();
      await syncFromStorage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to pause timer.');
    }
  }

  async function handleResetTimer() {
    setError('');
    try {
      await window.orbit.resetTimer();
      await syncFromStorage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to reset timer.');
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
<<<<<<< HEAD
    ? data.tasks.filter(task => task.listId === selectedListId)
=======
    ? data.tasks.filter(task => task.listId === selectedListId && isTaskScheduledForDate(task, today))
>>>>>>> ab0261a47eb49002688a3dcfc66479bd4ec1c0a2
    : data.tasks.filter(task => task.listId === 'daily' && isTaskScheduledForDate(task, today));
  const analytics = calculateProductivityAnalytics(data, now, activeListId);
  const orbPercent = calculateListDayProgress(data, now, activeListId).percent;

  const timer = data.timer;
  const isCountdownActive =
    timer.mode === 'countdown' &&
    (timer.running || (timer.remainingSeconds > 0 && timer.remainingSeconds < timer.durationSeconds));
  const isStopwatchActive =
    timer.mode === 'stopwatch' &&
    (timer.running || timer.elapsedSeconds > 0);
  const isTimerShowingInOrb = isCountdownActive || isStopwatchActive;

  let orbLabel = `${orbPercent}%`;
  let orbRatio = orbPercent / 100;
  let orbHasHours = false;

  if (isCountdownActive) {
    orbHasHours = timer.durationSeconds >= 3600;
    orbLabel = formatClockDisplay(timer.remainingSeconds, orbHasHours);
    orbRatio = timer.durationSeconds > 0 ? Math.max(0, Math.min(1, timer.remainingSeconds / timer.durationSeconds)) : 0;
  } else if (isStopwatchActive) {
    orbHasHours = timer.elapsedSeconds >= 3600 || timer.durationSeconds >= 3600;
    orbLabel = formatClockDisplay(timer.elapsedSeconds, timer.elapsedSeconds >= 3600);
    const cycle = timer.durationSeconds > 0 ? timer.durationSeconds : 3600;
    orbRatio = Math.max(0, Math.min(1, (timer.elapsedSeconds % cycle) / cycle || (timer.elapsedSeconds > 0 && timer.elapsedSeconds % cycle === 0 ? 1 : 0)));
  }

  const size = data.placement.orbSize ?? data.settings.customOrbSize ?? (data.settings.widgetSize === 'small' ? 74 : data.settings.widgetSize === 'large' ? 680 : 116);
  const miniIconSize = Math.max(10, Math.min(15, Math.round(size * 0.125)));
  const ringRadius = 47.4;
  const circumference = 2 * Math.PI * ringRadius;

  // Exact tip point on the circle in rotated SVG coordinates (0 rad = top 12 o'clock)
  const tipAngle = orbRatio * 2 * Math.PI;
  const tipX = 50 + ringRadius * Math.cos(tipAngle);
  const tipY = 50 + ringRadius * Math.sin(tipAngle);
  // Rotate sparkler emitter along the tangent direction of the burning tip
  const tangentDeg = (tipAngle * 180) / Math.PI + 90;
  const showSparkler = orbRatio > 0.005 && orbRatio < 0.998;
  const isActivelyBurning = timer.running || (!isTimerShowingInOrb && orbRatio > 0);

  const activePreset = getRecurrencePreset(recurrence, customMode);
  const editPreset = getRecurrencePreset(editRecurrence, editCustomMode);
  const rootStyle = {
    '--widget-size': `${size}px`,
    '--widget-opacity': data.settings.widgetOpacity / 100,
    '--orb-left': expanded ? `${data.placement.orbX}px` : '0px',
    '--orb-top': expanded ? `${data.placement.orbY}px` : '0px',
    '--panel-top': expanded ? `${data.placement.panelY ?? 0}px` : '0px',
    '--panel-width': `${data.placement.panelWidth}px`,
    '--panel-height': `${data.placement.panelHeight}px`,
    '--window-width': `${data.placement.windowWidth}px`,
    '--window-height': `${data.placement.windowHeight}px`
  } as React.CSSProperties;

  return <div
    className={`widget-root ${expanded ? 'expanded' : ''} ${expanded && !data.placement.panelRight ? 'panel-on-left' : ''}`}
    style={rootStyle}
    onPointerDown={event => {
      if (expandedRef.current && !pinned && event.target === event.currentTarget) void togglePanel();
    }}
  >
    {!orbHidden && <div
      role="button"
      tabIndex={0}
      className={`orb ${isTimerShowingInOrb ? 'timer-active' : ''}`}
      aria-label={expanded ? 'Close task panel' : 'Open task panel'}
      aria-expanded={expanded}
      onPointerDown={onOrbPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onMouseMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        event.currentTarget.style.setProperty('--tilt-x', `${-y * 6}deg`);
        event.currentTarget.style.setProperty('--tilt-y', `${x * 6}deg`);
      }}
      onMouseLeave={event => {
        event.currentTarget.style.setProperty('--tilt-x', '0deg');
        event.currentTarget.style.setProperty('--tilt-y', '0deg');
      }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void togglePanel();
        }
      }}
    >
      {data.settings.showProgressRing && <svg className="orb-ring-svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="orb-track" cx="50" cy="50" r={ringRadius} />
        <circle
          className="orb-progress"
          cx="50"
          cy="50"
          r={ringRadius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference * (1 - orbRatio)
          }}
        />
      </svg>}
      <span className={isTimerShowingInOrb ? (orbHasHours ? 'orb-timer-text compact' : 'orb-timer-text') : ''}>{orbLabel}</span>
      {isTimerShowingInOrb && (
        <div
          className="orb-hover-controls"
          role="group"
          aria-label="Timer quick controls"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        >
          <button
            type="button"
            className="orb-mini-btn"
            title="Change timer"
            aria-label="Change timer"
            onClick={() => { void togglePanel(true); }}
          >
            <SlidersHorizontal size={miniIconSize} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="orb-mini-btn center"
            title={timer.running ? 'Pause timer' : 'Resume timer'}
            aria-label={timer.running ? 'Pause timer' : 'Resume timer'}
            onClick={() => {
              if (timer.running) void handlePauseTimer();
              else void handleResumeActiveTimer();
            }}
          >
            {timer.running ? <Pause size={miniIconSize} strokeWidth={2.2} /> : <Play size={miniIconSize} strokeWidth={2.2} />}
          </button>
          <button
            type="button"
            className="orb-mini-btn"
            title="Reset timer"
            aria-label="Reset timer"
            onClick={() => { void handleResetTimer(); }}
          >
            <RotateCcw size={miniIconSize} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>}
    {expanded && <section
      className={`widget-panel ${pinned ? 'pinned' : ''}`}
      aria-label="Task panel"
      onPointerDown={onPanelPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerDownCapture={() => window.orbit.setWidgetTransientInteraction(true)}
    >
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
        <button
          type="button"
          className={`pin-header-button ${pinned ? 'active' : ''}`}
          aria-label={pinned ? 'Unpin panel from screen' : 'Pin panel on screen'}
          title={pinned ? 'Unpin panel' : 'Pin panel on desktop'}
          onClick={() => { void togglePinPanel(); }}
        >
          {pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <button
          type="button"
          className={`timer-header-button ${timerPopupOpen || isTimerShowingInOrb ? 'active' : ''}`}
          aria-label="Focus & study timer"
          title="Focus & study timer"
          onClick={toggleTimerPopover}
        >
          <Timer size={14} />
        </button>
        <button type="button" className="open-dashboard-button" aria-label="Open Orbit" title="Open Orbit" onClick={() => window.orbit.openDashboard()}>
          <ExternalLink size={14} />
        </button>
      </header>

      {timerPopupOpen && (
        <div
          className="orb-timer-popover"
          role="dialog"
          aria-label="Orb timer controls"
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setTimerPopupOpen(false);
            }
          }}
        >
          <div className="orb-timer-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={timerTab === 'countdown'}
              className={timerTab === 'countdown' ? 'selected' : ''}
              onClick={() => { setError(''); setTimerTab('countdown'); }}
            >Countdown</button>
            <button
              type="button"
              role="tab"
              aria-selected={timerTab === 'stopwatch'}
              className={timerTab === 'stopwatch' ? 'selected' : ''}
              onClick={() => { setError(''); setTimerTab('stopwatch'); }}
            >Study Timer</button>
          </div>

          {timerTab === 'countdown' ? (
            <form className="orb-timer-body" onSubmit={handleStartConfiguredTimer}>
              <div className="orb-timer-caption">Pomodoro / Question countdown</div>
              <div className="hms-grid">
                <label>
                  <span>Hr</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={cdHours}
                    onChange={event => setCdHours(event.target.value)}
                  />
                </label>
                <label>
                  <span>Min</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={cdMinutes}
                    onChange={event => setCdMinutes(event.target.value)}
                  />
                </label>
                <label>
                  <span>Sec</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={cdSeconds}
                    onChange={event => setCdSeconds(event.target.value)}
                  />
                </label>
              </div>
              <div className="orb-timer-presets">
                {[
                  { label: '5m', h: '0', m: '5', s: '0' },
                  { label: '25m', h: '0', m: '25', s: '0' },
                  { label: '45m', h: '0', m: '45', s: '0' },
                  { label: '1h', h: '1', m: '0', s: '0' }
                ].map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setCdHours(preset.h);
                      setCdMinutes(preset.m);
                      setCdSeconds(preset.s);
                    }}
                  >{preset.label}</button>
                ))}
              </div>
              <div className="orb-timer-actions">
                {timer.mode === 'countdown' && timer.running ? (
                  <button type="button" className="secondary-btn" onClick={() => { void handlePauseTimer(); }}>
                    <Pause size={12} /> Pause
                  </button>
                ) : (
                  <button type="submit" className="primary-btn">
                    <Play size={12} /> {timer.mode === 'countdown' && timer.remainingSeconds > 0 && timer.remainingSeconds < timer.durationSeconds ? 'Resume' : 'Start'}
                  </button>
                )}
                <button type="button" className="secondary-btn" onClick={() => { void handleResetTimer(); }} title="Reset & show task %">
                  <RotateCcw size={12} /> Reset
                </button>
              </div>
            </form>
          ) : (
            <form className="orb-timer-body" onSubmit={handleStartConfiguredTimer}>
              <div className="orb-timer-caption">Target study duration (optional)</div>
              <div className="hms-grid">
                <label>
                  <span>Hr</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={swTargetHours}
                    onChange={event => setSwTargetHours(event.target.value)}
                  />
                </label>
                <label>
                  <span>Min</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={swTargetMinutes}
                    onChange={event => setSwTargetMinutes(event.target.value)}
                  />
                </label>
                <label>
                  <span>Sec</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={swTargetSeconds}
                    onChange={event => setSwTargetSeconds(event.target.value)}
                  />
                </label>
              </div>
              <div className="orb-timer-status">
                Studied: <strong>{formatClockDisplay(timer.mode === 'stopwatch' ? timer.elapsedSeconds : 0, true)}</strong>
                {parseHmsSeconds(swTargetHours, swTargetMinutes, swTargetSeconds) > 0 && (
                  <> / {formatClockDisplay(parseHmsSeconds(swTargetHours, swTargetMinutes, swTargetSeconds), true)}</>
                )}
              </div>
              <div className="orb-timer-actions">
                {timer.mode === 'stopwatch' && timer.running ? (
                  <button type="button" className="secondary-btn" onClick={() => { void handlePauseTimer(); }}>
                    <Pause size={12} /> Pause
                  </button>
                ) : (
                  <button type="submit" className="primary-btn">
                    <Play size={12} /> {timer.mode === 'stopwatch' && timer.elapsedSeconds > 0 ? 'Resume' : 'Start'}
                  </button>
                )}
                <button type="button" className="secondary-btn" onClick={() => { void handleResetTimer(); }} title="Reset & show task %">
                  <RotateCcw size={12} /> Reset
                </button>
              </div>
            </form>
          )}
        </div>
      )}

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
              setTimerPopupOpen(false);
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
          if (editingTaskId === task.id) {
            return (
              <form
                key={task.id}
                className="widget-task-editor"
                onSubmit={submitEditTask}
                onKeyDown={event => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelEditTask();
                  }
                }}
              >
                <div className="task-editor-top">
                  <input
                    ref={editTitleInputRef}
                    value={editTitle}
                    onChange={event => setEditTitle(event.target.value)}
                    placeholder="Task title..."
                    maxLength={100}
                    aria-label="Edit task title"
                  />
                  <button
                    type="button"
                    className={`task-editor-time-toggle ${editHasTime ? 'active' : ''}`}
                    onClick={() => setEditHasTime(value => !value)}
                    title={editHasTime ? 'Remove time range' : 'Add time range'}
                  >
                    <Clock3 size={12} />
                    <span>{editHasTime ? formatTimeRange(editStartTime, editEndTime) : 'No time'}</span>
                  </button>
                </div>

                {editHasTime && (
                  <div className="task-editor-times">
                    <label>
                      <span>Start</span>
                      <input
                        type="time"
                        value={editStartTime}
                        onChange={event => setEditStartTime(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>End</span>
                      <input
                        type="time"
                        value={editEndTime}
                        onChange={event => setEditEndTime(event.target.value)}
                      />
                    </label>
                  </div>
                )}

                <div className="task-editor-recurrence">
                  <button
                    type="button"
                    className={editPreset === 'once' ? 'selected' : ''}
                    onClick={() => {
                      setEditCustomMode(false);
                      setEditRecurrence({ type: 'once', date: dateKey(new Date()) });
                    }}
                  >Today</button>
                  <button
                    type="button"
                    className={editPreset === 'daily' ? 'selected' : ''}
                    onClick={() => {
                      setEditCustomMode(false);
                      setEditRecurrence({ type: 'daily' });
                    }}
                  >Daily</button>
                  <button
                    type="button"
                    className={editPreset === 'weekdays' ? 'selected' : ''}
                    onClick={() => {
                      setEditCustomMode(false);
                      setEditRecurrence({ type: 'weekly', days: [1, 2, 3, 4, 5] });
                    }}
                  >Weekdays</button>
                  <button
                    type="button"
                    className={editPreset === 'weekends' ? 'selected' : ''}
                    onClick={() => {
                      setEditCustomMode(false);
                      setEditRecurrence({ type: 'weekly', days: [0, 6] });
                    }}
                  >Weekends</button>
                  <button
                    type="button"
                    className={editPreset === 'custom' ? 'selected' : ''}
                    onClick={() => {
                      setEditCustomMode(true);
                      setEditRecurrence({ type: 'weekly', days: editCustomDays });
                    }}
                  >Custom</button>
                </div>

                {editRecurrence.type === 'weekly' && (
                  <div className="weekday-options">
                    {[1, 2, 3, 4, 5, 6, 0].map(day => (
                      <button
                        type="button"
                        key={day}
                        className={editRecurrence.days.includes(day) ? 'selected' : ''}
                        onClick={() => {
                          const next = editRecurrence.days.includes(day)
                            ? editRecurrence.days.filter(value => value !== day)
                            : [...editRecurrence.days, day];
                          setEditCustomMode(true);
                          setEditCustomDays(next);
                          setEditRecurrence({ type: 'weekly', days: next });
                        }}
                      >{['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]}</button>
                    ))}
                  </div>
                )}

                <div className="task-editor-actions">
                  <button type="button" className="cancel-btn" onClick={cancelEditTask}>Cancel</button>
                  <button type="submit" className="save-btn">Save</button>
                </div>
              </form>
            );
          }

          const done = data.completions[today]?.[task.id] === true;
          const taskTime = task.startTime && task.endTime
            ? formatTimeRange(task.startTime, task.endTime)
            : task.time ? formatTaskTime(task.time) : '';
          return <div
            className={`widget-task ${done ? 'done' : ''}`}
            key={task.id}
            onDoubleClick={() => startEditTask(task)}
            title="Double-click to edit task"
          >
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

  const currentStreak = analytics.myDayCurrentStreak;
  const maxStreak = analytics.myDayMaxStreak;

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
    <section
      className="streak-card"
      tabIndex={0}
      aria-label={`My Day Active Streak: ${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}, Max Streak: ${maxStreak} ${maxStreak === 1 ? 'day' : 'days'}`}
    >
      <div className="streak-card-head">
        <strong>Active Streaks</strong>
        <span className={`streak-fire-badge ${currentStreak > 0 ? 'lit' : ''}`}>
          <Flame size={11} />
          <span>{currentStreak} {currentStreak === 1 ? 'day' : 'days'}</span>
        </span>
      </div>
      <div className="streak-tooltip" role="tooltip">
        <div><span>Current Streak:</span> <b>{currentStreak} {currentStreak === 1 ? 'day' : 'days'}</b></div>
        <div><span>Max Streak:</span> <b>{maxStreak} {maxStreak === 1 ? 'day' : 'days'}</b></div>
      </div>
      {analytics.activeStreaks.length
        ? <ul>{analytics.activeStreaks.slice(0, 2).map(streak => <li key={streak.taskId}>
          <span title={streak.title}>{streak.title}</span>
          <small>🔥 {streak.days}d</small>
        </li>)}</ul>
        : <p>Complete My Day habits daily to build your streak.</p>}
    </section>
  </footer>;
}