import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, C, Chip, T } from '../ui/kit.tsx';
import { getSettings, getToken, saveSettings, setToken, type Settings } from '../lib/settings.ts';
import { syncAll, testConnection } from '../lib/github.ts';
import { SPORT_LABEL, type Sport } from '../lib/geo.ts';

export default function SettingsScreen({ onBack, onRerunWizard }: { onBack: () => void; onRerunWizard: () => void }) {
  const [s, setS] = useState<Settings>(getSettings());
  const [token, setTok] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { getToken().then((t) => setHasToken(!!t)); }, []);
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

  const toggleSport = (sp: Sport) => {
    const sports = s.sports.includes(sp) ? s.sports.filter((x) => x !== sp) : [...s.sports, sp];
    if (sports.length) set({ sports });
  };

  return (
    <SafeAreaView style={T.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={T.h1}>Settings</Text>

        <Text style={[T.label, { marginTop: 20, color: C.gold }]}>Sports</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {(['run', 'bike', 'swim_open', 'swim_pool'] as Sport[]).map((sp) => (
            <Chip key={sp} label={SPORT_LABEL[sp]} selected={s.sports.includes(sp)} onPress={() => toggleSport(sp)} />
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
        <TextInput value={String(s.weightKg)} keyboardType="decimal-pad" onChangeText={(t) => { const v = parseFloat(t); if (v > 30 && v < 200) set({ weightKg: v }); }} style={input} />

        <Text style={[T.label, { marginTop: 24, color: C.gold }]}>Bike</Text>
        <TextInput value={s.bikeName} onChangeText={(t) => set({ bikeName: t })} placeholder="Bike name (goes into your cycling log)" placeholderTextColor={C.dim} style={input} />

        <Text style={[T.label, { marginTop: 24, color: C.gold }]}>GitHub results</Text>
        <Row label="Upload finished sessions" value={s.syncEnabled} onChange={(v) => set({ syncEnabled: v })} />
        <Text style={[T.small, { marginTop: 10 }]}>Private data repo (owner/name)</Text>
        <TextInput value={s.githubRepo} onChangeText={(t) => set({ githubRepo: t })} autoCapitalize="none" autoCorrect={false} style={input} />
        <Text style={[T.small, { marginTop: 10 }]}>
          Token {hasToken ? '(saved in the iPhone Keychain)' : '(not set)'}: a fine-grained GitHub token with access to only that repo, Contents: Read and write.
        </Text>
        <TextInput value={token} onChangeText={setTok} placeholder={hasToken ? 'Paste a new token to replace it' : 'Paste token'} placeholderTextColor={C.dim}
          autoCapitalize="none" autoCorrect={false} secureTextEntry style={input} />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Btn title="SAVE TOKEN" kind="gold" style={{ flex: 1 }} disabled={!token}
            onPress={async () => { await setToken(token); setTok(''); setHasToken(true); setMsg('Token saved.'); }} />
          <Btn title="TEST" kind="ghost" style={{ flex: 1 }} onPress={async () => setMsg(await testConnection())} />
        </View>
        <Btn title="UPLOAD NOW" kind="ghost" style={{ marginTop: 10 }} onPress={async () => setMsg((await syncAll()).message)} />
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
