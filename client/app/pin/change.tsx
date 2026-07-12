import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

export default function ChangePinScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  const [currentPin, setCurrentPin] = useState<string[]>(() => Array(PIN_LENGTH).fill(''));
  const [newPin, setNewPin] = useState<string[]>(() => Array(PIN_LENGTH).fill(''));
  const [confirmPin, setConfirmPin] = useState<string[]>(() => Array(PIN_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentInputs = useRef<(TextInput | null)[]>([]);
  const newInputs = useRef<(TextInput | null)[]>([]);
  const confirmInputs = useRef<(TextInput | null)[]>([]);
  const currentRef = useRef(currentPin);
  currentRef.current = currentPin;
  const newRef = useRef(newPin);
  newRef.current = newPin;
  const confirmRef = useRef(confirmPin);
  confirmRef.current = confirmPin;

  const handleCurrentChange = useCallback((index: number, value: string) => {
    const digits = value.replace(/[^0-9]/g, '');
    setCurrentPin((prev) => {
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
      setTimeout(() => newInputs.current[0]?.focus(), 0);
    }
  }, []);

  const handleNewChange = useCallback((index: number, value: string) => {
    const digits = value.replace(/[^0-9]/g, '');
    setNewPin((prev) => {
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
    (index: number, field: 'current' | 'new' | 'confirm', e: any) => {
      const nativeEvent = e as any;
      if (nativeEvent.nativeEvent?.key === 'Backspace') {
        const map = { current: currentRef, new: newRef, confirm: confirmRef };
        const inputsMap = { current: currentInputs, new: newInputs, confirm: confirmInputs };
        const current = map[field].current;
        if (current[index] === '' && index > 0) {
          inputsMap[field].current[index - 1]?.focus();
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (currentPin.every((d) => d !== '') && newPin.every((d) => d !== '') && confirmPin.every((d) => d !== '')) {
      submit();
    }
  }, [currentPin, newPin, confirmPin]);

  const submit = useCallback(async () => {
    if (newPin.join('') !== confirmPin.join('')) {
      setError(t('pin.mismatch', { defaultValue: 'New PINs do not match.' }));
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/pin/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_pin: currentPin.join(''), new_pin: newPin.join('') }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.detail === 'string' ? data.detail : t('pin.error_generic', { defaultValue: 'Failed to change PIN.' }));
      } else {
        router.back();
      }
    } catch {
      setError(t('pin.error_connection', { defaultValue: 'Network error. Try again.' }));
    } finally {
      setVerifying(false);
    }
  }, [currentPin, newPin, confirmPin, router, t]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.paper }]}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.title, { color: tokens.ink }]}>{t('pin.change_title', { defaultValue: 'Change Transaction PIN' })}</Text>

          <Text style={[styles.label, { color: tokens.inkMuted }]}>{t('pin.current_pin_label', { defaultValue: 'Current PIN' })}</Text>
          <View style={styles.codeRow}>
            {currentPin.map((digit, i) => (
              <TextInput
                key={`current-${i}`}
                ref={(el) => { currentInputs.current[i] = el; }}
                value={digit}
                onChangeText={(v) => handleCurrentChange(i, v)}
                onKeyPress={(e) => handleKeyPress(i, 'current', e)}
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

          <Text style={[styles.label, { color: tokens.inkMuted, marginTop: 16 }]}>{t('pin.new_pin_label', { defaultValue: 'New PIN' })}</Text>
          <View style={styles.codeRow}>
            {newPin.map((digit, i) => (
              <TextInput
                key={`new-${i}`}
                ref={(el) => { newInputs.current[i] = el; }}
                value={digit}
                onChangeText={(v) => handleNewChange(i, v)}
                onKeyPress={(e) => handleKeyPress(i, 'new', e)}
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

          <Text style={[styles.label, { color: tokens.inkMuted, marginTop: 16 }]}>{t('pin.confirm_label', { defaultValue: 'Confirm New PIN' })}</Text>
          <View style={styles.codeRow}>
            {confirmPin.map((digit, i) => (
              <TextInput
                key={`confirm-${i}`}
                ref={(el) => { confirmInputs.current[i] = el; }}
                value={digit}
                onChangeText={(v) => handleConfirmChange(i, v)}
                onKeyPress={(e) => handleKeyPress(i, 'confirm', e)}
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
            title={verifying ? t('pin.changing', { defaultValue: 'Changing...' }) : t('pin.change_button', { defaultValue: 'Change PIN' })}
            onPress={submit}
            disabled={verifying || currentPin.join('').length !== PIN_LENGTH || newPin.join('').length !== PIN_LENGTH || confirmPin.join('').length !== PIN_LENGTH}
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
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, marginBottom: 20 },
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
