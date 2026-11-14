// Look = Matthew's Running Dashboard Pro: near-black, #1a1a1a / #111 cards with #222 borders,
// coral numbers #ff6b6b with a soft red glow, small grey uppercase labels, red bar with a white dot.
// Rule: one hero number per screen, very few words.
import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type ViewStyle, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const C = {
  bg: '#0d0d0d',
  side: '#0a0a0a',
  card: '#1a1a1a',
  card2: '#111111',
  line: '#222222',
  text: '#f0f0f0',
  dim: '#888888',
  red: '#d93535',
  coral: '#ff6b6b',
  red3: '#e84040',
  ok: '#44dd88',
  warn: '#ff9900',
  // kept for older imports
  gold: '#ff6b6b',
  goldSoft: '#ff6b6b',
  visor: '#f0f0f0',
  panel: '#1a1a1a',
  panel2: '#111111',
  redDark: '#3a0d0d',
  good: '#44dd88',
};

const glow = { textShadowColor: 'rgba(217,53,53,0.35)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18 } as const;

export const T = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: 28, fontWeight: '700' },
  h2: { color: C.text, fontSize: 20, fontWeight: '700' },
  label: { color: C.dim, fontSize: 11, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase' },
  body: { color: C.text, fontSize: 16 },
  small: { color: C.dim, fontSize: 12 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.line },
  big: { color: C.coral, fontWeight: '700', fontVariant: ['tabular-nums'], ...glow },
  num: { color: C.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

/** The dashboard's hero card: dark with a red glow from the top-right corner. */
export function Hero({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: '#111', overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={['rgba(217,53,53,0.28)', 'rgba(217,53,53,0.06)', 'transparent']}
        locations={[0, 0.45, 1]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ padding: 20 }}>{children}</View>
    </View>
  );
}

/** Red-to-coral bar with the white glowing dot, as on the dashboard. */
export function GBar({ pct, style }: { pct: number; style?: ViewStyle }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <View style={[{ height: 8, borderRadius: 4, backgroundColor: C.line, marginTop: 10 }, style]}>
      <LinearGradient colors={['#c02020', C.red3]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 8, borderRadius: 4, width: `${p}%` }} />
      {p > 0 ? (
        <View style={{ position: 'absolute', left: `${p}%`, marginLeft: -6, top: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.6, shadowRadius: 6 }} />
      ) : null}
    </View>
  );
}

export function Btn({
  title, onPress, kind = 'primary', style, disabled,
}: { title: string; onPress: () => void; kind?: 'primary' | 'gold' | 'ghost' | 'danger'; style?: ViewStyle; disabled?: boolean }) {
  const bg = kind === 'primary' ? C.red : kind === 'gold' ? C.text : kind === 'danger' ? '#2a1212' : 'transparent';
  const fg = kind === 'gold' ? '#0d0d0d' : kind === 'danger' ? C.coral : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.35 : pressed ? 0.75 : 1 },
        kind === 'ghost' && { borderWidth: 1, borderColor: C.line },
        style,
      ]}
    >
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

/** Press and hold to confirm (FINISH), so a bump in the pocket cannot end a session. */
export function HoldBtn({ title, onDone, ms = 1200, style }: { title: string; onDone: () => void; ms?: number; style?: ViewStyle }) {
  const prog = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const begin = () => {
    anim.current = Animated.timing(prog, { toValue: 1, duration: ms, useNativeDriver: false });
    anim.current.start(({ finished }) => {
      if (finished) { prog.setValue(0); onDone(); }
    });
  };
  const cancel = () => { anim.current?.stop(); Animated.timing(prog, { toValue: 0, duration: 150, useNativeDriver: false }).start(); };
  return (
    <Pressable onPressIn={begin} onPressOut={cancel} onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[s.btn, { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }, style]}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.red, width: prog.interpolate({ inputRange: [0, 1], outputRange: [0, w] }) }} />
      <Text style={s.btnText}>{title}</Text>
      <Text style={[T.label, { fontSize: 9, marginTop: 2 }]}>hold</Text>
    </Pressable>
  );
}

/** Multiple-choice option (wizard). */
export function Choice({ label, hint, selected, onPress, multi }: { label: string; hint?: string; selected: boolean; onPress: () => void; multi?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[s.choice, selected && { borderColor: C.red, backgroundColor: '#1d1111' }]}>
      <View style={[s.dot, multi && { borderRadius: 5 }, selected && { borderColor: C.coral, backgroundColor: C.coral }]} />
      <View style={{ flex: 1 }}>
        <Text style={T.body}>{label}</Text>
        {hint ? <Text style={[T.small, { marginTop: 2 }]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Text tab like the dashboard's side menu: grey, white with a red underline when on. */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 8, paddingHorizontal: 2, marginRight: 16, borderBottomWidth: 2, borderColor: selected ? C.red : 'transparent' }}>
      <Text style={{ color: selected ? C.text : C.dim, fontSize: 15, fontWeight: selected ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export function Stat({ label, value, unit, big, style, color }: { label: string; value: string; unit?: string; big?: boolean; style?: ViewStyle; color?: string }) {
  return (
    <View style={[{ flex: 1, paddingVertical: 6 }, style]}>
      <Text style={T.label}>{label}</Text>
      <Text style={[big ? T.big : T.num, { fontSize: big ? 56 : 26, marginTop: 2 }, color ? { color } : null] as TextStyle[]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={s.unit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { color: C.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.6 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, marginBottom: 10 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.dim },
  unit: { color: C.dim, fontSize: 14, fontWeight: '600', textShadowRadius: 0 },
});
