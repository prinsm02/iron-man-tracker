// Home: one hero number (this week's km), a sport switch, one big start button, the next race.
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, Chip, Hero, T } from '../ui/kit.tsx';
import { getSettings } from '../lib/settings.ts';
import { listFinished } from '../lib/db.ts';
import { nextRace } from '../lib/races.ts';
import type { Sport, Stats } from '../lib/geo.ts';
import type { SessionMeta } from '../lib/export.ts';

const TAB: Record<Sport, string> = { run: 'Run', bike: 'Bike', swim_open: 'Swim', swim_pool: 'Pool' };

export default function Home({
  onStart, onPool, onHistory, onSettings, syncNote,
}: { onStart: (s: Sport) => void; onPool: () => void; onHistory: () => void; onSettings: () => void; syncNote: string }) {
  const s = getSettings();
  const [sport, setSport] = useState<Sport>(s.defaultSport);
  const race = nextRace();

  const week = useMemo(() => {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
    const t = { all: 0, run: 0, bike: 0, swim: 0 };
    for (const r of listFinished()) {
      if (r.started_at < monday) break;
      const st: Stats = JSON.parse(r.stats || '{}');
      const m: SessionMeta = JSON.parse(r.meta || '{}');
      const km = (r.sport === 'swim_pool' ? (m.poolLaps ?? 0) * (m.poolLengthM ?? 0) : st.distanceM ?? 0) / 1000;
      t.all += km;
      if (r.sport === 'run') t.run += km; else if (r.sport === 'bike') t.bike += km; else t.swim += km;
    }
    return t;
  }, []);

  return (
    <SafeAreaView style={T.screen}>
      <View style={{ flex: 1, padding: 20, gap: 22 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[T.h2, { fontSize: 17 }]}>Iron Man</Text>
          <Pressable onPress={onSettings} hitSlop={14}><Text style={{ color: C.dim, fontSize: 22 }}>⚙</Text></Pressable>
        </View>

        <Hero>
          <Text style={T.label}>This week</Text>
          <Text style={[T.big, { fontSize: 64, marginTop: 4 }]}>
            {week.all.toFixed(1)}<Text style={{ fontSize: 18, color: C.dim, textShadowRadius: 0 }}> km</Text>
          </Text>
          <Text style={[T.small, { marginTop: 6 }]}>
            Run {week.run.toFixed(1)} · Bike {week.bike.toFixed(1)} · Swim {week.swim.toFixed(1)}
          </Text>
        </Hero>

        <View style={{ flexDirection: 'row' }}>
          {s.sports.map((sp) => <Chip key={sp} label={TAB[sp]} selected={sport === sp} onPress={() => setSport(sp)} />)}
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Pressable
            onPress={() => (sport === 'swim_pool' ? onPool() : onStart(sport))}
            style={({ pressed }) => ({
              width: 180, height: 180, borderRadius: 90, backgroundColor: pressed ? '#b02a2a' : C.red,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: C.red, shadowOpacity: 0.55, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
            })}
          >
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 1 }}>{sport === 'swim_pool' ? 'LOG' : 'START'}</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {race ? (
            <View>
              <Text style={T.label}>Next race</Text>
              <Text style={[T.small, { color: C.text, marginTop: 2 }]}>{race.name}</Text>
              <Text style={[T.big, { fontSize: 22 }]}>{race.days} days</Text>
            </View>
          ) : <View />}
          <Pressable onPress={onHistory} hitSlop={12}><Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>History ›</Text></Pressable>
        </View>
        {syncNote ? <Text style={[T.small, { textAlign: 'center', marginTop: -10 }]}>{syncNote}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
