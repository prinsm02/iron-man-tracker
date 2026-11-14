// Home: this week per sport (big), this month (small), next event, sport choice, start, profile.
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, C, Hero, Segmented, T } from '../ui/kit.tsx';
import SidePanel, { type PanelTarget } from '../ui/SidePanel.tsx';
import { getSettings } from '../lib/settings.ts';
import { countdownLabel, upcoming } from '../lib/events.ts';
import { acwrTone, computeAcwr } from '../lib/acwr.ts';
import { ordered, type Sport } from '../lib/geo.ts';
import { allRows } from '../lib/history.ts';
import { totals } from '../lib/records.ts';
import { getLive } from '../tracking/tracker.ts';
import * as Haptics from 'expo-haptics';

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
  // Swim and Pool share one 'Swim' tab; open water or pool is chosen when you start.
  const sports = ordered(s.sports).filter((x) => x !== 'swim_pool' || !s.sports.includes('swim_open'))
    .map((x) => (x === 'swim_pool' ? 'swim_open' : x)) as Sport[];
  const first = s.defaultSport === 'swim_pool' ? 'swim_open' : s.defaultSport;
  const [sport, setSport] = useState<Sport>(sports.includes(first) ? first : sports[0]);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (sport === 'swim_open') {
      const canOpen = s.sports.includes('swim_open');
      const canPool = s.sports.includes('swim_pool');
      Alert.alert('Start a swim?', 'Where are you swimming?', [
        { text: 'Change sport', style: 'cancel' },
        ...(canOpen ? [{ text: 'Open water (GPS)', onPress: () => onStart('swim_open') }] : []),
        ...(canPool ? [{ text: 'Pool (log lengths)', onPress: onPool }] : []),
      ]);
      return;
    }
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={T.label}>This week · <Text style={{ color: C.text }}>{week.all.toFixed(1)} km</Text></Text>
              {load.acwr != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1, borderColor: TONE[acwrTone(load.zone)] }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: TONE[acwrTone(load.zone)] }} />
                  <Text style={{ color: TONE[acwrTone(load.zone)], fontSize: 11, fontWeight: '700' }}>Load {load.acwr.toFixed(2)}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
              <Big label="Run" km={week.run} />
              <Big label="Bike" km={week.bike} />
              <Big label="Swim" km={week.swim} />
            </View>
            <View style={{ height: 1, backgroundColor: C.line, marginVertical: 12 }} />
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={[T.label, { width: 92 }]}>{new Date().toLocaleDateString('en-ZA', { month: 'long' })}</Text>
              <Text style={[T.small, { flex: 1 }]} numberOfLines={1}>Run {month.run.toFixed(0)} · Bike {month.bike.toFixed(0)} · Swim {month.swim.toFixed(0)}</Text>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{month.all.toFixed(1)} km</Text>
            </View>
          </Hero>
        </Pressable>

        {next ? (
          <Pressable onPress={onEvents} style={{ alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.card2 }}>
            <Text numberOfLines={1} style={{ color: C.text, fontSize: 13, flexShrink: 1 }}>{next.name}</Text>
            <Text style={{ color: C.coral, fontSize: 13, fontWeight: '700' }}>{countdownLabel(next.days)}</Text>
          </Pressable>
        ) : null}

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          {!recording ? <Segmented options={sports.map((sp) => ({ value: sp, label: TAB[sp] }))} value={sport} onChange={setSport} /> : null}
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
              {recording ? 'BACK TO SESSION' : 'START'}
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={onProfile} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
            <Avatar uri={s.photoUri} name={s.name} />
            {s.name ? null : <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Set up profile</Text>}
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <Pressable onPress={onHistory} hitSlop={12}><Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>History ›</Text></Pressable>
          </View>
        </View>
        {syncNote ? <Text style={[T.small, { textAlign: 'center', marginTop: -8 }]}>{syncNote}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
