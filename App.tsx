import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, Pressable, View } from 'react-native';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { firebaseConfigured, db, ensureSignedIn } from './src/services/firebase';
import { HomeScreen } from './src/screens/HomeScreen';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { CefrLevel, LearnerProfile } from './src/types';

const initialProfile: LearnerProfile = {
  level: 'A1',
  displayName: 'Nelson',
  totalTurns: 0,
  totalMinutes: 0,
  streak: 1,
  vocabularyCount: 0,
  lastTopic: 'Anything',
};

type Tab = 'home' | 'practice' | 'progress';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [profile, setProfile] = useState<LearnerProfile>(initialProfile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsubscribe: undefined | (() => void);
    (async () => {
      if (!firebaseConfigured || !db) {
        setReady(true);
        return;
      }
      const user = await ensureSignedIn();
      if (!user) return;
      const ref = doc(db, 'users', user.uid);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        await setDoc(ref, {
          ...initialProfile,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      unsubscribe = onSnapshot(ref, (snap) => {
        if (snap.exists()) setProfile({ ...initialProfile, ...(snap.data() as any) });
        setReady(true);
      });
    })().catch(() => setReady(true));
    return () => unsubscribe?.();
  }, []);

  function setLevel(level: CefrLevel) {
    setProfile((current) => ({ ...current, level }));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7FAFD" />
      {!firebaseConfigured && (
        <View style={styles.setupBanner}>
          <Text style={styles.setupText}>Demo UI · add Firebase config to activate AI conversation</Text>
        </View>
      )}
      <View style={styles.topbar}>
        <View>
          <Text style={styles.brand}>everyone</Text>
          <Text style={styles.brandAccent}>english</Text>
        </View>
        <View style={styles.levelPill}><Text style={styles.levelText}>{profile.level}</Text></View>
      </View>

      <View style={styles.content}>
        {tab === 'home' && <HomeScreen profile={profile} onPractice={() => setTab('practice')} />}
        {tab === 'practice' && <PracticeScreen level={profile.level} onLevelChange={setLevel} />}
        {tab === 'progress' && <ProgressScreen profile={profile} />}
      </View>

      <View style={styles.nav}>
        <NavButton active={tab === 'home'} label="Home" icon="⌂" onPress={() => setTab('home')} />
        <NavButton active={tab === 'practice'} label="Talk" icon="●" onPress={() => setTab('practice')} />
        <NavButton active={tab === 'progress'} label="Progress" icon="↗" onPress={() => setTab('progress')} />
      </View>
    </SafeAreaView>
  );
}

function NavButton({ active, label, icon, onPress }: { active: boolean; label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable style={styles.navButton} onPress={onPress}>
      <Text style={[styles.navIcon, active && styles.navActive]}>{icon}</Text>
      <Text style={[styles.navLabel, active && styles.navActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7FAFD' },
  content: { flex: 1 },
  setupBanner: { backgroundColor: '#FFF2D8', paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  setupText: { color: '#8A5A00', fontSize: 12, fontWeight: '700' },
  topbar: { minHeight: 66, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F7FAFD' },
  brand: { color: '#17324D', fontSize: 18, lineHeight: 18, fontWeight: '900' },
  brandAccent: { color: '#2F6FED', fontSize: 18, lineHeight: 18, fontWeight: '900' },
  levelPill: { backgroundColor: '#17324D', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20 },
  levelText: { color: '#FFF', fontWeight: '900' },
  nav: { position: 'absolute', left: 14, right: 14, bottom: 14, minHeight: 68, flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E3EAF2', shadowColor: '#17324D', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  navButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { color: '#93A0AD', fontSize: 19, fontWeight: '800' },
  navLabel: { color: '#93A0AD', fontSize: 11, fontWeight: '800' },
  navActive: { color: '#2F6FED' },
});
