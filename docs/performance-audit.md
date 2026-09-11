# Performance audit — storefront responsiveness

Written before any optimisation work, so the fixes that follow can be judged
against what was actually measured rather than against a guess. Every claim
below points at a specific file and line range.

The reported symptoms were: a dead pause after clicking a product / brand /
model / service card, delayed page transitions, stuttering scroll, and an
overall lack of fluidity.

Those are two separate problems with two separate causes, and it is worth
naming them apart because the fixes do not overlap:

1. **Navigation feels dead.** Nothing on screen changes between the click and
   the next page appearing, and the gap is long — hundreds of milliseconds of
   server time before a single byte of the new page exists.
2. **Scroll stutters.** A handful of components do per-frame work on the main
   thread during scroll, including React state updates and forced layout.

---

## 1. Navigation: serial database round trips on every page

### 1.1 `AppShell` runs seven queries one after another

`src/components/AppShell.tsx` wraps every page on the site. Its body was a
single `try` block with seven sequential `await`s:

```
storeSettings   ->  outlets  ->  categories  ->  contentPages(home)
            ->  contentPages(nav)  ->  contentPages(footer)
            ->  contentPages(announcement)
```

None of these depend on each other. They were still executed strictly in
order, so the shell's cost was the *sum* of seven network round trips to
Postgres rather than the *maximum* of them. Against a managed database on
another host — which is how this is deployed — a round trip is realistically
30–80 ms, putting the shell alone at roughly **210–560 ms before the page's
own content is even reached.**

This is the dominant cost in the funnel the user described, because
`/repair`, `/repair/[brand]` and `/repair/[brand]/[model]` all render through
`AppShell`. It is paid on every navigation, on every route.

`AppShell` also carried `export const dynamic = "force-dynamic"`. Route
segment config is only read from `page.tsx` / `layout.tsx` / `route.ts`, so in
a plain component file that export is inert — it did nothing, in either
direction. Removing it is a correctness cleanup, not a performance change.

### 1.2 The same rows are read twice per request

`generateMetadata` and the default export of a page are separate functions,
and Next.js calls both. On `/repair/[brand]/[model]` each one independently
called:

- `getRepairBrandBySlug(brandSlug)`
- `getModelBySlug(brand.id, modelSlug)`

`getModelBySlug` is itself implemented as "load *every* model for the brand,
then `.find()`", so for Samsung that is a 30+ row read performed twice.

Nothing in `src/lib/queries.ts` or `src/lib/repair/queries.ts` used React's
`cache()`, so there was no request-level dedupe to catch this. Counted end to
end, a single model page was doing roughly **nine database round trips, four
of them exact duplicates,** almost all of them serial.

### 1.3 Sequential awaits inside the page bodies

`/repair/[brand]/[model]` does:

```ts
const brand = await getRepairBrandBySlug(brandSlug);   // round trip 1
const model = await getModelBySlug(brand.id, ...);     // round trip 2
```

The second genuinely depends on the first, so that pair cannot be
parallelised — but `getOutlets()` cannot depend on either, and it was inside
the same serial chain until the final `Promise.all`.

### 1.4 There is no loading boundary anywhere in the app

```
$ find src/app -name loading.tsx
(nothing)
```

This is what turns 1.1–1.3 from "slow" into "broken-feeling". In the App
Router, a `<Link>` to a dynamically rendered route with no Suspense boundary
above it cannot commit any UI until the server has produced the RSC payload.
The old page stays fully painted, the URL does not change, and no spinner,
skeleton or pressed state appears. The click is genuinely invisible for the
entire duration of §1.1 + §1.2.

That is precisely the reported "Did my click actually work?".

### 1.5 Cards have no pressed state

`src/components/repair/SelectionCard.tsx` transitions only on hover:

```
hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-...
```

There is no `:active` treatment, so on touch — where hover does not exist at
all — a tap produced *zero* visual acknowledgement. On mobile this is the
whole of the interaction feedback problem in one line.

---

## 2. Scrolling

### 2.1 `PopularServicesCarousel` sets React state on every scroll frame

`src/components/repair/PopularServicesCarousel.tsx`:

