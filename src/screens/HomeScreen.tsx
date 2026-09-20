import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AiTutorAvatar } from '../components/AiTutorAvatar';
import { StatCard } from '../components/StatCard';
import { LearnerProfile } from '../types';

export function HomeScreen({
  profile,
  onPractice,
}: {
  profile: LearnerProfile;
  onPractice: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.eyebrow}>EVERYONE ENGLISH</Text>
          <Text style={styles.title}>Speak first. Learn naturally.</Text>
          <Text style={styles.subtitle}>
            No rigid lessons. Emma follows your level, your mistakes and what you actually want to talk about.
          </Text>
          <Pressable style={styles.primary} onPress={onPractice}>
            <Text style={styles.primaryText}>Start talking</Text>
          </Pressable>
        </View>
        <AiTutorAvatar listening={false} speaking={false} size={190} />
      </View>

      <View style={styles.statsRow}>
        <StatCard value={profile.level} label="Current level" />
        <StatCard value={`${profile.streak}`} label="Day streak" />
        <StatCard value={`${profile.vocabularyCount}`} label="Words learned" />
      </View>

      <Text style={styles.sectionTitle}>Today with Emma</Text>
      <View style={styles.promptCard}>
        <Text style={styles.promptTitle}>Free conversation</Text>
        <Text style={styles.promptText}>
          “Tell me about your day. I’ll help only when you need it.”
        </Text>
      </View>
      <View style={styles.promptCard}>
        <Text style={styles.promptTitle}>Your English, not a textbook</Text>
        <Text style={styles.promptText}>
          Practice work, travel, family, business or any topic. Difficulty adapts from A1 to B1.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 22, paddingBottom: 120, gap: 18, backgroundColor: '#F7FAFD' },
  hero: {
    borderRadius: 30,
    padding: 24,
    backgroundColor: '#EAF3FF',
    gap: 24,
    alignItems: 'center',
  },
  heroText: { width: '100%', maxWidth: 680 },
  eyebrow: { color: '#2F6FED', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { marginTop: 8, color: '#17324D', fontSize: 34, fontWeight: '900', lineHeight: 39 },
  subtitle: { marginTop: 12, color: '#55697D', fontSize: 16, lineHeight: 24 },
  primary: { marginTop: 20, backgroundColor: '#2F6FED', paddingVertical: 15, paddingHorizontal: 22, borderRadius: 16, alignSelf: 'flex-start' },
  primaryText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sectionTitle: { marginTop: 8, color: '#17324D', fontSize: 20, fontWeight: '900' },
  promptCard: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8EEF6', borderRadius: 18, padding: 18 },
  promptTitle: { color: '#17324D', fontWeight: '800', fontSize: 16 },
  promptText: { marginTop: 6, color: '#647588', lineHeight: 21 },
});
