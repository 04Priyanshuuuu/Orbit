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
