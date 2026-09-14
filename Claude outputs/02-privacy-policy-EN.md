# Privacy Policy for STRIKE

**Last updated:** [DATE — the day this goes live]
**Applies to:** the STRIKE iOS app (including testing via Apple TestFlight) and strikeangler.com

> **Note for Claus / whoever publishes this:** everything in `[square brackets]` must be filled in first.
> The text needs a permanent public URL (e.g. `https://strikeangler.com/privacy`), and that URL goes into
> App Store Connect under App Privacy → Privacy Policy URL. External TestFlight testing is not approved without one.
>
> The content below was checked against the app's actual code (build 24). If what the app sends changes, this text changes the same day.

---

## 1. In short

- Your trips, catches, photos and exact positions **stay on your phone**. We hold no copy and cannot see them.
- The only thing sent to our server is **anonymous observations tied to a grid cell roughly 900 m across** — not your fishing spot, and with no user identifier of any kind.
- A cell only appears on the Activity Map once it holds **at least 3 observations**. A single bite from a single person is never visible to anyone else.
- Delete a trip and its observations are removed from the server too.
- The app requires **no account and no password**.
- We do not sell data, and the app contains no advertising or tracking networks (no Google Analytics, no Facebook SDK, no advertising identifier).

---

## 2. Data controller

**[Company name / Claus Lange]**
[Address]
[Postcode and city], Denmark
Company reg. (CVR): [number — delete this line if there is no company yet]
Email: [kontakt@strikeangler.com]

Questions about your data or your rights go to that address. We reply within **30 days**.

---

## 3. What we process

### 3.1 Data that stays on your phone only

The app is offline-first. All of the following is stored in a database **on the device** and is never sent to us:

| Data | Example |
|---|---|
| Trips | Title, start and end time, duration, distance |
| Route | The GPS points that draw your route during a trip |
| Events | Follow, contact/bite, catch, lure change, photo — with time and exact position |
| Catch details | Species, length, weight, kept or released, comment, lure |
| Photos | Pictures taken or picked in the app |
| Profile | Name, profile picture, fishing methods, species, gear, your own spots |
| Weather and water data | Air temperature, wind, pressure, water temperature and water level attached to events |

Uninstall the app and this data goes with it. We cannot restore it.

### 3.2 Data sent to our server (Activity Map)

To show a shared activity map, the app sends a heavily reduced version of each observation. These fields, and nothing else:

| Field | What it contains |
|---|---|
| Cell id | A hexagonal cell with a radius of about **461 m** (roughly 900 m across). The position is coarsened **on the phone** before anything is sent — your coordinates never leave the device |
| Event type | Follow / contact / catch |
| Species | Catches only, e.g. sea trout |
| Time | Date and hour of day (not minutes or seconds) |
| Wind direction | As a compass point, e.g. "NW" — not degrees |
| Water temperature | In degrees |
| Technical id | A random per-event id, so the observation can be removed again if you delete the trip. It is not linked to you, to your phone, or to your other observations |

We do **not** send: name, email, user id, device id, photos, length, weight, comments, lure, your route, your saved spots, or your photo events.

**Display threshold:** a cell must contain at least **3 observations** before any activity is drawn at all, and at least **4** before it can appear as a numbered hotspot. The point is that no one can work out where a single angler was standing.

### 3.3 In-app feedback

If you send feedback from the app, we store: your message, app version, build number, platform, phone model, and a **locally generated id** that lets us see when several messages come from the same installation. That id is random and contains no name, email or Apple ID.

### 3.4 Third-party weather data

The app fetches weather and water temperature from **Open-Meteo** (open-meteo.com, a German provider, EU servers, no account and no API key). The position is truncated to **3 decimal places (about 110 m)** before the request is sent, and no name, id or other detail travels with it. Open-Meteo can see that *someone* asked about the weather in an area — not who, and not the exact point.

Water level comes from **DMI** (opendataapi.dmi.dk) via a **fixed measuring station (Fynshav Havn)**. No information about you is sent there at all.

### 3.5 Data Apple processes during TestFlight

If you take part in the test, Apple uses your **email address and Apple ID** to grant access. Apple also gives us **crash reports and high-level usage statistics** in aggregate. Apple is an independent data controller for that, and Apple's own privacy policy applies: https://www.apple.com/legal/privacy/

---

## 4. Purposes and legal bases

| Purpose | Data | Legal basis (GDPR) |
|---|---|---|
| Providing the app's core features (logbook, routes, statistics) | Local data on the device | Performance of a contract, Art. 6(1)(b) |
| Showing a shared activity map | Anonymised cell-level observations | Legitimate interest, Art. 6(1)(f) — aggregated data that cannot be traced to a person |
| Improving the app and fixing bugs | Feedback, crash reports | Legitimate interest, Art. 6(1)(f) |
| Running the test programme | Name, email | Contract / consent, Art. 6(1)(a)-(b) |

Access to **location, camera and photo library** requires your permission in iOS. You can withdraw it at any time under Settings → STRIKE. Without location access the app cannot draw your route or place your catches.

---

## 5. Retention

| Data | Kept |
|---|---|
| Local data on the phone | Until you delete it in the app or uninstall the app |
| Observations on the server | [SPECIFY: e.g. "until you delete the corresponding trip", or a fixed period such as 24 months] |
| Feedback | Up to 24 months |
| Tester list (name, email) | Until the test programme ends, or you ask to be removed |

---

## 6. Processors and recipients

| Provider | Role | Location |
|---|---|---|
| Supabase | Database for the Activity Map and feedback | EU [CONFIRM region — e.g. Frankfurt] |
| Apple (App Store / TestFlight) | Distribution, crash reports | EU/USA, Apple's standard terms |
| Open-Meteo | Weather and water temperature | EU (Germany) |
| DMI | Water level from a fixed station | Denmark |
| [Web host for strikeangler.com] | Website hosting | [Location] |

We do not resell data and do not share it with advertisers.

**Transfers outside the EU/EEA:** the database is in the EU. Where a provider (e.g. Apple) processes data outside the EU/EEA, it does so under the European Commission's Standard Contractual Clauses.

---

## 7. Your rights

You have the right to **access**, **rectification**, **erasure**, **restriction**, **objection** and **data portability**, and to **withdraw consent** at any time.

In practice: your catch data lives on your phone, so you delete it yourself in the app. Deleting a trip also removes its observations from the Activity Map — including when you are offline, in which case the deletion is sent as soon as you have a connection again. To be removed from the tester list, or to ask what we hold, write to [kontakt@strikeangler.com].

If you are unhappy with how we handle your data, you can complain to the Danish Data Protection Agency (**Datatilsynet**), Carl Jacobsens Vej 35, 2500 Valby, dt@datatilsynet.dk, www.datatilsynet.dk.

---

## 8. Security

Everything is sent encrypted (HTTPS/TLS). Database access is limited to the app's developers. The app requires no account, so we hold no passwords.

## 9. Children

STRIKE is not directed at children under 13, and we do not knowingly collect their data.

## 10. Changes

We may update this policy as the app gains features. Material changes are announced in the app or by email to testers. The date at the top shows the current version.

## 11. Cookies on strikeangler.com

[Fill in once the site is finished. If the site uses only technical cookies, say so here. If it uses Google Analytics, embedded video, a Meta pixel or similar, a consent banner with prior opt-in is required — a separate obligation this text does not cover.]

---

## 12. Contact

**[Company name / Claus Lange]**
Email: [kontakt@strikeangler.com]
[Address]

---

*Draft, not legal advice. Read it before publishing, and have a lawyer look at it before STRIKE starts charging money.*
