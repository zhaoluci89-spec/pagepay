/**
 * HERO 2 — Study with AI.
 *
 * Static version: phone shell with quiz cards and flashcards, no animation.
 */
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { PagePay } from '@/constants/theme';
import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';

const FLASHCARDS = [
  { x: 40,  y: 64,  w: 36, h: 48, rot: -8,  lines: 3 },
  { x: 244, y: 68,  w: 40, h: 52, rot: 6,   lines: 2 },
  { x: 248, y: 196, w: 44, h: 56, rot: 7,   lines: 2 },
];

export function StudyHero() {
  const scheme = useEffectiveScheme();
  const tokens = PagePay[scheme];

  return (
    <Svg viewBox="0 0 320 320" width="100%" height="100%">
      <Ellipse cx={160} cy={282} rx={120} ry={12} fill={tokens.mint} opacity={0.1} />

      {FLASHCARDS.map((f, i) => (
        <G key={i} transform={`translate(${f.x + f.w / 2} ${f.y + f.h / 2}) rotate(${f.rot}) translate(${-(f.x + f.w / 2)} ${-(f.y + f.h / 2)})`}>
          <Rect x={f.x} y={f.y} width={f.w} height={f.h} rx={6} fill={f.lines > 1 ? tokens.mintSoft : tokens.card} stroke={tokens.mint} strokeWidth={2} />
          {Array.from({ length: f.lines }).map((_, j) => (
            <Line key={j} x1={f.x + 8} y1={f.y + 12 + j * 10} x2={f.x + f.w - (j === f.lines - 1 ? 6 : 10)} y2={f.y + 12 + j * 10} stroke={tokens.mint} strokeWidth={2} opacity={0.6 - j * 0.15} />
          ))}
        </G>
      ))}

      <Rect x={86} y={86} width={148} height={200} rx={20} fill={tokens.card} stroke={tokens.mint} strokeWidth={3} />
      <Rect x={86} y={86} width={148} height={20} rx={20} fill={tokens.mint} />
      <Circle cx={160} cy={96} r={2.5} fill={tokens.paper} />

      <G transform="translate(160, 192)">
        <Rect x={-54} y={-46} width={108} height={92} rx={10} fill={tokens.mintSoft} stroke={tokens.mint} strokeWidth={2} />
        <Rect x={-54} y={-50} width={108} height={92} rx={10} fill={tokens.mintSoft} stroke={tokens.mint} strokeWidth={2} />
      </G>
      <Rect x={100} y={142} width={120} height={100} rx={10} fill={tokens.card} stroke={tokens.mint} strokeWidth={3} />
      <SvgText x={160} y={186} textAnchor="middle" fill={tokens.mint} fontSize={36} fontWeight="700">?</SvgText>
      <Rect x={112} y={206} width={96} height={12} rx={6} fill={tokens.mintSoft} />
      <Rect x={112} y={222} width={78} height={12} rx={6} fill={tokens.mintSoft} />

      <G transform="translate(232, 96)">
        <Path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z" fill={tokens.mint} />
        <Circle cx={0} cy={0} r={4} fill={tokens.paper} />
      </G>
    </Svg>
  );
}
