import { createRecipe } from './contracts.mjs';

// Research-based trial limits, 7 October 2026. These are asking-price alert caps,
// not sold comparables or a profit guarantee. See TRIAL_2026-10-07.md.
export const canonBodyCaps = Object.freeze({
  '1000D':3000, '1100D':4000, '500D':4000, '550D':5500, '1200D':6000,
  '600D':6500, '100D':7000, '1300D':7000, '4000D':7500, '650D':8500,
  '700D':10000, '60D':10000, '2000D':11000, '750D':13000, '760D':14000,
  '70D':15000, '200D':15000, '250D':16000, '800D':16000, '80D':16000,
});
export function canonTierPresets() {
  const specs = [
    ['canon-cheap-sniper-60-v1', 'Cheap Sniper · up to £60', 0, 6000, 'exclude'],
    ['canon-61-100-v1', 'Canon Value · £60.01–£100', 6001, 10000, 'exclude'],
    ['canon-premium-160-v1', 'Canon Premium · £100.01–£160', 10001, 16000, 'exclude'],
    ['canon-bundles-150-v1', 'Canon Bundles · up to £150', 0, 15000, 'require'],
  ];
  return specs.map(([key,name,minPricePence,maxPricePence,bundleMode]) => {
    const caps = Object.fromEntries(Object.entries(canonBodyCaps)
      .map(([model,cap])=>[model,bundleMode==='require'?Math.min(15000,cap+4500):cap])
      .filter(([,cap])=>cap+(bundleMode==='require'?0:2000)>=minPricePence));
    return {key,data:{name,enabled:false,notifications:false,archived:false,
      recipe:createRecipe({models:Object.keys(caps),searchTerms:['Canon','EOS','Rebel'],
        minPricePence,maxPricePence,modelMaxPricePence:caps,bundleMode,kitAllowancePence:bundleMode==='require'?0:2000,
        conditions:['new','very_good','good'],
        titleRejectTerms:['spares','parts','repair','repairs','faulty','broken','untested',
          'not working','does not work','doesn’t work','doesnt work','won’t turn on','wont turn on',
          'water damage','sensor fault','shutter fault','error','err 01','err 20','err 30',
          'read description','read desc','reserved','wanted','looking for'],
        warningTerms:['no charger','charger missing','no battery','battery missing','scratched','fungus'],
      })}};
  });
}
