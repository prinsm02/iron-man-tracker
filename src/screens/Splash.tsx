// Opening screen: the logo for about 3 seconds while settings and history load.
import React, { useEffect, useRef } from 'react';
import { Animated, Image, Text, View } from 'react-native';
import { C } from '../ui/kit.tsx';

export default function Splash() {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ opacity: fade, transform: [{ scale }], alignItems: 'center', gap: 18 }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 150, height: 150, borderRadius: 34 }} />
        <Text style={{ color: C.text, fontSize: 24, fontWeight: '800', fontStyle: 'italic', letterSpacing: 1 }}>
          IRON <Text style={{ color: C.red }}>MAN</Text>
        </Text>
      </Animated.View>
    </View>
  );
}
