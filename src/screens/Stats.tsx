// Stats: training load, weekly and monthly distance, sport split, pace and speed.
// One chart per card. Tap a bar or point for the exact figures.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { BackBar, C, Chip, T } from '../ui/kit.tsx';
import Chart, { StackedBars, type BarDatum } from '../ui/Chart.tsx';
import { allRows } from '../lib/history.ts';
import { acwrSeries, acwrTone, computeAcwr, type LoadSport } from '../lib/acwr.ts';
import { formatIsoDate } from '../lib/events.ts';
import type { HistRow } from '../lib/records.ts';

const COL = { run: C.coral, bike: '#f0f0f0', swim: '#5b8def' } as const;
const TONE = { ok: C.ok, warn: C.warn, bad: C.bad, dim: C.dim } as const;
const SPORTS = ['run', 'bike', 'swim'] as const;
const two = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
const km1 = (n: number) => `${n.toFixed(1)} km`;
const km2 = (n: number) => `${n.toFixed(2)} km`;
const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const dayLabel = (iso: string) => formatIsoDate(iso, { day: 'numeric', month: 'short' });

function signedKm(d: number): string {
  if (Math.abs(d) < 0.05) return 'same';
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} km`;
}

function CardTitle({ title, period }: { title: string; period: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      <Text style={T.label}>{period}</Text>
    </View>
  );
}

function Empty({ children }: { children: string }) {
  return <Text style={[T.small, { textAlign: 'center', paddingVertical: 28, lineHeight: 18 }]}>{children}</Text>;
}

function SportLegend({ run, bike, swim }: { run: number; bike: number; swim: number }) {
  const total = run + bike + swim;
  const items = [['Run', run, COL.run], ['Bike', bike, COL.bike], ['Swim', swim, COL.swim]] as const;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map(([name, km, color]) => (
        <View key={name} style={{ flex: 1, minWidth: 72 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={T.small}>{name}</Text>
          </View>
          <Text style={[T.num, { fontSize: 15, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>{km1(km)}</Text>
          <Text style={T.small}>{total > 0 ? `${Math.round((km / total) * 100)}%` : '0%'}</Text>
        </View>
      ))}
    </View>
  );
}

function sumParts(d: { run: number; bike: number; swim: number }) {
  return d.run + d.bike + d.swim;
}

function barFrom(label: string, title: string, d: { run: number; bike: number; swim: number }): BarDatum {
  const total = sumParts(d);
  return {
    xLabel: label,
    segments: [
      { label: 'Run', color: COL.run, value: d.run },
      { label: 'Bike', color: COL.bike, value: d.bike },
      { label: 'Swim', color: COL.swim, value: d.swim },
    ],
    calloutTitle: title,
    calloutBody: `Total ${km2(total)}\nRun ${km2(d.run)}\nBike ${km2(d.bike)}\nSwim ${km2(d.swim)}`,
  };
}

function Pie({ run, bike, swim, size = 132 }: { run: number; bike: number; swim: number; size?: number }) {
  const total = run + bike + swim;
  const r = size / 2;
  const cx = r;
  const cy = r;
  if (!total) return <Empty>No distance in this period.</Empty>;
  let a0 = -Math.PI / 2;
  const slices = ([['run', run], ['bike', bike], ['swim', swim]] as const).filter(([, v]) => v > 0).map(([k, v]) => {
    const a1 = a0 + (v / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const node = v === total
      ? <Circle key={k} cx={cx} cy={cy} r={r - 1} fill={COL[k]} />
      : <Path key={k} d={`M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`} fill={COL[k]} />;
    a0 = a1;
    return node;
  });
  return (
    <View style={{ alignItems: 'center', gap: 14 }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>{slices}<Circle cx={cx} cy={cy} r={r * 0.58} fill="#111" /></Svg>
        <Text style={[T.num, { fontSize: 18, maxWidth: size * 0.5 }]} numberOfLines={1} adjustsFontSizeToFit>{total.toFixed(1)}</Text>
        <Text style={T.small}>km</Text>
      </View>
      <View style={{ alignSelf: 'stretch' }}>
        <SportLegend run={run} bike={bike} swim={swim} />
      </View>
    </View>
  );
}

const LOAD: { key: LoadSport; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'run', label: 'Run' },
  { key: 'bike', label: 'Bike' },
  { key: 'swim', label: 'Swim' },
];

const BANDS = [
  { from: 0, to: 0.8, color: 'rgba(255,153,0,0.16)' },
  { from: 0.8, to: 1.3, color: 'rgba(68,221,136,0.14)' },
  { from: 1.3, to: 1.5, color: 'rgba(255,153,0,0.16)' },
  { from: 1.5, to: 99, color: 'rgba(255,68,68,0.18)' },
];

export default function Stats({ onBack }: { onBack: () => void }) {
  const { width } = useWindowDimensions();
  const w = Math.max(220, width - 72);
  const rows = useMemo(() => allRows(), []);
  const [period, setPeriod] = useState<'month' | 'year' | 'all'>('year');
  const [load, setLoad] = useState<LoadSport>('all');
  const [active, setActive] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const now = new Date();
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return Array.from({ length: 12 }, (_, i) => {
      const s = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - (11 - i) * 7);
      const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      const a = ymd(s);
      const b = ymd(e);
      const t = { label: dayLabel(a), title: `Week of ${dayLabel(a)}`, run: 0, bike: 0, swim: 0 };
      for (const r of rows) if (r.date >= a && r.date <= b) t[r.sport] += r.km;
      return t;
    });
  }, [rows]);

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${two(d.getMonth() + 1)}`;
      const showYear = i === 0 || d.getMonth() === 0;
      const mon = d.toLocaleDateString('en-ZA', { month: 'short' });
      const label = showYear ? `${mon} '${String(d.getFullYear()).slice(2)}` : mon;
      const t = { label, title: d.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }), run: 0, bike: 0, swim: 0 };
      for (const r of rows) if (r.date.startsWith(key)) t[r.sport] += r.km;
      return t;
    });
  }, [rows]);

  const share = useMemo(() => {
    const now = new Date();
    const from = period === 'month' ? `${now.getFullYear()}-${two(now.getMonth() + 1)}-01` : period === 'year' ? `${now.getFullYear()}-01-01` : '0000';
    const t = { run: 0, bike: 0, swim: 0 };
    for (const r of rows) if (r.date >= from) t[r.sport] += r.km;
    return t;
  }, [rows, period]);

  const sharePeriod = period === 'month' ? 'This month' : period === 'year' ? 'This year' : 'All time';
  const current = computeAcwr(rows, new Date(), load);
  const series = acwrSeries(rows, 8, new Date(), load);
  const hasLoad = series.some((p) => p.acwr != null);
  const loadPeak = Math.max(2, ...series.map((p) => p.acwr ?? 0));
  const loadMax = loadPeak <= 2 ? 2 : loadPeak <= 2.5 ? 2.5 : Math.ceil(loadPeak);
  const tone = TONE[acwrTone(current.zone)];

  const card = { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 } as const;
  const weekBars = weeks.map((d) => barFrom(d.label, d.title, d));
  const monthBars = months.map((d) => barFrom(d.label, d.title, d));
  const weekHas = weeks.some((d) => sumParts(d) > 0);
  const monthHas = months.some((d) => sumParts(d) > 0);
  const thisWeek = sumParts(weeks[11]);
  const lastWeek = sumParts(weeks[10]);
  const thisMonth = sumParts(months[5]);
  const lastMonth = sumParts(months[4]);

  return (
    <SafeAreaView style={T.screen}>
      <BackBar onBack={onBack} />
      <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 14, paddingBottom: 40 }}>
        <Text style={T.h1}>Stats</Text>
        {!rows.length ? <Text style={[T.small, { lineHeight: 18 }]}>No training logged yet. Charts fill in after a session, or when history is on this phone.</Text> : null}

        <View style={card}>
          <CardTitle title="Training load" period="Last 8 weeks · 7-day km vs the 28-day average" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {LOAD.map((s) => <Chip key={s.key} label={s.label} selected={load === s.key} onPress={() => { setLoad(s.key); setActive(null); }} />)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <Text style={[T.big, { fontSize: 42, color: tone }]}>{current.acwr == null ? '—' : current.acwr.toFixed(2)}</Text>
            <Text style={{ color: tone, fontSize: 16, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{current.label}</Text>
          </View>
          <Text style={T.small}>Last 7 days {km1(current.k7)} · last 28 days {km1(current.k28)}</Text>
          {hasLoad ? (
            <Chart
              key={load}
              id={`acwr-${load}`}
              active={active}
              onActive={setActive}
              width={w}
              height={150}
              unit="ACWR"
              color={C.coral}
              minSlot={48}
              showPointLabels
              bands={BANDS}
              yDomain={{ min: 0, max: loadMax, ticks: [0, 0.8, 1.3, 1.5, loadMax].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b) }}
              yFormat={(v) => v.toFixed(1)}
              points={series.map((p) => ({
                y: p.acwr,
                xLabel: p.label,
                valueLabel: p.acwr == null ? undefined : p.acwr.toFixed(2),
                calloutTitle: `Week ending ${p.label}`,
                calloutBody: p.acwr == null
                  ? 'No sessions in the 28 days before this week.'
                  : `${p.acwr.toFixed(2)} · ${p.zoneLabel}\n7 days ${km1(p.k7)} · 28 days ${km1(p.k28)}`,
              }))}
            />
          ) : <Empty>No sessions in the last 28 days, so there is no load ratio yet.</Empty>}
          <Text style={[T.small, { lineHeight: 18 }]}>Green 0.80–1.29 safe · orange under 0.80 or 1.30–1.49 · red 1.50 and above</Text>
        </View>

        <View style={card}>
          <CardTitle title="Weekly distance" period="Last 12 weeks" />
          {weekHas ? (
            <>
              <StackedBars id="weeks" active={active} onActive={setActive} bars={weekBars} width={w} height={150} />
              <SportLegend run={weeks.reduce((s, d) => s + d.run, 0)} bike={weeks.reduce((s, d) => s + d.bike, 0)} swim={weeks.reduce((s, d) => s + d.swim, 0)} />
              <Text style={{ color: C.text, fontSize: 13, lineHeight: 18 }}>
                This week {km1(thisWeek)} so far · last week {km1(lastWeek)} · {signedKm(thisWeek - lastWeek)}
              </Text>
            </>
          ) : <Empty>No distance in the last 12 weeks.</Empty>}
        </View>

        <View style={card}>
          <View style={{ gap: 8 }}>
            <CardTitle title="Distance by sport" period={sharePeriod} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {(['month', 'year', 'all'] as const).map((p) => (
                <Chip key={p} label={p === 'month' ? 'This month' : p === 'year' ? 'This year' : 'All time'} selected={period === p} onPress={() => setPeriod(p)} />
              ))}
            </View>
          </View>
          <Pie {...share} />
        </View>

        <View style={card}>
          <CardTitle title="Monthly distance" period="Last 6 months" />
          {monthHas ? (
            <>
              <StackedBars id="months" active={active} onActive={setActive} bars={monthBars} width={w} height={140} />
              <SportLegend run={months.reduce((s, d) => s + d.run, 0)} bike={months.reduce((s, d) => s + d.bike, 0)} swim={months.reduce((s, d) => s + d.swim, 0)} />
              <Text style={{ color: C.text, fontSize: 13, lineHeight: 18 }}>
                This month {km1(thisMonth)} so far · last month {km1(lastMonth)} · {signedKm(thisMonth - lastMonth)}
              </Text>
            </>
          ) : <Empty>No distance in the last 6 months.</Empty>}
        </View>

        <Trend rows={rows} sport="run" width={w} active={active} onActive={setActive} card={card} />
        <Trend rows={rows} sport="bike" width={w} active={active} onActive={setActive} card={card} />
        <Trend rows={rows} sport="swim" width={w} active={active} onActive={setActive} card={card} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Trend({
  rows, sport, width, active, onActive, card,
}: {
  rows: HistRow[]; sport: HistRow['sport']; width: number;
  active: string | null; onActive: (id: string | null) => void;
  card: { backgroundColor: string; borderRadius: number; borderWidth: number; borderColor: string; padding: number; gap: number };
}) {
  const minKm = sport === 'swim' ? 0.2 : 3;
  const list = rows.filter((r) => r.sport === sport && r.sec && r.sec > 0 && r.km >= minKm && (sport !== 'bike' || !r.indoor)).slice(-20);
  const any = rows.some((r) => r.sport === sport);
  if (!any) return null;
  const noun = sport === 'run' ? 'runs' : sport === 'bike' ? 'outdoor rides' : 'swims';
  const title = sport === 'run' ? 'Run pace' : sport === 'bike' ? 'Ride speed' : 'Swim pace';
  const unit = sport === 'bike' ? 'km/h' : sport === 'swim' ? 'min/100m' : 'min/km';
  const perM = sport === 'swim' ? 100 : 1000;
  const need = sport === 'swim' ? '200 m' : sport === 'bike' ? '1 km' : '3 km';

  if (list.length < 2) {
    return (
      <View style={card}>
        <CardTitle title={title} period={`Last ${noun} of ${need} or more`} />
        <Empty>{list.length === 1 ? `One session so far. The trend starts with the second.` : `Nothing of ${need} or more yet.`}</Empty>
      </View>
    );
  }

  const paceSec = (r: HistRow) => (r.sec! / r.km) * (perM / 1000);
  const speed = (r: HistRow) => r.km / (r.sec! / 3600);
  const latest = list[list.length - 1];
  const prev = list[list.length - 2];
  let comparison = '';
  if (sport === 'bike') {
    const d = speed(latest) - speed(prev);
    const delta = Math.abs(d) < 0.05 ? 'same as the one before' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} km/h vs the one before`;
    comparison = `Latest ${speed(latest).toFixed(1)} km/h · previous ${speed(prev).toFixed(1)} km/h · ${delta}`;
  } else {
    const d = Math.round(paceSec(latest) - paceSec(prev));
    const delta = d === 0 ? 'same as the one before' : d < 0 ? `${-d} s faster than the one before` : `${d} s slower than the one before`;
    comparison = `Latest ${clock(paceSec(latest))} ${unit} · previous ${clock(paceSec(prev))} · ${delta}`;
  }

  return (
    <View style={card}>
      <CardTitle title={title} period={`Last ${list.length} ${noun} · ${dayLabel(list[0].date)} to ${dayLabel(list[list.length - 1].date)}`} />
      {sport !== 'bike' ? <Text style={T.small}>Higher on the chart is faster.</Text> : null}
      <Chart
        id={`trend-${sport}`}
        active={active}
        onActive={onActive}
        width={width}
        height={140}
        unit={unit}
        color={sport === 'bike' ? '#f0f0f0' : sport === 'swim' ? COL.swim : C.coral}
        fill
        reverse={sport !== 'bike'}
        showPointLabels
        minSlot={52}
        yFormat={sport === 'bike' ? (v) => v.toFixed(0) : (v) => clock(v)}
        points={list.map((r) => {
          const y = sport === 'bike' ? speed(r) : paceSec(r);
          const value = sport === 'bike' ? `${speed(r).toFixed(1)}` : clock(paceSec(r));
          return {
            y,
            xLabel: dayLabel(r.date),
            valueLabel: value,
            calloutTitle: dayLabel(r.date),
            calloutBody: sport === 'bike'
              ? `${speed(r).toFixed(1)} km/h · ${km2(r.km)}`
              : `${clock(paceSec(r))} ${unit} · ${sport === 'swim' ? `${Math.round(r.km * 1000)} m` : km2(r.km)}`,
          };
        })}
      />
      <Text style={{ color: C.text, fontSize: 13, lineHeight: 18 }}>{comparison}</Text>
    </View>
  );
}
