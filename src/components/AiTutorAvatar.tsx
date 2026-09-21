import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { EMMA_AVATAR_URI } from '../assets/emmaAvatar';

export function AiTutorAvatar({
  listening,
  speaking,
  thinking = false,
  size = 220,
}: {
  listening: boolean;
  speaking: boolean;
  thinking?: boolean;
  size?: number;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const float = useRef(new Animated.Value(0)).current;
  const thinkingPulse = useRef(new Animated.Value(0.45)).current;
  const speakingPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -2.5, duration: 1800, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  useEffect(() => {
    if (!listening) {
      pulse.stopAnimation();
      Animated.timing(pulse, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 620, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  useEffect(() => {
    if (!speaking) {
      speakingPulse.stopAnimation();
      speakingPulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(speakingPulse, { toValue: 1.025, duration: 180, useNativeDriver: true }),
        Animated.timing(speakingPulse, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, speakingPulse]);

  useEffect(() => {
    if (!thinking) {
      thinkingPulse.stopAnimation();
      thinkingPulse.setValue(0.45);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(thinkingPulse, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(thinkingPulse, { toValue: 0.45, duration: 520, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [thinking, thinkingPulse]);

  const stateLabel = listening
    ? 'Listening…'
    : thinking
      ? 'Thinking…'
      : speaking
        ? 'Speaking…'
        : 'Emma · AI Tutor';

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ translateY: float }, { scale: pulse }, { scale: speakingPulse }],
        },
        listening && styles.wrapperListening,
        thinking && styles.wrapperThinking,
        speaking && styles.wrapperSpeaking,
      ]}
    >
      <View
        style={[
          styles.imageFrame,
          {
            width: size - 12,
            height: size - 12,
            borderRadius: (size - 12) / 2,
          },
        ]}
      >
        <Image
          source={{ uri: EMMA_AVATAR_URI }}
          style={{
            width: size - 12,
            height: size - 12,
            borderRadius: (size - 12) / 2,
          }}
          resizeMode="cover"
        />
        <View style={styles.softOverlay} />
      </View>

      {thinking && (
        <Animated.View style={[styles.thinkingDots, { opacity: thinkingPulse }]}>
          <Text style={styles.thinkingDotsText}>•••</Text>
        </Animated.View>
      )}

      <View style={styles.badge}>
        <View
          style={[
            styles.stateDot,
            listening && styles.stateDotListening,
            thinking && styles.stateDotThinking,
            speaking && styles.stateDotSpeaking,
          ]}
        />
        <Text style={styles.badgeText}>{stateLabel}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
    borderWidth: 5,
    borderColor: '#D7E6FA',
    shadowColor: '#2F6FED',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
    overflow: 'visible',
  },
  wrapperListening: { borderColor: '#79C4A3' },
  wrapperThinking: { borderColor: '#F0C36E' },
  wrapperSpeaking: { borderColor: '#8FAEF3' },

  imageFrame: {
    overflow: 'hidden',
    backgroundColor: '#EDF4FF',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  softOverlay: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 999,
  },

  thinkingDots: {
    position: 'absolute',
    right: '5%',
    top: '7%',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingHorizontal: 9,
    paddingVertical: 3,
    zIndex: 12,
    shadowColor: '#17324D',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  thinkingDotsText: {
    color: '#C08A2D',
    fontWeight: '900',
    letterSpacing: 2,
  },

  badge: {
    position: 'absolute',
    bottom: -18,
    borderRadius: 20,
    backgroundColor: '#17324D',
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    zIndex: 15,
  },
  stateDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#9BA9B7',
  },
  stateDotListening: { backgroundColor: '#79C4A3' },
  stateDotThinking: { backgroundColor: '#F0C36E' },
  stateDotSpeaking: { backgroundColor: '#8FAEF3' },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
});
