type Progress = { completed: number; total: number; percent: number };

export type ProductivityAnalytics = {
  daily: Progress;
  weekly: Progress;
  monthly: Progress;
  currentStreak: number;
  bestStreak: number;
  activeStreaks: { taskId: string; title: string; days: number }[];
  monthlyConsistency: number;
  activeDaysThisMonth: number;
  daysElapsedThisMonth: number;
};

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const daysBetween = (start: Date, end: Date) =>
  Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000);

function progress(completed: number, total: number): Progress {
  return {
    completed,
    total,
    percent: total ? Math.min(100, Math.round(completed / total * 100)) : 0
  };
}

export function calculateProductivityAnalytics(
  data: Pick<OrbitData, 'tasks' | 'completions' | 'history'>,
  now = new Date()
): ProductivityAnalytics {
  const todayKey = dateKey(now);
  const todayTasks = [...new Map(data.tasks
    .filter(task => task.daily || task.date === todayKey || (!task.daily && !task.date))
    .map(task => [task.id, task])).values()];
  const todayCompletions = data.completions[todayKey] ?? {};
  const daily = progress(
    todayTasks.filter(task => todayCompletions[task.id] === true).length,
    todayTasks.length
  );

  const dayProgress = (key: string) => {
    if (key === todayKey) return daily;
    const snapshot = data.history[key];
    if (snapshot) {
      if (snapshot.taskIds) {
        const completed = snapshot.taskIds.filter(id => data.completions[key]?.[id] === true).length;
        return progress(completed, snapshot.taskIds.length);
      }
      return progress(snapshot.completedTasks, snapshot.totalTasks);
    }
    return progress(0, 0);
  };

  const sumPeriod = (keys: string[]) => {
    const totals = keys.reduce((sum, key) => {
      const day = dayProgress(key);
      return { completed: sum.completed + day.completed, total: sum.total + day.total };
    }, { completed: 0, total: 0 });
    return progress(totals.completed, totals.total);
  };

  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceMonday = (now.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);
  const weekKeys = Array.from({ length: daysSinceMonday + 1 }, (_, index) => {
    const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
    return dateKey(date);
  });
  const monthKeys = Array.from({ length: now.getDate() }, (_, index) =>
    dateKey(new Date(now.getFullYear(), now.getMonth(), index + 1))
  );

  const activeKeys = new Set([
    ...Object.keys(data.history).filter(key => data.history[key].completedTasks > 0),
    ...Object.keys(data.completions).filter(key =>
      Object.values(data.completions[key] ?? {}).some(Boolean)
    )
  ]);
  const isActive = (key: string) => activeKeys.has(key);

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  let streakEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!isActive(todayKey)) {
    if (!isActive(dateKey(yesterday))) streakEnd = new Date(NaN);
    else streakEnd = yesterday;
  }
  let currentStreak = 0;
  while (Number.isFinite(streakEnd.getTime()) && isActive(dateKey(streakEnd))) {
    currentStreak += 1;
    streakEnd.setDate(streakEnd.getDate() - 1);
  }

  let bestStreak = 0;
  let run = 0;
  const sortedActiveDates = [...activeKeys].filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key)).sort();
  let previousDate: Date | null = null;
  for (const key of sortedActiveDates) {
    const currentDate = new Date(`${key}T00:00:00`);
    run = previousDate && daysBetween(previousDate, currentDate) === 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previousDate = currentDate;
  }

  const activeDaysThisMonth = monthKeys.filter(isActive).length;
  const activeStreaks = [...new Map(data.tasks.filter(task => task.daily)
    .map(task => [task.id, task])).values()]
    .map(task => {
      const completedDates = new Set(Object.keys(data.completions).filter(key =>
        data.completions[key]?.[task.id] === true
      ));
      let end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (!completedDates.has(dateKey(end))) {
        end.setDate(end.getDate() - 1);
      }
      let days = 0;
      while (completedDates.has(dateKey(end))) {
        days += 1;
        end.setDate(end.getDate() - 1);
      }
      return { taskId: task.id, title: task.title, days };
    })
    .filter(streak => streak.days > 0)
    .sort((a, b) => b.days - a.days);

  return {
    daily,
    weekly: sumPeriod(weekKeys),
    monthly: sumPeriod(monthKeys),
    currentStreak,
    bestStreak,
    activeStreaks,
    monthlyConsistency: Math.round(activeDaysThisMonth / now.getDate() * 100),
    activeDaysThisMonth,
    daysElapsedThisMonth: now.getDate()
  };
}
