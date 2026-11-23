(() => {
  const SUITS = [
    {name:'Clubs', symbol:'♣', rank:0, red:false},
    {name:'Diamonds', symbol:'♦', rank:1, red:true},
    {name:'Hearts', symbol:'♥', rank:2, red:true},
    {name:'Spades', symbol:'♠', rank:3, red:false}
  ];
  const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const STORAGE_KEY = 'wildcard-table-v1';
  const $ = (selector) => document.querySelector(selector);
  const ui = {
    list: $('#combatantList'), empty: $('#emptyState'), name: $('#combatantName'),
    form: $('#addForm'), count: $('#combatantCount'), round: $('#roundNumber'),
    deckStatus: $('#deckStatus'), deal: $('#dealBtn'), result: $('#rollResult'),
    drawList: $('#drawnCards')
  };
  let state = loadState();

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.combatants)) return {
        round: Number(saved.round) || 0,
        combatants: saved.combatants,
        activeId: saved.activeId || null,
        initiativeDeck: saved.initiativeDeck || null,
        extraDeck: Array.isArray(saved.extraDeck) ? saved.extraDeck : shuffledDeck(),
        extraDiscard: Array.isArray(saved.extraDiscard) ? saved.extraDiscard : [],
        cardDraws: Array.isArray(saved.cardDraws) ? saved.cardDraws : []
      };
    } catch (_) { /* start a fresh table if saved data is invalid */ }
    return {round:0,combatants:[],activeId:null,initiativeDeck:null,extraDeck:shuffledDeck(),extraDiscard:[],cardDraws:[]};
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* app remains usable if storage is unavailable */ }
  }
  function parentGM() {
    if (!document.documentElement.classList.contains('embedded') || window.parent === window) return null;
    try { return window.parent.GM || null; } catch (_) { return null; }
  }
  function nameFromOpenDocument(path, markdown) {
    const text = String(markdown || '').replace(/^\uFEFF/, '');
    const frontMatter = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    const fields = {};
    if (frontMatter) {
      frontMatter[1].split(/\r?\n/).forEach(line => {
        const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
        if (match) fields[match[1].toLowerCase()] = match[2].trim().replace(/^['"]|['"]$/g, '');
      });
    }
    const pathType = String(path || '').match(/(?:^|\/)(characters|monsters)\//i)?.[1]?.toLowerCase();
    const type = String(fields.type || (pathType === 'characters' ? 'character' : pathType === 'monsters' ? 'monster' : '')).toLowerCase();
    if (type !== 'character' && type !== 'monster') return null;
    const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const filename = String(path || '').split('/').pop()?.replace(/\.md$/i, '') || '';
    const name = fields.name || heading || filename;
    return name ? { name, type } : null;
  }
  async function importOpenDocuments() {
    const status = $('#importOpenStatus');
    const gm = parentGM();
    const sidebar = gm?.sidebarData;
    const readFile = gm?.data?.readFile;
    if (!sidebar || typeof readFile !== 'function') {
      status.hidden = false;
      status.textContent = 'The GM document workspace is not ready. Try again in a moment.';
      return;
    }
    try {
      await sidebar.readyPromise;
      const paths = sidebar.getWorkspaceDocuments?.() || [];
      const names = [];
      for (const path of paths) {
        const markdown = await readFile.call(gm.data, path);
        if (markdown === null || markdown === undefined) continue;
        const entry = nameFromOpenDocument(path, markdown);
        if (entry) names.push(entry);
      }
      const existing = new Set(state.combatants.map(item => String(item.name || '').trim().toLocaleLowerCase()));
      const additions = names.filter(item => {
        const key = item.name.trim().toLocaleLowerCase();
        if (!key || existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      additions.forEach(item => state.combatants.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        name: item.name, card: null, bennies: 0, wounds: 0, trackResources: false
      }));
      if (additions.length) { save(); render(); }
      status.hidden = false;
      status.textContent = additions.length
        ? `Imported ${additions.length} ${additions.length === 1 ? 'name' : 'names'}${names.length > additions.length ? `; skipped ${names.length - additions.length} duplicate${names.length - additions.length === 1 ? '' : 's'}` : ''}.`
        : names.length ? 'All open character and monster names are already in the list.' : 'No open character or monster documents found in the GM workspace.';
    } catch (error) {
      status.hidden = false;
      status.textContent = `Could not import open document names: ${error?.message || error}`;
    }
  }
  function setMobileToolPanel(panel) {
    const diceActive = panel === 'dice';
    document.body.classList.toggle('mobile-tool-tab-dice', diceActive);
    document.body.classList.toggle('mobile-tool-tab-initiative', !diceActive);
    document.querySelectorAll('[data-tool-panel]').forEach(button => {
      const selected = button.dataset.toolPanel === panel;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
  }
  function shuffledDeck() {
    const deck=[];
    SUITS.forEach(suit => RANKS.forEach((value,index) => deck.push({value,suit,rank:index})));
    deck.push({joker:true,color:'red'},{joker:true,color:'black'});
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
    return deck;
  }
  function cardKey(card) {
    if (!card) return '';
    return card.joker ? `joker-${card.color}` : `${card.value}-${card.suit.name}`;
  }
  function cardDescription(card){return card.joker?`${card.color} Joker`:`${card.value}${card.suit.symbol}`;}
  function cardFace(card) {
    const face=document.createElement('div');
    face.className=`card-face${card.joker?' joker':card.suit.red?' red':''}`;
    if(card.joker){face.innerHTML='JOKER<small>★</small>';}
    else{face.innerHTML=`${escapeHTML(card.value)}<small>${card.suit.symbol}</small>`;}
    return face;
  }
  function initiativeOrder() {
    return [...state.combatants].sort((a,b) => {
      if (!a.card && !b.card) return a.name.localeCompare(b.name);
      if (!a.card) return 1;
      if (!b.card) return -1;
      if (a.card.joker || b.card.joker) return Number(b.card.joker) - Number(a.card.joker);
      return b.card.rank - a.card.rank || b.card.suit.rank - a.card.suit.rank || a.name.localeCompare(b.name);
    });
  }
  function render() {
    const sorted = initiativeOrder();
    const inRound = sorted.filter(c=>c.card);
    if(!inRound.some(c=>c.id===state.activeId)) state.activeId=inRound[0]?.id||null;
    const turnPositions = new Map(inRound.map((combatant, index) => [combatant.id, index]));
    ui.list.replaceChildren();
    sorted.forEach((combatant, index) => {
      const row = document.createElement('div');
      row.className = `combatant-row${combatant.card?.joker ? ' is-joker' : ''}`;
      const card = combatant.card ? cardFace(combatant.card) : document.createElement('div');
      if (!combatant.card) { card.className='card-face pending'; card.textContent='···'; }
      const name = document.createElement('span'); name.className='combatant-name'; name.textContent=combatant.name;
      const status = document.createElement('span'); status.className='row-status';
      status.textContent = combatant.card ? (combatant.card.joker ? 'WILD' : `#${String(index+1).padStart(2,'0')}`) : 'WAITING';
      if (combatant.card?.joker) status.className='joker-tag';
      const marker=document.createElement('span');marker.className='turn-marker';marker.textContent='NOW';marker.hidden=combatant.id!==state.activeId;
      if(combatant.id===state.activeId)row.classList.add('is-current');
      const turnPosition=turnPositions.get(combatant.id);
      const isCurrent=combatant.id===state.activeId;
      const turnArrows=document.createElement('span');turnArrows.className='turn-arrows';turnArrows.hidden=!isCurrent||inRound.length<2;
      const availableMoves=[];
      if(isCurrent&&turnPosition>0)availableMoves.push([-1,'←','Previous']);
      if(isCurrent&&turnPosition<inRound.length-1)availableMoves.push([1,'→','Next']);
      availableMoves.forEach(([direction,symbol,label])=>{
        const arrow=document.createElement('button');arrow.type='button';arrow.className=`turn-arrow${direction===1?' next':''}`;arrow.textContent=symbol;
        arrow.title=`${label} turn from ${combatant.name}`;arrow.setAttribute('aria-label',arrow.title);
        arrow.addEventListener('click',()=>moveTurnFrom(combatant.id,direction));turnArrows.append(arrow);
      });
      const redraw = document.createElement('button'); redraw.type='button'; redraw.className='row-redraw'; redraw.textContent='↻ Card';
      redraw.title=`Draw a new card for ${combatant.name}`; redraw.setAttribute('aria-label',redraw.title); redraw.hidden=!combatant.card;
      redraw.disabled=Boolean(combatant.cardOptions?.length);
      redraw.addEventListener('click',()=>redrawCard(combatant.id));
      const trackerToggle=document.createElement('button');trackerToggle.type='button';trackerToggle.className=`resource-toggle${combatant.trackResources?' selected':''}`;
      trackerToggle.textContent=combatant.trackResources?'B/W ✓':'+ Track';
      trackerToggle.title=`${combatant.trackResources?'Hide':'Show'} Bennie and Wound trackers for ${combatant.name}`;
      trackerToggle.setAttribute('aria-label',trackerToggle.title);
      trackerToggle.addEventListener('click',()=>{combatant.trackResources=!combatant.trackResources;save();render();});
      const remove = document.createElement('button'); remove.type='button'; remove.className='row-menu'; remove.textContent='×'; remove.title=`Remove ${combatant.name}`; remove.setAttribute('aria-label',remove.title);
      remove.addEventListener('click',()=>{
        if(state.initiativeDeck){
          const cards=combatant.cardOptions?.map(option=>option.card)||[combatant.card];
          cards.filter(Boolean).forEach(removed=>state.initiativeDeck.discard.push(removed));
        }
        state.combatants=state.combatants.filter(x=>x.id!==combatant.id);save();render();
      });
      row.append(card,name,marker,turnArrows,status,redraw,trackerToggle,remove);
      if(combatant.trackResources){
        const resources=document.createElement('div');resources.className='resource-trackers';
        resources.append(makeResourceCounter(combatant,'bennies','Bennies',0,99));
        resources.append(makeResourceCounter(combatant,'wounds','Wounds',0,3));
        row.append(resources);
      }
      ui.list.append(row);
      if(combatant.cardOptions?.length){
        const choice=document.createElement('div');choice.className='card-choice';
        const prompt=document.createElement('span');prompt.className='card-choice-prompt';prompt.textContent='Choose the card that counts for initiative';choice.append(prompt);
        combatant.cardOptions.forEach((option,optionIndex)=>{
          const button=document.createElement('button');button.type='button';button.className='card-choice-button';
          button.append(cardFace(option.card));
          const label=document.createElement('span');label.textContent=`${optionIndex===0?'Keep current':'Use new'} · ${cardDescription(option.card)}`;button.append(label);
          button.addEventListener('click',()=>chooseCard(combatant.id,optionIndex));choice.append(button);
        });
        ui.list.append(choice);
      }
    });
    ui.count.textContent=state.combatants.length;
    ui.round.textContent=String(state.round).padStart(2,'0');
    ui.empty.hidden=state.combatants.length>0;
    const inHands=new Set(state.combatants.flatMap(c=>c.cardOptions?.map(option=>option.card)||[c.card]).filter(Boolean).map(cardKey));
    ui.deckStatus.textContent=`${state.initiativeDeck?.draw?.length??Math.max(0,54-inHands.size)} cards left`;
    $('#extraDeckStatus').textContent=`${state.extraDeck.length} cards left in this deck`;
    renderDraws();
  }
  function renderDraws() {
    ui.drawList.replaceChildren();
    if(!state.cardDraws.length){const empty=document.createElement('div');empty.className='empty-draw';empty.textContent='Draw a card for any table moment.';ui.drawList.append(empty);return;}
    state.cardDraws.forEach(item=>{
      const row=document.createElement('div');row.className='drawn-card-row';
      row.append(cardFace(item.card));
      const reason=document.createElement('span');reason.className=`draw-reason${item.reason?'':' no-reason'}`;reason.textContent=item.reason||'No reason added';
      row.append(reason);ui.drawList.append(row);
    });
  }
  function makeResourceCounter(combatant,key,label,min,max){
    const group=document.createElement('div');group.className='resource-counter';
    const title=document.createElement('span');title.className='resource-name';
    const icon=document.createElement('span');icon.className=`resource-icon ${key==='bennies'?'coin':'heart'}`;
    icon.textContent=key==='bennies'?'🪙':'♥';icon.setAttribute('aria-hidden','true');
    const titleText=document.createElement('span');titleText.className='resource-label';titleText.textContent=label;
    title.append(icon,titleText);group.append(title);
    const controls=document.createElement('div');controls.className='resource-stepper';
    const value=Math.max(min,Math.min(max,Number(combatant[key])||0));combatant[key]=value;
    const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.disabled=value<=min;minus.setAttribute('aria-label',`Remove one ${label.toLowerCase()} for ${combatant.name}`);
    minus.addEventListener('click',()=>changeResource(combatant.id,key,-1,min,max));
    const number=document.createElement('strong');number.textContent=value;
    const plus=document.createElement('button');plus.type='button';plus.textContent='+';plus.disabled=value>=max;plus.setAttribute('aria-label',`Add one ${label.toLowerCase()} for ${combatant.name}`);
    plus.addEventListener('click',()=>changeResource(combatant.id,key,1,min,max));
    controls.append(minus,number,plus);group.append(controls);return group;
  }
  function changeResource(id,key,delta,min,max){
    const combatant=state.combatants.find(c=>c.id===id);if(!combatant)return;
    combatant[key]=Math.max(min,Math.min(max,(Number(combatant[key])||0)+delta));save();render();
  }
  function escapeHTML(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function shuffleInPlace(cards){
    for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
    return cards;
  }
  function shuffleInitiativeUndealt(){
    if(!state.initiativeDeck)return;
    state.initiativeDeck.draw=shuffleInPlace([...state.initiativeDeck.draw,...state.initiativeDeck.discard]);
    state.initiativeDeck.discard=[];
  }
  function shuffleExtraUndealt(){
    state.extraDeck=shuffleInPlace([...state.extraDeck,...state.extraDiscard]);
    state.extraDiscard=[];
  }
  function confirmJokerReshuffle(deckName,detail){
    return window.confirm(`A Joker was drawn. Reshuffle the ${deckName}?\n\nChoose OK for Yes (the default) or Cancel for No. ${detail}`);
  }
  function deal() {
    if(!state.combatants.length){ui.name.focus();return;}
    state.round+=1;
    state.initiativeDeck={draw:shuffledDeck(),discard:[]};
    state.combatants.forEach(combatant=>{combatant.card=state.initiativeDeck.draw.shift()||null;combatant.cardOptions=null;});
    state.activeId=initiativeOrder().find(c=>c.card)?.id||null;
    if(state.combatants.some(c=>c.card?.joker)&&confirmJokerReshuffle('undealt initiative deck','Cards already dealt for initiative stay in play.'))shuffleInitiativeUndealt();
    save();render();
  }
  function reshuffleInitiative() {
    state.initiativeDeck={draw:shuffledDeck(),discard:[]};
    state.combatants.forEach(combatant=>{combatant.card=null;combatant.cardOptions=null;});
    state.activeId=null;
    save();render();
  }
  function ensureInitiativeDeck(replacingId) {
    if(state.initiativeDeck && Array.isArray(state.initiativeDeck.draw) && Array.isArray(state.initiativeDeck.discard)) return;
    const used=new Set(state.combatants.filter(c=>c.id!==replacingId&&c.card).map(c=>cardKey(c.card)));
    state.initiativeDeck={draw:shuffledDeck().filter(card=>!used.has(cardKey(card))),discard:[]};
  }
  function redrawCard(id) {
    ensureInitiativeDeck(id);
    let deck=state.initiativeDeck;
    const combatant=state.combatants.find(c=>c.id===id);
    if(!combatant||combatant.cardOptions?.length)return;
    if(!deck.draw.length){deck.draw=deck.discard;deck.discard=[];for(let i=deck.draw.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck.draw[i],deck.draw[j]]=[deck.draw[j],deck.draw[i]];}}
    if(!deck.draw.length)return;
    const replacement=deck.draw.shift();
    combatant.cardOptions=[{card:combatant.card},{card:replacement}];
    if(replacement.joker&&confirmJokerReshuffle('undealt initiative deck','Cards already dealt for initiative stay in play.'))shuffleInitiativeUndealt();
    save();render();
  }
  function chooseCard(id,optionIndex){
    const combatant=state.combatants.find(c=>c.id===id);
    if(!combatant?.cardOptions?.[optionIndex])return;
    const [current,replacement]=combatant.cardOptions;
    const chosen=optionIndex===0?current:replacement;
    const returned=optionIndex===0?replacement:current;
    if(returned?.card&&state.initiativeDeck)state.initiativeDeck.discard.push(returned.card);
    combatant.card=chosen.card;combatant.cardOptions=null;
    save();render();
  }
  function moveTurnFrom(id,direction) {
    const inRound=initiativeOrder().filter(c=>c.card);
    if(!inRound.length)return;
    const currentIndex=inRound.findIndex(c=>c.id===id);
    if(currentIndex<0)return;
    const nextIndex=(currentIndex+direction+inRound.length)%inRound.length;
    state.activeId=inRound[nextIndex].id;save();render();
  }
  function drawExtraCard() {
    if(!state.extraDeck.length){state.extraDeck=state.extraDiscard;state.extraDiscard=[];for(let i=state.extraDeck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[state.extraDeck[i],state.extraDeck[j]]=[state.extraDeck[j],state.extraDeck[i]];}}
    if(!state.extraDeck.length)state.extraDeck=shuffledDeck();
    const card=state.extraDeck.shift();state.extraDiscard.push(card);
    if(card.joker&&confirmJokerReshuffle('separate draw deck','Previously drawn cards stay in the displayed history.'))shuffleExtraUndealt();
    const reason=$('#drawReason').value.trim();
    state.cardDraws.unshift({card,reason});state.cardDraws=state.cardDraws.slice(0,12);
    $('#drawReason').value='';save();render();
  }
  ui.form.addEventListener('submit',event=>{
    event.preventDefault();const name=ui.name.value.trim();if(!name)return;
    state.combatants.push({id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,name,card:null,bennies:0,wounds:0,trackResources:false});
    ui.name.value='';save();render();ui.name.focus();
  });
  ui.deal.addEventListener('click',deal);
  $('#shuffleBtn').addEventListener('click',reshuffleInitiative);
  $('#drawCardBtn').addEventListener('click',drawExtraCard);
  $('#drawReason').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();drawExtraCard();}});
  $('#reshuffleDrawDeck').addEventListener('click',()=>{
    state.extraDeck=shuffledDeck();state.extraDiscard=[];state.cardDraws=[];save();render();
  });
  const importOpenButton = $('#importOpenDocuments');
  if (document.documentElement.classList.contains('embedded')) {
    importOpenButton.hidden = false;
    importOpenButton.addEventListener('click', importOpenDocuments);
  }
  document.querySelectorAll('[data-tool-panel]').forEach(button => {
    button.addEventListener('click', () => setMobileToolPanel(button.dataset.toolPanel));
  });
  setMobileToolPanel('initiative');
  $('#clearCombatants').addEventListener('click',()=>{
    state.combatants.forEach(c=>{
      if(state.initiativeDeck){
        const cards=c.cardOptions?.map(option=>option.card)||[c.card];
        cards.filter(Boolean).forEach(card=>state.initiativeDeck.discard.push(card));
      }
    });
    state.combatants=[];save();render();
  });
  $('#resetAll').addEventListener('click',()=>{
    if(!confirm('Clear all combatants and reset the round?'))return;
    state={round:0,combatants:[],activeId:null,initiativeDeck:null,extraDeck:shuffledDeck(),extraDiscard:[],cardDraws:[]};
    save();render();ui.result.innerHTML='<span class="result-hint">Your roll will appear here.</span>';
  });
  window.addEventListener('message',event=>{
    if(event.source===window.parent&&event.data?.type==='gm-tools-reset')$('#resetAll').click();
  });

  function explodingDie(sides) {
    let subtotal=0,rolls=[],count=0,face;
    do{face=1+Math.floor(Math.random()*sides);rolls.push(face);subtotal+=face;count++;}while(face===sides&&count<100);
    return{subtotal,rolls};
  }
  function formatDie(die){return die.rolls.join(' + ');}
  function updateWildAvailability(){
    const multiple=Number($('#dieCount').value)>1;
    const keepMode=$('#diceMode').value==='keep';
    const toggle=$('.wild-toggle');
    $('#rollModeRow').hidden=!multiple;
    const wildUnavailable=multiple&&!keepMode;
    $('#wildDie').disabled=wildUnavailable;toggle.classList.toggle('is-disabled',wildUnavailable);
    $('#diceNote').textContent=multiple
      ?(keepMode?'Roll the selected number of Trait dice plus an optional Wild Die. Keep that many highest, then check each kept die separately against the target. Aces explode.':'Trait dice are summed. To use a Wild Die with multiple dice, choose “Keep highest dice.” Aces explode.')
      :'Each die aces (maximum rolls) and explodes. With one Trait Die, the Wild Die keeps the higher result.';
  }
  $('#dieCount').addEventListener('input',updateWildAvailability);
  $('#diceMode').addEventListener('change',updateWildAvailability);
  $('#wildDie').addEventListener('change',updateWildAvailability);
  $('#rollBtn').addEventListener('click',()=>{
    const sides=Number($('#traitDie').value);
    const count=Math.max(1,Math.min(20,Number($('#dieCount').value)||1));
    $('#dieCount').value=count;
    const modifier=Math.max(-99,Math.min(99,Number($('#modifier').value)||0));
    const target=Math.max(1,Math.min(99,Number($('#targetNumber').value)||4));
    $('#targetNumber').value=target;
    const mode=$('#diceMode').value;
    const traits=Array.from({length:count},()=>explodingDie(sides));
    const useWild=$('#wildDie').checked&&(count===1||mode==='keep');
    const wild=useWild?explodingDie(6):null;
    const dice=traits.map((die,index)=>({name:`Trait ${index+1}`,die}));
    if(wild)dice.push({name:'Wild',die:wild});
    const keepHighest=count===1||mode==='keep';
    const kept=new Set(keepHighest
      ?[...dice].sort((a,b)=>b.die.subtotal-a.die.subtotal).slice(0,count)
      :dice.filter(item=>item.name.startsWith('Trait')));
    if(count===1){
      const selected=[...kept][0];
      const total=selected.die.subtotal+modifier;
      const raises=total>=target?Math.floor((total-target)/4):0;
      const outcome=total<target?'FAIL':raises?`${raises} ${raises===1?'RAISE':'RAISES'}`:'SUCCESS';
      const rows=dice.map(item=>{
        const isKept=kept.has(item);
        const score=item.die.subtotal+(isKept?modifier:0);
        const label=isKept?(score<target?'FAIL':Math.floor((score-target)/4)>0?`${Math.floor((score-target)/4)} ${Math.floor((score-target)/4)===1?'RAISE':'RAISES'}`:'SUCCESS'):'NOT KEPT';
        const scoreText=isKept&&modifier?`${formatDie(item.die)} ${modifier>0?'+':'−'} ${Math.abs(modifier)} = ${score}`:`${formatDie(item.die)} = ${item.die.subtotal}`;
        return `<div class="multi-result-row ${isKept?'kept':'dropped'}"><span class="multi-die-name">${escapeHTML(item.name)}:</span><span class="multi-die-total">${escapeHTML(scoreText)}</span><strong>${label}</strong></div>`;
      }).join('');
      ui.result.innerHTML=`<div class="multi-result-heading"><strong>${outcome}</strong><span>TN ${target}</span></div><div class="multi-result-list">${rows}</div>`;
      return;
    }
    if(count>1&&mode==='keep'){
      const modifierText=modifier?` · ${modifier>0?'+':''}${modifier} modifier to each kept die`:'';
      const rows=dice.map(item=>{
        const isKept=kept.has(item);
        const score=item.die.subtotal+modifier;
        const outcome=score<target?'FAIL':Math.floor((score-target)/4)>0?`${Math.floor((score-target)/4)} ${Math.floor((score-target)/4)===1?'RAISE':'RAISES'}`:'SUCCESS';
        const scoreText=isKept&&modifier?`${formatDie(item.die)} ${modifier>0?'+':''}${modifier} = ${score}`:`${formatDie(item.die)} = ${item.die.subtotal}`;
        return `<div class="multi-result-row ${isKept?'kept':'dropped'}"><span class="multi-die-name">${escapeHTML(item.name)}:</span><span class="multi-die-total">${escapeHTML(scoreText)}</span><strong>${isKept?outcome:'NOT KEPT'}</strong></div>`;
      }).join('');
      ui.result.innerHTML=`<div class="multi-result-heading"><strong>KEEP HIGHEST ${count} OF ${dice.length}</strong><span>TN ${target}${modifierText}</span></div><div class="multi-result-list">${rows}</div>`;
      return;
    }
    const rolledTotal=keepHighest
      ?[...kept].reduce((sum,item)=>sum+item.die.subtotal,0)
      :traits.reduce((sum,die)=>sum+die.subtotal,0);
    const total=rolledTotal+modifier;
    const raises=total>=target?Math.floor((total-target)/4):0;
    const outcome=total<target?'FAIL':raises?`${raises} ${raises===1?'RAISE':'RAISES'}`:'SUCCESS';
    const dieDetails=count===1
      ?dice.map(item=>{
        const isKept=kept.has(item);
        const modifierPart=modifier&&isKept?` ${modifier>0?'+':'−'} ${Math.abs(modifier)} = ${item.die.subtotal+modifier}`:` = ${item.die.subtotal}`;
        return `${item.name}: ${formatDie(item.die)}${modifierPart}${isKept?' ✓':' ×'}`;
      }).join('  ·  ')
      :dice.map(item=>`${item.name}: ${formatDie(item.die)}${kept.has(item)?' ✓':' ×'}`).join('  ·  ');
    const methodLabel=count>1&&mode==='keep'?`Keep ${count} of ${dice.length}  ·  `:'';
    const detail=`${methodLabel}${dieDetails}${count>1&&mode==='sum'&&modifier?`  ·  Modifier ${modifier>0?'+':''}${modifier} to total`:''}`;
    const label=`${outcome}<small class="target-caption">TN ${target}</small>`;
    ui.result.innerHTML=`<div class="result-line"><span class="result-label">${label}</span><strong class="result-total">${total}</strong></div><span class="die-breakdown">${escapeHTML(detail)}</span>`;
  });
  updateWildAvailability();
  render();
  if(document.documentElement.classList.contains('embedded')&&window.parent!==window){
    window.WildCardToolsReady=true;
    window.parent.postMessage({type:'gm-tools-ready'},'*');
  }
})();
