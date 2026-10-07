import {
  AlarmClock, Award, Briefcase, Bus, Cake, Car, Drama, NotebookPen, PartyPopper, Plane, School, Scissors,
  ShoppingCart, Stethoscope, Sun, Syringe, Trophy, Users, Utensils, type LucideIcon,
} from 'lucide-react';
import type { EventKind } from '../../services/calendar/eventKinds';

export const KIND_ICONS: Record<EventKind, LucideIcon> = {
  exam: NotebookPen, free: Sun, doctor: Stethoscope, vaccine: Syringe, birthday: Cake, certificate: Award,
  deadline: AlarmClock, work: Briefcase, parents: Users, sport: Trophy, trip: Bus, travel: Plane, culture: Drama,
  haircut: Scissors, shopping: ShoppingCart, food: Utensils, party: PartyPopper, car: Car, school: School,
};

export default function EventIcon({ kind, size = 13 }: { kind?: EventKind; size?: number }) {
  if (!kind) return null;
  const Icon = KIND_ICONS[kind];
  return <Icon className="cal-event-icon" size={size} strokeWidth={2} aria-hidden="true" />;
}
