import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AiTutorAvatar } from '../components/AiTutorAvatar';
import { StatCard } from '../components/StatCard';
import { LearnerProfile, PracticeLanguage } from '../types';

export function HomeScreen({
  profile,
  onPractice,
}: {
  profile: LearnerProfile;
  onPractice: (language: PracticeLanguage) => void;
}) {
  const { width, height } = useWindowDimensions();
  const compact = width < 390 || height < 760;
  const avatarSize = Math.max(145, Math.min(compact ? 160 : 190, width - 120));

  return (
    <ScrollView
      contentContainerStyle={[styles.container, compact && styles.containerCompact]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.eyebrow}>EVERYONE ENGLISH</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>Speak first. Learn naturally.</Text>
          <Text style={styles.subtitle}>
            No rigid lessons. Emma follows your level, your mistakes and what you actually want to talk about.
          </Text>
          <Text style={styles.languagePrompt}>Elige qué idioma quieres practicar hoy</Text>
          <View style={styles.languageGrid}>
            <LanguageButton flag="🇪🇸" label="Español" caption="Practicar español" onPress={() => onPractice('es')} />
            <LanguageButton flag="🇬🇧" label="English" caption="Practice English" onPress={() => onPractice('en')} />
            <LanguageButton flag="🇫🇷" label="Français" caption="Pratiquer le français" onPress={() => onPractice('fr')} />
          </View>
        </View>
        <AiTutorAvatar listening={false} speaking={false} thinking={false} size={avatarSize} />
      </View>

      <View style={styles.statsRow}>
        <StatCard value={profile.level} label="Current level" />
        <StatCard value={`${profile.streak}`} label="Day streak" />
        <StatCard value={`${profile.vocabularyCount}`} label="Words learned" />
      </View>

      <Text style={styles.sectionTitle}>Practica con Emma</Text>
      <View style={styles.promptCard}>
        <Text style={styles.promptTitle}>Free conversation</Text>
        <Text style={styles.promptText}>
          Habla de tu día, trabajo, viajes, familia o cualquier tema. Emma se adapta al idioma que elijas.
        </Text>
      </View>
      <View style={styles.promptCard}>
        <Text style={styles.promptTitle}>Tu idioma, no un libro de texto</Text>
        <Text style={styles.promptText}>
          Español, inglés o francés con conversación natural. La dificultad se adapta de A1 a B1.
        </Text>
      </View>
    </ScrollView>
  );
}


function LanguageButton({
  flag,
  label,
  caption,
  onPress,
}: {
  flag: string;
  label: string;
  caption: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.languageButton} onPress={onPress}>
      <Text style={styles.languageFlag}>{flag}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.languageLabel}>{label}</Text>
        <Text style={styles.languageCaption}>{caption}</Text>
      </View>
      <Text style={styles.languageArrow}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 125, gap: 16, backgroundColor: '#F7FAFD' },
  containerCompact: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 118 },
  hero: {
    borderRadius: 30,
    padding: 20,
    backgroundColor: '#EAF3FF',
    gap: 24,
    alignItems: 'center',
  },
  heroText: { width: '100%', maxWidth: 680 },
  eyebrow: { color: '#2F6FED', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { marginTop: 8, color: '#17324D', fontSize: 32, fontWeight: '900', lineHeight: 37 },
  titleCompact: { fontSize: 28, lineHeight: 33 },
  subtitle: { marginTop: 12, color: '#55697D', fontSize: 16, lineHeight: 24 },
  languagePrompt: { marginTop: 20, color: '#17324D', fontWeight: '900', fontSize: 15 },
  languageGrid: { marginTop: 10, width: '100%', gap: 9 },
  languageButton: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DCE7F4', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  languageFlag: { fontSize: 24 },
  languageLabel: { color: '#17324D', fontWeight: '900', fontSize: 15 },
  languageCaption: { marginTop: 2, color: '#738496', fontSize: 11 },
  languageArrow: { color: '#2F6FED', fontSize: 26, fontWeight: '700' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sectionTitle: { marginTop: 8, color: '#17324D', fontSize: 20, fontWeight: '900' },
  promptCard: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8EEF6', borderRadius: 18, padding: 18 },
  promptTitle: { color: '#17324D', fontWeight: '800', fontSize: 16 },
  promptText: { marginTop: 6, color: '#647588', lineHeight: 21 },
});
