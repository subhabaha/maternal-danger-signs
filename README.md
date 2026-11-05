# maternal-danger-signs

A small, open-source screen for **danger signs in pregnancy and after delivery** and for **medicines that are unsafe in pregnancy**, in English and Hindi. It is built for the people who see women first in India's primary care: ASHAs, ANMs, nurses and clinic doctors.

> **Decision support only.** It lists danger signs drawn from public guidance from the Government of India (MoHFW) and WHO. It does not diagnose. If it finds nothing, that does **not** mean the woman is well. Use clinical judgement and local protocols.

Status: **v0.1.0 prototype (November 2026).** The rules have been written and unit-tested by the authors. They have **not yet been validated in the field** (see [Roadmap](#roadmap)).

## Why

The leading causes of maternal death in India (haemorrhage, sepsis, hypertensive disorders and obstructed labour), along with severe anaemia, often give warning signs that a health worker can recognise. Those signs are often missed in a rushed visit or never reach a doctor in time. Medicines that harm a fetus, such as ACE inhibitors or valproate, are still prescribed after a pregnancy begins. This library puts the published danger-sign lists and pregnancy medicine cautions into code that any app, SMS bot or clinic system can call. It needs no internet and no AI model.

## What it checks

| Area | Examples (see `data/danger-signs.json` for all 27 rules) | Level |
|---|---|---|
| Bleeding | bleeding in pregnancy; heavy bleeding after delivery (other bleeding after delivery: same-day check) | emergency / same day |
| Hypertension | BP ≥160/110 at any time; ≥140/90 after 20 weeks or after delivery, with or without headache, blurred vision or upper-abdominal pain | emergency / same day |
| Convulsions | fits in pregnancy or after delivery (possible eclampsia) | emergency |
| Early pregnancy | missed period with severe pain or fainting (possible ectopic) | emergency |
| Infection | fever and too weak to get up; fever with foul discharge after delivery; urinary symptoms with fever | emergency / same day |
| Baby | reduced fetal movements from 28 weeks; leaking fluid | same day / emergency |
| Anaemia | haemoglobin bands in pregnancy (WHO): severe <7, moderate 7.0–9.9, mild 10.0–10.9 g/dL | same day / routine |
| Clots | calf pain or swelling; chest pain | same day / emergency |
| Mental health | thoughts of harming herself or the baby (Tele-MANAS 14416) | emergency |
| Medicines | 24 groups, e.g. ACE inhibitors and ARBs, statins, warfarin, valproate, isotretinoin, methotrexate, NSAIDs from 20 weeks, carbimazole and albendazole in the first trimester | contraindicated / avoid / specialist |

Every rule names its source: the MoHFW Mother and Child Protection Card, WHO PCPNC, WHO guidance on pre-eclampsia and anaemia, NICE NG133 and NG126, RCOG Green-top guidelines, FDA and MHRA safety communications, and product labelling.

## Quick start

```bash
git clone https://github.com/subhabaha/maternal-danger-signs.git
cd maternal-danger-signs
npm test
node examples/cli.js '{"stage":"pregnant","gestational_weeks":32,"bp":"150/100","symptoms":["severe_headache"]}'
node examples/cli.js --text "डिलीवरी के बाद बहुत खून आ रहा है"
```

No dependencies; Node.js 18 or later.

## API

```js
const { screen, screenText, checkMedicines } = require('maternal-danger-signs');

screen({
  stage: 'pregnant',              // 'pregnant' | 'postpartum'
  gestational_weeks: 32,          // optional; unknown weeks never suppress an alert
  days_postpartum: undefined,     // optional
  symptoms: ['severe_headache'],  // codes, see SYMPTOMS
  bp: '150/100',                  // or vitals: { systolic, diastolic }
  vitals: { temperature_c: 37.2, respiratory_rate: 18, haemoglobin_g_dl: 9.1 },
  medicines: ['Telmisartan 40 mg'],
});
// → { level: 'emergency', alerts: [{ id, level, label, label_hi, action, action_hi, sources }],
//     medicine_alerts: [...], emergency_numbers: { ambulance: '108', maternal_transport: '102' }, disclaimer }

screenText('Main 8 mahine ki garbhvati hoon, tez sir dard aur dhundhla dikh raha hai');
// Keyword screen for English, Devanagari Hindi and romanised Hindi; infers pregnant/postpartum from the text.

checkMedicines(['Ibuprofen 400 mg', 'Aspirin 75 mg'], { gestational_weeks: 26 });
// → NSAID flagged from 20 weeks; low-dose aspirin (used to prevent pre-eclampsia) is not flagged.
```

## Design choices

- **Deterministic and offline.** The same input always gives the same answer. Rules are plain JSON that a clinician can read and correct.
- **Tuned to over-trigger.** An unknown gestational age satisfies week limits rather than hiding an alert. The free-text screen does not understand negation ("no bleeding" still matches "bleeding"). That is the safe direction for a screen.
- **Never reassures.** There is no "normal" output.

## Limitations

- Prototype rules, unit-tested only; no prospective field validation yet.
- Free text supports English and Hindi only; other Indian languages are on the roadmap.
- Keyword matching, not language understanding. Structured input is more reliable.
- The medicine list covers common, well-established cautions, not every drug. It matches generic names, not brand names.

## Roadmap

1. Review of every rule by practising obstetricians and community-health experts.
2. Field validation with ANMs and ASHAs: sensitivity for referral-worthy cases against facility outcomes.
3. More languages: Bengali, Marathi, Tamil, Telugu, Gujarati, Kannada, Odia, Punjabi.
4. Postnatal newborn danger signs (IMNCI) as a companion module.
5. A small Android/offline wrapper and an SMS/IVR example for feature phones.
6. Public, anonymised, aggregate counts of alerts by type and district (no personal data), so programme teams can see where danger signs cluster.

## Who maintains it

[InstaDataHelp AI Services Private Limited](https://instapraxis.instadatahelp.com), Jaipur, India (DPIIT-recognised startup), the team behind the InstaPraxis clinic platform. It grew out of the rule-based red-flag screen inside InstaPraxis. This library is the open, standalone version for anyone to use, and InstaPraxis will use it as one layer of its own safety checks.

Contact: subhabaha@instadatahelp.com. Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
