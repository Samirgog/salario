import { describe, expect, it } from 'vitest';
import { formatDate, getPaydayForMonthDate, getUpcomingPeriods } from './payday';
describe('payday', () => {
  it('moves weekend to Friday', () => { expect(formatDate(getPaydayForMonthDate(2025, 0, 5))).toBe('2025-01-03'); });
  it('moves configured holidays backward', () => { expect(formatDate(getPaydayForMonthDate(2025, 0, 20, [{ date: '2025-01-20' }]))).toBe('2025-01-17'); });
  it('builds a gapless chain', () => { const periods = getUpcomingPeriods(new Date(2025, 0, 1), 8); expect(periods).toHaveLength(8); periods.slice(1).forEach((period, i) => expect(period.paydayStart).toEqual(periods[i].paydayEnd)); });
});
