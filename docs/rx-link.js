// Recipes are browser-local. Include the ingredient snapshot so a link travels.
export function linkFor(rx) {
  const url = new URL(location.pathname, location.origin);
  const bytes = new TextEncoder().encode(JSON.stringify(rx));
  const encoded = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  url.searchParams.set('rx', btoa(encoded).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, ''));
  return url.href;
}

export function readLink(value) {
  if (!value || value.length > 100000) throw Error('Invalid link');
  const bytes = Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
  const rx = JSON.parse(new TextDecoder().decode(bytes));
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 1000;
  const percent = value => Number.isFinite(value) && value >= 0 && value <= 100.00000001;
  if (!text(rx.name) || !Number.isFinite(rx.batchGrams) || rx.batchGrams <= 0 ||
      !Array.isArray(rx.ingredients) || !rx.ingredients.length || !Array.isArray(rx.profile)) throw Error('Invalid recipe');
  for (const item of rx.ingredients) {
    if (!text(item.id) || !text(item.name) || !text(item.type) || !Number.isFinite(item.grams) || item.grams < 0 ||
        !item.profile || typeof item.profile !== 'object' || Array.isArray(item.profile) ||
        !Object.entries(item.profile).every(([key,v]) => text(key) && percent(v))) throw Error('Invalid ingredient');
  }
  if (!rx.profile.every(p => text(p.name) && percent(p.target) && percent(p.estimated))) throw Error('Invalid profile');
  if (rx.availableIngredientIds && !(Array.isArray(rx.availableIngredientIds) && rx.availableIngredientIds.every(text))) throw Error('Invalid inventory');
  return rx;
}
