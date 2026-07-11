/**
 * HERO 5 — Go premium.
 *
 * Static version: crown with aura and badge, no animation.
 */
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';

export function PremiumHero() {
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  return (
    <Svg viewBox="0 0 320 320" width="100%" height="100%">
      <Ellipse cx={160} cy={282} rx={120} ry={12} fill={tokens.mint} opacity={0.1} />

      <Circle cx={160} cy={140} r={100} fill={tokens.mintSoft} opacity={0.6} />

      <G transform="translate(160, 130)">
        <Path d="M -50 10 L -50 -10 L -32 -28 L -16 -8 L 0 -34 L 16 -8 L 32 -28 L 50 -10 L 50 10 Z" fill={tokens.mint} />
        <Rect x={-50} y={10} width={100} height={14} rx={2} fill="#0B5C4B" />
        <Circle cx={-30} cy={17} r={3} fill="#FBBF24" />
        <Circle cx={0}   cy={17} r={3.5} fill="#C2410C" />
        <Circle cx={30}  cy={17} r={3} fill="#FBBF24" />
        <Circle cx={-32} cy={-28} r={4} fill="#FBBF24" />
        <Circle cx={0}   cy={-34} r={5} fill="#C2410C" />
        <Circle cx={32}  cy={-28} r={4} fill="#FBBF24" />
      </G>

      <G transform="translate(80, 80)">
        <Path d="M 0 0 L 2 6 L 8 8 L 2 10 L 0 16 L -2 10 L -8 8 L -2 6 Z" fill={tokens.mint} />
      </G>
      <G transform="translate(240, 90)">
        <Path d="M 0 0 L 2 6 L 8 8 L 2 10 L 0 16 L -2 10 L -8 8 L -2 6 Z" fill={tokens.mint} />
      </G>

      <Rect x={124} y={190} width={72} height={20} rx={10} fill={tokens.mint} />
      <SvgText x={160} y={204} textAnchor="middle" fill={tokens.paper} fontSize={10} fontWeight="700" letterSpacing={1.2}>PREMIUM</SvgText>

      <Rect x={100} y={220} width={120} height={48} rx={24} fill={tokens.paper} stroke={tokens.mint} strokeWidth={3} />
      <SvgText x={160} y={252} textAnchor="middle" fill={tokens.mint} fontSize={22} fontWeight="700">2× POINTS</SvgText>
    </Svg>
  );
}
