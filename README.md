# PRISMHORN

**A 13KB browser game for [js13kGames 2026](https://js13kgames.com/). Theme: *Unicorns and Rainbows*.**

> You never cast a spell — you cast a **rainbow**. Seven bands leave your horn at once,
> and you aim all of them or none.

**▶ Play it in your browser: <https://csaf.itch.io/prismhorn>**

The whole game is two files and **11,274 zipped bytes**. No images, no audio files, no
libraries, no CDN, no network calls. Every pixel is drawn at runtime and every sound is
synthesised at runtime.

---

## The idea

Most "aim a spell" games give you one beam and let you point it. PRISMHORN gives you a
**fan of seven coloured bands at fixed angles**, and turning your head turns all seven at
once. Each band is a different verb:

| band | verb | says |
| --- | --- | --- |
| red | **UNMAKE** | dissolves the made |
| orange | **FORGE** | hardens into matter |
| yellow | **WAKE** | animates the dormant |
| green | **GROW** | accelerates living things |
| blue | **CHILL** | slows and stills |
| indigo | **SCRY** | reveals what is hidden |
| violet | **MEND** | restores what it touches |

**The trap is in that table.** GROW ripens the blooms that pay you — and it feeds the
blight standing beside them just as happily, making it bigger, tougher and faster. MEND
heals your cairns and whatever is eating them. FORGE hardens your ground and armours the
thing standing on it. You cannot fire one band. That is the game.

Spectral order is **fixed**: a band always leaves the horn from its own slot whether or
not you have unlocked it. You start with three — UNMAKE, GROW and CHILL — so the gaps in
the comb are visible from the first second, and unlocking one changes geometry you have
already learned instead of just adding a number.

`SPACE` **flares** (extends every band while held, paid out of vigour) and `Q`/`E` narrow
and widen the fan. Those are the only two things you control about the shape.

Dying does not reset you. You keep your light and your unlocked bands and return to
**THE PRISM** to spend them.

## Controls

`WASD` / arrows walk · `Q` narrow ‹ › `E` widen the fan · `SPACE` flare ·
`ENTER` walk in · `1`–`6` at the Prism spend Light

The run saves to `localStorage` under keys namespaced `ph.`, and `localStorage.clear()`
is never called — a js13k rule, because every entry shares one origin and clearing it
would wipe other people's saves.

## Build it

Node 18+ is the only requirement. There are **no dependencies** — nothing to `npm install`.

```sh
node Internal_Ops/build.js              # writes Internal_Ops/dist/prismhorn.zip
node Internal_Ops/build.js --self-test  # 17 checks that the gate fires in BOTH directions
```

The build **refuses** to produce an over-budget archive rather than warning about one.
It earned that on its first real run: the finished game came in at 15,099 bytes, 113.4%
of cap, and the gate rejected it.

It also checks the things that fail silently:

- the packed JS must **parse** (`new Function`);
- **every string literal** in the readable source must still be present, verbatim, in the
  packed output — tokenised from the original, not regexed;
- the byte count is read from the **archive's own central directory**, never from the file
  list handed to the zipper;
- `index.html` must be at the **top level**, there must be no external `<script src>`, and
  no `localStorage.clear()` (it is banned — all entries share one origin, so clearing it
  would wipe every other entrant's saves).

## What "packed" means here

`Product_Release/` is the readable source. The zip is that same code with **comments and
indentation removed and nothing else**. Nothing is renamed, no expression is rewritten,
and **newlines are kept** so automatic semicolon insertion cannot change meaning — which
is the one way a naive minifier silently breaks a game between the last playtest and the
judge's browser.

```
readable source   53,984 B
packed            34,282 B     (63.5% — comments and indentation only)
zipped            11,274 B     of 13,312 (84.7%, 2,038 free)
```

## Files

```
Product_Release/          the readable, unmangled source — this is the game
  index.html                canvas, styles, and nothing else
  g.js                      the entire game, commented
  LICENSE.txt               MIT, plus the asset provenance statement
  Readme_for_Users.md       player-facing notes
Internal_Ops/             the build
  build.js                  the packer and the byte-budget gate
  zip.js                    a dependency-free zip writer and directory reader
```

## Testing

The behaviour suite drives the **extracted zip**, not the working tree — a local fix is
not a shipped fix. It runs 41 checks including that GROW really does make the blight
bigger (the design's central claim, measured rather than asserted), that a reload resumes
a run, that a locked band has no effect, and that the console is clean. It needs
Playwright, which is why it is not in this repository; the assertions it makes are
described above and in the source comments.

## Honesty note

This game was built by an AI-assisted pipeline: the code, the procedural art and the
in-game text were AI-written and then reviewed, tested and edited. It is disclosed the
same way on the itch.io listing. js13kGames has no rule on the subject either way — this
note is here because claiming otherwise would be dishonest, not because a form asked.

Everything in the package is original work owned by the publisher, and no third-party
asset, font or library is embedded or fetched. See `Product_Release/LICENSE.txt`.

## Licence

MIT — © 2026 Core Systems Asset Factory. See `LICENSE.txt`.
