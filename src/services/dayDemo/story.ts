/**
 * Day demo storyline: "Ein Spätsommertag im HomeTwin" — one day from 05:30 to
 * 05:30 the next morning, compressed into a few minutes. Pure data and helpers;
 * the engine maps every action onto whatever devices the installation has.
 */
import type { RoomRole } from './cast.ts';

export interface Text { de: string; en: string }

/** Story day starts and ends at 05:30. Virtual minutes run 0..1440 from there. */
export const DAY_START_CLOCK = 5 * 60 + 30;
export const DAY_LENGTH = 1440;
/** Real seconds for the whole day at 1× speed. */
export const DAY_REAL_SECONDS = 145;
/** Late summer: wake-up in the dawn, sunrise with the coffee, dusk for the movie. */
export const DEMO_DATE = { month: 8, day: 5 } as const; // 5 September

export function clockToVirtual(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return ((h * 60 + m - DAY_START_CLOCK) % DAY_LENGTH + DAY_LENGTH) % DAY_LENGTH;
}

export function virtualToClock(virtual: number): number {
  return (DAY_START_CLOCK + virtual) % DAY_LENGTH;
}

export function clockLabel(clockMinutes: number): string {
  const total = Math.floor(clockMinutes) % DAY_LENGTH;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// --- Targets and actions -----------------------------------------------------

export interface LightTarget {
  rooms?: RoomRole[];
  /** Every light (except `exclude`). */
  all?: boolean;
  exclude?: RoomRole[];
  /** Only lights that can show colours. */
  color?: boolean;
  /** When no light matches: take this many lights the story has not placed elsewhere. */
  fallback?: number;
}

export type TVMode = 'off' | 'news' | 'movie' | 'pc' | 'game';
export type ScreenKind = 'news' | 'movie' | 'work' | 'game';

export type StoryAction =
  | { type: 'light'; target: LightTarget; on: false; stagger?: number; ramp?: number }
  | {
    type: 'light'; target: LightTarget; on: true;
    /** 1..100 % */ brightness: number; kelvin?: number; hue?: number; saturation?: number;
    /** Transition length in virtual minutes. */ ramp?: number;
    from?: { brightness: number; kelvin?: number };
    /** Delay between consecutive lights in virtual minutes. */ stagger?: number;
  }
  | {
    type: 'colorloop'; target: LightTarget; on: boolean; brightness?: number; hues?: number[];
    /** Virtual minutes from one hue to the next. */ period?: number;
    /** 0..100; low values give pastel shifts rather than vivid colours. */ saturation?: number;
    /** 0..1 slow brightness breathing (dimming) on top of the hue drift. */ breathe?: number;
  }
  | { type: 'blind'; rooms?: RoomRole[]; exclude?: RoomRole[]; position: number; ramp?: number; stagger?: number }
  /**
   * Someone uses the board itself: taps a lamp (colour swatch + brightness slider in its
   * popup) or a blind (the popup's "all blinds in the room" buttons).
   */
  | { type: 'control'; kind: 'light'; rooms: RoomRole[]; swatch: string; hue: number; brightness: number }
  | { type: 'control'; kind: 'blinds'; rooms: RoomRole[]; position: number }
  | { type: 'tv'; mode: TVMode; title?: Text }
  | { type: 'pc'; on: boolean; screen?: ScreenKind }
  | { type: 'coffee'; phase: 'on' | 'brew' | 'off'; minutes?: number }
  | { type: 'echo'; rooms?: RoomRole[]; playing: boolean; title?: Text }
  /** `window`: the French windows (airing, only while their blinds are up). */
  | { type: 'door'; kind: 'entrance' | 'balcony' | 'window'; open: boolean }
  | { type: 'lock'; locked: boolean }
  | { type: 'fan'; rooms?: RoomRole[]; on: boolean; percentage?: number }
  | { type: 'vacuum'; phase: 'cleaning' | 'returning' | 'docked' }
  | { type: 'appliance'; kind: 'washer' | 'dryer'; running: boolean; minutes?: number }
  /** Opens or closes a device popup on the dashboard (e.g. the coffee machine while it brews). */
  | { type: 'popup'; target: 'coffee'; open: boolean };

export interface Chapter { id: string; icon: string; title: Text; text: Text }

export interface StoryBeat {
  at: number;
  chapter?: Chapter;
  actions: StoryAction[];
}

const beat = (clock: string, actions: StoryAction[], chapter?: Chapter): StoryBeat => ({ at: clockToVirtual(clock), chapter, actions });
/** The closing beat sits at the very end of the day (05:30 again). */
const END = DAY_LENGTH;

const WARM = 2400, NEUTRAL = 3800, DAYLIGHT = 5200;
const LIVING: RoomRole[] = ['living', 'dining'];

export const STORY: StoryBeat[] = [
  beat('05:30', [], {
    id: 'night', icon: 'moon',
    title: { de: 'Dämmerung', en: 'Dawn' },
    text: { de: 'Vom Eingang fällt der Blick durchs Wohnzimmer: Draußen wird es langsam hell, der Morgenwind biegt Bäume und Büsche. Ein Bewegungsmelder lässt zwei Lichter sanft aufglimmen.', en: 'From the entrance the view runs through the living room: outside it slowly gets light, the morning wind bends trees and bushes. A motion sensor lets two lights glow up softly.' },
  }),
  beat('05:41', [
    { type: 'light', target: { rooms: ['living'], fallback: 1 }, on: true, brightness: 14, kelvin: 2200, ramp: 2.5 },
    { type: 'light', target: { rooms: ['outdoor'] }, on: true, brightness: 35, kelvin: 2200, ramp: 2, stagger: .5 },
  ]),
  beat('06:02', [
    { type: 'light', target: { rooms: ['living', 'outdoor'] }, on: false, ramp: 2 },
  ]),
  beat('06:10', [
    { type: 'light', target: { rooms: ['bedroom'], fallback: 1 }, on: true, brightness: 85, kelvin: 4200, from: { brightness: 1, kelvin: 2000 }, ramp: 22 },
    { type: 'echo', rooms: ['bedroom'], playing: true, title: { de: 'Sanfte Weckmusik', en: 'Gentle wake-up music' } },
  ], {
    id: 'wake', icon: 'alarm',
    title: { de: 'Lichtwecker', en: 'Sunrise alarm' },
    text: { de: 'Das Schlafzimmerlicht simuliert einen Sonnenaufgang: in 20 Minuten von 1 % Glutrot zu hellem Neutralweiß.', en: 'The bedroom light simulates a sunrise: from 1 % ember red to bright neutral white in 20 minutes.' },
  }),
  beat('06:36', [
    { type: 'blind', rooms: ['bedroom'], position: 100, ramp: 5 },
    { type: 'blind', position: 100, ramp: 6, stagger: 1.5 },
  ], {
    id: 'sunrise', icon: 'sunrise',
    title: { de: 'Sonnenaufgang – Rollos fahren hoch', en: 'Sunrise – blinds go up' },
    text: { de: 'Sobald die Sonne über dem Horizont steht, öffnen die Rollos nacheinander. Der Nebel löst sich auf.', en: 'As soon as the sun clears the horizon the blinds open one after another. The fog lifts.' },
  }),
  beat('06:40', [
    { type: 'coffee', phase: 'on' },
    { type: 'light', target: { rooms: ['kitchen'], fallback: 1 }, on: true, brightness: 90, kelvin: 4000, ramp: 1 },
    { type: 'light', target: { rooms: ['hall'] }, on: true, brightness: 35, kelvin: 3000 },
    { type: 'echo', rooms: ['kitchen', 'living'], playing: true, title: { de: 'Morgen-Briefing: 12 °C, ab 15 Uhr Gewitter', en: 'Morning briefing: 12 °C, thunderstorms from 3 pm' } },
  ], {
    id: 'coffee', icon: 'coffee',
    title: { de: 'Kaffee ist fertig, bevor du es bist', en: 'Coffee is ready before you are' },
    text: { de: 'Die Kaffeemaschine heizt vor und bereitet einen Caffè Latte zu. Das Briefing warnt schon vor dem Nachmittag.', en: 'The coffee machine preheats and brews a caffè latte. The briefing already warns about the afternoon.' },
  }),
  beat('06:46', [{ type: 'coffee', phase: 'brew', minutes: 4 }, { type: 'popup', target: 'coffee', open: true }]),
  beat('06:53', [{ type: 'popup', target: 'coffee', open: false }]),
  beat('06:56', [{ type: 'light', target: { rooms: ['hall'] }, on: false }]),
  beat('07:00', [
    { type: 'light', target: { rooms: ['bath'], fallback: 1 }, on: true, brightness: 100, kelvin: DAYLIGHT },
    { type: 'fan', rooms: ['bath', 'bedroom'], on: true, percentage: 70 },
    { type: 'light', target: { rooms: ['bedroom'] }, on: false, stagger: 0.5 },
    { type: 'echo', rooms: ['bedroom'], playing: false },
  ], {
    id: 'bath', icon: 'droplets',
    title: { de: 'Bad & Lüftung', en: 'Bathroom & ventilation' },
    text: { de: 'Tageslichtweiß im Bad, der Lüfter läuft an. Das Schlafzimmer schaltet sich selbst aus.', en: 'Daylight white in the bathroom, the fan starts. The bedroom switches itself off.' },
  }),
  beat('07:04', [{ type: 'door', kind: 'window', open: true }]),
  beat('07:24', [{ type: 'door', kind: 'window', open: false }]),
  beat('07:25', [{ type: 'light', target: { rooms: ['bath'] }, on: false }]),
  beat('07:30', [
    { type: 'tv', mode: 'news' },
    { type: 'light', target: { rooms: ['dining'] }, on: true, brightness: 55, kelvin: 3000, ramp: 2 },
    { type: 'echo', rooms: ['kitchen', 'living'], playing: false },
  ], {
    id: 'breakfast', icon: 'tv',
    title: { de: 'Frühstück mit Nachrichten', en: 'Breakfast with the news' },
    text: { de: 'Vom Esstisch der Blick zum Fernseher: Die Nachrichten laufen, das Licht über dem Tisch ist gedimmt.', en: 'From the dining table the view goes to the TV: the news is on, the light above the table is dimmed.' },
  }),
  beat('07:40', [{ type: 'fan', on: false }]),
  beat('08:08', [{ type: 'lock', locked: false }]),
  beat('08:10', [{ type: 'door', kind: 'entrance', open: true }], {
    id: 'away', icon: 'door',
    title: { de: 'Alle aus dem Haus', en: 'Everyone has left' },
    text: { de: 'Haustür auf, Haustür zu, Schloss verriegelt: Abwesenheitsmodus. Alle Lichter, der Fernseher und die Kaffeemaschine gehen aus.', en: 'Front door open, front door shut, lock bolted: away mode. All lights, the TV and the coffee machine switch off.' },
  }),
  beat('08:15', [
    { type: 'door', kind: 'entrance', open: false },
    { type: 'light', target: { all: true }, on: false, stagger: 0.4 },
    { type: 'tv', mode: 'off' },
    { type: 'coffee', phase: 'off' },
    { type: 'echo', playing: false },
  ]),
  beat('08:19', [{ type: 'lock', locked: true }]),
  beat('09:00', [{ type: 'appliance', kind: 'washer', running: true }], {
    id: 'chores', icon: 'washer',
    title: { de: 'Waschtag', en: 'Laundry day' },
    text: { de: 'Niemand zu Hause: Die Waschmaschine startet nach Zeitplan und zeigt die Restzeit, danach übernimmt der Trockner darüber.', en: 'Nobody home: the washer starts on schedule and shows its remaining time, then the dryer above takes over.' },
  }),
  beat('10:30', [], {
    id: 'sunny', icon: 'sun',
    title: { de: 'Sonniger Vormittag', en: 'Sunny morning' },
    text: { de: 'Klarer Himmel. Die Schatten wandern mit der Sonne durch die Wohnung – berechnet aus Standort und Datum.', en: 'Clear skies. Shadows travel through the home with the sun – computed from location and date.' },
  }),
  beat('11:10', [
    { type: 'appliance', kind: 'washer', running: false },
    { type: 'appliance', kind: 'dryer', running: true },
  ]),
  beat('12:30', [
    { type: 'blind', position: 30, ramp: 4, stagger: 1 },
    { type: 'fan', rooms: ['bedroom', 'living', 'office'], on: true, percentage: 40 },
  ], {
    id: 'shade', icon: 'thermometer',
    title: { de: 'Hitzeschutz', en: 'Heat protection' },
    text: { de: 'Die Sonne steht im Süden, draußen 22 °C: Die Rollos fahren auf Beschattung, der Ventilator kühlt vor.', en: 'The sun is in the south, 22 °C outside: blinds move to shading, the fan pre-cools.' },
  }),
  beat('12:50', [{ type: 'appliance', kind: 'dryer', running: false }]),
  beat('14:15', [
    { type: 'blind', position: 100, ramp: 3, stagger: 0.5 },
    { type: 'fan', on: false },
  ], {
    id: 'warning', icon: 'alert',
    title: { de: 'Unwetterwarnung', en: 'Severe weather warning' },
    text: { de: 'Wolken türmen sich auf, aufs Handy kommt eine Unwetterwarnung. Die Rollos fahren zum Schutz ganz hoch, der Ventilator geht aus.', en: 'Clouds tower up and a severe weather warning reaches the phone. The blinds retract fully for protection, the fan switches off.' },
  }),
  beat('15:00', [
    { type: 'light', target: { rooms: ['living', 'office', 'kitchen', 'dining'], fallback: 3 }, on: true, brightness: 75, kelvin: NEUTRAL, ramp: 2, stagger: 0.3 },
  ], {
    id: 'storm', icon: 'storm',
    title: { de: 'Gewitter!', en: 'Thunderstorm!' },
    text: { de: 'Starkregen und Blitze. Der Helligkeitssensor fällt unter 50 lx – die Anwesenheitssimulation schaltet Licht ein, damit das Haus bewohnt wirkt.', en: 'Heavy rain and lightning. The light sensor drops below 50 lx – presence simulation turns lights on so the home looks lived in.' },
  }),
  beat('16:20', [
    { type: 'light', target: { all: true }, on: false, stagger: 0.3 },
  ], {
    id: 'clearing', icon: 'sun-cloud',
    title: { de: 'Die Sonne kommt zurück', en: 'The sun returns' },
    text: { de: 'Das Gewitter zieht ab, der Park glänzt nass. Mit dem Tageslicht gehen die Lampen wieder aus.', en: 'The storm moves on, the park glistens wet. With daylight back, the lamps switch off again.' },
  }),
  beat('17:29', [{ type: 'lock', locked: false }]),
  beat('17:30', [
    { type: 'door', kind: 'entrance', open: true },
    { type: 'echo', playing: true, title: { de: 'Willkommen zu Hause – Feierabend-Playlist', en: 'Welcome home – after-work playlist' } },
    { type: 'light', target: { rooms: LIVING, fallback: 2 }, on: true, brightness: 50, kelvin: 2900, ramp: 3 },
  ], {
    id: 'home', icon: 'home',
    title: { de: 'Feierabend', en: 'Home time' },
    text: { de: 'Die Haustür öffnet sich: Begrüßung, Musik und warmes Licht im Wohnbereich.', en: 'The front door opens: a greeting, music and warm light in the living area.' },
  }),
  beat('17:33', [{ type: 'door', kind: 'entrance', open: false }]),
  beat('18:45', [
    { type: 'light', target: { rooms: ['kitchen'], fallback: 1 }, on: true, brightness: 100, kelvin: 4000 },
    { type: 'light', target: { rooms: ['dining'] }, on: true, brightness: 70, kelvin: 2700, ramp: 2 },
    { type: 'fan', rooms: ['kitchen'], on: true, percentage: 60 },
  ], {
    id: 'cooking', icon: 'utensils',
    title: { de: 'Kochen', en: 'Cooking' },
    text: { de: 'Arbeitslicht in der Küche, gedimmtes Licht am Esstisch, die Lüftung läuft mit.', en: 'Task lighting in the kitchen, dimmed light at the dining table, ventilation on.' },
  }),
  beat('19:35', [{ type: 'fan', on: false }, { type: 'light', target: { rooms: ['kitchen'] }, on: true, brightness: 30, kelvin: WARM, ramp: 2 }]),
  beat('19:36', [
    { type: 'door', kind: 'window', open: true },
    { type: 'door', kind: 'balcony', open: true },
  ], {
    id: 'airing', icon: 'wind',
    title: { de: 'Lüften nach dem Kochen', en: 'Airing after cooking' },
    text: { de: 'Die Rollos sind noch oben: Fenstertüren und Balkontür öffnen zum Querlüften. Vor dem Sonnenuntergang ist alles wieder zu.', en: 'The blinds are still up: French windows and the balcony door open for a cross draught. Everything is closed again before sunset.' },
  }),
  beat('19:43', [
    { type: 'door', kind: 'window', open: false },
    { type: 'door', kind: 'balcony', open: false },
  ]),
  beat('19:45', [
    // Living and dining share one room in many homes: the popup closes all of its blinds.
    { type: 'control', kind: 'blinds', rooms: ['living', 'dining'], position: 0 },
    { type: 'blind', exclude: ['living', 'dining'], position: 0, ramp: 5, stagger: 1 },
    { type: 'light', target: { rooms: ['outdoor'] }, on: true, brightness: 60, kelvin: WARM, ramp: 3 },
    { type: 'light', target: { rooms: ['hall'] }, on: true, brightness: 30, kelvin: WARM },
  ], {
    id: 'sunset', icon: 'sunset',
    title: { de: 'Sonnenuntergang – Rollos zu', en: 'Sunset – blinds down' },
    text: { de: 'Ein Tipp aufs Rollo im Board, dann „Alle schließen“: Die Wohnzimmer-Rollos fahren gemeinsam herunter, die übrigen schließen automatisch. Balkon und Flur bekommen warmes Licht.', en: 'A tap on the blind in the board, then “close all”: the living-room blinds go down together, the others close automatically. Balcony and hallway get warm light.' },
  }),
  beat('19:53', [
    { type: 'control', kind: 'light', rooms: ['dining', 'living'], swatch: 'Violett', hue: 275, brightness: 45 },
  ], {
    id: 'board', icon: 'palette',
    title: { de: 'Das Board als Fernbedienung', en: 'The board as a remote' },
    text: { de: 'Lampe antippen, Farbe wählen, dimmen – direkt im 3D-Plan. Läuft auch flüssig auf einem aktuellen iPad als Wandpanel.', en: 'Tap a lamp, pick a colour, dim it – right in the 3D plan. Runs smoothly on a current iPad as a wall panel, too.' },
  }),
  beat('20:15', [
    { type: 'echo', playing: false },
    { type: 'light', target: { all: true, exclude: ['living', 'outdoor', 'hall'] }, on: false, stagger: 0.3 },
    { type: 'light', target: { rooms: ['living'] }, on: true, brightness: 12, kelvin: WARM, ramp: 3 },
    { type: 'colorloop', target: { rooms: ['living', 'dining'], color: true, fallback: 2 }, on: true, brightness: 50, hues: [236, 248, 258, 246], period: 30, saturation: 62, breathe: .22 },
    { type: 'tv', mode: 'movie', title: { de: 'Nordlicht – Reise ans Ende der Welt', en: 'Northern Light – Journey to the End of the World' } },
  ], {
    id: 'cinema', icon: 'film',
    title: { de: 'Kinoabend', en: 'Movie night' },
    text: { de: 'Licht gedimmt, die Farblampen tauchen den Raum in ruhiges, langsam atmendes Nachtblau wie ein Ambilight, der Fernseher zeigt den Film.', en: 'Lights dimmed, the colour lamps bathe the room in calm, slowly breathing night blue like an ambilight, the TV plays the film.' },
  }),
  beat('22:20', [
    { type: 'tv', mode: 'off' },
    { type: 'colorloop', target: { all: true }, on: false },
    { type: 'light', target: { rooms: ['living', 'dining'] }, on: false, stagger: 0.3 },
    { type: 'pc', on: true, screen: 'game' },
    { type: 'colorloop', target: { rooms: ['office'], color: true, fallback: 1 }, on: true, brightness: 55, hues: [205, 228, 250], period: 26, saturation: 70, breathe: .25 },
  ], {
    id: 'gaming', icon: 'gamepad',
    title: { de: 'Gaming-Session', en: 'Gaming session' },
    text: { de: 'Der Film ist aus, im Schlafzimmer startet der PC ein Spiel. Gehäuse und Lüfter leuchten im Regenbogen, die Lampen atmen langsam in kühlem Blau.', en: 'The movie ends, the PC in the bedroom launches a game. Case and fans glow in rainbow colours, the lamps breathe slowly in cool blue.' },
  }),
  beat('23:15', [
    { type: 'pc', on: false },
    { type: 'colorloop', target: { all: true }, on: false },
    { type: 'light', target: { all: true, exclude: ['bedroom'] }, on: false, stagger: 0.25 },
    { type: 'light', target: { rooms: ['bedroom'], fallback: 1 }, on: true, brightness: 20, kelvin: 2200, ramp: 2 },
    { type: 'lock', locked: true },
  ], {
    id: 'goodnight', icon: 'bed',
    title: { de: 'Gute-Nacht-Routine', en: 'Good night routine' },
    text: { de: 'Ein Tastendruck: alles aus, Haustür verriegelt, im Schlafzimmer glimmt noch Leselicht. Draußen beginnt es zu nieseln.', en: 'One button: everything off, front door locked, a reading light glows in the bedroom. Outside it starts to drizzle.' },
  }),
  beat('23:40', [{ type: 'light', target: { rooms: ['bedroom'] }, on: false, ramp: 3 }]),
  beat('02:30', [
    { type: 'light', target: { rooms: ['hall', 'bath'], fallback: 1 }, on: true, brightness: 6, kelvin: 2000, stagger: 0.5 },
  ], {
    id: 'nightlight', icon: 'footprints',
    title: { de: 'Nachtlicht', en: 'Night light' },
    text: { de: 'Ein Bewegungsmelder erkennt Schritte: Flur und Bad leuchten mit 6 % Glutrot – hell genug, aber nicht wach machend.', en: 'A motion sensor detects steps: hallway and bathroom glow at 6 % ember red – enough to see, not enough to wake up.' },
  }),
  beat('02:33', [{ type: 'light', target: { rooms: ['kitchen'] }, on: true, brightness: 10, kelvin: 2000 }]),
  beat('02:39', [{ type: 'light', target: { all: true }, on: false, stagger: 0.3 }]),
  beat('02:50', [], {
    id: 'snow', icon: 'snow',
    title: { de: 'Kälteeinbruch: Schneeschauer', en: 'Cold snap: snow shower' },
    text: { de: 'Die Temperatur fällt unter 0 °C, ein Schneeschauer zieht über den Park. Frostwarnung fürs Smartphone.', en: 'The temperature drops below 0 °C, a snow shower crosses the park. Frost warning for the phone.' },
  }),
  beat('04:45', [], {
    id: 'dawn', icon: 'sunrise',
    title: { de: 'Ein neuer Tag beginnt', en: 'A new day begins' },
    text: { de: 'Wieder Nebel, alles ruht. Gleich beginnt der Tag von vorn – Zeit für die Tagesbilanz.', en: 'Fog again, everything rests. The day is about to start over – time for the summary of the day.' },
  }),
].sort((a, b) => a.at - b.at);

export const CHAPTERS: { at: number; chapter: Chapter }[] = STORY.filter(b => b.chapter).map(b => ({ at: b.at, chapter: b.chapter! }));
export { END as STORY_END };

// --- Weather -----------------------------------------------------------------

export interface WeatherKey { clock: string; code: number; clouds: number; rain?: number; snow?: number; temp: number; wind: number; gusts: number; dir: number }

/** WMO codes (Open-Meteo): 0 clear, 1–3 clouds, 45 fog, 53 drizzle, 61 rain, 73 snow, 95 thunderstorm. */
export const WEATHER: WeatherKey[] = [
  { clock: '05:30', code: 2, clouds: 35, temp: 9, wind: 24, gusts: 44, dir: 250 },
  { clock: '06:50', code: 2, clouds: 40, temp: 10, wind: 20, gusts: 36, dir: 250 },
  { clock: '08:00', code: 1, clouds: 15, temp: 12, wind: 8, gusts: 15, dir: 240 },
  { clock: '10:30', code: 0, clouds: 4, temp: 18, wind: 10, gusts: 18, dir: 250 },
  { clock: '12:45', code: 1, clouds: 18, temp: 22, wind: 14, gusts: 24, dir: 250 },
  { clock: '13:50', code: 2, clouds: 55, temp: 21, wind: 22, gusts: 38, dir: 250 },
  { clock: '14:20', code: 3, clouds: 92, temp: 19, wind: 38, gusts: 58, dir: 260 },
  { clock: '15:00', code: 95, clouds: 100, rain: 9, temp: 15, wind: 48, gusts: 85, dir: 270 },
  { clock: '15:55', code: 61, clouds: 90, rain: 1.5, temp: 15, wind: 26, gusts: 44, dir: 270 },
  { clock: '16:20', code: 2, clouds: 45, temp: 16, wind: 18, gusts: 30, dir: 260 },
  { clock: '18:00', code: 1, clouds: 20, temp: 15, wind: 12, gusts: 20, dir: 250 },
  { clock: '20:30', code: 2, clouds: 45, temp: 12, wind: 8, gusts: 14, dir: 240 },
  { clock: '22:15', code: 3, clouds: 85, temp: 10, wind: 16, gusts: 26, dir: 230 },
  { clock: '23:10', code: 53, clouds: 90, rain: 0.8, temp: 8, wind: 20, gusts: 32, dir: 230 },
  { clock: '01:30', code: 3, clouds: 80, temp: 3, wind: 14, gusts: 24, dir: 300 },
  { clock: '02:50', code: 73, clouds: 96, snow: 1.4, temp: -1, wind: 26, gusts: 42, dir: 320 },
  { clock: '03:50', code: 3, clouds: 70, temp: 0, wind: 12, gusts: 20, dir: 310 },
  { clock: '04:45', code: 45, clouds: 60, temp: 2, wind: 5, gusts: 9, dir: 240 },
];

export interface DemoWeather {
  weather_code: number; cloud_cover: number; rain: number; snowfall: number; temperature_2m: number;
  wind_speed_10m: number; wind_gusts_10m: number; wind_direction_10m: number;
  /** Thunderstorm at full strength right now. */ thunder: boolean;
}

const WEATHER_KEYS = WEATHER.map(k => ({ ...k, at: clockToVirtual(k.clock) })).sort((a, b) => a.at - b.at);
/** Precipitation fades in and out over this many virtual minutes. */
const PRECIP_FADE = 12;

export function weatherAt(virtual: number): DemoWeather {
  const v = Math.max(0, Math.min(DAY_LENGTH, virtual));
  let i = WEATHER_KEYS.length - 1;
  while (i > 0 && WEATHER_KEYS[i].at > v) i--;
  const key = WEATHER_KEYS[i];
  const next = WEATHER_KEYS[i + 1] ?? { ...WEATHER_KEYS[0], at: DAY_LENGTH };
  const span = Math.max(1, next.at - key.at);
  const t = Math.max(0, Math.min(1, (v - key.at) / span));
  // Fade precipitation in after the key and out before the next one.
  const fade = Math.min(1, (v - key.at) / PRECIP_FADE, (next.at - v) / PRECIP_FADE);
  return {
    weather_code: key.code,
    cloud_cover: Math.round(key.clouds + (next.clouds - key.clouds) * t),
    rain: key.rain ? +(key.rain * Math.max(0.15, fade)).toFixed(2) : 0,
    snowfall: key.snow ? +(key.snow * Math.max(0.15, fade)).toFixed(2) : 0,
    temperature_2m: +(key.temp + (next.temp - key.temp) * t).toFixed(1),
    wind_speed_10m: Math.round(key.wind + (next.wind - key.wind) * t),
    wind_gusts_10m: Math.round(key.gusts + (next.gusts - key.gusts) * t),
    wind_direction_10m: Math.round(key.dir + (((next.dir - key.dir + 540) % 360) - 180) * t + 360) % 360,
    thunder: key.code >= 95 && fade > 0.3,
  };
}

// --- Pacing ------------------------------------------------------------------

/** Relative speed per part of the day: quiet hours pass faster than busy ones. */
const PACE: { clock: string; speed: number }[] = [
  // Opening shot: dawn through the living-room windows, then kitchen and coffee machine.
  { clock: '05:30', speed: 1.1 },
  { clock: '06:28', speed: 0.38 },
  // Let the coffee machine's popup show its progress.
  { clock: '06:45', speed: 0.2 },
  { clock: '06:54', speed: 0.9 },
  { clock: '07:30', speed: 0.35 },
  { clock: '07:53', speed: 0.9 },
  // Leaving: lock, door and lock again, slow enough to watch.
  { clock: '08:06', speed: 0.22 },
  { clock: '08:22', speed: 2 },
  { clock: '09:00', speed: 0.27 },
  { clock: '09:19', speed: 2 },
  { clock: '11:07', speed: 0.27 },
  { clock: '11:25', speed: 2 },
  { clock: '13:25', speed: 1.2 },
  { clock: '15:00', speed: .55 },
  { clock: '16:05', speed: 1.1 },
  { clock: '17:27', speed: 0.3 },
  { clock: '17:36', speed: 1.1 },
  { clock: '19:34', speed: 0.35 },
  // Board interactions run in real time: the clock nearly stands still meanwhile.
  { clock: '19:44', speed: 0.12 },
  { clock: '20:03', speed: 1.1 },
  { clock: '20:15', speed: 0.6 },
  { clock: '21:10', speed: 1.2 },
  { clock: '22:20', speed: 0.5 },
  { clock: '23:10', speed: 1.2 },
  { clock: '23:45', speed: 3 },
  { clock: '02:25', speed: 1.1 },
  { clock: '03:40', speed: 3 },
]
const PACE_KEYS = PACE.map(p => ({ at: clockToVirtual(p.clock), speed: p.speed })).sort((a, b) => a.at - b.at);
/** Normalised so a whole day takes DAY_REAL_SECONDS at 1×. */
const PACE_SCALE = (() => {
  let realUnits = 0;
  PACE_KEYS.forEach((p, i) => {
    const end = PACE_KEYS[i + 1]?.at ?? DAY_LENGTH;
    realUnits += (end - p.at) / p.speed;
  });
  return realUnits / DAY_REAL_SECONDS;
})();

/** Virtual minutes per real second at the given point of the day (1× speed). */
export function paceAt(virtual: number): number {
  let speed = PACE_KEYS[0].speed;
  for (const p of PACE_KEYS) if (p.at <= virtual) speed = p.speed;
  return speed * PACE_SCALE;
}

/** Real seconds from the start of the day until `virtual` at 1× (for the timeline). */
export function realSecondsUntil(virtual: number): number {
  let seconds = 0;
  PACE_KEYS.forEach((p, i) => {
    const end = Math.min(PACE_KEYS[i + 1]?.at ?? DAY_LENGTH, virtual);
    if (end > p.at) seconds += (end - p.at) / (p.speed * PACE_SCALE);
  });
  return seconds;
}

export function pick(text: Text, language: string): string {
  return language.startsWith('de') ? text.de : text.en;
}

// --- Camera shots ------------------------------------------------------------------

/**
 * First-person moments during the camera tour. Anchors are found in the model:
 * windows (looking out), the PC monitor, the TV, the coffee machine, the entrance
 * or the middle of a room (from its lamps).
 */
export type ShotAnchor =
  | { kind: 'window'; room?: RoomRole; near?: 'pc' | 'tv' | 'coffee' }
  | { kind: 'pc' }
  | { kind: 'tv' }
  | { kind: 'coffee' }
  | { kind: 'entrance' }
  | { kind: 'room'; room: RoomRole }
  | { kind: 'washer' }
  | { kind: 'dryer' }
  /** The PC case with its RGB lighting. */
  | { kind: 'pcCase' }
  /** The dining table (found by its mesh name). */
  | { kind: 'table' }
  /** A point on the way from `a` to `b` (share 0 = a, 1 = b). */
  | { kind: 'between'; a: ShotAnchor; b: ShotAnchor; share: number };

/** One moment of a shot: where the eye stands and what it looks at. Between keys the camera glides. */
export interface ShotKey {
  /** Position within the shot (0..1). */
  t: number;
  /**
   * Eye: `metres` from the anchor into the room, at eye height. `seeing`: walk further
   * in until that anchor is in clear view. `approach`: walk straight from the previous
   * key's position towards the anchor and stop `metres` in front of it.
   */
  eye: { at: ShotAnchor; metres: number; seeing?: ShotAnchor; approach?: boolean; /** Stand `metres` beyond the anchor, on its far side from this one (a seat at the table facing the TV). */ away?: ShotAnchor; /** May stand beside low furniture (bed, desk): only walls limit the distance. */ over?: boolean; /** Eye height in metres (1.6 standing, ~1.2 seated). */ height?: number };
  look: ShotAnchor;
  /** Turn the head this many degrees to the right of the look anchor (negative: left). */
  turn?: number;
  /** Aim this many metres below the look anchor (it then sits higher in the picture, above the overlay). */
  drop?: number;
  /** Jump here with a short dip to black instead of gliding (another room). */
  cut?: boolean;
}

export interface Shot {
  id: string; from: number; to: number; keys: ShotKey[];
  /** Raise the blind of the shot's window to this position while it runs (motion sensor at the window). */
  blind?: number;
}

const shot = (id: string, from: string, to: string, keys: ShotKey[], blind?: number): Shot => ({ id, from: clockToVirtual(from), to: clockToVirtual(to), keys, blind });

const LIVING_WINDOW: ShotAnchor = { kind: 'window', room: 'living' };
const ENTRANCE: ShotAnchor = { kind: 'entrance' };
const BEDROOM_WINDOW: ShotAnchor = { kind: 'window', room: 'bedroom', near: 'pc' };
const TOWARDS_TABLE: ShotAnchor = { kind: 'between', a: ENTRANCE, b: { kind: 'room', room: 'dining' }, share: .55 };

export const SHOTS: Shot[] = [
  shot('opening', '05:30', '06:45', [
    { t: 0, eye: { at: ENTRANCE, metres: .9, seeing: LIVING_WINDOW }, look: LIVING_WINDOW },
    { t: .6, eye: { at: ENTRANCE, metres: 3, seeing: LIVING_WINDOW }, look: LIVING_WINDOW },
    // Step towards the dining table, then pan along the counter to the knife block and utensils on the right.
    { t: .72, eye: { at: TOWARDS_TABLE, metres: 0 }, look: { kind: 'room', room: 'kitchen' } },
    { t: .84, eye: { at: TOWARDS_TABLE, metres: 0 }, look: { kind: 'room', room: 'kitchen' }, turn: 48 },
    { t: 1, eye: { at: { kind: 'coffee' }, metres: 1.3, approach: true }, look: { kind: 'coffee' } },
  ], 80),
  shot('breakfast-news', '07:31', '07:52', [
    // Seated at the dining table, looking across it to the TV.
    { t: 0, eye: { at: { kind: 'table' }, metres: .85, away: { kind: 'tv' }, height: 1.38 }, look: { kind: 'tv' }, drop: .15 },
    { t: 1, eye: { at: { kind: 'table' }, metres: .7, away: { kind: 'tv' }, height: 1.38 }, look: { kind: 'tv' }, drop: .1 },
  ]),
  shot('laundry', '09:01', '09:18', [
    { t: 0, eye: { at: { kind: 'washer' }, metres: 1.8 }, look: { kind: 'washer' } },
    { t: 1, eye: { at: { kind: 'washer' }, metres: 1.3 }, look: { kind: 'washer' } },
  ]),
  shot('dryer', '11:08', '11:24', [
    { t: 0, eye: { at: { kind: 'washer' }, metres: 1.4 }, look: { kind: 'washer' } },
    { t: .4, eye: { at: { kind: 'washer' }, metres: 1.4 }, look: { kind: 'washer' } },
    { t: 1, eye: { at: { kind: 'dryer' }, metres: 1.6 }, look: { kind: 'dryer' } },
  ]),
  shot('storm-bedroom', '15:04', '15:46', [
    // Further back in the room: the whole window with the rain, the glowing PC at the side.
    { t: 0, eye: { at: BEDROOM_WINDOW, metres: 3.2, over: true }, look: BEDROOM_WINDOW },
    { t: 1, eye: { at: BEDROOM_WINDOW, metres: 2.7, over: true }, look: BEDROOM_WINDOW },
  ]),
  shot('cinema', '20:22', '21:02', [
    { t: 0, eye: { at: { kind: 'tv' }, metres: 4.2 }, look: { kind: 'tv' } },
    { t: .5, eye: { at: { kind: 'tv' }, metres: 3.4 }, look: { kind: 'tv' } },
    { t: 1, eye: { at: { kind: 'window', near: 'tv' }, metres: 1.4 }, look: { kind: 'window', near: 'tv' } },
  ], 70),
  shot('gaming', '22:24', '22:58', [
    { t: 0, eye: { at: { kind: 'pc' }, metres: 1.6 }, look: { kind: 'pc' } },
    { t: .4, eye: { at: { kind: 'pc' }, metres: 1.4 }, look: { kind: 'pc' } },
    // Step back and look down at the desk: the PC case glows in rainbow colours. Hold there.
    { t: .72, eye: { at: { kind: 'pc' }, metres: 1.5, height: 2.1 }, look: { kind: 'pcCase' }, drop: .55 },
    { t: 1, eye: { at: { kind: 'pc' }, metres: 1.5, height: 2.1 }, look: { kind: 'pcCase' }, drop: .55 },
  ]),
];

export function shotAt(virtual: number): Shot | undefined {
  return SHOTS.find(s => virtual >= s.from && virtual < s.to);
}

// --- Orbit framing ------------------------------------------------------------------

/**
 * Where the orbit camera looks during each chapter: the room where something
 * happens, close up (zoom = share of the home view's distance), or the whole
 * site for weather. Tilt lowers the camera for a view towards the horizon.
 */
export interface Framing { at: ShotAnchor | 'overview'; zoom: number; tilt: number }

const room = (r: RoomRole, zoom = .42): Framing => ({ at: { kind: 'room', room: r }, zoom, tilt: -.05 });
const anchor = (at: ShotAnchor, zoom = .42): Framing => ({ at, zoom, tilt: -.05 });
const overview = (zoom: number, tilt: number): Framing => ({ at: 'overview', zoom, tilt });

export const CHAPTER_FRAMING: Record<string, Framing> = {
  night: anchor(ENTRANCE, .5), wake: room('bedroom', .4), sunrise: room('living', .55), coffee: anchor({ kind: 'coffee' }, .36),
  bath: room('bath', .32), breakfast: anchor({ kind: 'tv' }, .45), away: anchor(ENTRANCE, .4), chores: anchor({ kind: 'between', a: { kind: 'washer' }, b: { kind: 'room', room: 'living' }, share: .45 }, .55),
  sunny: overview(1.35, .16), shade: room('living', .6), warning: overview(1.3, .16), storm: overview(1.55, .2),
  clearing: overview(1.3, .14), home: anchor(ENTRANCE, .42), cooking: room('kitchen', .38), sunset: room('living', .6),
  airing: anchor(LIVING_WINDOW, .5), board: room('living', .5), cinema: anchor({ kind: 'tv' }, .42), gaming: anchor({ kind: 'pc' }, .4), goodnight: room('bedroom', .45),
  nightlight: room('hall', .4), snow: overview(1.55, .2), dawn: overview(1.2, .12),
};
