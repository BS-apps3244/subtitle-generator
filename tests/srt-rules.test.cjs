const assert = require("assert");
const {
  buildKeepTogetherPhrases,
  buildSrtFromUtterances,
  postProcessSrtText,
  applySrtRules,
  defaultSettings
} = require("../src/main.cjs");

const subtitleDefaults = {
  ...defaultSettings.subtitleDefaults,
  minimum_duration: 0.4,
  target_duration: 0.9,
  maximum_duration: 1.6,
  caption_gap: 0,
  split_on_silence_gap: 0.35,
  maximum_characters_per_row: 28,
  maximum_rows_per_caption: 2
};

function wordsFromText(text, step = 0.25) {
  return text.split(/\s+/).map((word, index) => ({
    punctuated_word: word,
    start: Number((index * step).toFixed(2)),
    end: Number(((index * step) + 0.18).toFixed(2))
  }));
}

function buildSrt(text, extraPayload = {}) {
  const keepTogetherPhrases = buildKeepTogetherPhrases({
    vocabulary: [],
    spellingRules: [],
    ...extraPayload
  });
  return postProcessSrtText(
    buildSrtFromUtterances([{ words: wordsFromText(text) }], subtitleDefaults, keepTogetherPhrases),
    keepTogetherPhrases
  );
}

function parseTimes(srt) {
  return srt.trim().split(/\n\s*\n/).map((block) => {
    const timing = block.split(/\r?\n/)[1];
    return timing.split("-->").map((part) => part.trim());
  });
}

function cueTexts(srt) {
  return srt.trim().split(/\n\s*\n/).map((block) => block.split(/\r?\n/).slice(2).join(" "));
}

function assertNoPeriods(srt) {
  assert(!srt.includes("."), `Expected no periods in SRT:\n${srt}`);
}

function assertNoCaptionEndsWithPunctuation(srt) {
  cueTexts(srt).forEach((text) => {
    assert(!/[.,]$/.test(text), `Caption ends with forbidden punctuation: ${text}`);
  });
}

function assertNoSingleWordCaptions(srt) {
  cueTexts(srt).forEach((text) => {
    const words = text.split(/\s+/).filter(Boolean);
    assert(words.length !== 1, `Single-word caption found: ${text}`);
  });
}

function assertNoMixedSentenceBoundary(srt) {
  cueTexts(srt).forEach((text) => {
    assert(!/[.!?]\s+[A-Z0-9]/.test(text), `Sentence boundary mixed inside one caption: ${text}`);
  });
}

{
  const srt = buildSrt("This workflow kept every edit clear. Maya was considered the best presenter.");
  assertNoPeriods(srt);
  assertNoCaptionEndsWithPunctuation(srt);
  assertNoSingleWordCaptions(srt);
  assertNoMixedSentenceBoundary(srt);
}

{
  const srt = buildSrt("This workflow kept every edit clear, for 5,000 years.");
  assertNoCaptionEndsWithPunctuation(srt);
  assertNoSingleWordCaptions(srt);
}

{
  const srt = buildSrt("Finding the right video file can make every project easier to review.");
  cueTexts(srt).forEach((text) => {
    assert(!/\bvideo$/.test(text), `Protected phrase split after video: ${text}`);
    assert(!/^file\b/.test(text), `Protected phrase split before file: ${text}`);
  });
}

{
  const srt = buildSrt("The product was made for 5,000 years and became a custom dictionary rule.");
  cueTexts(srt).forEach((text) => {
    assert(!/\b5,000$/.test(text), `Number-unit phrase split after number: ${text}`);
    assert(!/^years\b/.test(text), `Number-unit phrase split before unit: ${text}`);
  });
}

{
  const srt = buildSrt("For thousands of years this method wasn't just something people mentioned it was documented.");
  cueTexts(srt).forEach((text) => {
    assert(!/\bthousands$/.test(text), `Quantifier phrase split before of: ${text}`);
    assert(!/^of\b/i.test(text), `Caption starts with of: ${text}`);
  });
}

{
  const keepTogetherPhrases = buildKeepTogetherPhrases({
    vocabulary: [{ value: "project timeline" }],
    spellingRules: [{ original: "subtitle generater", replacement: "Subtitle Generator" }]
  });
  assert(keepTogetherPhrases.includes("project timeline"));
  assert(keepTogetherPhrases.includes("subtitle generator"));
}

