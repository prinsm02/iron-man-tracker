// Matthew's race calendar (same list as Running Dashboard Pro). Used for the "Next race" countdown.
export const RACES = [
  { name: 'Soweto Marathon', date: '2026-11-29' },
  { name: 'IM 70.3 Nelson Mandela Bay', date: '2027-01-31' },
  { name: 'Two Oceans Ultra', date: '2027-04-04' },
  { name: 'Ironman SA Mossel Bay', date: '2027-04-18' },
  { name: 'IM 70.3 Durban', date: '2027-06-06' },
  { name: 'Comrades Marathon', date: '2027-06-13' },
];

export function nextRace(now = new Date()): { name: string; days: number } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const r of RACES) {
    const [y, m, d] = r.date.split('-').map(Number);
    const days = Math.round((new Date(y, m - 1, d).getTime() - today) / 86400000);
    if (days >= 0) return { name: r.name, days };
  }
  return null;
}
