/**
 * Genera discovery-questions (claves), catálogo i18n ES/EN, mapa legacy y migración SQL.
 * Ejecutar: node scripts/build-survey-discovery-i18n.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/** @typedef {{ key: string, es: string, en: string }} Opt */
/** @typedef {{ id: string, number?: number, titleEs: string, titleEn: string, max: number, withContext?: boolean, labelEs?: string, labelEn?: string, options: Opt[] }} Q */

function opt(key, es, en) {
  return { key, es, en };
}

/** @type {Q[]} */
const BEFORE = [
  {
    id: "p1", number: 1, max: 2, withContext: true,
    titleEs: "¿Qué buscan principalmente cuando salen de vacaciones?",
    titleEn: "What do they mainly look for when they go on vacation?",
    options: [
      opt("rest_disconnect", "Descansar y desconectarse", "Rest and disconnect"),
      opt("family_time", "Pasar tiempo en familia", "Spend time with family"),
      opt("couple_reconnect", "Reconectar como pareja", "Reconnect as a couple"),
      opt("create_memories", "Crear recuerdos", "Create memories"),
      opt("health_wellness", "Cuidar su salud o bienestar", "Care for their health or wellness"),
      opt("new_destinations", "Conocer nuevos destinos", "Discover new destinations"),
      opt("live_adventures", "Vivir aventuras", "Have adventures"),
      opt("celebrate_moments", "Celebrar momentos importantes", "Celebrate important moments"),
      opt("comfort_service", "Disfrutar comodidad y buen servicio", "Enjoy comfort and good service"),
      opt("escape_routine", "Escapar de la rutina", "Escape the routine"),
    ],
  },
  {
    id: "p2", number: 2, max: 2, withContext: true,
    titleEs: "¿Qué emoción esperan sentir durante unas buenas vacaciones?",
    titleEn: "What emotion do they hope to feel during a great vacation?",
    options: [
      opt("calm", "Tranquilidad", "Calm"),
      opt("freedom", "Libertad", "Freedom"),
      opt("joy", "Alegría", "Joy"),
      opt("family_connection", "Conexión familiar", "Family connection"),
      opt("couple_connection", "Conexión de pareja", "Couple connection"),
      opt("fun", "Diversión", "Fun"),
      opt("adventure", "Aventura", "Adventure"),
      opt("renewal", "Renovación", "Renewal"),
      opt("pampered", "Sentirse consentidos", "Feeling pampered"),
      opt("safety", "Seguridad", "Safety"),
    ],
  },
  {
    id: "p3", number: 3, max: 3, withContext: true,
    titleEs: "¿Qué no puede faltar para considerar que una vacación realmente valió la pena?",
    titleEn: "What must be present for a vacation to truly feel worthwhile?",
    options: [
      opt("lodging_quality", "Calidad del alojamiento", "Lodging quality"),
      opt("good_location", "Buena ubicación", "Good location"),
      opt("space_privacy", "Espacio y privacidad", "Space and privacy"),
      opt("good_service", "Buen servicio", "Good service"),
      opt("activities_all", "Actividades para todos", "Activities for everyone"),
      opt("date_flexibility", "Flexibilidad de fechas", "Date flexibility"),
      opt("easy_booking", "Facilidad para reservar", "Easy booking"),
      opt("destination_variety", "Variedad de destinos", "Variety of destinations"),
      opt("safety", "Seguridad", "Safety"),
      opt("family_comfort", "Comodidad para la familia", "Comfort for the family"),
      opt("clear_costs", "Costos claros", "Clear costs"),
      opt("value_for_money", "Buena relación precio–experiencia", "Good price-to-experience value"),
    ],
  },
  {
    id: "p4", number: 4, max: 1, withContext: true,
    titleEs: "Si pudieran mejorar una sola cosa de sus futuras vacaciones, ¿cuál sería?",
    titleEn: "If they could improve one thing about their future vacations, what would it be?",
    options: [
      opt("travel_more", "Viajar más veces", "Travel more often"),
      opt("more_nights", "Quedarse más noches", "Stay more nights"),
      opt("better_quality", "Mejorar la calidad", "Improve quality"),
      opt("more_space", "Tener más espacio", "Have more space"),
      opt("more_destinations", "Conocer más destinos", "See more destinations"),
      opt("more_family", "Viajar con más integrantes de la familia", "Travel with more family members"),
      opt("less_effort", "Organizar con menos esfuerzo", "Organize with less effort"),
      opt("better_dates", "Conseguir mejores fechas", "Get better dates"),
      opt("cost_control", "Tener mayor control del costo", "Have more control over cost"),
      opt("more_flexibility", "Tener mayor flexibilidad", "Have more flexibility"),
    ],
  },
];

