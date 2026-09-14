# "Mistede" (Lost) — how should it be counted? Decision for Claus

**To:** Claus
**From:** Maciej
**What I need:** a reply saying **A, B or C**. I'll handle the rest.

---

## Why this is a little urgent

It's the last open item in the code. Everything else is built. And the way it works right now, the statistics count wrong — better that we find that before the testers do.

## How it works today

There is no "lost" event in the app. The number is calculated afterwards:

> **Lost = Contacts − Catches** (never negative)

That creates two problems:

**1. The same fish is counted twice.** In the bar chart, Catches + Contacts + Follows + Lost are stacked on top of each other. But a lost fish *is* a contact. A month with 10 contacts and 3 catches is shown as 10 + 3 + 7 = 20 events — out of 13 actual registrations. The bar misrepresents how much happened.

**2. The formula breaks when you catch a fish without tapping "Contact" first.** And that's what people do: when the fish is on, you tap "Catch", not "Contact" and then "Catch". If you have 2 contacts and 4 catches in a month, Lost becomes 0 and Contacts appears lower than the number of catches. The number ends up depending on how disciplined each angler is about tapping buttons in the right order.

Put simply: "Lost" doesn't measure lost fish today. It measures the gap between two buttons people press in whatever order suits them.

---

## The three options

### A — Leave it as it is

We keep the calculation and remove "Lost" from the bar chart, so the number only appears as a tile at the top.

- **Work:** half an hour.
- **Upside:** nothing changes for the testers, no risk.
- **Downside:** the number is still unreliable. The first time a tester says "I lost four fish last week, why does it say zero?", we have no answer.

### B — A new "Lost" button on the trip screen

A fifth button next to Follow / Contact / Catch / Photo. You tap it when the fish comes off.

- **Work:** 1–2 days (new event type, database migration, button, map, statistics, translations).
- **Upside:** honest data, and "lost" becomes a signal of its own on the Activity Map.
- **Downside:** another button on a screen where things have to be tapped fast with wet hands. Five buttons is a lot when it all has to happen quickly.

### C — An outcome on the catch: **landed** or **lost** ⭐ my recommendation

No new button. You tap "Catch" as you do now, and on the screen that follows you choose whether the fish was **landed** or **lost**. Landed is preselected, so the fast path stays exactly as fast as it is today.

That makes the three numbers separate, so they can be added up without overlapping:

| Tile | What it is |
|---|---|
| **Follows** | Fish that followed but never took |
| **Contacts** | Fish that took but never got hooked |
| **Lost** | Fish that were hooked and came off |
| **Catches** | Fish that made it to the bank |

- **Work:** about a day (one database column, a choice on the catch screen, statistics rewritten, translations). Existing catches are set to "landed".
- **Upside:** it matches what anglers actually say. You register the fish regardless of how it ended — and we get species and a size estimate on the lost ones too, which is interesting data.
- **Downside:** one extra choice on the catch screen. And lost fish without a confident species ID ("something big") need to be registrable without a species.

---

## What I recommend

**C.** It costs a day, removes the double counting, and it's the only one of the three where the number means what the word says. B gets to the same place but costs a button on the screen with the least room for one.

**One more question if you pick C:** should lost fish count on the Activity Map? I think yes — a fish on the hook is the strongest evidence there are fish in the area. But say so if you'd rather the map only showed landed fish.

**Reply with one letter and I'll build it.** If you pick A, it can go in the next build. B and C have to go into a build *before* the testers get access, otherwise their early trips sit there as data we have to migrate afterwards.
