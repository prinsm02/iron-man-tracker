// Summary: distance is the hero, time + pace beside it, the route, then time and pace per km.
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Btn, C, Chip, GBar, Hero, Stat, T } from '../ui/kit.tsx';
import { deleteSession, getPoints, getSession, updateMeta } from '../lib/db.ts';
import { buildGpx, baseName, type SessionMeta } from '../lib/export.ts';
import { fmtDuration, fmtPace, kmh, SPORT_LABEL, type Stats } from '../lib/geo.ts';

const RUN_TYPES = ['Easy', 'Tempo', 'Long', 'Intervals', 'Race'];
const RIDE_TYPES = ['Outdoor', 'Endurance', 'Hills', 'Race'];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function SessionScreen({ id, onClose, fresh }: { id: string; onClose: () => void; fresh?: boolean }) {
  const row = getSession(id);
  const [meta, setMeta] = useState<SessionMeta>(() => JSON.parse(row?.meta ?? '{}'));
  const stats: Stats = useMemo(() => JSON.parse(row?.stats ?? '{}'), [id]);
  const points = useMemo(() => getPoints(id), [id]);
  const path = useMemo(() => points.filter((p) => p.moving).map((p) => ({ latitude: p.lat, longitude: p.lon })), [points]);
  const region = useMemo(() => {
    if (!path.length) return undefined;
    const la = path.map((p) => p.latitude), lo = path.map((p) => p.longitude);
    const a = Math.min(...la), b = Math.max(...la), c = Math.min(...lo), d = Math.max(...lo);
    return { latitude: (a + b) / 2, longitude: (c + d) / 2, latitudeDelta: Math.max(0.005, (b - a) * 1.4), longitudeDelta: Math.max(0.005, (d - c) * 1.4) };
  }, [path]);

  if (!row) return null;
  const swim = meta.sport.startsWith('swim');
  const bike = meta.sport === 'bike';
  const pool = meta.sport === 'swim_pool';
  const per = swim ? 100 : 1000;
  const set = (p: Partial<SessionMeta>) => setMeta((m) => ({ ...m, ...p }));

  const distM = pool ? (meta.poolLaps ?? 0) * (meta.poolLengthM ?? 0) : stats.distanceM;
  const durS = pool ? meta.manualDurationS ?? 0 : stats.movingS;
  const avg = durS > 0 ? distM / durS : 0;
  const splits = (stats.splits ?? []).filter((s) => s.durationS > 0);
  const speeds = splits.map((s) => s.distanceM / s.durationS);
  const fastest = speeds.length ? Math.max(...speeds) : 1;
  const slowest = speeds.length ? Math.min(...speeds) : 0;

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
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
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
            {bike ? <Stat label="Avg speed" value={kmh(avg).toFixed(1)} unit="km/h" /> : <Stat label="Avg pace" value={fmtPace(avg, per)} unit={swim ? '/100m' : '/km'} />}
          </View>
          {meta.cadenceSpm || meta.kcal ? (
            <Text style={[T.small, { marginTop: 8 }]}>
              {[meta.cadenceSpm ? `${meta.cadenceSpm} spm` : '', meta.kcal ? `${meta.kcal} kcal` : '', !swim && stats.elevGainM ? `${Math.round(stats.elevGainM)} m climb` : ''].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </Hero>

        {region ? (
          <MapView style={{ height: 190, borderRadius: 12 }} initialRegion={region} userInterfaceStyle="dark" mapType="mutedStandard">
            <Polyline coordinates={path} strokeColor={C.coral} strokeWidth={4} />
            <Marker coordinate={path[0]} pinColor="green" />
            <Marker coordinate={path[path.length - 1]} pinColor="red" />
          </MapView>
        ) : null}

        {!pool && splits.length ? (
          <View>
            <Text style={[T.label, { marginBottom: 4 }]}>{swim ? 'Per 100 m' : 'Per km'}</Text>
            {splits.map((sp, i) => {
              const v = speeds[i];
              const isBest = v === fastest && splits.length > 1;
              const pct = fastest === slowest ? 100 : 35 + ((v - slowest) / (fastest - slowest)) * 65;
              return (
                <View key={sp.index} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line }}>
                  <View style={{ flexDirection: 'row' }}>
                    <Text style={[T.small, { width: 56 }]}>{swim ? `${sp.index * 100} m` : `Km ${sp.index}`}{sp.distanceM < per - 1 ? '*' : ''}</Text>
                    <Text style={[T.num, { flex: 1, fontSize: 15, fontWeight: '600' }]}>{mmss(sp.durationS)}</Text>
                    <Text style={[T.num, { fontSize: 15, color: isBest ? C.coral : C.text }]}>{bike ? `${kmh(v).toFixed(1)} km/h` : `${fmtPace(v, per)} /${swim ? '100m' : 'km'}`}</Text>
                  </View>
                  <GBar pct={pct} style={{ marginTop: 8, height: 4 }} />
                </View>
              );
            })}
          </View>
        ) : null}

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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {!pool ? <Pressable onPress={shareGpx}><Text style={T.small}>Share GPX</Text></Pressable> : <View />}
          <Text style={T.small}>{row.synced ? 'On GitHub' : row.sync_error ? 'Upload failed, will retry' : 'Uploads when online'}</Text>
          <Pressable onPress={remove}><Text style={[T.small, { color: C.coral }]}>Delete</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, color: C.text, padding: 14, fontSize: 16 } as const;
