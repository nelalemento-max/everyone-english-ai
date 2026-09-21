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
        Animated.delay(2100),
        Animated.timing(blink, { toValue: 0.06, duration: 80, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(1900),
        Animated.timing(blink, { toValue: 0.06, duration: 80, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(3300),
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
        Animated.timing(mouth, { toValue: 1, duration: 105, useNativeDriver: true }),
        Animated.timing(mouth, { toValue: 0.25, duration: 95, useNativeDriver: true }),
        Animated.timing(mouth, { toValue: 0.75, duration: 115, useNativeDriver: true }),
        Animated.timing(mouth, { toValue: 0, duration: 120, useNativeDriver: true }),
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
    const faceW = size * 0.52;
    const faceH = size * 0.65;
    return {
      faceW,
      faceH,
      faceTop: size * 0.145,
      eyeW: Math.max(13, size * 0.074),
      eyeH: Math.max(8, size * 0.043),
      pupil: Math.max(5, size * 0.027),
      eyeGap: size * 0.118,
      mouthW: size * 0.145,
      mouthH: Math.max(5, size * 0.026),
    };
  }, [size]);

  const stateLabel = listening
    ? 'Listening…'
    : thinking
      ? 'Thinking…'
      : speaking
        ? 'Speaking…'
        : 'Emma · English Tutor';

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
          styles.body,
          {
            width: size * 0.76,
            height: size * 0.29,
            bottom: size * 0.01,
            borderTopLeftRadius: size * 0.3,
            borderTopRightRadius: size * 0.3,
          },
        ]}
      >
        <View
          style={[
            styles.blouseNeck,
            {
              width: size * 0.19,
              height: size * 0.11,
              borderBottomLeftRadius: size * 0.09,
              borderBottomRightRadius: size * 0.09,
            },
          ]}
        />
      </View>

      <View
        style={[
          styles.neck,
          {
            width: size * 0.13,
            height: size * 0.19,
            borderRadius: size * 0.05,
            bottom: size * 0.15,
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
              width: size * 0.7,
              height: size * 0.82,
              borderRadius: size * 0.29,
              left: -(size * 0.7 - dims.faceW) / 2,
              top: -size * 0.07,
            },
          ]}
        />

        <View style={[styles.hairHighlight, { width: size * 0.19, height: size * 0.42, left: -size * 0.045, top: size * 0.02 }]} />

        <View
          style={[
            styles.hairSide,
            styles.hairSideLeft,
            {
              width: size * 0.14,
              height: size * 0.45,
              borderRadius: size * 0.08,
              left: -size * 0.09,
              top: size * 0.13,
            },
          ]}
        />
        <View
          style={[
            styles.hairSide,
            styles.hairSideRight,
            {
              width: size * 0.14,
              height: size * 0.45,
              borderRadius: size * 0.08,
              right: -size * 0.09,
              top: size * 0.13,
            },
          ]}
        />

        <View
          style={[
            styles.ear,
            {
              width: size * 0.052,
              height: size * 0.095,
              borderRadius: size * 0.03,
              left: -size * 0.03,
              top: dims.faceH * 0.45,
            },
          ]}
        />
        <View
          style={[
            styles.ear,
            {
              width: size * 0.052,
              height: size * 0.095,
              borderRadius: size * 0.03,
              right: -size * 0.03,
              top: dims.faceH * 0.45,
            },
          ]}
        />

        <View
          style={[
            styles.earring,
            {
              width: size * 0.025,
              height: size * 0.025,
              borderRadius: size * 0.013,
              left: -size * 0.018,
              top: dims.faceH * 0.54,
            },
          ]}
        />
        <View
          style={[
            styles.earring,
            {
              width: size * 0.025,
              height: size * 0.025,
              borderRadius: size * 0.013,
              right: -size * 0.018,
              top: dims.faceH * 0.54,
            },
          ]}
        />

        <View
          style={[
            styles.face,
            {
              width: dims.faceW,
              height: dims.faceH,
              borderRadius: dims.faceW * 0.46,
            },
          ]}
        >
          <View
            style={[
              styles.hairFringe,
              {
                height: size * 0.15,
                borderBottomLeftRadius: size * 0.12,
                borderBottomRightRadius: size * 0.08,
              },
            ]}
          />
          <View
            style={[
              styles.hairSweep,
              {
                width: size * 0.19,
                height: size * 0.18,
                borderRadius: size * 0.1,
                right: -size * 0.015,
                top: -size * 0.015,
              },
            ]}
          />

          <View style={[styles.browsRow, { marginTop: size * 0.205, gap: dims.eyeGap }]}>
            <View style={[styles.brow, { width: dims.eyeW * 1.15 }]} />
            <View style={[styles.brow, { width: dims.eyeW * 1.15 }]} />
          </View>

          <View style={[styles.eyesRow, { marginTop: size * 0.023, gap: dims.eyeGap }]}>
            {[0, 1].map((index) => (
              <View key={index} style={styles.eyeGroup}>
                <Animated.View
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
                      styles.iris,
                      {
                        width: dims.pupil * 1.5,
                        height: dims.pupil * 1.5,
                        borderRadius: dims.pupil,
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
                  </View>
                </Animated.View>
                <View style={styles.lashes}>
                  <View style={[styles.lash, { transform: [{ rotate: '-28deg' }] }]} />
                  <View style={styles.lash} />
                  <View style={[styles.lash, { transform: [{ rotate: '28deg' }] }]} />
                </View>
              </View>
            ))}
          </View>

          <View
            style={[
              styles.nose,
              {
                width: size * 0.021,
                height: size * 0.067,
                borderRadius: size * 0.02,
                marginTop: size * 0.05,
              },
            ]}
          />

          <View style={[styles.blush, styles.blushLeft, { top: dims.faceH * 0.66 }]} />
          <View style={[styles.blush, styles.blushRight, { top: dims.faceH * 0.66 }]} />

          <Animated.View
            style={[
              styles.mouth,
              {
                width: dims.mouthW,
                height: dims.mouthH,
                borderRadius: dims.mouthH,
                marginTop: size * 0.047,
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
          >
            <View style={styles.lipHighlight} />
            {!speaking && <View style={styles.smileLight} />}
          </Animated.View>
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
    backgroundColor: '#EDF4FF',
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

  body: {
    position: 'absolute',
    backgroundColor: '#5C7DBA',
    zIndex: 1,
    alignItems: 'center',
    overflow: 'hidden',
  },
  blouseNeck: {
    marginTop: -2,
    backgroundColor: '#F8FBFF',
    transform: [{ rotate: '45deg' }],
  },
  neck: {
    position: 'absolute',
    backgroundColor: '#E8B99B',
    zIndex: 2,
  },

  headWrap: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 4,
  },
  hairBack: {
    position: 'absolute',
    backgroundColor: '#35251F',
  },
  hairHighlight: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    transform: [{ rotate: '12deg' }],
    zIndex: 2,
  },
  hairSide: {
    position: 'absolute',
    backgroundColor: '#35251F',
    zIndex: 1,
  },
  hairSideLeft: {
    transform: [{ rotate: '7deg' }],
  },
  hairSideRight: {
    transform: [{ rotate: '-7deg' }],
  },

  face: {
    backgroundColor: '#F1C4A5',
    alignItems: 'center',
    overflow: 'hidden',
    zIndex: 4,
  },
  hairFringe: {
    position: 'absolute',
    width: '118%',
    top: -8,
    backgroundColor: '#35251F',
    transform: [{ rotate: '-4deg' }],
    zIndex: 8,
  },
  hairSweep: {
    position: 'absolute',
    backgroundColor: '#35251F',
    transform: [{ rotate: '24deg' }],
    zIndex: 9,
  },

  ear: {
    position: 'absolute',
    backgroundColor: '#E7B598',
    zIndex: 3,
  },
  earring: {
    position: 'absolute',
    backgroundColor: '#E7C46A',
    zIndex: 7,
    borderWidth: 1,
    borderColor: '#FFF3C2',
  },

  browsRow: {
    flexDirection: 'row',
    zIndex: 10,
  },
  brow: {
    height: 3,
    borderRadius: 3,
    backgroundColor: '#5A4036',
  },
  eyesRow: {
    flexDirection: 'row',
    zIndex: 10,
  },
  eyeGroup: {
    alignItems: 'center',
  },
  eye: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 0.6,
    borderColor: '#E0B5A0',
  },
  iris: {
    backgroundColor: '#6E8F8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: {
    backgroundColor: '#28353B',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  eyeShine: {
    width: 2.8,
    height: 2.8,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    marginLeft: 1.5,
    marginTop: 1,
  },
  lashes: {
    flexDirection: 'row',
    gap: 3,
    marginTop: -1,
  },
  lash: {
    width: 1.4,
    height: 5,
    borderRadius: 1,
    backgroundColor: '#43332D',
  },

  nose: {
    backgroundColor: '#DCA88B',
  },
  blush: {
    position: 'absolute',
    width: 18,
    height: 9,
    borderRadius: 9,
    backgroundColor: 'rgba(213, 110, 120, 0.18)',
  },
  blushLeft: { left: 13 },
  blushRight: { right: 13 },

  mouth: {
    backgroundColor: '#B95768',
    overflow: 'hidden',
    alignItems: 'center',
  },
  lipHighlight: {
    marginTop: 1,
    width: '55%',
    height: 1.4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  smileLight: {
    marginTop: 1,
    width: '42%',
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },

  thinkingDots: {
    position: 'absolute',
    right: '9%',
    top: '11%',
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
