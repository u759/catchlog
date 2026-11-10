import { StatusBar } from 'expo-status-bar';
import { Fish, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { isGoogleConfigured, sendEmailCode, signInWithGoogle, verifyEmailCode } from '@/lib/auth';
import { colors, radius, space, type } from '@/theme';

type Busy = null | 'google' | 'send' | 'verify';

export default function SignIn() {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<string | null>) => {
    setBusy(kind);
    setError(null);
    const err = await fn();
    setError(err);
    setBusy(null);
    return err;
  };

  const sendCode = async () => {
    const err = await run('send', () => sendEmailCode(email));
    if (!err) setCodeSent(true);
  };

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Fish size={40} color={colors.onAccent} />
          </View>
          <Text style={styles.title}>CatchLog</Text>
          <Text style={styles.tagline}>Log your catches, even with no signal.</Text>
        </View>

        <View style={styles.bottom}>
          {!codeSent ? (
            <>
              <Button
                label="Continue with Google"
                variant="secondary"
                onPress={() => run('google', signInWithGoogle)}
                loading={busy === 'google'}
                disabled={!isGoogleConfigured || (busy !== null && busy !== 'google')}
              />
              <View style={styles.divider}>
                <View style={styles.line} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.line} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={() => validEmail && sendCode()}
              />
              <Button
                label="Email me a sign-in code"
                icon={Mail}
                variant="secondary"
                onPress={sendCode}
                loading={busy === 'send'}
                disabled={!validEmail || (busy !== null && busy !== 'send')}
              />
            </>
          ) : (
            <>
              <Text style={styles.prompt}>
                Enter the code we sent to <Text style={{ fontWeight: '700' }}>{email.trim()}</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="123456"
                placeholderTextColor={colors.textMuted}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={10}
                autoFocus
              />
              <Button
                label="Sign in"
                variant="secondary"
                onPress={() => run('verify', () => verifyEmailCode(email, code))}
                loading={busy === 'verify'}
                disabled={code.length < 6 || busy !== null}
              />
              <View style={styles.links}>
                <Pressable onPress={sendCode} disabled={busy !== null} hitSlop={8}>
                  <Text style={styles.link}>Resend code</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setCodeSent(false);
                    setCode('');
                    setError(null);
                  }}
                  hitSlop={8}>
                  <Text style={styles.link}>Use a different email</Text>
                </Pressable>
              </View>
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const muted = colors.onPrimaryMuted;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary, paddingHorizontal: space.xl },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.lg },
  logo: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.largeTitle, color: colors.onPrimary },
  tagline: { ...type.body, color: muted, textAlign: 'center', maxWidth: 300 },
  bottom: { gap: space.md, paddingBottom: space.lg },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: muted },
  dividerText: { ...type.caption, color: muted },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    ...type.body,
  },
  codeInput: { ...type.stat, letterSpacing: 6, textAlign: 'center' },
  prompt: { ...type.body, color: colors.onPrimary, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xs },
  link: { ...type.headline, color: colors.onPrimary },
  error: { ...type.secondary, color: colors.onPrimaryDanger, textAlign: 'center' },
});
