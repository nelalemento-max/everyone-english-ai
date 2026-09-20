import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export function AiTutorAvatar({
  listening,
  speaking,
  size = 220,
}: {
  listening: boolean;
  speaking: boolean;
  size?: number;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const mouth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening) {
      pulse.stopAnimation();
      Animated.timing(pulse, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  useEffect(() => {
    if (!speaking) {
      mouth.stopAnimation();
      mouth.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(mouth, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(mouth, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, mouth]);

  const faceSize = size * 0.78;

  return (
    <Animated.View
      style={[
        styles.outer,
        { width: size, height: size, borderRadius: size / 2, transform: [{ scale: pulse }] },
        listening && styles.outerListening,
      ]}
    >
      <View
        style={[
          styles.hair,
          { width: faceSize * 1.02, height: faceSize * 1.05, borderRadius: faceSize * 0.5 },
        ]}
      />
      <View
        style={[
          styles.face,
          { width: faceSize * 0.78, height: faceSize * 0.88, borderRadius: faceSize * 0.42 },
        ]}
      >
        <View style={styles.eyesRow}>
          <View style={styles.eye}><View style={styles.pupil} /></View>
          <View style={styles.eye}><View style={styles.pupil} /></View>
        </View>
        <View style={styles.nose} />
        <Animated.View
          style={[
            styles.mouth,
            {
              transform: [
                {
                  scaleY: mouth.interpolate({ inputRange: [0, 1], outputRange: [1, 2.5] }),
                },
              ],
            },
          ]}
        />
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{listening ? 'Listening…' : speaking ? 'Speaking…' : 'Emma · AI Tutor'}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
    borderWidth: 6,
    borderColor: '#D7E6FA',
    shadowColor: '#2F6FED',
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  outerListening: { borderColor: '#79C4A3' },
  hair: { position: 'absolute', backgroundColor: '#33251F', top: 22 },
  face: {
    backgroundColor: '#F2C6A8',
    alignItems: 'center',
    paddingTop: 58,
    overflow: 'hidden',
  },
  eyesRow: { flexDirection: 'row', gap: 36 },
  eye: {
    width: 19,
    height: 12,
    borderRadius: 10,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#29313D' },
  nose: { width: 6, height: 19, marginTop: 20, borderRadius: 4, backgroundColor: '#DEAA8A' },
  mouth: { width: 35, height: 7, marginTop: 22, borderRadius: 12, backgroundColor: '#B95E6A' },
  badge: {
    position: 'absolute',
    bottom: -18,
    borderRadius: 20,
    backgroundColor: '#17324D',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  badgeText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
});