/** @type {Q[]} */
const STYLE = [
  {
    id: "style1", max: 1, labelEs: "Destinos", labelEn: "Destinations",
    titleEs: "Destinos", titleEn: "Destinations",
    options: [
      opt("known", "Conocidos", "Familiar"),
      opt("new", "Nuevos", "New"),
      opt("both", "Combinan ambos", "A mix of both"),
    ],
  },
  {
    id: "style2", max: 1, labelEs: "Planeación", labelEn: "Planning",
    titleEs: "Planeación", titleEn: "Planning",
    options: [
      opt("well_ahead", "Con anticipación", "Well in advance"),
      opt("months_ahead", "Meses antes", "Months ahead"),
      opt("near_date", "Cerca de la fecha", "Close to the date"),
    ],
  },
  {
    id: "style3", max: 1, labelEs: "Ritmo", labelEn: "Pace",
    titleEs: "Ritmo", titleEn: "Pace",
    options: [
      opt("rest", "Descanso", "Rest"),
      opt("activities", "Actividades", "Activities"),
      opt("balance", "Equilibrio", "Balance"),
    ],
  },
  {
    id: "style4", max: 1, labelEs: "Prioridad", labelEn: "Priority",
    titleEs: "Prioridad", titleEn: "Priority",
    options: [
      opt("practicality", "Practicidad", "Practicality"),
      opt("quality_service", "Calidad y servicio", "Quality and service"),
      opt("cost_experience", "Costo–experiencia", "Cost-to-experience"),
    ],
  },
];

