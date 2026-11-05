'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { screen, screenText, checkMedicines, rules, medicines } = require('../src');

const ids = (r) => r.alerts.map((a) => a.id);

test('every rule cites a known source and has Hindi text', () => {
  for (const r of rules.rules) {
    assert.ok(r.sources.length > 0, r.id);
    for (const s of r.sources) assert.ok(rules.sources[s], `${r.id} cites unknown source ${s}`);
    assert.ok(r.label_hi && r.action_hi, `${r.id} lacks Hindi`);
  }
  for (const g of medicines.groups) for (const s of g.sources) assert.ok(medicines.sources[s], `${g.id} cites ${s}`);
});

test('convulsions in pregnancy are an emergency', () => {
  const r = screen({ stage: 'pregnant', gestational_weeks: 34, symptoms: ['convulsions'] });
  assert.equal(r.level, 'emergency');
  assert.ok(ids(r).includes('convulsions'));
  assert.equal(r.emergency_numbers.ambulance, '108');
});

test('BP 150/100 at 32 weeks with headache: pre-eclampsia emergency, plain hypertension alert suppressed', () => {
  const r = screen({ stage: 'pregnant', gestational_weeks: 32, bp: '150/100', symptoms: ['severe_headache'] });
  assert.equal(r.level, 'emergency');
  assert.ok(ids(r).includes('preeclampsia_with_symptoms'));
  assert.ok(!ids(r).includes('hypertension_after_20_weeks'));
});

test('BP 142/92 at 30 weeks without symptoms: same-day assessment', () => {
  const r = screen({ stage: 'pregnant', gestational_weeks: 30, vitals: { systolic: 142, diastolic: 92 } });
  assert.equal(r.level, 'same_day');
  assert.deepEqual(ids(r), ['hypertension_after_20_weeks']);
});

test('BP 142/92 at 12 weeks is not flagged as gestational hypertension', () => {
  const r = screen({ stage: 'pregnant', gestational_weeks: 12, bp: '142/92' });
  assert.equal(r.level, 'none');
});

test('severe hypertension is an emergency at any gestation', () => {
  const r = screen({ stage: 'pregnant', gestational_weeks: 10, bp: '165/100' });
  assert.equal(r.level, 'emergency');
  assert.ok(ids(r).includes('severe_hypertension'));
});

test('missed period with severe pain: possible ectopic', () => {
  const r = screen({ stage: 'unknown', symptoms: ['missed_period', 'severe_abdominal_pain'] });
  assert.equal(r.level, 'emergency');
  assert.ok(ids(r).includes('possible_ectopic'));
});

test('early pregnancy with lower abdominal pain: same-day assessment', () => {
  const r = screen({ stage: 'pregnant', gestational_weeks: 7, symptoms: ['lower_abdominal_pain'] });
  assert.equal(r.level, 'same_day');
  assert.ok(ids(r).includes('early_pregnancy_pain'));
});

test('haemoglobin thresholds follow WHO severity bands in pregnancy', () => {
  assert.ok(ids(screen({ stage: 'pregnant', vitals: { haemoglobin_g_dl: 6.4 } })).includes('severe_anaemia'));
  assert.ok(ids(screen({ stage: 'pregnant', vitals: { haemoglobin_g_dl: 8.5 } })).includes('moderate_anaemia'));
  assert.ok(ids(screen({ stage: 'pregnant', vitals: { haemoglobin_g_dl: 10.5 } })).includes('mild_anaemia'));
  assert.equal(screen({ stage: 'pregnant', vitals: { haemoglobin_g_dl: 11.5 } }).level, 'none');
});

test('postpartum fever with foul discharge: sepsis emergency, generic alerts suppressed', () => {
  const r = screen({ stage: 'postpartum', days_postpartum: 5, symptoms: ['foul_discharge'], vitals: { temperature_c: 38.6 } });
  assert.equal(r.level, 'emergency');
  assert.ok(ids(r).includes('postpartum_sepsis'));
  assert.ok(!ids(r).includes('fever'));
  assert.ok(!ids(r).includes('foul_discharge'));
});

test('reduced fetal movements only from 28 weeks', () => {
  assert.equal(screen({ stage: 'pregnant', gestational_weeks: 24, symptoms: ['reduced_fetal_movements'] }).level, 'none');
  assert.equal(screen({ stage: 'pregnant', gestational_weeks: 33, symptoms: ['reduced_fetal_movements'] }).level, 'same_day');
});

test('unknown gestation does not suppress an alert (safe direction)', () => {
  const r = screen({ stage: 'pregnant', bp: '146/94' });
  assert.ok(ids(r).includes('hypertension_after_20_weeks'));
});