```tsx
onScroll={readEdges}
onWheel={holdAutoAdvance}
```

`readEdges` reads `scrollLeft`, `clientWidth` and `scrollWidth` — all three
force a layout flush — and then calls `setAtStart` / `setAtEnd`. Bound to
`onScroll`, that is a forced synchronous layout plus a potential React render
**per scroll frame** while the rail moves, and the rail moves on its own every
three seconds via `setInterval`.

`onWheel` is worse in practice. React attaches `onWheel` as a **non-passive**
listener, and it fires for vertical page scrolling that merely passes over the
rail. So scrolling the page past the carousel ran `setPaused(true)` plus
`clearTimeout` + `setTimeout` on every wheel tick, each one re-rendering the
carousel and all of its `ServiceCard` children.

### 2.2 `scroll-behavior: smooth` is applied globally

`src/app/globals.css:19` sets it on `html`. It is the wrong scope: it makes
every programmatic scroll anywhere in the app — including focus restoration,
`scrollIntoView` from unrelated code, and browser scroll anchoring — animate.
The user explicitly asked that ordinary scrolling stay native, and that smooth
behaviour be opt-in for deliberate jumps only.

### 2.3 `overflow-x: hidden` on both `html` and `body` — WRONG, retracted

> This finding was disproven by measurement and is kept here as a record of a
> plausible-sounding fix that made things worse.

The original claim: `globals.css:19` and `:38` both set it, which is a well
known way to break `position: sticky` and, on iOS Safari, to hand scrolling to
a slower path, so one of them is enough.

Removing it from `html` **regressed rasterisation by ~95%** — 1053ms to 2056ms,
and raster tasks from 916 to 1278 on a homepage scroll. Re-injecting the single
declaration live, with nothing else changed, restored the old numbers, twice.

The reason: with `overflow-x: hidden` on `html`, Chrome keeps the document as
the root scroller and uses its fast composited scrolling path. Take it off and
the clipping moves to `body`, `body` becomes the scrolling box, and the page
loses that path. The received wisdom is real but it is about `sticky` and old
iOS, not about raster cost, and here the raster cost dominated.

Both declarations stay. See the comment at the top of `globals.css`.

### 2.4 `TechShowcase` — acceptable, left alone

`src/components/TechShowcase.tsx:56` already coalesces its scroll handler
through `requestAnimationFrame`, registers `passive: true`, and writes a CSS
custom property rather than re-rendering. Its one `setChapter` call is guarded
by an equality check. This is the pattern the carousel should have used, and
it needs no change.

### 2.5 `HeroAmbient` — acceptable, left alone

`src/components/HeroAmbient.tsx` is correctly budgeted: desktop-and-mouse
only, `IntersectionObserver`-gated, paused on tab hide, 36 particles, no
per-frame blur. Not a suspect.

---

## 3. Images

`src/components/repair/BrandGrid.tsx` marked the first **nine** cards
`priority`, and `ModelGrid.tsx` the first **seven**:

```tsx
priority={i < 9}
```

`priority` emits `fetchpriority="high"` and a `<link rel="preload">`. Nine
simultaneous high-priority image requests do not make nine images arrive
sooner — they make all nine, *and the real LCP element, and the CSS*, compete
for the same connection. The documented guidance is to mark only the actual
LCP candidate. On a phone at two columns, "the first row" is two cards, not
nine.

`src/components/SafeImage.tsx` also omitted `decoding="async"` on its two
`next/image` branches, though it correctly sets it on the plain `<img>`
fallback. Image decode then happens on the main thread and can land inside a
scroll frame.

---

## 4. Things checked and found healthy

Worth recording so this is not re-litigated later.

- **Dependencies.** `package.json` has no animation library, no carousel
  library, no moment/lodash. `lucide-react` is imported per-icon everywhere,
  which tree-shakes. There is no bundle bloat to cut.
- **Search.** `BrandGrid` / `ModelGrid` / `ServiceGrid` filter an
  already-loaded array inside `useMemo` with no debounce. This is already the
  behaviour asked for — local filtering that feels immediate. Adding a debounce
  here would be a regression.
