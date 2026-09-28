import { X } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import type { RoomZonePoint } from '../types';
import './RoomSplitAssignmentDialog.css';

export interface RoomSplitTargetOption {
  value: string;
  label: string;
  group: 'existing' | 'available';
}

interface Props {
  pieces: RoomZonePoint[][];
  assignments: string[];
  options: RoomSplitTargetOption[];
  sourceTargetKey: string | null;
  sourceRoomName: string;
  errorMessage?: string | null;
  onAssignmentChange: (pieceIndex: number, target: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const PIECE_COLORS = ['#0aa6b8', '#f2851f', '#73b82e', '#d05bb8'];

export default function RoomSplitAssignmentDialog({
  pieces,
  assignments,
  options,
  sourceTargetKey,
  sourceRoomName,
  errorMessage,
  onAssignmentChange,
  onConfirm,
  onCancel,
}: Props) {
  const t = useTranslation();
  if (!pieces.length) return null;

  const selectedTargets = assignments.filter(Boolean);
  const hasDuplicate = new Set(selectedTargets).size !== selectedTargets.length;
  const canConfirm = assignments.length === pieces.length
    && assignments.every(Boolean)
    && !hasDuplicate;
  const sourceWillBeRemoved = Boolean(sourceTargetKey && !assignments.includes(sourceTargetKey));
  const existingOptions = options.filter((option) => option.group === 'existing');
  const availableOptions = options.filter((option) => option.group === 'available');

  return (
    <div className="room-split-dialog-backdrop">
      <section
        className="room-split-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-split-dialog-title"
      >
        <header className="room-split-dialog-header">
          <div>
            <h2 id="room-split-dialog-title">{t('rooms.splitAssignTitle')}</h2>
            <p>{t('rooms.splitAssignHint')}</p>
          </div>
          <button
            type="button"
            className="room-split-dialog-close"
            onClick={onCancel}
            aria-label={t('common.cancel')}
            title={t('common.cancel')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="room-split-dialog-body">
          {pieces.map((piece, pieceIndex) => {
            const selected = assignments[pieceIndex] ?? '';
            const usedByOtherPiece = new Set(assignments.filter((value, index) => index !== pieceIndex && value));
            return (
              <div className="room-split-assignment-row" key={`split-piece-${pieceIndex}`}>
                <div className="room-split-piece-label">
                  <span
                    className="room-split-piece-swatch"
                    style={{ backgroundColor: PIECE_COLORS[pieceIndex % PIECE_COLORS.length] }}
                    aria-hidden="true"
                  />
                  <span>{t('rooms.splitPart', { number: pieceIndex + 1 })}</span>
                  <span className="room-split-piece-points">
                    {t('rooms.pointsCount', { count: piece.length })}
                  </span>
                </div>
                <select
                  value={selected}
                  onChange={(event) => onAssignmentChange(pieceIndex, event.target.value)}
                  aria-label={t('rooms.splitPartTarget', { number: pieceIndex + 1 })}
                >
                  <option value="">{t('rooms.splitSelectRoom')}</option>
                  {existingOptions.length > 0 && (
                    <optgroup label={t('rooms.splitExistingTargets')}>
                      {existingOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          disabled={usedByOtherPiece.has(option.value)}
                        >
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {availableOptions.length > 0 && (
                    <optgroup label={t('rooms.splitAvailableTargets')}>
                      {availableOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          disabled={usedByOtherPiece.has(option.value)}
                        >
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            );
          })}

          {sourceWillBeRemoved && (
            <div className="room-split-dialog-warning" role="status">
              {t('rooms.splitSourceRemoved', { room: sourceRoomName })}
            </div>
          )}
          {hasDuplicate && (
            <div className="room-split-dialog-warning" role="alert">
              {t('rooms.splitDuplicateTarget')}
            </div>
          )}
          {errorMessage && (
            <div className="room-split-dialog-error" role="alert">
              {errorMessage}
            </div>
          )}
        </div>

        <footer className="room-split-dialog-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-success" disabled={!canConfirm} onClick={onConfirm}>
            {t('rooms.splitApplyAssignments')}
          </button>
        </footer>
      </section>
    </div>
  );
}
