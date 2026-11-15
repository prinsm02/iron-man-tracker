import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackBar, Btn, C, Chip, T } from '../ui/kit.tsx';
import { getSettings, getToken, saveSettings, setToken, type Settings } from '../lib/settings.ts';
import { cleanRepo, setupProblem, syncAll, testConnection } from '../lib/github.ts';
import type { Sport } from '../lib/geo.ts';

export default function SettingsScreen({ onBack, onRerunWizard }: { onBack: () => void; onRerunWizard: () => void }) {
  const [s, setS] = useState<Settings>(getSettings());
  const [token, setTok] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<'test' | 'upload' | null>(null);
  const [weightText, setWeightText] = useState(String(getSettings().weightKg));

  const [problem, setProblem] = useState('');
  useEffect(() => { getToken().then((t) => setHasToken(!!t)); }, []);
  useEffect(() => { setupProblem().then(setProblem); }, [s.githubRepo, hasToken]);
  const set = async (p: Partial<Settings>) => setS(await saveSettings(p));

  const Row = ({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line }}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={T.body}>{label}</Text>
        {hint ? <Text style={T.small}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.red }} />
    </View>
  );

  const Pick = <V,>({ label, options, value, onPick, fmt }: { label: string; options: V[]; value: V; onPick: (v: V) => void; fmt: (v: V) => string }) => (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line, gap: 8 }}>
      <Text style={T.body}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => <Chip key={String(o)} label={fmt(o)} selected={o === value} onPress={() => onPick(o)} />)}
      </View>
    </View>
  );

  // One Swim: it switches open water and pool together (which one is picked when you start a swim).
  const SWIM: Sport[] = ['swim_open', 'swim_pool'];
  const has = (k: 'run' | 'bike' | 'swim') => (k === 'swim' ? SWIM.some((x) => s.sports.includes(x)) : s.sports.includes(k));
  const toggleSport = (k: 'run' | 'bike' | 'swim') => {
    const group: Sport[] = k === 'swim' ? SWIM : [k];
    const sports = has(k) ? s.sports.filter((x) => !group.includes(x)) : [...s.sports.filter((x) => !group.includes(x)), ...group];
    if (sports.length) set({ sports });
  };

  return (
    <SafeAreaView style={T.screen}>
      <BackBar onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={T.h1}>Settings</Text>

        <Text style={[T.label, { marginTop: 20, color: C.gold }]}>Sports</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {(['run', 'bike', 'swim'] as const).map((k) => (
            <Chip key={k} label={k === 'run' ? 'Run' : k === 'bike' ? 'Bike' : 'Swim'} selected={has(k)} onPress={() => toggleSport(k)} />
          ))}
        </View>

        <Text style={[T.label, { marginTop: 24, color: C.gold }]}>Live screen</Text>
        <Row label="Big numbers" value={s.showBigNumbers} onChange={(v) => set({ showBigNumbers: v })} />
        <Row label="Live map" value={s.showMap} onChange={(v) => set({ showMap: v })} />
        <Row label="Auto-pause" hint="Stops the clock when you stand still" value={s.autoPause} onChange={(v) => set({ autoPause: v })} />
        <Row label="Keep screen on" hint="Off = the phone can lock and GPS keeps recording" value={s.keepScreenOn} onChange={(v) => set({ keepScreenOn: v })} />

        <Text style={[T.label, { marginTop: 24, color: C.gold }]}>Voice</Text>
        <Row label="Voice callouts" value={s.voice} onChange={(v) => set({ voice: v })} />
        <Pick label="Run: every" options={[1, 2, 5]} value={s.voiceEveryKmRun} onPick={(v) => set({ voiceEveryKmRun: v })} fmt={(v) => `${v} km`} />
        <Pick label="Ride: every" options={[1, 5, 10]} value={s.voiceEveryKmBike} onPick={(v) => set({ voiceEveryKmBike: v })} fmt={(v) => `${v} km`} />
        <Pick label="Swim: every" options={[100, 250, 500]} value={s.voiceEveryMSwim} onPick={(v) => set({ voiceEveryMSwim: v })} fmt={(v) => `${v} m`} />

        <Text style={[T.label, { marginTop: 24, color: C.gold }]}>Weight (kg, for calories)</Text>
        <TextInput value={weightText} keyboardType="decimal-pad" onChangeText={(t) => {
          setWeightText(t);
          const v = parseFloat(t);
          if (v > 30 && v < 200) set({ weightKg: v });
        }} style={input} />
        {weightText.trim() !== '' && !(parseFloat(weightText) > 30 && parseFloat(weightText) < 200) ? (
          <Text style={[T.small, { color: C.warn, marginTop: 6 }]}>Use a weight from 30 to 200 kg.</Text>
        ) : null}

        <Text style={[T.label, { marginTop: 24, color: C.gold }]}>Bike</Text>
        <TextInput value={s.bikeName} onChangeText={(t) => set({ bikeName: t })} placeholder="Bike name (goes into your cycling log)" placeholderTextColor={C.dim} style={input} />

        <Text style={[T.label, { marginTop: 24, color: C.gold }]}>GitHub results</Text>
        <Text style={[T.body, { marginTop: 8, color: problem ? C.warn : C.ok }]}>{problem ? `Not ready: ${problem}` : 'Ready to upload.'}</Text>
        <Row label="Upload automatically" hint="When you tap Save on a session, or 5 minutes after finishing, and when the app opens" value={s.syncEnabled} onChange={(v) => set({ syncEnabled: v })} />
        <Text style={[T.small, { marginTop: 10 }]}>1. Private data repo (owner/name)</Text>
        <TextInput value={s.githubRepo} onChangeText={(t) => set({ githubRepo: t })} placeholder="owner/repo-name" placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false} style={input} />
        {s.githubRepo.trim() && !cleanRepo(s.githubRepo) ? <Text style={[T.small, { color: C.warn, marginTop: 6 }]}>Write it as owner/name, for example someone/my-training-data.</Text> : null}
        <Text style={[T.small, { marginTop: 10, lineHeight: 18 }]}>
          2. Token {hasToken ? 'saved on this phone' : 'not set'}. Use a fine-grained GitHub token for that repo only, with Contents set to Read and write.
        </Text>
        <TextInput value={token} onChangeText={setTok} placeholder={hasToken ? 'Paste a new token to replace it' : 'Paste token'} placeholderTextColor={C.dim}
          autoCapitalize="none" autoCorrect={false} secureTextEntry style={input} />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Btn title="SAVE TOKEN" kind="gold" style={{ flex: 1 }} disabled={!token || busy != null}
            onPress={async () => { await setToken(token); setTok(''); setHasToken(true); setMsg('Token saved.'); }} />
          <Btn title="TEST" kind="ghost" style={{ flex: 1 }} disabled={busy != null} onPress={async () => {
            setBusy('test'); setMsg('Checking…');
            try { setMsg(await testConnection()); } finally { setBusy(null); }
          }} />
        </View>
        <Btn title="UPLOAD NOW" kind="ghost" style={{ marginTop: 10 }} disabled={busy != null} onPress={async () => {
          setBusy('upload'); setMsg('Uploading…');
          try { setMsg((await syncAll({ manual: true })).message); } finally { setBusy(null); setupProblem().then(setProblem); }
        }} />
        {msg ? <Text style={[T.body, { marginTop: 10, color: C.goldSoft }]}>{msg}</Text> : null}

        <View style={{ marginTop: 30, gap: 10 }}>
          <Btn title="RUN SET-UP AGAIN" kind="ghost" onPress={onRerunWizard} />
          <Btn title="DONE" onPress={onBack} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, color: C.text, padding: 14, fontSize: 16, marginTop: 6 } as const;
