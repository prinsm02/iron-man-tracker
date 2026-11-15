// Summary map: fixed (no drag, zoom or rotate), centred on the route, so swiping over it never moves the map.
// Tap it to PLAY the route: a dot runs along it and draws the line by pace. Red = fast, yellow = medium, green = slow.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { C, T } from './kit.tsx';
import { paceRuns, runsUpTo, TIER_COLOR, type LatLng } from '../lib/route.ts';
import type { TrackPoint } from '../lib/geo.ts';

const PLAY_MS = 7000;

export default function RouteMap({ points, height }: { points: TrackPoint[]; height: number }) {
  const map = useRef<MapView>(null);
  const path = useMemo<LatLng[]>(() => points.filter((p) => p.moving).map((p) => ({ latitude: p.lat, longitude: p.lon })), [points]);
  const { runs, steps } = useMemo(() => paceRuns(points), [points]);
  const [shown, setShown] = useState<number | null>(null); // null = plain route, else steps drawn so far
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const region = useMemo(() => {
    if (!path.length) return undefined;
    const la = path.map((p) => p.latitude), lo = path.map((p) => p.longitude);
    const a = Math.min(...la), b = Math.max(...la), c = Math.min(...lo), d = Math.max(...lo);
    return { latitude: (a + b) / 2, longitude: (c + d) / 2, latitudeDelta: Math.max(0.004, (b - a) * 1.4), longitudeDelta: Math.max(0.004, (d - c) * 1.4) };
  }, [path]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const fit = () => map.current?.fitToCoordinates(path, { edgePadding: { top: 30, right: 30, bottom: 30, left: 30 }, animated: false });

  const play = () => {
    if (!steps.length) return;
    if (timer.current) clearInterval(timer.current);
    const frames = Math.min(steps.length, 140);
    const per = steps.length / frames;
    let f = 0;
    setShown(0);
    timer.current = setInterval(() => {
      f++;
      setShown(Math.min(steps.length, Math.round(f * per)));
      if (f >= frames && timer.current) { clearInterval(timer.current); timer.current = null; }
    }, PLAY_MS / frames);
  };

  if (!region || !path.length) return null;
  const playing = shown != null;
  const drawn = playing ? runsUpTo(path[0], steps, shown) : [];
  const head = playing ? (shown > 0 ? steps[shown - 1].to : path[0]) : null;
  const done = playing && shown >= steps.length;

  return (
    <Pressable onPress={play} accessibilityLabel="Play the route by pace">
      <View pointerEvents="none" style={{ height, borderRadius: 12, overflow: 'hidden' }}>
        <MapView
          ref={map}
          style={{ flex: 1 }}
          initialRegion={region}
          onMapReady={fit}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          userInterfaceStyle="dark"
          mapType="mutedStandard"
        >
          {playing ? (
            <>
              <Polyline coordinates={path} strokeColor="rgba(255,255,255,0.12)" strokeWidth={4} />
              {(done ? runs : drawn).map((r, i) => (
                <Polyline key={`${r.tier}-${i}`} coordinates={r.coords} strokeColor={TIER_COLOR[r.tier]} strokeWidth={5} />
              ))}
              {head && !done ? (
                <Marker coordinate={head} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)' }} />
                </Marker>
              ) : null}
            </>
          ) : (
            <Polyline coordinates={path} strokeColor={C.coral} strokeWidth={4} />
          )}
          <Marker coordinate={path[0]} pinColor="green" tracksViewChanges={false} />
          <Marker coordinate={path[path.length - 1]} pinColor="red" tracksViewChanges={false} />
        </MapView>
        <View style={{ position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(13,13,13,0.82)', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
          {playing ? (
            (['fast', 'medium', 'slow'] as const).map((t) => (
              <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TIER_COLOR[t] }} />
                <Text style={[T.small, { color: C.text }]}>{t === 'fast' ? 'Fast' : t === 'medium' ? 'Medium' : 'Slow'}</Text>
              </View>
            ))
          ) : (
            <Text style={[T.small, { color: C.text }]}>▶  Tap to play by pace</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
