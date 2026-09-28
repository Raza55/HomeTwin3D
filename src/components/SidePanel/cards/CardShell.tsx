import type { ReactNode } from 'react';
import './CardShell.css';

interface Props {
  title: string;
  children: ReactNode;
}

export default function CardShell({ title, children }: Props) {
  return (
    <div className="card-shell">
      {title && <div className="card-shell-header">{title}</div>}
      <div className="card-shell-body">{children}</div>
    </div>
  );
}
