import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatCard } from '../components/StatCard';
import { LearnerProfile } from '../types';

export function ProgressScreen({ profile }: { profile: LearnerProfile }) {
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const progress = profile.level === 'A1' ? 28 : profile.level === 'A2' ? 58 : 78;
  return (
    <ScrollView
      contentContainerStyle={[styles.container, compact && styles.containerCompact]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>YOUR PROGRESS</Text>
      <Text style={styles.title}>English that grows with you</Text>
      <View style={[styles.levelCard, compact && styles.levelCardCompact]}>
        <View style={styles.levelCircle}><Text style={styles.level}>{profile.level}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.levelTitle}>Current conversational level</Text>
          <Text style={styles.levelSub}>Emma adjusts vocabulary, speed and questions automatically.</Text>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${progress}%` }]} /></View>
        </View>
      </View>
      <View style={styles.statsRow}>
        <StatCard value={`${profile.totalTurns}`} label="Conversation turns" />
        <StatCard value={`${Math.round(profile.totalMinutes)}m`} label="Speaking time" />
        <StatCard value={`${profile.vocabularyCount}`} label="New words" />
      </View>
      <Text style={styles.section}>What Emma is tracking</Text>
      {['Speaking confidence', 'Grammar patterns', 'Vocabulary you actually use', 'Topics you can sustain', 'Pronunciation goals'].map((item) => (
        <View key={item} style={styles.row}><Text style={styles.check}>✓</Text><Text style={styles.rowText}>{item}</Text></View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 125, backgroundColor: '#F7FAFD', gap: 16 },
  containerCompact: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 118 },
  eyebrow: { color: '#2F6FED', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  title: { color: '#17324D', fontSize: 29, lineHeight: 35, fontWeight: '900' },
  levelCard: { flexDirection: 'row', gap: 18, alignItems: 'center', backgroundColor: '#FFF', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#E5EDF5' },
  levelCardCompact: { alignItems: 'flex-start', gap: 12, padding: 16 },
  levelCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#2F6FED', alignItems: 'center', justifyContent: 'center' },
  level: { color: '#FFF', fontSize: 26, fontWeight: '900' },
  levelTitle: { color: '#17324D', fontSize: 16, fontWeight: '900' },
  levelSub: { marginTop: 5, color: '#6C7B89', lineHeight: 19 },
  bar: { marginTop: 14, height: 9, borderRadius: 6, backgroundColor: '#E5ECF4', overflow: 'hidden' },
  barFill: { height: 9, borderRadius: 6, backgroundColor: '#79C4A3' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  section: { marginTop: 5, color: '#17324D', fontSize: 19, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: '#E7EEF5' },
  check: { width: 28, height: 28, textAlign: 'center', textAlignVertical: 'center', borderRadius: 14, backgroundColor: '#EAF7F1', color: '#277154', fontWeight: '900' },
  rowText: { color: '#40556A', fontWeight: '700' },
});
