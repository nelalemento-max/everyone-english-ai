import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  AdminAnalytics,
  AdminUser,
  getAdminAnalytics,
  listAdminUsers,
  setUserAccess,
} from '../services/admin';
import { SubscriptionStatus } from '../types';

function trialLabel(value?: string | null) {
  if (!value) return '';
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return '';
  const remaining = ms - Date.now();
  if (remaining <= 0) return 'Prueba vencida';
  const hours = Math.ceil(remaining / 3_600_000);
  return 'Prueba: ' + hours + ' h restantes';
}

function money(value?: number, precision = 2) {
  const number = Number(value || 0);
  const digits = number > 0 && number < 0.1 ? Math.max(precision, 4) : precision;
  return '$' + number.toFixed(digits);
}

export function AdminScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 430;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingUid, setWorkingUid] = useState('');

  async function loadData() {
    try {
      setLoading(true);
      const nextUsers = await listAdminUsers();
      setUsers(nextUsers);
      try {
        setAnalytics(await getAdminAnalytics());
      } catch {
        setAnalytics(null);
      }
    } catch (error: any) {
      Alert.alert('Administrador', error?.message || 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function changeStatus(user: AdminUser, status: SubscriptionStatus) {
    if (user.role === 'admin') {
      Alert.alert('Administrador', 'La cuenta administradora no necesita cambiar su acceso.');
      return;
    }

    try {
      setWorkingUid(user.id);
      await setUserAccess(user.id, status);
      await loadData();
    } catch (error: any) {
      Alert.alert('Administrador', error?.message || 'No se pudo cambiar el acceso.');
    } finally {
      setWorkingUid('');
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, compact && styles.containerCompact]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>ADMINISTRACIÓN</Text>
      <Text style={styles.title}>Control del negocio</Text>
      <Text style={styles.subtitle}>
        Usuarios, accesos y costo estimado de la inteligencia artificial.
      </Text>

      <Pressable style={styles.refresh} onPress={loadData}>
        <Text style={styles.refreshText}>{loading ? 'Actualizando…' : 'Actualizar datos'}</Text>
      </Pressable>

      <View style={styles.summary}>
        <Text style={styles.summaryValue}>{users.length}</Text>
        <Text style={styles.summaryLabel}>usuarios registrados</Text>
      </View>

      {!!analytics && (
        <>
          <Text style={styles.sectionTitle}>Costos IA y referencia de precio</Text>
          <Text style={styles.sectionIntro}>
            Muestra actual: {analytics.sampleUsers} usuarios con uso · {analytics.totalTurns} turnos.
            La estimación será más sólida cuando tengamos más usuarios y más días de uso.
          </Text>

          <View style={styles.metricGrid}>
            <MetricCard
              label="Costo observado"
              value={money(analytics.totalAiCostUsd, 3)}
              detail="IA consumida por la muestra"
            />
            <MetricCard
              label="Costo por turno"
              value={money(analytics.averageCostPerTurnUsd, 4)}
              detail="Promedio de los usuarios"
            />
            <MetricCard
              label="Usuario normal / mes"
              value={money(analytics.scenarios.normalMonthlyUsd)}
              detail="25 turnos diarios"
            />
            <MetricCard
              label="Referencia mensual"
              value={money(analytics.referenceMonthlyPriceUsd)}
              detail={String(analytics.referenceMarkup) + '× costo IA'}
              accent
            />
          </View>

          <View style={styles.budgetCard}>
            <Text style={styles.budgetEyebrow}>PRESUPUESTO DE IA</Text>
            <Text style={styles.budgetValue}>{money(analytics.budget100UsersUsd)}</Text>
            <Text style={styles.budgetText}>
              Para 100 usuarios normales por mes, incluyendo {analytics.safetyBufferPercent}% de colchón.
            </Text>
          </View>

          <View style={styles.scenarioRow}>
            <Scenario label="Ligero" turns="10/día" value={analytics.scenarios.lightMonthlyUsd} />
            <Scenario label="Normal" turns="25/día" value={analytics.scenarios.normalMonthlyUsd} />
            <Scenario label="Intensivo" turns="50/día" value={analytics.scenarios.intensiveMonthlyUsd} />
          </View>

          <View style={styles.breakdown}>
            <Text style={styles.breakdownTitle}>¿Dónde se va el costo?</Text>
            <Text style={styles.breakdownText}>
              Voz Emma {money(analytics.breakdown.ttsUsd, 3)} · Tutor {money(analytics.breakdown.llmUsd, 3)} ·
              Transcripción {money(analytics.breakdown.transcribeUsd, 3)}
            </Text>
          </View>

          <Text style={styles.subSectionTitle}>Costo por usuario</Text>
          {analytics.perUser.map((item) => (
            <View key={item.id} style={styles.costUserCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.costUserName}>{item.displayName}</Text>
                <Text style={styles.costUserMeta}>
                  {item.turns} turnos · {item.speakingMinutes.toFixed(1)} min hablando · {item.activeDays} día(s) de uso
                </Text>
              </View>
              <View style={styles.costRight}>
                <Text style={styles.costValue}>{money(item.aiCostUsd, 3)}</Text>
                <Text style={styles.costProjection}>
                  ≈ {money(item.projectedNormalMonthlyUsd)}/mes normal
                </Text>
              </View>
            </View>
          ))}

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Cómo leer esta cifra</Text>
            <Text style={styles.noticeText}>
              La referencia comercial usa 4× el costo variable de IA de un usuario normal.
              No es todavía el precio final: faltan soporte, impuestos, pasarela de pago,
              marketing y utilidad. Tarifas de IA: {analytics.rateVersion}.
            </Text>
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Usuarios y accesos</Text>

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
              {user.subscriptionStatus === 'trial' ? ' · ' + trialLabel(user.trialEndsAt) : ''}
            </Text>

            {user.role !== 'admin' && (
              <View style={styles.actions}>
                <ActionButton label="Activo" disabled={busy} onPress={() => changeStatus(user, 'active')} />
                <ActionButton label="Gratis" disabled={busy} onPress={() => changeStatus(user, 'complimentary')} />
                <ActionButton label="Bloquear" disabled={busy} danger onPress={() => changeStatus(user, 'blocked')} />
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.metricCard, accent && styles.metricCardAccent]}>
      <Text style={[styles.metricLabel, accent && styles.metricLabelAccent]}>{label}</Text>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
      <Text style={[styles.metricDetail, accent && styles.metricDetailAccent]}>{detail}</Text>
    </View>
  );
}

function Scenario({ label, turns, value }: { label: string; turns: string; value: number }) {
  return (
    <View style={styles.scenario}>
      <Text style={styles.scenarioLabel}>{label}</Text>
      <Text style={styles.scenarioValue}>{money(value)}</Text>
      <Text style={styles.scenarioTurns}>{turns}</Text>
    </View>
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
  container: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    padding: 22,
    paddingBottom: 120,
    backgroundColor: '#F7FAFD',
    gap: 12,
  },
  containerCompact: { paddingHorizontal: 14, paddingTop: 12 },
  eyebrow: { color: '#2F6FED', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#17324D', fontSize: 29, fontWeight: '900' },
  subtitle: { color: '#667889', lineHeight: 21, marginBottom: 6 },
  refresh: { alignSelf: 'flex-start', backgroundColor: '#17324D', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  refreshText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 7, backgroundColor: '#EAF3FF', borderRadius: 18, padding: 16 },
  summaryValue: { color: '#17324D', fontSize: 25, fontWeight: '900' },
  summaryLabel: { color: '#587086', fontWeight: '700' },
  sectionTitle: { marginTop: 8, color: '#17324D', fontSize: 20, fontWeight: '900' },
  sectionIntro: { color: '#667889', lineHeight: 20 },
  subSectionTitle: { marginTop: 4, color: '#17324D', fontSize: 16, fontWeight: '900' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flexGrow: 1, flexBasis: 155, minWidth: 145, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2EAF3', borderRadius: 17, padding: 14 },
  metricCardAccent: { backgroundColor: '#17324D', borderColor: '#17324D' },
  metricLabel: { color: '#728294', fontSize: 11, fontWeight: '800' },
  metricLabelAccent: { color: '#B9CCE0' },
  metricValue: { marginTop: 5, color: '#17324D', fontSize: 23, fontWeight: '900' },
  metricValueAccent: { color: '#FFF' },
  metricDetail: { marginTop: 3, color: '#83909E', fontSize: 10, lineHeight: 14 },
  metricDetailAccent: { color: '#CEDAE6' },
  budgetCard: { backgroundColor: '#EAF7F1', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D7EEE4' },
  budgetEyebrow: { color: '#277154', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  budgetValue: { marginTop: 3, color: '#174F3B', fontSize: 27, fontWeight: '900' },
  budgetText: { marginTop: 4, color: '#4C7565', lineHeight: 18, fontSize: 12 },
  scenarioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scenario: { flex: 1, minWidth: 95, backgroundColor: '#FFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E5EDF5' },
  scenarioLabel: { color: '#607488', fontSize: 11, fontWeight: '800' },
  scenarioValue: { marginTop: 3, color: '#17324D', fontSize: 17, fontWeight: '900' },
  scenarioTurns: { marginTop: 2, color: '#8A98A6', fontSize: 10 },
  breakdown: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E5EDF5' },
  breakdownTitle: { color: '#17324D', fontWeight: '900' },
  breakdownText: { marginTop: 5, color: '#667889', lineHeight: 19, fontSize: 12 },
  costUserCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E5EDF5' },
  costUserName: { color: '#17324D', fontWeight: '900' },
  costUserMeta: { marginTop: 4, color: '#788898', fontSize: 11, lineHeight: 16 },
  costRight: { alignItems: 'flex-end', maxWidth: 145 },
  costValue: { color: '#2F6FED', fontSize: 17, fontWeight: '900' },
  costProjection: { marginTop: 3, color: '#718294', fontSize: 9, textAlign: 'right' },
  notice: { backgroundColor: '#FFF7E9', borderRadius: 16, padding: 14 },
  noticeTitle: { color: '#8A5C1D', fontWeight: '900' },
  noticeText: { marginTop: 5, color: '#7C694E', lineHeight: 19, fontSize: 11 },
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
