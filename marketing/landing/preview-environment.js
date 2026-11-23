// This script is included only in the generated public example. A direct visit
// or an iframe with same-origin privileges must never boot the app runtime.
if (window === window.top || window.origin !== 'null') {
  document.querySelector('main').textContent = 'Explore this example on the RETRADE landing page.';
  throw new Error('This example requires an isolated preview window.');
}
function previewStorage() {
  const values = new Map();
  return { getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)), clear: () => values.clear() };
}
const localStorage = previewStorage(), sessionStorage = previewStorage();
// Keep reports, ageing, and newly added example records on the same trading
// day. Real elapsed time still advances for chart animation and generated IDs.
const previewClockStart = window.Date.now();
const previewNow = () => window.Date.parse(previewSeed.asOf) + window.Date.now() - previewClockStart;
const Date = new Proxy(window.Date, {
  construct(target, args) { return Reflect.construct(target, args.length ? args : [previewNow()]); },
  apply() { return new window.Date(previewNow()).toString(); },
  get(target, key) { return key === 'now' ? previewNow : Reflect.get(target, key); }
});
