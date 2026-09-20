import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, firebaseConfigured } from './src/services/firebase';
import { fetchUserProfile, initializeUserProfile } from './src/services/user';
import { HomeScreen } from './src/screens/HomeScreen';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { AccessLockedScreen } from './src/screens/AccessLockedScreen';
import { AdminScreen } from './src/screens/AdminScreen';
import { CefrLevel, LearnerProfile } from './src/types';

const initialProfile: LearnerProfile = {
  level: 'A1',
  displayName: '',
  role: 'student',
  subscriptionStatus: 'trial',
  totalTurns: 0,
  totalMinutes: 0,
  streak: 1,
  vocabularyCount: 0,
  lastTopic: 'Anything',
};

type Tab = 'home' | 'practice' | 'progress' | 'admin';

function timestampToMs(value: any): number {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function hasLearningAccess(profile: LearnerProfile) {
  if (profile.role === 'admin') return true;
  if (
    profile.subscriptionStatus === 'active' ||
    profile.subscriptionStatus === 'complimentary'
  ) {
    return true;
  }
  if (profile.subscriptionStatus !== 'trial') return false;
  return timestampToMs(profile.trialEndsAt) > Date.now();
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [profile, setProfile] = useState<LearnerProfile>(initialProfile);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refreshProfile = useCallback(async () => {
    if (!auth?.currentUser) return;
    try {
      const next = await fetchUserProfile();
      setProfile({ ...initialProfile, ...next });
    } catch {
      // A temporary network error should not log the user out.
    }
  }, []);

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setReady(true);
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setProfile(initialProfile);
        setTab('home');
        setReady(true);
        return;
      }

      setReady(false);
      try {
        const next = await initializeUserProfile(nextUser.displayName || '');
        setProfile({ ...initialProfile, ...next });
      } finally {
        setReady(true);
      }
    });

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(refreshProfile, 60_000);
    return () => clearInterval(timer);
  }, [user, refreshProfile]);

  function setLevel(level: CefrLevel) {
    setProfile((current) => ({ ...current, level }));
  }

  if (!firebaseConfigured) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.setupTitle}>Everyone English</Text>
          <Text style={styles.setupText}>
            Falta configurar Firebase en el archivo .env de este dispositivo.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loading}>Preparando tu inglés…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7FAFD" />
        <AuthScreen />
      </SafeAreaView>
    );
  }

  if (!hasLearningAccess(profile)) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7FAFD" />
        <AccessLockedScreen onSignOut={() => auth && signOut(auth)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7FAFD" />

      <View style={styles.topbar}>
        <View>
          <Text style={styles.brand}>everyone</Text>
          <Text style={styles.brandAccent}>english</Text>
        </View>

        <View style={styles.accountArea}>
          {profile.role === 'admin' && (
            <View style={styles.adminPill}>
              <Text style={styles.adminText}>ADMIN</Text>
            </View>
          )}
          <View style={styles.levelPill}>
            <Text style={styles.levelText}>{profile.level}</Text>
          </View>
          <Pressable
            onPress={() => auth && signOut(auth)}
            style={styles.exitButton}
          >
            <Text style={styles.exitText}>Salir</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        {tab === 'home' && (
          <HomeScreen
            profile={profile}
            onPractice={() => setTab('practice')}
          />
        )}
        {tab === 'practice' && (
          <PracticeScreen
            level={profile.level}
            onLevelChange={setLevel}
          />
        )}
        {tab === 'progress' && <ProgressScreen profile={profile} />}
        {tab === 'admin' && profile.role === 'admin' && <AdminScreen />}
      </View>

      <View style={styles.nav}>
        <NavButton
          active={tab === 'home'}
          label="Home"
          icon="⌂"
          onPress={() => setTab('home')}
        />
        <NavButton
          active={tab === 'practice'}
          label="Talk"
          icon="●"
          onPress={() => setTab('practice')}
        />
        <NavButton
          active={tab === 'progress'}
          label="Progress"
          icon="↗"
          onPress={() => {
            refreshProfile();
            setTab('progress');
          }}
        />
        {profile.role === 'admin' && (
          <NavButton
            active={tab === 'admin'}
            label="Admin"
            icon="⚙"
            onPress={() => setTab('admin')}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function NavButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: string;
  onPress: () => void;
}) {
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  loading: { marginTop: 12, color: '#657687', fontWeight: '700' },
  setupTitle: { color: '#17324D', fontSize: 28, fontWeight: '900' },
  setupText: {
    marginTop: 10,
    color: '#657687',
    textAlign: 'center',
  },
  topbar: {
    minHeight: 66,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7FAFD',
  },
  brand: {
    color: '#17324D',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '900',
  },
  brandAccent: {
    color: '#2F6FED',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '900',
  },
  accountArea: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  adminPill: {
    backgroundColor: '#EAF7F1',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 20,
  },
  adminText: { color: '#277154', fontSize: 10, fontWeight: '900' },
  levelPill: {
    backgroundColor: '#17324D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  levelText: { color: '#FFF', fontWeight: '900' },
  exitButton: { paddingHorizontal: 9, paddingVertical: 8 },
  exitText: { color: '#7A8998', fontSize: 12, fontWeight: '800' },
  nav: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    minHeight: 68,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E3EAF2',
    shadowColor: '#17324D',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navIcon: { color: '#93A0AD', fontSize: 19, fontWeight: '800' },
  navLabel: { color: '#93A0AD', fontSize: 11, fontWeight: '800' },
  navActive: { color: '#2F6FED' },
});
