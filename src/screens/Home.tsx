// Home: menu, this week's km, your next event, sport switch, one big start button, profile + history.
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, Chip, Hero, T } from '../ui/kit.tsx';
import SidePanel, { type PanelTarget } from '../ui/SidePanel.tsx';
import { getSettings } from '../lib/settings.ts';
import { listFinished } from '../lib/db.ts';
import { upcoming } from '../lib/events.ts';
import type { Sport, Stats } from '../lib/geo.ts';
import type { SessionMeta } from '../lib/export.ts';

const TAB: Record<Sport, string> = { run: 'Run', bike: 'Bike', swim_open: 'Swim', swim_pool: 'Pool' };

export default function Home({
  onStart, onPool, onHistory, onSettings, onProfile, onSync, syncNote,
}: {
  onStart: (s: Sport) => void; onPool: () => void; onHistory: () => void; onSettings: () => void;
  onProfile: () => void; onSync: () => void; syncNote: string;
}) {
  const s = getSettings();
  const [sport, setSport] = useState<Sport>(s.defaultSport);
  const [panel, setPanel] = useState(false);
  const next = upcoming(s.events)[0];
  const initials = (s.name || 'Me').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

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

  const go = (t: PanelTarget) => (t === 'profile' ? onProfile() : t === 'history' ? onHistory() : t === 'settings' ? onSettings() : onSync());

  return (
    <SafeAreaView style={T.screen}>
      <SidePanel open={panel} onClose={() => setPanel(false)} onGo={go} />
      <View style={{ flex: 1, padding: 20, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => setPanel(true)} hitSlop={14}><Text style={{ color: C.text, fontSize: 22 }}>☰</Text></Pressable>
          <Text style={[T.h2, { fontSize: 17 }]}>Iron Man</Text>
        </View>

        <Hero>
          <Text style={T.label}>This week</Text>
          <Text style={[T.big, { fontSize: 64, marginTop: 4 }]}>
            {week.all.toFixed(1)}<Text style={{ fontSize: 18, color: C.dim, textShadowRadius: 0 }}> km</Text>
          </Text>
          <Text style={[T.small, { marginTop: 6 }]}>Run {week.run.toFixed(1)} · Bike {week.bike.toFixed(1)} · Swim {week.swim.toFixed(1)}</Text>
        </Hero>

        {next ? (
          <Pressable onPress={onProfile} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.card2 }}>
            <Text style={{ color: C.text, fontSize: 13 }}>{next.name}</Text>
            <Text style={{ color: C.coral, fontSize: 13, fontWeight: '700' }}>{next.days === 0 ? 'today' : `${next.days}d`}</Text>
          </Pressable>
        ) : null}

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

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={onProfile} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.coral, fontWeight: '700' }}>{initials}</Text>
            </View>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{s.name ? 'Profile' : 'Set up profile'}</Text>
          </Pressable>
          <Pressable onPress={onHistory} hitSlop={12}><Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>History ›</Text></Pressable>
        </View>
        {syncNote ? <Text style={[T.small, { textAlign: 'center', marginTop: -10 }]}>{syncNote}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
