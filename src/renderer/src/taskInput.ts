export function parseTaskInput(input: string) {
  const timed = input.trim().match(/^(.*?)(?:\s+)(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (timed && Number(timed[2]) >= 1 && Number(timed[2]) <= 12) {
    let hours = Number(timed[2]) % 12;
    if (timed[4].toLowerCase() === 'pm') hours += 12;
    return { title: timed[1].trim(), time: `${String(hours).padStart(2, '0')}:${timed[3] ?? '00'}` };
  }
  const twentyFourHour = input.trim().match(/^(.*?)(?:\s+)([01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHour) {
    return {
      title: twentyFourHour[1].trim(),
      time: `${String(Number(twentyFourHour[2])).padStart(2, '0')}:${twentyFourHour[3]}`
    };
  }
  return { title: input.trim(), time: '' };
}

function getMinutes(value: string): number | null {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function isValidTimeRange(startTime: string, endTime: string): boolean {
  const start = getMinutes(startTime);
  const end = getMinutes(endTime);
  return start !== null && end !== null && end > start;
}

export function formatTaskTime(value: string): string {
  const minutes = getMinutes(value);
  if (minutes === null) return value;
  const hour24 = Math.floor(minutes / 60);
  const hour12 = hour24 % 12 || 12;
  const minute = minutes % 60;
  const suffix = hour24 < 12 ? 'am' : 'pm';
  return `${hour12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${suffix}`;
}

export function formatTimeRange(startTime: string, endTime: string): string {
  if (!isValidTimeRange(startTime, endTime)) return '';
  return `${formatTaskTime(startTime)}-${formatTaskTime(endTime)}`;
}

export function isTaskScheduledForDate(task: OrbitTask, date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const recurrence = task.recurrence;
  if (recurrence?.type === 'once') return recurrence.date === date;
  if (recurrence?.type === 'daily') return true;
  if (recurrence?.type === 'weekly') {
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(year, month - 1, day).getDay();
    return recurrence.days.includes(weekday);
  }

  if (task.daily) return true;
  if (task.date) return task.date === date;
  if (!task.createdAt) return false;
  return task.createdAt.slice(0, 10) === date;
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function formatRecurrence(recurrence: TaskRecurrence): string {
  if (recurrence.type === 'once') return 'Only today';
  if (recurrence.type === 'daily') return 'Daily';
  const isWeekdays = recurrence.days.length === 5 &&
    [1, 2, 3, 4, 5].every(day => recurrence.days.includes(day));
  const isWeekends = recurrence.days.length === 2 &&
    [0, 6].every(day => recurrence.days.includes(day));
  if (isWeekdays) return 'Weekdays';
  if (isWeekends) return 'Weekends';
  const sorted = [...new Set(recurrence.days)].sort(
    (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b)
  );
  return sorted.length
    ? sorted.map(day => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ')
    : 'Select days';
}