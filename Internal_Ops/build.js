/**
 * build.js — PRISMHORN's js13kGames 2026 build, and its BYTE-BUDGET GATE.
 *
 * ⛔ THE RULE THIS ENFORCES, read off js13kgames.com/rules in-browser 2026-08-19:
 *      "Your game's code and assets must be zipped into a .zip archive with
 *       <= 13,312 bytes."   (13 x 1024)
 *      "The archive must contain an index.html file in the top level directory,
 *       and it must work in the browser once unzipped."
 *      Rule II: NO external resources. No CDN, no Google Fonts, no analytics.
 *      And: a PUBLIC GITHUB REPO OF READABLE, UNMANGLED SOURCE is a second,
 *      separate deliverable — they clone it into the js13kGames org.
 *
 * ⚠️ WHY THIS EXISTS BEFORE ANY GAME CODE. A byte budget you cannot measure is a
 *    byte budget you will blow, and you will discover it on deadline day. This
 *    script REFUSES to produce a build over the cap — it does not warn, it fails.
 *    It earned that on its first real run: the finished game came in at 15,099
 *    bytes, 113.4% of cap, and the gate refused it.
 *
 * ---------------------------------------------------------------------------
 * THE TWO DELIVERABLES, AND WHY THE ZIP IS PACKED
 * ---------------------------------------------------------------------------
 * `Product_Release/` is the readable source. It is what goes to the public
 * GitHub repo, unmangled, with every comment intact — that is what the rules
 * ask for and it is the honest artefact.
 *
 * The ZIP is that same code with comments and indentation removed. Nothing is
 * renamed, nothing is restructured, no expression is rewritten. NEWLINES ARE
 * KEPT, so automatic-semicolon-insertion cannot change meaning — which is the
 * one way a naive "minifier" silently breaks a game between the last playtest
 * and the judge's browser.
 *
 * ⚠️ AND THE PACKER IS NOT TRUSTED, IT IS CHECKED. Three ways, because a
 *    transform that quietly eats a string literal produces a file that still
 *    parses and no longer works — the exact shape of master CLAUDE.md §2b:
 *      1. the packed output must PARSE (`new Function`);
 *      2. every string literal in the original must still be present, verbatim,
 *         in the packed output (tokenised from the original, not regexed);
 *      3. `--self-test` feeds it adversarial input — a `//` inside a string, a
 *         `/*` inside a string, a comment that documents a banned call — and
 *         asserts both directions.
 *    The FOURTH check lives in playtest.js, which drives the EXTRACTED ZIP
 *    rather than the working tree (§2b rule 1c: a local fix is not a shipped
 *    fix).
 *
 *   node Wings/GamesLite/Projects/Prismhorn/Internal_Ops/build.js
 *   node Wings/GamesLite/Projects/Prismhorn/Internal_Ops/build.js --raw
 *   node Wings/GamesLite/Projects/Prismhorn/Internal_Ops/build.js --self-test
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'Product_Release');
const DIST = path.join(ROOT, 'Internal_Ops', 'dist');
const PACK = path.join(DIST, 'pack');
const ZIP = path.join(DIST, 'prismhorn.zip');

/* The one number the whole competition turns on. 13 * 1024, not 13 * 1000 —
   the rules footnote is explicit: "yes, you are technically correct, those are
   kibibytes (KiB)". */
const LIMIT = 13 * 1024;   // 13,312

/* ⛔ THIS REQUIRE USED TO REACH FIVE DIRECTORIES UP INTO THE FACTORY'S SHARED
   `Kernel/publishing/package_mz.js`, AND THAT MADE THE PUBLIC REPO UNBUILDABLE.
   js13kgames.com/rules, read in-browser 2026-08-22, verbatim: "Your repository
   should contain the entire source code needed to actually build your game —
   not just an unzipped version of it." A clone of the source repo had no
   `Kernel/` in it, so this line threw MODULE_NOT_FOUND and the build a judge
   ran did not run at all. `./zip.js` is the same code, vendored beside the
   thing that uses it. See that file's header for why it is unconditional
   rather than a fallback. */
const { writeZip, zipEntries } = require(path.join(__dirname, 'zip.js'));

/* The Readme and the LICENCE are excluded DELIBERATELY, and the reason is not
   "they cost bytes" — it is that the 13,312-byte cap is a rule about the JAM
   PACKAGE, and neither document belongs inside it. js13kGames asks for a zip
   that is playable from an unzip; it separately asks for a PUBLIC GITHUB REPO
   of unmangled source, and that repo is where a licence is actually read. The
   itch build is pushed from `Product_Release` itself, so a player who
   downloads it gets both files. Nothing loses its licence by this; the
   licence simply does not travel inside a 13KB playable. */
