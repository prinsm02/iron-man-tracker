import React, { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackBar, C, Chip, T } from '../ui/kit.tsx';
import { deleteSession, listFinished, type SessionRow } from '../lib/db.ts';
import { fmtDuration, fmtPace, kmh, SPORT_LABEL, type Sport, type Stats } from '../lib/geo.ts';
import type { SessionMeta } from '../lib/export.ts';

export default function History({ onOpen, onBack }: { onOpen: (id: string) => void; onBack: () => void }) {
  const [filter, setFilter] = useState<Sport | 'all'>('all');
  const [, setVersion] = useState(0);
  const askDelete = (item: SessionRow) =>
    Alert.alert('Delete this session?', 'It is removed from the phone. Anything already uploaded to GitHub stays there.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteSession(item.id); setVersion((v) => v + 1); } },
    ]);
  const all = listFinished();
  // one Swim filter covers open water and pool
  const rows = all.filter((r) => filter === 'all' || r.sport === filter || (filter === 'swim_open' && r.sport === 'swim_pool'));
  const filterName = filter === 'all' ? 'sessions' : `${SPORT_LABEL[filter].toLowerCase()} sessions`;

  const line = (r: SessionRow) => {
    const st: Stats = JSON.parse(r.stats || '{}');
    const m: SessionMeta = JSON.parse(r.meta || '{}');
    const pool = r.sport === 'swim_pool';
    const dist = pool ? (m.poolLaps ?? 0) * (m.poolLengthM ?? 0) : st.distanceM ?? 0;
    const dur = pool ? m.manualDurationS ?? 0 : st.movingS ?? 0;
    const avg = dur ? dist / dur : 0;
    const swim = r.sport.startsWith('swim');
    const pace = r.sport === 'bike'
      ? `${kmh(avg).toFixed(1)} km/h`
      : `${fmtPace(avg, swim ? 100 : 1000)} ${swim ? 'min/100m' : 'min/km'}`;
    return {
      dist: swim ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(2)} km`,
      dur: fmtDuration(dur),
      pace,
      pb: m.pb,
    };
  };

  return (
    <SafeAreaView style={T.screen}>
      <BackBar onBack={onBack} />
      <View style={{ padding: 20, paddingTop: 4, gap: 12 }}>
        <Text style={T.h1}>History</Text>
        {all.length ? <Text style={T.small}>Hold a session to remove it from this phone.</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['all', 'run', 'bike', 'swim_open'] as const).map((f) => (
            <Chip key={f} label={f === 'all' ? 'All' : SPORT_LABEL[f]} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 20 }}
        ListEmptyComponent={<Text style={[T.small, { textAlign: 'center', marginTop: 40, lineHeight: 18 }]}>{all.length ? `No ${filterName} in this list.` : 'No sessions yet. A finished run, ride or swim shows up here.'}</Text>}
        renderItem={({ item, index }) => {
          const l = line(item);
          const d = new Date(item.started_at).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
          return (
            <Pressable onPress={() => onOpen(item.id)} onLongPress={() => askDelete(item)} delayLongPress={600} style={({ pressed }) => [T.card, { backgroundColor: index % 2 ? C.card2 : C.card, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={T.label}>{d} · {SPORT_LABEL[item.sport]}{l.pb ? <Text style={{ color: C.coral }}> · PB</Text> : null}</Text>
              <Text style={[l.pb ? T.big : T.num, { fontSize: 24, marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>{l.dist}</Text>
              <Text style={[T.small, { marginTop: 2 }]}>{l.dur} · {l.pace}</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
