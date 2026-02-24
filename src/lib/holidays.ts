// Multi-country public holidays with auto-detection
export interface Holiday {
  name: string;
  date: string; // MM-DD format for fixed dates
  type: 'federal' | 'observance';
}

export type CountryCode = 'US' | 'IN' | 'GB' | 'CA' | 'AU';

// Detect user country from browser locale/timezone
export function detectUserCountry(): CountryCode {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith('Asia/Kolkata') || tz.startsWith('Asia/Calcutta') || tz.startsWith('Asia/Colombo')) return 'IN';
    if (tz.startsWith('Europe/London') || tz.startsWith('Europe/Belfast')) return 'GB';
    if (tz.startsWith('America/Toronto') || tz.startsWith('America/Vancouver') || tz.startsWith('America/Edmonton') || tz.startsWith('America/Winnipeg') || tz.startsWith('America/Halifax')) return 'CA';
    if (tz.startsWith('Australia/')) return 'AU';
    if (tz.startsWith('America/')) return 'US';

    const locale = navigator.language || 'en-US';
    const parts = locale.split('-');
    const country = (parts[1] || parts[0]).toUpperCase();
    if (['IN', 'GB', 'CA', 'AU'].includes(country)) return country as CountryCode;
  } catch {
    // fallback
  }
  return 'US';
}

// Fixed-date holidays per country
const fixedHolidaysByCountry: Record<CountryCode, Holiday[]> = {
  US: [
    { name: "New Year's Day", date: "01-01", type: "federal" },
    { name: "Valentine's Day", date: "02-14", type: "observance" },
    { name: "St. Patrick's Day", date: "03-17", type: "observance" },
    { name: "Independence Day", date: "07-04", type: "federal" },
    { name: "Halloween", date: "10-31", type: "observance" },
    { name: "Veterans Day", date: "11-11", type: "federal" },
    { name: "Christmas Eve", date: "12-24", type: "observance" },
    { name: "Christmas Day", date: "12-25", type: "federal" },
    { name: "New Year's Eve", date: "12-31", type: "observance" },
  ],
  IN: [
    { name: "New Year's Day", date: "01-01", type: "observance" },
    { name: "Republic Day", date: "01-26", type: "federal" },
    { name: "Maha Shivaratri", date: "02-26", type: "observance" },
    { name: "Holi", date: "03-14", type: "federal" },
    { name: "Good Friday", date: "03-29", type: "federal" },
    { name: "Eid ul-Fitr", date: "04-11", type: "federal" },
    { name: "Dr. Ambedkar Jayanti", date: "04-14", type: "federal" },
    { name: "Ram Navami", date: "04-17", type: "federal" },
    { name: "Mahavir Jayanti", date: "04-21", type: "federal" },
    { name: "Labour Day", date: "05-01", type: "observance" },
    { name: "Buddha Purnima", date: "05-12", type: "federal" },
    { name: "Eid ul-Adha", date: "06-17", type: "federal" },
    { name: "Muharram", date: "07-17", type: "federal" },
    { name: "Independence Day", date: "08-15", type: "federal" },
    { name: "Janmashtami", date: "08-26", type: "federal" },
    { name: "Milad un-Nabi", date: "09-16", type: "federal" },
    { name: "Mahatma Gandhi Jayanti", date: "10-02", type: "federal" },
    { name: "Dussehra", date: "10-12", type: "federal" },
    { name: "Diwali", date: "11-01", type: "federal" },
    { name: "Guru Nanak Jayanti", date: "11-15", type: "federal" },
    { name: "Christmas Day", date: "12-25", type: "federal" },
  ],
  GB: [
    { name: "New Year's Day", date: "01-01", type: "federal" },
    { name: "St. Patrick's Day", date: "03-17", type: "observance" },
    { name: "Christmas Day", date: "12-25", type: "federal" },
    { name: "Boxing Day", date: "12-26", type: "federal" },
    { name: "New Year's Eve", date: "12-31", type: "observance" },
  ],
  CA: [
    { name: "New Year's Day", date: "01-01", type: "federal" },
    { name: "Canada Day", date: "07-01", type: "federal" },
    { name: "Remembrance Day", date: "11-11", type: "federal" },
    { name: "Christmas Day", date: "12-25", type: "federal" },
    { name: "Boxing Day", date: "12-26", type: "federal" },
  ],
  AU: [
    { name: "New Year's Day", date: "01-01", type: "federal" },
    { name: "Australia Day", date: "01-26", type: "federal" },
    { name: "Anzac Day", date: "04-25", type: "federal" },
    { name: "Christmas Day", date: "12-25", type: "federal" },
    { name: "Boxing Day", date: "12-26", type: "federal" },
  ],
};

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  let dayOffset = weekday - firstWeekday;
  if (dayOffset < 0) dayOffset += 7;
  const day = 1 + dayOffset + (n - 1) * 7;
  return new Date(year, month, day);
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const lastWeekday = lastDay.getDay();
  let dayOffset = lastWeekday - weekday;
  if (dayOffset < 0) dayOffset += 7;
  return new Date(year, month, lastDay.getDate() - dayOffset);
}

