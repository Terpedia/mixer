const $ = id => document.getElementById(id);
const catalog = await fetch('./catalog.json').then(r => r.json());
const leads = await fetch('./isolates.json').then(r => r.json());
const suppliers = new Map((await fetch('./suppliers.json').then(r => r.json())).map(s => [s.id, s]));
const hypotheses = await fetch('./hypotheses.json').then(r => r.json());
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
  list.replaceChildren(...lead.listings.map(({supplierId, code}) =>
    new Option(suppliers.get(supplierId).name + ' · ' + code, JSON.stringify({supplierId, code}))
  ));
}
picker.onchange = showListings;
showListings();
$('addIsolate').onsubmit = event => {
  event.preventDefault();
  const lead = leads[Number(picker.value)];
  const {supplierId, code} = JSON.parse($('supplierList').value);
  const vendor = suppliers.get(supplierId).name;
  const purity = Number($('assay').value);
  const id = JSON.stringify([lead.inchikey, vendor, code, purity]);
  if (!personal.some(item => item.id === id)) {
    personal.push({id, name: lead.name + ' isolate (' + vendor + ', ' + code + ')',
      type:'isolate', profile:{[lead.name]:purity}, inchikey:lead.inchikey,
      supplierId, vendor, code, profileBasis:'User-entered mass assay'});
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
  const entity = document.createElement('a');
  entity.textContent = item.name;
  entity.href = './ingredient.html?id=' + encodeURIComponent(item.inchikey || item.id);
  entity.target = '_blank';
  entity.rel = 'noopener';
  columns.append(entity, detail);
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
  row.insertCell().append(removeButton(() => { input.value = ''; row.hidden = true; refreshDraft(true); }));
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
const amounts = [];
const enabled = catalog.map(item => {
  const row = ingredientRow(item);
  row.hidden = true;
  const label = document.createElement('label');
  label.textContent = 'Ingredient mass (g) ';
  const amount = document.createElement('input');
  Object.assign(amount, {type:'number', min:0, step:'any', value:0});
  amounts.push(amount);
  label.append(amount);
  label.hidden = true;
  row.append(label);
  row.append(removeButton(() => { amount.value = 0; row.hidden = true; row.open = false; refreshDraft(true); }));
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
  refreshDraft(true);
  target.focus();
  return true;
}
$('addTarget').onclick = addTarget;
$('newPercent').onkeydown = $('targetSearch').onkeydown = event => {
  if (event.key === 'Enter') { event.preventDefault(); addTarget(); }
};
attachPicker('ingredientSearch','ingredientOptions','addIngredient',catalog.map(i =>
  i.name + (i.inchikey ? ' · ' + i.inchikey + ' · ' + Object.values(i.profile)[0] + '%' : '')
), i => { enabled[i].hidden = false; enabled[i].open = true; refreshDraft(true); });
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
let editing = null;
function startFork(rx, edit = false) {
  clearFork();
  editing = edit ? rx : null;
  parentId = edit ? rx.parentId ?? null : rx.id;
  $('draftHeading').textContent = 'Fork of ' + rx.name;
  $('titleInput').value = rx.name + ' (variation)';
  if (edit) {
    $('draftHeading').textContent = 'Edit Rx';
    $('titleInput').value = rx.name;
    $('cancelFork').textContent = 'Cancel edit';
    $('fit').hidden = false;
    $('saveRx').textContent = 'Save ingredient amounts';
  }
  $('mass').value = rx.batchGrams;
  rx.profile.filter(p => p.target > 0).forEach(p => ensureTarget(p.name));
  names.forEach((name, index) => {
    const target = rx.profile.find(p => p.name === name)?.target;
    targets[index].value = target || '';
    targets[index].closest('tr').hidden = !target;
  });
  const available = rx.availableIngredientIds ?? rx.ingredients.map(i => i.id);
  catalog.forEach((item, index) => { const selected = available.includes(item.id);
    enabled[index].hidden = !selected;
    enabled[index].open = edit && selected;
    amounts[index].parentElement.hidden = !edit;
    amounts[index].value = rx.ingredients.find(line => line.id === item.id)?.grams ?? 0; });
  $('cancelFork').hidden = false;
  refreshDraft(!edit);
  $('titleInput').focus();
}
function clearFork() {
  editing = null;
  parentId = null;
  $('fit').hidden = true;
  $('preview').replaceChildren();
  $('saveRx').textContent = 'Calculate and save Rx';
  $('cancelFork').textContent = 'Cancel fork';
  amounts.forEach(input => { input.parentElement.hidden = true; });
  $('form').reset();
  targets.forEach(input => { input.value = ''; input.closest('tr').hidden = true; });
  enabled.forEach(row => { row.hidden = true; row.open = false; });
  $('draftHeading').textContent = 'Create an Rx';
  $('cancelFork').hidden = true;
}
$('cancelFork').onclick = clearFork;
function recipeCard(rx, editable = true) {
  const card = document.createElement('article');
  card.className = 'rxCard';
  card.setAttribute('aria-label', 'Rx card for ' + rx.name);
  card.innerHTML = `
    <div class="padHeader"><strong>Terpedia</strong><span>Formulation record</span></div>
    <div class="padTitle"><span aria-hidden="true">℞</span><div><h3></h3><small></small></div></div>
    <h4>Recipe</h4><div class="padIngredients"></div>
    <table><caption>Estimated terpene profile</caption>
    <thead><tr><th scope="col">Terpene</th><th scope="col">Target %</th><th scope="col">Estimated %</th></tr></thead>
    <tbody></tbody></table><h4>Hypotheses &amp; evidence</h4><ul class="rxClaims"></ul><footer>Percentages by mass · Calculated from ingredient profiles</footer>`;
  card.querySelector('h3').textContent = rx.name;
  card.querySelector('small').textContent = rx.batchGrams + ' g batch';
  for (const item of rx.ingredients) {
    card.querySelector('.padIngredients').append(ingredientRow(item, item.grams.toFixed(4) + ' g'));
  }
  const body = card.querySelector('tbody');
  for (const entry of rx.profile.filter(p => p.target > 0 || p.estimated > 0)) {
    const row = body.insertRow();
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = entry.name;
    row.append(name);
    row.insertCell().textContent = entry.target;
    const estimate = row.insertCell();
    estimate.textContent = entry.estimated.toFixed(3);
    if (entry.sourceMissing) {
      const note = document.createElement('small');
      note.textContent = 'No recorded source';
      estimate.append(note);
    }
  }
  const list = card.querySelector('.rxClaims');
  const compounds = new Set(rx.profile.filter(p => p.estimated > 0).map(p => {
    const name = p.name.trim().toLowerCase();
    return ['myrcene', 'beta-myrcene'].includes(name) ? 'β-myrcene' : name;
  }));
  const matched = hypotheses.filter(h => compounds.has(h.compound.toLowerCase()));
  for (const level of ['Animal study', 'Cell study', 'Proposed']) {
    const group = matched.filter(h => h.level === level);
    if (!group.length) continue;
    const line = document.createElement('li');
    const section = document.createElement('details');
    section.open = level !== 'Proposed';
    const title = document.createElement('summary');
    title.textContent = level + ' · ' + group.length;
    section.append(title);
    for (const h of group) {
      const p = document.createElement('p');
      const heading = document.createElement('strong');
      heading.textContent = h.compound + ' · ' + h.effect;
      p.append(heading, document.createElement('br'), h.basis);
      if (h.pmid) {
        const source = document.createElement('a');
        source.href = 'https://pubmed.ncbi.nlm.nih.gov/' + h.pmid + '/';
        source.textContent = 'Primary study';
        p.append(' ', source);
      }
      section.append(p);
    }
    line.append(section);
    list.append(line);
  }
  if (!matched.length) list.textContent = 'No reviewed or proposed hypotheses are linked to this profile yet.';
  if (editable) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit Rx';
    edit.onclick = () => startFork(rx, true);
    card.querySelector('.padHeader').append(edit);
  }
  return card;
}
function render(){
  const recipes=JSON.parse(localStorage.getItem(key)||'[]');
  const example = {
    name: '10% myrcene', batchGrams: 10,
    ingredients: [
      {id:'example-myrcene', inchikey:'UAHWPYUMFXYFJY-UHFFFAOYSA-N', name:'Myrcene isolate', type:'Example isolate', profile:{Myrcene:95}, grams:1/0.95},
      {id:'neutral', name:'Neutral carrier', type:'Carrier', profile:{}, grams:10-1/0.95}
    ],
    profile:[{name:'Myrcene', target:10, estimated:10}]
  };
  const featured = recipeCard(recipes[0] ?? example);
  featured.querySelector('.padHeader span').textContent = recipes.length ? 'Latest saved Rx card' : 'Example Rx card';
  $('featuredRx').replaceChildren(featured);
  $('library').replaceChildren();
  if(!recipes.length) $('library').textContent='Your first recipe will appear here.';
  for(const rx of recipes){
    const panel=document.createElement('details');
    const title=document.createElement('summary');
    title.textContent=rx.name+' · '+rx.batchGrams+' g';
    const card = recipeCard(rx);
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
    panel.append(card, fork, ' ', link);
    $('library').append(panel);
  }
}
$('form').onsubmit=e=>{
  e.preventDefault();
  if (($('targetSearch').value.trim() || $('newPercent').value) && !addTarget()) return;
  updateRecipe({save:true, refit:!editing});
};
function refreshDraft(refit) {
  updateRecipe({save:false, refit:refit || !editing});
}
function updateRecipe({save, refit}) {
  $('preview').replaceChildren();
  const goal=targets.map(t=>Number(t.value));
  const sum=goal.reduce((a,b)=>a+b,0);
  const items=catalog.filter((_,i)=>!enabled[i].hidden);
  if(!items.length || sum<=0 || sum>100){
    $('message').textContent='Choose an ingredient and enter targets totaling more than 0% and at most 100%.';
    return;
  }
  let batchGrams=Number($('mass').value);
  if (!Number.isFinite(batchGrams) || batchGrams <= 0 || targets.some(t => !t.validity.valid)) {
    $('message').textContent = 'Enter a positive batch mass and valid target percentages.';
    return;
  }
  const selectedAmounts = amounts.filter((_,i) => !enabled[i].hidden);
  let weights;
  if (!refit) {
    const total = selectedAmounts.reduce((sum,input) => sum + Number(input.value), 0);
    if (selectedAmounts.some(input => !input.validity.valid) || total <= 0) {
      $('message').textContent = 'Enter ingredient amounts totaling more than zero.';
      return;
    }
    if (!save) batchGrams = total;
    if (Math.abs(total - batchGrams) > batchGrams * 1e-8) {
      $('message').textContent = 'Ingredient amounts total ' + total + ' g. Adjust them to the batch mass or update ingredients to meet targets.';
      return;
    }
    weights = selectedAmounts.map(input => Number(input.value) / batchGrams);
  } else {
    weights = blend(items, goal);
  }
  const rx={schemaVersion:2,parentId,availableIngredientIds:items.map(item=>item.id),id:editing?.id ?? crypto.randomUUID(),name:$('titleInput').value,batchGrams,profileBasis:'illustrative mass percentages',ingredients:items.map((item,i)=>({...item,grams:weights[i]*batchGrams})).filter(i=>i.grams>0),profile:names.map((name,k)=>({name,target:goal[k],sourceMissing:goal[k]>0 && !items.some(item=>fraction(item,name)>0),estimated:items.reduce((s,item,i)=>s+weights[i]*fraction(item, name),0)}))};
  if (!save) {
    if (refit) selectedAmounts.forEach((input,i) => { input.value = weights[i] * batchGrams; });
    const preview = recipeCard(rx, false);
    preview.querySelector('.padHeader span').textContent = 'Unsaved estimate';
    $('preview').replaceChildren(preview);
    $('message').textContent = Math.abs(batchGrams - Number($('mass').value)) > batchGrams * 1e-8
      ? 'Preview uses the actual ingredient total of ' + batchGrams + ' g. Match the batch mass before saving.'
      : '';
    return;
  }
  try {
    const others = JSON.parse(localStorage.getItem(key)||'[]').filter(record => record.id !== rx.id);
    localStorage.setItem(key,JSON.stringify([rx,...others]));
    if (editing || parentId) clearFork();
    render();
    $('library').firstElementChild.open=true;
    $('featuredRx').scrollIntoView({block:'start'});
    $('message').textContent='Rx saved.';
  } catch { $('message').textContent='Browser storage is unavailable. The recipe could not be saved.'; }
}
render();
$('fit').onclick = () => refreshDraft(true);
$('form').addEventListener('input', event => {
  if (targets.includes(event.target) || event.target === $('mass')) refreshDraft(true);
  if (amounts.includes(event.target) || event.target === $('titleInput')) refreshDraft(false);
});
