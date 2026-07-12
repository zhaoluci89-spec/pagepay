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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { apiFetch } from '@/src/shared/api/client';
import { setPendingWithdrawAfterPin } from '@/src/shared/lib/pin-verify-flag';
import { PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';
import { PrimaryButton } from '@/components/PrimaryButton';

const PIN_LENGTH = 4;

type Mode = 'verify' | 'setup' | 'change';

export default function VerifyPinScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; redirect?: string }>();
  const mode = (params.mode as Mode) || 'verify';
  const redirect = params.redirect || '/(tabs)';
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  const [pin, setPin] = useState<string[]>(() => Array(PIN_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(TextInput | null)[]>([]);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  const submit = useCallback(
    async (fullPin: string) => {
      if (fullPin.length !== PIN_LENGTH) return;
      setVerifying(true);
      setError(null);
      try {
        const endpoint = mode === 'setup' ? '/api/v1/pin/setup' : mode === 'change' ? '/api/v1/pin/change' : '/api/v1/pin/verify';
        const body: Record<string, string> = { pin: fullPin };

        if (mode === 'setup') {
          body.password = '';
        } else if (mode === 'change') {
          body.current_pin = fullPin;
          body.new_pin = fullPin;
        }

        const res = await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const detail = typeof data?.detail === 'string' ? data.detail : t('pin.error_generic', { defaultValue: 'Something went wrong.' });
          setError(detail);
        } else {
          if (mode === 'verify') {
            if (redirect === '/(tabs)/wallet') {
              setPendingWithdrawAfterPin(true);
            }
            router.replace(redirect);
          } else {
            router.back();
          }
        }
      } catch {
        setError(t('pin.error_connection', { defaultValue: 'Network error. Try again.' }));
      } finally {
        setVerifying(false);
      }
    },
    [mode, redirect, router, t],
  );

  const handleChange = useCallback((index: number, value: string) => {
    const digits = value.replace(/[^0-9]/g, '');

    setPin((prev) => {
      const next = [...prev];
      if (digits.length > 1) {
        for (let i = 0; i < Math.min(digits.length, PIN_LENGTH); i++) {
          next[i] = digits[i];
        }
      } else if (digits.length === 1) {
        next[index] = digits[0];
      }
      return next;
    });
    setError(null);

    if (digits.length > 1) {
      const filledCount = Math.min(digits.length, PIN_LENGTH);
      setTimeout(() => inputs.current[filledCount - 1]?.focus(), 0);
    }
  }, []);

  const handleKeyPress = useCallback(
    (index: number, e: any) => {
      const nativeEvent = e as NativeSyntheticEvent<TextInputKeyPressEventData>;
      if (nativeEvent.nativeEvent.key === 'Backspace' && pinRef.current[index] === '' && index > 0) {
        inputs.current[index - 1]?.focus();
      }
    },
    [],
  );

  useEffect(() => {
    if (pin.every((d) => d !== '') && pin.join('').length === PIN_LENGTH) {
      submit(pin.join(''));
    }
  }, [pin, submit]);

  const title =
    mode === 'setup'
      ? t('pin.setup_title', { defaultValue: 'Set Transaction PIN' })
      : mode === 'change'
        ? t('pin.change_title', { defaultValue: 'Change PIN' })
        : t('pin.verify_title', { defaultValue: 'Enter Transaction PIN' });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.paper }]}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: tokens.inkMuted }]}>
            {t('pin.subtitle', {
              defaultValue: mode === 'setup'
                ? 'Create a 4-digit PIN for withdrawals and fallback authentication.'
                : 'Enter your PIN to continue.',
            })}
          </Text>

          <View style={styles.codeRow}>
            {pin.map((digit, i) => (
              <TextInput
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                value={digit}
                onChangeText={(v) => handleChange(i, v)}
                onKeyPress={(e) => handleKeyPress(i, e)}
                keyboardType="number-pad"
                maxLength={PIN_LENGTH}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                returnKeyType="done"
                blurOnSubmit={false}
                editable={!verifying}
                selectTextOnFocus
                style={[
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

          <PrimaryButton
            title={verifying ? t('pin.verifying', { defaultValue: 'Verifying...' }) : t('pin.submit', { defaultValue: 'Confirm' })}
            onPress={() => submit(pin.join(''))}
            disabled={verifying || pin.join('').length !== PIN_LENGTH}
            style={{ marginTop: 24 }}
          />
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
  codeRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  codeBox: {
    width: 56,
    height: 64,
    borderRadius: 14,
    borderWidth: 2,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 28,
    textAlign: 'center',
  },
  error: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 13, marginTop: 12, textAlign: 'center' },
});
