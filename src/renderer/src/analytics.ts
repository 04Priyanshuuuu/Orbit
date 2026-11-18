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
};

export type ProductivityAnalytics = {
  daily: PeriodProgress;
  weekly: PeriodProgress;
  monthly: PeriodProgress;
  activeStreaks: TaskStreak[];
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

function calculateTaskStreak(task: OrbitTask, completions: OrbitData['completions'], today: Date): number {
  const todayKey = dateKey(today);
  const createdKey = typeof task.createdAt === 'string' ? task.createdAt.slice(0, 10) : '';
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let streak = 0;

  for (let checked = 0; checked < 366; checked++) {
    const key = dateKey(cursor);
    if (createdKey && key < createdKey) break;
    if (!isTaskScheduledForDate(task, key)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (completions[key]?.[task.id] === true) {
      streak++;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (key === todayKey) {
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  return streak;
}

export function calculateListDayProgress(data: OrbitData, date: Date, listId: string | null): PeriodProgress {
  return summarizeDates(data, [date], listId);
}

/**
 * listId:
 * - string (e.g. 'daily' or custom list id) => calculates progress only for that list
 * - null => calculates overall combined progress across ALL lists
 */
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

  const activeStreaks = data.tasks
    .filter(task => (listId === null || task.listId === listId) && task.recurrence?.type !== 'once')
    .map(task => ({
      taskId: task.id,
      title: task.title,
      days: calculateTaskStreak(task, data.completions, today)
    }))
    .filter(streak => streak.days > 0)
    .sort((left, right) => right.days - left.days || left.title.localeCompare(right.title));

  return { daily, weekly, monthly, activeStreaks };
}

export { parseDateKey };