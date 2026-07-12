import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
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

import { apiFetch } from '@/src/shared/api/client';
import { PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';
import { PrimaryButton } from '@/components/PrimaryButton';

const PIN_LENGTH = 4;

export default function SetupPinScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  const [password, setPassword] = useState('');
  const [pin, setPin] = useState<string[]>(() => Array(PIN_LENGTH).fill(''));
  const [confirmPin, setConfirmPin] = useState<string[]>(() => Array(PIN_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinInputs = useRef<(TextInput | null)[]>([]);
  const confirmInputs = useRef<(TextInput | null)[]>([]);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const confirmRef = useRef(confirmPin);
  confirmRef.current = confirmPin;

  const handlePinChange = useCallback((index: number, value: string) => {
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
      setTimeout(() => confirmInputs.current[0]?.focus(), 0);
    }
  }, []);

  const handleConfirmChange = useCallback((index: number, value: string) => {
    const digits = value.replace(/[^0-9]/g, '');
    setConfirmPin((prev) => {
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
  }, []);

  const handleKeyPress = useCallback(
    (index: number, isConfirm: boolean, e: any) => {
      const nativeEvent = e as any;
      if (nativeEvent.nativeEvent?.key === 'Backspace') {
        const current = isConfirm ? confirmRef.current : pinRef.current;
        if (current[index] === '' && index > 0) {
          (isConfirm ? confirmInputs : pinInputs).current[index - 1]?.focus();
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (pin.every((d) => d !== '') && confirmPin.every((d) => d !== '') && pin.join('') === confirmPin.join('')) {
      submit();
    }
  }, [pin, confirmPin]);

  const submit = useCallback(async () => {
    if (!password || password.length < 8) {
      setError(t('pin.password_required', { defaultValue: 'Please enter your account password.' }));
      return;
    }
    if (pin.join('') !== confirmPin.join('')) {
      setError(t('pin.mismatch', { defaultValue: 'PINs do not match.' }));
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/pin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, pin: pin.join('') }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.detail === 'string' ? data.detail : t('pin.error_generic', { defaultValue: 'Failed to set PIN.' }));
      } else {
        router.back();
      }
    } catch {
      setError(t('pin.error_connection', { defaultValue: 'Network error. Try again.' }));
    } finally {
      setVerifying(false);
    }
  }, [password, pin, confirmPin, router, t]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.paper }]}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.title, { color: tokens.ink }]}>{t('pin.setup_title', { defaultValue: 'Set Transaction PIN' })}</Text>
          <Text style={[styles.subtitle, { color: tokens.inkMuted }]}>
            {t('pin.setup_subtitle', { defaultValue: 'Enter your account password, then create a 4-digit PIN.' })}
          </Text>

          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={t('pin.password_placeholder', { defaultValue: 'Account password' })}
            placeholderTextColor={tokens.inkMuted}
            style={[styles.input, { color: tokens.ink, backgroundColor: tokens.card, borderColor: tokens.border }]}
            autoCapitalize="none"
          />

          <Text style={[styles.label, { color: tokens.inkMuted }]}>{t('pin.new_pin_label', { defaultValue: 'New PIN' })}</Text>
          <View style={styles.codeRow}>
            {pin.map((digit, i) => (
              <TextInput
                key={`pin-${i}`}
                ref={(el) => { pinInputs.current[i] = el; }}
                value={digit}
                onChangeText={(v) => handlePinChange(i, v)}
                onKeyPress={(e) => handleKeyPress(i, false, e)}
                keyboardType="number-pad"
                maxLength={PIN_LENGTH}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                returnKeyType="next"
                editable={!verifying}
                selectTextOnFocus
                style={[styles.codeBox, { color: tokens.ink, backgroundColor: tokens.card, borderColor: tokens.mint }]}
              />
            ))}
          </View>

          <Text style={[styles.label, { color: tokens.inkMuted, marginTop: 16 }]}>{t('pin.confirm_label', { defaultValue: 'Confirm PIN' })}</Text>
          <View style={styles.codeRow}>
            {confirmPin.map((digit, i) => (
              <TextInput
                key={`confirm-${i}`}
                ref={(el) => { confirmInputs.current[i] = el; }}
                value={digit}
                onChangeText={(v) => handleConfirmChange(i, v)}
                onKeyPress={(e) => handleKeyPress(i, true, e)}
                keyboardType="number-pad"
                maxLength={PIN_LENGTH}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                returnKeyType="done"
                editable={!verifying}
                selectTextOnFocus
                style={[styles.codeBox, { color: tokens.ink, backgroundColor: tokens.card, borderColor: tokens.mint }]}
              />
            ))}
          </View>

          {error ? <Text style={[styles.error, { color: '#ef4444' }]}>{error}</Text> : null}

          <PrimaryButton
            title={verifying ? t('pin.setting_up', { defaultValue: 'Setting up...' }) : t('pin.setup_button', { defaultValue: 'Set PIN' })}
            onPress={submit}
            disabled={verifying || pin.join('').length !== PIN_LENGTH || confirmPin.join('').length !== PIN_LENGTH}
            style={{ marginTop: 24 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', padding: 24 },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, marginBottom: 8 },
  subtitle: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  input: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 16,
    marginBottom: 20,
  },
  label: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 13, marginBottom: 8, alignSelf: 'flex-start' },
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
