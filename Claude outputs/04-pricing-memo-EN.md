# Pricing: what should be free? A note for the decision

**To:** Claus
**From:** Maciej
**What this is:** input for the free/premium list you said you were putting together — my case for where the line should sit, and the numbers behind it.

---

## Starting points

- STRIKE should make money on a subscription.
- The Founding Tester terms (10 trips, surveys after 5 and 10, a closing feedback session → 1 year free, then half price) are fair, and I back them.
- The yearly plan matters more than the monthly one. 49 kr/month and 449–499 kr/year, not 59.

The one thing I'd argue hardest for is that the core stays **free, permanently** — not a trial. Here's why I think a paywall in front of it costs us the product.

---

## 1. The Activity Map is our only real edge — and a map dies without data

Fishbrain has millions of users. We will never beat them on content. What we can beat them on is **density on Als**: a map with something actually on it, because enough people locally are using the app.

Every paywall in front of the logbook removes users, and every removed user makes the map emptier. An empty map gives nobody a reason to pay. That's a spiral that runs downwards, and it starts at user number one.

The first few hundred users aren't revenue. They're the raw material for the map. If we charge 49 kr for the privilege of supplying that raw material, we get neither the money nor the map.

## 2. The competitor has already made this call — the other way

BiteMap (the German one, the product closest to ours) runs a **permanent free plan**. Free, for them, includes: catch logging, sessions, GPS tracks, spots, waypoints, baiting log, **heatmap**, and 50 spots.

They charge €9.99/month or €99/year for the AI assistant, bite forecasting, depth maps with water-level correction, automatic session analysis and GPX import.

In other words: they give away exactly the functionality we're discussing charging 49–59 kr a month for, and make their money on the layer above it. A Danish angler looking at both apps sees a free German one and a paid Danish one. We need a very strong answer to that — and the only answer that holds is "our map shows what's happening on Als right now". That answer requires users.

Fishbrain does the same thing, incidentally: free account, and you pay for exact catch locations, forecasts and depth contours.

## 3. Three trips won't convert anyone

A trial of one month or three trips is too short for the app to show what it can do. STRIKE's value comes from **history**: after three trips there are no statistics to look at, no patterns, no "last time you were here". We're asking people to pay at precisely the moment the app looks emptiest.

## 4. The arithmetic behind 49 kr

Worth knowing before we decide:

- 49 kr in the App Store is **including VAT**. Without Danish VAT: about 39 kr.
- Apple takes 15% (via the Small Business Program, which we have to apply for — otherwise it's 30%): about 6 kr.
- **Left for us: roughly 33 kr per month per paying user.**
- On the 499 kr yearly plan: about 339 kr to us. With the testers' 50% lifetime discount: about 170 kr per tester per year.

So 20 founding testers at half price is around **3,400 kr a year**. That isn't a business — it's a thank-you. The business is in the users who come *after* them, and they only come if the map is worth opening.

---

## My concrete proposal

| Free forever | STRIKE Pro (49 kr/mo · 449 kr/yr) |
|---|---|
| Trips with route and time | Monthly and yearly statistics in depth |
| Catches, contacts, follows, photos | Best conditions (water temp, wind, pressure) |
| Weather and water temperature on events | Time-of-day analysis |
| Logbook and trip review | Comparison against the community |
| **The Activity Map — viewing activity** | Map history beyond 7 days |
| Profile, gear, own spots | Radius and postcode filters on the map |
| Sharing trip cards | Later: bite window and recommendations |

The logic: **what creates data is free. What interprets data costs money.** The map gets better with every free user we bring in, and the statistics are exactly the layer you built up with slide 8 — that's what people pay for in every competing app.

It also lets us say something none of the competitors can: *our map is free, and your spot is never shared.* That's an advertisement, not a concession.

---

## What I need from you

1. **Your free/premium list.** Send it over and I'll put it next to this one — where they differ is the actual conversation.
2. **A yes or no on the free core staying free permanently**, rather than a trial. If it's a no, I'll build your model — but then we need an answer ready for BiteMap's free plan before we stand in front of 20 anglers in the tackle shop.
3. **A decision before the shop evening**, so the material, the landing page and the Founding Tester graphic all say the same thing.

## One thing we shouldn't promise anyone yet

There is **no payment functionality in the app** today. Subscriptions on iOS require Apple's StoreKit: products created in App Store Connect, a purchase and restore flow, receipt validation. On top of that the app has no user accounts — without a login, a subscription can't follow a person from one phone to another. That's two pieces of real work, not a switch I flip.

So: the alpha runs free for everyone, and we put no date on a paywall until we've decided the model and built it. We shouldn't promise the testers anything we'll have to take back later.

---

**Sources:** [BiteMap – pricing and features](https://bitemap.fish) · [Fishbrain Pro](https://fishbrain.com/blog/fishbrain/introducing-pro)
