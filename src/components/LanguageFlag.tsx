import React from 'react';
import { StyleSheet, View } from 'react-native';

export function LanguageFlag({
  code,
  width = 34,
  height = 24,
}: {
  code: 'es' | 'en' | 'fr';
  width?: number;
  height?: number;
}) {
  if (code === 'es') {
    return (
      <View style={[styles.flag, { width, height }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#AA151B' }]} />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: height * 0.25,
            height: height * 0.5,
            backgroundColor: '#F1BF00',
          }}
        />
      </View>
    );
  }

  if (code === 'fr') {
    return (
      <View style={[styles.flag, { width, height, flexDirection: 'row' }]}>
        <View style={{ flex: 1, backgroundColor: '#0055A4' }} />
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
        <View style={{ flex: 1, backgroundColor: '#EF4135' }} />
      </View>
    );
  }

  return (
    <View style={[styles.flag, { width, height, backgroundColor: '#012169' }]}>
      <View
        style={{
          position: 'absolute',
          left: width * 0.42,
          width: width * 0.16,
          top: 0,
          bottom: 0,
          backgroundColor: '#FFFFFF',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: height * 0.38,
          height: height * 0.24,
          left: 0,
          right: 0,
          backgroundColor: '#FFFFFF',
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: width * 0.455,
          width: width * 0.09,
          top: 0,
          bottom: 0,
          backgroundColor: '#C8102E',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: height * 0.435,
          height: height * 0.13,
          left: 0,
          right: 0,
          backgroundColor: '#C8102E',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flag: {
    overflow: 'hidden',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D7E2EE',
    backgroundColor: '#FFFFFF',
  },
});