test('self-harm thoughts after delivery are an emergency with Tele-MANAS', () => {
  const r = screen({ stage: 'postpartum', symptoms: ['thoughts_of_self_harm'] });
  assert.equal(r.level, 'emergency');
  assert.match(r.alerts[0].action, /14416/);
});

test('no stage given: pregnancy-specific rules do not fire', () => {
  assert.equal(screen({ symptoms: ['fever'] }).level, 'none');
});

test('medicines: ACE inhibitor and ARB contraindicated, NSAID only from 20 weeks, low-dose aspirin not flagged', () => {
  const early = checkMedicines(['Enalapril 5 mg', 'Telmisartan 40', 'Ibuprofen 400 mg', 'Aspirin 75 mg'], { gestational_weeks: 12 });
  assert.deepEqual(early.map((m) => m.group), ['ace_inhibitors', 'arbs']);
  const late = checkMedicines(['Ibuprofen 400 mg', 'Aspirin 75 mg'], { gestational_weeks: 26 });
  assert.deepEqual(late.map((m) => m.group), ['nsaids_after_20_weeks']);
});

test('medicines: carbimazole flagged in the first trimester only; albendazole too', () => {
  assert.equal(checkMedicines(['Carbimazole 10mg'], { gestational_weeks: 9 }).length, 1);
  assert.equal(checkMedicines(['Carbimazole 10mg'], { gestational_weeks: 22 }).length, 0);
  assert.equal(checkMedicines(['Albendazole 400'], { gestational_weeks: 8 })[0].group, 'anthelmintics_first_trimester');
  assert.equal(checkMedicines(['Albendazole 400'], { gestational_weeks: 20 }).length, 0);
});

test('medicines: methylergometrine flagged before delivery, not after', () => {
  assert.equal(checkMedicines(['Methylergometrine 0.125 mg'], { stage: 'pregnant' }).length, 1);
  assert.equal(checkMedicines(['Methylergometrine 0.125 mg'], { stage: 'postpartum' }).length, 0);
});

test('screen() includes medicine alerts when medicines are passed', () => {
  const r = screen({ stage: 'pregnant', gestational_weeks: 8, medicines: ['Atorvastatin 10 mg'] });
  assert.equal(r.medicine_alerts[0].group, 'statins');
});

test('free text: romanised Hindi pre-eclampsia picture', () => {
  const r = screenText('Main 8 mahine ki garbhvati hoon, tez sir dard aur sab dhundhla dikh raha hai', { bp: '156/104' });
  assert.equal(r.stage, 'pregnant');
  assert.equal(r.level, 'emergency');
  assert.ok(ids(r).includes('headache_with_blurred_vision'));
});

test('free text: Devanagari postpartum bleeding', () => {
  const r = screenText('डिलीवरी के बाद बहुत खून आ रहा है');
  assert.equal(r.stage, 'postpartum');
  assert.equal(r.level, 'emergency');
  assert.ok(ids(r).includes('postpartum_haemorrhage'));
});

test('free text: English reduced movements with known weeks', () => {
  const r = screenText('I am 34 weeks pregnant and the baby is moving less since morning', { gestational_weeks: 34 });
  assert.ok(ids(r).includes('reduced_fetal_movements'));
});

test('every symptom code used by a rule is a known code', () => {
  const { SYMPTOMS } = require('../src');
  const walk = (w) => {
    for (const k of ['symptoms_any', 'symptoms_all']) for (const s of (w[k] || [])) assert.ok(SYMPTOMS.includes(s), s);
    for (const sub of [...(w.any_of || []), ...(w.all_of || [])]) walk(sub);
  };
  for (const r of rules.rules) walk(r.when);
});

test('normal-sounding bleeding after delivery is a same-day check; heavy bleeding is an emergency', () => {
  const plain = screen({ stage: 'postpartum', days_postpartum: 3, symptoms: ['vaginal_bleeding'] });
  assert.equal(plain.level, 'same_day');
  const heavy = screen({ stage: 'postpartum', days_postpartum: 3, symptoms: ['vaginal_bleeding', 'heavy_bleeding'] });
  assert.equal(heavy.level, 'emergency');
  assert.ok(!ids(heavy).includes('postpartum_bleeding_check'));
});

test('free text: "benefit" is not read as a fit; "pet se" alone does not mean pregnant', () => {
  assert.ok(!screenText('I am pregnant and want to know the benefit of walking').symptoms_found.includes('convulsions'));
  assert.equal(screenText('pet se khoon aa raha hai').stage, 'unknown');
});
