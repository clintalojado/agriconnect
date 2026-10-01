// Languages the bot understands, and which language it answers in.
//
// The bot reads all of these (language identifier + lexicon + intent model).
// It replies in the farmer's own language for Tagalog, Bisaya, Hiligaynon,
// Ilocano, and English; speakers of the other languages get Tagalog, the
// national language — better a correct Tagalog reply than a wrong one in
// their mother tongue.

const LANGUAGES = {
  tagalog: { label: "Tagalog", reply: "tagalog" },
  bisaya: { label: "Bisaya (Cebuano)", reply: "bisaya" },
  hiligaynon: { label: "Hiligaynon (Ilonggo)", reply: "hiligaynon" },
  ilocano: { label: "Ilocano", reply: "ilocano" },
  english: { label: "English", reply: "english" },
  bikol: { label: "Bikol", reply: "tagalog" },
  waray: { label: "Waray", reply: "tagalog" },
  kapampangan: { label: "Kapampangan", reply: "tagalog" },
  pangasinan: { label: "Pangasinan", reply: "tagalog" },
  maguindanaon: { label: "Maguindanaon", reply: "tagalog" },
};

const LANGUAGE_CODES = Object.keys(LANGUAGES);

// Keys used in reply tables: say(language, { tl, bis, hil, ilo, en }).
const REPLY_KEYS = { tagalog: "tl", bisaya: "bis", hiligaynon: "hil", ilocano: "ilo", english: "en" };

function replyLanguage(language) {
  return LANGUAGES[language]?.reply || "tagalog";
}

/** Picks the reply for the farmer's language; Tagalog when a translation is missing. */
function say(language, texts) {
  return texts[REPLY_KEYS[replyLanguage(language)]] ?? texts.tl;
}

module.exports = { LANGUAGES, LANGUAGE_CODES, REPLY_KEYS, replyLanguage, say };
