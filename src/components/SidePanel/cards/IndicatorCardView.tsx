import type { IndicatorCard, HAState } from '../../../types';
import LucideIcon from './LucideIcon';

interface Props {
  card: IndicatorCard;
  state: HAState | undefined;
}

export default function IndicatorCardView({ card, state }: Props) {
  const rawValue = state?.state ?? '--';
  const numValue = parseFloat(rawValue);
  const display = isNaN(numValue)
    ? rawValue
    : numValue.toFixed(card.precision ?? 0);

  return (
    <div className="indicator-card">
      {card.icon && (
        <span className="indicator-card-bg-icon">
          <LucideIcon name={card.icon} size={64} strokeWidth={2.5} />
        </span>
      )}
      <span className="indicator-card-value">
        {display}
        {card.unit && <span className="indicator-card-unit">{card.unit}</span>}
      </span>
      {card.showTitle !== false && (
        <span className="indicator-card-title">{card.title}</span>
      )}
    </div>
  );
}
