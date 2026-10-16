import { addDays, addMonths, compareAsc, getDay, isBefore, startOfDay, subDays } from 'date-fns';
export type NonWorkingDay = { date: string; title?: string };
export type PaydayPeriod = { start: Date; end: Date; paydayStart: Date; paydayEnd: Date };
const asDate = (year: number, month: number, day: number) => new Date(year, month, day);
export const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function getPaydayForMonthDate(year: number, month: number, day: number, nonWorkingDays: NonWorkingDay[] = []): Date {
  let result = asDate(year, month, day); const blocked = new Set(nonWorkingDays.map((item) => item.date));
  while (getDay(result) === 0 || getDay(result) === 6 || blocked.has(formatDate(result))) result = subDays(result, 1);
  return startOfDay(result);
}
export function getNextPayday(from: Date, nonWorkingDays: NonWorkingDay[] = []): Date {
  const base = startOfDay(from);
  for (let offset = 0; offset < 24; offset += 1) { const date = addMonths(base, offset - 1); const candidates = [getPaydayForMonthDate(date.getFullYear(), date.getMonth(), 5, nonWorkingDays), getPaydayForMonthDate(date.getFullYear(), date.getMonth(), 20, nonWorkingDays)]; const found = candidates.find((candidate) => isBefore(base, candidate)); if (found) return found; }
  throw new Error('Не удалось вычислить дату выплаты');
}
export function getPreviousPayday(from: Date, nonWorkingDays: NonWorkingDay[] = []): Date {
  const base = startOfDay(from);
  for (let offset = 0; offset < 24; offset += 1) { const date = addMonths(base, -offset); const candidates = [getPaydayForMonthDate(date.getFullYear(), date.getMonth(), 5, nonWorkingDays), getPaydayForMonthDate(date.getFullYear(), date.getMonth(), 20, nonWorkingDays)].sort(compareAsc).reverse(); const found = candidates.find((candidate) => isBefore(candidate, base)); if (found) return found; }
  throw new Error('Не удалось вычислить дату выплаты');
}
export function getCurrentPeriod(date: Date, nonWorkingDays: NonWorkingDay[] = []): PaydayPeriod { const start = getPreviousPayday(addDays(date, 1), nonWorkingDays); const end = getNextPayday(start, nonWorkingDays); return { start, end: subDays(end, 1), paydayStart: start, paydayEnd: end }; }
export function getUpcomingPeriods(from: Date, count: number, nonWorkingDays: NonWorkingDay[] = []): PaydayPeriod[] { const result: PaydayPeriod[] = []; let cursor = getCurrentPeriod(from, nonWorkingDays).paydayStart; for (let index = 0; index < count; index += 1) { const end = getNextPayday(cursor, nonWorkingDays); result.push({ start: cursor, end: subDays(end, 1), paydayStart: cursor, paydayEnd: end }); cursor = end; } return result; }
export function getPeriodsRange(from: Date, to: Date, nonWorkingDays: NonWorkingDay[] = []): PaydayPeriod[] { return getUpcomingPeriods(from, 100, nonWorkingDays).filter((period) => !isBefore(period.paydayStart, from) && !isBefore(to, period.paydayStart)); }
