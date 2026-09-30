// Held-out test messages for the intent classifier. None of these appear in
// dataset.js — they measure how well the model handles new wording.
// Run: npm run nlp:eval

const TEST_SET = [
  // greeting
  ["good morning sa inyong lahat", "greeting"], ["hi hello", "greeting"], ["maayong buntag po", "greeting"],
  ["kumusta ang araw nyo", "greeting"], ["hellooo", "greeting"],
  // thanks
  ["salamat talaga", "thanks"], ["thank you so much po", "thanks"], ["daghang salamat sa inyo", "thanks"],
  ["tnx po", "thanks"], ["salamat sa pag reply", "thanks"],
  // acknowledge
  ["ok sige po", "acknowledge"], ["noted sir", "acknowledge"], ["sige ah", "acknowledge"], ["okey", "acknowledge"],
  // goodbye
  ["sige bye na", "goodbye"], ["paalam na po", "goodbye"], ["babay na", "goodbye"], ["see you next time", "goodbye"],
  // order
  ["pabili 4 sako ng urea", "order"], ["mo order ko og 2 ka sako chicken feed", "order"],
  ["kailangan namin 15 bags complete", "order"], ["i would like to order fungicide", "order"],
  ["bili ako 1 sako potash", "order"], ["order ng rice seeds para sa tanim", "order"],
  // price
  ["magkano na po urea ngayon", "price"], ["tagpila ang chicken feed", "price"], ["how much is complete fertilizer", "price"],
  ["ano presyo ng binhi ng mais", "price"], ["pila na ang herbicide", "price"],
  // availability
  ["meron pa ba kayong urea", "availability"], ["naa pa moy liso sa mais", "availability"],
  ["available po ba ang fungicide", "availability"], ["do you still have chicken feed", "availability"],
  ["may stock pa ba ng ammophos", "availability"],
  // how_to_order
  ["paano po ako mag oorder dito", "how_to_order"], ["unsaon man pag order diri", "how_to_order"],
  ["how can i buy fertilizer here", "how_to_order"], ["ano po ang gagawin ko para bumili", "how_to_order"],
  ["pano gamitin ang agriconnect", "how_to_order"],
  // delivery_area
  ["nagdedeliver ba kayo sa bagontapay", "delivery_area"], ["abot ba mo hatod sa lika", "delivery_area"],
  ["do you deliver in new antique", "delivery_area"], ["may delivery po ba sa amin sa langkong", "delivery_area"],
  ["magkano ang delivery", "delivery_area"],
  // order_status
  ["nasaan na po ang order ko", "order_status"], ["asa na man akong gi order", "order_status"],
  ["has my order been delivered", "order_status"], ["may sumagot na bang supplier", "order_status"],
  ["kailan po ang delivery ng urea ko", "order_status"],
  // cancel_order
  ["i-cancel ko na lang po", "cancel_order"], ["ayaw na nako sa order", "cancel_order"],
  ["please cancel it", "cancel_order"], ["wag nyo na ituloy order ko", "cancel_order"],
  // payment
  ["pwede po ba gcash", "payment"], ["cash on delivery po ba kayo", "payment"], ["unsaon man pagbayad", "payment"],
  ["can i pay after harvest", "payment"], ["libre lang ba ito", "payment"],
  // hours
  ["bukas ba kayo mamaya", "hours"], ["what are your hours", "hours"], ["abri ba mo karong domingo", "hours"],
  ["anong oras kayo nagsasara", "hours"],
  // location
  ["saan po ang tindahan nyo", "location"], ["asa man mo dapit", "location"], ["what is your address", "location"],
  ["saan pwede mag pick up", "location"],
  // about
  ["ano po ba ito", "about"], ["who is agriconnect", "about"], ["unsa man ning agriconnect", "about"],
  ["bot ba to o tao", "about"],
  // suppliers
  ["sino-sino ang mga supplier nyo", "suppliers"], ["kinsa inyong mga supplier", "suppliers"],
  ["which stores sell fertilizer", "suppliers"], ["sino pinaka mura na tindahan", "suppliers"],
  // farming_advice
  ["ano magandang abono para sa mais", "farming_advice"], ["unsa tambal sa peste sa humay", "farming_advice"],
  ["what should i spray for weeds", "farming_advice"], ["kailan dapat mag top dress sa palay", "farming_advice"],
  ["naninilaw ang mais ko ano gagawin", "farming_advice"], ["paano mapalaki ang ani ng palay", "farming_advice"],
  // points
  ["ilan na points ko", "points"], ["pila na akong agripoints", "points"], ["what are agripoints", "points"],
  ["may premyo ba sa points", "points"],
  // registration_help
  ["paano ako makakapag register", "registration_help"], ["gusto ko palitan ang barangay ko", "registration_help"],
  ["verified na ba ang account ko", "registration_help"], ["how do i sign up", "registration_help"],
  // talk_to_human
  ["gusto ko makausap ang staff", "talk_to_human"], ["pwede ba ko tawagan", "talk_to_human"],
  ["can i talk to someone", "talk_to_human"], ["naa bay tawo diha", "talk_to_human"],
  // complaint
  ["hindi pa rin dumarating after 1 week", "complaint"], ["sira ang sako pagdating", "complaint"],
  ["kulang ng dalawang sako ang deliver", "complaint"], ["wrong product ang dumating", "complaint"],
  ["gusto ko mag reklamo", "complaint"],
];

module.exports = { TEST_SET: TEST_SET.map(([text, intent]) => ({ text, intent })) };
