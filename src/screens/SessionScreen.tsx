// Summary. Distance + time on top, then swipe: Route > Elevation > Pace (with km splits) > Details.
// Details only shows numbers that are not already on screen (Strava/Garmin style key stats, kept minimal).
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { BackBar, Btn, C, Chip, GBar, Hero, Stat, T } from '../ui/kit.tsx';
import Chart from '../ui/Chart.tsx';
import { deleteSession, getPoints, getSession, updateMeta } from '../lib/db.ts';
import { buildGpx, baseName, type SessionMeta } from '../lib/export.ts';
import { fmtDuration, fmtPace, kmh, profile, SPORT_LABEL, type Stats } from '../lib/geo.ts';

const RUN_TYPES = ['Easy', 'Tempo', 'Long', 'Intervals', 'Race'];
const RIDE_TYPES = ['Outdoor', 'Endurance', 'Hills', 'Race'];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const PAGE_H = 330;

export default function SessionScreen({ id, onClose, fresh }: { id: string; onClose: () => void; fresh?: boolean }) {
  const { width } = useWindowDimensions();
  const pageW = width - 40;
  const row = getSession(id);
  const [meta, setMeta] = useState<SessionMeta>(() => JSON.parse(row?.meta ?? '{}'));
  const [page, setPage] = useState(0);
  const stats: Stats = useMemo(() => JSON.parse(row?.stats ?? '{}'), [id]);
  const points = useMemo(() => getPoints(id), [id]);
  const path = useMemo(() => points.filter((p) => p.moving).map((p) => ({ latitude: p.lat, longitude: p.lon })), [points]);
  const region = useMemo(() => {
    if (!path.length) return undefined;
    const la = path.map((p) => p.latitude), lo = path.map((p) => p.longitude);
    const a = Math.min(...la), b = Math.max(...la), c = Math.min(...lo), d = Math.max(...lo);
    return { latitude: (a + b) / 2, longitude: (c + d) / 2, latitudeDelta: Math.max(0.004, (b - a) * 1.4), longitudeDelta: Math.max(0.004, (d - c) * 1.4) };
  }, [path]);
  const series = useMemo(() => profile(points, meta.sport?.startsWith('swim') ? 50 : 100), [points]);

  if (!row) {
    return (
      <SafeAreaView style={T.screen}>
        <BackBar onBack={onClose} />
        <View style={{ padding: 20, gap: 8 }}>
          <Text style={T.h2}>Session not found</Text>
          <Text style={T.small}>It is no longer on this phone.</Text>
        </View>
      </SafeAreaView>
    );
  }
  const swim = meta.sport.startsWith('swim');
  const bike = meta.sport === 'bike';
  const pool = meta.sport === 'swim_pool';
  const per = swim ? 100 : 1000;
  const set = (p: Partial<SessionMeta>) => setMeta((m) => ({ ...m, ...p }));

  const distM = pool ? (meta.poolLaps ?? 0) * (meta.poolLengthM ?? 0) : stats.distanceM;
  const durS = pool ? meta.manualDurationS ?? 0 : stats.movingS;
  const avg = durS > 0 ? distM / durS : 0;
  // leave out a last partial split shorter than a fifth of a km (or of 100 m): its pace means nothing
  const splits = (stats.splits ?? []).filter((s) => s.durationS > 0 && s.distanceM >= per * 0.2);
  const speeds = splits.map((s) => s.distanceM / s.durationS);
  const fullSpeeds = splits.filter((s) => s.distanceM >= per - 1).map((s) => s.distanceM / s.durationS);
  const fastest = speeds.length ? Math.max(...speeds) : 1;
  const slowest = speeds.length ? Math.min(...speeds) : 0;
  const bestFull = fullSpeeds.length ? Math.max(...fullSpeeds) : 0;

  const elev = series.filter((p) => p.alt != null);
  const speedFmt = (v: number) => (bike ? `${kmh(v).toFixed(1)} km/h` : `${fmtPace(v, per)} ${swim ? 'min/100m' : 'min/km'}`);

  // key details: never repeat distance / time from the hero
  const details: { label: string; value: string; unit?: string }[] = bike
    ? [
        { label: 'Avg speed', value: kmh(avg).toFixed(1), unit: 'km/h' },
        { label: 'Top speed', value: kmh(stats.maxSpeedMs ?? 0).toFixed(1), unit: 'km/h' },
        { label: 'Climb', value: `${Math.round(stats.elevGainM ?? 0)}`, unit: 'm' },
        { label: 'Fastest km', value: bestFull ? kmh(bestFull).toFixed(1) : '–', unit: bestFull ? 'km/h' : undefined },
        { label: 'Calories', value: meta.kcal ? `${meta.kcal}` : '–', unit: meta.kcal ? 'kcal' : undefined },
      ]
    : swim
      ? [
          { label: 'Avg pace', value: fmtPace(avg, 100), unit: 'min/100m' },
          { label: 'Best 100 m', value: bestFull ? fmtPace(bestFull, 100) : '–', unit: bestFull ? 'min/100m' : undefined },
          { label: 'Calories', value: meta.kcal ? `${meta.kcal}` : '–', unit: meta.kcal ? 'kcal' : undefined },
        ]
      : [
          { label: 'Avg pace', value: fmtPace(avg), unit: 'min/km' },
          { label: 'Best km', value: bestFull ? fmtPace(bestFull) : '–', unit: bestFull ? 'min/km' : undefined },
          { label: 'Cadence', value: meta.cadenceSpm ? `${meta.cadenceSpm}` : '–', unit: meta.cadenceSpm ? 'steps/min' : undefined },
          { label: 'Climb', value: `${Math.round(stats.elevGainM ?? 0)}`, unit: 'm' },
          { label: 'Calories', value: meta.kcal ? `${meta.kcal}` : '–', unit: meta.kcal ? 'kcal' : undefined },
        ];

  const pages: { key: string; title: string; body: React.ReactNode }[] = [];
  if (region) {
    pages.push({
      key: 'route', title: 'Route',
      body: (
        <MapView style={{ height: PAGE_H - 30, borderRadius: 12 }} initialRegion={region} userInterfaceStyle="dark" mapType="mutedStandard">
          <Polyline coordinates={path} strokeColor={C.coral} strokeWidth={4} />
          <Marker coordinate={path[0]} pinColor="green" />
          <Marker coordinate={path[path.length - 1]} pinColor="red" />
        </MapView>
      ),
    });
  }
  if (!swim && elev.length > 1) {
    pages.push({
      key: 'elev', title: 'Elevation',
      body: (
        <View style={{ gap: 10 }}>
          <Text style={T.small}>+{Math.round(stats.elevGainM ?? 0)} m up · −{Math.round(stats.elevLossM ?? 0)} m down</Text>
          <Chart width={pageW} height={170} unit="m" fill points={elev.map((p) => ({
            y: p.alt as number,
            xLabel: `${p.km.toFixed(1)} km`,
            calloutTitle: `${p.km.toFixed(1)} km`,
            calloutBody: `${Math.round(p.alt as number)} m`,
          }))} />
        </View>
      ),
    });
  }
  if (!pool && series.length > 1) {
    pages.push({
      key: 'pace', title: bike ? 'Speed' : 'Pace',
      body: (
        <ScrollView nestedScrollEnabled style={{ height: PAGE_H - 30 }}>
          <Chart
            width={pageW}
            height={130}
            unit={bike ? 'km/h' : swim ? 'min/100m' : 'min/km'}
            color={bike ? '#f0f0f0' : C.coral}
            fill
            reverse={!bike}
            yFormat={bike ? (v) => v.toFixed(0) : (v) => mmss(v)}
            points={series.map((p) => ({
              y: p.speed > 0.05 ? (bike ? kmh(p.speed) : per / p.speed) : null,
              xLabel: swim ? `${Math.round(p.km * 1000)} m` : `${p.km.toFixed(1)} km`,
              calloutTitle: swim ? `${Math.round(p.km * 1000)} m` : `${p.km.toFixed(1)} km`,
              calloutBody: p.speed > 0.05 ? speedFmt(p.speed) : 'No pace for this stretch',
            }))}
          />
          <View style={{ marginTop: 10 }}>
            {splits.map((s, i) => {
              const v = speeds[i];
              const pct = fastest === slowest ? 100 : 35 + ((v - slowest) / (fastest - slowest)) * 65;
              return (
                <View key={s.index} style={{ paddingVertical: 7, borderBottomWidth: 1, borderColor: C.line }}>
                  <View style={{ flexDirection: 'row' }}>
                    <Text style={[T.small, { width: 56 }]}>{swim ? `${s.index * 100} m` : `Km ${s.index}`}{s.distanceM < per - 1 ? '*' : ''}</Text>
                    <Text style={[T.num, { flex: 1, fontSize: 15, fontWeight: '600' }]}>{mmss(s.durationS)}</Text>
                    <Text style={[T.num, { fontSize: 15, color: v === fastest && splits.length > 1 ? C.coral : C.text }]}>{speedFmt(v)}</Text>
                  </View>
                  <GBar pct={pct} style={{ marginTop: 7, height: 4 }} />
                </View>
              );
            })}
            {splits.some((s) => s.distanceM < per - 1) ? <Text style={[T.small, { marginTop: 8 }]}>* Shorter than a full split, so the pace is only for that piece.</Text> : null}
          </View>
        </ScrollView>
      ),
    });
  }
  pages.push({
    key: 'details', title: 'Details',
    body: (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>
        {details.map((d) => <Stat key={d.label} label={d.label} value={d.value} unit={d.unit} style={{ flexBasis: '50%', flexGrow: 0 }} />)}
      </View>
    ),
  });

  const shareGpx = async () => {
    const f = new File(Paths.cache, `${baseName(meta)}.gpx`);
    f.create({ overwrite: true });
    f.write(buildGpx(meta, points));
    await Sharing.shareAsync(f.uri, { mimeType: 'application/gpx+xml', UTI: 'com.topografix.gpx' });
  };
  const remove = () =>
    Alert.alert('Delete session?', 'Removes it from the phone. Anything already on GitHub stays.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteSession(id); onClose(); } },
    ]);

  return (
    <SafeAreaView style={T.screen}>
      <BackBar onBack={() => { updateMeta(id, meta, stats); onClose(); }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 18, paddingBottom: 40 }}>
        <View>
          <Text style={T.label}>{new Date(meta.startedAt).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
          <Text style={T.h1}>{SPORT_LABEL[meta.sport]}</Text>
        </View>

        <Hero>
          <Text style={T.label}>Distance</Text>
          <Text style={[T.big, { fontSize: 60 }]}>
            {swim ? Math.round(distM) : (distM / 1000).toFixed(2)}<Text style={{ fontSize: 18, color: C.dim, textShadowRadius: 0 }}>{swim ? ' m' : ' km'}</Text>
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            <Stat label="Time" value={fmtDuration(durS)} />
            {bike ? <Stat label="Avg speed" value={kmh(avg).toFixed(1)} unit="km/h" /> : <Stat label="Avg pace" value={fmtPace(avg, per)} unit={swim ? 'min/100m' : 'min/km'} />}
          </View>
        </Hero>

        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={T.label}>{pages[page]?.title}</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {pages.map((p, i) => <View key={p.key} style={{ width: i === page ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? C.red : C.line }} />)}
            </View>
          </View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: pageW }}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / pageW))}>
            {pages.map((p) => <View key={p.key} style={{ width: pageW, minHeight: PAGE_H - 30 }}>{p.body}</View>)}
          </ScrollView>
        </View>

        {!swim ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {(bike ? RIDE_TYPES : RUN_TYPES).map((t) => <Chip key={t} label={t} selected={meta.runType === t} onPress={() => set({ runType: t })} />)}
          </View>
        ) : null}

        <TextInput value={meta.route} onChangeText={(t) => set({ route: t })} placeholder="Route" placeholderTextColor={C.dim} style={input} />
        <TextInput value={meta.notes} onChangeText={(t) => set({ notes: t })} placeholder="Notes" placeholderTextColor={C.dim} multiline style={[input, { minHeight: 64 }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={T.body}>Personal best</Text>
          <Switch value={meta.pb} onValueChange={(v) => set({ pb: v })} trackColor={{ true: C.red }} />
        </View>

        <Btn title={fresh ? 'Save' : 'Done'} onPress={() => { updateMeta(id, meta, stats); onClose(); }} />
        <Text style={[T.small, { lineHeight: 18 }]}>{row.synced ? 'On GitHub' : row.sync_error ? 'Upload failed. It will retry.' : 'Uploads when online'}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {!pool ? <Pressable onPress={shareGpx} hitSlop={8}><Text style={{ color: C.text, fontWeight: '600' }}>Share GPX</Text></Pressable> : <View />}
          <Pressable onPress={remove} hitSlop={8}><Text style={{ color: C.coral, fontWeight: '600' }}>Delete</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, color: C.text, padding: 14, fontSize: 16 } as const;