const EXCLUDE = [/^dist[\\/]/i, /\.DS_Store$/i, /Thumbs\.db$/i, /^store_assets[\\/]/i,
  /^LICENSE\.txt$/i, /^Readme_for_Users\.md$/i];

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, out);
    else out.push(path.relative(base, abs));
  }
  return out;
}

/* =========================================================================
   THE PACKER
   =========================================================================
   A hand-written tokeniser, because the only way to strip comments without
   eating a string is to know which one you are looking at. It returns both the
   stripped text AND the list of string literals it saw, so the caller can prove
   nothing was lost.

   ⚠️ It REFUSES rather than guesses on the two constructs it does not model:
   a regular-expression literal (the classic `/` ambiguity) and a template
   literal that spans a newline (whose leading whitespace is significant).
   PRISMHORN contains neither, and if a future edit introduces one the build
   stops instead of shipping something subtly different. */
function tokenise(src) {
  let out = '', i = 0;
  const n = src.length;
  const strings = [];
  const problems = [];

  const prevSignificant = () => {
    for (let k = out.length - 1; k >= 0; k--) {
      const c = out[k];
      if (c === ' ' || c === '\t' || c === '\n') continue;
      return c;
    }
    return '';
  };

  while (i < n) {
    const c = src[i], d = src[i + 1];

    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    if (c === '/') {
      /* Division or a regex literal? A regex may only START where a value may
         start. If the previous significant character allows one, we cannot tell
         cheaply — so refuse rather than corrupt. */
      const p = prevSignificant();
      if (p === '' || '(,=:[!&|?{};+-*%~^<>'.includes(p)) {
        problems.push('a possible REGEX LITERAL at offset ' + i +
          ' — the packer does not model regex literals; rewrite it or extend the packer');
      }
      out += c; i++; continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      const q = c; const start = i;
      out += c; i++;
      let closed = false;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + src[i + 1]; i += 2; continue; }
        if (src[i] === '\n' && q !== '`') {
          problems.push('unterminated string literal at offset ' + start);
          break;
        }
        if (src[i] === '\n' && q === '`') {
          problems.push('a MULTI-LINE TEMPLATE LITERAL at offset ' + start +
            ' — its leading whitespace is significant and the packer would eat it');
        }
        out += src[i];
        if (src[i] === q) { i++; closed = true; break; }
        i++;
      }
      if (!closed && i >= n) problems.push('unterminated string literal at offset ' + start);
      strings.push(src.slice(start, i));
      continue;
    }

    out += c; i++;
  }
  return { text: out, strings, problems };
}

/** Strip comments and per-line indentation; keep newlines (ASI stays safe). */
function packJs(src) {
  const tk = tokenise(src);
  const lines = tk.text.split('\n').map((l) => l.replace(/[ \t]+$/, '').replace(/^[ \t]+/, ''));
  const text = lines.filter((l) => l.length).join('\n') + '\n';
  return { text, strings: tk.strings, problems: tk.problems };
}

/** HTML: drop comments and the whitespace BETWEEN tags only. */
function packHtml(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')          // CSS comments inside <style>
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n') + '\n';
}

/** Prove the packed JS did not lose anything that matters. */
function verifyPack(original, packed) {
  const problems = [];
  try { new Function(packed); }
  catch (e) { problems.push('PACKED OUTPUT DOES NOT PARSE: ' + e.message); }

  const before = tokenise(original).strings;
  for (const s of before) {
    if (!packed.includes(s)) {
      problems.push('string literal LOST by the packer: ' + s.slice(0, 60));
    }
  }
  return problems;
}

/* =========================================================================
   MEASURE
   ========================================================================= */
function measure(srcDir, zipPath) {
  const files = walk(srcDir).filter((f) => !EXCLUDE.some((re) => re.test(f))).sort();
  const problems = [];

  if (!files.includes('index.html')) {
    problems.push('index.html is NOT at the top level of the package — the rules require it there');
  }

  const entries = files.map((f) => ({
    abs: path.join(srcDir, f),
    name: f.split(path.sep).join('/'),        // forward slashes, always
  }));

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  writeZip(zipPath, entries);

  const stored = zipEntries(zipPath);
  for (const n of stored) {
    if (n.includes('\\')) problems.push('BACKSLASH in stored entry name: ' + n);
  }
  if (stored.length !== entries.length) {
    problems.push(`entry count mismatch: sent ${entries.length}, archive holds ${stored.length}`);
  }

  const bytes = fs.statSync(zipPath).size;
  const raw = entries.map((e) => ({ name: e.name, bytes: fs.statSync(e.abs).size }))
    .sort((a, b) => b.bytes - a.bytes);

  return { bytes, limit: LIMIT, over: bytes > LIMIT, files: raw, stored, problems };
}

