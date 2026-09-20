import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../services/firebase';
import { setUserAccess } from '../services/admin';
import { SubscriptionStatus } from '../types';

type AdminUser = {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  subscriptionStatus?: SubscriptionStatus;
  level?: string;
  totalTurns?: number;
  trialEndsAt?: any;
};

function trialLabel(value: any) {
  if (!value) return '';
  const ms =
    typeof value?.toMillis === 'function'
      ? value.toMillis()
      : Number(value?.seconds || 0) * 1000;
  if (!ms) return '';
  const remaining = ms - Date.now();
  if (remaining <= 0) return 'Prueba vencida';
  const hours = Math.ceil(remaining / 3_600_000);
  return `Prueba: ${hours} h restantes`;
}

export function AdminScreen() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [workingUid, setWorkingUid] = useState('');

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snapshot) => {
        setUsers(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as any) })));
      },
      (error) => Alert.alert('Administrador', error.message),
    );
  }, []);

  async function changeStatus(user: AdminUser, status: SubscriptionStatus) {
    if (user.role === 'admin') {
      Alert.alert('Administrador', 'La cuenta administradora no necesita cambiar su suscripción.');
      return;
    }

    try {
      setWorkingUid(user.id);
      await setUserAccess(user.id, status);
    } catch (error: any) {
      Alert.alert('Administrador', error?.message || 'No se pudo cambiar el acceso.');
    } finally {
      setWorkingUid('');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>ADMINISTRACIÓN</Text>
      <Text style={styles.title}>Usuarios y accesos</Text>
      <Text style={styles.subtitle}>
        Activa al cliente después del pago, deja cuentas internas como Gratis o bloquea un acceso.
      </Text>

      <View style={styles.summary}>
        <Text style={styles.summaryValue}>{users.length}</Text>
        <Text style={styles.summaryLabel}>usuarios registrados</Text>
      </View>

      {users.map((user) => {
        const busy = workingUid === user.id;
        const status = user.role === 'admin' ? 'admin' : user.subscriptionStatus || 'trial';

        return (
          <View key={user.id} style={styles.card}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user.displayName || 'Sin nombre'}</Text>
                <Text style={styles.email}>{user.email || user.id}</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{String(status).toUpperCase()}</Text>
              </View>
            </View>

            <Text style={styles.meta}>
              Nivel {user.level || 'A1'} · {user.totalTurns || 0} turnos
              {user.subscriptionStatus === 'trial' ? ` · ${trialLabel(user.trialEndsAt)}` : ''}
            </Text>

            {user.role !== 'admin' && (
              <View style={styles.actions}>
                <ActionButton
                  label="Activo"
                  disabled={busy}
                  onPress={() => changeStatus(user, 'active')}
                />
                <ActionButton
                  label="Gratis"
                  disabled={busy}
                  onPress={() => changeStatus(user, 'complimentary')}
                />
                <ActionButton
                  label="Bloquear"
                  disabled={busy}
                  danger
                  onPress={() => changeStatus(user, 'blocked')}
                />
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, danger && styles.actionDanger, disabled && styles.disabled]}
    >
      <Text style={[styles.actionText, danger && styles.actionDangerText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 22, paddingBottom: 120, backgroundColor: '#F7FAFD', gap: 12 },
  eyebrow: { color: '#2F6FED', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#17324D', fontSize: 29, fontWeight: '900' },
  subtitle: { color: '#667889', lineHeight: 21, marginBottom: 6 },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 7, backgroundColor: '#EAF3FF', borderRadius: 18, padding: 16 },
  summaryValue: { color: '#17324D', fontSize: 25, fontWeight: '900' },
  summaryLabel: { color: '#587086', fontWeight: '700' },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2EAF3', borderRadius: 18, padding: 16 },
  rowTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  name: { color: '#17324D', fontSize: 16, fontWeight: '900' },
  email: { marginTop: 3, color: '#728294', fontSize: 12 },
  statusPill: { backgroundColor: '#EEF3F8', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  statusText: { color: '#53677A', fontSize: 10, fontWeight: '900' },
  meta: { marginTop: 10, color: '#7A8998', fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  action: { backgroundColor: '#EAF3FF', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 },
  actionDanger: { backgroundColor: '#FFF0F0' },
  actionText: { color: '#2F6FED', fontWeight: '900', fontSize: 12 },
  actionDangerText: { color: '#B84B4B' },
  disabled: { opacity: 0.5 },
});
