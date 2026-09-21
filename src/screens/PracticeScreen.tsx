import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { AiTutorAvatar } from '../components/AiTutorAvatar';
import { playBase64Audio, sendConversationTurn } from '../services/conversation';
import { CefrLevel, ConversationTurn, PracticeLanguage } from '../types';

const topics = ['My day', 'Work', 'Travel', 'Family', 'Business', 'Food', 'Hobbies', 'Shopping', 'Plans', 'Anything'];

export function PracticeScreen({
  level,
  practiceLanguage,
  onLevelChange,
}: {
  level: CefrLevel;
  practiceLanguage: PracticeLanguage;
  onLevelChange: (level: CefrLevel) => void;
}) {
  const { width, height } = useWindowDimensions();
  const compact = width < 390 || height < 760;
  const avatarSize = Math.max(150, Math.min(compact ? 175 : 210, width - 96));

  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  const [topic, setTopic] = useState('Anything');
  const [busy, setBusy] = useState(false);
  const [turn, setTurn] = useState<ConversationTurn | null>(null);
  const [typed, setTyped] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [topicNotice, setTopicNotice] = useState('');

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true }).catch(() => null);
  }, []);

  const statusText = useMemo(() => {
    if (recorderState.isRecording) return 'I’m listening. Speak naturally.';
    if (busy) return 'Emma is thinking…';
    if (playerStatus.playing) return 'Emma is speaking…';
    return 'Tap the microphone and talk.';
  }, [busy, playerStatus.playing, recorderState.isRecording]);

  function applyTutorResponse(response: ConversationTurn) {
    setTurn(response);
    onLevelChange(response.level);
    if (response.topic && topics.includes(response.topic)) {
      setTopic(response.topic);
    }
  }

  function chooseTopic(item: string) {
    if (busy || recorderState.isRecording) return;
    setTopic(item);
    setTurn(null);
    setTyped('');
    setTopicNotice('Nuevo tema: ' + item + '. Empieza cuando quieras.');
  }

  function changeTopic() {
    if (busy || recorderState.isRecording) return;
    const available = topics.filter((item) => item !== topic && item !== 'Anything');
    const currentIndex = Math.max(0, topics.indexOf(topic));
    const next = available[currentIndex % available.length] || 'Travel';
    chooseTopic(next);
  }

  async function startRecording() {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone', 'Please allow microphone access to practice speaking.');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStartedAt(Date.now());
    } catch (error: any) {
      Alert.alert('Microphone', error?.message || 'Could not start recording.');
    }
  }

  async function stopAndSend() {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;
      const seconds = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : 0;
      setStartedAt(null);
      setBusy(true);
      const response = await sendConversationTurn({ audioUri: uri, level, topic, practiceLanguage, seconds });
      applyTutorResponse(response);
      if (response.audioBase64) await playBase64Audio(player, response.audioBase64);
    } catch (error: any) {
      Alert.alert('Conversation', error?.message || 'The turn could not be processed.');
    } finally {
      setBusy(false);
    }
  }

  async function sendText() {
    const text = typed.trim();
    if (!text || busy) return;
    try {
      setBusy(true);
      setTyped('');
      const response = await sendConversationTurn({ text, level, topic, practiceLanguage, seconds: 0 });
      applyTutorResponse(response);
      if (response.audioBase64) await playBase64Audio(player, response.audioBase64);
    } catch (error: any) {
      Alert.alert('Conversation', error?.message || 'The message could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        compact && styles.containerCompact,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>CONVERSATION</Text>
      <Text style={styles.title}>Talk to Emma</Text>
      <Text style={styles.languageLine}>
        {practiceLanguage === 'es' ? '🇪🇸 Practicando Español' : practiceLanguage === 'fr' ? '🇫🇷 Pratiquant le français' : '🇬🇧 Practicing English'}
      </Text>
      <Text style={styles.status}>{statusText}</Text>

      <View style={[styles.avatarWrap, compact && styles.avatarWrapCompact]}>
        <AiTutorAvatar
          listening={recorderState.isRecording}
          speaking={playerStatus.playing}
          thinking={busy && !playerStatus.playing}
          size={avatarSize}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topics}>
        {topics.map((item) => (
          <Pressable
            key={item}
            onPress={() => chooseTopic(item)}
            style={[styles.topic, topic === item && styles.topicActive]}
          >
            <Text style={[styles.topicText, topic === item && styles.topicTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.topicControl}>
        <View style={{ flex: 1 }}>
          <Text style={styles.currentTopicLabel}>TEMA ACTUAL</Text>
          <Text style={styles.currentTopic}>{topic}</Text>
        </View>
        <Pressable
          disabled={busy || recorderState.isRecording}
          onPress={changeTopic}
          style={styles.changeTopic}
        >
          <Text style={styles.changeTopicText}>↻ Cambiar tema</Text>
        </Pressable>
      </View>
      <Text style={styles.changeTopicHint}>
        También puedes decirle a Emma: “Let's change the topic.”
      </Text>
      {!!topicNotice && <Text style={styles.topicNotice}>{topicNotice}</Text>}

      <Pressable
        disabled={busy}
        onPress={recorderState.isRecording ? stopAndSend : startRecording}
        style={[
          styles.mic,
          recorderState.isRecording && styles.micRecording,
          busy && styles.micDisabled,
        ]}
      >
        <Text style={styles.micIcon}>{recorderState.isRecording ? '■' : '●'}</Text>
        <Text style={styles.micText}>{recorderState.isRecording ? 'Stop & send' : 'Speak'}</Text>
      </Pressable>

      <View style={styles.textRow}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="Or type what you want to say…"
          placeholderTextColor="#9AA8B6"
          style={styles.input}
          onSubmitEditing={sendText}
          returnKeyType="send"
        />
        <Pressable onPress={sendText} style={styles.send}><Text style={styles.sendText}>Send</Text></Pressable>
      </View>

      {turn && (
        <View style={styles.conversationCard}>
          <Text style={styles.label}>YOU SAID</Text>
          <Text style={styles.userText}>{turn.transcript}</Text>

          <Text style={[styles.label, { marginTop: 18 }]}>EMMA</Text>
          <Text style={styles.reply}>{turn.reply}</Text>

          {!!turn.audioBase64 && (
            <Pressable
              disabled={playerStatus.playing}
              onPress={() => playBase64Audio(player, turn.audioBase64 || '')}
              style={[styles.listenAgain, playerStatus.playing && styles.listenAgainDisabled]}
            >
              <Text style={styles.listenAgainIcon}>▶</Text>
              <Text style={styles.listenAgainText}>
                {playerStatus.playing ? 'Emma is speaking…' : 'Listen again'}
              </Text>
            </Pressable>
          )}

          {turn.correction ? (
            <View style={styles.correction}>
              <Text style={styles.correctionTitle}>A more natural way</Text>
              <Text style={styles.correctionText}>{turn.correction}</Text>
              {!!turn.explanationEs && <Text style={styles.explanation}>{turn.explanationEs}</Text>}
            </View>
          ) : null}

          {level === 'A1' && !!turn.suggestedReply && (
            <View style={styles.suggestion}>
              <Text style={styles.suggestionTitle}>EJEMPLO DE RESPUESTA</Text>
              <Text style={styles.suggestionText}>{turn.suggestedReply}</Text>
              <Text style={styles.suggestionHelp}>Puedes leer esta frase y responder hablando.</Text>
              <Pressable
                onPress={() => setTyped(turn.suggestedReply || '')}
                style={styles.useSuggestion}
              >
                <Text style={styles.useSuggestionText}>Usar este ejemplo</Text>
              </Pressable>
            </View>
          )}

          {!!turn.tipEs && (
            <View style={styles.tip}>
              <Text style={styles.tipTitle}>Coach tip</Text>
              <Text style={styles.tipText}>{turn.tipEs}</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 125, backgroundColor: '#F7FAFD' },
  containerCompact: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 118 },
  eyebrow: { color: '#2F6FED', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  title: { marginTop: 5, color: '#17324D', fontSize: 28, fontWeight: '900' },
  status: { marginTop: 5, color: '#68798A' },
  languageLine: { marginTop: 5, color: '#2F6FED', fontWeight: '900', fontSize: 12 },
  avatarWrap: { alignItems: 'center', paddingVertical: 22 },
  avatarWrapCompact: { paddingVertical: 12 },
  topics: { gap: 8, paddingVertical: 8 },
  topic: { backgroundColor: '#FFF', borderColor: '#DFE8F2', borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  topicActive: { backgroundColor: '#17324D', borderColor: '#17324D' },
  topicText: { color: '#516579', fontWeight: '700' },
  topicTextActive: { color: '#FFF' },
  topicControl: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2EAF3', borderRadius: 16, padding: 12 },
  currentTopicLabel: { color: '#8A98A6', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  currentTopic: { marginTop: 2, color: '#17324D', fontWeight: '900', fontSize: 15 },
  changeTopic: { backgroundColor: '#EEF4FF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  changeTopicText: { color: '#2F6FED', fontWeight: '900', fontSize: 12 },
  changeTopicHint: { marginTop: 6, color: '#7A8998', fontSize: 11, lineHeight: 16 },
  topicNotice: { marginTop: 5, color: '#277154', fontSize: 11, fontWeight: '800' },
  mic: { marginTop: 14, backgroundColor: '#2F6FED', borderRadius: 18, minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  micRecording: { backgroundColor: '#D65757' },
  micDisabled: { opacity: 0.55 },
  micIcon: { color: '#FFF', fontSize: 20 },
  micText: { color: '#FFF', fontWeight: '900', fontSize: 17 },
  textRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 50, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DFE8F2', borderRadius: 16, paddingHorizontal: 15, color: '#17324D' },
  send: { backgroundColor: '#17324D', borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center' },
  sendText: { color: '#FFF', fontWeight: '800' },
  conversationCard: { marginTop: 18, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2EAF3', borderRadius: 22, padding: 19 },
  label: { fontSize: 11, letterSpacing: 1.3, fontWeight: '900', color: '#8997A5' },
  userText: { marginTop: 6, color: '#42566A', fontSize: 16, lineHeight: 23 },
  reply: { marginTop: 6, color: '#17324D', fontSize: 19, lineHeight: 27, fontWeight: '700' },
  listenAgain: { marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#EEF4FF', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9 },
  listenAgainDisabled: { opacity: 0.55 },
  listenAgainIcon: { color: '#2F6FED', fontSize: 11, fontWeight: '900' },
  listenAgainText: { color: '#2F6FED', fontWeight: '900', fontSize: 13 },
  correction: { marginTop: 18, padding: 15, borderRadius: 16, backgroundColor: '#FFF5E8' },
  correctionTitle: { color: '#9A5A13', fontWeight: '900' },
  correctionText: { marginTop: 5, color: '#6F4A21', fontSize: 16, fontWeight: '700' },
  explanation: { marginTop: 6, color: '#7F684E', lineHeight: 20 },
  suggestion: { marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: '#EEF4FF', borderWidth: 1, borderColor: '#D7E4FF' },
  suggestionTitle: { color: '#2F6FED', fontWeight: '900', fontSize: 11, letterSpacing: 1.1 },
  suggestionText: { marginTop: 7, color: '#17324D', fontSize: 18, lineHeight: 25, fontWeight: '800' },
  suggestionHelp: { marginTop: 6, color: '#667889', lineHeight: 19 },
  useSuggestion: { marginTop: 12, alignSelf: 'flex-start', backgroundColor: '#2F6FED', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  useSuggestionText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  tip: { marginTop: 12, padding: 15, borderRadius: 16, backgroundColor: '#EAF7F1' },
  tipTitle: { color: '#277154', fontWeight: '900' },
  tipText: { marginTop: 5, color: '#3D6A59', lineHeight: 20 },
});
