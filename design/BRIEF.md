# Cookbook: design brief

A family recipe archive that should feel like a well-kept notebook, not an app. This brief covers direction **A "Washi"**, which is the recommended one. Its tokens are in `tokens.css`. The previews are `direction-a.html`, `direction-b.html` and `direction-c.html`. Open them in a browser and resize to 360 px. Each preview has a light/dark toggle and a 5-second timer to hear the chime.

---

## 1. Principles

1. **Emptiness serves a purpose.** Whitespace is the frame, following Kenya Hara's Muji idea of emptiness as a receptacle. When unsure, remove it.
2. **Type does the work.** Hierarchy comes from size, weight, italics and hairline rules. Boxes, cards, shadows and chips are not used for hierarchy. The one shadow in the app is on the timer tray, because it floats.
3. **Keep colour for meaning.** The page is paper and ink. Colour appears in three places only: the **season** (a soft hue), the **cuisine seal** (vermilion, the only saturated colour) and **ratio blocks**.
4. **Make it readable from the counter.** Steps are 21 px on a phone and 24 px on a laptop. Quantities are bold inline. Tap targets are at least 44 px. The screen stays awake during cook mode.
5. **One quiet control per job.** Only one control is visible for each task: views as text tabs, units as a small `g ⇄ cups`, and extras behind a single "+ Notes, photos & tags".
6. **The recipe's language wins.** A Hebrew recipe renders RTL in a Hebrew serif, and the chrome around it stays in the user's language.

## 2. Research takeaways

