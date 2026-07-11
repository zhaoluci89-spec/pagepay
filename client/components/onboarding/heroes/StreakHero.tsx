/**
 * HERO 4 — Reading streak.
 *
 * Static version: 7-day streak row with flame, no animation.
 */
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';

const DAYS = [
  { x: 40,  letter: 'M', today: false, locked: false },
  { x: 74,  letter: 'T', today: false, locked: false },
  { x: 108, letter: 'W', today: false, locked: false },
  { x: 142, letter: 'T', today: false, locked: false },
  { x: 176, letter: 'F', today: false, locked: false },
  { x: 210, letter: 'S', today: true,  locked: false },
  { x: 244, letter: 'S', today: false, locked: true  },
];

export function StreakHero() {
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  return (
    <Svg viewBox="0 0 320 320" width="100%" height="100%">
      <Ellipse cx={160} cy={282} rx={120} ry={12} fill={tokens.mint} opacity={0.1} />

      {DAYS.map((d, i) => (
        <G key={i}>
          {d.locked ? (
            <Rect x={d.x} y={220} width={28} height={36} rx={6} fill={tokens.mintSoft} stroke={tokens.mint} strokeWidth={2} strokeDasharray="2 3" />
          ) : (
            <Rect x={d.x} y={220} width={28} height={36} rx={6} fill={d.today ? tokens.mint : tokens.mintSoft} />
          )}
          {d.today && (
            <Rect x={d.x - 3} y={217} width={34} height={42} rx={8} fill="none" stroke={tokens.mint} strokeWidth={2} opacity={0.4} />
          )}
          <SvgText x={d.x + 14} y={244} textAnchor="middle" fill={d.locked ? tokens.mint : tokens.paper} fontSize={11} fontWeight="700" opacity={d.locked ? 0.5 : 1}>
            {d.letter}
          </SvgText>
        </G>
      ))}

      <Rect x={100} y={180} width={120} height={28} rx={14} fill={tokens.mintSoft} stroke={tokens.mint} strokeWidth={2} />
      <SvgText x={160} y={199} textAnchor="middle" fill={tokens.mint} fontSize={13} fontWeight="700">7 day streak</SvgText>

      <G transform="translate(160, 130)">
        <Path d="M 0 -56 C 22 -32 28 -16 28 -4 C 28 22 14 36 0 36 C -14 36 -28 22 -28 -4 C -28 -16 -22 -32 0 -56 Z" fill="#C2410C" />
        <Path d="M 0 -38 C 14 -22 18 -8 18 2 C 18 18 10 28 0 28 C -10 28 -18 18 -18 2 C -18 -8 -14 -22 0 -38 Z" fill="#FB923C" />
        <Path d="M 0 -22 C 8 -12 10 -2 10 6 C 10 16 6 22 0 22 C -6 22 -10 16 -10 6 C -10 -2 -8 -12 0 -22 Z" fill="#FBBF24" />
        <Ellipse cx={0} cy={14} rx={4} ry={6} fill={tokens.paper} />
      </G>

      <Circle cx={120} cy={80} r={3} fill="#C2410C" />
      <Circle cx={200} cy={60} r={2.5} fill="#FB923C" />
      <Circle cx={180} cy={40} r={2} fill="#FB923C" />

      <SvgText x={160} y={280} textAnchor="middle" fill={tokens.inkMuted} fontSize={10} fontWeight="500" letterSpacing={0.8}>
        KEEP THE STREAK ALIVE
      </SvgText>
    </Svg>
  );
}
