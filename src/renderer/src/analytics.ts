import { isTaskScheduledForDate } from './taskInput';

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDays = (date: Date, days: number) => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
};

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export type PeriodProgress = {
  completed: number;
  total: number;
  percent: number;
};

export type TaskStreak = {
  taskId: string;
  title: string;
  days: number;
  maxDays: number;
};

export type ProductivityAnalytics = {
  daily: PeriodProgress;
  weekly: PeriodProgress;
  monthly: PeriodProgress;
  activeStreaks: TaskStreak[];
  myDayCurrentStreak: number;
  myDayMaxStreak: number;
};

function getScheduledTasksForList(tasks: OrbitTask[], key: string, listId: string | null): OrbitTask[] {
  const createdCutoff = key;
  const filtered = tasks.filter(task => {
    if (listId !== null && task.listId !== listId) return false;
    const createdKey = typeof task.createdAt === 'string' ? task.createdAt.slice(0, 10) : '';
    if (createdKey && createdKey > createdCutoff) return false;
    return isTaskScheduledForDate(task, key);
  });
  return [...new Map(filtered.map(task => [task.id, task])).values()];
}

function calculateDayTotals(data: OrbitData, key: string, listId: string | null): { completed: number; total: number } {
  const scheduled = getScheduledTasksForList(data.tasks, key, listId);
  const completed = scheduled.filter(task => data.completions[key]?.[task.id] === true).length;
  return { completed, total: scheduled.length };
}

function summarizeDates(data: OrbitData, dates: Date[], listId: string | null): PeriodProgress {
  let completed = 0;
  let total = 0;
  for (const date of dates) {
    const day = calculateDayTotals(data, dateKey(date), listId);
    completed += day.completed;
    total += day.total;
  }
  return {
    completed,
    total,
    percent: total ? Math.round(completed / total * 100) : 0
  };
}

function calculateTaskStreaks(task: OrbitTask, completions: OrbitData['completions'], today: Date): { current: number; max: number } {
  const todayKey = dateKey(today);
  const createdKey = typeof task.createdAt === 'string' ? task.createdAt.slice(0, 10) : '';
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let current = 0;

  for (let checked = 0; checked < 366; checked++) {
    const key = dateKey(cursor);
    if (createdKey && key < createdKey) break;
    if (!isTaskScheduledForDate(task, key)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (completions[key]?.[task.id] === true) {
      current++;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (key === todayKey) {
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  // Historical max streak up to 366 days back
  let max = current;
  let running = 0;
  const startCursor = addDays(today, -365);
  for (let offset = 0; offset <= 365; offset++) {
    const day = addDays(startCursor, offset);
    const key = dateKey(day);
    if (createdKey && key < createdKey) continue;
    if (!isTaskScheduledForDate(task, key)) continue;
    if (completions[key]?.[task.id] === true) {
      running++;
      if (running > max) max = running;
    } else if (key !== todayKey) {
      running = 0;
    }
  }

  return { current, max };
}

function calculateMyDayHabitStreaks(data: OrbitData, today: Date): { current: number; max: number } {
  const habitTasks = data.tasks.filter(task => task.listId === 'daily' && task.recurrence?.type !== 'once');
  if (!habitTasks.length) return { current: 0, max: 0 };

  const todayKey = dateKey(today);
  const isDayHabitComplete = (day: Date, key: string): 'complete' | 'skip' | 'incomplete' => {
    const scheduled = habitTasks.filter(task => {
      const createdKey = typeof task.createdAt === 'string' ? task.createdAt.slice(0, 10) : '';
      if (createdKey && createdKey > key) return false;
      return isTaskScheduledForDate(task, key);
    });
    if (!scheduled.length) return 'skip';
    const allDone = scheduled.every(task => data.completions[key]?.[task.id] === true);
    return allDone ? 'complete' : 'incomplete';
  };

  let current = 0;
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let checked = 0; checked < 366; checked++) {
    const key = dateKey(cursor);
    const status = isDayHabitComplete(cursor, key);
    if (status === 'skip') {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (status === 'complete') {
      current++;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (key === todayKey) {
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  let max = current;
  let running = 0;
  const startCursor = addDays(today, -365);
  for (let offset = 0; offset <= 365; offset++) {
    const day = addDays(startCursor, offset);
    const key = dateKey(day);
    const status = isDayHabitComplete(day, key);
    if (status === 'skip') continue;
    if (status === 'complete') {
      running++;
      if (running > max) max = running;
    } else if (key !== todayKey) {
      running = 0;
    }
  }

  return { current, max };
}

export function calculateListDayProgress(data: OrbitData, date: Date, listId: string | null): PeriodProgress {
  return summarizeDates(data, [date], listId);
}

export function calculateProductivityAnalytics(
  data: OrbitData,
  now = new Date(),
  listId: string | null = 'daily'
): ProductivityAnalytics {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daily = summarizeDates(data, [today], listId);

  const weekOffset = (today.getDay() + 6) % 7;
  const weekStart = addDays(today, -weekOffset);
  const weekDates = Array.from({ length: weekOffset + 1 }, (_, index) => addDays(weekStart, index));
  const weekly = summarizeDates(data, weekDates, listId);

  const monthDates = Array.from(
    { length: today.getDate() },
    (_, index) => new Date(today.getFullYear(), today.getMonth(), index + 1)
  );
  const monthly = summarizeDates(data, monthDates, listId);

  // Active Streaks always reflects My Day ('daily') recurring habits
  const activeStreaks = data.tasks
    .filter(task => task.listId === 'daily' && task.recurrence?.type !== 'once')
    .map(task => {
      const { current, max } = calculateTaskStreaks(task, data.completions, today);
      return {
        taskId: task.id,
        title: task.title,
        days: current,
        maxDays: max
      };
    })
    .filter(streak => streak.days > 0 || streak.maxDays > 0)
    .sort((left, right) => right.days - left.days || right.maxDays - left.maxDays || left.title.localeCompare(right.title));

  const myDayStreaks = calculateMyDayHabitStreaks(data, today);

  return {
    daily,
    weekly,
    monthly,
    activeStreaks,
    myDayCurrentStreak: myDayStreaks.current,
    myDayMaxStreak: myDayStreaks.max
  };
}

export { parseDateKey };