- **Carousel structure.** Built on native `overflow-x: auto` with CSS snap, not
  a JS transform track and not cloned slides. The right foundation; only its
  event handling needs fixing.
- **Data fetched server-side.** The repair grids receive their rows as props
  from server components, so there is no fetch-after-mount placeholder flash.
- **`Reveal`.** Uses `IntersectionObserver`, unobserves after firing, animates
  only `opacity` and `transform`. Compositor-friendly.

---

## 5. What this audit implies, in order of expected effect

1. Parallelise `AppShell`'s seven queries. Largest single win, applies to every
   route.
2. Add `cache()` to the shell and repair reads, killing the duplicate work
   between `generateMetadata` and the page body.
3. Add `loading.tsx` skeletons to the repair funnel so a click commits UI
   immediately instead of waiting on the server.
4. Give cards a real `:active` pressed state and a pending state on the link
   being navigated to.
5. Fix the carousel's `onScroll` / `onWheel` handlers.
6. Scope `scroll-behavior: smooth` to deliberate jumps.
7. Cut `priority` to the genuine first row, and add `decoding="async"`.

---

## 6. Measured result — navigation (milestone `perf: optimize interaction and navigation`)

Measured against a real Postgres with a **15 ms one-way TCP delay in front of
it (30 ms round trip)**, which is what a managed database in the same region
actually costs. This detail is the whole measurement: against a local database
a round trip is ~0.2 ms, the difference between seven serial queries and one
parallel batch is inside the noise, and the optimisation would have looked
worthless. The tooling for this is `scripts/perf/latency-proxy.mjs` and `scripts/perf/measure.mjs`, which
also counts the query messages crossing the wire.

12 requests per route, median of full response, production build (`output:
standalone`) both sides. Baseline is commit `028d05e`.

| Route | Before | After | Change | DB round trips before → after |
| --- | --- | --- | --- | --- |
| `/repair` | 282 ms | **65 ms** | **−77%** | 11 → 8 |
| `/repair/samsung` (34 models) | 312 ms | **84 ms** | **−73%** | 13 → 9 |
| `/repair/samsung/<model>` | 338 ms | **110 ms** | **−67%** | 16 → 10 |

p95 fell in step: 304 → 90 ms, 341 → 98 ms, 348 → 137 ms.

Note the shape of the win. The query *count* fell only modestly — the large
drop is because the remaining queries now run concurrently instead of one
after another. Removing a duplicate query saves one round trip; unblocking six
independent ones saves six.

On top of that, the funnel now has loading boundaries, so the portion of this
latency the visitor actually experiences as a dead pause is zero: the skeleton
commits in the same frame as the click, and `useLinkStatus` holds the pressed
card and runs a progress bar on it until the next route arrives.

Seeded with 20 brands, 376 device models and 14 services so the model grid is
a realistic size rather than a toy one.

---

## 7. Milestone 3 — scrolling performance

### 7.1 Where the scroll cost actually was

The homepage was the only janky page. `/repair`, `/repair/samsung` and
`/products` all held a 16.7ms median before any of this work. A CPU profile of a
homepage scroll attributed **59.6% of renderer time to `(program)` and only ~3%
to JavaScript**, so this was never a memoisation problem — it was paint, style
recalculation and rasterisation. Memoising components would have changed
nothing, which is why milestone 5 is scoped small.

Attribution experiments, each toggling one thing on an otherwise identical build:

| Experiment | Effect |
| --- | --- |
| All `filter`/`backdrop-filter` disabled | RasterTask 1139ms → 517ms (−55%) |
| All animations disabled | UpdateLayoutTree 812ms → 323ms (−60%) |
| Body background gradients removed | Raster −22%, raster tasks 964 → 645 |
| `.aurora` blur alone removed | −58ms only (already handled by `content-visibility`) |

So the cost was spread across many small decorations rather than concentrated
in one villain, and the two structural wins were the body gradient and the
ever-running animations.

### 7.2 What changed

- **Body gradients moved to a fixed layer.** Two radial gradients sized
  `100% 2400px` on `body` re-rasterised tile by tile down the whole page. They
  are now a `position: fixed` `body::before`, painted once and composited.
