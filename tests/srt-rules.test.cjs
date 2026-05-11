const assert = require("assert");
const {
  buildKeepTogetherPhrases,
  buildSrtFromSentences,
  buildSrtFromUtterances,
  extractSrt,
  postProcessSrtText,
  applySrtRules,
  findSubtitleIssues,
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

function wordsFromTextAt(text, offset = 0, step = 0.25) {
  return text.split(/\s+/).map((word, index) => ({
    punctuated_word: word,
    start: Number((offset + (index * step)).toFixed(2)),
    end: Number((offset + (index * step) + 0.18).toFixed(2))
  }));
}

function wordsFromTextWithGap(text, duration = 0.18, gap = 0.12) {
  return text.split(/\s+/).map((word, index) => {
    const start = index * (duration + gap);
    return {
      punctuated_word: word,
      start: Number(start.toFixed(2)),
      end: Number((start + duration).toFixed(2))
    };
  });
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

function cueTextLines(srt) {
  return srt.trim().split(/\n\s*\n/).map((block) => block.split(/\r?\n/).slice(2));
}

function assertNoPeriods(srt) {
  assert(!srt.includes("."), `Expected no periods in SRT:\n${srt}`);
}

function assertMaxTextLinesPerCue(srt, maxLines) {
  cueTextLines(srt).forEach((lines) => {
    assert(lines.length <= maxLines, `Expected at most ${maxLines} line(s) per cue:\n${srt}`);
  });
}

function assertMaxCueCharacters(srt, maxCharacters) {
  cueTexts(srt).forEach((text) => {
    assert(text.length <= maxCharacters, `Expected cue to fit visual row width (${maxCharacters}): ${text}\n${srt}`);
  });
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

function parseCueObjects(srt) {
  return srt.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split(/\r?\n/);
    return {
      timing: lines[1],
      text: lines.slice(2).join(" ")
    };
  });
}

function assertNoSubtitleIssues(srt, settings, keepTogetherPhrases) {
  const issues = findSubtitleIssues(parseCueObjects(srt), settings, keepTogetherPhrases);
  assert.strictEqual(issues.length, 0, `Expected no subtitle QA issues, found ${JSON.stringify(issues)}:\n${srt}`);
}

function assertNoLeadingCommaWord(srt) {
  cueTexts(srt).forEach((text) => {
    assert(!/^[A-Za-z0-9]+,/.test(text), `Expected cue not to start with a comma word: ${text}\n${srt}`);
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

{
  const oneLineSettings = {
    ...subtitleDefaults,
    maximum_characters_per_row: 28,
    maximum_rows_per_caption: 1
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const srt = postProcessSrtText(
    buildSrtFromUtterances([{ words: wordsFromText("other ingredient that kept showing up over and over again") }], oneLineSettings, keepTogetherPhrases),
    keepTogetherPhrases,
    oneLineSettings
  );
  assertMaxTextLinesPerCue(srt, 1);
}

{
  const oneLineSettings = {
    ...subtitleDefaults,
    maximum_characters_per_row: 28,
    maximum_rows_per_caption: 1
  };
  const existingSrt = [
    "1",
    "00:00:00,000 --> 00:00:03,000",
    "other ingredient that kept showing up over and over again"
  ].join("\n");
  const updated = applySrtRules(existingSrt, oneLineSettings, ["video file"]);
  assertMaxTextLinesPerCue(updated, 1);
}

{
  const lowSilenceSettings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.1
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const srt = postProcessSrtText(
    buildSrtFromUtterances([{ words: wordsFromTextWithGap("same fats your skin already produces so it passes right through") }], lowSilenceSettings, keepTogetherPhrases),
    keepTogetherPhrases,
    lowSilenceSettings
  );
  const texts = cueTexts(srt);
  assert(!texts.slice(0, -1).some((text) => text.split(/\s+/).filter(Boolean).length <= 2), `Expected low silence threshold not to create mid-sentence micro captions:\n${srt}`);
}

{
  const oneLineSettings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const srt = postProcessSrtText(
    buildSrtFromUtterances([{ words: wordsFromText("Your face is literally sliding off your bones and nobody is telling you why When you're young your face has these pockets of fat", 0.32) }], oneLineSettings, keepTogetherPhrases),
    keepTogetherPhrases,
    oneLineSettings
  );
  const texts = cueTexts(srt);
  assert(!texts.some((text) => /\byour$/i.test(text)), `Expected captions not to end on possessive your:\n${srt}`);
  assert(!texts.some((text) => /\bthese$/i.test(text)), `Expected captions not to end on determiner these:\n${srt}`);
  assert(!texts.some((text) => /\btelling$/i.test(text)), `Expected captions not to end on progressive verb:\n${srt}`);
  assert(!texts.some((text) => /^you\b/i.test(text)), `Expected captions not to start with pronoun fragment:\n${srt}`);
  assert(!texts.some((text) => /^off\b/i.test(text)), `Expected captions not to start with preposition off:\n${srt}`);
  assert(texts.some((text) => /\byour bones\b/i.test(text)), `Expected possessive phrase to stay together:\n${srt}`);
  assert(texts.some((text) => /\bthese pockets\b/i.test(text)), `Expected determiner phrase to stay together:\n${srt}`);
}

{
  const oneLineSettings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const srt = postProcessSrtText(
    buildSrtFromUtterances([{ words: wordsFromText("I was waking up at 3am scratching my arms wanting to claw my skin off I tried everything CeraVe Eucerin Aveeno Gold Bond", 0.27) }], oneLineSettings, keepTogetherPhrases),
    keepTogetherPhrases,
    oneLineSettings
  );
  const texts = cueTexts(srt);
  assert(!texts.some((text) => /\bwaking$/i.test(text)), `Expected captions not to end on progressive verb waking:\n${srt}`);
  assert(!texts.some((text) => /^up\b/i.test(text)), `Expected captions not to start on phrasal particle up:\n${srt}`);
  assert(!texts.some((text) => /\bscratching$/i.test(text)), `Expected captions not to end on progressive verb scratching:\n${srt}`);
  assert(!texts.some((text) => /^my\b/i.test(text)), `Expected captions not to start on possessive determiner my:\n${srt}`);
  assert(!texts.some((text) => /\bI$/i.test(text)), `Expected captions not to end on subject pronoun I:\n${srt}`);
  assert(texts.some((text) => /^I tried\b/.test(text)), `Expected capitalized sentence start to begin its own caption:\n${srt}`);
}

{
  const mergedSentenceSrt = [
    "1",
    "00:00:12,853 --> 00:00:17,856",
    "It's just menopause, my doctor said Try some lotion You'll get used to it Get used to it"
  ].join("\n");
  const updated = applySrtRules(mergedSentenceSrt, {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  }, ["video file"]);
  const texts = cueTexts(updated);
  assert(!texts.some((text) => /\bsaid Try\b/.test(text)), `Expected missing punctuation before Try to start a new cue:\n${updated}`);
  assert(!texts.some((text) => /\bit Get\b/.test(text)), `Expected missing punctuation before Get to start a new cue:\n${updated}`);
  assert(texts.some((text) => /^Try some lotion\b/.test(text)), `Expected Try sentence to start its own cue:\n${updated}`);
  assert(texts.some((text) => /^Get used to it\b/.test(text)), `Expected Get sentence to start its own cue:\n${updated}`);
}

{
  const leadingCommaSrt = [
    "1",
    "00:00:00,000 --> 00:00:02,000",
    "I slept for hours without waking up",
    "",
    "2",
    "00:00:02,000 --> 00:00:04,000",
    "scratching, by week two the itch was gone"
  ].join("\n");
  const settings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const updated = applySrtRules(leadingCommaSrt, settings, []);
  assertNoLeadingCommaWord(updated);
  assertMaxCueCharacters(updated, settings.maximum_characters_per_row);
}

{
  const splitObjectSrt = [
    "1",
    "00:03:00,000 --> 00:03:02,000",
    "this will let",
    "",
    "2",
    "00:03:02,000 --> 00:03:04,000",
    "you sleep through the night again"
  ].join("\n");
  const settings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const updated = applySrtRules(splitObjectSrt, settings, []);
  const texts = cueTexts(updated);
  assert(!texts.some((text) => /\bwill let$/i.test(text)), `Expected complement-taking verb to stay with its object:\n${updated}`);
  assert(!texts.some((text) => /^you sleep\b/i.test(text)), `Expected object phrase not to be stranded after let:\n${updated}`);
  assertNoSubtitleIssues(updated, settings, keepTogetherPhrases);
}

{
  const openerFragmentSrt = [
    "1",
    "00:00:00,000 --> 00:00:01,000",
    "So I spent",
    "",
    "2",
    "00:00:01,000 --> 00:00:03,500",
    "weeks researching the clip"
  ].join("\n");
  const settings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const updated = applySrtRules(openerFragmentSrt, settings, []);
  const texts = cueTexts(updated);
  assert(!texts.some((text) => /^So I spent$/i.test(text)), `Expected short discourse opener to merge with continuation:\n${updated}`);
  assert(texts.some((text) => /^So I spent weeks\b/i.test(text)), `Expected opener phrase to stay with continuation:\n${updated}`);
  assertNoSubtitleIssues(updated, settings, keepTogetherPhrases);
}

{
  const timePhraseSrt = [
    "1",
    "00:00:00,000 --> 00:00:02,000",
    "By week",
    "",
    "2",
    "00:00:02,000 --> 00:00:04,000",
    "two the constant burning itch was gone"
  ].join("\n");
  const settings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const updated = applySrtRules(timePhraseSrt, settings, []);
  const texts = cueTexts(updated);
  assert(!texts.some((text) => /\bBy week$/i.test(text)), `Expected time phrase not to split after unit:\n${updated}`);
  assert(!texts.some((text) => /^two\b/i.test(text)), `Expected written number not to be stranded after time unit:\n${updated}`);
  assert(texts.some((text) => /\bBy week two\b/i.test(text)), `Expected time phrase to stay together:\n${updated}`);
}

{
  const temporalOpenerSrt = [
    "1",
    "00:00:00,000 --> 00:00:01,000",
    "The first night",
    "",
    "2",
    "00:00:01,000 --> 00:00:03,500",
    "I put it on my arms"
  ].join("\n");
  const settings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const updated = applySrtRules(temporalOpenerSrt, settings, []);
  const texts = cueTexts(updated);
  assert(!texts.some((text) => /^The first night$/i.test(text)), `Expected temporal opener to stay with its clause:\n${updated}`);
  assert(texts.some((text) => /^The first night I put\b/i.test(text)), `Expected temporal opener phrase to include subject clause:\n${updated}`);
  assertNoSubtitleIssues(updated, settings, keepTogetherPhrases);
}

{
  const capitalizedNounPhraseSrt = [
    "1",
    "00:00:00,000 --> 00:00:02,000",
    "And that's when everything clicked Beef tallow is similar",
    "",
    "2",
    "00:00:02,000 --> 00:00:04,000",
    "to the oils your skin makes naturally"
  ].join("\n");
  const settings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const updated = applySrtRules(capitalizedNounPhraseSrt, settings, []);
  const texts = cueTexts(updated);
  assert(!texts.some((text) => /\bclicked Beef\b/.test(text)), `Expected capitalized noun phrase before predicate to start a new cue:\n${updated}`);
  assert(texts.some((text) => /^Beef tallow is\b/.test(text)), `Expected noun phrase sentence to start its own cue:\n${updated}`);
  assertMaxCueCharacters(updated, settings.maximum_characters_per_row);
}

{
  const lowercaseContinuationSrt = [
    "1",
    "00:00:00,000 --> 00:00:01,000",
    "She started with raw",
    "",
    "2",
    "00:00:01,000 --> 00:00:03,500",
    "honey as the foundation"
  ].join("\n");
  const settings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const updated = applySrtRules(lowercaseContinuationSrt, settings, []);
  const texts = cueTexts(updated);
  assert(!texts.some((text) => /\braw$/i.test(text)), `Expected modifier not to split from lowercase continuation:\n${updated}`);
  assert(!texts.some((text) => /^honey\b/i.test(text)), `Expected lowercase noun continuation not to be stranded:\n${updated}`);
  assertNoSubtitleIssues(updated, settings, keepTogetherPhrases);
}

{
  const oneRowSettings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const srt = postProcessSrtText([
    "1",
    "00:00:00,000 --> 00:00:05,000",
    "alive and her entire skincare routine came down to this one ingredient"
  ].join("\n"), keepTogetherPhrases, oneRowSettings);
  assertMaxTextLinesPerCue(srt, 1);
  assertMaxCueCharacters(srt, oneRowSettings.maximum_characters_per_row);
}

{
  const messySrt = [
    "1",
    "00:00:18,816 --> 00:00:24,008",
    "I was waking",
    "",
    "2",
    "00:00:24,008 --> 00:00:26,966",
    "up at 3am scratching my arms wanting to claw my skin off I tried everything"
  ].join("\n");
  const updated = applySrtRules(messySrt, {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  }, ["video file"]);
  const texts = cueTexts(updated);
  assert(!texts.some((text) => /\bwaking$/i.test(text)), `Expected repair loop not to leave progressive verb ending:\n${updated}`);
  assert(!texts.some((text) => /^up\b/i.test(text)), `Expected repair loop not to leave particle start:\n${updated}`);
  assert(!texts.some((text) => /\bI$/i.test(text)), `Expected repair loop not to leave sentence-start pronoun attached to previous cue:\n${updated}`);
  assert(texts.some((text) => /^I tried\b/.test(text)), `Expected repair loop to recover missing sentence boundary:\n${updated}`);
}

{
  const sentenceSettings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const sentences = [
    {
      sentence: "disappeared their skin was softer than it had been in years",
      start: 0,
      end: 3.1,
      words: wordsFromTextAt("disappeared their skin was softer than it had been in years", 0, 0.25)
    },
    {
      sentence: "Two years later, we've shipped over 50,000 jars, and we still make every single batch the same way we made that first one",
      start: 3.1,
      end: 8.2,
      words: wordsFromTextAt("Two years later, we've shipped over 50,000 jars, and we still make every single batch the same way we made that first one", 3.1, 0.25)
    },
    {
      sentence: "We render our tallow low and slow in small batches so we don't burn off the nutrients that make it work",
      start: 8.2,
      end: 12.6,
      words: wordsFromTextAt("We render our tallow low and slow in small batches so we don't burn off the nutrients that make it work", 8.2, 0.25)
    }
  ];
  const srt = buildSrtFromSentences(sentences, sentenceSettings, keepTogetherPhrases);
  const texts = cueTexts(srt);
  assertMaxTextLinesPerCue(srt, 1);
  assertMaxCueCharacters(srt, sentenceSettings.maximum_characters_per_row);
  assert(!texts.some((text) => /\byears Two years later\b/.test(text)), `Sentence builder must not merge across Gladia sentence boundaries:\n${srt}`);
  assert(!texts.some((text) => /\bone We render\b/.test(text)), `Sentence builder must preserve the next Gladia sentence start:\n${srt}`);
  assert(texts.some((text) => /^Two years later/i.test(text)), `Expected second sentence to start cleanly:\n${srt}`);
  assert(texts.some((text) => /^We render/i.test(text)), `Expected third sentence to start cleanly:\n${srt}`);

  const extracted = extractSrt({
    result: {
      transcription: {
        sentences: { results: sentences },
        utterances: [{ words: wordsFromTextAt("years Two years later one We render", 0, 0.25) }]
      }
    }
  }, sentenceSettings, keepTogetherPhrases);
  assert(!cueTexts(extracted).some((text) => /\byears Two years later\b|\bone We render\b/.test(text)), `extractSrt should prefer Gladia sentence results over utterances:\n${extracted}`);

  const duplicateAcrossSentences = buildSrtFromSentences([
    {
      sentence: "batch the same way we made that first one",
      start: 0,
      end: 1.8,
      words: wordsFromTextAt("batch the same way we made that first one", 0, 0.22)
    },
    {
      sentence: "one",
      start: 1.8,
      end: 1.95,
      words: wordsFromTextAt("one", 1.8, 0.22)
    },
    {
      sentence: "We render our tallow",
      start: 1.95,
      end: 3,
      words: wordsFromTextAt("We render our tallow", 1.95, 0.22)
    }
  ], sentenceSettings, keepTogetherPhrases);
  assert(!cueTexts(duplicateAcrossSentences).some((text) => /\bone one\b/i.test(text) || /^one$/i.test(text)), `Expected cross-sentence duplicate single word to be removed:\n${duplicateAcrossSentences}`);
}

{
  const settings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const prepositionEndingSrt = [
    "1",
    "00:00:00,200 --> 00:00:02,121",
    "This ingredient kept women's skin clear for",
    "",
    "2",
    "00:00:02,121 --> 00:00:03,401",
    "5,000 years"
  ].join("\n");
  const prepositionUpdated = applySrtRules(prepositionEndingSrt, settings, keepTogetherPhrases);
  const prepositionTexts = cueTexts(prepositionUpdated);
  assert(!prepositionTexts.some((text) => /\bfor$/i.test(text)), `Expected preposition ending to rebalance:\n${prepositionUpdated}`);
  assertMaxCueCharacters(prepositionUpdated, settings.maximum_characters_per_row);

  const singleWordTimeSrt = [
    "3",
    "00:00:12,666 --> 00:00:14,655",
    "probably had it in your kitchen this whole",
    "",
    "4",
    "00:00:14,655 --> 00:00:15,464",
    "time"
  ].join("\n");
  const timeUpdated = applySrtRules(singleWordTimeSrt, settings, keepTogetherPhrases);
  const timeTexts = cueTexts(timeUpdated);
  assert(!timeTexts.some((text) => /^time$/i.test(text)), `Expected single-word time cue to rebalance:\n${timeUpdated}`);
  assert(timeTexts.some((text) => /\bthis whole time$/i.test(text)), `Expected whole time phrase to stay together:\n${timeUpdated}`);
  assertMaxCueCharacters(timeUpdated, settings.maximum_characters_per_row);

  const duplicateCueSrt = [
    "5",
    "00:02:03,459 --> 00:02:05,420",
    "batch the same way we made that first one",
    "",
    "6",
    "00:02:05,420 --> 00:02:05,541",
    "one",
    "",
    "7",
    "00:02:05,541 --> 00:02:06,822",
    "We render our tallow"
  ].join("\n");
  const duplicateUpdated = applySrtRules(duplicateCueSrt, settings, keepTogetherPhrases);
  const duplicateTexts = cueTexts(duplicateUpdated);
  assert(!duplicateTexts.some((text) => /\bone one\b/i.test(text) || /^one$/i.test(text)), `Expected duplicate single-word cue to be removed:\n${duplicateUpdated}`);
  assertMaxCueCharacters(duplicateUpdated, settings.maximum_characters_per_row);
}

{
  const scriptSettings = {
    ...defaultSettings.subtitleDefaults,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.3
  };
  const scriptText = [
    "I challenge any woman who's going through menopause and scratching herself raw at night to try this for 30 days and tell me you're still itching",
    "They told me the itching was normal It's just menopause my doctor said Try some lotion You'll get used to it Get used to it",
    "I was waking up at 3am scratching my arms wanting to claw my skin off I tried everything CeraVe Eucerin Aveeno Gold Bond",
    "Every intensive moisture cream at the drugstore My dermatologist prescribed Triam Cinalone Cream but it thinned my skin so much I could see veins I'd never seen before and I was still scratching",
    "I was losing my mind The itching was constant burning crawling relentless especially at night when I was trying to sleep",
    "So I spent weeks researching until I found this video of Dr Eric Berg That made me want to create cry He explained that when estrogen drops during menopause your skin literally can't hold moisture anymore",
    "Your skin barrier is made of lipids which are fats Estrogen tells your skin to produce those fats but when estrogen crashes your skin stops making the oils it needs to protect itself",
    "That's why no amount of moisturizer fixes it You're putting water on a broken barrier it evaporates immediately Your skin is screaming for fat Not water",
    "And that's when everything clicked Beef tallow is 70% bioidentical to human sebum It's similar to the oils your skin makes naturally",
    "So your skin doesn't fight tallow It actually drinks it up like it's producing it itself The first night I put it on my arms before bed they were raw from scratching",
    "So I expected it to sting but it didn't For the first time in months I slept for hours without waking up scratching By week two the constant burning itch was gone",
    "I could wear wool again I could focus at work without wanting to scratch my arms off under my desk After 30 days I took this photo Look at my arms",
    "The texture is back The redness is gone I'm not scratching myself raw every night The tallow gave my skin the exact fats it stopped producing when estrogen dropped",
    "The one I use is called Tallow and Honey Balm They render grass fed tallow by hand in small batches and mix it with organic raw honey",
    "This has no lab ingredients no synthetic preservatives nothing your skin has to fight It only has the fats your skin is desperately missing",
    "So if you're scratching yourself raw at night if your doctor dismissed you if every cream has failed try this because you're not crazy",
    "Your skin isn't broken It's just starving for what menopause took away If menopause has you waking up every night scratching this will let you sleep through the night again",
    "How to deal with itchy skin during menopause They told me that itching was normal It's just menopause my doctor said Try some lotion You'll get used to it"
  ].join(" ");
  const keepTogetherPhrases = buildKeepTogetherPhrases({ vocabulary: [], spellingRules: [] });
  const srt = postProcessSrtText(
    buildSrtFromUtterances([{ words: wordsFromText(scriptText, 0.27) }], scriptSettings, keepTogetherPhrases),
    keepTogetherPhrases,
    scriptSettings
  );
  assertMaxTextLinesPerCue(srt, 1);
  assertMaxCueCharacters(srt, scriptSettings.maximum_characters_per_row);
  assertNoLeadingCommaWord(srt);
  const texts = cueTexts(srt);
  assert(!texts.some((text) => /\bsaid Try\b/.test(text)), `Full script should not leave said Try merged:\n${srt}`);
  assert(!texts.some((text) => /\bit Get\b/.test(text)), `Full script should not leave it Get merged:\n${srt}`);
  assert(!texts.some((text) => /\bfats Estrogen\b/.test(text)), `Full script should split before capitalized subject with predicate:\n${srt}`);
  assert(!texts.some((text) => /\bmenopause They told\b/.test(text)), `Full script should split before reported-speech subject:\n${srt}`);
  assert(!texts.some((text) => /^So I spent$/i.test(text)), `Full script should not leave a short discourse opener alone:\n${srt}`);
  assert(!texts.some((text) => /\bBy week$/i.test(text)), `Full script should not split time phrase after unit:\n${srt}`);
  assert(!texts.some((text) => /^two\b/i.test(text)), `Full script should not strand written number after time unit:\n${srt}`);
  assert(!texts.some((text) => /^This has no lab$/i.test(text)), `Full script should not leave negated modifier phrase alone:\n${srt}`);
  assert(!texts.some((text) => /^The first night$/i.test(text)), `Full script should not leave temporal opener alone:\n${srt}`);
  assert(!texts.some((text) => /\bdidn't For\b/.test(text)), `Full script should split before temporal sentence opener:\n${srt}`);
  assert(!texts.some((text) => /\bclicked Beef\b/.test(text)), `Full script should split before capitalized noun phrase sentence:\n${srt}`);
}

console.log("SRT rule tests passed");
