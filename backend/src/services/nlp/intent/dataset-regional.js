// More intent training data: the same intents as dataset.js, written in
// Hiligaynon, Ilocano, Bikol, Waray, Kapampangan, Pangasinan, and
// Maguindanaon. Hiligaynon and Ilocano get the most examples — they are
// spoken by many farmers in M'lang. Keep test messages (test-set.js) out.

const REGIONAL_INTENTS = {
  greeting: [
    // Hiligaynon
    "maayong aga", "maayong hapon sa inyo", "maayong gab-i", "kamusta kamo", "maayong aga sa inyo tanan",
    // Ilocano
    "naimbag a bigat", "naimbag a malem", "naimbag a rabii", "kumusta kayo apo",
    // Bikol / Waray / Kapampangan / Pangasinan / Maguindanaon
    "marhay na aga", "marhay na hapon po", "maupay nga aga", "maupay nga kulop", "mayap a abak", "mayap a gatpanapun",
    "maabig ya kabuasan", "mapia a mapita", "mapia a gabi",
  ],
  thanks: [
    "salamat gid", "madamo gid nga salamat", "salamat gid sa bulig", "salamat sa inyo sabat",
    "agyamanak", "agyamanak unay", "agyamanak apo", "agyamanak iti tulongyo",
    "dios mabalos", "dios mabalos po", "damo nga salamat", "dakal a salamat", "dakal a salamat pu", "salamat ed sika",
    "sukran", "sukran kanu",
  ],
  acknowledge: [
    "sige sige gid", "huo sige", "okay lang", "ah amo gali", "sige ah",
    "wen sige", "wen apo", "sige apo", "ok apo",
    "iyo sige", "sige pu", "on sige",
  ],
  goodbye: [
    "halong kamo", "sige halong", "asta sa liwat", "babay anay",
    "agannad kayo", "kastan apo", "inton manen", "sige apo, inton manen",
    "ingat kamo", "pag-ayad kamo", "ingat kayu pu",
  ],
  order: [
    // Hiligaynon
    "mabakal ako sang urea", "kinahanglan ko sang abono", "ma-order ako sang lima ka sako urea",
    "bakalon ko ang duha ka sako abono", "gusto ko magbakal sang binhi sang mais", "kinahanglan namon sang feeds para sa baboy",
    // Ilocano
    "gumatangak ti urea", "kasapulak ti abono", "agorderak ti lima a sako nga urea", "kayatko ti gumatang ti bukel ti mais",
    "kasapulanmi ti feeds para iti baboy",
    // Bikol / Waray
    "mabakal ako nin urea", "kaipuhan ko an abono", "mapalit ako hin urea", "karuyag ko mag-order hin abono",
    // Kapampangan / Pangasinan / Maguindanaon
    "saliwan ku ing urea", "kailangan ku ing abono", "labay kon saliwen so urea", "pamasa aku su urea",
    // Quantity corrections in the middle of an order ("just 3 sacks")
    "dalawang sako na lang", "apat na sako lang po", "gawin nyo na lang limang sako",
    "upat ka sako na lang", "himoa nga lima ka sako",
    "apat ka sako na lang", "himua nga lima ka sako",
    "uppat a sako laengen", "aramidem a lima a sako",
  ],
  price: [
    "tagpila ang urea", "tagpila bala ang isa ka sako", "pila ang presyo sang abono", "ano ang presyo sang urea subong",
    "mano ti urea", "mano ti maysa a sako", "mano ti presyo ti abono ita",
    "magkano an urea", "tagpira an abono", "magkanu ing urea", "pigara so urea", "pila i urea",
  ],
  availability: [
    "may ara pa bala kamo urea", "ara pa bala stock sang abono", "may ara kamo binhi sang mais",
    "adda pay kadi urea", "adda kadi abonoyo", "adda kadi bukel ti mais",
    "igwa pa kamo nin urea", "mayda pa kamo abono", "atin yu pa bang urea", "aden pan i urea",
  ],
  how_to_order: [
    "paano bala mag-order diri", "paano ako makabakal", "ano ang himuon ko para makaorder",
    "kasano ti agorder ditoy", "kasano ti gumatang", "ania ti aramidek tapno makaorderak",
    "paano mag-order digdi", "paonan-o pag-order dinhi", "makananu ya ing pamag-order keni",
  ],
  delivery_area: [
    "nagahatod bala kamo sa amon barangay", "abot bala ang hatod sa new rizal", "may delivery bala kamo",
    "agipatulod kayo kadi iti barangay mi", "adda kadi deliveryyo", "makaipatulod kayo kadi ditoy",
    "nagdedeliver kamo digdi", "nahatod ba kamo ha amon barangay", "mag-deliver kayu pu keni",
  ],
  order_status: [
    "diin na ang akon order", "san-o maabot ang akon order", "may nagsabat na bala nga supplier",
    "ayanna ti order ko", "kaano nga umay ti order ko", "adda kadin ti simmungbat a supplier",
    "sain na an order ko", "hain na an akon order", "nokarin ne ing order ku", "iner la so order ko",
  ],
  cancel_order: [
    "indi na lang ako", "i-cancel na lang ang akon order", "indi ko na pagpadayunon",
    "saanen, ikanselyo laengen", "dimon ituloy ti order ko", "i-cancel ti order ko",
    "dai na sana", "ayaw na la padayuna", "e na pu, i-cancel ne mu",
  ],
  payment: [
    "paano bala magbayad", "pwede bala gcash", "pwede bala bayaran sa ulihi",
    "kasano ti agbayad", "mabalin kadi ti gcash", "mabalin kadi nga utang",
    "paano magbayad", "paonan-o pagbayad", "makananu ku mamayad",
  ],
  hours: [
    "ano oras kamo bukas", "bukas bala kamo subong", "ano oras kamo nagasira",
    "ania nga oras ti panaglukat yo", "nakalukat kayo kadi ita", "ania nga oras ti panagserrayo",
    "anong oras kamo bukas", "anong oras kayu makabuklat",
  ],
  location: [
    "diin kamo", "diin ang inyo tindahan", "diin ako makakuha",
    "sadino ti ayanyo", "ayanna ti tiendayo", "sadino ti pangalaak",
    "sain kamo", "hain kamo", "nokarin kayu", "iner kayo",
  ],
  about: [
    "ano ini nga agriconnect", "sin-o kamo", "tawo bala ini ukon robot",
    "ania daytoy nga agriconnect", "siasino kayo", "tao kadi daytoy wenno robot",
    "ano ini", "nanu ini", "siisay kamo",
  ],
  suppliers: [
    "sin-o ang inyo mga supplier", "diin nga tindahan ang may urea", "sin-o ang pinakabarato nga supplier",
    "siasino dagiti supplieryo", "ania a tienda ti adda urea na", "siasino ti kalaklaka a supplier",
    "siisay an mga supplier nindo", "hin-o an iyo mga supplier", "ninu la reng supplier yu",
  ],
  farming_advice: [
    "ano ang maayo nga abono sa humay", "ano ang bulong sa ulod sang mais", "nagadulaw ang dahon sang humay ko",
    "san-o mag-abono sa humay", "paano mapadamo ang ani",
    "ania ti nasayaat nga abono iti pagay", "ania ti agas iti igges ti mais", "agduyaw ti bulong ti pagay ko",
    "kaano ti panag-abono iti pagay", "kasano a umadu ti apit",
    "ano an marhay na abono sa paroy", "ano an bulong sa peste kan paroy", "nanu ing mayap a abono king pale",
  ],
  points: [
    "pila na ang akon points", "ano ang agripoints", "may premyo bala sa points",
    "mano ti points ko", "ania ti agripoints", "adda kadi premio ti points",
  ],
  registration_help: [
    "paano bala magparehistro", "gusto ko magpa-register", "verified na bala ako", "ilisan ko ang akon numero",
    "kasano ti agparehistro", "kayatko ti agparehistro", "verified nakon kadi", "baliwak ti numerok",
    "paano mag-register digdi", "makananu ku magparehistro",
  ],
  talk_to_human: [
    "gusto ko makighambal sa tawo", "tawgi ako palihog", "may tawo bala dira",
    "kayatko ti makisarita iti tao", "awagannak man", "adda kadi tao dita",
    "gusto kong makipag-olay sa tawo", "karuyag ko makiistorya ha tawo", "buri ke ing makisabi king tau",
  ],
  complaint: [
    "isa ka semana na wala pa gihapon", "guba ang sako pag-abot", "kulang ang ginhatod",
    "sala ang ginhatod nga produkto", "magreklamo ako",
    "maysa a lawas nan awan pay latta", "nadadael ti sako idi dimteng", "kurang ti naitulod",
    "biddut ti naitulod a produkto", "agreklamoak",
    "sarong semana na mayo pa giraray", "kulang an ihinatod", "usa ka semana na waray pa gihapon",
  ],
};

module.exports = { REGIONAL_INTENTS };
