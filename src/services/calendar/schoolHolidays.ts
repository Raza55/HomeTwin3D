/**
 * School holidays per German state. Rheinland-Pfalz ships with the app (works offline),
 * every state is refreshed from the OpenHolidays API (openholidaysapi.org, CORS-enabled)
 * and cached in the browser.
 */

export interface SchoolHoliday {
  /** First day, inclusive. */
  start: string;
  /** Last day, inclusive. */
  end: string;
  name: string;
}

const BUNDLED: Record<string, SchoolHoliday[]> = {
  'DE-RP': [
    ['2024-12-23', '2025-01-08', 'Weihnachtsferien'], ['2025-04-14', '2025-04-25', 'Osterferien'],
    ['2025-07-07', '2025-08-15', 'Sommerferien'], ['2025-10-13', '2025-10-24', 'Herbstferien'],
    ['2025-12-22', '2026-01-07', 'Weihnachtsferien'], ['2026-03-30', '2026-04-10', 'Osterferien'],
    ['2026-06-29', '2026-08-07', 'Sommerferien'], ['2026-10-05', '2026-10-16', 'Herbstferien'],
    ['2026-12-23', '2027-01-08', 'Weihnachtsferien'], ['2027-03-22', '2027-04-02', 'Osterferien'],
    ['2027-06-28', '2027-08-06', 'Sommerferien'], ['2027-10-04', '2027-10-15', 'Herbstferien'],
    ['2027-12-23', '2028-01-07', 'Weihnachtsferien'], ['2028-04-10', '2028-04-21', 'Osterferien'],
    ['2028-07-03', '2028-08-11', 'Sommerferien'], ['2028-10-09', '2028-10-20', 'Herbstferien'],
    ['2028-12-21', '2029-01-08', 'Weihnachtsferien'], ['2029-03-26', '2029-04-06', 'Osterferien'],
    ['2029-07-16', '2029-08-24', 'Sommerferien'], ['2029-10-22', '2029-11-02', 'Herbstferien'],
    ['2029-12-24', '2030-01-09', 'Weihnachtsferien'],
  ].map(([start, end, name]) => ({ start, end, name })),
};

const CACHE_PREFIX = 'calendar.schoolHolidays.';
const REFRESH_MS = 7 * 86400000;

export interface CacheEntry { fetchedAt: number; from: string; to: string; holidays: SchoolHoliday[] }

function readCache(region: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + region);
    return raw ? JSON.parse(raw) as CacheEntry : null;
  } catch {
    return null;
  }
}

/** Fetched data replaces bundled data inside the fetched range; bundled data fills the years around it. */
export function mergeHolidays(bundled: SchoolHoliday[], cache: CacheEntry | null): SchoolHoliday[] {
  if (!cache) return bundled;
  const outside = bundled.filter(h => h.end < cache.from || h.start > cache.to);
  return [...outside, ...cache.holidays].sort((a, b) => a.start.localeCompare(b.start));
}

export function schoolHolidays(region: string): SchoolHoliday[] {
  return mergeHolidays(BUNDLED[region] ?? [], readCache(region));
}

/** Holiday containing the date (YYYY-MM-DD), if any. */
export function schoolHolidayOn(list: SchoolHoliday[], date: string): SchoolHoliday | undefined {
  return list.find(h => h.start <= date && date <= h.end);
}

interface ApiHoliday { startDate: string; endDate: string; name: Array<{ language: string; text: string }> }

/**
 * Fetches last year to next year (the API allows at most 1095 days) when the cache
 * is older than a week. Resolves true when new data arrived.
 */
export async function refreshSchoolHolidays(region: string, now = new Date()): Promise<boolean> {
  const cached = readCache(region);
  if (cached && Date.now() - cached.fetchedAt < REFRESH_MS) return false;
  const year = now.getFullYear();
  const from = `${year - 1}-01-01`, to = `${year + 1}-12-31`;
  const url = `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&subdivisionCode=${encodeURIComponent(region)}`
    + `&languageIsoCode=DE&validFrom=${from}&validTo=${to}`;
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return false;
    const data = await response.json() as ApiHoliday[];
    const seen = new Set<string>();
    const holidays = data.map(h => ({
      start: h.startDate,
      end: h.endDate,
      name: h.name.find(n => n.language === 'DE')?.text ?? h.name[0]?.text ?? 'Ferien',
    })).filter(h => !seen.has(h.start + h.end) && !!seen.add(h.start + h.end));
    const entry: CacheEntry = { fetchedAt: Date.now(), from, to, holidays };
    localStorage.setItem(CACHE_PREFIX + region, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}