- **Offscreen infinite animations paused** (`src/components/IdleDecor.tsx`).
  38 elements ran `infinite` animations — `auroraDrift` ×11, `brandMarquee`,
  `heroSweep`, `storyFloat`, `tickerNudge` ×18 and others — ticking style
  recalculation even while far offscreen. An `IntersectionObserver` with a 50%
  margin sets `animationPlayState` and restores it on approach. One-shot
  entrance animations are untouched.
- **`TechShowcase` scroll listener gated** by `IntersectionObserver`, and its
  `--sp` custom property is now written only when the rounded value changes.
  It previously rewrote a clamped `0` or `1` on every frame of the entire page
  scroll, invalidating the 7 descendant rules that read it.
- **`PopularServicesCarousel`**: `paused` moved from state to a ref, so hover,
  wheel and touch no longer re-render every card; native passive rAF-coalesced
  scroll listener; edge state committed only on change.
- **`blur()` replaced with gradient stops** on `.banner-product-glow`,
  `.brand-mark__ring` and `.tsx-glow`; **9 redundant `backdrop-blur`s removed**
  where the backing was already ≥85% opaque.
- **`.aurora`** keeps its `blur(64px)` — a `mask` alternative measured 2.5×
  worse — but gained `content-visibility: auto` and `contain`.
- **Global `scroll-behavior: smooth` removed** from `html`. Every deliberate
  jump already passes `behavior: "smooth"` explicitly, so ordinary scrolling is
  native again, per the brief. `:target { scroll-margin-top: 5.5rem }` added so
  anchors still clear the sticky header.

### 7.3 Result — homepage scroll, 4× CPU throttle, 1440×900

Trace totals, mean of 2 runs against a 3-run baseline:

| Renderer work | Before | After |
| --- | --- | --- |
| RasterTask | 1097ms / 946 tasks | **863ms / 641 tasks** (−21% / −32%) |
| UpdateLayoutTree | 876ms / 210 recalcs | **542ms** (−38%) |
| Total accounted | 3814ms | **3228ms** (−15%) |

Frame times, **4 paired runs per build** because a single run cannot separate a
real change from noise on this page:

| | Baseline (3001) | Optimised (3002) |
| --- | --- | --- |
| p95 frame | 99.9 / 100.1 / 100.0 / 100.1 ms | **83.4 / 83.3 / 83.2 / 83.4 ms** |
| Median frame | 33.3 ms in 4/4 runs | 16.7 ms in 2/4, 33.3 ms in 2/4 |
| Frames > 33.4ms | 40.6% avg | **32.9% avg** |
| Frames delivered | 115–119 | 118–126 |

Read honestly: **p95 improved by 17% and did so identically in every run**, the
share of dropped frames fell by about a fifth, and the page now delivers more
frames per scroll. The median sometimes reaches a sustained 60fps where the
baseline never did, but not reliably. **The homepage is meaningfully smoother
and is not yet fully smooth.** The remaining cost is the long tail of
decoration the attribution table points at: `blur(40px)` on 57 elements
(Tailwind `blur-2xl`/`blur-3xl` glow blobs repeated per card across nine
sections) and `saturate(0.85)` on 40 brand marks inside the animated
`brandMarquee`. Those are visual-design decisions rather than bugs, so they are
listed rather than unilaterally deleted.

### 7.4 A layout-shift regression this milestone introduced and fixed

Profiling caught something milestone 2 had added: **CLS 0.207 on
`/repair/samsung` and 0.11 on `/repair`**, against 0 on the baseline. The new
loading skeletons were shorter than the real grids, so the footer painted in
the middle of the viewport and then jumped when content arrived — precisely the
jank the skeletons exist to prevent.

`scripts/perf/cls-sources.mjs` was written to name the shifting nodes rather
than just report a score; it identified `Footer`. Giving both each skeleton and
its matching page the same `min-h-screen` floor keeps the footer below the fold
during loading and in the same place after. **Both routes now measure CLS
0.0000.**

### 7.5 Tooling added

`scripts/perf/` — `scroll-profile.mjs` (wheel-driven frame timing, optional
single-route filter for repeat runs), `cpu-profile.mjs`, `trace-breakdown.mjs`
(accepts extra CSS to inject for bisection without a rebuild),
`audit-filters.mjs` (filtered/animated elements by rendered pixel area) and
`cls-sources.mjs`.

