/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'lucide-react/dist/esm/icons/*.js' {
  export const __iconNode: import('lucide-react').IconNode;
  const Icon: import('lucide-react').LucideIcon;
  export default Icon;
}
