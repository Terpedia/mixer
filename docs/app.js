const $ = id => document.getElementById(id);
const catalog = await fetch('./catalog.json').then(r => r.json());
const leads = await fetch('./isolates.json').then(r => r.json());
const customKey = 'terpedia.isolates.v1';
const personal = JSON.parse(localStorage.getItem(customKey) || '[]');
catalog.push(...personal);
const picker = $('isolatePicker');
for (const [index, lead] of leads.entries()) {
  picker.add(new Option(lead.name + ' · ' + lead.inchikey, index));
}
function showListings() {
  const lead = leads[Number(picker.value)];
  const list = $('supplierList');
  list.replaceChildren(...lead.listings.map(([id, vendor, code]) =>
    new Option(vendor + ' · ' + code + ' · ' + id, JSON.stringify([id, vendor, code]))
  ));
}
picker.onchange = showListings;
showListings();
$('addIsolate').onsubmit = event => {
  event.preventDefault();
  const lead = leads[Number(picker.value)];
  const [terokitId, vendor, code] = JSON.parse($('supplierList').value);
  const purity = Number($('assay').value);
  const id = JSON.stringify([lead.inchikey, vendor, code, purity]);
  if (!personal.some(item => item.id === id)) {
    personal.push({id, name: lead.name + ' isolate (' + vendor + ', ' + code + ')',
      type:'isolate', profile:{[lead.name]:purity}, inchikey:lead.inchikey,
      terokitId, vendor, code, profileBasis:'User-entered mass assay'});
    localStorage.setItem(customKey, JSON.stringify(personal));
  }
  location.reload();
};
const names = [...new Set(catalog.flatMap(i => Object.keys(i.profile)))];
function ingredientRow(item, amount) {
  const row = document.createElement('details');
  row.className = 'ingredient';
  const summary = document.createElement('summary');
  const columns = document.createElement('span');
  const detail = document.createElement('small');
  detail.textContent = amount ?? item.type;
  columns.append(item.name, detail);
  summary.append(columns);
  const profile = document.createElement('p');
  const components = Object.entries(item.profile).map(([name, value]) => name + ' ' + value + '%');
  profile.textContent = [item.type, components.join(', ') || 'No tracked terpenes', item.vendor, item.code].filter(Boolean).join(' · ');
  row.append(summary, profile);
  return row;
}
function removeButton(action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Remove';
  button.onclick = action;
  return button;
}
function makeTarget(name) {
  const row = document.createElement('tr');
  const label = document.createElement('th');
  label.scope = 'row';
  label.textContent = name;
  row.append(label);
  const input = document.createElement('input');
  Object.assign(input, {type:'number', min:0, max:100, step:'any'});
  input.setAttribute('aria-label', name + ' mass percent');
  row.insertCell().append(input);
  row.insertCell().append(removeButton(() => { input.value = ''; row.hidden = true; }));
  row.hidden = true;
  $('targets').append(row);
  return input;
}
const targets = names.map(makeTarget);
const suggestions = [...new Set([...names, ...leads.map(lead => lead.name)])].sort();
function ensureTarget(name) {
  const index = names.findIndex(existing => existing.toLowerCase() === name.toLowerCase());
  if (index >= 0) return index;
  names.push(name);
  targets.push(makeTarget(name));
  return names.length - 1;
}
function fraction(item, name) {
  return Object.hasOwn(item.profile, name) ? item.profile[name] : 0;
}
const enabled = catalog.map(item => {
  const row = ingredientRow(item);
  row.hidden = true;
  row.append(removeButton(() => { row.hidden = true; row.open = false; }));
  $('stock').append(row);
  return row;
});
function attachPicker(field, list, button, labels, select) {
  const input = $(field);
  $(list).replaceChildren(...labels.map(label => new Option(label)));
  function add() {
    const index = labels.findIndex(label => label.toLowerCase() === input.value.trim().toLowerCase());
    if (index < 0) {
      input.setCustomValidity('Choose a listed item.');
      input.reportValidity();
      return;
    }
    select(index);
    input.value = '';
  }
  input.oninput = () => input.setCustomValidity('');
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  $(button).onclick = add;
}
$('terpeneOptions').replaceChildren(...suggestions.map(name => new Option(name)));
function addTarget() {
  const field = $('targetSearch');
  const text = field.value.trim();
  if (!text) { field.focus(); return false; }
  const percent = $('newPercent');
  if (!percent.reportValidity()) return false;
  const canonical = suggestions.find(name => name.toLowerCase() === text.toLowerCase()) ?? text;
  const target = targets[ensureTarget(canonical)];
  target.closest('tr').hidden = false;
  if (percent.value !== '') target.value = percent.value;
  field.value = '';
  percent.value = '';
  target.focus();
  return true;
}
$('addTarget').onclick = addTarget;
$('newPercent').onkeydown = $('targetSearch').onkeydown = event => {
  if (event.key === 'Enter') { event.preventDefault(); addTarget(); }
};
attachPicker('ingredientSearch','ingredientOptions','addIngredient',catalog.map(i =>
  i.name + (i.inchikey ? ' · ' + i.inchikey + ' · ' + Object.values(i.profile)[0] + '%' : '')
), i => { enabled[i].hidden = false; enabled[i].open = true; });
// Pairwise coordinate descent on the simplex. Transfer mass between ingredients
// using the exact least-squares line minimum along each feasible direction.
function blend(items, goal) {
  const vectors = items.map(i => names.map(n => fraction(i, n)));
  const weights = items.map((_,i) => Number(i === 0));
  const residual = vectors[0].map((v,k) => v-goal[k]);
  for(let sweep=0;sweep<2000;sweep++){
    let movement=0;
    for(let i=0;i<items.length;i++) for(let j=0;j<i;j++){
      const delta=vectors[i].map((v,k)=>v-vectors[j][k]);
      const norm=delta.reduce((s,v)=>s+v*v,0);
      if(!norm) continue;
      const slope=delta.reduce((s,v,k)=>s+v*residual[k],0);
      const step=Math.max(-weights[i],Math.min(weights[j],-slope/norm));
      weights[i]+=step;
      weights[j]-=step;
      delta.forEach((v,k)=>residual[k]+=v*step);
      movement+=Math.abs(step);
    }
    if(movement<1e-10) break;
  }
  return weights;
}
const key='terpedia.rx.v1';
let parentId = null;
function startFork(rx) {
  parentId = rx.id;
  $('draftHeading').textContent = 'Fork of ' + rx.name;
  $('titleInput').value = rx.name + ' (variation)';
  $('mass').value = rx.batchGrams;
  rx.profile.filter(p => p.target > 0).forEach(p => ensureTarget(p.name));
  names.forEach((name, index) => {
    const target = rx.profile.find(p => p.name === name)?.target;
    targets[index].value = target || '';
    targets[index].closest('tr').hidden = !target;
  });
  const available = rx.availableIngredientIds ?? rx.ingredients.map(i => i.id);
  catalog.forEach((item, index) => { enabled[index].hidden = !available.includes(item.id); });
  $('cancelFork').hidden = false;
  $('titleInput').focus();
}
function clearFork() {
  parentId = null;
  $('form').reset();
  targets.forEach(input => { input.value = ''; input.closest('tr').hidden = true; });
  enabled.forEach(row => { row.hidden = true; row.open = false; });
  $('draftHeading').textContent = 'Create an Rx';
  $('cancelFork').hidden = true;
}
$('cancelFork').onclick = clearFork;
function render(){
  const recipes=JSON.parse(localStorage.getItem(key)||'[]');
  $('library').replaceChildren();
  if(!recipes.length) $('library').textContent='Your first recipe will appear here.';
  for(const rx of recipes){
    const panel=document.createElement('details');
    const title=document.createElement('summary');
    title.textContent=rx.name+' · '+rx.batchGrams+' g';
    const body=document.createElement('pre');
    const rows = rx.ingredients.map(item => ingredientRow(item, item.grams.toFixed(4) + ' g'));
    body.textContent='Target → estimated mass %\n'+rx.profile.map(p=>p.name+'   '+p.target+' → '+p.estimated.toFixed(3)+(p.sourceMissing ? ' · No recorded source among selected ingredients' : '')).join('\n');
    const link=document.createElement('a');
    link.textContent='Download Rx JSON';
    link.download=rx.id+'.json';
    link.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(rx,null,2));
    panel.id = 'rx-' + rx.id;
    panel.append(title);
    if (rx.parentId) {
      const parent = recipes.find(item => item.id === rx.parentId);
      const lineage = document.createElement('p');
      lineage.textContent = 'Forked from ';
      const source = document.createElement('a');
      source.textContent = parent?.name ?? rx.parentId;
      if (parent) {
        source.href = '#rx-' + parent.id;
        source.onclick = () => { document.getElementById('rx-' + parent.id).open = true; };
      }
      lineage.append(source);
      panel.append(lineage);
    }
    const fork = document.createElement('button');
    fork.type = 'button';
    fork.textContent = 'Fork recipe';
    fork.onclick = () => startFork(rx);
    panel.append(...rows, body, fork, ' ', link);
    $('library').append(panel);
  }
}
$('form').onsubmit=e=>{
  e.preventDefault();
  if (($('targetSearch').value.trim() || $('newPercent').value) && !addTarget()) return;
  const goal=targets.map(t=>Number(t.value));
  const sum=goal.reduce((a,b)=>a+b,0);
  const items=catalog.filter((_,i)=>!enabled[i].hidden);
  if(!items.length || sum<=0 || sum>100){
    $('message').textContent='Choose an ingredient and enter targets totaling more than 0% and at most 100%.';
    return;
  }
  const weights=blend(items,goal);
  const batchGrams=Number($('mass').value);
  const rx={schemaVersion:2,parentId,availableIngredientIds:items.map(item=>item.id),id:crypto.randomUUID(),name:$('titleInput').value,batchGrams,profileBasis:'illustrative mass percentages',ingredients:items.map((item,i)=>({...item,grams:weights[i]*batchGrams})).filter(i=>i.grams>0),profile:names.map((name,k)=>({name,target:goal[k],sourceMissing:goal[k]>0 && !items.some(item=>fraction(item,name)>0),estimated:items.reduce((s,item,i)=>s+weights[i]*fraction(item, name),0)}))};
  try {
    localStorage.setItem(key,JSON.stringify([rx,...JSON.parse(localStorage.getItem(key)||'[]')]));
    if (parentId) clearFork();
    render();
    $('library').firstElementChild.open=true;
    $('message').textContent='Rx saved. Compare your targets with the estimated blend below.';
  } catch { $('message').textContent='Browser storage is unavailable. The recipe could not be saved.'; }
};
render();