---

## 8. Milestone 4 — responsive image loading

### 8.1 Images were not the problem the brief expected

Worth stating plainly, because the brief anticipated "huge source images in
small cards" and the measurements did not support it. `scripts/perf/image-audit.mjs`
reports, per `<img>`, the bytes actually transferred against the box it is
painted into, at both a 1440x900 desktop and a 390x844 phone.

The repair funnel came out clean: `/repair` ships 22 images in 41kB, and
`/repair/samsung` 36 images in 57kB, all with `decoding="async"`, no oversized
raster sources and no unreserved space. Brand and model art is SVG, which
scales for free.

Two false positives had to be removed from the audit script before its output
was trustworthy: it counted SVGs as "oversized" (a vector has no natural size
worth comparing to a box) and it reported every `next/image` `fill` image as
having no reserved space (the sized parent reserves it, not the `<img>`). It
was flagging 36/36 images on a page that measures CLS 0.

### 8.2 The one real find: `CategoryCircleStrip`

`src/components/CategoryCircleStrip.tsx` painted its fallback category art into
an 84px circle (96px from `sm` up) while hardcoding `?w=300` on the source —
3.6x more pixels than the box can display, paid for in bytes, in decode and in
downscale on every visit. It also had no `decoding="async"` (a main-thread
decode is a stall the visitor feels as the UI locking up) and no intrinsic
size, so the circle did not hold its space.

These are remote URLs, so `next/image` cannot touch them unless the host is in
`NEXT_PUBLIC_IMAGE_HOSTS`. Asking the host for the right size instead costs
nothing and needs no configuration: `dprSrcSet` rewrites the existing `w`
parameter into a 1x/2x/3x srcset at the real box size, and only when a `w` is
already present, so an admin-supplied URL from any other host passes through
untouched.

Homepage, measured against the untouched baseline build:

| | Baseline | After |
| --- | --- | --- |
| Image bytes, 390x844 | 145kB | **117kB** (−19%) |
| Image bytes, 1440x900 | 184kB | **156kB** (−15%) |
| Bytes wasted on oversized sources | 31kB / 29kB | **0** |
| Images with no reserved space | 4 / 5 | **0 / 1** |
| Last image finishes (Fast 3G, 4x CPU) | 6662ms | **3210ms** |

The last-image figure is the one that matches the reported symptom of images
feeling slow to arrive.

### 8.3 A planned fix that measurement rejected

The plan was to cut `priority={i < 7}` in `ModelGrid` and `priority={i < 9}` in
`BrandGrid` down to the first row on a phone, on the reasoning that the grid is
2 columns at 390px so five of those preloads are below the fold.

Tested properly — Fast 3G, 4x CPU, 390x844, and 11 distinct photos seeded so
the preloads could not dedupe to a single URL, three runs each:

| | `priority={i < 7}` | `priority={i < 2}` |
| --- | --- | --- |
| LCP (median) | 2584ms | 2556ms |
| LCP (all runs) | 2584 / 2628 / 2520 | 2800 / 2556 / 2520 |
| Last image done | 2285ms | 2386ms |

The LCP difference is inside run-to-run noise and the last image finished
*later*. The page ships ~68kB of images, so bandwidth is not the constraint and
there was nothing for the preloads to steal. **Reverted**; the reasoning is
recorded in a comment at the call site so it is not redone.

Also verified and left alone: `next/image` already emits `decoding="async"`,
confirmed in the rendered markup, so the planned `SafeImage` change was
unnecessary. The only images still lacking it are four inline `data:` SVGs,
where decoding is free.

### 8.4 Measurement caveat

Local seed data needed direct database fixes before any of this could be
measured — the seeded rows pointed at `.png` files where the repo ships `.svg`,
so 20 of 22 images on `/repair` were 404ing and being removed from the DOM by
`SafeImage`'s error fallback. `scripts/seed-local.mjs` now points at assets
that exist. These numbers therefore reflect the repo's own assets, not the
production catalogue.

---

## 9. Milestone 5 — unnecessary component renders

