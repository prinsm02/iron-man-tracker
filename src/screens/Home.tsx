// Home: this week per sport (big), this month (small), next event, sport choice, start, profile.
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, C, Chip, Hero, T } from '../ui/kit.tsx';
import SidePanel, { type PanelTarget } from '../ui/SidePanel.tsx';
import { getSettings } from '../lib/settings.ts';
import { countdownLabel, upcoming } from '../lib/events.ts';
import { acwrTone, computeAcwr } from '../lib/acwr.ts';
import { ordered, type Sport } from '../lib/geo.ts';
import { allRows } from '../lib/history.ts';
import { totals } from '../lib/records.ts';
import { getLive } from '../tracking/tracker.ts';

const TONE = { ok: C.ok, warn: C.warn, bad: C.bad, dim: C.dim } as const;
const TAB: Record<Sport, string> = { run: 'Run', bike: 'Bike', swim_open: 'Swim', swim_pool: 'Pool' };
const NOUN: Record<Sport, string> = { run: 'run', bike: 'ride', swim_open: 'swim', swim_pool: 'pool swim' };

export default function Home({
  onStart, onPool, onHistory, onSettings, onProfile, onEvents, onStats, onSync, onBackToLive, syncNote,
}: {
  onStart: (s: Sport) => void; onPool: () => void; onHistory: () => void; onSettings: () => void;
  onProfile: () => void; onEvents: () => void; onStats: () => void; onSync: () => void; onBackToLive: () => void; syncNote: string;
}) {
  const s = getSettings();
  const sports = ordered(s.sports);
  const [sport, setSport] = useState<Sport>(sports.includes(s.defaultSport) ? s.defaultSport : sports[0]);
  const [panel, setPanel] = useState(false);
  const next = upcoming(s.events)[0];
  const history = allRows();
  const { week, month } = totals(history);
  const load = computeAcwr(history);
  const recording = getLive().status !== 'idle';

  const go = (t: PanelTarget) =>
    t === 'profile' ? onProfile() : t === 'events' ? onEvents() : t === 'history' ? onHistory() : t === 'settings' ? onSettings() : t === 'stats' ? onStats() : onSync();

  // Ask first, so a run is never recorded as a ride by accident.
  const confirmStart = () => {
    if (sport === 'swim_pool') return onPool();
    Alert.alert(`Start a ${NOUN[sport]}?`, `${TAB[sport].toUpperCase()} is selected.`, [
      { text: 'Change sport', style: 'cancel' },
      { text: `Start ${NOUN[sport]}`, onPress: () => onStart(sport) },
    ]);
  };

  const Big = ({ label, km }: { label: string; km: number }) => (
    <View style={{ flex: 1 }}>
      <Text style={T.label}>{label}</Text>
      <Text style={[T.big, { fontSize: 34, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>{km.toFixed(1)}</Text>
      <Text style={[T.small, { marginTop: -2 }]}>km</Text>
    </View>
  );

  return (
    <SafeAreaView style={T.screen}>
      <SidePanel open={panel} onClose={() => setPanel(false)} onGo={go} />
      <View style={{ flex: 1, padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => setPanel(true)} hitSlop={14} accessibilityLabel="Open menu"><Text style={{ color: C.text, fontSize: 22 }}>☰</Text></Pressable>
          <Text style={[T.h2, { fontSize: 17 }]}>Iron Man</Text>
        </View>

        {recording ? (
          <Pressable onPress={onBackToLive} style={{ backgroundColor: C.red, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>● Recording</Text>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Back to session ›</Text>
          </Pressable>
        ) : null}

        <Pressable onPress={onStats}>
          <Hero>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={T.label}>This week</Text>
              <Text style={[T.label, { color: C.text }]}>{week.all.toFixed(1)} km total</Text>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
              <Big label="Run" km={week.run} />
              <Big label="Bike" km={week.bike} />
              <Big label="Swim" km={week.swim} />
            </View>
            <View style={{ height: 1, backgroundColor: C.line, marginVertical: 12 }} />
            <Text style={[T.small, { lineHeight: 18 }]}>
              {new Date().toLocaleDateString('en-ZA', { month: 'long' })}: Run {month.run.toFixed(1)} km · Bike {month.bike.toFixed(1)} km · Swim {month.swim.toFixed(1)} km · {month.all.toFixed(1)} km
            </Text>
            {load.acwr != null ? (
              <Text style={{ marginTop: 8, lineHeight: 20 }}>
                <Text style={T.label}>Load </Text>
                <Text style={{ color: TONE[acwrTone(load.zone)], fontWeight: '700', fontSize: 15 }}>{load.acwr.toFixed(2)}</Text>
                <Text style={{ color: TONE[acwrTone(load.zone)], fontSize: 14 }}>  {load.label}</Text>
              </Text>
            ) : null}
          </Hero>
        </Pressable>

        {next ? (
          <Pressable onPress={onEvents} style={{ alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.card2 }}>
            <Text numberOfLines={1} style={{ color: C.text, fontSize: 13, flexShrink: 1 }}>{next.name}</Text>
            <Text style={{ color: C.coral, fontSize: 13, fontWeight: '700' }}>{countdownLabel(next.days)}</Text>
          </Pressable>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {sports.map((sp) => <Chip key={sp} label={TAB[sp]} selected={sport === sp} onPress={() => setSport(sp)} />)}
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Pressable
            onPress={recording ? onBackToLive : confirmStart}
            style={({ pressed }) => ({
              width: 190, height: 190, borderRadius: 95, backgroundColor: pressed ? '#b02a2a' : C.red,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: C.red, shadowOpacity: 0.55, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
            })}
          >
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: 1 }}>{recording ? 'LIVE' : TAB[sport].toUpperCase()}</Text>
            <Text style={{ color: '#ffd5d5', fontSize: 14, fontWeight: '700', letterSpacing: 2, marginTop: 4 }}>
              {recording ? 'BACK TO SESSION' : sport === 'swim_pool' ? 'LOG' : 'START'}
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={onProfile} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
            <Avatar uri={s.photoUri} name={s.name} />
            <Text numberOfLines={1} style={{ color: C.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }}>{s.name || 'Set up profile'}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <Pressable onPress={onStats} hitSlop={12}><Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Stats</Text></Pressable>
            <Pressable onPress={onHistory} hitSlop={12}><Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>History ›</Text></Pressable>
          </View>
        </View>
        {syncNote ? <Text style={[T.small, { textAlign: 'center', marginTop: -8 }]}>{syncNote}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
