import { useEffect, useState } from 'react';
import type { LucideProps } from 'lucide-react';
import { loadLucideIcon, type IconModule } from '../services/lucideIcons';

interface Props extends LucideProps {
  name: string;
}

export default function LucideIcon({ name, ...props }: Props) {
  const [loaded, setLoaded] = useState<{ name: string; module: IconModule | null } | null>(null);
  useEffect(() => {
    let active = true;
    void loadLucideIcon(name).then(module => { if (active) setLoaded({ name, module }); })
      .catch(() => { if (active) setLoaded({ name, module: null }); });
    return () => { active = false; };
  }, [name]);
  const Icon = loaded?.name === name ? loaded.module?.default : null;
  if (!Icon) return null;
  return <Icon {...props} />;
}
