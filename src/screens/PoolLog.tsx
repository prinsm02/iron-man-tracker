// Pool swims have no GPS: log laps x pool length and the time by hand.
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackBar, Btn, C, Chip, T } from '../ui/kit.tsx';
import { getSettings, saveSettings } from '../lib/settings.ts';
import { createSession, finishSession } from '../lib/db.ts';
import { computeStats, estimateKcal } from '../lib/geo.ts';

export default function PoolLog({ onSaved, onBack }: { onSaved: (id: string) => void; onBack: () => void }) {
  const [len, setLen] = useState(getSettings().poolLengthM);
  const [laps, setLaps] = useState('');
  const [mins, setMins] = useState('');
  const [secs, setSecs] = useState('');
  const [notes, setNotes] = useState('');
  const [route, setRoute] = useState('');

  const lapsN = parseInt(laps, 10) || 0;
  const durS = (parseInt(mins, 10) || 0) * 60 + (parseInt(secs, 10) || 0);
  const ok = lapsN > 0 && durS > 0;

  const save = async () => {
    const now = Date.now();
    const id = `${now}`;
    const startedAt = now - durS * 1000;
    createSession(id, 'swim_pool', startedAt);
    finishSession(id, now, {
      id, sport: 'swim_pool', startedAt, route, runType: '', bike: '', notes, pb: false,
      poolLengthM: len, poolLaps: lapsN, manualDurationS: durS,
      kcal: estimateKcal('swim_pool', getSettings().weightKg, lapsN * len, durS),
    }, computeStats([]));
    await saveSettings({ poolLengthM: len });
    onSaved(id);
  };

  return (
    <SafeAreaView style={T.screen}>
      <BackBar onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <Text style={T.h1}>Pool swim</Text>
        <Text style={T.label}>Pool length</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[25, 33, 50].map((l) => <Chip key={l} label={`${l} m`} selected={len === l} onPress={() => setLen(l)} />)}
        </View>
        <Text style={T.label}>Laps (lengths)</Text>
        <TextInput value={laps} onChangeText={setLaps} keyboardType="number-pad" style={input} placeholder="40" placeholderTextColor={C.dim} />
        <Text style={T.label}>Time</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput value={mins} onChangeText={setMins} keyboardType="number-pad" style={[input, { flex: 1 }]} placeholder="min" placeholderTextColor={C.dim} />
          <TextInput value={secs} onChangeText={setSecs} keyboardType="number-pad" style={[input, { flex: 1 }]} placeholder="sec" placeholderTextColor={C.dim} />
        </View>
        <Text style={T.label}>Pool / location</Text>
        <TextInput value={route} onChangeText={setRoute} style={input} placeholder="e.g. Ellis Park pool" placeholderTextColor={C.dim} />
        <Text style={T.label}>Notes</Text>
        <TextInput value={notes} onChangeText={setNotes} style={[input, { minHeight: 70 }]} multiline placeholderTextColor={C.dim} />
        <Text style={[T.h2, { textAlign: 'center', marginVertical: 8 }]}>{lapsN * len} m</Text>
        <Btn title="SAVE SWIM" onPress={save} disabled={!ok} />
        <Btn title="CANCEL" kind="ghost" onPress={onBack} />
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, color: C.text, padding: 14, fontSize: 18 } as const;
