import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { ConversationTurn } from '../types';
import { callBackend } from './backend';

async function webUriToBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function audioUriToBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') return webUriToBase64(uri);
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function sendConversationTurn(input: {
  audioUri?: string;
  text?: string;
  level: string;
  topic: string;
  seconds?: number;
}): Promise<ConversationTurn> {
  const audioBase64 = input.audioUri
    ? await audioUriToBase64(input.audioUri)
    : undefined;

  const mimeType = input.audioUri
    ? Platform.OS === 'web'
      ? 'audio/webm'
      : 'audio/m4a'
    : undefined;

  return callBackend<ConversationTurn>('conversation', {
    audioBase64,
    mimeType,
    text: input.text,
    level: input.level,
    topic: input.topic,
    seconds: input.seconds || 0,
  });
}

export async function playBase64Audio(player: any, base64: string) {
  if (!base64) return;

  if (Platform.OS === 'web') {
    player.replace(`data:audio/mp3;base64,${base64}`);
    player.play();
    return;
  }

  const path = `${FileSystem.cacheDirectory}everyone-english-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  player.replace(path);
  player.play();
}
