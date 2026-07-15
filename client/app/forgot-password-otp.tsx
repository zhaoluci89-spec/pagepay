import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';

import { apiFetch } from '@/src/shared/api/client';
import { usePinInput } from '@/src/shared/hooks/use-pin-input';
import { PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';
import { PrimaryButton } from '@/components/PrimaryButton';

const OTP_LENGTH = 6;
const CODE_BOX_GAP = 10;

export default function ForgotPasswordOtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ identifier?: string }>();
  const identifier = params.identifier || '';
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];
  const { width } = useWindowDimensions();

  const boxWidth = Math.max(
    44,
    Math.min(56, Math.floor((width - 48 - (OTP_LENGTH - 1) * CODE_BOX_GAP) / OTP_LENGTH))
  );
  const codeRowStyle = {
    flexDirection: 'row' as const,
    gap: CODE_BOX_GAP,
    justifyContent: 'center' as const,
  };

  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (fullCode: string) => {
    if (!identifier || fullCode.length !== OTP_LENGTH) return;
    setVerifying(true);
    setError(null);
    setMessage(null);
    try {
      const isEmail = identifier.includes('@');
      const body: Record<string, string> = { otp: fullCode };
      if (isEmail) body.email = identifier;
      else body.phone = identifier;

      const res = await apiFetch('/api/v1/auth/forgot-password/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = typeof data?.detail === 'string' ? data.detail : t('forgot_password_otp.error_generic', { defaultValue: 'Invalid code.' });
        setError(detail);
      } else {
        const data = await res.json().catch(() => ({ reset_token: '' }));
        setMessage(t('forgot_password_otp.success', { defaultValue: 'Code verified.' }));
        setTimeout(() => router.replace({ pathname: '/reset-password', params: { token: data.reset_token || '' } }), 800);
      }
    } catch {
      setError(t('forgot_password_otp.error_connection', { defaultValue: 'Network error. Try again.' }));
    } finally {
      setVerifying(false);
    }
  }, [identifier, router, t]);

  const { values: code, inputs, handleChange, handleKeyPress, reset } = usePinInput({
    length: OTP_LENGTH,
    onSubmit: handleSubmit,
  });

  useEffect(() => {
    reset();
  }, [reset]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleResend = useCallback(async () => {
    setError(null);
    setMessage(null);
    try {
      const isEmail = identifier.includes('@');
      const body: Record<string, string> = isEmail ? { email: identifier } : { phone: identifier };
      const res = await apiFetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.detail === 'string' ? data.detail : t('forgot_password_otp.resend_error', { defaultValue: 'Could not resend code.' }));
      } else {
        setMessage(t('forgot_password_otp.resend_success', { defaultValue: 'New code sent.' }));
      }
    } catch {
      setError(t('forgot_password_otp.error_connection', { defaultValue: 'Network error. Try again.' }));
    }
  }, [identifier, t]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.paper }]}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.title, { color: tokens.ink }]}>{t('forgot_password_otp.title', { defaultValue: 'Enter reset code' })}</Text>
          <Text style={[styles.subtitle, { color: tokens.inkMuted }]}>
            {t('forgot_password_otp.subtitle', { defaultValue: 'We sent a 6-digit code to' })}{'\n'}
            <Text style={{ fontWeight: '600', color: tokens.ink }}>{identifier || ''}</Text>
          </Text>

          <View style={codeRowStyle}>
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                value={digit}
                onChangeText={(v) => handleChange(i, v)}
                onKeyPress={(e) => handleKeyPress(i, e)}
                keyboardType="number-pad"
                maxLength={1}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                returnKeyType="done"
                blurOnSubmit={false}
                editable={!verifying}
                selectTextOnFocus
                style={[
                  { width: boxWidth, height: boxWidth * 1.15 },
                  styles.codeBox,
                  {
                    color: tokens.ink,
                    backgroundColor: tokens.card,
                    borderColor: error ? '#ef4444' : tokens.mint,
                  },
                ]}
              />
            ))}
          </View>

          {error ? <Text style={[styles.error, { color: '#ef4444' }]}>{error}</Text> : null}
          {message ? <Text style={[styles.success, { color: tokens.mint }]}>{message}</Text> : null}

          <PrimaryButton
            title={verifying ? t('forgot_password_otp.verifying', { defaultValue: 'Verifying...' }) : t('forgot_password_otp.submit', { defaultValue: 'Verify code' })}
            onPress={() => handleSubmit(code.join(''))}
            disabled={verifying || code.join('').length !== OTP_LENGTH}
            style={{ marginTop: 24 }}
          />

          <View style={styles.tertiaryRow}>
            <Pressable onPress={handleBack} hitSlop={6}>
              <Text style={[styles.tertiaryLink, { color: tokens.mint }]}>
                {t('forgot_password_otp.back', { defaultValue: '← Back' })}
              </Text>
            </Pressable>
            <Pressable onPress={handleResend} disabled={verifying}>
              <Text style={[styles.tertiaryLink, { color: tokens.mint }]}>
                {t('forgot_password_otp.resend', { defaultValue: 'Resend code' })}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, marginBottom: 8 },
  subtitle: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 14, textAlign: 'center', marginBottom: 32 },
  codeRow: { flexDirection: 'row', justifyContent: 'center' },
  codeBox: {
    borderRadius: 14,
    borderWidth: 2,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 28,
    textAlign: 'center',
  },
  error: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 13, marginTop: 12, textAlign: 'center' },
  success: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 13, marginTop: 12, textAlign: 'center' },
  tertiaryRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, marginTop: 24 },
  tertiaryLink: { fontSize: 14, fontWeight: '600' },
});
