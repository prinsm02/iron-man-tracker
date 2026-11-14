// Side panel (opened with the menu button on Home): the places that are not the record screen.
import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, T } from './kit.tsx';
import { getSettings } from '../lib/settings.ts';

export type PanelTarget = 'profile' | 'events' | 'stats' | 'history' | 'settings' | 'sync';

export default function SidePanel({ open, onClose, onGo }: { open: boolean; onClose: () => void; onGo: (t: PanelTarget) => void }) {
  const x = useRef(new Animated.Value(-300)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: open ? 0 : -300, duration: 220, useNativeDriver: true }).start();
  }, [open]);
  const s = getSettings();
  const items: { key: PanelTarget; label: string; sub: string }[] = [
    { key: 'profile', label: 'Profile', sub: 'Photo, name, weight, bike, records' },
    { key: 'events', label: 'Events', sub: s.events.length ? `${s.events.length} of yours + what is coming up` : 'Your races + what is coming up' },
    { key: 'stats', label: 'Stats', sub: 'Charts of your training' },
    { key: 'history', label: 'History', sub: 'Every session' },
    { key: 'sync', label: 'Upload now', sub: s.syncEnabled ? 'Send new sessions to GitHub' : 'GitHub sync is off' },
    { key: 'settings', label: 'Settings', sub: 'Live screen, voice, GPS, GitHub' },
  ];
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose}>
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 280, backgroundColor: C.side, borderRightWidth: 1, borderColor: C.line, transform: [{ translateX: x }] }}>
          <Pressable style={{ flex: 1 }} onPress={() => {}}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={{ padding: 20, borderBottomWidth: 1, borderColor: C.line }}>
                <Text numberOfLines={1} style={[T.h2, { fontSize: 17 }]}>{s.name || 'Iron Man'}</Text>
                <Text numberOfLines={1} style={T.small}>{s.weightKg} kg{s.bikeName ? ` · ${s.bikeName}` : ''}</Text>
              </View>
              {items.map((it) => (
                <Pressable key={it.key} onPress={() => { onClose(); onGo(it.key); }}
                  style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 20, backgroundColor: pressed ? '#151515' : 'transparent', borderLeftWidth: 2, borderColor: pressed ? C.red : 'transparent' })}>
                  <Text style={[T.body, { fontWeight: '600' }]}>{it.label}</Text>
                  <Text numberOfLines={2} style={T.small}>{it.sub}</Text>
                </Pressable>
              ))}
            </SafeAreaView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
