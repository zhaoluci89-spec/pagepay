/**
 * HERO 3 — Cash out / premium.
 *
 * Static version: wallet with coins and NGN symbols, no animation.
 */
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';

const STACK_COINS = [
  { y: 194 },
  { y: 170 },
];

const TRAIL_SYMBOLS = [
  { y: 100, size: 14 },
  { y: 88, size: 11 },
];

export function WalletHero() {
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  return (
    <Svg viewBox="0 0 320 320" width="100%" height="100%">
      <Ellipse cx={160} cy={282} rx={120} ry={12} fill={tokens.mint} opacity={0.1} />

      <G transform="translate(50, 56)">
        <Rect width={68} height={36} rx={8} fill={tokens.card} stroke={tokens.mint} strokeWidth={3} />
        <Rect x={10} y={11} width={48} height={14} rx={3} fill={tokens.mint} />
        <Line x1={10} y1={18} x2={58} y2={18} stroke={tokens.paper} strokeWidth={2} />
      </G>

      <Ellipse cx={244} cy={220} rx={36} ry={10} fill="#0B5C4B" />
      {STACK_COINS.map((c, i) => (
        <G key={i}>
          <Rect x={208} y={c.y} width={72} height={22} fill={tokens.mint} />
          <Ellipse cx={244} cy={c.y} rx={36} ry={10} fill={tokens.mintSoft} stroke={tokens.mint} strokeWidth={3} />
        </G>
      ))}

      <SvgText x={244} y={138} textAnchor="middle" fill={tokens.paper} fontSize={22} fontWeight="700">₦</SvgText>

      {TRAIL_SYMBOLS.map((sym, i) => (
        <SvgText key={i} x={244} y={sym.y} textAnchor="middle" fill={tokens.mint} fontSize={sym.size} fontWeight="700" opacity={0.7}>₦</SvgText>
      ))}

      <Rect x={100} y={130} width={100} height={40} rx={4} fill={tokens.mintSoft} stroke={tokens.mint} strokeWidth={3} />
      <SvgText x={118} y={158} fill={tokens.mint} fontSize={20} fontWeight="700">₦</SvgText>
      <Line x1={142} y1={146} x2={186} y2={146} stroke={tokens.mint} strokeWidth={2} opacity={0.6} />
      <Line x1={142} y1={156} x2={180} y2={156} stroke={tokens.mint} strokeWidth={2} opacity={0.6} />

      <Rect x={60} y={148} width={160} height={100} rx={14} fill={tokens.mint} />
      <Rect x={60} y={148} width={160} height={20} rx={14} fill="#0B5C4B" />

      <G>
        <Path d="M60 148 L220 148 L220 192 L60 192 Z" fill="#0B5C4B" />
        <Rect x={180} y={166} width={36} height={14} rx={4} fill={tokens.paper} />
        <Circle cx={216} cy={173} r={3} fill={tokens.mint} />
      </G>
    </Svg>
  );
}
