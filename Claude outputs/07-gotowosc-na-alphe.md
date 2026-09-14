# STRIKE — gotowość na alphę

Stan na 13 września 2026, po przeglądzie kodu w repo (build 24).
Podział wg właściciela: to, co możesz odhaczyć sam, i to, co wisi na Clausie.

---

## 1. Blokery kodowe — muszą wejść przed buildem dla testerów

| # | Rzecz | Stan |
|---|---|---|
| 1 | Fałszywe pozycje (demo-punkt / brak fixa) nie mogą trafiać na Activity Mapę | **naprawione** — flaga `hasGpsFix` w store, upload tylko przy realnym fiksie |
| 2 | Mock tracking w produkcji | **naprawione** — za `__DEV__` + alert po duńsku przy odmowie uprawnienia |
| 3 | Demo-tripy seedowane na świeżej instalacji | **naprawione** — seed i `trips: demoTrips` za `__DEV__` |
| 4 | Dokładne koordynaty wysyłane do Open-Meteo | **naprawione** — obcięte do 3 miejsc (~110 m) |
| 5 | `resyncBiteMapEvent` wrzucał eventy typu `photo` (niespójne z `addEvent`) | **naprawione** |
| 6 | `npm run typecheck` po moich zmianach | **do zrobienia u Ciebie** — nie mam tu node_modules |
| 7 | `git add -A && git commit` przed `eas build` | **do zrobienia** — to jest ten błąd, który zjadł buildy 12, 15 i 17 |

## 2. Decyzje, które muszą zapaść przed buildem, a nie po

| # | Rzecz | Kto decyduje |
|---|---|---|
| 8 | Logika „Mistede" — A, B czy C (notatka `03`) | Claus. Jeśli B albo C, musi wejść **przed** pierwszymi tripami testerów, inaczej migrujesz ich dane wstecz |
| 9 | Tracking w tle. Dziś tylko foreground — telefon w kieszeni = dziury w trasie | Ty. Nowa zależność (expo-task-manager), `UIBackgroundModes`, uzasadnienie dla Apple. Ocena: 1 dzień + ryzyko review |
| 10 | Cennik: darmowy rdzeń czy nie (notatka `04`) | Claus. Nie blokuje kodu, blokuje materiały na wieczór w sklepie |

## 3. Backend — sprawdzić przed wpuszczeniem 20 osób

| # | Rzecz | Dlaczego |
|---|---|---|
| 11 | **Polityki RLS na `bite_map_events`** | Aplikacja działa na kluczu anon wbitym w IPA. Jeśli anon ma DELETE bez ograniczeń, każdy, kto wyciągnie klucz, może wyczyścić całą tabelę — czyli jedyne aktywo, jakie STRIKE ma. Sprawdź, czy DELETE jest zawężone, a najlepiej zamień je na RPC |
| 12 | **Próg 3 obserwacji jest tylko po stronie klienta** | `getBiteMapData` pobiera surowe wiersze i agreguje w aplikacji. Kto ma klucz anon, pobierze wszystkie obserwacje z datą, godziną i heksem — próg go nie dotyczy. Docelowo: widok/RPC agregujący po stronie Postgresa i odebranie SELECT-a na surowej tabeli |
| 13 | Typy `BiteMapEventRow` / `Insert` w `supabase.ts` są nieaktualne (`zone_id`, `lat`, `lng`) | Rzutowania `as any` w `biteMap.ts` to maskują. Kosmetyka, ale to właśnie takie rzeczy gryzą przy następnej zmianie schematu |
| 14 | Supabase free tier auto-pauzuje przy ciszy | Świadomie odpuszczone. Ale jeśli spauzuje w tygodniu startu testów, dla testera wygląda to jak zepsuta appka. Ustaw sobie przypomnienie, żeby sprawdzić projekt na dzień przed wieczorem w sklepie |

## 4. Po stronie Clausa (niekodowe)

