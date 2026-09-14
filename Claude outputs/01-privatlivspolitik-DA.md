# Privatlivspolitik for STRIKE

**Senest opdateret:** [DATO — sæt dagen teksten lægges på siden]
**Gælder for:** STRIKE-appen til iOS (inkl. test via Apple TestFlight) og strikeangler.com

> **Til Claus / webansvarlig:** Alt i `[kantede parenteser]` skal udfyldes, før teksten går online.
> Teksten skal ligge på en fast, offentligt tilgængelig URL — fx `https://strikeangler.com/privatlivspolitik`
> — og den URL skal ind i App Store Connect under App Privacy → Privacy Policy URL.
> Uden en URL, der virker, godkender Apple ikke ekstern TestFlight-test.
>
> Indholdet nedenfor er gennemgået mod appens faktiske kode (build 24), ikke skrevet efter hukommelsen.
> Ændrer I, hvad appen sender, skal teksten rettes samme dag.

---

## 1. Kort fortalt

- Dine ture, fangster, billeder og præcise positioner **bliver på din telefon**. Vi har ingen kopi og kan ikke se dem.
- Det eneste, der sendes til vores server, er **anonyme observationer bundet til et felt på ca. 900 meter** — ikke dit fiskested, og uden nogen form for bruger-id.
- Et felt vises **først** på Aktivitetskortet, når der ligger **mindst 3 observationer** i det. Ét enkelt hug fra én person bliver aldrig synligt for andre.
- Sletter du en tur, **fjernes dens observationer også fra serveren**.
- Appen kræver **ingen konto og ingen adgangskode**.
- Vi sælger ikke data, og appen indeholder hverken reklamer eller sporingsnetværk (ingen Google Analytics, ingen Facebook-SDK, ingen reklame-id).

---

## 2. Dataansvarlig

**[Virksomhedsnavn / Claus Lange]**
[Adresse]
[Postnr. og by], Danmark
CVR: [CVR-nr. — slet linjen, hvis der endnu ikke er et selskab]
E-mail: [kontakt@strikeangler.com]

Spørgsmål om dine data eller dine rettigheder sendes til ovenstående e-mail. Vi svarer inden for **30 dage**.

---

## 3. Hvilke oplysninger behandler vi?

### 3.1 Data, der kun ligger på din telefon

Appen er bygget "offline first". Alt nedenstående gemmes i en database **på selve enheden** og sendes ikke til os:

| Data | Eksempel |
|---|---|
| Ture | Titel, start- og sluttidspunkt, varighed, distance |
| Rute | De GPS-punkter, der tegner din rute under turen |
| Hændelser | Følger, kontakt/hug, fangst, agteskift, foto — med tidspunkt og præcis position |
| Fangstdetaljer | Art, længde, vægt, om fisken blev hjemtaget, kommentar, agn |
| Billeder | Fotos taget eller valgt i appen |
| Profil | Navn, profilbillede, fiskemetoder, arter, grej, egne pladser |
| Vejr- og vanddata | Lufttemperatur, vind, lufttryk, vandtemperatur og vandstand knyttet til hændelser |

Afinstallerer du appen, forsvinder disse data med den. Vi kan ikke gendanne dem.

### 3.2 Data, der sendes til vores server (Aktivitetskortet)

For at kunne vise et fælles aktivitetskort sender appen en **stærkt reduceret** udgave af hver observation. Konkret sendes præcis disse felter og intet andet:

| Felt | Hvad det indeholder |
|---|---|
| Felt-id | Et sekskantet felt med en radius på ca. **461 meter** (ca. 900 m på tværs). Positionen gøres grovkornet **på telefonen**, før noget sendes — dine koordinater forlader aldrig enheden |
| Hændelsestype | Følger / kontakt / fangst |
| Art | Kun ved fangster, fx havørred |
| Tidspunkt | Dato og klokketime (ikke minut og sekund) |
| Vindretning | Som kompasretning, fx "NV" — ikke grader |
| Vandtemperatur | I grader |
| Teknisk id | Et tilfældigt id pr. hændelse, så observationen kan fjernes igen, hvis du sletter turen. Det er ikke knyttet til dig, din telefon eller dine øvrige observationer |

Der sendes **ikke**: navn, e-mail, bruger-id, enheds-id, billeder, længde, vægt, kommentarer, agn, din rute, dine gemte pladser eller dine fotohændelser.

**Tærskel før visning:** et felt skal indeholde mindst **3 observationer**, før der overhovedet tegnes aktivitet på kortet, og mindst **4**, før det kan optræde som nummereret hotspot. Formålet er, at ingen kan udlede, hvor en enkelt fisker har stået.

### 3.3 Feedback i appen

Sender du feedback fra appen, gemmer vi: din besked, appversion, buildnummer, platform, telefonmodel og et **lokalt genereret id**, som gør det muligt at se, at flere beskeder kommer fra samme installation. Id'et er tilfældigt og indeholder ikke navn, e-mail eller Apple-id.

### 3.4 Vejrdata fra tredjepart

