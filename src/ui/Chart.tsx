// Category charts in the dashboard style: grey ticks, faint grid, coral or white series.
// Tap a bar or point for a shiny dot and the exact values. Tap the axis to clear.
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { C, T } from './kit.tsx';

const GUTTER = 44;
const RIGHT = 14;
const TOP = 22;
const BOTTOM = 22;
const GRID = '#2a2a2a';

export type ChartPoint = {
  y: number | null;
  xLabel: string;
  valueLabel?: string;
  calloutTitle: string;
  calloutBody: string;
};

export type BarSegment = { label: string; color: string; value: number };
export type BarDatum = {
  xLabel: string;
  segments: BarSegment[];
  calloutTitle: string;
  calloutBody: string;
};

type Domain = { min: number; max: number; ticks: number[] };
type ActiveProps = { id?: string; active?: string | null; onActive?: (id: string | null) => void };

function usePick(id: string, active: string | null | undefined, onActive?: (id: string | null) => void) {
  const [index, setIndex] = useState<number | null>(null);
  const shown = active === undefined || active === id ? index : null;
  const pick = (i: number) => {
    if (shown === i) {
      setIndex(null);
      onActive?.(null);
      return;
    }
    setIndex(i);
    onActive?.(id);
  };
  const clear = () => {
    setIndex(null);
    onActive?.(null);
  };
  return { shown, pick, clear };
}

function frame(width: number, n: number, minSlot: number) {
  const inner = Math.max(1, width - GUTTER - RIGHT);
  const slot = n > 0 ? Math.max(minSlot, inner / n) : inner;
  const plotW = n > 0 ? slot * n : inner;
  const contentW = GUTTER + plotW + RIGHT;
  return { slot, plotW, contentW };
}

function roundTick(v: number, step: number): number {
  const places = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return Number(v.toFixed(places));
}

function domainFrom(values: number[]): Domain {
  const ys = values.filter((v) => Number.isFinite(v));
  if (!ys.length) return { min: 0, max: 1, ticks: [0, 1] };
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  } else {
    const pad = (hi - lo) * 0.1;
    lo -= pad;
    hi += pad;
  }
  if (ys.every((v) => v >= 0)) lo = Math.max(0, lo);
  const step0 = (hi - lo) / 4 || 1;
  const exp = 10 ** Math.floor(Math.log10(step0));
  const n = step0 / exp;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  const step = nice * exp || 1;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil((hi - start) / step) * step + start;
  const ticks: number[] = [];
  for (let v = start, i = 0; v <= end + step * 0.001 && i < 8; v += step, i++) ticks.push(roundTick(v, step));
  return { min: ticks[0] ?? 0, max: ticks[ticks.length - 1] ?? 1, ticks };
}

function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const exp = Math.floor(Math.log10(v));
  const pow = 10 ** exp;
  const n = v / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function barDomain(maxValue: number): Domain {
  const max = niceMax(maxValue);
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((max * i) / 4 * 100) / 100);
  return { min: 0, max, ticks };
}

function defaultFormat(v: number): string {
  if (!Number.isFinite(v)) return '';
  if (Math.abs(v) >= 100) return String(Math.round(v));
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function labelIndexes(n: number, every: boolean): number[] {
  if (n <= 0) return [];
  if (every || n <= 6) return Array.from({ length: n }, (_, i) => i);
  const set = new Set<number>([0, n - 1]);
  const gaps = 4;
  for (let i = 1; i < gaps; i++) set.add(Math.round((i * (n - 1)) / gaps));
  return [...set].sort((a, b) => a - b);
}

function Callout({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ marginTop: 10, backgroundColor: '#111', borderRadius: 10, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3, borderLeftColor: C.coral, paddingHorizontal: 12, paddingVertical: 10 }}>
      <Text style={T.label}>{title}</Text>
      <Text style={{ color: C.text, fontSize: 15, lineHeight: 22, marginTop: 4 }}>{body}</Text>
    </View>
  );
}

