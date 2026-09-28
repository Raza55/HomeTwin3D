import { memo, useEffect, useState, useMemo } from 'react';
import { computeGraphGeometry, GRAPH_DIMENSIONS } from '../../../utils/graphGeometry';
import type { GraphCard, HAHistoryPoint } from '../../../types';
import { fetchHistory, generateDemoHistory } from '../../../services/haHistoryApi';
import { useDemoMode } from '../../../contexts/DemoModeContext';
import { useSimulationMode } from '../../../contexts/SimulationModeContext';
import { useTranslation } from '../../../contexts/LanguageContext';
import CardShell from './CardShell';

interface Props {
  card: GraphCard;
}

function GraphCardView({ card }: Props) {
  const { demoMode } = useDemoMode();
  const { simulationMode } = useSimulationMode();
  const t = useTranslation();
  const [points, setPoints] = useState<HAHistoryPoint[]>([]);
  const [error, setError] = useState(false);
  const graph = useMemo(() => computeGraphGeometry(points), [points]);

  useEffect(() => {
    if (demoMode || simulationMode) {
      setPoints(generateDemoHistory(card.period));
      setError(false);
      return;
    }

    let cancelled = false;
    let loading = false;

    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const data = await fetchHistory(card.entityId, card.period);
        if (!cancelled) {
          setPoints(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        loading = false;
      }
    };

    load();
    const interval = setInterval(load, (card.refreshInterval ?? 300) * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [card.entityId, card.period, card.refreshInterval, demoMode, simulationMode]);

  const renderGraph = () => {
    if (error) return <span className="graph-card-error">{t('modal.failedToLoad')}</span>;
    if (graph.count < 2) return <span className="graph-card-loading">{t('common.loading')}</span>;
    const { minVal, maxVal, polylinePoints } = graph;
    const { padX, padY, w, h, graphH } = GRAPH_DIMENSIONS;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none">
        {/* Grid lines */}
        <line x1={padX} y1={padY} x2={padX} y2={h - padY} stroke="var(--border)" strokeWidth="0.5" />
        <line x1={padX} y1={h - padY} x2={w} y2={h - padY} stroke="var(--border)" strokeWidth="0.5" />
        {/* Mid grid line */}
        <line x1={padX} y1={padY + graphH / 2} x2={w} y2={padY + graphH / 2} stroke="var(--border)" strokeWidth="0.3" strokeDasharray="4 4" />

        {/* Labels */}
        <text x={padX - 4} y={padY + 4} textAnchor="end" fill="var(--muted)" fontSize="8">{maxVal.toFixed(1)}</text>
        <text x={padX - 4} y={h - padY + 4} textAnchor="end" fill="var(--muted)" fontSize="8">{minVal.toFixed(1)}</text>

        {/* Data line */}
        <polyline points={polylinePoints} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  };

  return (
    <CardShell title={card.showTitle !== false ? card.title : ''}>
      <div className="graph-card-container">
        {renderGraph()}
      </div>
    </CardShell>
  );
}

export default memo(GraphCardView);