/** @type {Q[]} */
const AFTER = [
  {
    id: "p21", number: 5, max: 2, withContext: true,
    titleEs: "¿Qué suele dificultarles viajar como realmente quisieran?",
    titleEn: "What usually makes it hard for them to travel the way they really want?",
    options: [
      opt("no_time", "Falta de tiempo", "Lack of time"),
      opt("work", "Trabajo", "Work"),
      opt("budget", "Presupuesto", "Budget"),
      opt("school_calendar", "Calendario escolar o familiar", "School or family calendar"),
      opt("expensive_flights", "Vuelos costosos", "Expensive flights"),
      opt("no_availability", "Falta de disponibilidad", "Lack of availability"),
      opt("hard_to_organize", "Organización complicada", "Complicated planning"),
      opt("no_right_lodging", "No encontrar alojamiento adecuado", "Not finding suitable lodging"),
      opt("not_enough_space", "Falta de espacio", "Not enough space"),
      opt("unexpected_costs", "Costos inesperados", "Unexpected costs"),
      opt("hard_to_agree", "Diferencias para ponerse de acuerdo", "Hard to agree"),
      opt("personal_health", "Situaciones personales, familiares o de salud", "Personal, family, or health situations"),
      opt("booking_distrust", "Desconfianza al reservar", "Distrust when booking"),
      opt("nothing_important", "Nada importante", "Nothing important"),
      opt("prefer_not_say", "Prefieren no responder", "Prefer not to answer"),
    ],
  },
  {
    id: "p22", number: 6, max: 1, withContext: true,
    titleEs: "¿Cuál de estas situaciones les ha sucedido con mayor frecuencia?",
    titleEn: "Which of these situations has happened to them most often?",
    options: [
      opt("travel_less", "Viajan menos de lo que quieren", "They travel less than they want"),
      opt("fewer_nights", "Se quedan menos noches", "They stay fewer nights"),
      opt("overspend", "Gastan más de lo planeado", "They spend more than planned"),
      opt("sacrifice_quality", "Sacrifican calidad", "They sacrifice quality"),
      opt("miss_dates", "No consiguen las fechas deseadas", "They miss the dates they want"),
      opt("not_enough_space", "No encuentran suficiente espacio", "They can't find enough space"),
      opt("organizing_takes_time", "Organizar toma demasiado tiempo", "Planning takes too much time"),
      opt("postpone", "Posponen las vacaciones", "They postpone vacations"),
      opt("uneven_enjoyment", "No todos disfrutan igualmente", "Not everyone enjoys it equally"),
      opt("as_planned", "Viajan como lo planean", "They travel as planned"),
    ],
  },
  {
    id: "p23", number: 7, max: 2, withContext: true,
    titleEs: "¿Qué les preocuparía más al asumir un compromiso vacacional?",
    titleEn: "What would concern them most about taking on a vacation commitment?",
    options: [
      opt("pay_unused", "Pagar por algo que no utilicen", "Paying for something they won't use"),
      opt("no_availability", "No encontrar disponibilidad", "Not finding availability"),
      opt("rising_costs", "Que los costos aumenten", "Costs going up"),
      opt("extra_fees", "Cuotas o cargos adicionales", "Fees or extra charges"),
      opt("no_flexibility", "Falta de flexibilidad", "Lack of flexibility"),
      opt("too_long", "Compromiso demasiado largo", "Commitment that is too long"),
      opt("dont_understand", "No entender cómo funciona", "Not understanding how it works"),
      opt("rushed_decision", "Tomar una decisión apresurada", "Making a rushed decision"),
      opt("travel_style_change", "Que cambie su forma de viajar", "Their travel style changing"),
      opt("not_enough_trust", "No confiar suficientemente", "Not trusting enough"),
      opt("no_specific_worry", "Ninguna preocupación específica", "No specific concern"),
      opt("prefer_not_say", "Prefieren no responder", "Prefer not to answer"),
    ],
  },
  {
    id: "p24", number: 8, max: 1, withContext: true,
    titleEs: "Cuando organizan una vacación, ¿cómo toman normalmente la decisión?",
    titleEn: "When they plan a vacation, how do they usually make the decision?",
    options: [
      opt("person_present", "Decide la persona presente", "The person present decides"),
      opt("decide_together", "Deciden juntos quienes viajan", "Those who travel decide together"),
      opt("one_proposes_numbers", "Una persona propone y otra revisa números", "One proposes and another reviews numbers"),
      opt("one_organizes_confirms", "Una persona organiza y otra confirma", "One organizes and another confirms"),
      opt("someone_absent", "Participa alguien que no está presente", "Someone who is not present takes part"),
      opt("depends_trip", "Depende del viaje", "It depends on the trip"),
    ],
  },
  {
    id: "p25", number: 9, max: 3, withContext: true,
    titleEs: "Cuando toman una decisión importante, ¿qué necesitan normalmente?",
    titleEn: "When they make an important decision, what do they usually need?",
    options: [
      opt("clear_how", "Entender claramente cómo funciona", "Clearly understand how it works"),
      opt("review_numbers", "Revisar los números", "Review the numbers"),
      opt("compare_options", "Comparar opciones", "Compare options"),
      opt("real_examples", "Ver ejemplos reales", "See real examples"),
      opt("read_terms", "Leer las condiciones", "Read the terms"),
      opt("confirm_availability", "Confirmar disponibilidad", "Confirm availability"),
      opt("ask_someone", "Consultar con otra persona", "Check with someone else"),
      opt("time_to_think", "Tener tiempo para pensarlo", "Have time to think it over"),
      opt("trust_explainer", "Sentir confianza en quien explica", "Trust the person explaining"),
      opt("everyone_agrees", "Estar todos de acuerdo", "Everyone agrees"),
    ],
  },
];

