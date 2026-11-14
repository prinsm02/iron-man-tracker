// Minimal area/line chart in the dashboard style: coral line, soft red fill, grey axis labels.
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Line } from 'react-native-svg';
import { C, T } from './kit.tsx';

export default function Chart({
  xs, ys, width, height = 170, yTop, yBottom, xLabel, color = C.coral,
}: {
  xs: number[]; ys: number[]; width: number; height?: number;
  yTop: string; yBottom: string; xLabel: string; color?: string;
}) {
  if (xs.length < 2) return <Text style={[T.small, { paddingVertical: 40, textAlign: 'center' }]}>Not enough data yet</Text>;
  const minX = xs[0], maxX = xs[xs.length - 1];
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = (maxY - minY) * 0.1 || 1;
  const lo = minY - pad, hi = maxY + pad;
  const px = (x: number) => ((x - minX) / (maxX - minX || 1)) * width;
  const py = (y: number) => height - ((y - lo) / (hi - lo)) * height;
  const line = xs.map((x, i) => `${i ? 'L' : 'M'}${px(x).toFixed(1)},${py(ys[i]).toFixed(1)}`).join(' ');
  const area = `${line} L${px(maxX).toFixed(1)},${height} L0,${height} Z`;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={T.small}>{yTop}</Text>
      </View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.red} stopOpacity={0.35} />
            <Stop offset="1" stopColor={C.red} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke={C.line} strokeWidth={1} />
        <Path d={area} fill="url(#fill)" />
        <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={T.small}>{yBottom}</Text>
        <Text style={T.small}>{xLabel}</Text>
      </View>
    </View>
  );
}
