/**
 * HERO 1 — Read & earn.
 *
 * Static version: book illustration with coins, no animation.
 */
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';

const COINS = [
  { cx: 84,  cy: 60,  r: 14, value: '+5'  },
  { cx: 160, cy: 20,  r: 16, value: '+10' },
  { cx: 236, cy: 60,  r: 14, value: '+5'  },
];

export function EarnHero() {
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      <View
        style={[
          {
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 240,
            height: 240,
            marginLeft: -120,
            marginTop: -120,
            borderRadius: 120,
            backgroundColor: tokens.mint,
            opacity: 0.18,
          },
        ]}
      />
      <Svg viewBox="0 0 320 320" width="100%" height="100%">
        <Ellipse cx={160} cy={282} rx={120} ry={12} fill={tokens.mint} opacity={0.1} />
        <Rect x={58} y={148} width={204} height={120} rx={10} fill="#0B5C4B" />

        <G transform="translate(160, 205)">
          <Path d="M60 152 L160 158 L160 258 L60 252 Z" fill={tokens.paper} stroke={tokens.mint} strokeWidth={3} />
          <Line x1={76} y1={174} x2={146} y2={176} stroke={tokens.mint} strokeWidth={3} strokeLinecap="round" opacity={0.6} />
          <Line x1={76} y1={190} x2={148} y2={192} stroke={tokens.mint} strokeWidth={3} strokeLinecap="round" opacity={0.45} />
          <Line x1={76} y1={206} x2={142} y2={208} stroke={tokens.mint} strokeWidth={3} strokeLinecap="round" opacity={0.45} />
          <Line x1={76} y1={222} x2={148} y2={224} stroke={tokens.mint} strokeWidth={3} strokeLinecap="round" opacity={0.45} />

          <Path d="M160 158 L260 152 L260 252 L160 258 Z" fill={tokens.card} stroke={tokens.mint} strokeWidth={3} />
          <Line x1={174} y1={176} x2={244} y2={174} stroke={tokens.mint} strokeWidth={3} strokeLinecap="round" />
          <Line x1={174} y1={192} x2={240} y2={190} stroke={tokens.mint} strokeWidth={3} strokeLinecap="round" opacity={0.55} />
          <Line x1={174} y1={208} x2={244} y2={206} stroke={tokens.mint} strokeWidth={3} strokeLinecap="round" opacity={0.55} />
          <Line x1={174} y1={224} x2={238} y2={222} stroke={tokens.mint} strokeWidth={3} strokeLinecap="round" opacity={0.55} />

          <Line x1={160} y1={158} x2={160} y2={258} stroke={tokens.mint} strokeWidth={2} strokeDasharray="3 4" />
        </G>

        {COINS.map((c, i) => (
          <G key={i}>
            <Circle cx={c.cx} cy={c.cy} r={c.r} fill={tokens.mint} />
            <Circle cx={c.cx} cy={c.cy} r={c.r - 4} fill="none" stroke={tokens.paper} strokeWidth={1.5} opacity={0.7} />
            <SvgText x={c.cx} y={c.cy + 4} textAnchor="middle" fill={tokens.paper} fontSize={c.r > 13 ? 9 : 8} fontWeight="700">
              {c.value}
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
}
