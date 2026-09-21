import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AdminSalesOverview,
  AdminUser,
  assignSalesAgent,
  createSalesAgent,
  getAdminSalesOverview,
  markCommissionPaid,
  registerMonthlyPayment,
  toggleSalesAgent,
} from '../services/admin';

function bob(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return 'Bs ' + Number(value).toFixed(2);
}

export function SalesAdminPanel({ users }: { users: AdminUser[] }) {
  const [sales, setSales] = useState<AdminSalesOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [workingKey, setWorkingKey] = useState('');

  const sellableUsers = useMemo(
    () => users.filter((user) => user.role !== 'admin'),
    [users],
  );

  async function loadSales() {
    try {
      setLoading(true);
      const next = await getAdminSalesOverview();
      setSales(next);
      setAmountDrafts((current) => {
        const nextDrafts = { ...current };
        for (const user of sellableUsers) {
          if (nextDrafts[user.id] == null) {
            nextDrafts[user.id] = String(next.settings.defaultMonthlyPriceBob);
          }
        }
        return nextDrafts;
      });
    } catch (error: any) {
      Alert.alert('Ventas', error?.message || 'No se pudo cargar ventas y comisiones.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSales();
  }, [users.length]);

  async function addAgent() {
    const name = agentName.trim();
    if (!name) {
      Alert.alert('Vendedor', 'Escribe el nombre del vendedor.');
      return;
    }

    try {
      setWorkingKey('new-agent');
      await createSalesAgent({
        name,
        phone: agentPhone.trim(),
      });
      setAgentName('');
      setAgentPhone('');
      await loadSales();
    } catch (error: any) {
      Alert.alert('Vendedor', error?.message || 'No se pudo registrar al vendedor.');
    } finally {
      setWorkingKey('');
    }
  }

  async function setAgent(user: AdminUser, salesAgentId: string | null) {
    try {
      setWorkingKey('assign-' + user.id);
      await assignSalesAgent(user.id, salesAgentId);
      await loadSales();
    } catch (error: any) {
      Alert.alert('Vendedor', error?.message || 'No se pudo asignar el vendedor.');
    } finally {
      setWorkingKey('');
    }
  }

  async function registerPayment(user: AdminUser) {
    const raw = (amountDrafts[user.id] || '').replace(',', '.').trim();
    const amount = Number(raw);

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Mensualidad', 'Ingresa un monto válido en bolivianos.');
      return;
    }

    try {
      setWorkingKey('payment-' + user.id);
      await registerMonthlyPayment({
        targetUid: user.id,
        amountBob: amount,
      });
      await loadSales();
      Alert.alert(
        'Mensualidad registrada',
        'Se activó el acceso mensual y se generó la comisión correspondiente.',
      );
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.includes('payment_already_registered')) {
        Alert.alert('Mensualidad', 'Este usuario ya tiene un pago registrado para este mes.');
      } else {
        Alert.alert('Mensualidad', message || 'No se pudo registrar el pago.');
      }
    } finally {
      setWorkingKey('');
    }
  }

  async function payCommission(commissionId: string) {
    try {
      setWorkingKey('commission-' + commissionId);
      await markCommissionPaid(commissionId);
      await loadSales();
    } catch (error: any) {
      Alert.alert('Comisión', error?.message || 'No se pudo marcar la comisión como pagada.');
    } finally {
      setWorkingKey('');
    }
  }

  async function changeAgentStatus(agentId: string, active: boolean) {
    try {
      setWorkingKey('agent-' + agentId);
      await toggleSalesAgent(agentId, active);
      await loadSales();
    } catch (error: any) {
      Alert.alert('Vendedor', error?.message || 'No se pudo cambiar el estado.');
    } finally {
      setWorkingKey('');
    }
  }

  if (!sales) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Ventas y comisiones</Text>
        <Text style={styles.emptyText}>
          {loading ? 'Cargando…' : 'Todavía no hay información comercial.'}
        </Text>
        {!loading && (
          <Pressable style={styles.smallButton} onPress={loadSales}>
            <Text style={styles.smallButtonText}>Cargar</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const activeAgents = sales.agents.filter((agent) => agent.active);
  const pending = sales.commissions.filter((item) => item.status === 'pending');

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Ventas y comisiones</Text>
      <Text style={styles.sectionIntro}>
        Precio inicial {bob(sales.settings.defaultMonthlyPriceBob)} · primera venta{' '}
        {bob(sales.settings.firstSaleCommissionBob)} · renovación{' '}
        {bob(sales.settings.renewalCommissionBob)}.
      </Text>

      <View style={styles.metricRow}>
        <Metric label="Cobrado" value={bob(sales.summary.revenueBob)} />
        <Metric label="Comisiones pendientes" value={bob(sales.summary.pendingCommissionBob)} />
        <Metric label="Comisiones pagadas" value={bob(sales.summary.paidCommissionBob)} />
        <Metric label="Neto antes de IA" value={bob(sales.summary.netAfterCommissionsBob)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Registrar vendedor</Text>
        <TextInput
          value={agentName}
          onChangeText={setAgentName}
          placeholder="Nombre del vendedor"
          placeholderTextColor="#96A4B2"
          style={styles.input}
        />
        <TextInput
          value={agentPhone}
          onChangeText={setAgentPhone}
          placeholder="Teléfono / WhatsApp"
          placeholderTextColor="#96A4B2"
          style={styles.input}
        />
        <Pressable
          style={styles.primaryButton}
          disabled={workingKey === 'new-agent'}
          onPress={addAgent}
        >
          <Text style={styles.primaryButtonText}>
            {workingKey === 'new-agent' ? 'Guardando…' : 'Agregar vendedor'}
          </Text>
        </Pressable>
      </View>

      {!!sales.agents.length && (
        <>
          <Text style={styles.subTitle}>Vendedores</Text>
          {sales.agents.map((agent) => (
            <View key={agent.id} style={styles.agentCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.agentName}>{agent.name}</Text>
                <Text style={styles.meta}>
                  {agent.phone || 'Sin teléfono'} · {agent.customerCount} cliente(s) · {agent.salesCount} pago(s)
                </Text>
                <Text style={styles.meta}>
                  Ventas {bob(agent.revenueBob)} · pendiente {bob(agent.pendingCommissionBob)}
                </Text>
              </View>
              <Pressable
                onPress={() => changeAgentStatus(agent.id, !agent.active)}
                style={[styles.statusButton, !agent.active && styles.statusButtonOff]}
              >
                <Text style={styles.statusButtonText}>{agent.active ? 'Activo' : 'Inactivo'}</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}

      <Text style={styles.subTitle}>Clientes y mensualidades</Text>
      {sellableUsers.map((user) => {
        const assigned = sales.agents.find((agent) => agent.id === user.salesAgentId);
        return (
          <View key={user.id} style={styles.customerCard}>
            <View style={styles.customerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customerName}>{user.displayName || 'Sin nombre'}</Text>
                <Text style={styles.meta}>{user.email || user.id}</Text>
                <Text style={styles.meta}>
                  Vendedor: {assigned?.name || 'Venta directa'} · pagado hasta:{' '}
                  {user.subscriptionPaidUntil || '—'}
                </Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Asignar vendedor</Text>
            <View style={styles.agentButtons}>
              <Pressable
                style={[styles.agentChip, !user.salesAgentId && styles.agentChipActive]}
                onPress={() => setAgent(user, null)}
              >
                <Text style={[styles.agentChipText, !user.salesAgentId && styles.agentChipTextActive]}>
                  Directo
                </Text>
              </Pressable>
              {activeAgents.map((agent) => (
                <Pressable
                  key={agent.id}
                  style={[styles.agentChip, user.salesAgentId === agent.id && styles.agentChipActive]}
                  onPress={() => setAgent(user, agent.id)}
                >
                  <Text
                    style={[
                      styles.agentChipText,
                      user.salesAgentId === agent.id && styles.agentChipTextActive,
                    ]}
                  >
                    {agent.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Registrar mensualidad</Text>
            <View style={styles.paymentRow}>
              <TextInput
                value={amountDrafts[user.id] ?? String(sales.settings.defaultMonthlyPriceBob)}
                onChangeText={(value) =>
                  setAmountDrafts((current) => ({ ...current, [user.id]: value }))
                }
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
              <Pressable
                style={styles.paymentButton}
                disabled={workingKey === 'payment-' + user.id}
                onPress={() => registerPayment(user)}
              >
                <Text style={styles.paymentButtonText}>
                  {workingKey === 'payment-' + user.id ? '...' : 'Registrar pago'}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Text style={styles.subTitle}>Comisiones pendientes</Text>
      {!pending.length ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No hay comisiones pendientes.</Text>
        </View>
      ) : (
        pending.map((commission) => (
          <View key={commission.id} style={styles.commissionCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.commissionTitle}>
                {commission.salesAgentName} · {bob(commission.commissionBob)}
              </Text>
              <Text style={styles.meta}>
                {commission.customerName} ·{' '}
                {commission.commissionType === 'first_sale' ? 'Primera venta' : 'Renovación'} ·{' '}
                {commission.billingMonth.slice(0, 7)}
              </Text>
            </View>
            <Pressable
              style={styles.paidButton}
              disabled={workingKey === 'commission-' + commission.id}
              onPress={() => payCommission(commission.id)}
            >
              <Text style={styles.paidButtonText}>Marcar pagada</Text>
            </Pressable>
          </View>
        ))
      )}

      {!!sales.payments.length && (
        <>
          <Text style={styles.subTitle}>Últimos pagos</Text>
          {sales.payments.slice(0, 8).map((payment) => (
            <View key={payment.id} style={styles.paymentHistory}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customerName}>{payment.customerName}</Text>
                <Text style={styles.meta}>
                  {payment.billingMonth.slice(0, 7)} · {payment.salesAgentName || 'Venta directa'}
                </Text>
              </View>
              <Text style={styles.historyAmount}>{bob(payment.amountBob)}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionTitle: { marginTop: 8, color: '#17324D', fontSize: 20, fontWeight: '900' },
  sectionIntro: { color: '#667889', lineHeight: 20 },
  subTitle: { marginTop: 5, color: '#17324D', fontSize: 16, fontWeight: '900' },

  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 130,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2EAF3',
    borderRadius: 15,
    padding: 13,
  },
  metricLabel: { color: '#748596', fontSize: 10, fontWeight: '800' },
  metricValue: { marginTop: 4, color: '#17324D', fontSize: 18, fontWeight: '900' },

  card: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2EAF3',
    borderRadius: 18,
    padding: 14,
    gap: 9,
  },
  cardTitle: { color: '#17324D', fontWeight: '900', fontSize: 15 },
  input: {
    minHeight: 44,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E0E8F1',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: '#17324D',
  },
  primaryButton: {
    backgroundColor: '#2F6FED',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFF', fontWeight: '900' },

  agentCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2EAF3',
    borderRadius: 16,
    padding: 13,
  },
  agentName: { color: '#17324D', fontWeight: '900', fontSize: 15 },
  meta: { marginTop: 3, color: '#788898', fontSize: 11, lineHeight: 16 },
  statusButton: {
    backgroundColor: '#EAF7F1',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusButtonOff: { backgroundColor: '#F1F3F5' },
  statusButtonText: { color: '#277154', fontWeight: '900', fontSize: 10 },

  customerCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2EAF3',
    borderRadius: 17,
    padding: 14,
    gap: 8,
  },
  customerHeader: { flexDirection: 'row', alignItems: 'center' },
  customerName: { color: '#17324D', fontWeight: '900' },
  fieldLabel: { marginTop: 4, color: '#627487', fontSize: 10, fontWeight: '900' },
  agentButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  agentChip: {
    backgroundColor: '#EEF3F8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  agentChipActive: { backgroundColor: '#2F6FED' },
  agentChipText: { color: '#5F7285', fontWeight: '800', fontSize: 10 },
  agentChipTextActive: { color: '#FFF' },

  paymentRow: { flexDirection: 'row', gap: 8 },
  amountInput: {
    width: 92,
    minHeight: 44,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E0E8F1',
    borderRadius: 12,
    paddingHorizontal: 11,
    color: '#17324D',
    fontWeight: '800',
  },
  paymentButton: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#17324D',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentButtonText: { color: '#FFF', fontWeight: '900', fontSize: 11 },

  commissionCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: '#FFF7E9',
    borderRadius: 15,
    padding: 13,
  },
  commissionTitle: { color: '#6F4B1D', fontWeight: '900' },
  paidButton: {
    backgroundColor: '#277154',
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  paidButtonText: { color: '#FFF', fontWeight: '900', fontSize: 10 },

  paymentHistory: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E7EDF4',
    borderRadius: 14,
    padding: 12,
  },
  historyAmount: { color: '#2F6FED', fontWeight: '900' },

  emptyCard: {
    backgroundColor: '#F6F9FC',
    borderRadius: 15,
    padding: 13,
    gap: 6,
  },
  emptyTitle: { color: '#17324D', fontWeight: '900' },
  emptyText: { color: '#788898', fontSize: 12 },
  smallButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#17324D',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallButtonText: { color: '#FFF', fontWeight: '900', fontSize: 10 },
});
