// Held-out messages for the language identifier — none appear in corpus.js.
// Short, text-speak messages like real SMS. Run: npm run nlp:eval

const TEST_SET = [
  ["pabili po 3 sako urea, ihatid nyo na lang bukas", "tagalog"],
  ["magkano na ba ang abono ngayon", "tagalog"],
  ["wala pa rin po yung order ko hanggang ngayon", "tagalog"],
  ["salamat po sa mabilis na sagot", "tagalog"],
  ["kailangan ko po ng gamot para sa uod ng mais", "tagalog"],
  ["paano po ba magbayad", "tagalog"],
  ["opo tama po yan", "tagalog"],
  ["nasaan na po ang delivery namin", "tagalog"],

  ["palit ko 3 ka sako urea, ihatod lang ugma", "bisaya"],
  ["pila na man karon ang abono", "bisaya"],
  ["wala pa gihapon akong order hangtod karon", "bisaya"],
  ["salamat kaayo sa paspas nga tubag", "bisaya"],
  ["kinahanglan nako og tambal sa ulod sa mais", "bisaya"],
  ["unsaon man pagbayad", "bisaya"],
  ["oo sakto na na", "bisaya"],
  ["asa na man ang among hatod", "bisaya"],

  ["mabakal ako 3 ka sako urea, ihatod lang buwas", "hiligaynon"],
  ["tagpila na bala subong ang abono", "hiligaynon"],
  ["wala pa gihapon ang akon order tubtob subong", "hiligaynon"],
  ["salamat gid sa madasig nga sabat", "hiligaynon"],
  ["kinahanglan ko sang bulong sa ulod sang mais", "hiligaynon"],
  ["paano bala magbayad", "hiligaynon"],
  ["huo husto na ina", "hiligaynon"],
  ["diin na ang amon hatod", "hiligaynon"],

  ["gumatangak ti 3 a sako nga urea, itulodyo laengen inton bigat", "ilocano"],
  ["mano ngata ti abono ita", "ilocano"],
  ["awan pay latta ti order ko agingga ita", "ilocano"],
  ["agyamanak iti napardas a sungbat", "ilocano"],
  ["kasapulak ti agas para iti igges ti mais", "ilocano"],
  ["kasano ti agbayad", "ilocano"],
  ["wen husto dayta", "ilocano"],
  ["ayanna ti deliverymi", "ilocano"],

  ["mabakal ako nin 3 sako urea, ihatod nindo sana sa aga", "bikol"],
  ["magkano na an abono ngunyan", "bikol"],
  ["mayo pa giraray an order ko", "bikol"],
  ["dios mabalos sa madaliang simbag", "bikol"],
  ["iyo tama na iyan", "bikol"],
  ["sain na an delivery mi", "bikol"],

  ["mapalit ako hin 3 ka sako urea, ihatod la buwas", "waray"],
  ["tagpira na yana an abono", "waray"],
  ["waray pa gihapon an akon order", "waray"],
  ["damo nga salamat han madagmit nga baton", "waray"],
  ["hain na an amon hatod", "waray"],

  ["saliwan ku ing atlung sakung urea, iyatad yu mu bukas", "kapampangan"],
  ["magkanu ne ing abono ngeni", "kapampangan"],
  ["dakal a salamat pu", "kapampangan"],
  ["nokarin ne ing delivery mi", "kapampangan"],

  ["labay kon saliwen so taloran sako na urea", "pangasinan"],
  ["pigara so abono natan", "pangasinan"],
  ["salamat ed sika", "pangasinan"],

  ["pila i urea saguna", "maguindanaon"],
  ["sukran, mapia a mapita", "maguindanaon"],

  ["can i order 3 sacks of urea for tomorrow", "english"],
  ["how much is fertilizer now", "english"],
  ["my order still has not arrived", "english"],
  ["thanks for the quick reply", "english"],
  ["how do i pay", "english"],
  ["where is our delivery", "english"],
];

module.exports = { TEST_SET: TEST_SET.map(([text, language]) => ({ text, language })) };
