import type { FakeItem } from "@adventure-engine/learning-bridge/test-service";

/**
 * HOST SIDE ONLY — the test adapter's items, with their answer keys (D-307 Trin A).
 * The game bundle must never import this file; e2e/archive.spec.ts scans the built game bundle for it.
 *
 * Objective H4 of the occupation pilot (F0 12: "kan bruge en kilde til at begrunde en påstand").
 * The facts must be checked by a history teacher before any pupil sees them (F0 12, header).
 */
export const ARCHIVE_ITEMS: readonly FakeItem[] = [
  {
    id: "h4-proklamation",
    objectiveId: "hist.besaettelsen.h4",
    kind: "choice",
    prompt: "Hvilken kilde viser bedst, hvad regeringen ønskede, at befolkningen skulle gøre 9. april 1940?",
    options: [
      { id: "kilde_a", label: "Proklamationen fra kongen og regeringen, 9. april 1940" },
      { id: "kilde_b", label: "En erindring, som en tidligere skoleelev skrev i 1985" },
      { id: "kilde_c", label: "En tysk soldats dagbog fra april 1940" },
      { id: "kilde_d", label: "Et illegalt blad fra 1944" },
    ],
    answer: "kilde_a",
    correctLabel: "Proklamationen fra kongen og regeringen, 9. april 1940",
    feedbackCorrect: "Ja. Proklamationen er regeringens egen meddelelse fra selve dagen. Den opfordrede befolkningen til at bevare ro og orden.",
    feedbackIncorrect: "Ikke helt. Spørg om hver kilde: hvem skrev den, hvornår, og hvem var den skrevet til?",
    hints: [
      "Hvem bestemte, hvad befolkningen skulle gøre?",
      "Kig efter en kilde, der blev skrevet på selve dagen.",
      "Det er regeringens egen meddelelse til befolkningen.",
    ],
  },
  {
    id: "h4-dagbog",
    objectiveId: "hist.besaettelsen.h4",
    kind: "choice",
    prompt: "Hvilken kilde viser bedst, hvordan en almindelig dansker oplevede morgenen 9. april 1940?",
    options: [
      { id: "kilde_e", label: "En lærebog om besættelsen fra 2010" },
      { id: "kilde_f", label: "Den tyske ordre om at besætte Danmark" },
      { id: "kilde_g", label: "En dagbog, som en dansk kvinde skrev 9. april 1940" },
      { id: "kilde_h", label: "En avisartikel fra 1995 om 50-året for befrielsen" },
    ],
    answer: "kilde_g",
    correctLabel: "En dagbog, som en dansk kvinde skrev 9. april 1940",
    feedbackCorrect: "Ja. Dagbogen er skrevet af en, der selv oplevede dagen, mens den skete.",
    feedbackIncorrect: "Ikke helt. Hvilken kilde er skrevet af en almindelig dansker på selve dagen?",
    hints: ["Hvem oplevede morgenen selv?", "Kig efter en kilde fra 1940, skrevet af en dansker."],
  },
];
