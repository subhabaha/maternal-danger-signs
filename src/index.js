'use strict';
/**
 * maternal-danger-signs
 *
 * A small, dependency-free screen for danger signs in pregnancy and after
 * delivery, and for medicines that are unsafe in pregnancy. It is meant for
 * community health workers, nurses and doctors in primary care.
 *
 * Design rules:
 *  - Deterministic. The same input always gives the same output; no AI model,
 *    no network call. Every rule is plain JSON in ../data with its source.
 *  - Tuned to over-trigger. A false alarm costs a visit; a missed eclampsia or
 *    ectopic pregnancy can cost a life. Unknown gestational age therefore
 *    satisfies week limits rather than suppressing an alert.
 *  - Decision support only. It never says "normal" or "safe"; an empty result
 *    means "no listed danger sign was found in what was entered".
 */

const DANGER = require('../data/danger-signs.json');
const MEDS = require('../data/pregnancy-medicines.json');

const LEVEL_RANK = { emergency: 3, same_day: 2, routine: 1, none: 0 };
const SYMPTOMS = [
  'convulsions', 'vaginal_bleeding', 'heavy_bleeding', 'missed_period', 'severe_abdominal_pain',
  'lower_abdominal_pain', 'shoulder_tip_pain', 'fainting', 'severe_headache', 'blurred_vision',
  'epigastric_pain', 'fast_or_difficult_breathing', 'chest_pain', 'fever', 'too_weak_to_get_up',
  'foul_discharge', 'leaking_fluid', 'reduced_fetal_movements', 'swelling_face_hands',
  'calf_pain_swelling', 'severe_vomiting', 'burning_urination', 'flank_pain', 'thoughts_of_self_harm',
];

const DISCLAIMER = 'Decision support only. This screen lists danger signs from national and WHO guidance; '
  + 'it does not diagnose, and an empty result does not mean the woman is well. Use clinical judgement.';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalise the caller's observation object. Accepts "bp": "150/100" as a shortcut. */
function normalise(obs = {}) {
  const vitals = { ...(obs.vitals || {}) };
  if (obs.bp || vitals.bp) {
    const m = String(obs.bp || vitals.bp).match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    if (m) { vitals.systolic = vitals.systolic ?? Number(m[1]); vitals.diastolic = vitals.diastolic ?? Number(m[2]); }
  }
  const symptoms = new Set((obs.symptoms || []).map((s) => String(s).trim().toLowerCase()));
  return {
    stage: obs.stage ? String(obs.stage).toLowerCase() : 'unknown',
    weeks: num(obs.gestational_weeks),
    daysPostpartum: num(obs.days_postpartum),
    symptoms,
    vitals: {
      systolic: num(vitals.systolic),
      diastolic: num(vitals.diastolic),
      temperature_c: num(vitals.temperature_c),
      respiratory_rate: num(vitals.respiratory_rate),
      haemoglobin_g_dl: num(vitals.haemoglobin_g_dl),
    },
  };
}

function vitalTest(key, value, v) {
  // key looks like "systolic_gte" or "haemoglobin_g_dl_lt"
  const m = key.match(/^(.*)_(gte|lt)$/);
  if (!m) throw new Error(`Unknown vital test ${key}`);
  const actual = v[m[1]];
  if (actual === null || actual === undefined) return false;
  return m[2] === 'gte' ? actual >= value : actual < value;
}

/** Evaluate one rule condition. Unknown stage matches nothing except stage-free rules. */
function matches(when, o) {
  if (when.stage && !when.stage.includes(o.stage)) return false;
  if (when.min_weeks !== undefined && o.weeks !== null && o.weeks < when.min_weeks) return false;
  if (when.max_weeks !== undefined && o.weeks !== null && o.weeks > when.max_weeks) return false;
  if (when.max_days_postpartum !== undefined && o.daysPostpartum !== null && o.daysPostpartum > when.max_days_postpartum) return false;
  if (when.symptoms_any && !when.symptoms_any.some((s) => o.symptoms.has(s))) return false;
  if (when.symptoms_all && !when.symptoms_all.every((s) => o.symptoms.has(s))) return false;
  if (when.vitals_any && !Object.entries(when.vitals_any).some(([k, val]) => vitalTest(k, val, o.vitals))) return false;
  if (when.vitals_all && !Object.entries(when.vitals_all).every(([k, val]) => vitalTest(k, val, o.vitals))) return false;
  if (when.any_of && !when.any_of.some((sub) => matches(sub, o))) return false;
  if (when.all_of && !when.all_of.every((sub) => matches(sub, o))) return false;
  return true;
}

function sourceList(ids, table) {
  return ids.map((id) => ({ id, text: table[id] || id }));
}

