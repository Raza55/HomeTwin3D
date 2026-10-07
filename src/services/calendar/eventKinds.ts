/**
 * Kind of an event (for its symbol): chosen in the dialog ("Symbol: …" line) or recognised from
 * the title. The first matching rule wins, so "Zeugniskonferenzen (unterrichtsfrei)" is a free day.
 */

export const EVENT_KINDS = [
  { key: 'exam', match: /klausur|klassenarbeit|kursarbeit|\btest\b|prüfung/i },
  { key: 'free', match: /unterrichtsfrei|ferientag|schulfrei/i },
  { key: 'doctor', match: /arzt|ärztin|praxis|klinik|krankenhaus|physio|kieferorthop|untersuchung/i },
  { key: 'vaccine', match: /impf/i },
  { key: 'birthday', match: /geburtstag/i },
  { key: 'certificate', match: /zeugnis/i },
  { key: 'deadline', match: /frist|abgabe|anmeldeschluss|deadline/i },
  { key: 'work', match: /praktikum|beruf|girls|boys|tagwerk/i },
  { key: 'parents', match: /elternabend|elternsprechtag|\bseb\b|infoabend|elternbeirat|konferenz/i },
  { key: 'sport', match: /sport|fußball|fussball|training|turnier|jugendspiele|volleyball|schwimm|wettkampf|wettbewerb/i },
  { key: 'trip', match: /fahrt|ausflug|exkursion|austausch|wandertag|reflitage|refli-tage/i },
  { key: 'travel', match: /urlaub|flug|reise/i },
  { key: 'culture', match: /theater|theatre|konzert|band|festival|kino|oper|musical|aufführung|vernissage/i },
  { key: 'haircut', match: /friseur/i },
  { key: 'shopping', match: /einkauf/i },
  { key: 'food', match: /essen|restaurant|brunch/i },
  { key: 'party', match: /party|feier|fastnacht|fasching/i },
  { key: 'car', match: /werkstatt|tüv|reifenwechsel/i },
  { key: 'school', match: /schule|unterricht|homeschooling/i },
] as const;

export type EventKind = (typeof EVENT_KINDS)[number]['key'];

const KEYS = new Set<string>(EVENT_KINDS.map(k => k.key));

export function kindFromTitle(summary: string): EventKind | undefined {
  return EVENT_KINDS.find(k => k.match.test(summary))?.key;
}

/** The chosen symbol ("none" switches it off) or the one recognised from the title. */
export function eventKind(summary: string, chosen?: string): EventKind | undefined {
  if (chosen === 'none') return undefined;
  if (chosen && KEYS.has(chosen)) return chosen as EventKind;
  return kindFromTitle(summary);
}
