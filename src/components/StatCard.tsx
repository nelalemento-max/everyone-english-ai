import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EEF6',
  },
  value: { fontSize: 22, fontWeight: '800', color: '#17324D' },
  label: { marginTop: 4, fontSize: 12, color: '#6D7B8A' },
});
