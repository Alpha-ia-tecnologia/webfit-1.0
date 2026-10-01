/**
 * Círculo completo como caminho SVG que começa às 12 h e segue no sentido horário.
 * Com `strokeDasharray` ele desenha arcos parciais a partir do topo sem `rotate(-90)`,
 * que se comporta de forma diferente entre o app nativo e o export web do react-native-svg.
 */
export function circlePath(center: number, radius: number): string {
  const top = center - radius;
  const bottom = center + radius;
  return `M ${center} ${top} A ${radius} ${radius} 0 1 1 ${center} ${bottom} A ${radius} ${radius} 0 1 1 ${center} ${top}`;
}
