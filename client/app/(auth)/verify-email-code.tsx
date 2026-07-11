import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';

import { apiFetch } from '@/src/shared/api/client';
import { PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';
import { PrimaryButton } from '@/components/PrimaryButton';

type Props = {
  email?: string;
};

export default function VerifyEmailCodeScreen({ email }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(TextInput | null)[]>([]);

  const applyCode = useCallback((raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 6);
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < digits.length && i < 6; i++) {
      next[i] = digits[i];
    }
    setCode(next);
    setError(null);
    if (digits.length === 6) {
      verifyCode(next.join(''));
    } else if (digits.length > 0) {
      inputs.current[Math.min(digits.length, 5)]?.focus();
    }
  }, [verifyCode]);

  const handleChange = useCallback((index: number, value: string) => {
    const digits = value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...code];
    next[index] = digits;
    setCode(next);
    setError(null);

    if (digits && index < 5) {
      inputs.current[index + 1]?.focus();
    }

    const full = next.every((d) => d.length === 1);
    if (full) {
      verifyCode(next.join(''));
    }
  }, [code, verifyCode]);

  const handlePaste = useCallback(async (index: number) => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) return;
      applyCode(text);
    } catch {
      // clipboard not available
    }
  }, [applyCode]);

  const verifyCode = useCallback(async (fullCode: string) => {
    if (!email) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/auth/verify-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: fullCode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.detail === 'string' ? data.detail : t('verify_email.error_generic'));
      } else {
        setMessage(t('verify_email.success'));
        setTimeout(() => router.replace('/(tabs)'), 1200);
      }
    } catch {
      setError(t('verify_email.error_connection'));
    } finally {
      setVerifying(false);
    }
  }, [email, router, t]);

  const handleResend = useCallback(async () => {
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch('/api/v1/auth/resend-verification', {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.detail === 'string' ? data.detail : t('verify_email.error_resend'));
      } else {
        setMessage(t('verify_email.success'));
      }
    } catch {
      setError(t('verify_email.error_connection'));
    } finally {
      setSending(false);
    }
  }, [t]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: tokens.paper }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>🔒</Text>
        </View>

        <Text style={[styles.title, { color: tokens.ink }]}>{t('verify_email.title')}</Text>
        <Text style={[styles.subtitle, { color: tokens.inkMuted }]}>
          {t('verify_email.code_subtitle')}{'\n'}
          <Text style={{ fontWeight: '600', color: tokens.ink }}>{email || t('verify_email.your_email')}</Text>
        </Text>

        {error ? (
          <View style={[styles.banner, { backgroundColor: tokens.signalSoft, borderColor: tokens.signal }]}>
            <Text style={[styles.bannerText, { color: tokens.signal }]}>{error}</Text>
          </View>
        ) : null}

        {message ? (
          <View style={[styles.banner, { backgroundColor: tokens.mintSoft, borderColor: tokens.mint }]}>
            <Text style={[styles.bannerText, { color: tokens.mint }]}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.codeRow}>
          {code.map((digit, i) => (
            <TextInput
              key={i}
              ref={(ref) => { inputs.current[i] = ref; }}
              value={digit}
              onChangeText={(value) => handleChange(i, value)}
              onPaste={() => handlePaste(i)}
              keyboardType="number-pad"
              maxLength={1}
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              editable={!verifying}
              style={[
                styles.codeBox,
                { color: tokens.ink, borderColor: digit ? tokens.mint : tokens.border, backgroundColor: tokens.card },
              ]}
            />
          ))}
        </View>

        <View style={{ gap: 12, marginTop: 24 }}>
          <PrimaryButton
            title={verifying ? t('verify_email.verifying') : t('verify_email.verify')}
            onPress={() => verifyCode(code.join(''))}
            disabled={verifying || code.some((d) => d.length !== 1)}
          />
          <TouchableOpacity onPress={handleResend} disabled={sending}>
            <Text style={[styles.resend, { color: tokens.mint }]}>
              {sending ? t('verify_email.sending') : t('verify_email.resend')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
            <Text style={[styles.hint, { color: tokens.inkMuted }]}>
              {t('verify_email.later')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.hint, { color: tokens.inkMuted }]}>
          {t('verify_email.spam_hint')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
    gap: 16,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  bannerText: {
    fontSize: 13,
    textAlign: 'center',
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  codeBox: {
    flex: 1,
    maxWidth: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  resend: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
