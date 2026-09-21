import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  AdminAnalytics,
  AdminUser,
  addAiInvestment,
  getAdminAnalytics,
  listAdminUsers,
  setUserAccess,
  setUserMonthlyPrice,
  updateBusinessSettings,
} from '../services/admin';
import { SubscriptionStatus } from '../types';
import { SalesAdminPanel } from '../components/SalesAdminPanel';

function trialLabel(value?: string | null) {
  if (!value) return '';
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return '';
  const remaining = ms - Date.now();
  if (remaining <= 0) return 'Prueba vencida';
  const hours = Math.ceil(remaining / 3_600_000);
  return 'Prueba: ' + hours + ' h restantes';
}

function money(value?: number | null, precision = 2) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  const digits = number > 0 && number < 0.1 ? Math.max(precision, 4) : precision;
  return '$' + number.toFixed(digits);
}

function bob(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return 'Bs ' + Number(value).toFixed(2);
}

function languageLabel(code: 'en' | 'es' | 'fr') {
  if (code === 'es') return 'Español';
  if (code === 'fr') return 'Français';
  return 'English';
}

export function AdminScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 430;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingUid, setWorkingUid] = useState('');

  const [exchangeRate, setExchangeRate] = useState('');
  const [markup, setMarkup] = useState('4');
  const [buffer, setBuffer] = useState('25');
  const [normalTurns, setNormalTurns] = useState('25');
  const [defaultMonthlyPriceBob, setDefaultMonthlyPriceBob] = useState('50');
  const [firstSaleCommissionBob, setFirstSaleCommissionBob] = useState('20');
  const [renewalCommissionBob, setRenewalCommissionBob] = useState('5');

  const [investmentUsd, setInvestmentUsd] = useState('');
  const [investmentNote, setInvestmentNote] = useState('');
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  function hydrateAnalytics(next: AdminAnalytics | null) {
    setAnalytics(next);
    if (!next) return;
    setExchangeRate(
      next.settings.exchangeRateBobPerUsd == null
        ? ''
        : String(next.settings.exchangeRateBobPerUsd),
    );
    setMarkup(String(next.settings.pricingMarkup));
    setBuffer(String(next.settings.safetyBufferPercent));
    setNormalTurns(String(next.settings.normalTurnsPerDay));
    setDefaultMonthlyPriceBob(String(next.settings.defaultMonthlyPriceBob ?? 50));
    setFirstSaleCommissionBob(String(next.settings.firstSaleCommissionBob ?? 20));
    setRenewalCommissionBob(String(next.settings.renewalCommissionBob ?? 5));

    const drafts: Record<string, string> = {};
    for (const item of next.perUser) {
      drafts[item.id] =
        item.monthlyPriceOverrideUsd == null
          ? ''
          : String(item.monthlyPriceOverrideUsd);
    }
    setPriceDrafts(drafts);
  }

  async function loadData() {
    try {
      setLoading(true);
      const [nextUsers, nextAnalytics] = await Promise.all([
        listAdminUsers(),
        getAdminAnalytics(),
      ]);
      setUsers(nextUsers);
      hydrateAnalytics(nextAnalytics);
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

  async function saveBusinessSettings() {
    try {
      const rate = exchangeRate.trim() ? Number(exchangeRate.replace(',', '.')) : null;
      const nextMarkup = Number(markup.replace(',', '.'));
      const nextBuffer = Number(buffer.replace(',', '.'));
      const nextTurns = Number(normalTurns.replace(',', '.'));
      const nextDefaultMonthlyPriceBob = Number(defaultMonthlyPriceBob.replace(',', '.'));
      const nextFirstSaleCommissionBob = Number(firstSaleCommissionBob.replace(',', '.'));
      const nextRenewalCommissionBob = Number(renewalCommissionBob.replace(',', '.'));

      if (
        (rate !== null && (!Number.isFinite(rate) || rate <= 0)) ||
        !Number.isFinite(nextMarkup) ||
        !Number.isFinite(nextBuffer) ||
        !Number.isFinite(nextTurns) ||
        !Number.isFinite(nextDefaultMonthlyPriceBob) ||
        !Number.isFinite(nextFirstSaleCommissionBob) ||
        !Number.isFinite(nextRenewalCommissionBob)
      ) {
        Alert.alert('Configuración', 'Revisa los valores ingresados.');
        return;
      }

      setLoading(true);
      await updateBusinessSettings({
        exchangeRateBobPerUsd: rate,
        pricingMarkup: nextMarkup,
        safetyBufferPercent: nextBuffer,
        normalTurnsPerDay: nextTurns,
        defaultMonthlyPriceBob: nextDefaultMonthlyPriceBob,
        firstSaleCommissionBob: nextFirstSaleCommissionBob,
        renewalCommissionBob: nextRenewalCommissionBob,
      });
      await loadData();
      Alert.alert('Configuración', 'Valores actualizados.');
    } catch (error: any) {
      Alert.alert('Configuración', error?.message || 'No se pudo guardar.');
    } finally {
      setLoading(false);
    }
  }

  async function registerInvestment() {
    try {
      const amount = Number(investmentUsd.replace(',', '.'));
      const rate = exchangeRate.trim() ? Number(exchangeRate.replace(',', '.')) : null;
      if (!Number.isFinite(amount) || amount <= 0) {
        Alert.alert('Inversión IA', 'Ingresa un monto válido en dólares.');
        return;
      }

      setLoading(true);
      await addAiInvestment({
        amountUsd: amount,
        exchangeRateBobPerUsd: rate,
        provider: 'OpenAI',
        note: investmentNote.trim(),
      });
      setInvestmentUsd('');
      setInvestmentNote('');
      await loadData();
      Alert.alert('Inversión IA', 'Compra de IA registrada.');
    } catch (error: any) {
      Alert.alert('Inversión IA', error?.message || 'No se pudo registrar.');
    } finally {
      setLoading(false);
    }
  }

  async function saveUserPrice(userId: string) {
    try {
      const raw = (priceDrafts[userId] || '').trim();
      const value = raw ? Number(raw.replace(',', '.')) : null;
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        Alert.alert('Precio', 'Ingresa un precio válido o deja vacío para usar el sugerido.');
        return;
      }

      setWorkingUid(userId);
      await setUserMonthlyPrice(userId, value);
      await loadData();
    } catch (error: any) {
      Alert.alert('Precio', error?.message || 'No se pudo guardar el precio.');
    } finally {
      setWorkingUid('');
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, compact && styles.containerCompact]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>ADMINISTRACIÓN</Text>
      <Text style={styles.title}>Control del negocio</Text>
      <Text style={styles.subtitle}>
        Costos de IA, tipo de cambio, inversión realizada y precio mensual por usuario.
      </Text>

      <Pressable style={styles.refresh} onPress={loadData}>
        <Text style={styles.refreshText}>{loading ? 'Actualizando…' : 'Actualizar datos'}</Text>
      </Pressable>

      {!!analytics && (
        <>
          <Text style={styles.sectionTitle}>Configuración mensual</Text>
          <View style={styles.formCard}>
            <Field
              label="Tipo de cambio Bs / USD"
              value={exchangeRate}
              onChangeText={setExchangeRate}
              placeholder="Ej. 10.50"
            />
            <Field
              label="Multiplicador comercial"
              value={markup}
              onChangeText={setMarkup}
              placeholder="4"
            />
            <Field
              label="Colchón de seguridad %"
              value={buffer}
              onChangeText={setBuffer}
              placeholder="25"
            />
            <Field
              label="Turnos/día usuario normal"
              value={normalTurns}
              onChangeText={setNormalTurns}
              placeholder="25"
            />
            <Field
              label="Precio mensual base (Bs)"
              value={defaultMonthlyPriceBob}
              onChangeText={setDefaultMonthlyPriceBob}
              placeholder="50"
            />
            <Field
              label="Comisión primera venta (Bs)"
              value={firstSaleCommissionBob}
              onChangeText={setFirstSaleCommissionBob}
              placeholder="20"
            />
            <Field
              label="Comisión renovación (Bs)"
              value={renewalCommissionBob}
              onChangeText={setRenewalCommissionBob}
              placeholder="5"
            />
            <Pressable style={styles.primaryAction} onPress={saveBusinessSettings}>
              <Text style={styles.primaryActionText}>Guardar configuración</Text>
            </Pressable>
          </View>

          <SalesAdminPanel users={users} />

          <Text style={styles.sectionTitle}>Costos IA y precio de referencia</Text>
          <Text style={styles.sectionIntro}>
            Mes {analytics.month} · {analytics.sampleUsers} usuarios con uso · {analytics.totalTurns} turnos históricos.
            Los tres idiomas forman una sola suscripción y se suman al mismo consumo.
          </Text>

          <View style={styles.metricGrid}>
            <MetricCard
              label="Costo IA histórico"
              value={money(analytics.totalAiCostUsd, 3)}
              detail="Todos los idiomas"
            />
            <MetricCard
              label="Costo IA este mes"
              value={money(analytics.currentMonthAiCostUsd, 3)}
              detail="Mes actual"
            />
            <MetricCard
              label="Usuario normal / mes"
              value={money(analytics.scenarios.normalMonthlyUsd)}
              detail="Costo IA proyectado"
            />
            <MetricCard
              label="Referencia comercial"
              value={money(analytics.referenceMonthlyPriceUsd)}
              detail="Antes de ajuste individual"
              accent
            />
          </View>

          <View style={styles.languageCard}>
            <Text style={styles.breakdownTitle}>Consumo por idioma</Text>
            {(['en', 'es', 'fr'] as const).map((code) => (
              <View key={code} style={styles.languageRow}>
                <Text style={styles.languageName}>{languageLabel(code)}</Text>
                <Text style={styles.languageValue}>
                  {analytics.languageTotals[code].turns} turnos · {money(analytics.languageTotals[code].costUsd, 3)}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Inversión en inteligencia artificial</Text>
          <View style={styles.metricGrid}>
            <MetricCard
              label="Invertido en IA"
              value={money(analytics.investmentSummary.totalInvestedUsd)}
              detail={bob(analytics.investmentSummary.totalInvestedBob)}
            />
            <MetricCard
              label="Saldo contable estimado"
              value={money(analytics.investmentSummary.estimatedRemainingUsd)}
              detail="Inversión registrada menos consumo"
            />
          </View>

          <View style={styles.formCard}>
            <Field
              label="Nueva compra IA (USD)"
              value={investmentUsd}
              onChangeText={setInvestmentUsd}
              placeholder="Ej. 20"
            />
            <TextInput
              value={investmentNote}
              onChangeText={setInvestmentNote}
              placeholder="Nota: crédito OpenAI, fecha, tarjeta, etc."
              placeholderTextColor="#9AA8B6"
              style={styles.noteInput}
            />
            <Pressable style={styles.greenAction} onPress={registerInvestment}>
              <Text style={styles.greenActionText}>Registrar inversión IA</Text>
            </Pressable>
          </View>

          {analytics.investments.slice(0, 6).map((item) => (
            <View key={item.id} style={styles.investmentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.investmentProvider}>{item.provider}</Text>
                <Text style={styles.investmentMeta}>
                  {item.purchasedAt}{item.note ? ' · ' + item.note : ''}
                </Text>
              </View>
              <View style={styles.costRight}>
                <Text style={styles.costValue}>{money(item.amountUsd)}</Text>
                {!!item.amountBob && <Text style={styles.costProjection}>{bob(item.amountBob)}</Text>}
              </View>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Precio mensual por usuario</Text>
          <Text style={styles.sectionIntro}>
            El sugerido se adapta al consumo del mes. Puedes dejarlo automático o fijar un precio especial para cada cliente.
          </Text>

          {analytics.perUser.map((item) => (
            <View key={item.id} style={styles.userPricingCard}>
              <View style={styles.userPricingTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.costUserName}>{item.displayName}</Text>
                  <Text style={styles.costUserMeta}>
                    Este mes: {item.currentMonthTurns} turnos · costo {money(item.currentMonthAiCostUsd, 3)}
                  </Text>
                  <Text style={styles.costUserMeta}>
                    Proyección IA: {money(item.projectedMonthlyAiCostUsd)} · sugerido {money(item.suggestedMonthlyPriceUsd)}
                  </Text>
                </View>
                <View style={styles.costRight}>
                  <Text style={styles.effectiveLabel}>PRECIO ACTUAL</Text>
                  <Text style={styles.effectiveUsd}>{money(item.effectiveMonthlyPriceUsd)}</Text>
                  <Text style={styles.effectiveBob}>{bob(item.effectiveMonthlyPriceBob)}</Text>
                </View>
              </View>

              <View style={styles.priceEditRow}>
                <TextInput
                  value={priceDrafts[item.id] ?? ''}
                  onChangeText={(value) =>
                    setPriceDrafts((current) => ({ ...current, [item.id]: value }))
                  }
                  placeholder={'Automático ' + money(item.suggestedMonthlyPriceUsd)}
                  placeholderTextColor="#91A0AE"
                  keyboardType="decimal-pad"
                  style={styles.priceInput}
                />
                <Pressable
                  style={styles.smallSave}
                  disabled={workingUid === item.id}
                  onPress={() => saveUserPrice(item.id)}
                >
                  <Text style={styles.smallSaveText}>
                    {workingUid === item.id ? '...' : 'Guardar'}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.autoHint}>
                Vacío = precio automático según consumo. El valor guardado queda como precio especial mensual.
              </Text>
            </View>
          ))}

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Criterio de negocio</Text>
            <Text style={styles.noticeText}>
              El costo de IA se suma aunque el usuario practique español, inglés y francés.
              El precio sugerido se recalcula con su actividad, el tipo de cambio, el margen y el colchón configurado.
              Puedes ajustar un cliente manualmente cuando consuma mucho o poco.
            </Text>
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Usuarios y accesos</Text>
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

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9AA8B6"
        keyboardType="decimal-pad"
        style={styles.fieldInput}
      />
    </View>
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
  sectionTitle: { marginTop: 8, color: '#17324D', fontSize: 20, fontWeight: '900' },
  sectionIntro: { color: '#667889', lineHeight: 20 },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 7, backgroundColor: '#EAF3FF', borderRadius: 18, padding: 16 },
  summaryValue: { color: '#17324D', fontSize: 25, fontWeight: '900' },
  summaryLabel: { color: '#587086', fontWeight: '700' },

  formCard: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2EAF3', borderRadius: 18, padding: 15, gap: 10 },
  fieldWrap: { gap: 5 },
  fieldLabel: { color: '#627487', fontSize: 11, fontWeight: '800' },
  fieldInput: { minHeight: 46, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E0E8F1', borderRadius: 12, paddingHorizontal: 12, color: '#17324D', fontWeight: '700' },
  noteInput: { minHeight: 48, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E0E8F1', borderRadius: 12, paddingHorizontal: 12, color: '#17324D' },
  primaryAction: { backgroundColor: '#2F6FED', borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
  primaryActionText: { color: '#FFF', fontWeight: '900' },
  greenAction: { backgroundColor: '#277154', borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
  greenActionText: { color: '#FFF', fontWeight: '900' },

  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flexGrow: 1, flexBasis: 155, minWidth: 145, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2EAF3', borderRadius: 17, padding: 14 },
  metricCardAccent: { backgroundColor: '#17324D', borderColor: '#17324D' },
  metricLabel: { color: '#728294', fontSize: 11, fontWeight: '800' },
  metricLabelAccent: { color: '#B9CCE0' },
  metricValue: { marginTop: 5, color: '#17324D', fontSize: 23, fontWeight: '900' },
  metricValueAccent: { color: '#FFF' },
  metricDetail: { marginTop: 3, color: '#83909E', fontSize: 10, lineHeight: 14 },
  metricDetailAccent: { color: '#CEDAE6' },

  languageCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E5EDF5' },
  languageRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 10 },
  languageName: { color: '#17324D', fontWeight: '800' },
  languageValue: { color: '#667889', fontSize: 12 },
  breakdownTitle: { color: '#17324D', fontWeight: '900' },

  investmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 15, padding: 13, borderWidth: 1, borderColor: '#E5EDF5' },
  investmentProvider: { color: '#17324D', fontWeight: '900' },
  investmentMeta: { marginTop: 3, color: '#7B8A99', fontSize: 11 },

  userPricingCard: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2EAF3', borderRadius: 18, padding: 15, gap: 10 },
  userPricingTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  costUserName: { color: '#17324D', fontWeight: '900', fontSize: 15 },
  costUserMeta: { marginTop: 4, color: '#788898', fontSize: 11, lineHeight: 16 },
  costRight: { alignItems: 'flex-end', maxWidth: 150 },
  costValue: { color: '#2F6FED', fontSize: 17, fontWeight: '900' },
  costProjection: { marginTop: 3, color: '#718294', fontSize: 10, textAlign: 'right' },
  effectiveLabel: { color: '#8A98A6', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  effectiveUsd: { marginTop: 3, color: '#2F6FED', fontSize: 19, fontWeight: '900' },
  effectiveBob: { marginTop: 2, color: '#277154', fontSize: 11, fontWeight: '800' },
  priceEditRow: { flexDirection: 'row', gap: 8 },
  priceInput: { flex: 1, minHeight: 44, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E0E8F1', borderRadius: 12, paddingHorizontal: 12, color: '#17324D' },
  smallSave: { backgroundColor: '#17324D', borderRadius: 12, paddingHorizontal: 13, justifyContent: 'center' },
  smallSaveText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  autoHint: { color: '#8A98A6', fontSize: 10, lineHeight: 14 },

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