/** @type {Q[]} */
const TIMESHARE = [
  {
    id: "t1", number: 1, max: 1, withContext: true,
    titleEs: "Antes de esta experiencia, ¿qué opinión tenían sobre clubes vacacionales o tiempos compartidos?",
    titleEn: "Before this experience, what opinion did they have about vacation clubs or timeshares?",
    options: [
      opt("very_positive", "Muy positiva", "Very positive"),
      opt("positive", "Positiva", "Positive"),
      opt("neutral", "Neutral", "Neutral"),
      opt("some_doubts", "Tenían algunas dudas", "They had some doubts"),
      opt("negative", "Negativa", "Negative"),
      opt("very_negative", "Muy negativa", "Very negative"),
      opt("no_opinion", "No tenían una opinión", "They had no opinion"),
    ],
  },
  {
    id: "t2", number: 2, max: 2, withContext: true,
    titleEs: "¿Qué ha influido más en esa opinión?",
    titleEn: "What has influenced that opinion the most?",
    options: [
      opt("own_experience", "Experiencia propia", "Their own experience"),
      opt("family_friends", "Familiares o amigos", "Family or friends"),
      opt("prior_presentation", "Presentación anterior", "A previous presentation"),
      opt("current_prior_membership", "Membresía actual o anterior", "Current or prior membership"),
      opt("internet_info", "Información de internet", "Information online"),
      opt("costs_fees", "Costos o cuotas", "Costs or fees"),
      opt("availability", "Disponibilidad", "Availability"),
      opt("positive_stories", "Experiencias positivas", "Positive experiences"),
      opt("little_knowledge", "Poco conocimiento del concepto", "Little knowledge of the concept"),
      opt("other", "Otro", "Other"),
    ],
  },
  {
    id: "t3", number: 3, max: 1, withContext: true,
    titleEs: "¿Han asistido anteriormente a una presentación?",
    titleEn: "Have they attended a presentation before?",
    options: [
      opt("never", "Nunca", "Never"),
      opt("once", "Una vez", "Once"),
      opt("several", "Varias veces", "Several times"),
      opt("dont_remember", "No recuerdan", "They don't remember"),
    ],
  },
  {
    id: "t4", number: 4, max: 1, withContext: true,
    titleEs: "¿Cuál fue el resultado de la presentación más reciente?",
    titleEn: "What was the result of the most recent presentation?",
    options: [
      opt("only_learned", "Solo conocieron el programa", "They only learned about the program"),
      opt("considered_no_buy", "Lo consideraron, pero no compraron", "They considered it but did not buy"),
      opt("bought", "Compraron", "They bought"),
      opt("bought_canceled", "Compraron y cancelaron", "They bought and canceled"),
      opt("unclear_memory", "No recuerdan claramente", "They don't remember clearly"),
      opt("not_applicable", "No aplica", "Not applicable"),
    ],
  },
  {
    id: "t5", number: 5, max: 2, withContext: true,
    titleEs: "Si no compraron, ¿qué influyó principalmente?",
    titleEn: "If they did not buy, what mainly influenced that?",
    options: [
      opt("not_the_moment", "No era el momento", "It wasn't the right time"),
      opt("price", "Precio", "Price"),
      opt("down_payment", "Enganche", "Down payment"),
      opt("monthly", "Mensualidad", "Monthly payment"),
      opt("fees", "Cuotas", "Fees"),
      opt("didnt_understand", "No entendieron cómo funcionaba", "They didn't understand how it worked"),
      opt("not_enough_value", "No vieron suficiente valor", "They didn't see enough value"),
      opt("no_flexibility", "Falta de flexibilidad", "Lack of flexibility"),
      opt("availability_doubts", "Dudas sobre disponibilidad", "Doubts about availability"),
      opt("lack_of_trust", "Falta de confianza", "Lack of trust"),
      opt("wanted_to_research", "Querían investigar o comparar", "They wanted to research or compare"),
      opt("felt_pressured", "Se sintieron presionados", "They felt pressured"),
      opt("already_had_product", "Ya tenían otro producto", "They already had another product"),
      opt("missing_decision_maker", "Faltaba alguien para decidir", "Someone needed for the decision was missing"),
      opt("other", "Otro", "Other"),
      opt("not_applicable", "No aplica", "Not applicable"),
    ],
  },
  {
    id: "t6", number: 6, max: 1, withContext: true,
    titleEs: "¿Actualmente tienen o han tenido una membresía, club o propiedad vacacional?",
    titleEn: "Do they currently have or have they had a membership, club, or vacation property?",
    options: [
      opt("never_had", "Nunca han tenido", "They have never had one"),
      opt("have_one", "Actualmente tienen una", "They currently have one"),
      opt("have_more", "Tienen más de una", "They have more than one"),
      opt("had_before", "Tuvieron una anteriormente", "They had one before"),
      opt("bought_canceled", "Compraron y cancelaron", "They bought and canceled"),
      opt("inheritance", "Herencia o transferencia", "Inheritance or transfer"),
      opt("not_sure", "No están seguros", "They are not sure"),
    ],
  },
  {
    id: "t7", number: 7, max: 3, withContext: true,
    titleEs: "¿Qué los motivó principalmente a comprar?",
    titleEn: "What mainly motivated them to buy?",
    options: [
      opt("travel_more", "Viajar más veces", "Travel more often"),
      opt("secure_future", "Asegurar vacaciones futuras", "Secure future vacations"),
      opt("better_quality", "Mejorar calidad y servicio", "Improve quality and service"),
      opt("more_space", "Tener más espacio", "Have more space"),
      opt("family_memories", "Crear recuerdos en familia", "Create family memories"),
      opt("more_destinations", "Acceder a más destinos", "Access more destinations"),
      opt("hedge_prices", "Protegerse del aumento de precios", "Protect against rising prices"),
      opt("use_exchanges", "Usar intercambios", "Use exchanges"),
      opt("presentation_convinced", "La presentación les convenció", "The presentation convinced them"),
      opt("special_benefits", "Beneficios especiales", "Special benefits"),
      opt("other", "Otro", "Other"),
      opt("not_applicable", "No aplica", "Not applicable"),
    ],
  },
  {
    id: "t8", number: 8, max: 1, withContext: true,
    titleEs: "¿Ese producto cubre actualmente su forma de vacacionar?",
    titleEn: "Does that product currently cover their way of vacationing?",
    options: [
      opt("yes_fully", "Sí, completamente", "Yes, completely"),
      opt("mostly", "Cubre la mayor parte", "It covers most of it"),
      opt("partially", "Solo parcialmente", "Only partially"),
      opt("does_not", "No la cubre", "It does not"),
      opt("not_sure", "No están seguros", "They are not sure"),
      opt("not_applicable", "No aplica", "Not applicable"),
    ],
  },
  {
    id: "t9", number: 9, max: 3, withContext: true,
    titleEs: "¿Cómo describirían su experiencia general?",
    titleEn: "How would they describe their overall experience?",
    options: [
      opt("use_satisfied", "La utilizan y están satisfechos", "They use it and are satisfied"),
      opt("satisfied_little_use", "Satisfechos, pero la usan poco", "Satisfied, but they use it little"),
      opt("hard_availability", "Difícil disponibilidad", "Hard to get availability"),
      opt("dont_know_use", "No saben aprovecharla", "They don't know how to make the most of it"),
      opt("costs_rose", "Los costos aumentaron", "Costs increased"),
      opt("lose_points", "Pierden puntos o semanas", "They lose points or weeks"),
      opt("not_fit_family", "Ya no se adapta a la familia", "It no longer fits the family"),
      opt("not_fit_travel", "Ya no se adapta a su forma de viajar", "It no longer fits how they travel"),
      opt("want_change", "Quieren hacer un cambio", "They want to make a change"),
      opt("prefer_not_say", "Prefieren no responder", "Prefer not to answer"),
      opt("not_applicable", "No aplica", "Not applicable"),
    ],
  },
  {
    id: "t10", number: 10, max: 2, withContext: true,
    titleEs: "¿Cuál es el principal problema con su propiedad o membresía?",
    titleEn: "What is the main problem with their property or membership?",
    options: [
      opt("dont_use", "No la utilizan", "They don't use it"),
      opt("no_availability", "Falta de disponibilidad", "Lack of availability"),
      opt("book_too_early", "Deben reservar demasiado pronto", "They have to book too far ahead"),
      opt("few_destinations", "Pocos destinos", "Few destinations"),
      opt("not_enough_points", "Puntos insuficientes", "Not enough points"),
      opt("wrong_season", "Temporada inadecuada", "Wrong season"),
      opt("not_enough_space", "Espacio insuficiente", "Not enough space"),
      opt("high_fees", "Cuotas elevadas", "High fees"),
      opt("high_monthly", "Mensualidad elevada", "High monthly payment"),
      opt("hard_exchange", "Intercambio complicado", "Complicated exchange"),
      opt("exchange_costs", "Costos de intercambio", "Exchange costs"),
      opt("poor_service", "Mala atención", "Poor service"),
      opt("family_changed", "Cambió la familia", "The family changed"),
      opt("travel_changed", "Cambió su forma de viajar", "Their travel style changed"),
      opt("no_major_issue", "Ningún problema importante", "No major problem"),
      opt("other", "Otro", "Other"),
      opt("not_applicable", "No aplica", "Not applicable"),
    ],
  },
  {
    id: "t11", number: 11, max: 1, withContext: true,
    titleEs: "¿Qué les gustaría hacer con su producto actual o anterior?",
    titleEn: "What would they like to do with their current or previous product?",
    options: [
      opt("keep_as_is", "Conservarlo sin cambios", "Keep it as is"),
      opt("learn_better", "Aprender a utilizarlo mejor", "Learn to use it better"),
      opt("more_capacity", "Tener mayor capacidad", "Have more capacity"),
      opt("complement", "Complementarlo", "Complement it"),
      opt("upgrade", "Actualizarlo", "Upgrade it"),
      opt("consolidate", "Consolidarlo con otro producto", "Consolidate it with another product"),
      opt("sell_or_leave", "Venderlo o dejarlo", "Sell it or leave it"),
      opt("not_sure_yet", "Todavía no lo saben", "They don't know yet"),
      opt("not_applicable", "No aplica", "Not applicable"),
    ],
  },
];