function Shell({
  width, contentW, svgH, plotW, plotH, slot, n, scroll, onPick, onClear, callout, children,
}: {
  width: number; contentW: number; svgH: number; plotW: number; plotH: number; slot: number; n: number;
  scroll: boolean; onPick: (i: number) => void; onClear: () => void; callout: React.ReactNode; children: React.ReactNode;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  const scrolling = scroll && contentW > width + 1;
  return (
    <View>
      <ScrollView
        ref={ref}
        horizontal
        scrollEnabled={scrolling}
        showsHorizontalScrollIndicator={false}
        style={{ width }}
        nestedScrollEnabled
        onContentSizeChange={() => { if (scrolling) ref.current?.scrollToEnd({ animated: false }); }}
      >
        <View style={{ width: contentW, height: svgH }}>
          <Svg width={contentW} height={svgH} pointerEvents="none">{children}</Svg>
          <Pressable accessibilityLabel="Clear selection" style={{ position: 'absolute', left: 0, top: 0, width: GUTTER, height: svgH }} onPress={onClear} />
          <Pressable style={{ position: 'absolute', left: GUTTER, top: 0, width: plotW, height: TOP }} onPress={onClear} />
          <Pressable style={{ position: 'absolute', left: GUTTER, top: TOP + plotH, width: plotW + RIGHT, height: BOTTOM }} onPress={onClear} />
          {n > 0 ? (
            <Pressable
              accessibilityLabel="Chart values"
              style={{ position: 'absolute', left: GUTTER, top: TOP, width: plotW, height: plotH }}
              onPress={(e) => onPick(Math.min(n - 1, Math.max(0, Math.floor(e.nativeEvent.locationX / slot))))}
            />
          ) : null}
        </View>
      </ScrollView>
      {callout}
    </View>
  );
}

function Axis({
  domain, yOf, yFormat, plotW, plotH, slot, n, everyLabel, labels,
}: {
  domain: Domain; yOf: (v: number) => number; yFormat: (v: number) => string;
  plotW: number; plotH: number; slot: number; n: number; everyLabel: boolean; labels: string[];
}) {
  let lastLabelY = -999;
  const xs = labelIndexes(n, everyLabel);
  return (
    <>
      {domain.ticks.map((t) => {
        const y = yOf(t);
        const showLabel = Math.abs(y - lastLabelY) >= 12;
        if (showLabel) lastLabelY = y;
        return (
          <React.Fragment key={t}>
            <Line x1={GUTTER} y1={y} x2={GUTTER + plotW} y2={y} stroke={GRID} strokeWidth={1} />
            {showLabel ? <SvgText x={GUTTER - 6} y={y + 3} fill={C.dim} fontSize={10} textAnchor="end">{yFormat(t)}</SvgText> : null}
          </React.Fragment>
        );
      })}
      <Line x1={GUTTER} y1={TOP} x2={GUTTER} y2={TOP + plotH} stroke={C.line} strokeWidth={1} />
      <Line x1={GUTTER} y1={TOP + plotH} x2={GUTTER + plotW} y2={TOP + plotH} stroke={C.line} strokeWidth={1} />
      {xs.map((i) => (
        <SvgText key={i} x={GUTTER + slot * i + slot / 2} y={TOP + plotH + 15} fill={C.dim} fontSize={10} textAnchor="middle">
          {labels[i]}
        </SvgText>
      ))}
    </>
  );
}

function yMapper(plotH: number, domain: Domain, reverse: boolean) {
  const span = domain.max - domain.min || 1;
  return (v: number) => {
    const t = (v - domain.min) / span;
    return TOP + (reverse ? t : 1 - t) * plotH;
  };
}

export default function Chart({
  points, width, height = 140, unit, color = C.coral, fill = false, reverse = false,
  showPointLabels = false, minSlot = 0, yFormat = defaultFormat, yDomain, bands,
  id = 'line', active, onActive,
}: {
  points: ChartPoint[]; width: number; height?: number; unit: string; color?: string;
  fill?: boolean; reverse?: boolean; showPointLabels?: boolean; minSlot?: number;
  yFormat?: (v: number) => string; yDomain?: Domain; bands?: { from: number; to: number; color: string }[];
} & ActiveProps) {
  const { shown, pick, clear } = usePick(id, active, onActive);
  const n = points.length;
  const { slot, plotW, contentW } = frame(width, n, minSlot);
  const svgH = TOP + height + BOTTOM;
  const gid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const domain = yDomain ?? domainFrom(points.map((p) => p.y).filter((y): y is number => y != null && Number.isFinite(y)));
  const yOf = yMapper(height, domain, reverse);
  const baseline = TOP + height;

  let d = '';
  let started = false;
  let firstX = 0;
  let lastX = 0;
  points.forEach((p, i) => {
    if (p.y == null || !Number.isFinite(p.y)) { started = false; return; }
    const x = GUTTER + slot * i + slot / 2;
    const y = yOf(p.y);
    d += `${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    if (!started) firstX = x;
    lastX = x;
    started = true;
  });
  const continuous = fill && points.length > 1 && points.every((p) => p.y != null && Number.isFinite(p.y));
  const area = continuous ? `${d} L${lastX.toFixed(1)},${baseline} L${firstX.toFixed(1)},${baseline} Z` : '';
  const chosen = shown != null ? points[shown] : null;

  return (
    <View>
      <Text style={[T.small, { marginBottom: 2 }]}>{unit}</Text>
      <Shell
        width={width} contentW={contentW} svgH={svgH} plotW={plotW} plotH={height} slot={slot} n={n}
        scroll={minSlot > 0} onPick={pick} onClear={clear}
        callout={chosen ? <Callout title={chosen.calloutTitle} body={chosen.calloutBody} /> : null}
      >
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.28} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {bands?.map((b, i) => {
          const lo = Math.max(b.from, domain.min);
          const hi = Math.min(b.to, domain.max);
          if (!(hi > lo)) return null;
          const yA = yOf(lo);
          const yB = yOf(hi);
          return <Rect key={i} x={GUTTER} y={Math.min(yA, yB)} width={plotW} height={Math.abs(yA - yB)} fill={b.color} />;
        })}
        <Axis domain={domain} yOf={yOf} yFormat={yFormat} plotW={plotW} plotH={height} slot={slot} n={n} everyLabel={minSlot > 0} labels={points.map((p) => p.xLabel)} />
        {area ? <Path d={area} fill={`url(#${gid})`} /> : null}
        {d ? <Path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {points.map((p, i) => {
          if (p.y == null || !Number.isFinite(p.y)) return null;
          const x = GUTTER + slot * i + slot / 2;
          const y = yOf(p.y);
          const on = shown === i;
          return (
            <G key={i}>
              {on ? <Circle cx={x} cy={y} r={11} fill="rgba(255,255,255,0.28)" /> : null}
              <Circle cx={x} cy={y} r={on ? 5.5 : 3.5} fill="#fff" stroke={on ? '#fff' : color} strokeWidth={on ? 0 : 1.5} />
              {showPointLabels && p.valueLabel ? (
                <SvgText x={x} y={Math.max(11, y - 12)} fill={C.text} fontSize={10} fontWeight="700" textAnchor="middle">{p.valueLabel}</SvgText>
              ) : null}
            </G>
          );
        })}
      </Shell>
    </View>
  );
}

export function StackedBars({
  bars, width, height = 150, unit = 'km', formatTotal = (n) => n.toFixed(1), minSlot = 52,
  id = 'bars', active, onActive,
}: {
  bars: BarDatum[]; width: number; height?: number; unit?: string;
  formatTotal?: (n: number) => string; minSlot?: number;
} & ActiveProps) {
  const { shown, pick, clear } = usePick(id, active, onActive);
  const n = bars.length;
  const { slot, plotW, contentW } = frame(width, n, minSlot);
  const svgH = TOP + height + BOTTOM;
  const totals = bars.map((b) => b.segments.reduce((s, seg) => s + seg.value, 0));
  const domain = barDomain(Math.max(0, ...totals));
  const yOf = yMapper(height, domain, false);
  const barW = Math.max(4, Math.min(slot * 0.62, 28));
  const chosen = shown != null ? bars[shown] : null;

  return (
    <View>
      <Text style={[T.small, { marginBottom: 2 }]}>{unit}</Text>
      <Shell
        width={width} contentW={contentW} svgH={svgH} plotW={plotW} plotH={height} slot={slot} n={n}
        scroll onPick={pick} onClear={clear}
        callout={chosen ? <Callout title={chosen.calloutTitle} body={chosen.calloutBody} /> : null}
      >
        <Axis domain={domain} yOf={yOf} yFormat={defaultFormat} plotW={plotW} plotH={height} slot={slot} n={n} everyLabel labels={bars.map((b) => b.xLabel)} />
        {bars.map((b, i) => {
          const x = GUTTER + slot * i + slot / 2;
          let acc = 0;
          const dim = shown != null && shown !== i;
          const yTop = yOf(totals[i]);
          return (
            <G key={i}>
              <G opacity={dim ? 0.35 : 1}>
                {b.segments.map((seg) => {
                  const y0 = yOf(acc);
                  acc += Math.max(0, seg.value);
                  const y1 = yOf(acc);
                  const h = Math.abs(y1 - y0);
                  if (h < 0.4) return null;
                  return <Rect key={seg.label} x={x - barW / 2} y={Math.min(y0, y1)} width={barW} height={h} fill={seg.color} />;
                })}
              </G>
              {shown === i ? <Circle cx={x} cy={yTop} r={11} fill="rgba(255,255,255,0.28)" /> : null}
              {shown === i ? <Circle cx={x} cy={yTop} r={5.5} fill="#fff" /> : null}
              <SvgText x={x} y={Math.max(11, yTop - 12)} fill={totals[i] > 0 ? C.text : C.dim} fontSize={10} fontWeight="700" textAnchor="middle">
                {formatTotal(totals[i])}
              </SvgText>
            </G>
          );
        })}
      </Shell>
    </View>
  );
}
