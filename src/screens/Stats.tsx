// Stats: weekly km (stacked bars), share per sport (pie), monthly totals, run pace and ride speed trends.
// All from your full history (desktop logs + phone sessions). Kept to one chart per card.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { BackBar, C, Chip, T } from '../ui/kit.tsx';
import Chart from '../ui/Chart.tsx';
import { allRows } from '../lib/history.ts';
import { fmtPace } from '../lib/geo.ts';
import type { HistRow } from '../lib/records.ts';

const COL = { run: C.coral, bike: '#f0f0f0', swim: '#5b8def' } as const;
const two = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

function Legend() {
  return (
    <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
      {(['run', 'bike', 'swim'] as const).map((k) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COL[k] }} />
          <Text style={T.small}>{k === 'run' ? 'Run' : k === 'bike' ? 'Bike' : 'Swim'}</Text>
        </View>
      ))}
    </View>
  );
}

function Bars({ data, width, height = 150 }: { data: { label: string; run: number; bike: number; swim: number }[]; width: number; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.run + d.bike + d.swim));
  const bw = width / data.length;
  return (
    <Svg width={width} height={height + 18}>
      {data.map((d, i) => {
        let y = height;
        const parts = (['bike', 'run', 'swim'] as const).map((k) => {
          const h = (d[k] / max) * (height - 4);
          y -= h;
          return <Rect key={k} x={i * bw + bw * 0.18} y={y} width={bw * 0.64} height={h} rx={2} fill={COL[k]} />;
        });
        return (
          <React.Fragment key={i}>
            {parts}
            <SvgText x={i * bw + bw / 2} y={height + 14} fontSize={9} fill={C.dim} textAnchor="middle">{d.label}</SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function Pie({ run, bike, swim, size = 150 }: { run: number; bike: number; swim: number; size?: number }) {
  const total = run + bike + swim;
  const r = size / 2, cx = r, cy = r;
  if (!total) return <Text style={T.small}>No km in this period.</Text>;
  let a0 = -Math.PI / 2;
  const slices = ([['run', run], ['bike', bike], ['swim', swim]] as const).filter(([, v]) => v > 0).map(([k, v]) => {
    const a1 = a0 + (v / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = v === total
      ? <Circle key={k} cx={cx} cy={cy} r={r} fill={COL[k]} />
      : <Path key={k} d={`M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`} fill={COL[k]} />;
    a0 = a1;
    return p;
  });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <Svg width={size} height={size}>{slices}<Circle cx={cx} cy={cy} r={r * 0.55} fill="#111" /></Svg>
      <View style={{ gap: 6 }}>
        {([['Run', run, COL.run], ['Bike', bike, COL.bike], ['Swim', swim, COL.swim]] as const).map(([l, v, c]) => (
          <Text key={l} style={[T.body, { color: c }]}>{l} {v.toFixed(0)} km <Text style={T.small}>{Math.round((v / total) * 100)}%</Text></Text>
        ))}
        <Text style={T.small}>Total {total.toFixed(0)} km</Text>
      </View>
    </View>
  );
}

export default function Stats({ onBack }: { onBack: () => void }) {
  const { width } = useWindowDimensions();
  const w = width - 72;
  const rows = useMemo(() => allRows(), []);
  const [period, setPeriod] = useState<'month' | 'year' | 'all'>('year');

  const weeks = useMemo(() => {
    const now = new Date();
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return Array.from({ length: 12 }, (_, i) => {
      const s = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - (11 - i) * 7);
      const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      const a = ymd(s), b = ymd(e);
      const t = { label: `${s.getDate()}/${s.getMonth() + 1}`, run: 0, bike: 0, swim: 0 };
      for (const r of rows) if (r.date >= a && r.date <= b) t[r.sport] += r.km;
      return t;
    });
  }, [rows]);

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${two(d.getMonth() + 1)}`;
      const t = { label: d.toLocaleDateString('en-ZA', { month: 'short' }), run: 0, bike: 0, swim: 0 };
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

  const trend = (sport: HistRow['sport']) => rows.filter((r) => r.sport === sport && r.sec && r.km >= 3).slice(-20);
  const runs = trend('run');
  const rides = trend('bike').filter((r) => !r.indoor);
  const runSp = runs.map((r) => r.km / r.sec!); // m/s * 1000 later
  const rideKmh = rides.map((r) => r.km / (r.sec! / 3600));

  const card = { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 16, gap: 6 } as const;

  return (
    <SafeAreaView style={T.screen}>
      <BackBar onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 14, paddingBottom: 40 }}>
        <Text style={T.h1}>Stats</Text>

        <View style={card}>
          <Text style={T.label}>Weekly km · last 12 weeks</Text>
          <Bars data={weeks} width={w} />
          <Legend />
        </View>

        <View style={card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={T.label}>Split by sport</Text>
            <View style={{ flexDirection: 'row' }}>
              {(['month', 'year', 'all'] as const).map((p) => <Chip key={p} label={p === 'month' ? 'Month' : p === 'year' ? 'Year' : 'All'} selected={period === p} onPress={() => setPeriod(p)} />)}
            </View>
          </View>
          <Pie {...share} />
        </View>

        <View style={card}>
          <Text style={T.label}>Monthly km · last 6 months</Text>
          <Bars data={months} width={w} height={120} />
          <Text style={T.small}>This month {(months[5].run + months[5].bike + months[5].swim).toFixed(1)} km · last month {(months[4].run + months[4].bike + months[4].swim).toFixed(1)} km</Text>
        </View>

        {runs.length > 1 ? (
          <View style={card}>
            <Text style={T.label}>Run pace · last {runs.length} runs (3 km+)</Text>
            <Chart xs={runs.map((_, i) => i)} ys={runSp} width={w} height={120}
              yTop={`${fmtPace(Math.max(...runSp) * 1000)} /km`} yBottom={`${fmtPace(Math.min(...runSp) * 1000)} /km`} xLabel={`${runs[0].date.slice(5)} to ${runs[runs.length - 1].date.slice(5)}`} />
          </View>
        ) : null}

        {rides.length > 1 ? (
          <View style={card}>
            <Text style={T.label}>Ride speed · last {rides.length} rides</Text>
            <Chart xs={rides.map((_, i) => i)} ys={rideKmh} width={w} height={120} color="#f0f0f0"
              yTop={`${Math.max(...rideKmh).toFixed(1)} km/h`} yBottom={`${Math.min(...rideKmh).toFixed(1)} km/h`} xLabel={`${rides[0].date.slice(5)} to ${rides[rides.length - 1].date.slice(5)}`} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
