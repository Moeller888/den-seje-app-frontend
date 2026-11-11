/**
 * Introduction content (D-310): DOM-free, so the headless tests can check it.
 *
 * KONSTRUERET UNDERVISNINGSMATERIALE: written for this prototype; a history teacher must check every
 * statement before any pupil sees it (D-310 §Lærergennemgang).
 */
export interface IntroCard {
  readonly title: string;
  readonly text: string;
}

export const INTRO_CARDS: readonly IntroCard[] = [
  {
    title: "Morgenen den 9. april 1940",
    text: "Tidligt om morgenen den 9. april 1940 gik tyske soldater over grænsen og gik i land i danske byer. Danmark kunne ikke stå imod en så stor hær. Efter få timer besluttede kongen og regeringen at stoppe kampene. Danmark var besat. Regeringen ville undgå, at flere blev dræbt, og prøvede at bevare så meget dansk selvstyre som muligt.",
  },
  {
    title: "Sådan spørger man en kilde",
    text: "En kilde er et spor fra fortiden: et brev, en avis, en dagbog. Før du bruger en kilde, stiller du fire spørgsmål. Hvem har lavet den? Hvornår? Til hvem? Og hvorfor? Svarene viser, hvad kilden kan fortælle om, og hvad den måske ikke fortæller. En kilde fra selve dagen kan noget andet end én, der er skrevet mange år senere. Den bedste kilde afhænger af, hvad du vil undersøge.",
  },
  {
    title: "Kontekst: hvad kan kilden bruges til?",
    text: "Kontekst er situationen omkring kilden: hvad skete der, da den blev lavet? En dagbog fra 9. april 1940 kan vise, hvordan én person oplevede dagen. Den kan ikke vise, hvad alle danskere følte, eller hvad regeringen ville. Spørg derfor altid: Hvad kan kilden bruges som belæg for — og hvad kan den ikke?",
  },
];

export const INTRO_CHECK = {
  question: "Du vil vide, hvad en tysk general planlagde i april 1940. Hvilken kilde vil du se på først?",
  options: ["En ordre, som generalen selv skrev i april 1940", "En dansk skolebog fra 2010 om besættelsen"],
  // Shown after ANY choice: an explanation, not a verdict.
  explanation: "Generalens egen ordre er lavet af ham, mens det skete. Skolebogen er skrevet 70 år senere af andre: den fortæller om fortiden, men den er ikke et spor fra 1940.",
} as const;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}