/** @type {Q} */
const HAS_TS = {
  id: "hasTs", max: 1, withContext: false,
  titleEs: "¿El cliente tiene actualmente uno o más timeshares o clubes vacacionales?",
  titleEn: "Does the client currently have one or more timeshares or vacation clubs?",
  options: [
    opt("yes", "Sí", "Yes"),
    opt("no", "No", "No"),
    opt("had_before", "Tuvo anteriormente", "Had one before"),
    opt("not_sure", "No está seguro", "Not sure"),
  ],
};

const ALL = [...BEFORE, ...STYLE, ...AFTER, ...TIMESHARE, HAS_TS];

function titleKey(id) {
  return `survey.disc.q.${id}.title`;
}
function labelKey(id) {
  return `survey.disc.q.${id}.label`;
}
function optKey(qid, okey) {
  return `survey.disc.q.${qid}.opt.${okey}`;
}

function buildCatalog() {
  const es = {};
  const en = {};
  // UI chrome
  const chrome = {
    "survey.disc.help.selectUpTo": { es: "Selecciona hasta {n}", en: "Select up to {n}" },
    "survey.disc.context.add": { es: "+ Agregar contexto", en: "+ Add context" },
    "survey.disc.context.placeholder": {
      es: "Contexto adicional, frase textual o información por validar…",
      en: "Additional context, exact quote, or information to validate…",
    },
    "survey.disc.context.note": {
      es: "Las notas de contexto son texto libre del vendedor y no se traducen al cambiar el idioma.",
      en: "Context notes are free text from the seller and are not translated when the language changes.",
    },
    "survey.disc.membership.title": { es: "Membresías / Timeshare del cliente", en: "Client memberships / timeshare" },
    "survey.disc.membership.sub": {
      es: "Registra todas las propiedades, clubes o membresías que tenga o haya tenido.",
      en: "Record every property, club, or membership they have or have had.",
    },
    "survey.disc.membership.empty": {
      es: "Sin membresías registradas. Usa “+ Agregar membresía”.",
      en: "No memberships recorded. Use “+ Add membership”.",
    },
    "survey.disc.membership.add": { es: "+ Agregar membresía", en: "+ Add membership" },
    "survey.disc.membership.addHint": {
      es: "Se pueden agregar tantas filas como sean necesarias.",
      en: "You can add as many rows as needed.",
    },
    "survey.disc.membership.remove": { es: "Eliminar membresía", en: "Remove membership" },
    "survey.disc.membership.col.hotel": { es: "Hotel / programa", en: "Hotel / program" },
    "survey.disc.membership.col.place": { es: "Lugar de compra", en: "Purchase location" },
    "survey.disc.membership.col.date": { es: "Fecha", en: "Date" },
    "survey.disc.membership.col.cost": { es: "Costo", en: "Cost" },
    "survey.disc.membership.col.paysMaint": { es: "¿Paga mantenimiento?", en: "Pays maintenance?" },
    "survey.disc.membership.col.maintAmount": { es: "Monto mantenimiento", en: "Maintenance amount" },
    "survey.disc.membership.col.paidFull": { es: "¿Pagado totalmente?", en: "Paid in full?" },
    "survey.disc.membership.col.type": { es: "Tipo", en: "Type" },
    "survey.disc.membership.col.notes": { es: "Notas", en: "Notes" },
    "survey.disc.membership.ph.hotel": { es: "Hotel o programa", en: "Hotel or program" },
    "survey.disc.membership.ph.place": { es: "Lugar de compra", en: "Purchase location" },
    "survey.disc.membership.ph.notes": { es: "Notas", en: "Notes" },
    "survey.disc.membership.select": { es: "Selecciona", en: "Select" },
    "survey.disc.membership.type.select": { es: "Tipo", en: "Type" },
    "survey.disc.membership.type.fixed_week": { es: "Semana fija", en: "Fixed week" },
    "survey.disc.membership.type.floating_week": { es: "Semana flotante", en: "Floating week" },
    "survey.disc.membership.type.points": { es: "Puntos", en: "Points" },
    "survey.disc.membership.type.other": { es: "Otro", en: "Other" },
    "survey.disc.yes": { es: "Sí", en: "Yes" },
    "survey.disc.no": { es: "No", en: "No" },
    "survey.disc.section.motivaciones.title": { es: "1. Motivaciones", en: "1. Motivations" },
    "survey.disc.section.motivaciones.sub": {
      es: "Abre la conversación y conoce qué busca, qué valora, qué le frena y cómo decide.",
      en: "Open the conversation and learn what they seek, value, what holds them back, and how they decide.",
    },
    "survey.disc.section.timeshare.title": { es: "2. Timeshare Information", en: "2. Timeshare Information" },
    "survey.disc.section.timeshare.sub": {
      es: "Preguntas de experiencia primero; después, registro detallado de cada membresía.",
      en: "Experience questions first; then a detailed record of each membership.",
    },
    "survey.disc.configQuestions": { es: "⚙ Configurar preguntas", en: "⚙ Configure questions" },
    "survey.disc.config.title": { es: "Configurar preguntas", en: "Configure questions" },
    "survey.disc.config.sub": {
      es: "Activa, desactiva u ordena las preguntas del banco estándar. Solo aplica a tu cuenta.",
      en: "Enable, disable, or reorder the standard question bank. Applies only to your account.",
    },
    "survey.disc.config.drag": { es: "Arrastrar para reordenar", en: "Drag to reorder" },
    "survey.disc.config.moveUp": { es: "Subir", en: "Move up" },
    "survey.disc.config.moveDown": { es: "Bajar", en: "Move down" },
    "survey.disc.config.liveOff": {
      es: "{label} desactivada; no aparece en el Survey.",
      en: "{label} disabled; it will not appear in the Survey.",
    },
    "survey.disc.config.liveNum": {
      es: "{label} ahora es la pregunta {n} en esta sección.",
      en: "{label} is now question {n} in this section.",
    },
    "survey.disc.config.empty": { es: "No hay preguntas en esta sección.", en: "No questions in this section." },
    "survey.disc.config.needLogin": {
      es: "Debes iniciar sesión para guardar tu configuración.",
      en: "You must sign in to save your configuration.",
    },
    "survey.disc.config.bankMissing": {
      es: "El banco de preguntas aún no está disponible en el servidor. Aplica la migración 0043.",
      en: "The question bank is not available on the server yet. Apply migration 0043.",
    },
    "survey.disc.config.saveError": {
      es: "No se pudo guardar la configuración.",
      en: "Could not save the configuration.",
    },
    "survey.disc.config.cancel": { es: "Cancelar", en: "Cancel" },
    "survey.disc.config.save": { es: "Guardar", en: "Save" },
    "survey.disc.config.saving": { es: "Guardando…", en: "Saving…" },
  };
  for (const [k, v] of Object.entries(chrome)) {
    es[k] = v.es;
    en[k] = v.en;
  }
  for (const q of ALL) {
    es[titleKey(q.id)] = q.titleEs;
    en[titleKey(q.id)] = q.titleEn;
    if (q.labelEs) {
      es[labelKey(q.id)] = q.labelEs;
      en[labelKey(q.id)] = q.labelEn;
    }
    for (const o of q.options) {
      es[optKey(q.id, o.key)] = o.es;
      en[optKey(q.id, o.key)] = o.en;
    }
  }
  return { es, en };
}

