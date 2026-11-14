// Events: your selected events (countdowns) on top, then other events coming up (refreshed weekly
// into your private data repo) that you can add with one tap. Hold one of yours to delete it.
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackBar, Btn, C, Chip, T } from '../ui/kit.tsx';
import { getSettings, saveSettings, type AppEvent } from '../lib/settings.ts';
import { daysTo, validDate } from '../lib/events.ts';
import { getDiscover } from '../lib/history.ts';

const KINDS = ['Run', 'Bike', 'Swim', 'Triathlon', 'Other'];

export default function Events({ onBack }: { onBack: () => void }) {
  const [events, setEvents] = useState<AppEvent[]>(getSettings().events);
  const [draft, setDraft] = useState<AppEvent | null>(null);

  const persist = async (list: AppEvent[], deletedId?: string) => {
    setEvents(list);
    const s = getSettings();
    await saveSettings({ events: list, deletedEventIds: deletedId ? [...s.deletedEventIds, deletedId] : s.deletedEventIds });
  };
  const remove = (e: AppEvent) =>
    Alert.alert(`Delete ${e.name}?`, 'It is removed from your events on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist(events.filter((x) => x.id !== e.id), e.id) },
    ]);
  const saveDraft = () => {
    if (!draft) return;
    if (!draft.name.trim() || !validDate(draft.date)) return Alert.alert('Check the event', 'Give it a name and a date like 2026-11-29.');
    persist([...events.filter((e) => e.id !== draft.id), { ...draft, name: draft.name.trim() }]);
    setDraft(null);
  };

  const mine = [...events].sort((a, b) => a.date.localeCompare(b.date)).filter((e) => daysTo(e.date) >= -1);
  const past = events.filter((e) => daysTo(e.date) < -1).length;
  const have = new Set(events.map((e) => e.id));
  const others = getDiscover().filter((d) => !have.has(d.id) && daysTo(d.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <SafeAreaView style={T.screen}>
      <BackBar onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={T.h1}>Events</Text>
          <Pressable onPress={() => setDraft({ id: `${Date.now()}`, name: '', date: '', kind: 'Run' })} hitSlop={10}>
            <Text style={{ color: C.coral, fontWeight: '700', fontSize: 16 }}>+ Add</Text>
          </Pressable>
        </View>

        {draft ? (
          <View style={[T.card, { gap: 10, borderColor: C.red }]}>
            <TextInput value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} placeholder="Event name" placeholderTextColor={C.dim} style={input} />
            <TextInput value={draft.date} onChangeText={(t) => setDraft({ ...draft, date: t })} placeholder="Date: YYYY-MM-DD" placeholderTextColor={C.dim} keyboardType="numbers-and-punctuation" style={input} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {KINDS.map((k) => <Chip key={k} label={k} selected={draft.kind === k} onPress={() => setDraft({ ...draft, kind: k })} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn title="Save" onPress={saveDraft} style={{ flex: 2 }} />
              <Btn title="Cancel" kind="ghost" onPress={() => setDraft(null)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}

        <Text style={T.label}>My events</Text>
        {!mine.length ? <Text style={T.small}>None yet. Add one, or pick from the list below.</Text> : null}
        {mine.map((e, i) => {
          const d = daysTo(e.date);
          return (
            <Pressable key={e.id} onPress={() => setDraft(e)} onLongPress={() => remove(e)} delayLongPress={600}
              style={[T.card, { backgroundColor: i % 2 ? C.card2 : C.card, flexDirection: 'row', alignItems: 'center' }]}>
              <View style={{ flex: 1 }}>
                <Text style={T.label}>{e.kind} · {new Date(e.date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                <Text style={[T.body, { fontWeight: '700', marginTop: 2 }]}>{e.name}</Text>
              </View>
              <Text style={[T.big, { fontSize: 24 }]}>{d <= 0 ? 'today' : `${d}d`}</Text>
            </Pressable>
          );
        })}
        {past ? <Text style={T.small}>{past} past event{past > 1 ? 's' : ''} hidden.</Text> : null}

        <Text style={[T.label, { marginTop: 14 }]}>Coming up</Text>
        {!others.length ? <Text style={T.small}>Nothing new yet. The list refreshes once a week when the app syncs.</Text> : null}
        {others.map((o, i) => (
          <View key={o.id} style={[T.card, { backgroundColor: i % 2 ? C.card2 : C.card, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={T.label}>{o.kind} · {new Date(o.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}{o.place ? ` · ${o.place}` : ''}</Text>
              <Text style={[T.body, { fontWeight: '600', marginTop: 2 }]}>{o.name}</Text>
              {o.note ? <Text style={[T.small, { marginTop: 2 }]}>{o.note}</Text> : null}
            </View>
            <Pressable onPress={() => persist([...events, { id: o.id, name: o.name, date: o.date, kind: o.kind }])} hitSlop={10}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.red }}>
              <Text style={{ color: C.coral, fontWeight: '700' }}>+ Add</Text>
            </Pressable>
          </View>
        ))}
        <Text style={[T.small, { marginTop: 6 }]}>Tap one of yours to edit, hold it to delete.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, color: C.text, padding: 14, fontSize: 16 } as const;