Appen henter vejr og vandtemperatur hos **Open-Meteo** (open-meteo.com, tysk udbyder, servere i EU, ingen konto og ingen API-nøgle). Positionen afkortes til **3 decimaler (ca. 110 meter)**, før forespørgslen sendes, og der følger hverken navn, id eller anden oplysning med. Open-Meteo kan altså se, at *nogen* spørger om vejret i et område — ikke hvem, og ikke det præcise punkt.

Vandstand hentes hos **DMI** (opendataapi.dmi.dk) fra en **fast målestation (Fynshav Havn)**. Her sendes ingen oplysninger om dig overhovedet.

### 3.5 Data, Apple behandler under TestFlight

Deltager du i testen, bruger Apple din **e-mailadresse og dit Apple-id** til at give dig adgang. Apple giver os desuden **nedbrudsrapporter og overordnet brugsstatistik** i aggregeret form. Apple er selvstændig dataansvarlig for det, og Apples egen privatlivspolitik gælder: https://www.apple.com/legal/privacy/

---

## 4. Formål og retsgrundlag

| Formål | Data | Retsgrundlag (GDPR) |
|---|---|---|
| At levere appens kernefunktioner (logbog, ruter, statistik) | Lokale data på enheden | Opfyldelse af aftalen, art. 6(1)(b) |
| At vise et fælles aktivitetskort | Anonymiserede observationer på feltniveau | Legitim interesse, art. 6(1)(f) — data er aggregeret og kan ikke føres tilbage til en person |
| At forbedre appen og rette fejl | Feedback, nedbrudsrapporter | Legitim interesse, art. 6(1)(f) |
| At administrere testprogrammet | Navn, e-mail | Aftale/samtykke, art. 6(1)(a)-(b) |

Adgang til **position, kamera og fotobibliotek** kræver, at du selv giver tilladelse i iOS. Du kan altid trække tilladelsen tilbage under Indstillinger → STRIKE. Uden positionsadgang kan appen ikke tegne ruten eller placere dine fangster.

---

## 5. Hvor længe gemmes data?

| Data | Opbevaring |
|---|---|
| Lokale data på telefonen | Indtil du sletter dem i appen eller afinstallerer appen |
| Observationer på serveren | [ANGIV: fx "indtil du sletter den tilhørende tur" eller en fast periode, fx 24 måneder] |
| Feedback | Op til 24 måneder |
| Testerliste (navn, e-mail) | Indtil testprogrammet afsluttes, eller du beder om at blive slettet |

---

## 6. Databehandlere og modtagere

| Leverandør | Rolle | Placering |
|---|---|---|
| Supabase | Database for Aktivitetskortet og feedback | EU [BEKRÆFT region — fx Frankfurt] |
| Apple (App Store / TestFlight) | Distribution, nedbrudsrapporter | EU/USA, Apples standardvilkår |
| Open-Meteo | Vejr og vandtemperatur | EU (Tyskland) |
| DMI | Vandstand fra fast målestation | Danmark |
| [Webhotel for strikeangler.com] | Hosting af hjemmesiden | [Placering] |

Vi videresælger ikke data og deler dem ikke med annoncører.

**Overførsel uden for EU/EØS:** databasen ligger i EU. I det omfang en leverandør (fx Apple) behandler data uden for EU/EØS, sker det på grundlag af EU-Kommissionens standardkontraktbestemmelser.

---

## 7. Dine rettigheder

Du har ret til **indsigt**, **berigtigelse**, **sletning**, **begrænsning**, **indsigelse** og **dataportabilitet**, og til at **trække et samtykke tilbage**.

I praksis: dine fangstdata ligger på din telefon, så du sletter dem selv i appen. Sletter du en tur, fjernes dens observationer samtidig fra Aktivitetskortet — også hvis du er offline, idet sletningen sendes, så snart du får forbindelse igen. Vil du slettes af testerlisten eller vide, hvad vi har liggende, så skriv til [kontakt@strikeangler.com].

Er du utilfreds med vores behandling, kan du klage til **Datatilsynet**, Carl Jacobsens Vej 35, 2500 Valby, dt@datatilsynet.dk, www.datatilsynet.dk.

---

## 8. Sikkerhed

Alt sendes krypteret (HTTPS/TLS). Adgang til databasen er begrænset til appens udviklere. Appen kræver ingen konto, og vi opbevarer derfor ingen adgangskoder.

## 9. Børn

STRIKE er ikke rettet mod børn under 13 år, og vi indsamler ikke bevidst oplysninger om dem.

## 10. Ændringer

Vi kan opdatere denne politik, når appen får nye funktioner. Væsentlige ændringer varsles i appen eller pr. e-mail til testere. Datoen øverst viser den gældende version.

## 11. Cookies på strikeangler.com

[Udfyld, når siden er færdig. Bruger siden kun tekniske cookies, skrives det her. Bruger den Google Analytics, indlejret video, Meta-pixel eller lignende, kræves et cookiebanner med forudgående samtykke — det er et selvstændigt krav, som denne tekst ikke dækker.]

---

## 12. Kontakt

**[Virksomhedsnavn / Claus Lange]**
E-mail: [kontakt@strikeangler.com]
[Adresse]

---

*Udkast, ikke juridisk rådgivning. Læs teksten igennem, før den offentliggøres, og få den vurderet af en jurist, inden STRIKE begynder at tage betaling.*
