import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../services/firebase';
import { initializeUserProfile } from '../services/user';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!auth) {
      Alert.alert('Firebase', 'Firebase todavía no está configurado.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || password.length < 6) {
      Alert.alert('Datos', 'Escribe un correo válido y una contraseña de al menos 6 caracteres.');
      return;
    }

    try {
      setBusy(true);

      if (mode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        if (name.trim()) {
          await updateProfile(credential.user, { displayName: name.trim().slice(0, 80) });
        }
        await initializeUserProfile(name.trim());
        await sendEmailVerification(credential.user).catch(() => null);
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        await initializeUserProfile();
      }
    } catch (error: any) {
      const message = String(error?.message || 'No se pudo iniciar sesión.')
        .replace('Firebase: ', '')
        .replace(/\(auth\/.+?\)\.?/, '');
      Alert.alert('Cuenta', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.logoWrap}>
        <Text style={styles.logo}>everyone</Text>
        <Text style={styles.logoAccent}>english</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>{mode === 'register' ? 'EMPIEZA GRATIS' : 'BIENVENIDO'}</Text>
        <Text style={styles.title}>{mode === 'register' ? '2 días para hablar inglés con Emma' : 'Continúa practicando'}</Text>
        <Text style={styles.subtitle}>
          {mode === 'register'
            ? 'Crea tu cuenta y empieza a conversar de inmediato. No necesitas tarjeta para la prueba.'
            : 'Ingresa con el correo que usaste al registrarte.'}
        </Text>

        {mode === 'register' && (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Tu nombre"
            placeholderTextColor="#9AA8B6"
            style={styles.input}
          />
        )}

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Correo electrónico"
          placeholderTextColor="#9AA8B6"
          style={styles.input}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Contraseña"
          placeholderTextColor="#9AA8B6"
          style={styles.input}
        />

        <Pressable disabled={busy} onPress={submit} style={[styles.primary, busy && styles.disabled]}>
          <Text style={styles.primaryText}>{busy ? 'Procesando…' : mode === 'register' ? 'Crear cuenta y empezar' : 'Entrar'}</Text>
        </Pressable>

        <Pressable onPress={() => setMode(mode === 'register' ? 'login' : 'register')} style={styles.switchButton}>
          <Text style={styles.switchText}>
            {mode === 'register' ? 'Ya tengo cuenta · Iniciar sesión' : 'No tengo cuenta · Crear cuenta'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.note}>
        La prueba gratuita dura 48 horas. Después, la conversación con IA se bloquea hasta activar una suscripción.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F7FAFD' },
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logo: { color: '#17324D', fontSize: 30, lineHeight: 29, fontWeight: '900' },
  logoAccent: { color: '#2F6FED', fontSize: 30, lineHeight: 29, fontWeight: '900' },
  card: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 26, padding: 24, borderWidth: 1, borderColor: '#E4ECF4' },
  eyebrow: { color: '#2F6FED', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { marginTop: 8, color: '#17324D', fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { marginTop: 10, marginBottom: 18, color: '#657687', lineHeight: 21 },
  input: { minHeight: 54, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#DEE7F0', borderRadius: 15, paddingHorizontal: 15, marginTop: 10, color: '#17324D' },
  primary: { marginTop: 16, minHeight: 56, borderRadius: 16, backgroundColor: '#2F6FED', justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.55 },
  primaryText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  switchButton: { marginTop: 16, alignItems: 'center' },
  switchText: { color: '#2F6FED', fontWeight: '800' },
  note: { marginTop: 18, color: '#758596', textAlign: 'center', fontSize: 12, lineHeight: 18, maxWidth: 520, alignSelf: 'center' },
});
