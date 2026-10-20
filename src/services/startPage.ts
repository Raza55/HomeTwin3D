export type StartPage = 'auto' | 'mobile' | 'board';
export function loadStartPage(): StartPage {
  try {
    const value = localStorage.getItem('home.startPage');
    return value === 'mobile' || value === 'board' ? value : 'auto';
  } catch { return 'auto'; }
}
export function startPath(preference: StartPage, smallScreen: boolean, simulation = false): '/mobile' | '/board' {
  if (simulation) return '/board';
  return preference === 'mobile' || preference === 'auto' && smallScreen ? '/mobile' : '/board';
}
