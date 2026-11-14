// Live: the time is the hero, distance + pace under it, then time and pace per km. Nothing else.
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Polyline } from 'react-native-maps';
import { useKeepAwake } from 'expo-keep-awake';
import { BackBar, Btn, C, Hero, HoldBtn, Stat, T } from '../ui/kit.tsx';
import { activeSeconds, currentSpeed, getLive, onLive, pause, resume, finish, type Live } from '../tracking/tracker.ts';
import { getSettings } from '../lib/settings.ts';
import { fmtDuration, fmtPace, kmh, SPORT_LABEL } from '../lib/geo.ts';

function KeepAwake() {
  useKeepAwake();
  return null;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function LiveScreen({ onFinished, onBack }: { onFinished: (id: string | null) => void; onBack: () => void }) {
  const s = getSettings();
  const [live, setLive] = useState<Live>(getLive());
  const [, setNow] = useState(0);
  const map = useRef<MapView>(null);

  useEffect(() => {
    const off = onLive(setLive);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { off(); clearInterval(t); };
  }, []);

  useEffect(() => {
    const last = live.path[live.path.length - 1];
    if (last && map.current) map.current.animateCamera({ center: last }, { duration: 500 });
  }, [live.path.length]);

  const secs = activeSeconds();
  const speedNow = currentSpeed();
  const swim = live.sport.startsWith('swim');
  const bike = live.sport === 'bike';
  const per = swim ? 100 : 1000;
  const paused = live.status === 'paused' || live.autoPaused;
  const gpsOk = live.gpsAccuracy != null && live.gpsAccuracy <= 15;

  const splitLine = (sec: number) => (bike ? `${kmh(per / sec).toFixed(1)} km/h` : `${fmtPace(per / sec, per)} /${swim ? '100m' : 'km'}`);
  const recent = live.splits.map((sec, i) => ({ n: i + 1, sec })).slice(-4).reverse();
  const best = live.splits.length ? Math.min(...live.splits) : 0;

  return (
    <SafeAreaView style={T.screen}>
      {s.keepScreenOn ? <KeepAwake /> : null}
      <BackBar onBack={onBack} title="keeps recording" />
      <View style={{ flex: 1, padding: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[T.label, { color: !live.gpsReady || paused ? C.warn : C.coral }]}>● {!live.gpsReady ? 'Finding GPS, stand still' : live.status === 'paused' ? 'Paused' : live.autoPaused ? 'Auto-paused' : SPORT_LABEL[live.sport]}</Text>
          <Text style={[T.label, { color: gpsOk ? C.ok : C.warn }]}>{live.gpsAccuracy == null ? 'Finding GPS' : gpsOk ? 'GPS' : 'Weak GPS'}</Text>
        </View>

        {s.showMap ? (
          <MapView ref={map} style={{ height: 150, borderRadius: 12 }} showsUserLocation followsUserLocation={!live.path.length} userInterfaceStyle="dark" mapType="mutedStandard"
            initialCamera={{ center: live.path[0] ?? { latitude: 0, longitude: 0 }, zoom: 16, heading: 0, pitch: 0 }}>
            {live.path.length > 1 ? <Polyline coordinates={live.path} strokeColor={C.coral} strokeWidth={4} /> : null}
          </MapView>
        ) : null}

        <Hero>
          <Text style={T.label}>Time</Text>
          <Text style={[T.big, { fontSize: s.showBigNumbers ? 68 : 52 }]} adjustsFontSizeToFit numberOfLines={1}>{fmtDuration(secs)}</Text>
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Stat label="Distance" value={swim ? `${Math.round(live.distanceM)}` : (live.distanceM / 1000).toFixed(2)} unit={swim ? 'm' : 'km'} />
            {bike
              ? <Stat label="Speed" value={kmh(speedNow).toFixed(1)} unit="km/h" />
              : <Stat label="Pace" value={fmtPace(speedNow, per)} unit={swim ? '/100m' : '/km'} />}
          </View>
        </Hero>

        {recent.length ? (
          <View>
            <Text style={[T.label, { marginBottom: 6 }]}>{swim ? 'Per 100 m' : 'Per km'}</Text>
            {recent.map((r) => (
              <View key={r.n} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderColor: C.line }}>
                <Text style={[T.small, { width: 56 }]}>{swim ? `${r.n * 100} m` : `Km ${r.n}`}</Text>
                <Text style={[T.num, { flex: 1, fontSize: 15, fontWeight: '600' }]}>{mmss(r.sec)}</Text>
                <Text style={[T.num, { fontSize: 15, color: r.sec === best ? C.coral : C.text }]}>{splitLine(r.sec)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {live.mode === 'foreground' ? <Text style={[T.small, { color: C.warn }]}>Test mode: keep the screen on.</Text> : null}
        <View style={{ flex: 1 }} />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {live.status === 'paused'
            ? <Btn title="Resume" kind="gold" onPress={resume} style={{ flex: 1, minHeight: 66 }} />
            : <Btn title="Pause" kind="ghost" onPress={pause} style={{ flex: 1, minHeight: 66 }} />}
          <HoldBtn title="Finish" onDone={async () => { const r = await finish(); onFinished(r?.id ?? null); }} style={{ flex: 1, minHeight: 66 }} />
        </View>
      </View>
    </SafeAreaView>
  );
}
