import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, firebaseConfigured } from './src/services/firebase';
import { fetchUserProfile, initializeUserProfile } from './src/services/user';
import { HomeScreen } from './src/screens/HomeScreen';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { AccessLockedScreen } from './src/screens/AccessLockedScreen';
import { AdminScreen } from './src/screens/AdminScreen';
import { CefrLevel, LearnerProfile, PracticeLanguage } from './src/types';

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

const ADMIN_EMAIL = 'nelalemento@gmail.com';

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

function isAdminAccount(user: User | null, profile: LearnerProfile) {
  return (
    profile.role === 'admin' ||
    user?.email?.trim().toLowerCase() === ADMIN_EMAIL
  );
}

function normalizeProfileForUser(user: User, profile: LearnerProfile) {
  if (user.email?.trim().toLowerCase() === ADMIN_EMAIL) {
    return {
      ...profile,
      role: 'admin' as const,
      subscriptionStatus: 'complimentary' as const,
    };
  }
  return profile;
}

function hasLearningAccess(profile: LearnerProfile, user: User | null) {
  if (isAdminAccount(user, profile)) return true;
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
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('home');
  const [profile, setProfile] = useState<LearnerProfile>(initialProfile);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [practiceLanguage, setPracticeLanguage] = useState<PracticeLanguage>('en');

  const refreshProfile = useCallback(async () => {
    if (!auth?.currentUser) return;
    try {
      const next = await fetchUserProfile();
      const merged = { ...initialProfile, ...next } as LearnerProfile;
      const normalized = normalizeProfileForUser(auth.currentUser, merged);
      setProfile(normalized);
      if (normalized.lastPracticeLanguage) setPracticeLanguage(normalized.lastPracticeLanguage);
      setProfileError('');
    } catch (error: any) {
      setProfileError(error?.message || 'No se pudo cargar tu perfil.');
    }
  }, []);

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setReady(true);
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setProfileError('');

      if (!nextUser) {
        setProfile(initialProfile);
        setTab('home');
        setReady(true);
        return;
      }

      setReady(false);
      try {
        const next = await initializeUserProfile(nextUser.displayName || '');
        const merged = { ...initialProfile, ...next } as LearnerProfile;
        const normalized = normalizeProfileForUser(nextUser, merged);
        setProfile(normalized);
        if (normalized.lastPracticeLanguage) setPracticeLanguage(normalized.lastPracticeLanguage);
      } catch (error: any) {
        if (nextUser.email?.trim().toLowerCase() === ADMIN_EMAIL) {
          setProfile(
            normalizeProfileForUser(nextUser, {
              ...initialProfile,
              displayName: nextUser.displayName || 'Nelson',
              email: nextUser.email || '',
            }),
          );
        } else {
          setProfileError(error?.message || 'No se pudo cargar tu perfil.');
        }
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

  function startPractice(language: PracticeLanguage) {
    setPracticeLanguage(language);
    setProfile((current) => ({ ...current, lastPracticeLanguage: language }));
    setTab('practice');
  }

  if (!firebaseConfigured) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
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
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loading}>Preparando tu inglés…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7FAFD" />
        <AuthScreen />
      </SafeAreaView>
    );
  }

  if (profileError && !isAdminAccount(user, profile)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7FAFD" />
        <View style={styles.center}>
          <Text style={styles.setupTitle}>No pude cargar tu perfil</Text>
          <Text style={styles.setupText}>{profileError}</Text>
          <Pressable style={styles.retryButton} onPress={refreshProfile}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
          <Pressable
            style={styles.exitButton}
            onPress={() => auth && signOut(auth)}
          >
            <Text style={styles.exitText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasLearningAccess(profile, user)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7FAFD" />
        <AccessLockedScreen onSignOut={() => auth && signOut(auth)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7FAFD" />

      <View style={styles.topbar}>
        <View>
          <Text style={styles.brand}>everyone</Text>
          <Text style={styles.brandAccent}>english</Text>
        </View>

        <View style={styles.accountArea}>
          {isAdminAccount(user, profile) && (
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
            onPractice={startPractice}
          />
        )}
        {tab === 'practice' && (
          <PracticeScreen
            level={profile.level}
            practiceLanguage={practiceLanguage}
            onLevelChange={setLevel}
          />
        )}
        {tab === 'progress' && <ProgressScreen profile={profile} />}
        {tab === 'admin' && isAdminAccount(user, profile) && <AdminScreen />}
      </View>

      <View
        style={[
          styles.nav,
          { bottom: Math.max(10, insets.bottom > 0 ? 4 : 10) },
        ]}
      >
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
        {isAdminAccount(user, profile) && (
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
    minHeight: 62,
    paddingHorizontal: 14,
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
  accountArea: { flexDirection: 'row', gap: 5, alignItems: 'center', flexShrink: 1 },
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
    left: 10,
    right: 10,
    minHeight: 64,
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
  retryButton: {
    marginTop: 18,
    backgroundColor: '#2F6FED',
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  retryText: { color: '#FFF', fontWeight: '900' },
});