| Reference | Takeaway we apply |
|---|---|
| Kinfolk / Cereal editorial style ([Kinfolk redesign, It's Nice That](https://www.itsnicethat.com/news/kinfolk-tenth-anniversary-redesign-schick-toikka-publication-graphic-design-230621), [editorial-Kinfolk style notes](https://digitalheroesco.com/styles/editorial-kinfolk/)) | Cream paper backgrounds, a restrained editorial serif, line-height of 1.6 or more, and a lot of negative space. Single-column measure. |
| Muji / Kenya Hara ([Surface interview](https://www.surfacemag.com/articles/kenya-hara-muji/), [Rappler](https://www.rappler.com/life-and-style/215173-muji-kenya-hara-reveals-design-secrets/)) | "This is enough." White is a container, not an absence. No decoration that doesn't carry information. |
| NYT Cooking cook mode and cook-mode practice ([Bootstrapped Ventures guide](https://bootstrapped.ventures/cook-mode/)) | Screen Wake Lock. Larger step text readable from a distance. Tap a step to mark your place. Chrome hidden while cooking. |
| Mela ([mela.recipes](https://mela.recipes/), [App Store](https://apps.apple.com/us/app/mela-recipe-manager/id1548466041)) | Every step except the current one is de-emphasised. Timers are created in place, several can run at once, and they persist outside the page (Live Activities). |
| Crouton, Apple Design Award 2024 ([App Store](https://apps.apple.com/us/app/crouton-recipe-manager/id1461650987), [MacStories review](https://www.macstories.net/reviews/crouton-review-an-elegant-modern-recipe-manager-and-cooking-aid/)) | Times are detected in the step text and started from the step. A heads-up display keeps them visible. Timers name themselves from the verb ("Bake cookies"). |
| Ruhlman, *Ratio* ([5:3 bread](https://ruhlman.com/bread-ratio-5-3/), [3-2-1 pie dough, NPR](https://www.npr.org/107019214), [Ratio app](https://ruhlman.com/apps/)) | Ratios are whole-number parts **by weight**. The app's core interaction is "enter one amount, see the rest", so we use "one part = N g". |
| Hanko and shuniku ([Houseofkoyomi on the red stamp](https://www.houseofkoyomi.com/blogs/news/why-japanese-prints-have-a-red-stamp-history-meaning-value), [JeePe hanko guide](https://www.jeepe.jp/en/articles/japan-hanko-culture-guide-1799)) | Vermilion reads cleanly over black ink and marks authorship or provenance. It is a natural fit for *cuisine*, meaning where a dish comes from. |
| Traditional colours ([NIPPON COLORS](https://nipponcolors.com/)) | Season hues are named after sakura, wakatake, kaki, ai and nezumi, then tuned for contrast on paper. |
| 24 sekki / 72 kō ([Nippon.com](https://www.nippon.com/en/features/h00124/), [Kyoto Journal](https://kyotojournal.org/uncategorized/the-72-japanese-micro-seasons/)) | The library shows the current microseason as a single whispered line, e.g. "秋分 · thunder ceases to sound". It also sorts in-season recipes first. |
| Hebrew typography ([Frank Ruhl Libre](https://fonts.google.com/specimen/Frank+Ruhl+Libre), [Noto Serif Hebrew](https://fonts.google.com/noto/specimen/Noto+Serif+Hebrew)) | Frank Ruhl Libre is the Times of Hebrew and is designed for long bilingual text, so it is the natural partner for a book serif. |
| Bell synthesis ([Karjalainen et al., DAFx-02](https://www.dafx.de/papers/DAFX02_Karjalainen_Valimaki_Esquef_bell-like_sounds.pdf), [browser carillon devlog](https://neonvoidstudio.itch.io/singelberg-81-self-playing-carillon/devlog/1643955/why-a-bell-is-not-a-piano-synthesising-81-of-them-in-the-browser)) | A bell is a sum of exponentially decaying, slightly inharmonic sines, and higher partials decay faster. |

Note: Wikipedia and nippon.com were blocked by the network proxy. Their details come from search summaries.

## 3. The three directions

| | A · **Washi** 和紙 (recommended) | B · **Linne** | C · **Koyomi** 暦 |
|---|---|---|---|
| One line | A well-made book on warm paper: sumi serif, hairlines, one vermilion seal | A Scandinavian kitchen at noon: linen, one grotesk, soft rounded surfaces, pine green | An almanac and ledger: IBM Plex, indigo, squares, the day's microseason |
| Library | A book index: title, italic subtitle, marks on the right | A photo grid with the season as the image's light | A ledger table with record numbers |
| Ratio visual | One bar divided into countable part-cells | Stacked building blocks | Rows of masu squares |
| Risk | Serif UI labels can feel precious at small sizes | Photos needed. Closest to generic apps | Mono and tables can feel cold for family use |

**Why A:** it meets the brief most directly (paper-like, calm, classic, few boxes). It reads best at step size, and it works with *no photos at all*, which matters because many imports are screenshots or voice notes. Two ideas are worth borrowing from the others: C's **microseason line** (already in A) and C's `no. 047` record numbers for the share URL.

## 4. Tag system: four marks, zero chips

Only four facets are user-facing. Each has one visual channel, so they never compete:

| Facet | Channel | List / card | Recipe header | Values |
|---|---|---|---|---|
| **Season** | **Colour** | 9 px dot before the title. Tinted highlight on search matches | 3 px top rule in the season hue. Running timers take the season tint | spring 桜, summer 若竹, autumn 柿, winter 藍, all-year 鼠. A recipe can have 2 adjacent seasons; show the first and name both in text. |
| **Cuisine** | **Seal (hanko)** | 22 px vermilion *outlined* square, rotated −3°, 2-letter lowercase small-caps code (fr, jp, il, me) | 52 px *filled* vermilion seal, top-right | ISO-ish codes plus a few regions (me = Middle Eastern). The full name is in `title`/aria-label. |
| **Course** | **Vessel glyph** | 16–18 px hairline SVG (1.4 stroke) | glyph + word | breakfast (egg), starter (shallow dish), soup (bowl), salad (leaf), main (plate), side (small bowl), bread & baking (loaf), sweet (slice), drink (cup), pantry (jar). Ten glyphs, drawn to one grid (see sprite in the previews). |
| **Diet** | **One italic word** | `veg`, `vegan`, `gf`, `df` in ink-3 italics | spelled out ("vegetarian") | Positive claims only. Omit when unknown. |

Rules:
- The seal is the only saturated red in the product. Nothing else may use `--shu`, except the current-step marker and the wordmark square.
- Search filters use the same marks as a sentence: "Showing any cuisine, any course, **autumn first**". Each phrase is a text dropdown. There is no filter bar.
- Tag editing lives only in the hidden extras, as four plain rows.

## 5. Typography

- **Latin:** [Newsreader](https://fonts.google.com/specimen/Newsreader), a variable font with an optical size axis (6–72). One family covers display (light 350 at opsz 72) through captions. Use old-style figures in text and lining tabular figures for timers and amounts.
- **Hebrew:** [Frank Ruhl Libre](https://fonts.google.com/specimen/Frank+Ruhl+Libre) 400/500/700, set by `[lang="he"]`. It is also the per-glyph fallback in the stack, so mixed strings work.
- **Other scripts:** system fallback. For Japanese titles, add `Shippori Mincho` or `Zen Old Mincho` later, loaded only on pages that contain CJK.
- Set `lang` and `dir="auto"` on every recipe-authored string (title, subtitle, steps). The LLM returns the recipe's language code.

| Token | px | Use |
|---|---|---|
| xs | 12 | uppercase labels, tracking .14em |
| sm | 14 | meta, timer labels |
| md | 16 | secondary UI, recap |
| base | 18 | body |
| step | 21 → 24 (≥900 px) | cooking steps, line-height 1.5, measure 34em |
| lg | 22 | list titles |
| xl | 28 | section heads |
| 2xl / 3xl | 36 / 56 | recipe title phone / laptop, weight 350 |

## 6. Colour tokens (A · Washi)

| Token | Light | Dark | Notes |
|---|---|---|---|
| paper | `#F6F3EC` | `#161513` | page |
| paper-raised | `#FBF9F4` | `#1E1C19` | tray, share sheet |
| paper-sunk | `#EDE8DD` | `#121110` | wells |
| ink | `#1F1D1A` | `#ECE6DA` | 15.2 / 14.7 : 1 |
| ink-2 | `#55504A` | `#B7AFA2` | 7.2 / 8.4 : 1 |
| ink-3 | `#736D63` | `#8F887C` | 4.6 / 5.2 : 1, the minimum for text |
| rule / rule-strong | `#DDD6C9` / `#BDB4A4` | `#2F2C28` / `#4A453E` | hairlines |
| shu (seal) | `#B23F2B` | `#E07A62` | 5.2 / 6.2 : 1 |
| focus | `#2F5D8A` | `#8DB4DA` | focus ring |
| spring | `#C06676` / tint `#F6E6E8` | `#E3A1AC` / `#33262A` | marks only (≥3:1) |
| summer | `#4A8465` / `#E3EEE7` | `#86C0A0` / `#1D2B24` | |
| autumn | `#BB5C2A` / `#F5E5DA` | `#E39462` / `#35251B` | |
| winter | `#3E5A78` / `#E2E8EF` | `#8FAACB` / `#1E2631` | |
| all-year | `#8B857B` / `#ECE9E3` | `#A39C90` / `#24221F` | |
| ratio roles | grain `#D9CBA6`, fat `#E8D394`, liquid `#BBD0D7`, egg `#E9B85C`, dairy `#E6DFCB`, sugar `#E9D6D2`, protein `#CDA592` | darkened equivalents in tokens.css | Ratios view only |

Dark mode is warm charcoal, not black, and is never pure white on black. Season hues lift in lightness and keep their hue.

## 7. Spacing, radii, layout

- Spacing uses a 4 px base: `4 8 12 16 24 32 48 64 96`. Sections are separated by 64–96 px. Step bottoms are 32 px apart.
- The gutter is 16 px on phone and 40 px from 700 px. Content max width is 1120 px. Text measure is at most 34em.
- Radii: 2 px (ratio cells), 6 px (sheets, inputs), 14 px (tray), pill (timer pills).
- On a laptop the recipe has 2 columns: a sticky "You'll need" recap (250 px) and the steps. The tab bar sticks to the top of the viewport.
- On a phone, the tab bar sticks to the top and the timer tray sticks to the bottom, which is the thumb zone. All primary actions are in the bottom half.

## 8. Motion

- Easing is `cubic-bezier(.2,.7,.2,1)`. Durations are 140 ms (press), 220 ms (tab/units swap, pill state) and 360 ms (theme, sheets).
- View tabs cross-fade (opacity only, no sliding), because cooks glance rather than watch.
- On a running timer, the pill's clock icon breathes (opacity 1 → .35, 2.4 s loop). The tray bar drains linearly.
- On finish, the tray item pulses its tint twice (1.6 s each) and then holds the season tint with "done".
- `prefers-reduced-motion` turns all of this off. State is still shown by colour and text.

## 9. Iconography

Everything is a hairline SVG on a 24 grid with a 1.4 stroke, round caps and `currentColor`. Two sets:
- **Course vessels** (10), listed in §4.
- **UI** (≈8): search, back, plus, timer, share, play, bell, moon. There are no filled icons except play.

No emoji in the UI chrome. Emoji in recipe content are passed through untouched.

## 10. Timers

- **Detection:** the LLM extracts `{stepIndex, label, seconds, range?}` from phrases like "chill 30 min" or "bake 30–35 min". For a range, use the lower bound and show "30–35" in the label. The label is `verb + object` ("chill dough", "bake tart").
- **Pill:** a faint italic outline pill under the step, `◷ chill 30 min`, 36 px tall. Tap to start. While running it fills with the season tint and the text turns ink. It never shows a countdown, because the tray owns time.
- **Tray:** a slim bar (≤56 px) sticky at the bottom of the recipe. It holds one item per timer (`label` + `m:ss`, tabular) with a 2 px draining bar, and a **+** at the end. Items are sorted by time remaining. It scrolls horizontally when there are more than about 3.
- **Add your own:** tapping **+** opens a tiny sheet with a minute wheel and presets 1 · 3 · 5 · 10 · 15 · 30. Long-pressing a pill also adds a custom-length copy.
- **Stop / dismiss:** tap a running item → "Stop 'chill dough'?". Tap a done item → dismiss.
- **Persistence:** timers are keyed by end timestamp in `localStorage`, so they survive reloads. They show in the tab title (`4:10 · Leek & feta tart`). Use the Notification API when the tab is hidden. Keep a Wake Lock while any timer runs or the Effective view is open.
- **The chime ("rin"):** a soft singing-bowl strike, played twice: **E5 then C5**, 600 ms apart. Each strike is three sine partials:

| Partial | Ratio | Freq (strike 1 / 2) | Peak gain | Decay to −80 dB |
|---|---|---|---|---|
| fundamental | 1.00 | 659.3 / 523.3 Hz | 1.00 | 2.6 s |
| hum-tone (inharmonic) | 2.76 | 1819 / 1444 Hz | 0.26 | 1.0 s |
| shimmer | 5.40 | 3560 / 2826 Hz | 0.07 | 0.4 s |

The attack is an 8 ms exponential ramp, so the strike has no click, and the release is exponential. Master gain is 0.2, about −14 dBFS peak. There is no reverb: the natural decay is the tail. If the timer is unacknowledged, repeat once after 20 s, then stop. Never loop. The reference implementation is `chime()` in any preview file (≈20 lines of Web Audio).

## 11. Screens and component inventory

| Screen | Components |
|---|---|
| Login | Wordmark (vermilion square + italic "the cookbook"), two underlined fields (username, password), one text button "Come in". No sign-up; accounts are created by an admin or the Telegram bot. |
| Library | App bar (wordmark, "Add a recipe", avatar), **search field** (underline only, 22–30 px italic placeholder), hint line, filter sentence, group headings, **index entry** (season dot · title · italic subtitle · match line · marks), microseason line. |
| Import | One page with four equal quiet targets in a 2×2 grid (phone) or a row (laptop): **Drop a photo** · **Paste a link** · **Paste text** · **Record voice** (hold-to-record, waveform line). Then a single "Reading…" state (a breathing seal) that lands on the draft recipe for review. Telegram imports appear in the library with a faint "new" dot. |
| Recipe | Back link, header (title, italic dek, meta row, **hanko**), **view tabs** (Effective · Classic · Ratios · Source), **units toggle**, **recap**, **step** (number, text with inline **quantity**, optional **timer pill**, current-step marker), **extras disclosure**, **timer tray**. |
| Ratios view | **Ratio block**: name, big numerals `3 : 2 : 1`, **part bar** (one cell per part, gaps between ingredients), legend with grams, "one part = [80] g" scaler, notes. Then "And to taste" for everything outside the ratio. |
| Source view | Original photo (zoomable), voice-note player (play, waveform line, time), article text / link, import date and channel. |
| Share page | Static and printable: kicker "From Gil's kitchen", title, dek, marks, brush rule in the season hue, 2-column ingredients / method, footer with the ratio line. No app chrome, no login. Includes an `og:image` rendered from the same layout. |

## 12. Accessibility

- Text contrast is at least 4.5:1 everywhere, with ink-3 as the floor (4.6:1). Season hues are used only for non-text marks (at least 3:1) or behind ink text.
- Colour is never the only carrier of meaning. Every mark has a `title`/`aria-label`, and the recipe header spells out season, course and diet in words.
- Tap targets are at least 44 px (pills 36 px tall but padded to a 44 px hit area). Tabs follow the `tablist` pattern with arrow-key support. The tray is an `aria-live="polite"` list and announces "chill dough done".
- Respect `prefers-reduced-motion`, `prefers-color-scheme` and the user's font size (all sizes in rem). Pinch zoom stays on.
- For RTL, use `dir` per recipe and logical CSS properties (`margin-inline-start`, `padding-inline`). Timers and digits stay LTR within RTL text (`<bdi>`).
- The chime is paired with a visual pulse and a system notification. Volume follows the device. Mute is available in the tray's long-press menu.

---

# Round 2 — Linne

The owner chose **Direction B "Linne"**: one sans family, soft rounded surfaces, a calm photo-led library, and the current step shown as a quiet card. Linne's pine-green palette was dropped. This round tries three **warm stone** palettes on the same layout. Accessibility is a hard requirement because the owner's parents, about 70 years old, will use the app.

Files:
- `linne-oldbook.html`, `linne-kintsugi.html` and `linne-jerusalem.html` are the mockups. Each is one scrolling page with the library and search, the recipe in the Effective view with timers, the Ratios view, the duplicate prompt, ingredient-first with substitutions, sign-in and request access, the owner's approval list, and the palette and contrast footer.
- `linne-tokens.css` is ready to drop into the app. Select a palette with `data-palette="oldbook | kintsugi | jerusalem"`. Each palette has light, dark (system or `data-theme`) and high-contrast (`data-contrast="high"`, light and dark) variants. The file also holds the type scale, spacing, radii, focus ring and text-size steps (`data-text-size="large | xl"`).

## Palettes

| | Old book | Kintsugi | Jerusalem stone (my own) |
|---|---|---|---|
| Idea | Aged paper, sepia/umber ink, bookbinding cloth: the family cookbook that lives by the stove | Stone and marble greys with warm whites. Gold only where things are joined | Honey limestone, olive-wood ink, terracotta and olive |
| Page / card | `#F1E7D3` / `#FAF3E3` | `#EFEDE9` / `#FAF9F6` | `#F0E9DE` / `#FBF7F0` |
| Ink / ink-2 | `#2A1C11` / `#4A3524` | `#1D1C1A` / `#43403B` | `#241A14` / `#4A3B30` |
| Action | Oxblood `#6B1E24` | Charcoal stone `#2F2C28` | Terracotta `#8A3418` |
| Second voice | Bottle green `#1E4A3A` (good, done, focus) | Gold `#B8913A`, decoration only. Bronze `#6E4F14` for any gold-family text | Olive `#4E5A26`. Focus is deep blue `#2E5A78`, so it never blends into terracotta |
| Texture (page margins only, never behind cards) | Laid-paper grain and corner foxing | Pure-CSS marble: two veins and two clouds | Chisel-dressed diagonal lines, as on dressed Jerusalem stone |
| Signature detail | Oxblood ribbon bookmark on the current step, headband dividers, and stacked page edges on cards | Gold seam dividers, a gold edge on the current step, and gold joins between ratio blocks | Arch dividers and wordmark, and a thick terracotta edge on the current step |

**Why Jerusalem stone as the third palette:** it is the warm stone this family actually knows. The honey limestone ground is calmer than paper, and a deep terracotta accent reaches 7:1 without turning brown. I preferred it to basalt & clay (too dark by default) and hinoki & slate (too cool for "warm stone").

**Recommendation: Old book.** It is the most "family cookbook" of the three. Oxblood actions are clearly different from ink, while Kintsugi's charcoal buttons read almost like text. Bottle green gives a second, non-red channel for "done" and "approved". The yellowed paper cuts glare for older eyes. Jerusalem stone is a close second, and it is the better pick if the owner wants the "stone" brief taken literally. Kintsugi is the most elegant, but its signature (gold) is by necessity decorative-only, so less of its character carries meaning.

## Measured contrast (WCAG 2.x, computed by script, not estimated)

"Textured page (worst point)" blends the page colour with the texture colour at the **sum** of all texture layer opacities. That is darker than any real pixel. In high contrast, textures are off. Target: every text pair is at least 7:1 in light and dark and at least 10:1 in high contrast. UI (borders, focus, season marks) is at least 4.5:1. Gold is decoration and has no target.

**Old book**

| Pair | Needs | Light | Dark | HC light | HC dark |
|---|---|---|---|---|---|
| Body text · ink on page | ≥ 7 : 1 | 13.45 | 15.03 | 18.89 | 21.00 |
| Body text · ink on card | ≥ 7 : 1 | 14.93 | 13.88 | 19.36 | 19.72 |
| Body text · ink on textured page (worst point) | ≥ 7 : 1 | 12.17 | 15.27 | — | — |
| Secondary text · ink-2 on card | ≥ 7 : 1 | 10.40 | 9.96 | 16.50 | 16.86 |
| Current step · ink on step card | ≥ 7 : 1 | 12.73 | 11.90 | 15.93 | 16.79 |
| Button label · on accent | ≥ 7 : 1 | 10.44 | 8.59 | 13.55 | 13.50 |
| Accent text · on card | ≥ 7 : 1 | 10.34 | 9.10 | 13.55 | 13.80 |
| Secondary accent text · on card | ≥ 7 : 1 | 9.06 | 9.65 | 13.44 | 13.81 |
| Approve / done text · on card | ≥ 7 : 1 | 9.06 | 9.65 | 13.44 | 13.81 |
| Control borders · on card | ≥ 4.5 : 1 | 6.05 | 5.46 | 16.50 | 15.96 |
| Focus ring · on page | ≥ 4.5 : 1 | 8.16 | 10.45 | 9.95 | 14.68 |
| Season mark autumn · on card | ≥ 4.5 : 1 | 6.50 | 8.41 | 10.29 | 12.45 |
| Ink on ratio block (flour) | ≥ 7 : 1 | 10.78 | 8.15 | 14.70 | 12.18 |

**Kintsugi**

| Pair | Needs | Light | Dark | HC light | HC dark |
|---|---|---|---|---|---|
| Body text · ink on page | ≥ 7 : 1 | 14.56 | 15.33 | 21.00 | 21.00 |
| Body text · ink on card | ≥ 7 : 1 | 16.17 | 13.84 | 21.00 | 19.69 |
| Body text · ink on textured page (worst point) | ≥ 7 : 1 | 12.09 | 13.51 | — | — |
| Secondary text · ink-2 on card | ≥ 7 : 1 | 9.80 | 9.88 | 17.03 | 17.17 |
| Current step · ink on step card | ≥ 7 : 1 | 14.84 | 12.51 | 19.31 | 16.43 |
| Button label · on accent | ≥ 7 : 1 | 13.19 | 9.33 | 17.03 | 14.30 |
| Accent text · on card | ≥ 7 : 1 | 13.19 | 9.58 | 17.03 | 14.37 |
| Bronze text · on card | ≥ 7 : 1 | 7.15 | 9.58 | 11.33 | 14.37 |
| Secondary accent text · on card | ≥ 7 : 1 | 7.15 | 9.58 | 11.33 | 14.37 |
| Approve / done text · on card | ≥ 7 : 1 | 7.52 | 9.04 | 11.58 | 14.03 |
| Control borders · on card | ≥ 4.5 : 1 | 5.76 | 5.47 | 17.03 | 16.55 |
| Focus ring · on page | ≥ 4.5 : 1 | 5.61 | 10.61 | 10.19 | 15.33 |
| Gold seam (decoration only) · on card | decoration | 2.79 | 7.67 | 5.31 | 13.40 |
| Season mark autumn · on card | ≥ 4.5 : 1 | 6.48 | 7.99 | 10.36 | 12.57 |
| Ink on ratio block (flour) | ≥ 7 : 1 | 11.78 | 8.01 | 17.04 | 12.18 |

**Jerusalem stone**

| Pair | Needs | Light | Dark | HC light | HC dark |
|---|---|---|---|---|---|
| Body text · ink on page | ≥ 7 : 1 | 14.13 | 15.08 | 19.20 | 21.00 |
| Body text · ink on card | ≥ 7 : 1 | 15.95 | 13.56 | 19.50 | 19.62 |
| Body text · ink on textured page (worst point) | ≥ 7 : 1 | 12.83 | 15.35 | — | — |
| Secondary text · ink-2 on card | ≥ 7 : 1 | 10.04 | 9.85 | 17.03 | 17.23 |
| Current step · ink on step card | ≥ 7 : 1 | 13.58 | 11.94 | 16.74 | 16.52 |
| Button label · on accent | ≥ 7 : 1 | 7.77 | 8.08 | 10.86 | 13.23 |
| Accent text · on card | ≥ 7 : 1 | 8.09 | 8.01 | 10.86 | 13.02 |
| Secondary accent text · on card | ≥ 7 : 1 | 8.38 | 9.62 | 11.52 | 14.28 |
| Approve / done text · on card | ≥ 7 : 1 | 7.34 | 9.54 | 11.41 | 14.65 |
| Control borders · on card | ≥ 4.5 : 1 | 5.87 | 5.52 | 17.03 | 16.48 |
| Focus ring · on page | ≥ 4.5 : 1 | 6.11 | 9.65 | 10.03 | 14.68 |
| Season mark autumn · on card | ≥ 4.5 : 1 | 6.71 | 7.89 | 10.46 | 12.80 |
| Ink on ratio block (flour) | ≥ 7 : 1 | 11.58 | 8.33 | 15.52 | 12.04 |

## Type

- **Atkinson Hyperlegible Next** (Latin) is the Braille Institute face for low vision. Its letterforms are clearly distinct (I l 1, 0 O, rn m), with open counters and generous spacing. It replaces Inter, which is compact and harder to read at a distance.
- **Noto Sans Hebrew** (Hebrew) has sturdy, open forms and clear ב/כ, ד/ר and ה/ח. It is also Android's system Hebrew font, so Hebrew recipes look the same even when Google Fonts can't load.
- The fallback stack is `system-ui, Roboto, Arial`. Every size is in rem, so the text-size control and the user's own browser setting both scale the whole UI.
- Body text is 18 px with line-height 1.6, letter-spacing .012em and word-spacing .06em. Step text is 20 px on a phone and 23 px on a laptop, with line-height 1.55. The smallest text is 16 px, and it is used only for badges and captions.

## Accessibility checklist (checked in Chromium at 360 px and 1280 px)

- [x] Body text is at least 7:1 in light and dark, and at least 10:1 in high contrast, for all three palettes (tables above). No grey text is used for anything the user has to read. ink-2 is at least 7:1 everywhere, including placeholders.
- [x] Large text and UI are at least 4.5:1: control borders, focus ring and season marks.
- [x] The **"Aa" Text & colours** sheet in the header has three text sizes (Normal 100%, Large 125%, Extra large 150%) that set the root font size. At 150% on a 360 px phone there is no horizontal scroll on any page, in light, dark or high contrast (verified with `scrollWidth`). Buttons and grids wrap: the view tiles go from 2×2 to one column, and the timer actions stack.
- [x] A **high-contrast** switch (`role="switch"`, with an On/Off word) sits next to the light/dark choice ("Like my phone", Light, Dark). The choice is remembered on the device, and pages still render without storage.
- [x] Every button, link and field is at least 48×48 px at Normal size, checked for every visible control. The focus ring is 3 px with a 3 px offset. Kintsugi adds a faint gold halo outside the bronze ring.
- [x] Colour is never the only signal:
  - Season is a colour, an icon and a word.
  - The current step has a "You are here" badge, a filled number, a border and `aria-current="step"`.
  - Finished steps say "✓ done".
  - The selected view tile has a ✓ badge.
  - Ratio blocks carry patterns (dotted, striped, lined) as well as colours and names, and their parts can be counted.
  - Diff rows use ≠, + and − next to the words.
  - "You have 3 of 5" uses ✓ and ? shapes next to the sentence.
- [x] Primary actions always have text labels next to their icons: Add recipe, Search, Show cups & spoons, Start timer, Pause, Stop, Approve, Decline, Keep original, Replace with new, Keep both.
- [x] The four recipe views are large labelled tiles, each with an icon, a name and a one-line description ("Cook step by step", "As written", "The proportions", "The original"). They are at least 68 px tall and follow the `tablist` pattern with arrow, Home and End keys.
- [x] **Timers:**
  - The countdown is 36 px and tabular, with Pause/Resume and Stop buttons that carry text labels.
  - A finished timer moves to the top of the tray and shows "Done!" and "Finished" with a bell. It gets a thick border, a striped bar and a pulse (the pulse is off under reduced motion).
  - It plays the rin chime, vibrates, prefixes the tab title with a ✓, and is announced through an assertive live region: "Soften leeks timer is done."
  - Its actions become "OK, dismiss" and "1 more minute".
- [x] `prefers-reduced-motion` turns off all animation and transitions. Pinch zoom is not blocked.
- [x] There are no console errors on any page or variant.
