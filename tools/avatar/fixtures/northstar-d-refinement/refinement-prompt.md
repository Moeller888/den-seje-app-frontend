# D refinement — masterprompt (UDKAST · IKKE AUTORISERET · IKKE SENDT)

**Status:** forberedt, **ikke afsendt**. Der findes ingen ejerbeslutning, der autoriserer dette kald.
D-120 autoriserede præcis ét kald, og det er brugt. Dette er en **ny og separat** request, der kræver
sin egen registerpost.

**Hvad dette er:** en **redigering af den eksisterende kandidat**, ikke en ny karakter fra bunden.
Identiteten er allerede fundet og skal bevares; kun kropsproportionerne ændres.

---

## 0 · De fire referencebilleder, i bindende rækkefølge

| # | Fil | Rolle |
| --- | --- | --- |
| **Image 1** | `northstar-d-candidate/candidate.raw.png` | **Den primære reference.** Identitet, ansigt, hår, farver, stregføring, stil. Alt visuelt skal bevares herfra. |
| **Image 2** | `d-control-set/geometry-reference/geometry-plate-bald-nude.png` | Kranie- og kropsvolumen. Kraniet her er den geometriske reference for hovedets størrelse. |
| **Image 3** | `d-control-set/geometry-reference/geometry-silhouette.png` | Ydergrænse: arm–torso-luft, benafstand, fodbredde. |
| **Image 4** | `d-control-set/geometry-reference/geometry-reference-transparent.png` | Led-, krops- og beklædningsankre. |

Den tidligere separate hoved-/stilreference er **udeladt**: kandidaten selv er nu den stærkeste
reference for præcis denne identitet og illustration.

---

## 1 · Det målbare problem

Alle tal er andele af den **målbare** krop, hals → sål. Det gør dem uafhængige af både placering
og skala, og derfor er det dem en refinement faktisk kan rette. Kraniekronen er skjult under håret
og indgår **ikke** som anker.

| Segment | Kandidat nu | D's mål | Retning |
| --- | ---: | ---: | --- |
| Hals → T-shirtkant | 41,04 % | 34,13 % | **forkortes** |
| T-shirtkant → skridt | 10,26 % | 12,84 % | **forstørres** |
| Skridt → ankel | 35,82 % | 40,53 % | **forlænges** |
| Ankel → sål | 12,87 % | 12,50 % | omtrent uændret |

Skulderbredden er normaliseret **kun ca. 2,2 % under** D. Den skal følge geometripladen og må
**ikke** gøres markant bredere.

---

## 2 · Prompten (kopiér ordret)

```
Edit the boy in Image 1. This is a proportion correction of an existing character, NOT a new
character. Keep the same child; change only how his body is proportioned.

THE FOUR ATTACHED IMAGES:
- Image 1 is the boy to edit. Everything about how he looks comes from here.
- Image 2 is a bald, plain body-volume plate. Use it ONLY as the geometric reference for how large
  the head and cranium should be relative to the body.
- Image 3 is a plain silhouette. Use it ONLY as the reference for the outer boundary: how much
  background gap there is between each arm and the torso, how far apart the legs are, and how wide
  the feet sit.
- Image 4 is a construction figure. Use it ONLY as the reference for where the joints and the
  garment edges sit along the body.
Images 2, 3 and 4 are diagrams. Do NOT copy their flat colours, their blank faces or their drawing
style — every visual quality comes from Image 1.

KEEP FROM IMAGE 1 — as closely as you can:
- the same boy, unmistakably the same character
- the same face and the same face shape
- the same large warm brown eyes, with the same highlights
- the same small closed-mouth smile and the same expression
- the same warm tan skin tone
- the same dark brown tousled hair, the same hair design and the same strands
- the same drawing style, the same line weight and line quality, the same flat colouring,
  the same shading and the same level of detail
- the same plain solid grey short-sleeve t-shirt
- the same blue jeans
- the same light grey sneakers
- the same front-facing neutral standing pose
- the same symmetrical posture, arms hanging down along the sides
- the same clearly visible gap of background between each arm and the torso

CHANGE ONLY THE BODY PROPORTIONS:
- Shorten the upper body: the distance from the neck to the bottom hem of the t-shirt must become
  a clearly smaller share of the body than it is now.
- Raise the t-shirt hem noticeably higher up the body.
- Make the distance from the t-shirt hem down to the crotch a proportionally larger share than
  it is now.
- Lengthen the legs: the distance from the crotch down to the ankle must become a proportionally
  larger share than it is now.
- Keep the ankle-to-sole proportion roughly as it already is.
- Let the shoulders follow the width shown in Image 2. Do NOT make the shoulders dramatically
  wider — they are already close to correct.
- Follow the joint, body and garment anchors shown in Image 4.
- Use the cranium in Image 2 as the geometric reference for how large the head should be.
- The hair may rise naturally above the top of the cranium, as it already does. Do NOT flatten the
  hair, and do NOT try to line the tips of the hair up with any measurement line.
- Place the whole figure so there is comfortable empty space above the hair and below the shoes.
  The figure must not touch or run off any edge.
- The body should read as roughly 4.6 heads tall.

ABSOLUTELY NOT:
- no green clothing of any kind, no star, no logo, no text, no lettering, no numbers, no pattern
- no wristbands, no cuffs, no bracelets, no cargo pocket, no side pockets, no zips
- no props, no held objects, no accessories
- no background, no floor, no scenery, no gradient, no vignette, no glow, no drop shadow,
  no cast shadow, no contact shadow

OUTPUT:
- one single figure, centred, front-facing
- 1024 x 1536, portrait
- fully transparent background
- no cropping: the whole figure from the top of the hair to the bottom of the soles is inside
  the frame
```

---

## 3 · Hvad prompten bevidst IKKE påstår

Den beder **ikke** om pixelperfekte koordinater. En generativ model kan ikke garantere, at
T-shirtkanten lander på en bestemt y-værdi, og prompten formulerer derfor målet som **relative
andele og retninger** — kortere her, længere der — hvilket er det, en model faktisk kan følge.

Den beder heller **ikke** modellen om at matche hårets top med kraniekronen. Det var netop den
fejlslutning, der gjorde den første audits skalafaktor ugyldig: kraniekronen er ikke synlig.

## 4 · Efterkontrol af et kommende resultat (ikke udført)

Samme translationsuafhængige måling som i afsnit 1, plus: dimensioner og 2:3, ægte alfa uden halo,
arm–torso-luft på begge sider, benafstand, begge fødder synlige, øjnene fri af håret, ingen tekst,
logo, mønster eller skygge — og at det stadig er den samme dreng.