/**
 * Screen structured observations.
 * @param {object} obs { stage: 'pregnant'|'postpartum', gestational_weeks, days_postpartum,
 *                       symptoms: [codes], vitals: { systolic, diastolic, temperature_c,
 *                       respiratory_rate, haemoglobin_g_dl }, bp: '150/100', medicines: [names] }
 * @returns {{ level, alerts, medicine_alerts, disclaimer, version }}
 */
function screen(obs = {}) {
  const o = normalise(obs);
  const unknown = [...o.symptoms].filter((s) => !SYMPTOMS.includes(s));
  const alerts = DANGER.rules.filter((r) => matches(r.when, o)).map((r) => ({
    id: r.id,
    level: r.level,
    label: r.label,
    label_hi: r.label_hi,
    action: r.action,
    action_hi: r.action_hi,
    sources: sourceList(r.sources, DANGER.sources),
  }));
  // Keep the strongest message when a specific rule and a general rule overlap.
  const suppressed = new Set();
  const ids = new Set(alerts.map((a) => a.id));
  if (ids.has('preeclampsia_with_symptoms') || ids.has('severe_hypertension')) suppressed.add('hypertension_after_20_weeks');
  if (ids.has('possible_ectopic')) suppressed.add('early_pregnancy_pain');
  if (ids.has('fever_too_weak') || ids.has('postpartum_sepsis') || ids.has('urinary_infection_with_fever')) suppressed.add('fever');
  if (ids.has('postpartum_sepsis')) suppressed.add('foul_discharge');
  if (ids.has('postpartum_haemorrhage')) suppressed.add('postpartum_bleeding_check');
  const kept = alerts.filter((a) => !suppressed.has(a.id)).sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);

  const medicine_alerts = obs.medicines ? checkMedicines(obs.medicines, obs) : [];
  const level = kept.reduce((best, a) => (LEVEL_RANK[a.level] > LEVEL_RANK[best] ? a.level : best), 'none');
  return {
    level,
    alerts: kept,
    medicine_alerts,
    unknown_symptoms: unknown,
    emergency_numbers: level === 'emergency' ? { ambulance: '108', maternal_transport: '102' } : undefined,
    disclaimer: DISCLAIMER,
    version: DANGER.version,
  };
}

/**
 * Flag medicines that are unsafe in pregnancy.
 * @param {string[]} medicines free-text medicine names (generic names; strength and form are ignored)
 * @param {object} ctx { stage: 'pregnant' (default), gestational_weeks }
 */