### 9.1 What the profile actually showed

Two new tools measure this, because the symptom ("UI briefly frozen after
interaction") could be caused either by expensive JavaScript or by expensive
painting, and the fix is completely different in each case.

`scripts/perf/interaction-latency.mjs` records INP-style `event` timing entries
and splits each interaction into input delay, handler time, and the remaining
presentation delay. Measured at 4x CPU throttle:

| Interaction | Worst | Input delay | Handler | >200ms |
|---|---|---|---|---|
| Type in model search (34 models, local filter) | 40ms | 1ms | 2ms | 0 |
| Click a model card (navigation) | 112ms | 11ms | 3ms | 0 |
| Click a brand card (navigation) | 64ms | 7ms | 1ms | 0 |
| Type in header search (network-backed) | 128ms | 1ms | 2ms | 0 |

**Handler time never exceeds 3ms and input delay never exceeds 11ms.** There is
no long-running JavaScript blocking the main thread during any interaction. The
remaining 40-125ms is presentation delay: style, layout, paint and compositing
after React has already finished. Memoization cannot reduce that, which matches
the CPU profile in §5 (JS ~3% of scroll time, `(program)` 59.6%).

### 9.2 Why INP could not be used to steer the work

Repeated paired runs against the port-3001 control and the optimized build
returned, for the same header-search keystroke:

```
3001  168 168 160 160 152 144 144 144      3002  176 176 168 144 144 144 144 144
3001  136 136 128 128 128 120 120 120      3002  120 120 120 120 120 120 120 112
3001  192 192 184 168 168 160 160 160      3002  160 160 160 120 120  96  96  96
```

The same build spans 88ms to 208ms. A control experiment confirmed the metric
was not usable here: injecting CSS to disable the header's two `blur-[90px]`
glows made the measurement *worse* (128 -> 160ms), and disabling the watermark
as well made it worse again (-> 208ms). Those changes cannot physically slow
painting down. The variance simply exceeds the effect size.

**Conclusion: no memoization decision could be justified from this metric**, and
the brief is explicit that memoization goes only where profiling shows value.

### 9.3 The stable metric: DOM mutations per interaction

`scripts/perf/render-scope.mjs` counts the DOM work one interaction causes via
`MutationObserver`. Unlike a timing number this is deterministic, and it answers
the actual question — does typing one character cause React to re-render more
than the field?

| Interaction | Records | Nodes added | Attribute changes |
|---|---|---|---|
| Header search, 1 keystroke (pre-debounce) | 11 | 0 | 10, all on `INPUT` |
| Model search, 1 keystroke (local filter) | 10 | 0 | 10, all on `INPUT` |
| Header search, keystroke -> settled dropdown (6 real results) | 62 | +1 | 57: `SPAN`=29 `INPUT`=21 `IMG`=5 `DIV`=2 |
| Header search, 5 keystrokes in a burst | 83 | +1 | 78: `INPUT`=42 `SPAN`=29 `IMG`=5 `DIV`=2 |

Two things are proven here:

1. **A keystroke touches only the input element.** Zero nodes added or removed,
   no attribute churn on any other tag. Nothing outside the search field is
   doing DOM work, so there are no wasted renders to eliminate.
2. **The burst row is the important one.** Typing five characters produces
   *identical* `SPAN`=29, `IMG`=5, `DIV`=2 counts to typing one. Only the
   `INPUT` count scales (21 -> 42, one per keystroke, unavoidable). The result
   list therefore renders exactly **once** for the whole burst — the 180ms
   debounce is already coalescing correctly, and the dropdown's ~10 mutations
   per result row are proportional to content genuinely being shown.

### 9.4 A refactor that was written, measured, and reverted

All five pieces of search state lived in `Header`, so a keystroke re-rendered
the logo, category nav, cart and compare badges, watermark layer and two blurred
glow blobs. That is a textbook unnecessary-render pattern, so the search was
extracted into a `HeaderSearch` component holding its own state.

It produced no measurable improvement — the numbers in §9.2 are that experiment
— and §9.3 explains why: React was already mutating nothing but the input, so
narrowing the render scope removed work that was not being done. **Reverted.**
113 lines of churn in a production header is not worth shipping for an effect
that cannot be detected.

### 9.5 Verified: nothing accumulates across repeated journeys

`scripts/perf/stress-test.mjs` runs the full journey — scroll, open a brand,
search a model, open the model, reach a service, go back — five times, wrapping
`addEventListener`, `setInterval` and `setTimeout` once up front. Because App
Router navigation is client-side, `window` survives the whole run, so a listener
registered and never removed shows up as a count that climbs.

| Cycle | Time | Net listeners | On window/document | Intervals | DOM nodes | Heap |
|---|---|---|---|---|---|---|
| 1 | 7175ms | 646 | 151 | 0 | 405 | 11MB |
| 2 | 6651ms | 918 | 151 | 0 | 405 | 11MB |
| 3 | 6669ms | 1190 | 151 | 0 | 405 | 11MB |
| 4 | 6584ms | 1462 | 151 | 0 | 405 | 11MB |
| 5 | 6546ms | 1734 | 151 | 0 | 405 | 11MB |

The raw net listener count climbs by ~272 per cycle, which looks alarming and is
not: those are listeners on nodes that detach on navigation and are collected
with them. Removing a DOM node never calls `removeEventListener`, so a naive
counter always over-reports. The columns that would reveal a real leak are all
flat — **listeners on `window`/`document` hold at exactly 151, live intervals at
0, DOM at 405 nodes, heap at 11MB across all five cycles** — and cycle time
*drops* 9% as caches warm rather than degrading.

**No progressive slowdown, no leaked listeners, no accumulating timers.**

### 9.6 Measurement caveat that invalidated an earlier reading

The first pass of §9.1 recorded "Products page: open first product — nothing over
16ms" and a header search that looked cheap. Both were false: the `products`
table was empty, so `/products` rendered an empty grid and the header search
returned "No products found" while rendering no rows. The scenario was measuring
an empty code path and reporting it as fast.

`scripts/seed-local.mjs` did not create products at all. It now seeds 18
products with images, idempotently, and every number in §9.3 was taken after
that. This is the second time thin seed data silently invalidated a measurement
(§8.4 was the first).

### 9.7 Outcome

**No memoization was added, and the one render-scope refactor that was tried was
reverted.** The profile shows handler times of 1-3ms, a render scope already
limited to the element being typed into, correct debounce coalescing, and no
listener or timer accumulation across repeated journeys. The remaining
interaction cost is paint, which §7 addressed directly and which the items in
§10 track.

Shipped in this milestone: `interaction-latency.mjs`, `render-scope.mjs`,
`stress-test.mjs`, and the seed-data fix that makes all three measure something
real.

---

## 10. Milestone 6 — finalizing UI responsiveness

### 10.1 Mobile touch scrolling, verified on a real touch path

Touch scrolling reaches the compositor differently from wheel scrolling, so it
needed its own measurement rather than a narrow desktop window.
`scripts/perf/mobile-scroll.mjs` does this at 390x844 with 4x CPU throttle.

Two harness traps had to be cleared first, and both are recorded in that file
because each produced a test that looked like a pass while measuring nothing:
dragging with the mouse API does not scroll a touch page, and
`Input.synthesizeScrollGesture` with `gestureSourceType: "touch"` also left
`scrollY` at 0. Both reported excellent frame times for a page that never
moved. Raw `Input.dispatchTouchEvent` sequences work; the tool now prints a
`BROKEN MEASUREMENT` warning if `scrolled` comes back as 0.

Paired runs, 8 swipes each, baseline `:3001` against current `:3002`:

| Run | Build | Median frame | p95 frame | Frames >33ms | Distance for 8 swipes |
|---|---|---|---|---|---|
| 1 | baseline | 25.9ms | 53.1ms | 55 (24%) | 4280px |
| 1 | current | **21.9ms** | **47.2ms** | **39 (17%)** | 4527px |
| 2 | baseline | 31.6ms | 67.6ms | 94 (44%) | 4280px |
| 2 | current | **21.1ms** | **50.8ms** | **32 (13%)** | 4821px |

Both runs favour the current build on every frame metric. The distance column is
a useful secondary signal: identical swipe gestures carry the page 250-540px
further on the optimized build, because fewer dropped frames means the scroll
tracks the finger instead of stalling mid-gesture.

Also confirmed on mobile: no horizontal overflow, no JavaScript errors, and CLS
of 0.0051 — identical on both builds, so it is pre-existing and small (the
"good" threshold is 0.1), not something introduced here.

### 10.2 A promotion experiment that was reverted

The decorative glow blobs (`blur-2xl` / `blur-3xl`, 9 source call sites, ~57
rendered instances) were the last documented unfixed cost from §7. They are
static, so the theory was that giving them their own compositing layer would let
the browser rasterize each blur once instead of re-running it on scroll repaints.

Measured on the homepage at 4x throttle, averaged over paired runs:

| Variant | RasterTask |
|---|---|
| unchanged | 853ms |
| blur deleted outright | 748ms |
| blur kept, `will-change: filter` | **726ms** |

Promotion looked ideal — as good as deleting the effect, with no visual change at
all. It was applied to `globals.css`, rebuilt, and then failed the check that
actually matters:

| Metric | baseline `:3001` | with promotion `:3002` |
|---|---|---|
| p95 frame (3 paired runs) | 133.2 / 116.7 / 116.6ms | 133.3 / 116.7 / **150.0**ms |
| composited layers | 0 | **4** |
| layer memory | 0MB | **14.8MB** |

**Reverted.** A 15% RasterTask reduction that does not move frame time is not
reaching the user, and it was bought with 14.8MB of GPU memory — a bad trade on
the mid-range phones this site is mostly viewed on. This is the fourth fix in
this audit that was plausible, measured, and thrown away (§2.3, §7, §8.3, and
now this one).

### 10.3 What could not be reproduced

The desktop scroll figures in §7 (p95 100.0 -> 83.3ms) **did not reproduce in
this session**, and that should be stated plainly rather than restated as fact.
Measured now, the same two builds return p95 frame times that are effectively
identical on desktop (133.2 vs 133.3, 116.7 vs 116.7, 116.6 vs 150.0), with
absolute numbers 1.5-3x worse than §7 recorded *on both ports* — baseline
included. The sandbox is simply slower than it was then (2 cores, and §7's
numbers were taken under lighter load), so cross-session absolute comparison is
not meaningful and §7's figures should be read as recorded-at-the-time.

What still holds up under today's conditions is directional and consistent:
frames over 33ms on desktop favour the current build in all three paired runs
(75/77/75 baseline vs 70/62/68), and the mobile results in §10.1 favour it on
every metric in both runs. The honest summary is that the scroll work helps, and
that the specific 100 -> 83ms figure is not currently verifiable.

### 10.4 Housekeeping and final verification

`latency-proxy.mjs` and `measure.mjs` moved from the repository root into
`scripts/perf/` alongside the other ten tools, with their usage comments and the
§6 reference updated. The perf toolkit is now entirely in one directory.

Final state: `tsc --noEmit` clean, `eslint` clean across `scripts/perf/`,
`next build` succeeds, and `/`, `/repair`, `/repair/samsung` and `/products` all
return 200. The integration suite passes 6/14, up from the 5/14 recorded earlier
— the improvement is from §9.6's seed fix giving the product suites real rows,
not from a code change. The nine remaining failures fail identically on the
untouched baseline and are environmental.

### 10.5 Known costs deliberately left in place

- **Decorative blurs.** `blur(40-64px)` on ~57 rendered elements, plus
  `saturate(0.85)` on 40 animated `BrandStrip` marks. §10.2 shows the available
  win does not reach frame time. Removing them outright would cut ~105ms of
  raster but is a visual-design change the brief rules out.
- **`.aurora`** keeps `blur(64px)`, mitigated by `content-visibility: auto`.
  §7 records that replacing it with a mask was 2.5x worse.
- **Every route is `ƒ (Dynamic)`** because the root layout awaits `headers()`
  for the CSP nonce. A deliberate security trade; not touched.
- **Mobile CLS 0.0051.** Present identically on the baseline, far under the 0.1
  threshold. Not chased, since anything smaller is inside measurement noise.
