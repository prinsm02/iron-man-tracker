// Profile: name, weight, bike, and the user's own events (stored only on this phone).
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, C, Chip, T } from '../ui/kit.tsx';
import { getSettings, saveSettings, type AppEvent } from '../lib/settings.ts';
import { daysTo, validDate } from '../lib/events.ts';

const KINDS = ['Run', 'Bike', 'Swim', 'Triathlon', 'Other'];

export default function Profile({ onBack }: { onBack: () => void }) {
  const s0 = getSettings();
  const [name, setName] = useState(s0.name);
  const [weight, setWeight] = useState(String(s0.weightKg));
  const [bike, setBike] = useState(s0.bikeName);
  const [events, setEvents] = useState<AppEvent[]>(s0.events);
  const [draft, setDraft] = useState<AppEvent | null>(null);

  const save = async () => {
    const w = parseFloat(weight);
    await saveSettings({ name: name.trim(), bikeName: bike.trim(), weightKg: w > 30 && w < 200 ? w : s0.weightKg, events });
    onBack();
  };

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.name.trim() || !validDate(draft.date)) {
      Alert.alert('Check the event', 'Give it a name and a date like 2026-11-29.');
      return;
    }
    const rest = events.filter((e) => e.id !== draft.id);
    setEvents([...rest, { ...draft, name: draft.name.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
    setDraft(null);
  };

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <SafeAreaView style={T.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={T.h1}>Profile</Text>

        <Text style={T.label}>Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.dim} style={input} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={T.label}>Weight (kg)</Text>
            <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" style={[input, { marginTop: 6 }]} />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={T.label}>Bike</Text>
            <TextInput value={bike} onChangeText={setBike} placeholder="Bike name" placeholderTextColor={C.dim} style={[input, { marginTop: 6 }]} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <Text style={T.label}>My events</Text>
          <Pressable onPress={() => setDraft({ id: `${Date.now()}`, name: '', date: '', kind: 'Run' })} hitSlop={10}>
            <Text style={{ color: C.coral, fontWeight: '700' }}>+ Add</Text>
          </Pressable>
        </View>
        {!sorted.length && !draft ? <Text style={T.small}>No events yet. Add a race or goal to see a countdown on the home screen.</Text> : null}
        {sorted.map((e, i) => {
          const d = daysTo(e.date);
          return (
            <Pressable key={e.id} onPress={() => setDraft(e)} style={[T.card, { backgroundColor: i % 2 ? C.card2 : C.card, flexDirection: 'row', alignItems: 'center' }]}>
              <View style={{ flex: 1 }}>
                <Text style={T.label}>{e.kind} · {e.date}</Text>
                <Text style={[T.body, { fontWeight: '700', marginTop: 2 }]}>{e.name}</Text>
              </View>
              <Text style={[d >= 0 ? T.big : T.small, { fontSize: d >= 0 ? 22 : 13 }]}>{d >= 0 ? `${d}d` : 'done'}</Text>
            </Pressable>
          );
        })}

        {draft ? (
          <View style={[T.card, { gap: 10, borderColor: C.red }]}>
            <TextInput value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} placeholder="Event name" placeholderTextColor={C.dim} style={input} />
            <TextInput value={draft.date} onChangeText={(t) => setDraft({ ...draft, date: t })} placeholder="Date: YYYY-MM-DD" placeholderTextColor={C.dim} keyboardType="numbers-and-punctuation" style={input} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {KINDS.map((k) => <Chip key={k} label={k} selected={draft.kind === k} onPress={() => setDraft({ ...draft, kind: k })} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn title="Save event" onPress={saveDraft} style={{ flex: 2 }} />
              <Btn title={events.some((e) => e.id === draft.id) ? 'Delete' : 'Cancel'} kind="ghost" style={{ flex: 1 }}
                onPress={() => { setEvents(events.filter((e) => e.id !== draft.id)); setDraft(null); }} />
            </View>
          </View>
        ) : null}

        <Btn title="Done" onPress={save} style={{ marginTop: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, color: C.text, padding: 14, fontSize: 16 } as const;
