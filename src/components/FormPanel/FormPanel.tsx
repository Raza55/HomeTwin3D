import type { ReactNode } from 'react';
import './FormPanel.css';

interface FormPanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}

export default function FormPanel({ open, title, onClose, footer, children }: FormPanelProps) {
  return (
    <div className={`form-panel${open ? ' open' : ''}`}>
      <div className="form-panel-header">
        <span className="form-panel-title">{title}</span>
        <button className="form-panel-close" onClick={onClose}>&times;</button>
      </div>
      <div className="form-panel-body">
        {children}
      </div>
      <div className="form-panel-footer">
        {footer}
      </div>
    </div>
  );
}