function checkMedicines(medicines = [], ctx = {}) {
  const stage = ctx.stage ? String(ctx.stage).toLowerCase() : 'pregnant';
  if (stage !== 'pregnant') return [];
  const weeks = num(ctx.gestational_weeks);
  const out = [];
  for (const raw of medicines) {
    const name = String(raw).toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    for (const g of MEDS.groups) {
      if (g.stage && !g.stage.includes(stage)) continue;
      if (g.min_weeks !== undefined && weeks !== null && weeks < g.min_weeks) continue;
      if (g.max_weeks !== undefined && weeks !== null && weeks > g.max_weeks) continue;
      const hit = g.names.find((n) => new RegExp(`(^|\\s)${n.replace(/[-\s]/g, '[-\\s]?')}(\\s|$)`).test(name));
      if (hit) {
        out.push({ medicine: String(raw), matched: hit, group: g.id, level: g.level, label: g.label, reason: g.reason,
          sources: sourceList(g.sources, MEDS.sources) });
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Free-text screen (English, Hindi in Devanagari, and romanised Hindi).
// Keyword matching, deliberately broad. It does not understand negation:
// "no bleeding" still matches "bleeding". That is the safe direction.
// ---------------------------------------------------------------------------
const STAGE_WORDS = {
  postpartum: ['after delivery', 'delivered', 'postpartum', 'post partum', 'gave birth', 'prasav ke baad', 'delivery ke baad',
    'प्रसव के बाद', 'डिलीवरी के बाद', 'जचगी के बाद'],
  pregnant: ['pregnant', 'pregnancy', 'expecting', 'weeks pregnant', 'months pregnant', 'garbh', 'garbhvati',
    'गर्भ', 'गर्भवती', 'गर्भावस्था'],
};
const SYMPTOM_WORDS = {
  convulsions: [' fits', ' fit ', 'seizure', 'convulsion', 'daura', 'jhatke', 'दौरा', 'दौरे', 'झटके'],
  vaginal_bleeding: ['bleeding', 'bleed', 'spotting', 'khoon aa', 'khun aa', 'खून आ', 'खून जा', 'रक्तस्राव'],
  heavy_bleeding: ['heavy bleeding', 'bleeding a lot', 'bahut khoon', 'bahut khun', 'बहुत खून', 'ज़्यादा खून', 'ज्यादा खून'],
  missed_period: ['missed period', 'period late', 'period nahi', 'mahwari nahi', 'masik nahi', 'माहवारी नहीं', 'पीरियड नहीं', 'मासिक नहीं'],
  severe_abdominal_pain: ['severe abdominal pain', 'severe stomach pain', 'severe pain in abdomen', 'severe pain in stomach',
    'pet me tez dard', 'pet mein tez dard', 'पेट में तेज दर्द', 'पेट में बहुत दर्द'],
  lower_abdominal_pain: ['lower abdominal pain', 'pain in lower abdomen', 'lower stomach pain', 'neeche pet', 'niche pet',
    'पेट के निचले', 'नीचे पेट'],
  shoulder_tip_pain: ['shoulder tip pain', 'pain in the shoulder tip'],
  fainting: ['fainted', 'fainting', 'faint', 'passed out', 'behosh', 'बेहोश'],
  severe_headache: ['severe headache', 'bad headache', 'terrible headache', 'tez sir dard', 'sir me tez dard', 'sir mein tez dard',
    'तेज सिरदर्द', 'सिर में तेज दर्द', 'बहुत सिरदर्द'],
  blurred_vision: ['blurred vision', 'blurry vision', 'cannot see clearly', 'dhundhla', 'धुंधला'],
  epigastric_pain: ['upper abdominal pain', 'upper stomach pain', 'epigastric', 'pet ke upar dard', 'पेट के ऊपर'],
  fast_or_difficult_breathing: ['breathless', 'difficulty breathing', 'difficult breathing', 'short of breath', 'cannot breathe',
    'saans phool', 'saans lene me', 'सांस फूल', 'साँस फूल', 'सांस लेने में'],
  chest_pain: ['chest pain', 'pain in chest', 'seene me dard', 'seene mein dard', 'सीने में दर्द', 'छाती में दर्द'],
  fever: ['fever', 'high temperature', 'bukhar', 'bukhaar', 'बुखार'],
  too_weak_to_get_up: ['too weak', 'cannot get up', "can't get up", 'cannot get out of bed', 'bahut kamzori', 'uth nahi', 'बहुत कमजोरी', 'उठ नहीं'],
  foul_discharge: ['foul smelling discharge', 'foul-smelling discharge', 'smelly discharge', 'bad smell', 'badbudar', 'बदबूदार', 'बदबू'],
  leaking_fluid: ['water broke', 'waters broke', 'leaking water', 'leaking fluid', 'pani gir', 'paani gir', 'pani aa raha', 'पानी गिर', 'पानी आ रहा', 'पानी रिस'],
  reduced_fetal_movements: ['baby not moving', 'baby is not moving', 'reduced movement', 'less movement', 'baby moving less', 'moving less',
    'not moving as much', 'fewer kicks', 'not kicking', 'no kicks',
    'bachcha hil nahi', 'baccha hil nahi', 'halchal kam', 'बच्चा हिल नहीं', 'हलचल कम', 'हलचल नहीं'],
  swelling_face_hands: ['swelling of face', 'swollen face', 'face swelling', 'puffy face', 'swelling of hands', 'swollen hands',
    'chehre pe sujan', 'chehre par sujan', 'चेहरे पर सूजन', 'हाथों में सूजन'],
  calf_pain_swelling: ['calf pain', 'one leg swollen', 'swollen calf', 'pindli me dard', 'pindli mein dard', 'पिंडली में दर्द', 'पिंडली में सूजन'],
  severe_vomiting: ['vomiting everything', 'cannot keep anything down', "can't keep anything down", 'bahut ulti', 'बहुत उल्टी', 'लगातार उल्टी'],
  burning_urination: ['burning urine', 'burning urination', 'burning while passing urine', 'peshab me jalan', 'peshab mein jalan', 'पेशाब में जलन'],
  flank_pain: ['flank pain', 'pain in the side of the back'],
  thoughts_of_self_harm: ['kill myself', 'end my life', 'harm myself', 'hurt myself', 'harm my baby', 'hurt the baby', 'want to die',
    'marna chahti', 'mar jaana chahti', 'मरना चाहती', 'खुद को नुकसान', 'जान दे'],
};

function screenText(text = '', extra = {}) {
  const t = ` ${String(text).toLowerCase().replace(/\s+/g, ' ')} `;
  const has = (w) => t.includes(w.toLowerCase());
  let stage = extra.stage || 'unknown';
  if (stage === 'unknown') {
    if (STAGE_WORDS.postpartum.some(has)) stage = 'postpartum';
    else if (STAGE_WORDS.pregnant.some(has)) stage = 'pregnant';
  }
  const symptoms = Object.entries(SYMPTOM_WORDS).filter(([, words]) => words.some(has)).map(([code]) => code);
  const result = screen({ ...extra, stage, symptoms });
  return { ...result, stage, symptoms_found: symptoms };
}

module.exports = { screen, screenText, checkMedicines, SYMPTOMS, DISCLAIMER, rules: DANGER, medicines: MEDS };
