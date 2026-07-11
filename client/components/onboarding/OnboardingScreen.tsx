/**
 * Onboarding screen scaffold.
 *
 * Static version: faked iOS status bar, Skip button, hero illustration
 * (children), copy (eyebrow + headline + body), dot indicator, and CTA
 * button. No animation.
 */
import { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Fonts, PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';
import { OnboardingDots } from './Dots';

type OnboardingScreenProps = {
  eyebrow: string;
  headline: string;
  body: string;
  isLast?: boolean;
  index: number;
  total: number;
  onSkip: () => void;
  onPrimary: (origin: { x: number; y: number }) => void;
  children: ReactNode;
  style?: ViewStyle;
};

function FakeStatusBar() {
  return (
    <View style={styles.status}>
      <Text style={styles.statusTime}>9:41</Text>
      <View style={styles.statusRight}>
        <View style={styles.signalBars}>
          <View style={[styles.bar, { height: 4 }]} />
          <View style={[styles.bar, { height: 6 }]} />
          <View style={[styles.bar, { height: 8 }]} />
          <View style={[styles.bar, { height: 11 }]} />
        </View>
        <View style={styles.wifi}>
          <View style={[styles.wifiArc, styles.wifiArc3]} />
          <View style={[styles.wifiArc, styles.wifiArc2]} />
          <View style={styles.wifiDot} />
        </View>
        <View style={styles.battery}>
          <View style={styles.batteryFill} />
          <View style={styles.batteryTip} />
        </View>
      </View>
    </View>
  );
}

export function OnboardingScreen({
  eyebrow,
  headline,
  body,
  isLast,
  index,
  total,
  onSkip,
  onPrimary,
  children,
  style,
}: OnboardingScreenProps) {
  const { t } = useTranslation();
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  const handlePrimary = (e: any) => {
    const target = e.target;
    target?.measure?.((x: number, y: number, w: number, h: number, px: number, py: number) => {
      onPrimary({ x: px + w / 2, y: py + h / 2 });
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: tokens.paper }, style]}>
      <FakeStatusBar />

      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.top}>
          {isLast ? (
            <View style={styles.skipSpacer} />
          ) : (
            <Pressable
              onPress={onSkip}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.skip')}
            >
              <Text style={[styles.skip, { color: tokens.inkMuted }]}>
                {t('onboarding.skip')}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.hero}>{children}</View>

        <View style={styles.copy}>
          <Text
            style={[
              styles.eyebrow,
              { color: tokens.mint, fontFamily: Fonts.display },
            ]}
          >
            {eyebrow}
          </Text>
          <Text
            style={[
              styles.headline,
              { color: tokens.ink, fontFamily: Fonts.display },
            ]}
          >
            {headline}
          </Text>
          <Text style={[styles.body, { color: tokens.inkMuted }]}>{body}</Text>
        </View>

        <View style={styles.footer}>
          <OnboardingDots count={total} active={index} />

          <View style={styles.ctaWrap}>
            <Pressable
              onPress={handlePrimary}
              accessibilityRole="button"
              accessibilityLabel={isLast ? t('onboarding.get_started') : t('onboarding.next')}
            >
              <View
                style={[
                  styles.cta,
                  { backgroundColor: tokens.mint, shadowColor: tokens.mint },
                ]}
              >
                <Text
                  style={[
                    styles.ctaText,
                    { color: tokens.mintText, fontFamily: Fonts.display },
                  ]}
                >
                  {isLast ? t('onboarding.get_started') : t('onboarding.next')}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.homeIndicator} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 24, paddingBottom: 8 },
  status: {
    height: 44,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  statusTime: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0E1116',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    backgroundColor: '#0E1116',
    borderRadius: 1,
  },
  wifi: {
    width: 14,
    height: 10,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  wifiArc: {
    position: 'absolute',
    borderColor: '#0E1116',
    borderTopWidth: 1.6,
    borderRadius: 999,
  },
  wifiArc2: {
    width: 8,
    height: 8,
    bottom: 1,
  },
  wifiArc3: {
    width: 14,
    height: 14,
    bottom: 0,
  },
  wifiDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#0E1116',
    marginBottom: 0,
  },
  battery: {
    width: 24,
    height: 11,
    borderWidth: 1,
    borderColor: '#0E1116',
    borderRadius: 2.5,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 1,
  },
  batteryFill: {
    flex: 1,
    backgroundColor: '#0E1116',
    borderRadius: 1,
  },
  batteryTip: {
    width: 1.5,
    height: 4,
    backgroundColor: '#0E1116',
    marginLeft: 0.5,
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 8,
    height: 40,
  },
  skipSpacer: { width: 1 },
  skip: {
    fontSize: 14,
    fontWeight: '500',
  },
  hero: {
    marginTop: 18,
    width: '100%',
    aspectRatio: 1,
    borderRadius: 28,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  copy: {
    marginTop: 28,
    gap: 10,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    marginTop: 'auto',
    gap: 22,
    alignItems: 'stretch',
  },
  ctaWrap: {
    position: 'relative',
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 4,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  homeIndicator: {
    width: 134,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#0E1116',
    alignSelf: 'center',
    marginTop: 12,
    opacity: 0.85,
  },
});