function buildLegacyMap() {
  /** @type {Record<string, string>} */
  const map = {};
  for (const q of ALL) {
    for (const o of q.options) {
      map[`${q.id}::${o.es}`] = o.key;
      // also bare text for hasTs single-field legacy
      if (q.id === "hasTs") map[`hasTs::${o.es}`] = o.key;
    }
  }
  // membership legacy
  map["memb::Sí"] = "yes";
  map["memb::No"] = "no";
  map["memb::Semana fija"] = "fixed_week";
  map["memb::Semana flotante"] = "floating_week";
  map["memb::Puntos"] = "points";
  map["memb::Otro"] = "other";
  return map;
}

function qExport(q, { style = false } = {}) {
  const base = {
    id: q.id,
    max: q.max,
    optionKeys: q.options.map((o) => o.key),
    titleKey: titleKey(q.id),
  };
  if (style) {
    return { ...base, labelKey: labelKey(q.id) };
  }
  return {
    ...base,
    number: q.number,
    withContext: q.withContext !== false,
  };
}

function writeDiscoveryJs() {
  const out = `/** Preguntas Discovery por clave estable (i18n). Generado por build-survey-discovery-i18n.mjs */

export const MOTIVACIONES_BEFORE_STYLE = ${JSON.stringify(BEFORE.map((q) => qExport(q)), null, 2)};

export const STYLE_QUESTIONS = ${JSON.stringify(STYLE.map((q) => qExport(q, { style: true })), null, 2)};

export const MOTIVACIONES_AFTER_STYLE = ${JSON.stringify(AFTER.map((q) => qExport(q)), null, 2)};

export const MOTIVACIONES_QUESTIONS = [
  ...MOTIVACIONES_BEFORE_STYLE,
  ...MOTIVACIONES_AFTER_STYLE,
];

export const TIMESHARE_QUESTIONS = ${JSON.stringify(TIMESHARE.map((q) => qExport(q)), null, 2)};

export const HAS_TS_QUESTION = ${JSON.stringify({ ...qExport(HAS_TS), withContext: false }, null, 2)};

export const MEMBERSHIP_TYPE_KEYS = ["fixed_week", "floating_week", "points", "other"];
export const YES_NO_KEYS = ["yes", "no"];

/** @deprecated usar MEMBERSHIP_TYPE_KEYS */
export const MEMBERSHIP_TYPES = MEMBERSHIP_TYPE_KEYS;
/** @deprecated usar YES_NO_KEYS */
export const YES_NO = YES_NO_KEYS;

export const PROGRESS_QUESTION_IDS = [
  ...MOTIVACIONES_QUESTIONS.map((q) => q.id),
  ...TIMESHARE_QUESTIONS.map((q) => q.id),
];

export const ALL_DISCOVERY_QUESTIONS = [
  ...MOTIVACIONES_BEFORE_STYLE,
  ...STYLE_QUESTIONS,
  ...MOTIVACIONES_AFTER_STYLE,
  ...TIMESHARE_QUESTIONS,
  HAS_TS_QUESTION,
];

export function emptyMembership() {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : \`m-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
  return {
    id,
    hotel: "",
    place: "",
    date: "",
    cost: "",
    paysMaint: "",
    maintAmount: "",
    paidFull: "",
    type: "",
    notes: "",
  };
}

export function toggleChip(selected, optionKey, max) {
  const cur = Array.isArray(selected) ? [...selected] : [];
  const idx = cur.indexOf(optionKey);
  if (idx >= 0) {
    cur.splice(idx, 1);
    return cur;
  }
  if (max === 1) return [optionKey];
  if (cur.length >= max) return cur;
  cur.push(optionKey);
  return cur;
}

export function optionTitleKey(questionId, optionKey) {
  return \`survey.disc.q.\${questionId}.opt.\${optionKey}\`;
}

export function questionTitleKey(questionId) {
  return \`survey.disc.q.\${questionId}.title\`;
}

export function questionLabelKey(questionId) {
  return \`survey.disc.q.\${questionId}.label\`;
}
`;
  fs.writeFileSync(path.join(root, "apps/web/src/lib/survey/discovery-questions.js"), out);
}

