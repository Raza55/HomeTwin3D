import { useState } from 'react';

interface AccordionSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function AccordionSection({ title, defaultOpen = false, children }: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="accordion-section">
      <div className="accordion-header" onClick={() => setOpen(v => !v)}>
        <span className={`accordion-chevron${open ? '' : ' collapsed'}`}>&#9660;</span>
        <span className="accordion-title">{title}</span>
      </div>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}
