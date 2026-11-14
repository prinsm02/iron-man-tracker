import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C } from './src/ui/kit.tsx';
import { loadSettings, getSettings, saveSettings } from './src/lib/settings.ts';
import { syncAll } from './src/lib/github.ts';
import { loadHistory, refreshHistory, refreshEvents } from './src/lib/history.ts';
import { ensurePermissions, restore, start } from './src/tracking/tracker.ts';
import Wizard from './src/screens/Wizard.tsx';
import Home from './src/screens/Home.tsx';
import LiveScreen from './src/screens/LiveScreen.tsx';
import SessionScreen from './src/screens/SessionScreen.tsx';
import History from './src/screens/History.tsx';
import PoolLog from './src/screens/PoolLog.tsx';
import SettingsScreen from './src/screens/SettingsScreen.tsx';
import Profile from './src/screens/Profile.tsx';
import Events from './src/screens/Events.tsx';
import Stats from './src/screens/Stats.tsx';
import type { Sport } from './src/lib/geo.ts';

type Route =
  | { name: 'loading' } | { name: 'wizard' } | { name: 'home' } | { name: 'live' } | { name: 'history' }
  | { name: 'pool' } | { name: 'settings' } | { name: 'profile' } | { name: 'events' } | { name: 'stats' } | { name: 'session'; id: string; fresh?: boolean };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'loading' });
  const [syncNote, setSyncNote] = useState('');

  const sync = async () => {
    const r = await syncAll();
    await refreshHistory();
    await refreshEvents();
    if (r.done || r.failed) setSyncNote(r.message);
  };

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      await loadHistory();
      if (!s.setupDone) return setRoute({ name: 'wizard' });
      // A session still open means the app was closed mid-run: carry on recording.
      if (await restore()) return setRoute({ name: 'live' });
      setRoute({ name: 'home' });
      sync();
    })();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') sync(); });
    return () => sub.remove();
  }, []);

  const startSport = async (sport: Sport) => {
    const perm = await ensurePermissions();
    if (perm === 'denied') {
      Alert.alert('Location is off', 'Allow location for Iron Man in iPhone Settings to record.');
      return;
    }
    if (perm === 'whenInUse' && !getSettings().keepScreenOn) {
      Alert.alert('Screen-locked recording needs "Always"', 'Set iPhone Settings > Iron Man > Location to "Always". Until then keep the screen on during the session.');
    }
    await start(sport);
    setRoute({ name: 'live' });
  };

  const goHome = () => { setRoute({ name: 'home' }); sync(); };

  let screen: React.ReactNode;
  switch (route.name) {
    case 'loading':
      screen = (
        <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={C.red} />
          <Text style={{ color: '#888', fontSize: 13 }}>Loading</Text>
        </View>
      );
      break;
    case 'wizard':
      screen = <Wizard onDone={goHome} />;
      break;
    case 'home':
      screen = (
        <Home onStart={startSport} onPool={() => setRoute({ name: 'pool' })} onHistory={() => setRoute({ name: 'history' })}
          onSettings={() => setRoute({ name: 'settings' })} onProfile={() => setRoute({ name: 'profile' })} onEvents={() => setRoute({ name: 'events' })}
          onStats={() => setRoute({ name: 'stats' })} onBackToLive={() => setRoute({ name: 'live' })}
          onSync={async () => setSyncNote((await syncAll()).message)} syncNote={syncNote} />
      );
      break;
    case 'live':
      screen = <LiveScreen onBack={() => setRoute({ name: 'home' })} onFinished={(id) => setRoute(id ? { name: 'session', id, fresh: true } : { name: 'home' })} />;
      break;
    case 'session':
      screen = <SessionScreen key={route.id} id={route.id} fresh={route.fresh} onClose={goHome} />;
      break;
    case 'history':
      screen = <History onOpen={(id) => setRoute({ name: 'session', id })} onBack={goHome} />;
      break;
    case 'pool':
      screen = <PoolLog onSaved={(id) => setRoute({ name: 'session', id, fresh: true })} onBack={goHome} />;
      break;
    case 'profile':
      screen = <Profile onBack={goHome} onEvents={() => setRoute({ name: 'events' })} />;
      break;
    case 'events':
      screen = <Events onBack={goHome} />;
      break;
    case 'stats':
      screen = <Stats onBack={goHome} />;
      break;
    case 'settings':
      screen = (
        <SettingsScreen onBack={goHome} onRerunWizard={async () => { await saveSettings({ setupDone: false }); setRoute({ name: 'wizard' }); }} />
      );
      break;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: C.bg }}>{screen}</View>
    </SafeAreaProvider>
  );
}