function writeCatalog(es, en) {
  const body = `/** Catálogo i18n Discovery Survey. Generado por build-survey-discovery-i18n.mjs */
export const ES_SURVEY_DISC = ${JSON.stringify(es, null, 2)};
export const EN_SURVEY_DISC = ${JSON.stringify(en, null, 2)};
`;
  fs.writeFileSync(path.join(root, "apps/web/src/lib/i18n-survey-discovery-catalog.js"), body);
}

function writeLegacy(map) {
  const body = `/** Mapa texto ES histórico → clave de opción. Generado por build-survey-discovery-i18n.mjs */
export const LEGACY_OPTION_TEXT_TO_KEY = ${JSON.stringify(map, null, 2)};
`;
  fs.writeFileSync(path.join(root, "apps/web/src/lib/survey/legacy-option-map.js"), body);
}

function writeSql() {
  const updates = ALL.map((q) => {
    const keysJson = JSON.stringify(q.options.map((o) => o.key)).replace(/'/g, "''");
    return `update public.survey_preguntas
set opciones = '${keysJson}'::jsonb, updated_at = now()
where clave = '${q.id}';`;
  }).join("\n\n");

  const sql = `-- Convierte opciones del banco Discovery de texto ES a claves estables
${updates}
`;
  fs.writeFileSync(path.join(root, "supabase/migrations/0044_survey_opciones_keys.sql"), sql);
}

const { es, en } = buildCatalog();
const legacy = buildLegacyMap();
writeDiscoveryJs();
writeCatalog(es, en);
writeLegacy(legacy);
writeSql();
console.log("ok questions=", ALL.length, "i18nKeys=", Object.keys(es).length);