{
  const fallbackSrt = [
    "1",
    "00:00:00,000 --> 00:00:03,000",
    "This is one. This is two,",
    "",
    "2",
    "00:00:03,000 --> 00:00:04,000",
    "word."
  ].join("\n");
  const cleaned = postProcessSrtText(fallbackSrt, ["video file"]);
  assertNoPeriods(cleaned);
  assertNoCaptionEndsWithPunctuation(cleaned);
  assertNoMixedSentenceBoundary(cleaned);
}

{
  const misspelledSrt = [
    "1",
    "00:00:00,000 --> 00:00:01,000",
    "edited with subtitle generater"
  ].join("\n");
  const updated = applySrtRules(misspelledSrt, subtitleDefaults, ["Subtitle Generator"], [
    { original: "subtitle generater", replacement: "Subtitle Generator" }
  ]);
  assert(cueTexts(updated).some((text) => text.includes("Subtitle Generator")), `Expected local spelling rule to apply:\n${updated}`);
  assert(!cueTexts(updated).some((text) => text.includes("subtitle generater")), `Expected original spelling to be replaced:\n${updated}`);
}

{
  const existingSrt = [
    "1",
    "00:00:03,401 --> 00:00:04,861",
    "Maya was considered.",
    "",
    "2",
    "00:00:04,881 --> 00:00:05,902",
    "the most beautiful woman,",
    "",
    "3",
    "00:00:05,962 --> 00:00:07,262",
    "alive, and her entire"
  ].join("\n");
  const updated = applySrtRules(existingSrt, subtitleDefaults, ["video file"]);
  const times = parseTimes(updated);
  for (let index = 0; index < times.length - 1; index += 1) {
    assert.strictEqual(times[index][1], times[index + 1][0], `Apply Rules should remove gap between cue ${index + 1} and ${index + 2}`);
  }
  assertNoPeriods(updated);
  assertNoCaptionEndsWithPunctuation(updated);
}

{
  const awkwardSrt = [
    "1",
    "00:00:01,080 --> 00:00:01,580",
    "review the video",
    "",
    "2",
    "00:00:01,580 --> 00:00:03,401",
    "file for 5,000 years",
    "",
    "3",
    "00:00:03,401 --> 00:00:04,523",
    "Editors reviewed",
    "",
    "4",
    "00:00:04,523 --> 00:00:06,142",
    "it with clients, maya"
  ].join("\n");
  const updated = applySrtRules(awkwardSrt, subtitleDefaults, ["video file"]);
  const texts = cueTexts(updated);
  assert(!texts.some((text) => /^it to\b/i.test(text)), `Expected not to start caption with lower-case continuation 'it to':\n${updated}`);
}

{
  const sentenceStartSrt = [
    "1",
    "00:00:25,427 --> 00:00:25,848",
    "It kills",
    "",
    "2",
    "00:00:25,848 --> 00:00:27,708",
    "the bacteria that causes breakouts",
    "",
    "3",
    "00:00:27,708 --> 00:00:28,428",
    "It fades dark"
  ].join("\n");
  const updated = applySrtRules(sentenceStartSrt, subtitleDefaults, ["video file"]);
  assert(!cueTexts(updated).some((text) => /\bbreakouts It\b/.test(text)), `Expected not to glue capitalized sentence start:\n${updated}`);
}

{
  const clauseSrt = [
    "1",
    "00:00:15,464 --> 00:00:18,205",
    "Editors reviewed it with clients, maya",
    "",
    "2",
    "00:00:18,205 --> 00:00:21,486",
    "presented it, Reviewers approved it for the final project",
    "",
    "3",
    "00:00:21,486 --> 00:00:24,047",
    "For thousands of years, captions weren't just something you"
  ].join("\n");
  const updated = applySrtRules(clauseSrt, subtitleDefaults, ["video file"]);
  const texts = cueTexts(updated);
  assert(texts.some((text) => /^maya\b/i.test(text)), `Expected Maya clause to start its own caption:\n${updated}`);
  assert(texts.some((text) => /^Reviewers\b/.test(text)), `Expected Reviewers clause to start its own caption:\n${updated}`);
  assert(texts.some((text) => /^captions\b/i.test(text)), `Expected captions clause to start its own caption:\n${updated}`);
}

{
  const srt = buildSrt("Maya was considered the strongest presenter and the entire review process came down to this one decision.");
  const times = parseTimes(srt);
  for (let index = 0; index < times.length - 1; index += 1) {
    assert.strictEqual(times[index][1], times[index + 1][0], `Expected zero caption gap between cue ${index + 1} and ${index + 2}`);
  }
}

console.log("SRT rule tests passed");
