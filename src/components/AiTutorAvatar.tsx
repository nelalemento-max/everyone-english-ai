import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

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
  const mouth = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const float = useRef(new Animated.Value(0)).current;
  const thinkingPulse = useRef(new Animated.Value(0.45)).current;

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
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(blink, { toValue: 0.08, duration: 85, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(blink, { toValue: 0.08, duration: 85, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(3200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  useEffect(() => {
    if (!listening) {
      pulse.stopAnimation();
      Animated.timing(pulse, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.045, duration: 650, useNativeDriver: true }),
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
        Animated.timing(mouth, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.timing(mouth, { toValue: 0.2, duration: 95, useNativeDriver: true }),
        Animated.timing(mouth, { toValue: 0.75, duration: 120, useNativeDriver: true }),
        Animated.timing(mouth, { toValue: 0, duration: 125, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, mouth]);

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

  const dims = useMemo(() => {
    const faceW = size * 0.55;
    const faceH = size * 0.64;
    return {
      faceW,
      faceH,
      faceTop: size * 0.18,
      hairW: faceW * 1.15,
      hairH: faceH * 1.08,
      eyeW: Math.max(12, size * 0.072),
      eyeH: Math.max(8, size * 0.043),
      pupil: Math.max(5, size * 0.026),
      eyeGap: size * 0.12,
      mouthW: size * 0.15,
      mouthH: Math.max(5, size * 0.027),
    };
  }, [size]);

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
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale: pulse }],
        },
        listening && styles.outerListening,
        thinking && styles.outerThinking,
        speaking && styles.outerSpeaking,
      ]}
    >
      <View
        style={[
          styles.shoulders,
          {
            width: size * 0.72,
            height: size * 0.25,
            borderTopLeftRadius: size * 0.3,
            borderTopRightRadius: size * 0.3,
            bottom: size * 0.025,
          },
        ]}
      />
      <View
        style={[
          styles.neck,
          {
            width: size * 0.13,
            height: size * 0.18,
            borderRadius: size * 0.05,
            bottom: size * 0.16,
          },
        ]}
      />

      <Animated.View
        style={[
          styles.headWrap,
          {
            top: dims.faceTop,
            transform: [{ translateY: float }],
          },
        ]}
      >
        <View
          style={[
            styles.hairBack,
            {
              width: dims.hairW,
              height: dims.hairH,
              borderRadius: dims.hairW * 0.46,
              left: -((dims.hairW - dims.faceW) / 2),
              top: -size * 0.055,
            },
          ]}
        />

        <View
          style={[
            styles.ear,
            styles.earLeft,
            {
              width: size * 0.055,
              height: size * 0.1,
              borderRadius: size * 0.03,
              top: dims.faceH * 0.44,
              left: -size * 0.035,
            },
          ]}
        />
        <View
          style={[
            styles.ear,
            styles.earRight,
            {
              width: size * 0.055,
              height: size * 0.1,
              borderRadius: size * 0.03,
              top: dims.faceH * 0.44,
              right: -size * 0.035,
            },
          ]}
        />

        <View
          style={[
            styles.face,
            {
              width: dims.faceW,
              height: dims.faceH,
              borderRadius: dims.faceW * 0.44,
            },
          ]}
        >
          <View style={[styles.hairFringe, { height: size * 0.12 }]} />

          <View style={[styles.browsRow, { marginTop: size * 0.205, gap: dims.eyeGap }]}>
            <View style={[styles.brow, { width: dims.eyeW * 1.08 }]} />
            <View style={[styles.brow, { width: dims.eyeW * 1.08 }]} />
          </View>

          <View style={[styles.eyesRow, { marginTop: size * 0.025, gap: dims.eyeGap }]}>
            {[0, 1].map((index) => (
              <Animated.View
                key={index}
                style={[
                  styles.eye,
                  {
                    width: dims.eyeW,
                    height: dims.eyeH,
                    borderRadius: dims.eyeH,
                    transform: [{ scaleY: blink }],
                  },
                ]}
              >
                <View
                  style={[
                    styles.pupil,
                    {
                      width: dims.pupil,
                      height: dims.pupil,
                      borderRadius: dims.pupil / 2,
                    },
                  ]}
                >
                  <View style={styles.eyeShine} />
                </View>
              </Animated.View>
            ))}
          </View>

          <View
            style={[
              styles.nose,
              {
                width: size * 0.024,
                height: size * 0.072,
                borderRadius: size * 0.02,
                marginTop: size * 0.055,
              },
            ]}
          />

          <Animated.View
            style={[
              styles.mouth,
              {
                width: dims.mouthW,
                height: dims.mouthH,
                borderRadius: dims.mouthH,
                marginTop: size * 0.055,
                transform: [
                  {
                    scaleY: mouth.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 2.7],
                    }),
                  },
                ],
              },
            ]}
          />

          <View style={[styles.cheek, styles.cheekLeft, { top: dims.faceH * 0.67 }]} />
          <View style={[styles.cheek, styles.cheekRight, { top: dims.faceH * 0.67 }]} />
        </View>
      </Animated.View>

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
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
    borderWidth: 5,
    borderColor: '#D7E6FA',
    shadowColor: '#2F6FED',
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
    overflow: 'visible',
  },
  outerListening: { borderColor: '#79C4A3' },
  outerThinking: { borderColor: '#F0C36E' },
  outerSpeaking: { borderColor: '#8FAEF3' },
  headWrap: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 4,
  },
  shoulders: {
    position: 'absolute',
    backgroundColor: '#345B8C',
    zIndex: 1,
  },
  neck: {
    position: 'absolute',
    backgroundColor: '#E8B99B',
    zIndex: 2,
  },
  hairBack: {
    position: 'absolute',
    backgroundColor: '#3B2A24',
  },
  face: {
    backgroundColor: '#F1C4A5',
    alignItems: 'center',
    overflow: 'hidden',
    zIndex: 3,
  },
  hairFringe: {
    position: 'absolute',
    width: '115%',
    top: -8,
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 30,
    backgroundColor: '#3B2A24',
    transform: [{ rotate: '-4deg' }],
  },
  ear: {
    position: 'absolute',
    backgroundColor: '#E7B598',
    zIndex: 2,
  },
  earLeft: {},
  earRight: {},
  browsRow: { flexDirection: 'row' },
  brow: {
    height: 3,
    borderRadius: 3,
    backgroundColor: '#5B4035',
  },
  eyesRow: { flexDirection: 'row' },
  eye: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pupil: {
    backgroundColor: '#344D56',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  eyeShine: {
    width: 2.5,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    marginLeft: 1.5,
    marginTop: 1,
  },
  nose: {
    backgroundColor: '#DAA486',
  },
  mouth: {
    backgroundColor: '#B95E6A',
  },
  cheek: {
    position: 'absolute',
    width: 16,
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(220, 126, 126, 0.16)',
  },
  cheekLeft: { left: 15 },
  cheekRight: { right: 15 },
  thinkingDots: {
    position: 'absolute',
    right: '10%',
    top: '13%',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingHorizontal: 9,
    paddingVertical: 3,
    zIndex: 8,
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
    zIndex: 10,
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
  badgeText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
});