| # | Rzecz | Stan |
|---|---|---|
| 15 | Lista ~20 testerów: imię + e-mail Apple ID | czeka na wieczór w sklepie, połowa września / początek października |
| 16 | Polityka prywatności na stronie | **tekst gotowy** (`01` DA, `02` EN) — Claus uzupełnia dane firmy i publikuje pod stałym URL-em |
| 17 | Ten URL wklejony w App Store Connect → App Privacy | bez tego Apple nie puści External Testing |
| 18 | strikeangler.com to dziś pusta strona Elementora („Elementor #8") | recenzent Apple na nią wejdzie. Musi wyglądać jak strona produktu, nie szkielet |
| 19 | EU trader status (DSA) | zrobione |
| 20 | Apple Small Business Program (15 % zamiast 30 %) | trzeba złożyć wniosek — nie działa automatycznie. Zrób to zawczasu, nie w tygodniu włączania płatności |

## 5. App Store Connect — do wypełnienia przy External Testing

- Opis „What to Test" po duńsku (testerzy to duńscy wędkarze, nie deweloperzy)
- Dane kontaktowe do beta review
- Ankieta App Privacy — musi zgadzać się co do słowa z tym, co napisałem w `01`/`02`: lokalizacja *nie* jest powiązana z tożsamością, brak trackingu, brak identyfikatora reklamowego. Feedback ma `local_user_id`, więc zadeklaruj „Identifiers – Device ID", powiązane z aplikacją, nie z osobą
- Eksport/szyfrowanie: `ITSAppUsesNonExemptEncryption: false` już jest w `app.json` ✓

---

## 6. Skrypt testowy na urządzeniu — build 25

Na czystej instalacji (usuń appkę przed testem, inaczej nie sprawdzisz świeżego startu).

**A. Pierwsze uruchomienie**
1. Zainstaluj, otwórz. → Logbook **pusty**, statystyki na zerach, zero demo-tripów.
2. Zacznij trip i **odmów** uprawnienia lokalizacji. → Alert po duńsku z „Åbn Indstillinger". Trasa się nie rysuje, nic się nie wymyśla.
3. Zarejestruj hug przy odmówionym uprawnieniu. Sprawdź w Supabase, że **nie przybył żaden wiersz**.
4. Odinstaluj, zainstaluj ponownie, tym razem zgódź się na lokalizację.

**B. Trip z prawdziwym GPS-em**
5. Start tripu → sprawdź, czy pierwszy punkt trasy jest tam, gdzie stoisz, a nie na Stevns.
6. Nazwa tripu: nie powinna sugerować miejsca z demo-punktu.
7. Hug, Następnie fangst ze zdjęciem, potem foto tripowe. → W Supabase: wiersz dla huga i fangstu, **żadnego dla foto**.
8. Zablokuj ekran na 5 minut, idź kawałek, odblokuj. → Sprawdź dziurę w trasie. To jest dowód na punkt 9 z sekcji 2 — zrób screenshota, bo to argument w rozmowie o trackingu w tle.
9. Stop tripu → logbook, przegląd tripu, timeline z pogodą i temperaturą wody.

**C. Activity Mapa**
10. Otwórz mapę. → Przy jednej obserwacji w heksie **nic nie ma się świecić** (próg 3).
11. Zarejestruj trzy obserwacje w tym samym rejonie → heks pojawia się po odświeżeniu zakładki.
12. Filtry: gatunek, typ hendelse, okno czasowe 24h/48h/7d/custom.
13. Usuń trip → wiersze znikają z `bite_map_events`. Powtórz w trybie samolotowym i sprawdź, czy kolejka usunięć dogania po powrocie sieci.

**D. Regresje z buildów 20–24**
14. Sharing: wygeneruj kartę tripu i udostępnij → to jest ten crash, który wracał przez tygodnie. Sprawdź na **buildzie release**, nie w Expo Go.
15. Zapis zdjęcia do biblioteki przy sharingu (uprawnienie `NSPhotoLibraryAdd`).
16. Zdjęcie profilowe z aparatu.
17. Przełącz język DA ↔ EN i przejdź wszystkie zakładki → żadnych surowych kluczy typu `trip.locationDeniedTitle`.
18. Tab bar na małym i dużym telefonie → nic nie ucięte.
19. Auto-stop tripu po 12 h: cofnij zegar systemowy albo zostaw trip na noc.
20. Ikonka appki na ekranie głównym i w App Switcherze.

**E. Odporność**
21. Tryb samolotowy przez cały trip → zero crashy, pogoda dociąga się później.
22. Ubij appkę w trakcie tripu i otwórz ponownie → crash recovery odtwarza trip.
23. Wyślij feedback offline → kolejkuje się i wychodzi po powrocie sieci.

---

## 7. Realistyczna kolejność

1. `npm run typecheck` + build 25 z moimi poprawkami → przejdź skrypt z sekcji 6
2. Wyślij Clausowi notatki `03` (Mistede) i `04` (cennik) — obie wymagają jego odpowiedzi i obie są na ścieżce krytycznej
3. Wyślij Clausowi politykę prywatności `01` do uzupełnienia i publikacji
4. Decyzja o trackingu w tle — jeśli tak, to teraz, nie po pierwszych skargach testerów
5. Sprawdź RLS w Supabase
6. Dopiero potem External Testing w App Store Connect

Wąskie gardło nie jest po Twojej stronie i nie będzie, ale punkty 8, 9 i 11 potrafią przesunąć start o tydzień, jeśli wyjdą dopiero wtedy, gdy testerzy już czekają.
