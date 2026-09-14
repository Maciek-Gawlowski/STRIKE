# "Mistede" — hvordan skal den regnes? Beslutning til Claus

**Til:** Claus
**Fra:** Maciej
**Hvad jeg har brug for:** at du svarer **A, B eller C**. Resten klarer jeg.

---

## Hvorfor det haster lidt

Det er den sidste åbne ting i koden før alfaen. Alt andet er bygget. Og som det virker lige nu, tæller statistikken forkert — det skal testerne ikke opdage før os.

## Sådan virker det i dag

Der findes ingen "mistet"-hændelse i appen. Tallet regnes ud bagefter:

> **Mistede = Hug − Fangster** (kan ikke blive negativt)

Det giver to problemer:

**1. Samme fisk tælles to gange.** I søjlediagrammet stables Fangster + Hug + Følgere + Mistede oven på hinanden. Men en mistet fisk *er* et hug. En måned med 10 hug og 3 fangster vises som 10 + 3 + 7 = 20 hændelser — af 13 faktiske registreringer. Søjlen lyver om, hvor meget der er sket.

**2. Regnestykket knækker, når man fanger uden at trykke "Hug" først.** Og det gør man: når fisken sidder, trykker man "Fangst", ikke "Hug" og så "Fangst". Har du 2 hug og 4 fangster på en måned, bliver Mistede = 0 og Hug ser ud til at være lavere end antallet af fangster. Tallet bliver tilfældigt afhængigt af, hvor disciplineret den enkelte fisker trykker.

Kort sagt: "Mistede" måler i dag ikke mistede fisk. Den måler forskellen mellem to knapper, folk trykker på i vilkårlig rækkefølge.

---

## De tre muligheder

### A — Lad det være, som det er

Vi beholder udregningen og fjerner "Mistede" fra søjlediagrammet, så tallet kun står som felt øverst.

- **Arbejde:** en halv time.
- **Fordel:** ingen ændring for testerne, ingen risiko.
- **Ulempe:** tallet er stadig upålideligt. Første gang en tester siger "jeg mistede fire fisk i sidste uge, hvorfor står der nul?", har vi ikke noget svar.

### B — Ny knap "Mistet" på turen

En femte knap ved siden af Følger / Hug / Fangst / Foto. Man trykker, når fisken går af.

- **Arbejde:** 1–2 dage (ny hændelsestype, database-migrering, knap, kort, statistik, oversættelser).
- **Fordel:** ærlige data, og "mistet" bliver et selvstændigt signal på Aktivitetskortet.
- **Ulempe:** endnu en knap på en skærm, hvor der skal trykkes hurtigt med våde hænder. Fem knapper er mange, når det hele skal gå stærkt.

### C — Udfald på fangsten: **landet** eller **mistet** ⭐ min anbefaling

Ingen ny knap. Man trykker "Fangst" som nu, og på skærmen bagefter vælger man, om fisken blev **landet** eller **mistet**. Landet er valgt på forhånd, så den hurtige vej er præcis lige så hurtig som i dag.

Så bliver de tre tal adskilte og kan lægges sammen uden at overlappe:

| Felt | Hvad det er |
|---|---|
| **Følgere** | Fisk, der fulgte med, men ikke tog |
| **Hug** | Fisk, der huggede, men aldrig kom på krogen |
| **Mistede** | Fisk, der var på krogen og gik af |
| **Fangster** | Fisk, der kom i land |

- **Arbejde:** ca. en dag (én kolonne i databasen, et valg på fangstskærmen, statistikken skrevet om, oversættelser). Eksisterende fangster sættes til "landet".
- **Fordel:** matcher det, fiskere faktisk siger. Man registrerer fisken, uanset hvordan det endte — og vi får art og skøn over størrelsen med på de mistede også, hvilket er interessant data.
- **Ulempe:** ét ekstra valg på fangstskærmen. Og mistede fisk uden sikker artsbestemmelse ("noget stort") skal kunne registreres uden art.

---

## Hvad jeg foreslår

**C.** Den koster en dag, fjerner dobbelttællingen, og den er den eneste af de tre, hvor tallet betyder det, ordet siger. B giver det samme resultat, men koster en knap på den skærm, hvor der er mindst plads til den.

**Et spørgsmål mere, hvis du vælger C:** skal mistede fisk tælle med på Aktivitetskortet? Jeg mener ja — en fisk på krogen er det stærkeste tegn på, at der er fisk i området. Men sig til, hvis du hellere vil have, at kortet kun viser landede fisk.

**Svar med ét bogstav, så bygger jeg det.** Vælger du A, kan det ligge i næste build. B og C skal med i et build før testerne får adgang, ellers står deres tidlige ture med data, vi skal migrere bagefter.
