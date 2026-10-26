/* Word Count — all counting happens locally. */
(function () {
  "use strict";
  var $ = S3.$;

  var READ_WPM = 238, SPEAK_WPM = 150; // average adult silent reading / presentation pace
  // A word starts with a letter or digit; keeps marks (tashkeel), tatweel, inner apostrophes/hyphens, and 3.14 / 1,000.
  var WORD = /[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}ـ_]|['’\-](?=[\p{L}\p{N}])|(?<=\p{N})[.,](?=\p{N}))*/gu;
  var HAS_WORD = new RegExp(WORD.source, "u");
  var TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]/g;

  var STOP = new Set((
    "a about above after again against all am an and any are aren't as at be because been before being below between both but by " +
    "can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't " +
    "have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is " +
    "isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves " +
    "out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves " +
    "then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd " +
    "we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will with won't would " +
    "wouldn't you you'd you'll you're you've your yours yourself yourselves also just can will may might us get got one two like " +
    "في من على علي إلى الى عن مع هذا هذه ذلك تلك هؤلاء التي الذي الذين اللذين اللتين اللاتي أن ان إن لأن كان كانت يكون تكون كانوا " +
    "لا ما لم لن قد لقد و أو او ثم هو هي هم هن نحن أنا انا أنت انت أنتم كل بعض عند بين حتى إذا اذا لكن ولكن بل غير سوى منذ خلال " +
    "عليه عليها عليهم فيه فيها فيهم منه منها منهم به بها بهم له لها لهم إليه اليه إليها كما أي اي أيضا ايضا هناك هنا وقد وهو وهي " +
    "ولا وما وفي ومن وعلى وإلى وأن وان التى الذى فى أى يا ثم إلا الا كيف متى أين اين لماذا ماذا قبل بعد فوق تحت عندما حيث"
  ).split(/\s+/));

  function words(text) { return text.match(WORD) || []; }

  var graphemer = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  function charCount(s) {
    if (!s) return 0;
    if (!graphemer) return Array.from(s).length;
    var n = 0, it = graphemer.segment(s)[Symbol.iterator]();
    while (!it.next().done) n++;
    return n;
  }

  function normalize(w) { return w.replace(TASHKEEL, "").replace(/’/g, "'").toLocaleLowerCase(); }

  function analyze(text) {
    var ws = words(text);
    var sentences = text.split(/[.!?؟۔…]+(?=\s|$|["'”’)\]])|\n\s*\n/).filter(function (s) { return HAS_WORD.test(s); }).length;
    var paragraphs = text.split(/\n/).filter(function (l) { return /\S/.test(l); }).length;
    var lines = text ? text.split("\n").length : 0;
    var uniq = new Set(ws.map(normalize));
    var letters = ws.reduce(function (s, w) { return s + charCount(w.replace(TASHKEEL, "")); }, 0);
    var longest = ws.reduce(function (a, w) { return charCount(w) > charCount(a) ? w : a; }, "");
    return {
      words: ws.length, chars: charCount(text), charsNoSpaces: charCount(text.replace(/\s+/g, "")),
      sentences: sentences, paragraphs: paragraphs, lines: lines, unique: uniq.size,
      avgWord: ws.length ? letters / ws.length : 0, longest: longest,
      readSec: Math.round(ws.length / READ_WPM * 60), speakSec: Math.round(ws.length / SPEAK_WPM * 60)
    };
  }

  function keywords(text, includeStop, limit) {
    var ws = words(text), total = ws.length, map = new Map();
    ws.forEach(function (w) {
      var k = normalize(w);
      if (/^\p{N}+$/u.test(k) || Array.from(k).length < 2) return;
      if (!includeStop && (STOP.has(k) || STOP.has(k.replace(/^[وف](?=.{3,})/, "")))) return;
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map, function (e) { return { word: e[0], count: e[1], density: total ? e[1] / total * 100 : 0 }; })
      .sort(function (a, b) { return b.count - a.count || (a.word < b.word ? -1 : 1); }).slice(0, limit || 12);
  }

  function dur(sec) {
    if (!sec) return "0 sec";
    if (sec < 60) return sec + " sec";
    var m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return m + " min" + (s ? " " + s + " sec" : "");
    return Math.floor(m / 60) + " h " + (m % 60) + " min";
  }

  // ---------- UI ----------
  var input = $("#input"), statsEl = $("#stats"), kwEl = $("#kw"), more = $("#more"), stop = $("#stop");
  stop.checked = !!S3.store("wc.stop");
  function stat(label, value) { return '<div class="stat"><b>' + S3.esc(value) + "</b><span>" + S3.esc(label) + "</span></div>"; }

  function render() {
    var t = input.value, a = analyze(t);
    statsEl.innerHTML = stat("words", a.words.toLocaleString()) + stat("characters", a.chars.toLocaleString()) +
      stat("without spaces", a.charsNoSpaces.toLocaleString()) + stat("sentences", a.sentences.toLocaleString()) +
      stat("paragraphs", a.paragraphs.toLocaleString()) + stat("reading time", dur(a.readSec)) + stat("speaking time", dur(a.speakSec));
    more.innerHTML = "";
    if (a.words) {
      [["Unique words", a.unique.toLocaleString()], ["Avg word length", a.avgWord.toFixed(1) + " letters"], ["Lines", a.lines.toLocaleString()], ["Longest word", a.longest]]
        .forEach(function (p) { more.appendChild(S3.h("span", { "class": "chip" }, [p[0] + ": ", S3.h("b", { dir: "auto", text: p[1] })])); });
    }
    var list = keywords(t, stop.checked, 12);
    kwEl.innerHTML = "";
    if (!list.length) {
      kwEl.appendChild(S3.h("div", { "class": "empty" }, [S3.h("b", { text: "No keywords yet" }), "Your most-used words appear here, with how often they appear."]));
      return;
    }
    var max = list[0].count, ol = S3.h("ol", { "class": "wc-kw" });
    list.forEach(function (k) {
      var li = S3.h("li", { style: "--w:" + (k.count / max * 100).toFixed(1) + "%" }, [
        S3.h("span", { "class": "w", dir: "auto", title: k.word, text: k.word }),
        S3.h("span", { "class": "n", text: "×" + k.count }),
        S3.h("span", { "class": "d", text: k.density.toFixed(1) + "%" })
      ]);
      ol.appendChild(li);
    });
    kwEl.appendChild(ol);
  }

  var save = S3.debounce(function () { S3.store("wc.text", input.value || undefined); }, 400);
  input.addEventListener("input", function () { render(); save(); });
  stop.addEventListener("change", function () { S3.store("wc.stop", stop.checked); render(); });
  $("#clear").addEventListener("click", function () { input.value = ""; S3.store("wc.text", undefined); render(); input.focus(); });
  $("#copy").addEventListener("click", function () {
    if (!input.value) { S3.toast("Nothing to copy yet", "error"); return; }
    S3.copy(input.value); S3.done();
  });
  $("#open input").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    S3.readFile(f, "text").then(function (t) { input.value = t; render(); save(); S3.done(); });
    e.target.value = "";
  });
  input.addEventListener("dragover", function (e) { e.preventDefault(); });
  input.addEventListener("drop", function (e) {
    var f = e.dataTransfer.files[0]; if (!f) return;
    e.preventDefault(); S3.readFile(f, "text").then(function (t) { input.value = t; render(); save(); });
  });

  input.value = S3.store("wc.text") || "";
  render();

  window.S3_DEMO = function () {
    input.value = "Writing for the web is different from writing for print. Readers scan before they read, so short paragraphs, clear headings and plain words help them find what they need.\n\n" +
      "A good word counter does more than count words. It shows how long your text takes to read, which words you lean on most, and whether your sentences run long.\n\n" +
      "الكتابة للويب تختلف عن الكتابة للورق. القارئ يتصفح النص قبل أن يقرأه، لذلك تساعده الفقرات القصيرة والعناوين الواضحة على الوصول إلى ما يريد.";
    render();
  };

  window.S3_SELFTEST = function () {
    var a = analyze("Hello world. This is a test! Is it?\n\nNew paragraph here.");
    var ok1 = a.words === 11 && a.sentences === 4 && a.paragraphs === 2 && a.lines === 3;
    var b = analyze("مَرْحَبًا بِالعالم. كيف حالك؟ جيد");
    var ok2 = b.words === 5 && b.sentences === 3;
    var ok3 = words("don't stop well-known 3.14 1,000 end.Next").length === 7; // "end" and "Next" split at a bare period
    var ok4 = analyze("a b").chars === 3 && analyze("a b").charsNoSpaces === 2 && analyze("").words === 0 && analyze("").sentences === 0;
    var ok5 = !graphemer || charCount("👍🏽é") === 2;
    var k = keywords("The cat and the cat and the dog", false);
    var ok6 = k[0].word === "cat" && k[0].count === 2 && Math.abs(k[0].density - 25) < 1e-9 && !k.some(function (x) { return x.word === "the"; });
    var ka = keywords("مَرْحَبًا مرحبا في البيت", false);
    var ok7 = ka[0].word === "مرحبا" && ka[0].count === 2 && !ka.some(function (x) { return x.word === "في"; });
    var ok8 = analyze(new Array(239).join("word ")).readSec === 60;
    return ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8;
  };
})();
