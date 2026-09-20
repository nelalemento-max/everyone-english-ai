import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function AccessLockedScreen({
  onSignOut,
}: {
  onSignOut: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>Tu prueba gratuita terminó</Text>
        <Text style={styles.body}>
          Ya completaste tus 2 días de práctica. Tu progreso está guardado y podrás continuar exactamente donde quedaste cuando tu suscripción sea activada.
        </Text>
        <View style={styles.planBox}>
          <Text style={styles.planTitle}>Everyone English</Text>
          <Text style={styles.planText}>Conversación con IA · progreso · correcciones · práctica ilimitada según tu plan.</Text>
        </View>
        <Text style={styles.pending}>El módulo de cobro se incorporará en la siguiente etapa.</Text>
        <Pressable style={styles.secondary} onPress={onSignOut}>
          <Text style={styles.secondaryText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F7FAFD' },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 28, padding: 26, borderWidth: 1, borderColor: '#E3EBF3', alignItems: 'center' },
  icon: { fontSize: 40 },
  title: { marginTop: 10, color: '#17324D', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  body: { marginTop: 12, color: '#627587', lineHeight: 22, textAlign: 'center' },
  planBox: { marginTop: 20, width: '100%', backgroundColor: '#EAF3FF', borderRadius: 18, padding: 18 },
  planTitle: { color: '#17324D', fontWeight: '900', fontSize: 18 },
  planText: { marginTop: 5, color: '#536A7F', lineHeight: 20 },
  pending: { marginTop: 16, color: '#8A6A3B', textAlign: 'center', fontSize: 12 },
  secondary: { marginTop: 18, paddingVertical: 13, paddingHorizontal: 22, borderRadius: 14, backgroundColor: '#17324D' },
  secondaryText: { color: '#FFF', fontWeight: '800' },
});
