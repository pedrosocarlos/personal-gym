import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Polyline,
  Text as SvgText,
} from 'react-native-svg';
import { colors, font, spacing } from '../theme';

export interface ChartPoint {
  date: string;  // YYYY-MM-DD
  value: number;
}

interface Props {
  data: ChartPoint[];
  label: string;
  unit: string;
  color: string;
  width: number;
  height?: number;
}

const PAD = { top: 16, right: 16, bottom: 32, left: 44 };

function formatLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

export default function LineChart({
  data,
  label,
  unit,
  color,
  width,
  height = 170,
}: Props) {
  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Sem registros ainda</Text>
      </View>
    );
  }

  const cw = width - PAD.left - PAD.right;
  const ch = height - PAD.top - PAD.bottom;

  const values = data.map((d) => d.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Ensure a visible range even when all values are equal
  const pad = rawMax === rawMin ? Math.max(rawMax * 0.05, 1) : 0;
  const minVal = rawMin - pad;
  const maxVal = rawMax + pad;
  const range = maxVal - minVal;

  const xOf = (i: number) =>
    PAD.left + (data.length === 1 ? cw / 2 : (i / (data.length - 1)) * cw);
  const yOf = (v: number) =>
    PAD.top + ch - ((v - minVal) / range) * ch;

  const polyPoints = data.map((d, i) => `${xOf(i)},${yOf(d.value)}`).join(' ');

  // Y-axis: 4 evenly spaced labels
  const Y_TICKS = 4;
  const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, i) => {
    const v = minVal + (i / Y_TICKS) * range;
    const y = yOf(v);
    return { v, y };
  });

  // X-axis: first, middle, last (deduplicated)
  const xTickIdxs = Array.from(
    new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])
  );

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Svg width={width} height={height}>
        {/* Grid lines + Y labels */}
        {yTicks.map(({ v, y }, i) => (
          <G key={i}>
            <Line
              x1={PAD.left}
              y1={y}
              x2={width - PAD.right}
              y2={y}
              stroke={colors.border}
              strokeWidth={0.5}
            />
            <SvgText
              x={PAD.left - 4}
              y={y + 4}
              fontSize={9}
              fill={colors.textMuted}
              textAnchor="end"
            >
              {v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}
            </SvgText>
          </G>
        ))}

        {/* Connecting line */}
        {data.length > 1 && (
          <Polyline
            points={polyPoints}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data point circles */}
        {data.map((d, i) => (
          <Circle
            key={i}
            cx={xOf(i)}
            cy={yOf(d.value)}
            r={4}
            fill={color}
            stroke={colors.background}
            strokeWidth={2}
          />
        ))}

        {/* X-axis date labels */}
        {xTickIdxs.map((i) => (
          <SvgText
            key={i}
            x={xOf(i)}
            y={height - 6}
            fontSize={9}
            fill={colors.textMuted}
            textAnchor="middle"
          >
            {formatLabel(data[i].date)}
          </SvgText>
        ))}

        {/* Unit label top-right */}
        <SvgText
          x={width - PAD.right}
          y={PAD.top - 4}
          fontSize={9}
          fill={colors.textMuted}
          textAnchor="end"
        >
          {unit}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: {
    color: colors.textSecondary,
    fontSize: font.sm,
    fontWeight: '600',
    paddingHorizontal: spacing.xs,
  },
  empty: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  emptyText: { color: colors.textMuted, fontSize: font.sm },
});
