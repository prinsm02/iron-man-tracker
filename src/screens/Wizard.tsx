// First-launch set-up: multiple-choice questions, one per page. Everything can be changed later in Settings.
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackBar, Btn, C, Choice, T } from '../ui/kit.tsx';
import { DEFAULTS, saveSettings, type Settings } from '../lib/settings.ts';
import { SPORT_LABEL, SPORT_ORDER, ordered, type Sport } from '../lib/geo.ts';
import { ensurePermissions } from '../tracking/tracker.ts';

type Opt<V> = { label: string; hint?: string; value: V };

export default function Wizard({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState<Settings>({ ...DEFAULTS });
  const [page, setPage] = useState(0);
  const set = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }));

  // Swim covers open water and pool together.
  const toggleSport = (s: Sport) => {
    const group: Sport[] = s === 'swim_open' || s === 'swim_pool' ? ['swim_open', 'swim_pool'] : [s];
    const on = draft.sports.includes(s);
    set({ sports: on ? draft.sports.filter((x) => !group.includes(x)) : [...draft.sports.filter((x) => !group.includes(x)), ...group] });
  };

  const single = <V,>(opts: Opt<V>[], current: V, pick: (v: V) => void) =>
    opts.map((o) => <Choice key={String(o.value)} label={o.label} hint={o.hint} selected={current === o.value} onPress={() => pick(o.value)} />);

  const pages: { title: string; sub?: string; body: React.ReactNode; ok?: boolean }[] = [
    {
      title: 'Which sports do you train?',
      sub: 'Pick all that apply.',
      ok: draft.sports.length > 0,
      body: SPORT_ORDER.filter((s) => s !== 'swim_pool').map((s) => (
        <Choice key={s} multi label={SPORT_LABEL[s]} selected={draft.sports.includes(s)} onPress={() => toggleSport(s)}
          hint={s === 'swim_open' ? 'Open water with GPS, or pool lengths: you choose when you start' : undefined} />
      )),
    },
    {
      title: 'Which one do you do most?',
      body: single(ordered(draft.sports).filter((s) => s !== 'swim_pool').map((s) => ({ label: SPORT_LABEL[s], value: s })), draft.defaultSport, (v) => set({ defaultSport: v })),
    },
    {
      title: 'What should the live screen show?',
      sub: 'Pick all that apply.',
      body: (
        <>
          <Choice multi label="Big numbers" hint="Time, distance, pace or speed, readable on a bike mount" selected={draft.showBigNumbers} onPress={() => set({ showBigNumbers: !draft.showBigNumbers })} />
          <Choice multi label="Live map" hint="Your route drawn as you go" selected={draft.showMap} onPress={() => set({ showMap: !draft.showMap })} />
          <Choice multi label="Voice callouts" hint="Spoken splits in your earphones" selected={draft.voice} onPress={() => set({ voice: !draft.voice })} />
          <Choice multi label="Auto-pause" hint="Stops the clock at robots and traffic" selected={draft.autoPause} onPress={() => set({ autoPause: !draft.autoPause })} />
        </>
      ),
    },
    {
      title: 'Voice callout on runs',
      body: single([
        { label: 'Every 1 km', value: 1 }, { label: 'Every 2 km', value: 2 }, { label: 'Every 5 km', value: 5 },
      ], draft.voiceEveryKmRun, (v) => set({ voiceEveryKmRun: v })),
    },
    {
      title: 'Voice callout on rides',
      body: single([
        { label: 'Every 1 km', value: 1 }, { label: 'Every 5 km', value: 5 }, { label: 'Every 10 km', value: 10 },
      ], draft.voiceEveryKmBike, (v) => set({ voiceEveryKmBike: v })),
    },
    {
      title: 'Screen while recording',
      body: single([
        { label: 'Let it lock (recommended)', hint: 'GPS keeps recording in your pocket. Saves battery.', value: false },
        { label: 'Keep it on', hint: 'For a bike mount, so you always see the numbers.', value: true },
      ], draft.keepScreenOn, (v) => set({ keepScreenOn: v })),
    },
    {
      title: 'Send results to GitHub?',
      sub: 'Your desktop and Fitness HQ read them from a private repo.',
      body: single([
        { label: 'Yes, set it up in Settings after this', hint: 'Needs a GitHub token you paste in once', value: true },
        { label: 'Not now', hint: 'Sessions stay on the phone; you can export GPX', value: false },
      ], draft.syncEnabled, (v) => set({ syncEnabled: v })),
    },
    {
      title: 'Location access',
      sub: 'Next, iPhone asks for location. Choose "Allow While Using App", then when it asks again choose "Change to Always Allow". "Always" is what lets the app record with the screen locked.',
      body: <Text style={[T.small, { marginTop: 8 }]}>{'You can change this later in iPhone Settings, Mzansi Go, Location.'}</Text>,
    },
  ];

  const p = pages[page];
  const last = page === pages.length - 1;

  const next = async () => {
    if (!last) return setPage(page + 1);
    await ensurePermissions();
    const defaultSport = draft.sports.includes(draft.defaultSport) ? draft.defaultSport : draft.sports[0];
    await saveSettings({ ...draft, defaultSport, setupDone: true });
    onDone();
  };

  return (
    <SafeAreaView style={T.screen}>
      {page > 0 ? <BackBar onBack={() => setPage(page - 1)} /> : null}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[T.label, { color: C.gold }]}>Set-up {page + 1} of {pages.length}</Text>
        <Text style={[T.h1, { marginTop: 8 }]}>{p.title}</Text>
        {p.sub ? <Text style={[T.small, { marginTop: 6, marginBottom: 6, fontSize: 15 }]}>{p.sub}</Text> : null}
        <View style={{ marginTop: 16 }}>{p.body}</View>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 12, padding: 20 }}>
        {page > 0 ? <Btn title="BACK" kind="ghost" onPress={() => setPage(page - 1)} style={{ flex: 1 }} /> : null}
        <Btn title={last ? 'ALLOW + START' : 'NEXT'} onPress={next} disabled={p.ok === false} style={{ flex: 2 }} />
      </View>
    </SafeAreaView>
  );
}
