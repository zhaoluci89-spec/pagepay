import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import { usePinInput } from '@/src/shared/hooks/use-pin-input';
import { PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';
import { PrimaryButton } from '@/components/PrimaryButton';

const PIN_LENGTH = 4;

export default function ChangePinScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { values: currentPin, inputs: currentInputs, handleChange: handleCurrentChange, reset: resetCurrent } = usePinInput({
    length: PIN_LENGTH,
    autoSubmit: false,
  });
  const { values: newPin, inputs: newInputs, handleChange: handleNewChange, reset: resetNew } = usePinInput({
    length: PIN_LENGTH,
    autoSubmit: false,
  });
  const { values: confirmPin, inputs: confirmInputs, handleChange: handleConfirmChange, reset: resetConfirm } = usePinInput({
    length: PIN_LENGTH,
    autoSubmit: false,
  });

  const submit = useCallback(async () => {
    if (newPin.join('') !== confirmPin.join('')) {
      Alert.alert(t('pin.error', { defaultValue: 'Error' }), t('pin.mismatch', { defaultValue: 'New PINs do not match.' }));
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
        Alert.alert(t('pin.error', { defaultValue: 'Error' }), typeof data?.detail === 'string' ? data.detail : t('pin.error_generic', { defaultValue: 'Failed to change PIN.' }));
      } else {
        router.back();
      }
    } catch {
      Alert.alert(t('pin.error', { defaultValue: 'Error' }), t('pin.error_connection', { defaultValue: 'Network error. Try again.' }));
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
});