/* --- Rule II: nothing may reach outside the package ---------------------- */
const EXTERNAL = [
  [/<script[^>]+src\s*=\s*["']https?:/i, 'external <script src>'],
  [/<link[^>]+href\s*=\s*["']https?:/i, 'external <link href>'],
  [/@import\s+url\(\s*["']?https?:/i, 'CSS @import of a remote URL'],
  [/fonts\.googleapis\.com|fonts\.gstatic\.com/i, 'Google Fonts'],
  [/google-analytics\.com|googletagmanager\.com|plausible\.io|matomo/i, 'analytics/tracking'],
  [/\bfetch\s*\(\s*["']https?:/i, 'runtime fetch() of a remote URL'],
  [/\bnew\s+WebSocket\s*\(\s*["']wss?:/i, 'outbound WebSocket'],
];

/**
 * Strip comments before scanning.
 *
 * ⚠️ WRITTEN IN RESPONSE TO A REAL FALSE RED, first run of this gate, 2026-08-19.
 *    `g.js` documents its own compliance in a header comment — "localStorage.clear()
 *    is never called" — and the naive scan matched that COMMENT and refused the
 *    build. Master CLAUDE.md §2b: a false RED costs exactly as much as a false
 *    green, and a gate that cries wolf on its own documentation is one a future
 *    session will disable rather than debug.
 */
function stripComments(text, rel) {
  let s = text;
  if (/\.html?$/i.test(rel)) s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  return s;
}

/** localStorage.clear() is BANNED by the rules — every entry shares one origin. */
function checkSource(srcDir) {
  const found = [];
  for (const rel of walk(srcDir).filter((f) => /\.(html|js|css)$/i.test(f))) {
    const raw = fs.readFileSync(path.join(srcDir, rel), 'utf8');
    const text = stripComments(raw, rel);
    for (const [re, why] of EXTERNAL) {
      if (re.test(text)) found.push(`${rel}: ${why} — Rule II forbids external resources`);
    }
    if (/localStorage\s*\.\s*clear\s*\(/.test(text)) {
      found.push(`${rel}: localStorage.clear() is BANNED — it would wipe every other entry's saves`);
    }
  }
  return found;
}

/* --- self-test: prove the gate can go RED, not only green ---------------- */
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prismhorn-selftest-'));
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name); }
  };

  // (a) an over-budget payload MUST be rejected. Random bytes so it cannot compress.
  const big = path.join(tmp, 'big');
  fs.mkdirSync(big, { recursive: true });
  fs.writeFileSync(path.join(big, 'index.html'), '<!doctype html><title>x</title>');
  fs.writeFileSync(path.join(big, 'blob.bin'), require('node:crypto').randomBytes(40 * 1024));
  const over = measure(big, path.join(tmp, 'over.zip'));
  check('over-budget payload is detected as OVER  (' + over.bytes + ' > ' + LIMIT + ')', over.over === true);

  // (b) a small payload MUST pass.
  const small = path.join(tmp, 'small');
  fs.mkdirSync(small, { recursive: true });
  fs.writeFileSync(path.join(small, 'index.html'), '<!doctype html><title>ok</title>');
  const under = measure(small, path.join(tmp, 'under.zip'));
  check('small payload is UNDER budget            (' + under.bytes + ' <= ' + LIMIT + ')', under.over === false);

  // (c) a package with no top-level index.html MUST be rejected.
  const nested = path.join(tmp, 'nested', 'game');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'index.html'), '<!doctype html>');
  const bad = measure(path.join(tmp, 'nested'), path.join(tmp, 'bad.zip'));
  check('missing top-level index.html is rejected', bad.problems.some((p) => /index\.html is NOT/.test(p)));

  // (d) Rule II violations MUST be caught, one probe per class.
  const ext = path.join(tmp, 'ext');
  fs.mkdirSync(ext, { recursive: true });
  fs.writeFileSync(path.join(ext, 'index.html'),
    '<script src="https://cdn.example.com/x.js"></script>');
  fs.writeFileSync(path.join(ext, 'g.js'), 'localStorage.clear()');
  const viol = checkSource(ext);
  check('external <script src> is caught', viol.some((v) => /external <script src>/.test(v)));
  check('localStorage.clear() is caught', viol.some((v) => /localStorage\.clear/.test(v)));

  // (e) and a clean source must produce NO findings.
  const clean = path.join(tmp, 'clean');
  fs.mkdirSync(clean, { recursive: true });
  fs.writeFileSync(path.join(clean, 'index.html'), '<!doctype html><script src="g.js"></script>');
  fs.writeFileSync(path.join(clean, 'g.js'), 'localStorage.setItem("ph.save","1")');
  check('clean source produces zero findings', checkSource(clean).length === 0);

  // (f) THE FALSE-RED REGRESSION.
  const cmt = path.join(tmp, 'cmt');
  fs.mkdirSync(cmt, { recursive: true });
  fs.writeFileSync(path.join(cmt, 'index.html'),
    '<!doctype html><!-- no https://cdn.example.com here, honest --><script src="g.js"></script>');
  fs.writeFileSync(path.join(cmt, 'g.js'),
    '/* localStorage.clear() is never called — js13k entries share an origin. */\n' +
    '// we also never load https://fonts.googleapis.com\n' +
    'localStorage.setItem("ph.save","1")');
  check('a COMMENT mentioning localStorage.clear() does NOT trip the gate',
    checkSource(cmt).length === 0);

  // (g) ...while a REAL call still does, even next to that comment.
  const both = path.join(tmp, 'both');
  fs.mkdirSync(both, { recursive: true });
  fs.writeFileSync(path.join(both, 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(both, 'g.js'),
    '/* localStorage.clear() is never called */\nlocalStorage.clear();');
  check('a REAL localStorage.clear() next to that comment IS still caught',
    checkSource(both).some((v) => /localStorage\.clear/.test(v)));

  /* ---- THE PACKER. Every one of these is a way to ship a broken game. ---- */
  const p1 = packJs('const a = "http://x//y"; // a real comment\nconst b = 1;\n');
  check('packer keeps a // that lives INSIDE a string',
    p1.text.includes('"http://x//y"') && !p1.text.includes('a real comment'));

  const p2 = packJs("const s = '/* not a comment */'; /* this one is */\nlet z=2;\n");
  check('packer keeps a /* */ that lives INSIDE a string',
    p2.text.includes("'/* not a comment */'") && !p2.text.includes('this one is'));

  const p3 = packJs('const t = `hsla(${h},92%,${l}%,.5)`;\n');
  check('packer keeps a template literal intact', p3.text.includes('`hsla(${h},92%,${l}%,.5)`'));

  const p4 = packJs('  let a = 1\n  let b = 2\n');
  check('packer keeps NEWLINES so ASI cannot change meaning',
    p4.text === 'let a = 1\nlet b = 2\n');

  check('packer REFUSES a regex literal rather than guessing',
    packJs('const r = /ab+c/;\n').problems.some((p) => /REGEX/.test(p)));

  check('packer REFUSES a multi-line template literal',
    packJs('const t = `line one\nline two`;\n').problems.some((p) => /MULTI-LINE/.test(p)));

  // (h) the verifier must NOTICE a packer that ate a string.
  const orig = 'const a = "keep me";\nconst b = 2;\n';
  check('verifier catches a LOST string literal',
    verifyPack(orig, 'const a = "";\nconst b = 2;\n').some((p) => /LOST/.test(p)));
  check('verifier catches output that does not parse',
    verifyPack('let a=1;\n', 'let a=(;\n').some((p) => /DOES NOT PARSE/.test(p)));
  check('verifier passes a faithful pack', verifyPack(orig, packJs(orig).text).length === 0);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n  self-test: ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
}

/* --- main ---------------------------------------------------------------- */
if (process.argv.includes('--self-test')) {
  console.log('build.js self-test — proving the gate fires in BOTH directions\n');
  selfTest();
} else if (!fs.existsSync(SRC)) {
  console.error('FATAL: no Product_Release at ' + SRC);
  process.exitCode = 1;
} else {
  const packing = !process.argv.includes('--raw');
  const problems = [];

  /* Build the packed tree the zip is made from. */
  fs.rmSync(PACK, { recursive: true, force: true });
  fs.mkdirSync(PACK, { recursive: true });
  let rawTotal = 0, packTotal = 0;
  for (const rel of walk(SRC).filter((f) => !EXCLUDE.some((re) => re.test(f)))) {
    const raw = fs.readFileSync(path.join(SRC, rel), 'utf8');
    rawTotal += Buffer.byteLength(raw);
    let outText = raw;
    if (packing && /\.js$/i.test(rel)) {
      const r = packJs(raw);
      problems.push(...r.problems.map((p) => rel + ': ' + p));
      problems.push(...verifyPack(raw, r.text).map((p) => rel + ': ' + p));
      outText = r.text;
    } else if (packing && /\.html?$/i.test(rel)) {
      outText = packHtml(raw);
    }
    packTotal += Buffer.byteLength(outText);
    const dst = path.join(PACK, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, outText);
  }

  const r = measure(PACK, ZIP);
  problems.push(...r.problems, ...checkSource(SRC));

  const pct = ((r.bytes / LIMIT) * 100).toFixed(1);
  console.log('PRISMHORN — js13kGames 2026 build' + (packing ? '' : '   [--raw: unpacked source]') + '\n');
  console.log('  budget   ' + r.bytes.toLocaleString() + ' / ' + LIMIT.toLocaleString() +
    ' bytes zipped   (' + pct + '% used, ' + (LIMIT - r.bytes).toLocaleString() + ' free)');
  console.log('  entries  ' + r.stored.length);
  if (packing) {
    console.log('  source   ' + rawTotal.toLocaleString() + ' B readable  ->  ' +
      packTotal.toLocaleString() + ' B packed   (comments and indentation only; ' +
      'no renaming, newlines kept)');
  }
  console.log('');
  console.log('  packed bytes per file, largest first — this is where the budget goes:');
  for (const f of r.files) console.log('    ' + String(f.bytes).padStart(7) + '  ' + f.name);

  if (r.over) {
    problems.push('OVER BUDGET by ' + (r.bytes - LIMIT).toLocaleString() +
      ' bytes — js13k would reject this archive');
  }

  if (problems.length) {
    console.log('\n  BUILD REFUSED:');
    for (const p of problems) console.log('    · ' + p);
    process.exitCode = 1;
  } else {
    console.log('\n  ' + ZIP);
    console.log('  OK — under the 13,312-byte cap, index.html at the top level, no external');
    console.log('  resources, no localStorage.clear(). Verified from the archive\'s own');
    console.log('  central directory, not from the file list we sent. The packed JS was');
    console.log('  parse-checked and every string literal in the source was confirmed');
    console.log('  present in the output.');
    console.log('\n  NEXT: node Internal_Ops/playtest.js  — it drives the EXTRACTED ZIP,');
    console.log('  not the working tree, because a local fix is not a shipped fix.');
  }

  /* ---- evidence block, for a consumer that EXISTS ------------------------- */
  /* For a js13k entry the SIZE GATE *is* the engine gate: there is no compiler,
     and the one thing that can reject the submission outright is the byte
     count. So it emits the same block `Kernel/state/record_gate.js` consumes,
     including the verdict as a REAL BOOLEAN — that recorder's own header
     records every `evidence.gate` block in the factory once carrying
     `ok: undefined`, so preflight could only test that three strings existed.

     `compiled` is the work count (§2b rule 2): entries actually read back out
     of the archive's central directory, and the packed byte total. A gate that
     packed nothing would report zero here rather than a cheerful verdict. */
  const gate = {
    ok: problems.length === 0 && !r.over,
    command: 'node Wings/GamesLite/Projects/Prismhorn/Internal_Ops/build.js',
    result: problems.length === 0 && !r.over
      ? 'PASS — ' + r.bytes.toLocaleString() + ' / ' + LIMIT.toLocaleString()
        + ' bytes zipped (' + pct + '%, ' + (LIMIT - r.bytes).toLocaleString() + ' free)'
      : 'NOT CLEAN — ' + problems.join(' | '),
    at: new Date().toISOString(),
    exitCode: problems.length ? 1 : 0,
    errorCount: problems.length,
    warningCount: 0,
    compiled: { archiveEntries: r.stored.length, packedBytes: r.bytes, limitBytes: LIMIT },
    firstErrors: problems.slice(0, 5),
    firstWarnings: [],
    note: 'The SIZE gate is the engine gate for a js13k entry — verified from the archive\'s own '
      + 'central directory, not from the file list handed to the zipper.',
  };
  const gp = path.join(__dirname, 'gate.json');
  fs.writeFileSync(gp, JSON.stringify(gate, null, 2));
  console.log('\n  evidence   ' + gp);
  console.log('  record it  node Kernel/state/record_gate.js gameslite js13k-2026-entry --file "' + gp + '"');
}

module.exports = { packJs, packHtml, verifyPack, LIMIT, PACK, ZIP };
