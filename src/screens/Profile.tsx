// Profile: photo, name, weight, bike, personal records. (Events have their own page.)
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { Avatar, BackBar, Btn, C, T } from '../ui/kit.tsx';
import { getSettings, saveSettings } from '../lib/settings.ts';
import { allRows } from '../lib/history.ts';
import { computeRecords } from '../lib/records.ts';
import { formatIsoDate } from '../lib/events.ts';

export default function Profile({ onBack, onEvents }: { onBack: () => void; onEvents: () => void }) {
  const s0 = getSettings();
  const [name, setName] = useState(s0.name);
  const [weight, setWeight] = useState(String(s0.weightKg));
  const [bike, setBike] = useState(s0.bikeName);
  const [photo, setPhoto] = useState(s0.photoUri);
  const records = computeRecords(allRows());

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets?.[0]) return;
    // keep a copy inside the app, so the photo still shows if it is deleted from Photos
    const src = new File(res.assets[0].uri);
    const dest = new File(Paths.document, `profile-${Date.now()}.jpg`);
    src.copy(dest);
    setPhoto(dest.uri);
    await saveSettings({ photoUri: dest.uri });
  };

  const weightN = parseFloat(weight);
  const weightOk = weightN > 30 && weightN < 200;
  const save = async () => {
    await saveSettings({ name: name.trim(), bikeName: bike.trim(), weightKg: weightOk ? weightN : s0.weightKg });
  };

  return (
    <SafeAreaView style={T.screen}>
      <BackBar onBack={async () => { await save(); onBack(); }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Pressable onPress={pickPhoto}>
            <Avatar size={96} uri={photo} name={name} />
          </Pressable>
          <Pressable onPress={pickPhoto} hitSlop={8}><Text style={{ color: C.coral, fontWeight: '600' }}>{photo ? 'Change photo' : 'Add photo'}</Text></Pressable>
        </View>

        <Text style={T.label}>Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.dim} style={input} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={T.label}>Weight (kg)</Text>
            <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" style={[input, { marginTop: 6 }]} />
            {!weightOk && weight.trim() !== '' ? <Text style={[T.small, { color: C.warn, marginTop: 6 }]}>Use a weight from 30 to 200 kg. Otherwise the saved weight stays.</Text> : null}
          </View>
          <View style={{ flex: 2 }}>
            <Text style={T.label}>Bike</Text>
            <TextInput value={bike} onChangeText={setBike} placeholder="Bike name" placeholderTextColor={C.dim} style={[input, { marginTop: 6 }]} />
          </View>
        </View>

        {records.length ? (
          <View style={{ marginTop: 8 }}>
            <Text style={[T.label, { marginBottom: 6 }]}>Personal records</Text>
            {records.map((r) => (
              <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderColor: C.line }}>
                <Text style={[T.body, { flex: 1, fontSize: 15 }]}>{r.label}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[T.big, { fontSize: 18 }]}>{r.value}</Text>
                  <Text style={T.small}>{formatIsoDate(r.date)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : <Text style={T.small}>Records appear once you have sessions (or your history syncs).</Text>}

        <Btn title="My events" kind="ghost" onPress={async () => { await save(); onEvents(); }} style={{ marginTop: 10 }} />
        <Btn title="Done" onPress={async () => { await save(); onBack(); }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const input = { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, color: C.text, padding: 14, fontSize: 16 } as const;
