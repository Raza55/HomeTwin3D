import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import './ModalHeader.css';

/**
 * Shared header of the device popups (light, remote, display, indicator):
 * icon tile (lit while the device is on), name, one status line, close button.
 */
export default function ModalHeader({ icon, active, title, subtitle, hint, onClose }: {
  icon?: ReactNode;
  active?: boolean;
  title: string;
  subtitle?: ReactNode;
  /** Tooltip on the name, e.g. the entity id. */
  hint?: string;
  onClose: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="modal-header">
      <div className="modal-title">
        {icon && <div className={`modal-icon${active ? ' active' : ''}`} aria-hidden="true">{icon}</div>}
        <div className="modal-heading">
          <div className="modal-name" title={hint}>{title}</div>
          {subtitle !== undefined && subtitle !== '' && <div className="modal-subtitle">{subtitle}</div>}
        </div>
      </div>
      <button type="button" className="modal-close-btn" onClick={onClose} aria-label={t('common.close')}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