function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

// Get dynamic holidays for US (calculated dates)
function getUSDynamicHolidays(year: number): { date: Date; name: string; type: 'federal' | 'observance' }[] {
  const holidays: { date: Date; name: string; type: 'federal' | 'observance' }[] = [];
  
  holidays.push({ date: getNthWeekdayOfMonth(year, 0, 1, 3), name: "Martin Luther King Jr. Day", type: "federal" });
  holidays.push({ date: getNthWeekdayOfMonth(year, 1, 1, 3), name: "Presidents' Day", type: "federal" });
  
  const easter = getEasterSunday(year);
  holidays.push({ date: easter, name: "Easter Sunday", type: "observance" });
  holidays.push({ date: new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000), name: "Good Friday", type: "observance" });
  
  holidays.push({ date: getNthWeekdayOfMonth(year, 4, 0, 2), name: "Mother's Day", type: "observance" });
  holidays.push({ date: getLastWeekdayOfMonth(year, 4, 1), name: "Memorial Day", type: "federal" });
  holidays.push({ date: getNthWeekdayOfMonth(year, 5, 0, 3), name: "Father's Day", type: "observance" });
  holidays.push({ date: getNthWeekdayOfMonth(year, 8, 1, 1), name: "Labor Day", type: "federal" });
  holidays.push({ date: getNthWeekdayOfMonth(year, 9, 1, 2), name: "Columbus Day", type: "federal" });
  
  const thanksgiving = getNthWeekdayOfMonth(year, 10, 4, 4);
  holidays.push({ date: thanksgiving, name: "Thanksgiving", type: "federal" });
  holidays.push({ date: new Date(thanksgiving.getTime() + 24 * 60 * 60 * 1000), name: "Black Friday", type: "observance" });
  
  return holidays;
}

function getGBDynamicHolidays(year: number): { date: Date; name: string; type: 'federal' | 'observance' }[] {
  const easter = getEasterSunday(year);
  return [
    { date: new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000), name: "Good Friday", type: "federal" },
    { date: new Date(easter.getTime() + 24 * 60 * 60 * 1000), name: "Easter Monday", type: "federal" },
    { date: getNthWeekdayOfMonth(year, 4, 1, 1), name: "Early May Bank Holiday", type: "federal" },
    { date: getLastWeekdayOfMonth(year, 4, 1), name: "Spring Bank Holiday", type: "federal" },
    { date: getLastWeekdayOfMonth(year, 7, 1), name: "Summer Bank Holiday", type: "federal" },
  ];
}

function getCADynamicHolidays(year: number): { date: Date; name: string; type: 'federal' | 'observance' }[] {
  const easter = getEasterSunday(year);
  return [
    { date: new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000), name: "Good Friday", type: "federal" },
    { date: new Date(easter.getTime() + 24 * 60 * 60 * 1000), name: "Easter Monday", type: "federal" },
    { date: getNthWeekdayOfMonth(year, 4, 1, 1) < new Date(year, 4, 25) ? getLastWeekdayOfMonth(year, 4, 1) : getNthWeekdayOfMonth(year, 4, 1, 1), name: "Victoria Day", type: "federal" },
    { date: getNthWeekdayOfMonth(year, 8, 1, 1), name: "Labour Day", type: "federal" },
    { date: getNthWeekdayOfMonth(year, 9, 1, 2), name: "Thanksgiving", type: "federal" },
  ];
}

export function getHolidaysForYear(year: number, country?: CountryCode): { date: Date; name: string; type: 'federal' | 'observance' }[] {
  const cc = country || detectUserCountry();
  const holidays: { date: Date; name: string; type: 'federal' | 'observance' }[] = [];

  // Add fixed holidays
  const fixed = fixedHolidaysByCountry[cc] || fixedHolidaysByCountry.US;
  fixed.forEach((h) => {
    const [month, day] = h.date.split("-").map(Number);
    holidays.push({ date: new Date(year, month - 1, day), name: h.name, type: h.type });
  });

  // Add dynamic holidays
  switch (cc) {
    case 'US': holidays.push(...getUSDynamicHolidays(year)); break;
    case 'GB': holidays.push(...getGBDynamicHolidays(year)); break;
    case 'CA': holidays.push(...getCADynamicHolidays(year)); break;
    // IN and AU have mostly fixed-date holidays
  }

  return holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function getHolidayForDate(date: Date, country?: CountryCode): { name: string; type: 'federal' | 'observance' } | null {
  const year = date.getFullYear();
  const holidays = getHolidaysForYear(year, country);
  const holiday = holidays.find(
    (h) => h.date.getFullYear() === date.getFullYear() && h.date.getMonth() === date.getMonth() && h.date.getDate() === date.getDate()
  );
  return holiday ? { name: holiday.name, type: holiday.type } : null;
}

export function getCountryName(code: CountryCode): string {
  const names: Record<CountryCode, string> = {
    US: 'United States',
    IN: 'India',
    GB: 'United Kingdom',
    CA: 'Canada',
    AU: 'Australia',
  };
  return names[code];
}
