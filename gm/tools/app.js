(() => {
  const SUITS = [
    {name:'Clubs', symbol:'♣', rank:0, red:false},
    {name:'Diamonds', symbol:'♦', rank:1, red:true},
    {name:'Hearts', symbol:'♥', rank:2, red:true},
    {name:'Spades', symbol:'♠', rank:3, red:false}
  ];
  const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const CHASE_TOKEN_COLORS = ['#2563eb','#dc2626','#15803d','#7e22ce','#c2410c','#0f766e','#be185d','#4338ca','#a16207','#0369a1','#4d7c0f','#9333ea'];
  const STORAGE_KEY = 'wildcard-table-v1';
  const $ = (selector) => document.querySelector(selector);
  const ui = {
    list: $('#combatantList'), empty: $('#emptyState'), name: $('#combatantName'),
    form: $('#addForm'), count: $('#combatantCount'), round: $('#roundNumber'),
    deckStatus: $('#deckStatus'), deal: $('#dealBtn'), result: $('#rollResult'),
    drawList: $('#drawnCards'), type: $('#newCombatantType'), extraCount: $('#newExtraCount'),
    extraCountControl: $('#extraCountControl')
  };
  let state = loadState();
  let importingOpenDocuments = false;
  let traitDice = [{id:'initial-d6',sides:6}];
  let keepCountTouched = false;
  let cardDealAnimationIds = new Set();
  let cardDealAnimationOrder = new Map();
  let activeJokerRevealIds = [];
  let cardDealSequence = 0;
  let cardDealTimer = null;
  let activeDrawAnimationId = null;
  let drawAnimationTimer = null;
  let chaseTokenDrag = null;
  let rollAnimationSequence = 0;
  let rollAnimationTimer = null;

  const IS_POPOUT = new URLSearchParams(window.location.search).get('popout') === '1';
  function hostWindow() {
    if (document.documentElement.classList.contains('embedded') && window.parent !== window) return window.parent;
    if (IS_POPOUT && window.opener && !window.opener.closed) return window.opener;
    return null;
  }
  function isHostMessage(event) { return event.source === hostWindow(); }
  function postToHost(payload) {
    const host = hostWindow();
    if (host) host.postMessage(payload, '*');
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.combatants)) return {
        round: Number(saved.round) || 0,
        combatants: saved.combatants.filter(item => item && typeof item === 'object').map(item => {
          const entityType = item.entityType === 'monster' ? 'monster' : 'character';
          const count = Number(item.count);
          const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 1;
          return {
            ...item,
            entityType,
            wildcard: entityType === 'monster' ? Boolean(item.wildcard) : true,
            shaken: Boolean(item.shaken),
            noteShaken: typeof item.noteShaken==='boolean' ? item.noteShaken : null,
            bennies: entityType === 'monster' ? 0 : (Number(item.bennies) || 0),
            count: normalizedCount,
            extraShaken: Array.isArray(item.extraShaken) ? item.extraShaken.map(Boolean) : Array.from({length:normalizedCount},()=>Boolean(item.shaken)),
            documentPath: String(item.documentPath || ''),
          };
        }),
        activeId: saved.activeId || null,
        initiativeDeck: saved.initiativeDeck || null,
        extraDeck: Array.isArray(saved.extraDeck) ? saved.extraDeck : shuffledDeck(),
        extraDiscard: Array.isArray(saved.extraDiscard) ? saved.extraDiscard : [],
        cardDraws: Array.isArray(saved.cardDraws) ? saved.cardDraws : [],
        activeToolPanel: ['initiative','dice','deck','chase','dramatic'].includes(saved.activeToolPanel) ? saved.activeToolPanel : 'initiative',
        chase: normalizeChase(saved.chase),
        dramaticTask: normalizeDramaticTask(saved.dramaticTask)
      };
    } catch (_) { /* start a fresh table if saved data is invalid */ }
    return {round:0,combatants:[],activeId:null,initiativeDeck:null,extraDeck:shuffledDeck(),extraDiscard:[],cardDraws:[],activeToolPanel:'initiative',chase:normalizeChase(null),dramaticTask:normalizeDramaticTask(null)};
  }
  function normalizeDramaticTask(task) {
    const source = task && typeof task === 'object' ? task : {};
    const targetTokens = Math.max(1, Math.min(100, Math.trunc(Number(source.targetTokens) || 4)));
    const maxRounds = Math.max(1, Math.min(20, Math.trunc(Number(source.maxRounds) || 3)));
    const actions = Array.isArray(source.actions) ? source.actions
      .filter(action => action && [1, 2].includes(Number(action.tokens)))
      .slice(-200)
      .map(action => ({tokens:Number(action.tokens),round:Math.max(1,Math.min(maxRounds,Math.trunc(Number(action.round)||1)))})) : [];
    const tokens = actions.reduce((sum, action) => sum + action.tokens, 0);
    const status = ['setup','active','complete','expired'].includes(source.status) ? source.status : 'setup';
    const participants = Array.isArray(source.participants) ? source.participants
      .filter(item => item && typeof item.name === 'string' && item.name.trim())
      .map(item => ({
        id: String(item.id || `${Date.now()}-${Math.random()}`),
        name: item.name.trim().slice(0, 32),
        card: item.card && typeof item.card === 'object' ? item.card : null
      })) : [];
    const cardDeck = source.cardDeck && Array.isArray(source.cardDeck.draw) && Array.isArray(source.cardDeck.discard)
      ? source.cardDeck : {draw:shuffledDeck(),discard:[]};
    return {
      title:String(source.title || '').slice(0,80),
      targetTokens,
      maxRounds,
      currentRound:Math.max(0,Math.min(maxRounds,Math.trunc(Number(source.currentRound)||0))),
      actions,
      tokens,
      participants,
      cardDeck,
      status:tokens >= targetTokens && status === 'active' ? 'complete' : status
    };
  }
  function normalizeChase(chase) {
    const source = chase && typeof chase === 'object' ? chase : {};
    const usedColors = new Set();
    const participants = Array.isArray(source.participants) ? source.participants.filter(item => item && typeof item.name === 'string').map((item,index) => {
      const storedColor = CHASE_TOKEN_COLORS.includes(item.color) && !usedColors.has(item.color) ? item.color : '';
      const color = storedColor || CHASE_TOKEN_COLORS.find(candidate => !usedColors.has(candidate)) || CHASE_TOKEN_COLORS[index % CHASE_TOKEN_COLORS.length];
      usedColors.add(color);
      return {
        id: item.id || `${Date.now()}-${Math.random()}`,
        name: item.name.slice(0, 32),
        card: item.card || null,
        color,
        position: Number.isFinite(Number(item.position)) ? Math.max(0, Math.min(8, Math.trunc(Number(item.position)))) : (item.side === 'pursuit' ? 0 : 8)
      };
    }) : [];
    return {
      round: Math.max(0, Math.trunc(Number(source.round) || 0)),
      participants,
      trackCards: Array.isArray(source.trackCards) && source.trackCards.length === 9 ? source.trackCards : shuffledDeck().slice(0, 9),
      deck: source.deck && Array.isArray(source.deck.draw) && Array.isArray(source.deck.discard) ? source.deck : null,
    };
  }
  function beginCardDealAnimation(ids, jokerIds = []) {
    const sequence = ++cardDealSequence;
    const orderedIds = [...new Set(ids || [])];
    cardDealAnimationIds = new Set(orderedIds);
    cardDealAnimationOrder = new Map(orderedIds.map((id, index) => [id, index]));
    if (cardDealTimer) window.clearTimeout(cardDealTimer);
    cardDealTimer = window.setTimeout(() => {
      if (sequence !== cardDealSequence) return;
      cardDealAnimationIds.clear();
      cardDealAnimationOrder.clear();
    }, 1700);

    activeJokerRevealIds = [...jokerIds];
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* app remains usable if storage is unavailable */ }
  }
  function parentGM() {
    try { return hostWindow()?.GM || null; } catch (_) { return null; }
  }
  function normalizePortraitReference(value){
    const source=String(value||'').trim();
    if(!source)return {direct:'',path:''};
    if(/^(?:https?:\/\/|blob:)/i.test(source)||/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(source))return {direct:source,path:''};
    if(/^(?:javascript|file):/i.test(source))return {direct:'',path:''};
    let path=source.replace(/\\/g,'/').replace(/^\.\//,'').replace(/^\/+/, '');
    if(/^data\//i.test(path))path=path.slice(5);
    if(!path||path.split('/').some(part=>part==='..'))return {direct:'',path:''};
    return {direct:'',path};
  }
  function attachPortraitSource(container,image,portraitPath){
    const {direct,path}=normalizePortraitReference(portraitPath);
    image.addEventListener('load',()=>container.classList.add('has-image'));
    image.addEventListener('error',()=>container.classList.remove('has-image'));
    if(direct){image.src=direct;return;}
    if(!path)return;
    const data=parentGM()?.data;
    if(typeof data?.resolveAssetUrl!=='function')return;
    const candidates=[...new Set([path,`data/${path}`])];
    let nextCandidate=0;
    const tryNext=async()=>{
      while(nextCandidate<candidates.length){
        const candidate=candidates[nextCandidate++];
        let url='';
        try{url=await data.resolveAssetUrl(candidate);}catch{}
        if(url){image.src=url;return;}
      }
    };
    image.addEventListener('error',()=>{tryNext().catch(()=>{});});
    tryNext().catch(()=>{});
  }
  function readCounterDefinition(key, fallback, max, enforceMax) {
    const definition = {
      key: String(key || '').trim(),
      fallback: Number.isFinite(Number(fallback)) ? Math.trunc(Number(fallback)) : 0,
      max: max === '' || max == null || !Number.isFinite(Number(max)) ? null : Math.trunc(Number(max)),
      enforceMax: /^(?:1|true|yes)$/i.test(String(enforceMax || '').trim())
    };
    let value = definition.fallback;
    try {
      const stored = localStorage.getItem(`gm_tracker_${definition.key.toLowerCase()}`);
      if (stored !== null && Number.isFinite(Number(stored))) value = Math.trunc(Number(stored));
    } catch (_) { /* use the value embedded in the GM document */ }
    value = Math.max(0, value);
    if (definition.enforceMax && definition.max !== null) value = Math.min(definition.max, value);
    return { ...definition, value };
  }
  function countersFromOpenDocument(markdown, entityType = '') {
    const source = String(markdown || '');
    const trackers = {};
    const pattern = /\{\{counter\??:([^|}]+)\|([^|}]*)\|([^|}]*)\|([^}]+)\}\}/gi;
    let match;
    while ((match = pattern.exec(source))) {
      const lineStart = source.lastIndexOf('\n', match.index) + 1;
      const cellStart = Math.max(lineStart, source.lastIndexOf('|', match.index) + 1);
      const label = source.slice(cellStart, match.index).replace(/[*_`]/g, ' ').toLowerCase();
      const resource = /\bbenn(?:y|ies)\b/i.test(label) ? 'bennies'
        : /\bwounds?\b/i.test(label) ? 'wounds'
        : /\bcount\b|\bnumber\b/i.test(label) ? 'count' : '';
      if (entityType === 'monster' && resource === 'bennies') continue;
      if (!resource || trackers[resource]) continue;
      trackers[resource] = readCounterDefinition(match[1], match[2], match[3], match[4]);
    }
    return trackers;
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
    const wildCardTask = text.match(/^\s*[-*+]\s+\[([ xX])\]\s+(?:\*\*)?Wild Card\b/im);
    const shakenTask = text.match(/^\s*[-*+]\s+\[([ xX])\]\s+(?:\*\*)?Shaken\b/im);
    const wildcard = type === 'monster'
      ? (wildCardTask ? /x/i.test(wildCardTask[1]) : /^(?:true|yes|1|on)$/i.test(fields.wildcard || ''))
      : true;
    return name ? {
      name,
      path: String(path || ''),
      aliases: [...new Set([name, heading, filename].filter(Boolean))],
      type,
      trackers: countersFromOpenDocument(text, type),
      portraitPath: fields.portrait || '',
      hasPortrait: Object.prototype.hasOwnProperty.call(fields, 'portrait'),
      wildcard,
      hasShaken: Boolean(shakenTask),
      shaken: Boolean(shakenTask && /x/i.test(shakenTask[1]))
    } : null;
  }
  function normalizedCombatantName(name){
    return String(name||'').toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }
  function normalizedCombatantIdentity(name){
    return normalizedCombatantName(name).replace(/\s*\([^)]*\)\s*$/,'').trim();
  }
  function normalizedDocumentPath(path){
    return String(path||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').replace(/^data\//i,'').toLocaleLowerCase();
  }
  function findDocumentCombatant(path,name){
    const normalizedPath=normalizedDocumentPath(path);
    if(normalizedPath){
      const byPath=state.combatants.find(item=>normalizedDocumentPath(item.documentPath)===normalizedPath);
      if(byPath)return byPath;
    }
    const normalizedName=normalizedCombatantName(name);
    return normalizedName?state.combatants.find(item=>normalizedCombatantName(item.name)===normalizedName):null;
  }
  function applyNoteShaken(path,name,checked){
    const combatant=findDocumentCombatant(path,name);
    if(!combatant)return false;
    const shaken=Boolean(checked);
    if(combatant.entityType==='monster'&&!combatant.wildcard){
      combatant.extraShaken=Array.from({length:Math.max(0,Math.min(99,Math.trunc(Number(combatant.count)||0)))},()=>shaken);
      combatant.shaken=shaken&&combatant.extraShaken.length>0;
    }else{
      combatant.shaken=shaken;
    }
    combatant.noteShaken=shaken;
    combatant.trackResources=true;
    save();
    render();
    return true;
  }
  function applyNoteWildCard(path,name,checked){
    const combatant=findDocumentCombatant(path,name);
    if(!combatant)return false;
    combatant.entityType='monster';
    combatant.wildcard=Boolean(checked);
    combatant.bennies=0;
    if(!Number.isFinite(Number(combatant.count)))combatant.count=1;
    combatant.trackResources=true;
    save();
    render();
    return true;
  }
  function trackerKeysFor(combatant) {
    return combatant.entityType === 'monster'
      ? [combatant.wildcard ? 'wounds' : 'count']
      : ['bennies', 'wounds'];
  }
  function trackerNameFor(combatant) {
    if (combatant.entityType !== 'monster') return 'Bennies and Wounds';
    return combatant.wildcard ? 'Wounds' : 'Monster count';
  }
  function resizeExtraStates(combatant,fillShaken=Boolean(combatant.shaken)){
    if(combatant.entityType!=='monster'||combatant.wildcard)return [];
    const count=Math.max(0,Math.min(99,Math.trunc(Number(combatant.count)||0)));
    combatant.extraShaken=Array.isArray(combatant.extraShaken)?combatant.extraShaken.map(Boolean):[];
    combatant.extraShaken.length=Math.min(combatant.extraShaken.length,count);
    while(combatant.extraShaken.length<count)combatant.extraShaken.push(Boolean(fillShaken));
    combatant.shaken=combatant.extraShaken.length>0&&combatant.extraShaken.every(Boolean);
    return combatant.extraShaken;
  }
  async function syncOpenDocuments(){
    const gm=parentGM();
    const sidebar=gm?.sidebarData;
    const readFile=gm?.data?.readFile;
    if(!sidebar||typeof readFile!=='function')return;
    await sidebar.readyPromise;
    const activeDocument=sidebar.getActiveDocument?.()||{};
    let changed=false;
    for(const path of sidebar.getWorkspaceDocuments?.()||[]){
      const markdown=path===activeDocument.path&&typeof activeDocument.markdown==='string'
        ? activeDocument.markdown
        : await readFile.call(gm.data,path);
      if(markdown==null)continue;
      const entry=nameFromOpenDocument(path,markdown);
      if(!entry)continue;
      const aliases=new Set(entry.aliases.map(normalizedCombatantName));
      const documentPath=normalizedDocumentPath(entry.path);
      state.combatants.forEach(combatant=>{
        const combatantPath=normalizedDocumentPath(combatant.documentPath);
        const pathMatches=Boolean(documentPath&&combatantPath===documentPath);
        const nameMatches=aliases.has(normalizedCombatantName(combatant.name));
        if((documentPath&&combatantPath&&!pathMatches)||(!(documentPath&&combatantPath)&&!nameMatches))return;
        const modeChanged=combatant.entityType!==entry.type||(entry.type==='monster'&&Boolean(combatant.wildcard)!==entry.wildcard);
        if(entry.path&&combatant.documentPath!==entry.path){combatant.documentPath=entry.path;changed=true;}
        if(combatant.entityType!==entry.type){combatant.entityType=entry.type;changed=true;}
        if(entry.type==='monster'){
          if(Boolean(combatant.wildcard)!==entry.wildcard){combatant.wildcard=entry.wildcard;changed=true;}
          if(Number(combatant.bennies)!==0){combatant.bennies=0;changed=true;}
          if(!Number.isFinite(Number(combatant.count))){combatant.count=1;changed=true;}
          if(modeChanged&&!combatant.trackResources){combatant.trackResources=true;changed=true;}
        }
        for(const [key,tracker] of Object.entries(entry.trackers||{})){
          if(combatant[key]!==tracker.value){combatant[key]=tracker.value;changed=true;}
        }
        if(entry.type==='monster'&&!entry.wildcard)resizeExtraStates(combatant);
        if(entry.hasShaken){
          if(entry.type==='monster'&&!entry.wildcard){
            if(combatant.noteShaken!==entry.shaken){
              const nextStates=resizeExtraStates(combatant).map(()=>entry.shaken);
              if(JSON.stringify(combatant.extraShaken)!==JSON.stringify(nextStates)){combatant.extraShaken=nextStates;changed=true;}
              combatant.shaken=entry.shaken&&nextStates.length>0;
              combatant.noteShaken=entry.shaken;
              changed=true;
            }
          }else{
            if(Boolean(combatant.shaken)!==entry.shaken){combatant.shaken=entry.shaken;changed=true;}
            if(combatant.noteShaken!==entry.shaken){combatant.noteShaken=entry.shaken;changed=true;}
          }
        }
        const nextTrackers=entry.trackers||{};
        if(JSON.stringify(combatant.gmTrackers||{})!==JSON.stringify(nextTrackers)){combatant.gmTrackers=nextTrackers;changed=true;}
        if(entry.hasPortrait&&combatant.portraitPath!==entry.portraitPath){combatant.portraitPath=entry.portraitPath;changed=true;}
      });
    }
    if(changed){save();render();}
  }
  async function importOpenDocuments() {
    if (importingOpenDocuments) return;
    importingOpenDocuments = true;
    const importButton = $('#importOpenDocuments');
    if (importButton) importButton.disabled = true;
    const status = $('#importOpenStatus');
    const gm = parentGM();
    const sidebar = gm?.sidebarData;
    const readFile = gm?.data?.readFile;
    if (!sidebar || typeof readFile !== 'function') {
      status.hidden = false;
      status.textContent = 'The GM document workspace is not ready. Try again in a moment.';
      importingOpenDocuments = false;
      if (importButton) importButton.disabled = false;
      return;
    }
    try {
      await sidebar.readyPromise;
      const paths = sidebar.getWorkspaceDocuments?.() || [];
      const activeDocument = sidebar.getActiveDocument?.() || {};
      const names = [];
      for (const path of paths) {
        const markdown = path === activeDocument.path && typeof activeDocument.markdown === 'string'
          ? activeDocument.markdown
          : await readFile.call(gm.data, path);
        if (markdown === null || markdown === undefined) continue;
        const entry = nameFromOpenDocument(path, markdown);
        if (entry) names.push(entry);
      }
      const seenPaths = new Set();
      const seenAliases = new Set();
      const uniqueNames = names.filter(item => {
        const pathKey = normalizedDocumentPath(item.path);
        const aliases = [...new Set([item.name, ...(item.aliases || [])].map(normalizedCombatantIdentity).filter(Boolean))];
        if (!aliases.length || (pathKey && seenPaths.has(pathKey)) || aliases.some(alias => seenAliases.has(alias))) return false;
        if (pathKey) seenPaths.add(pathKey);
        aliases.forEach(alias => seenAliases.add(alias));
        return true;
      });
      const additions = [];
      let synced = 0;
      let mergedDuplicates = 0;
      uniqueNames.forEach(item => {
        const itemPath = normalizedDocumentPath(item.path);
        const aliases = new Set([item.name, ...(item.aliases || [])].map(normalizedCombatantIdentity).filter(Boolean));
        const candidates = [...state.combatants, ...additions].filter(combatant => {
          const combatantPath = normalizedDocumentPath(combatant.documentPath);
          return Boolean(itemPath && combatantPath && itemPath === combatantPath)
            || aliases.has(normalizedCombatantIdentity(combatant.name));
        });
        const current = candidates.sort((a,b) => {
          const aPath = normalizedDocumentPath(a.documentPath) === itemPath ? 1 : 0;
          const bPath = normalizedDocumentPath(b.documentPath) === itemPath ? 1 : 0;
          const aActive = a.id === state.activeId ? 1 : 0;
          const bActive = b.id === state.activeId ? 1 : 0;
          const aCard = a.card || a.cardOptions?.length ? 1 : 0;
          const bCard = b.card || b.cardOptions?.length ? 1 : 0;
          return bPath-aPath || bActive-aActive || bCard-aCard;
        })[0];
        if (current) {
          const duplicateEntries = candidates.filter(candidate => candidate !== current && state.combatants.includes(candidate));
          duplicateEntries.forEach(duplicate => {
            if (!current.card && duplicate.card) current.card = duplicate.card;
            if (!current.cardOptions?.length && duplicate.cardOptions?.length) current.cardOptions = duplicate.cardOptions;
            if (!current.trackResources && duplicate.trackResources) current.trackResources = true;
            if (!current.documentPath && duplicate.documentPath) current.documentPath = duplicate.documentPath;
            if (!current.portraitPath && duplicate.portraitPath) current.portraitPath = duplicate.portraitPath;
            if (current.noteShaken === null && typeof duplicate.noteShaken === 'boolean') {
              current.noteShaken = duplicate.noteShaken;
              current.shaken = duplicate.shaken;
            }
            if (state.activeId === duplicate.id) state.activeId = current.id;
            if (duplicate.card && duplicate.card !== current.card && state.initiativeDeck) {
              state.initiativeDeck.discard.push(duplicate.card);
            }
          });
          if (duplicateEntries.length) {
            const duplicateIds = new Set(duplicateEntries.map(duplicate => duplicate.id));
            state.combatants = state.combatants.filter(combatant => !duplicateIds.has(combatant.id));
            mergedDuplicates += duplicateEntries.length;
          }
          const activeTrackerKeys=item.type==='monster'?(item.wildcard?['wounds']:['count']):['bennies','wounds'];
          const hasTrackers=activeTrackerKeys.some(key=>Boolean(item.trackers[key]));
          const needsType=current.entityType!==item.type;
          const needsWildcard=item.type==='monster'&&Boolean(current.wildcard)!==item.wildcard;
          const needsName=current.name!==item.name;
          const expectedExtraCount=Math.max(0,Math.trunc(Number(item.trackers.count?.value??current.count)||0));
          const needsShaken=item.hasShaken&&current.noteShaken!==item.shaken;
          const needsPath=item.path&&current.documentPath!==item.path;
          if(!hasTrackers&&!item.hasPortrait&&!needsType&&!needsWildcard&&!needsShaken&&!needsPath&&!needsName)return;
          if(hasTrackers){
            Object.entries(item.trackers).forEach(([key,tracker])=>{current[key]=tracker.value;});
            current.trackResources = true;
            current.gmTrackers = item.trackers;
          }
          if(item.hasShaken){
            if(current.noteShaken!==item.shaken){
              current.shaken=item.shaken;
              if(item.type==='monster'&&!item.wildcard)current.extraShaken=Array.from({length:expectedExtraCount},()=>item.shaken);
            }
            current.noteShaken=item.shaken;
            if(needsShaken)current.trackResources=true;
          }
          if(item.path)current.documentPath=item.path;
          current.name=item.name;
          if(item.hasPortrait)current.portraitPath=item.portraitPath;
          if(item.type==='monster'){
            current.bennies=0;
            if(!Number.isFinite(Number(current.count)))current.count=item.trackers.count?.value??1;
            current.wildcard=item.wildcard;
            if((needsType||needsWildcard)&&!current.trackResources)current.trackResources=true;
          }
          current.entityType=item.type;
          synced += 1;
          return;
        }
        const combatant = {
          id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          name: item.name,
          entityType: item.type,
          wildcard: item.wildcard,
          card: null,
          bennies: item.type==='monster' ? 0 : (item.trackers.bennies?.value ?? 0),
          wounds: item.trackers.wounds?.value ?? 0,
          count: item.trackers.count?.value ?? 1,
          shaken: item.hasShaken ? item.shaken : false,
          noteShaken: item.hasShaken ? item.shaken : null,
          extraShaken: item.type==='monster'&&!item.wildcard
            ? Array.from({length:Math.max(0,Math.trunc(Number(item.trackers.count?.value)||0))},()=>Boolean(item.hasShaken&&item.shaken))
            : [],
          documentPath: item.path,
          trackResources: item.type==='monster' || Boolean(item.trackers.bennies || item.trackers.wounds || item.hasShaken),
          gmTrackers: item.trackers,
          portraitPath: item.portraitPath
        };
        additions.push(combatant);
      });
      additions.forEach(combatant => state.combatants.push(combatant));
      const duplicates = names.length - uniqueNames.length;
      if (additions.length || synced || mergedDuplicates) { save(); render(); }
      status.hidden = false;
      const summary = [];
      if (additions.length) summary.push(`Imported ${additions.length} ${additions.length === 1 ? 'name' : 'names'}`);
      if (synced) summary.push(`synced ${synced} existing ${synced === 1 ? 'entry' : 'entries'}`);
      if (mergedDuplicates) summary.push(`merged ${mergedDuplicates} duplicate ${mergedDuplicates === 1 ? 'entry' : 'entries'}`);
      if (duplicates) summary.push(`skipped ${duplicates} duplicate${duplicates === 1 ? '' : 's'}`);
      status.textContent = summary.length
        ? `${summary.join('; ')}.`
        : names.length ? 'All open character and monster names are already in the list.' : 'No open character or monster documents found in the GM workspace.';
    } catch (error) {
      status.hidden = false;
      status.textContent = `Could not import open document names: ${error?.message || error}`;
    } finally {
      importingOpenDocuments = false;
      if (importButton) importButton.disabled = false;
    }
  }
  async function importOpenDramaticParticipants() {
    const button = $('#importOpenDramaticParticipants');
    const status = $('#dramaticImportOpenStatus');
    button.disabled = true;
    const gm = parentGM();
    const sidebar = gm?.sidebarData;
    const readFile = gm?.data?.readFile;
    if (!sidebar || typeof readFile !== 'function') {
      status.hidden = false;
      status.textContent = 'The GM document workspace is not ready. Try again in a moment.';
      button.disabled = false;
      return;
    }
    try {
      await sidebar.readyPromise;
      const paths = sidebar.getWorkspaceDocuments?.() || [];
      const activeDocument = sidebar.getActiveDocument?.() || {};
      const entries = [];
      for (const path of paths) {
        const markdown = path === activeDocument.path && typeof activeDocument.markdown === 'string'
          ? activeDocument.markdown : await readFile.call(gm.data, path);
        const entry = markdown == null ? null : nameFromOpenDocument(path, markdown);
        if (entry?.type === 'character') entries.push(entry);
      }
      const seen = new Set(state.dramaticTask.participants.map(item => normalizedCombatantIdentity(item.name)).filter(Boolean));
      let added = 0;
      entries.forEach(entry => {
        const identity = normalizedCombatantIdentity(entry.name);
        if (!identity || seen.has(identity)) return;
        seen.add(identity);
        const participant = {
          id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          name: entry.name,
          card: null
        };
        if (state.dramaticTask.status === 'active') drawDramaticCardForParticipant(participant);
        state.dramaticTask.participants.push(participant);
        added += 1;
      });
      status.hidden = false;
      status.textContent = added
        ? `Added ${added} open ${added === 1 ? 'character' : 'characters'}.`
        : entries.length ? 'All open character documents are already participants.' : 'No open character documents found.';
      if (added) { save(); render(); }
    } catch (error) {
      status.hidden = false;
      status.textContent = `Could not load open document names: ${error?.message || error}`;
    } finally {
      button.disabled = false;
    }
  }
  function setToolPanel(panel, persist = true) {
    const activePanel = ['initiative', 'dice', 'deck', 'chase', 'dramatic'].includes(panel) ? panel : 'initiative';
    document.body.dataset.activeToolPanel = activePanel;
    ['initiative', 'dice', 'deck', 'chase', 'dramatic'].forEach(name => {
      document.body.classList.toggle(`tool-tab-${name}`, activePanel === name);
    });
    state.activeToolPanel = activePanel;
    document.querySelectorAll('[data-tool-panel]').forEach(button => {
      const selected = button.dataset.toolPanel === activePanel;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    if (persist) save();
  }
  function shuffledDeck() {
    const deck=[];
    SUITS.forEach(suit => RANKS.forEach((value,index) => deck.push({value,suit,rank:index})));
    deck.push({joker:true,color:'red'},{joker:true,color:'black'});
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
    return deck;
  }
  function dealDramaticCards() {
    const task = state.dramaticTask;
    if (!task.participants.length) return false;
    task.cardDeck = task.cardDeck && Array.isArray(task.cardDeck.draw) && Array.isArray(task.cardDeck.discard)
      ? task.cardDeck : {draw:shuffledDeck(),discard:[]};
    task.participants.forEach(participant => {
      if (participant.card) task.cardDeck.discard.push(participant.card);
      participant.card = null;
    });
    if (task.cardDeck.draw.length < task.participants.length) {
      task.cardDeck.draw = shuffleInPlace([...task.cardDeck.draw, ...task.cardDeck.discard]);
      task.cardDeck.discard = [];
    }
    if (task.cardDeck.draw.length < task.participants.length) {
      task.cardDeck.draw = shuffledDeck();
      task.cardDeck.discard = [];
    }
    task.participants.forEach(participant => { participant.card = task.cardDeck.draw.shift() || null; });
    if (task.participants.some(participant => participant.card?.joker)) {
      task.cardDeck.draw = shuffleInPlace([...task.cardDeck.draw, ...task.cardDeck.discard]);
      task.cardDeck.discard = [];
    }
    return true;
  }
  function drawDramaticCardForParticipant(participant) {
    const task = state.dramaticTask;
    if (!task.cardDeck.draw.length) {
      task.cardDeck.draw = shuffleInPlace([...task.cardDeck.discard]);
      task.cardDeck.discard = [];
    }
    if (!task.cardDeck.draw.length) task.cardDeck.draw = shuffledDeck();
    participant.card = task.cardDeck.draw.shift() || null;
    if (participant.card?.joker) {
      task.cardDeck.draw = shuffleInPlace([...task.cardDeck.draw, ...task.cardDeck.discard]);
      task.cardDeck.discard = [];
    }
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
      const isDealing = cardDealAnimationIds.has(combatant.id);
      row.className = `combatant-row${combatant.card?.joker ? ' is-joker' : ''}${isDealing ? ' is-dealing' : ''}${activeJokerRevealIds.includes(combatant.id) ? ' joker-reveal-row' : ''}`;
      if (isDealing) row.style.setProperty('--deal-delay', `${Math.min((cardDealAnimationOrder.get(combatant.id) || 0) * 55, 850)}ms`);
      const card = combatant.card ? cardFace(combatant.card) : document.createElement('div');
      if (!combatant.card) { card.className='card-face pending'; card.textContent='···'; }
      if (isDealing && combatant.card) card.classList.add('is-dealing-card');
      const portrait=document.createElement('span');
      portrait.className='combatant-portrait';
      const isMonster=combatant.entityType==='monster';
      const hasPortrait=Boolean(String(combatant.portraitPath||'').trim());
      const isMonsterSilhouette=isMonster&&!hasPortrait;
      const isWildCardMonster=isMonsterSilhouette&&Boolean(combatant.wildcard);
      const isExtraMonster=isMonsterSilhouette&&!Boolean(combatant.wildcard);
      if(isMonster)portrait.classList.add('is-monster');
      if(isWildCardMonster)portrait.classList.add('is-wild-card');
      if(isExtraMonster)portrait.classList.add('is-extra');
      portrait.setAttribute('role','img');
      portrait.setAttribute('aria-label',hasPortrait?`${combatant.name} portrait`:`${combatant.name} ${isMonster?(combatant.wildcard?'Wild Card monster':'Extra monster'):'character'} silhouette`);
      const silhouette=document.createElementNS('http://www.w3.org/2000/svg','svg');
      silhouette.setAttribute('viewBox','0 0 40 40');
      silhouette.setAttribute('aria-hidden','true');
      silhouette.setAttribute('focusable','false');
      if(isMonster){
        const head=document.createElementNS('http://www.w3.org/2000/svg','path');
        head.setAttribute('d','M12 12 5 4l11 5c1-2 3-3 4-3s3 1 4 3l11-5-7 9c1 2 2 4 2 7 0 8-4 13-10 13s-10-5-10-13c0-3 1-6 2-8Z');
        const leftEye=document.createElementNS('http://www.w3.org/2000/svg','path');
        leftEye.setAttribute('d','m13 18 5 2-4 3Z');leftEye.setAttribute('class','silhouette-cutout');
        const rightEye=document.createElementNS('http://www.w3.org/2000/svg','path');
        rightEye.setAttribute('d','m27 18-5 2 4 3Z');rightEye.setAttribute('class','silhouette-cutout');
        const mouth=document.createElementNS('http://www.w3.org/2000/svg','path');
        mouth.setAttribute('d','M15 27q5 3 10 0l-2 5h-6Z');mouth.setAttribute('class','silhouette-cutout');
        silhouette.append(head,leftEye,rightEye,mouth);
      }else{
        const head=document.createElementNS('http://www.w3.org/2000/svg','circle');
        head.setAttribute('cx','20');head.setAttribute('cy','13');head.setAttribute('r','6');
        const shoulders=document.createElementNS('http://www.w3.org/2000/svg','path');
        shoulders.setAttribute('d','M8 34c.8-7.2 5.7-11 12-11s11.2 3.8 12 11');
        silhouette.append(head,shoulders);
      }
      const portraitImage=document.createElement('img');
      portraitImage.alt='';portraitImage.loading='eager';portraitImage.draggable=false;
      portrait.append(silhouette,portraitImage);
      if(isWildCardMonster){
        const crown=document.createElementNS('http://www.w3.org/2000/svg','svg');
        crown.classList.add('wild-card-crown');
        crown.setAttribute('viewBox','0 0 24 24');
        crown.setAttribute('aria-hidden','true');
        crown.setAttribute('focusable','false');
        const crownShape=document.createElementNS('http://www.w3.org/2000/svg','path');
        crownShape.setAttribute('d','M3 7.5 8 11 12 4l4 7 5-3.5L19 20H5L3 7.5Z');
        crown.appendChild(crownShape);
        portrait.appendChild(crown);
      }
      attachPortraitSource(portrait,portraitImage,combatant.portraitPath);
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
      const trackerName=trackerNameFor(combatant);
      const trackerShortName=combatant.entityType==='monster'?(combatant.wildcard?'W':'Count'):'B/W';
      trackerToggle.textContent=combatant.trackResources?`${trackerShortName} ✓`:'+ Track';
      trackerToggle.title=`${combatant.trackResources?'Hide':'Show'} ${trackerName} tracker${combatant.entityType==='monster'&&!combatant.wildcard?'':'s'} for ${combatant.name}`;
      trackerToggle.setAttribute('aria-label',trackerToggle.title);
      trackerToggle.addEventListener('click',()=>{combatant.trackResources=!combatant.trackResources;save();render();});
      const wildCardBadge=document.createElement('span');
      wildCardBadge.className=`wildcard-status${combatant.wildcard?' is-wild-card':' is-extra'}`;
      wildCardBadge.textContent=combatant.wildcard?'Wild Card':'Extra';
      wildCardBadge.title=`${combatant.name}: ${combatant.wildcard?'Wild Card':'Extra'}`;
      wildCardBadge.hidden=!isMonster;
      const remove = document.createElement('button'); remove.type='button'; remove.className='row-menu'; remove.textContent='×'; remove.title=`Remove ${combatant.name}`; remove.setAttribute('aria-label',remove.title);
      remove.addEventListener('click',()=>{
        if(state.initiativeDeck){
          const cards=combatant.cardOptions?.map(option=>option.card)||[combatant.card];
          cards.filter(Boolean).forEach(removed=>state.initiativeDeck.discard.push(removed));
        }
        state.combatants=state.combatants.filter(x=>x.id!==combatant.id);save();render();
      });
      row.append(portrait,card,name,marker,turnArrows,status,redraw,wildCardBadge,trackerToggle,remove);
      if(combatant.trackResources){
        const resources=document.createElement('div');resources.className='resource-trackers';
        resources.classList.add(combatant.entityType==='monster'?(combatant.wildcard?'is-wild-card':'is-extra'):'is-character');
        if(combatant.entityType==='monster'&&!combatant.wildcard){
          resources.append(makeResourceCounter(combatant,'count','Count',0,99));
          const extras=document.createElement('div');extras.className='extra-status-list';
          resizeExtraStates(combatant);
          combatant.extraShaken.forEach((shaken,index)=>{
            const extraRow=document.createElement('div');extraRow.className='extra-status-row';
            const number=document.createElement('span');number.className='extra-status-number';number.textContent=`Extra ${index+1}`;
            extraRow.append(number,makeShakenToggle(combatant,index));
            extras.append(extraRow);
          });
          resources.append(extras);
        }else{
          const trackerKeys=trackerKeysFor(combatant);
          trackerKeys.forEach(key=>{
            const label=key==='bennies'?'Bennies':key==='wounds'?'Wounds':'Count';
            const max=key==='wounds'?3:key==='count'?99:99;
            if(combatant.entityType==='monster'&&resources.childElementCount===0)resources.append(makeShakenToggle(combatant));
            if(combatant.entityType!=='monster'&&key==='wounds')resources.append(makeShakenToggle(combatant));
            resources.append(makeResourceCounter(combatant,key,label,0,max));
          });
        }
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
    const revealedJokers=state.combatants.filter(combatant=>activeJokerRevealIds.includes(combatant.id)&&combatant.card?.joker);
    const jokerReveal=$('#jokerReveal');
    jokerReveal.hidden=revealedJokers.length===0;
    $('#jokerRevealText').textContent=revealedJokers.length
      ?`${revealedJokers.map(combatant=>combatant.name).join(', ')} drew a Joker. +2 to Trait and damage rolls this round; all other players on their side receive a Benny. A Joker acts whenever its player chooses.`
      :'';
    $('#extraDeckStatus').textContent=`${state.extraDeck.length} cards left in this deck`;
    renderDraws();
    renderChase();
    renderDramaticTask();
  }
  function renderDraws() {
    ui.drawList.replaceChildren();
    if(!state.cardDraws.length){const empty=document.createElement('div');empty.className='empty-draw';empty.textContent='Draw a card for any table moment.';ui.drawList.append(empty);return;}
    state.cardDraws.forEach(item=>{
      const row=document.createElement('div');row.className='drawn-card-row';
      const face=cardFace(item.card);
      if(item.id&&item.id===activeDrawAnimationId)face.classList.add('is-dealing-card');
      row.append(face);
      const reason=document.createElement('span');reason.className=`draw-reason${item.reason?'':' no-reason'}`;reason.textContent=item.reason||'No reason added';
      row.append(reason);ui.drawList.append(row);
    });
  }
  function chaseOrder() {
    return [...state.chase.participants].sort((a,b) => {
      if (!a.card && !b.card) return a.name.localeCompare(b.name);
      if (!a.card) return 1;
      if (!b.card) return -1;
      if (a.card.joker || b.card.joker) return Number(b.card.joker) - Number(a.card.joker);
      return (Number(b.card.rank) || 0) - (Number(a.card.rank) || 0)
        || (Number(b.card.suit?.rank) || 0) - (Number(a.card.suit?.rank) || 0)
        || a.name.localeCompare(b.name);
    });
  }
  function isChaseComplication(participant) {
    return Boolean(participant.card && !participant.card.joker && participant.card.suit?.name === 'Clubs');
  }
  function chaseTrackSuitKey(card) {
    return card?.joker ? 'joker' : String(card?.suit?.name || '').toLocaleLowerCase();
  }
  function participantTokenLabel(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    return words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}`.toLocaleUpperCase() : (words[0] || '?').slice(0, 2).toLocaleUpperCase();
  }
  function nextChaseTokenColor() {
    const used = new Set(state.chase.participants.map(participant=>participant.color));
    return CHASE_TOKEN_COLORS.find(color=>!used.has(color)) || CHASE_TOKEN_COLORS[state.chase.participants.length % CHASE_TOKEN_COLORS.length];
  }
  function clearChaseTokenDrag() {
    document.querySelectorAll('.chase-track-slot.drag-over').forEach(slot=>slot.classList.remove('drag-over'));
    document.querySelectorAll('.chase-token.is-dragging').forEach(token=>token.classList.remove('is-dragging'));
    document.body.classList.remove('chase-token-dragging');
    chaseTokenDrag = null;
  }
  function bindChaseTokenDrag(token, participant) {
    token.addEventListener('pointerdown',event=>{
      if(!event.isPrimary||event.button!==0)return;
      chaseTokenDrag={id:participant.id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,started:false};
      try{token.setPointerCapture(event.pointerId);}catch{}
    });
    token.addEventListener('pointermove',event=>{
      if(!chaseTokenDrag||chaseTokenDrag.id!==participant.id||chaseTokenDrag.pointerId!==event.pointerId)return;
      if(!chaseTokenDrag.started&&Math.hypot(event.clientX-chaseTokenDrag.startX,event.clientY-chaseTokenDrag.startY)<8)return;
      chaseTokenDrag.started=true;
      event.preventDefault();
      token.classList.add('is-dragging');
      document.body.classList.add('chase-token-dragging');
      const slot=document.elementFromPoint(event.clientX,event.clientY)?.closest('.chase-track-slot');
      document.querySelectorAll('.chase-track-slot.drag-over').forEach(item=>item.classList.toggle('drag-over',item===slot));
      slot?.classList.add('drag-over');
    });
    const finish=event=>{
      if(!chaseTokenDrag||chaseTokenDrag.id!==participant.id||chaseTokenDrag.pointerId!==event.pointerId)return;
      const started=chaseTokenDrag.started;
      const slot=started?document.elementFromPoint(event.clientX,event.clientY)?.closest('.chase-track-slot'):null;
      const position=slot?Number(slot.dataset.position):NaN;
      const current=state.chase.participants.find(item=>item.id===participant.id);
      const moved=Boolean(current&&Number.isInteger(position)&&position>=0&&position<9&&current.position!==position);
      if(moved)current.position=position;
      clearChaseTokenDrag();
      if(moved){save();render();}
    };
    token.addEventListener('pointerup',finish);
    token.addEventListener('pointercancel',event=>{
      if(chaseTokenDrag?.id===participant.id&&chaseTokenDrag.pointerId===event.pointerId)clearChaseTokenDrag();
    });
  }
  function renderChase() {
    const chase = state.chase;
    const list = $('#chaseParticipantList');
    list.replaceChildren();
    chaseOrder().forEach(participant => {
      const row = document.createElement('div');
      const isDealing=cardDealAnimationIds.has(participant.id);
      const hasComplication = isChaseComplication(participant);
      row.className = `chase-participant-row${participant.card?.joker ? ' is-joker' : ''}${hasComplication ? ' has-complication' : ''}${isDealing?' is-dealing':''}`;
      if(isDealing)row.style.setProperty('--deal-delay',`${Math.min((cardDealAnimationOrder.get(participant.id)||0)*55,850)}ms`);
      const card=participant.card?cardFace(participant.card):Object.assign(document.createElement('div'),{className:'card-face pending',textContent:'···'});
      if(isDealing&&participant.card)card.classList.add('is-dealing-card');
      row.append(card);
      const details=document.createElement('div');details.className='chase-participant-details';
      const swatch=document.createElement('span');swatch.className='chase-participant-swatch';swatch.style.setProperty('--chase-token-color',participant.color);swatch.setAttribute('aria-hidden','true');
      const name = document.createElement('span'); name.className = 'chase-participant-name'; name.textContent = participant.name;
      details.append(swatch,name);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'row-menu'; remove.textContent = '×';
      remove.title = `Remove ${participant.name} from chase`; remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => { chase.participants = chase.participants.filter(item => item.id !== participant.id); save(); render(); });
      row.append(details, remove);
      list.append(row);
    });
    const track = $('#chaseTrack');
    track.replaceChildren();
    chase.trackCards.forEach((trackCard,index)=>{
      const slot = document.createElement('div'); slot.className='chase-track-slot';
      slot.dataset.position=String(index);
      const position = document.createElement('span'); position.className='chase-track-position'; position.textContent=`CARD ${index+1}`;
      const face = cardFace(trackCard); face.classList.add('chase-track-face');
      const tokens = document.createElement('div'); tokens.className='chase-track-tokens';
      chase.participants.filter(participant=>participant.position===index).forEach(participant=>{
        const tokenControl=document.createElement('div');tokenControl.className='chase-token-control';
        const moveBack=document.createElement('button');moveBack.type='button';moveBack.className='chase-token-move';moveBack.textContent='‹';moveBack.disabled=participant.position<=0;
        moveBack.title=`Move ${participant.name} back one Chase Card`;moveBack.setAttribute('aria-label',moveBack.title);
        moveBack.addEventListener('click',()=>{participant.position=Math.max(0,participant.position-1);save();render();});
        const token = document.createElement('span');
        token.className=`chase-token${isChaseComplication(participant)?' triggers-complication':''}`;
        token.style.setProperty('--chase-token-color',participant.color);
        token.textContent=participantTokenLabel(participant.name);
        token.title=`${participant.name}${isChaseComplication(participant)?' · Club Action Card: complication':''}`;
        token.setAttribute('aria-label',token.title);
        bindChaseTokenDrag(token,participant);
        const moveAhead=document.createElement('button');moveAhead.type='button';moveAhead.className='chase-token-move';moveAhead.textContent='›';moveAhead.disabled=participant.position>=8;
        moveAhead.title=`Move ${participant.name} ahead one Chase Card`;moveAhead.setAttribute('aria-label',moveAhead.title);
        moveAhead.addEventListener('click',()=>{participant.position=Math.min(8,participant.position+1);save();render();});
        tokenControl.append(moveBack,token,moveAhead);tokens.append(tokenControl);
      });
      slot.append(position,face,tokens); track.append(slot);
    });
    const complicationNames = new Map();
    chase.participants.filter(isChaseComplication).forEach(participant=>{
      const trackCard=chase.trackCards[participant.position];
      const suitKey=chaseTrackSuitKey(trackCard);
      if(!complicationNames.has(suitKey))complicationNames.set(suitKey,[]);
      complicationNames.get(suitKey).push(participant.name);
    });
    document.querySelectorAll('.chase-complication-table tbody tr').forEach(row=>{
      const namesCell=row.querySelector('.chase-complication-participants');
      const names=complicationNames.get(row.dataset.chaseSuit)||[];
      row.classList.toggle('is-highlighted',names.length>0);
      namesCell.replaceChildren();
      names.forEach(name=>{const tag=document.createElement('span');tag.className='chase-complication-tag';tag.textContent=name;namesCell.append(tag);});
    });
    $('#chaseParticipantCount').textContent = chase.participants.length;
    $('#chaseRound').textContent = String(chase.round).padStart(2, '0');
    $('#chaseEmpty').hidden = chase.participants.length > 0;
    $('#chaseDeckStatus').textContent = `${chase.deck?.draw?.length ?? 54} cards left`;
    $('#dealChaseCards').disabled = chase.participants.length === 0;
  }
  function renderDramaticTask() {
    const task = state.dramaticTask;
    const setup = $('#dramaticSetup');
    const live = $('#dramaticLive');
    const running = task.status !== 'setup';
    setup.hidden = running;
    live.hidden = !running;
    $('#dramaticAddForm').hidden = running;
    if (running) $('#dramaticImportOpenStatus').hidden = true;
    const participantList = $('#dramaticParticipantList');
    participantList.replaceChildren();
    const orderedParticipants = [...task.participants].sort((a, b) => {
      if (!a.card && !b.card) return a.name.localeCompare(b.name);
      if (!a.card) return 1;
      if (!b.card) return -1;
      if (a.card.joker || b.card.joker) return Number(b.card.joker) - Number(a.card.joker);
      return (Number(b.card.rank) || 0) - (Number(a.card.rank) || 0)
        || (Number(b.card.suit?.rank) || 0) - (Number(a.card.suit?.rank) || 0)
        || a.name.localeCompare(b.name);
    });
    orderedParticipants.forEach(participant => {
      const row = document.createElement('div');
      const complication = Boolean(participant.card && !participant.card.joker && participant.card.suit?.name === 'Clubs');
      row.className = `dramatic-participant-row${participant.card?.joker ? ' is-joker' : ''}${complication ? ' has-complication' : ''}`;
      const name = document.createElement('span');
      name.className = 'dramatic-participant-name';
      name.textContent = participant.name;
      row.append(name);
      if (complication) {
        const badge = document.createElement('span');
        badge.className = 'dramatic-complication-badge';
        badge.textContent = '♣ COMPLICATION · −2';
        badge.title = 'Task and Support rolls take −2; failure during this complication fails the task.';
        row.append(badge);
      } else if (participant.card?.joker) {
        const badge = document.createElement('span');
        badge.className = 'dramatic-joker-badge';
        badge.textContent = 'JOKER · +2';
        badge.title = 'Jokers grant +2 to Trait and damage rolls.';
        row.append(badge);
      }
      const card = participant.card ? cardFace(participant.card) : document.createElement('div');
      if (!participant.card) card.className = 'card-face pending';
      card.title = participant.card ? cardDescription(participant.card) : 'No Action Card dealt';
      row.append(card);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'row-menu dramatic-participant-remove';
      remove.textContent = '×';
      remove.title = `Remove ${participant.name}`;
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => {
        if (participant.card) task.cardDeck.discard.push(participant.card);
        task.participants = task.participants.filter(item => item.id !== participant.id);
        save(); render();
      });
      row.append(remove);
      participantList.append(row);
    });
    $('#dramaticParticipantCount').textContent = task.participants.length;
    $('#dramaticEmptyParticipants').hidden = task.participants.length > 0;
    $('#dramaticDeckStatus').textContent = `${task.cardDeck.draw.length} cards left`;
    $('#dramaticCardHint').textContent = task.status === 'active'
      ? 'Next round deals a fresh Action Card to each participant.'
      : task.status === 'setup' ? 'Cards are dealt when you start the task.' : 'Task ended; reset to run it again.';
    $('#dramaticActiveComplication').hidden = !task.participants.some(participant =>
      participant.card && !participant.card.joker && participant.card.suit?.name === 'Clubs'
    );
    if (!running) {
      $('#dramaticTaskName').value = task.title;
      $('#dramaticTargetTokens').value = task.targetTokens;
      $('#dramaticRoundLimit').value = task.maxRounds;
      return;
    }

    $('#dramaticLiveName').textContent = task.title || 'Dramatic Task';
    $('#dramaticTokenCount').textContent = task.tokens;
    $('#dramaticTokenTarget').textContent = task.targetTokens;
    $('#dramaticRoundCount').textContent = `${task.currentRound} / ${task.maxRounds}`;
    const progress = Math.min(100, Math.round((task.tokens / task.targetTokens) * 100));
    const progressBar = $('.dramatic-progress');
    progressBar.setAttribute('aria-valuemax', String(task.targetTokens));
    progressBar.setAttribute('aria-valuenow', String(Math.min(task.tokens, task.targetTokens)));
    $('#dramaticProgressFill').style.width = `${progress}%`;
    const track = $('#dramaticTokenTrack');
    track.replaceChildren();
    if (task.targetTokens <= 30) {
      for (let i = 0; i < task.targetTokens; i += 1) {
        const token = document.createElement('span');
        token.className = `dramatic-token${i < task.tokens ? ' earned' : ''}`;
        track.append(token);
      }
    }
    const outcome = $('#dramaticOutcome');
    outcome.className = `dramatic-outcome${task.status === 'complete' ? ' success' : task.status === 'expired' ? ' failed' : ''}`;
    outcome.textContent = task.status === 'complete'
      ? 'TASK COMPLETE'
      : task.status === 'expired'
        ? `TIME UP · ${task.tokens} OF ${task.targetTokens} TOKENS`
        : `ROUND ${task.currentRound} · ${task.maxRounds - task.currentRound} ${task.maxRounds - task.currentRound === 1 ? 'ROUND' : 'ROUNDS'} AFTER THIS`;
    const active = task.status === 'active';
    $('#addTaskSuccess').disabled = !active;
    $('#addTaskRaise').disabled = !active;
    $('#endTaskRound').disabled = !active;
    $('#undoTaskAction').disabled = task.actions.length === 0;
    $('#endTaskRound').textContent = task.currentRound >= task.maxRounds ? 'Finish task' : 'Next round';
  }
  function dealChaseRound() {
    const chase = state.chase;
    if (!chase.participants.length) { $('#chaseParticipantName').focus(); return; }
    chase.deck ||= {draw:shuffledDeck(),discard:[]};
    chase.participants.forEach(participant => {
      if (participant.card) chase.deck.discard.push(participant.card);
      participant.card = null;
    });
    if (!chase.deck.draw.length) {
      chase.deck.draw = shuffleInPlace([...chase.deck.discard]);
      chase.deck.discard = [];
    }
    chase.round += 1;
    chase.participants.forEach(participant => {
      if (!chase.deck.draw.length) return;
      participant.card = chase.deck.draw.shift();
    });
    if (chase.participants.some(participant => participant.card?.joker)) {
      chase.deck.draw = shuffleInPlace([...chase.deck.draw,...chase.deck.discard]);
      chase.deck.discard = [];
    }
    beginCardDealAnimation(chaseOrder().map(participant=>participant.id));
    save(); render();
  }
  function makeResourceCounter(combatant,key,label,min,max){
    const linkedTracker=combatant.gmTrackers?.[key];
    if(linkedTracker?.enforceMax&&Number.isFinite(linkedTracker.max))max=linkedTracker.max;
    const group=document.createElement('div');group.className='resource-counter';
    const title=document.createElement('span');title.className='resource-name';
    const icon=document.createElement('span');icon.className=`resource-icon ${key==='bennies'?'coin':key==='count'?'count':'heart'}`;
    icon.textContent=key==='bennies'?'🪙':key==='count'?'#':'♥';icon.setAttribute('aria-hidden','true');
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
    const wasShaken=Boolean(combatant.shaken);
    combatant[key]=Math.max(min,Math.min(max,(Number(combatant[key])||0)+delta));
    if(key==='count'&&combatant.entityType==='monster'&&!combatant.wildcard)resizeExtraStates(combatant);
    syncGmTracker(combatant,key);save();render();
    if(wasShaken!==Boolean(combatant.shaken)){
      combatant.noteShaken=Boolean(combatant.shaken);
      save();
      syncStatusToOpenDocument(combatant,'Shaken',combatant.shaken);
    }
  }
  function syncStatusToOpenDocument(combatant,label,checked){
    const sidebar=parentGM()?.sidebarData;
    if(!combatant.documentPath||typeof sidebar?.updateInitiativeTask!=='function')return;
    Promise.resolve(sidebar.updateInitiativeTask(combatant.documentPath,label,checked)).catch(error=>{
      console.warn(`Could not update ${label} in ${combatant.name}'s note`,error);
    });
  }
  function makeShakenToggle(combatant,extraIndex=null){
    const isExtra=Number.isInteger(extraIndex);
    const isShaken=isExtra?Boolean(combatant.extraShaken?.[extraIndex]):Boolean(combatant.shaken);
    const button=document.createElement('button');
    button.type='button';
    button.className=`resource-status-toggle${isShaken?' is-active':''}`;
    button.textContent=isShaken?'Shaken ✓':'Shaken';
    button.title=`${combatant.name}${isExtra?` Extra ${extraIndex+1}`:''} is ${isShaken?'Shaken':'not Shaken'}; click to change`;
    button.setAttribute('aria-label',button.title);
    button.setAttribute('aria-pressed',String(isShaken));
    button.addEventListener('click',()=>{
      if(isExtra){
        combatant.extraShaken[extraIndex]=!combatant.extraShaken[extraIndex];
        combatant.shaken=combatant.extraShaken.length>0&&combatant.extraShaken.every(Boolean);
      }else{
        combatant.shaken=!combatant.shaken;
      }
      combatant.noteShaken=Boolean(combatant.shaken);
      save();render();
      syncStatusToOpenDocument(combatant,'Shaken',combatant.shaken);
    });
    return button;
  }
  function syncGmTracker(combatant,resource){
    const tracker=combatant.gmTrackers?.[resource];
    if(!tracker?.key)return;
    const key=String(tracker.key).trim().toLowerCase();
    const value=Number(combatant[resource])||0;
    try{localStorage.setItem(`gm_tracker_${key}`,String(value));}catch(_){/* table state still persists separately */}
    postToHost({type:'gm-tracker-updated',key,value});
  }
  function readLinkedTrackerValue(tracker,newValue){
    const raw=newValue===null||newValue===undefined?tracker.fallback:newValue;
    const parsed=Number(raw);
    let value=Number.isFinite(parsed)?Math.trunc(parsed):tracker.fallback;
    value=Math.max(0,value);
    if(tracker.enforceMax&&Number.isFinite(tracker.max))value=Math.min(tracker.max,value);
    return value;
  }
  window.addEventListener('storage',event=>{
    if(event.key===STORAGE_KEY&&event.newValue){
      state=loadState();
      setToolPanel(state.activeToolPanel, false);
      render();
      updateDiceControls();
      return;
    }
    if(!event.key?.startsWith('gm_tracker_'))return;
    const key=event.key.slice('gm_tracker_'.length).toLowerCase();
    let changed=false;
    state.combatants.forEach(combatant=>{
      Object.entries(combatant.gmTrackers||{}).forEach(([resource,tracker])=>{
        if(String(tracker?.key||'').toLowerCase()!==key)return;
        const value=readLinkedTrackerValue(tracker,event.newValue);
        if(combatant[resource]!==value){
          combatant[resource]=value;
          if(resource==='count'&&combatant.entityType==='monster'&&!combatant.wildcard)resizeExtraStates(combatant);
          changed=true;
        }
      });
    });
    if(changed){save();render();}
  });
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
  function deal() {
    if(!state.combatants.length){ui.name.focus();return;}
    state.round+=1;
    state.initiativeDeck={draw:shuffledDeck(),discard:[]};
    state.combatants.forEach(combatant=>{combatant.card=state.initiativeDeck.draw.shift()||null;combatant.cardOptions=null;});
    state.activeId=initiativeOrder().find(c=>c.card)?.id||null;
    if(state.combatants.some(c=>c.card?.joker))shuffleInitiativeUndealt();
    const order=initiativeOrder();
    beginCardDealAnimation(order.map(combatant=>combatant.id),order.filter(combatant=>combatant.card?.joker).map(combatant=>combatant.id));
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
    if(replacement.joker)shuffleInitiativeUndealt();
    beginCardDealAnimation([id]);
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
    beginCardDealAnimation([id],[chosen.card?.joker?id:null].filter(Boolean));
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
    activeJokerRevealIds=[];
    if(card.joker)shuffleExtraUndealt();
    const reason=$('#drawReason').value.trim();
    const drawId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
    activeDrawAnimationId=drawId;
    if(drawAnimationTimer)window.clearTimeout(drawAnimationTimer);
    drawAnimationTimer=window.setTimeout(()=>{
      if(activeDrawAnimationId!==drawId)return;
      activeDrawAnimationId=null;drawAnimationTimer=null;render();
    },900);
    state.cardDraws.unshift({id:drawId,card,reason});state.cardDraws=state.cardDraws.slice(0,12);
    $('#drawReason').value='';save();render();
  }
  ui.type.addEventListener('change',()=>{ui.extraCountControl.hidden=ui.type.value!=='extra';});
  ui.form.addEventListener('submit',event=>{
    event.preventDefault();const name=ui.name.value.trim();if(!name)return;
    const selection=ui.type.value;
    const isMonster=selection==='wildcard'||selection==='extra';
    const wildcard=selection==='wildcard';
    const count=selection==='extra'?Math.max(1,Math.min(99,Math.trunc(Number(ui.extraCount.value)||1))):1;
    state.combatants.push({id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,name,entityType:isMonster?'monster':'character',wildcard,card:null,bennies:0,wounds:0,count,shaken:false,noteShaken:null,extraShaken:Array.from({length:wildcard?0:count},()=>false),trackResources:isMonster});
    ui.type.value='character';ui.extraCountControl.hidden=true;ui.extraCount.value='3';
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
  if (document.documentElement.classList.contains('embedded') || IS_POPOUT) {
    importOpenButton.hidden = false;
    importOpenButton.addEventListener('click', importOpenDocuments);
    const dramaticImportButton = $('#importOpenDramaticParticipants');
    dramaticImportButton.hidden = false;
    dramaticImportButton.addEventListener('click', importOpenDramaticParticipants);
  }
  window.addEventListener('message',event=>{
    if(!isHostMessage(event))return;
    if(event.data?.type==='gm-initiative-task-changed'){
      const task=String(event.data.task||'').toLowerCase();
      if(task==='shaken')applyNoteShaken(event.data.path,event.data.name,event.data.checked);
      else if(task==='wild card')applyNoteWildCard(event.data.path,event.data.name,event.data.checked);
      return;
    }
    if(!['gm-refresh-initiative-documents','gm-refresh-initiative-portraits'].includes(event.data?.type))return;
    syncOpenDocuments().catch(()=>{});
  });
  window.WildCardTools = window.WildCardTools || {};
  window.WildCardTools.applyInitiativeNoteTask = (path,name,task,checked)=>{
    const normalizedTask=String(task||'').toLowerCase();
    if(normalizedTask==='shaken')return applyNoteShaken(path,name,checked);
    if(normalizedTask==='wild card')return applyNoteWildCard(path,name,checked);
    return false;
  };
  document.querySelectorAll('[data-tool-panel]').forEach(button => {
    button.addEventListener('click', () => setToolPanel(button.dataset.toolPanel));
  });
  $('#resetToolsTabButton').addEventListener('click',()=>$('#resetAll').click());
  setToolPanel(state.activeToolPanel);
  $('#dramaticAddForm').addEventListener('submit', event => {
    event.preventDefault();
    const input = $('#dramaticParticipantName');
    const name = input.value.trim();
    if (!name) return;
    const identity = normalizedCombatantIdentity(name);
    if (state.dramaticTask.participants.some(item => normalizedCombatantIdentity(item.name) === identity)) {
      $('#dramaticImportOpenStatus').hidden = false;
      $('#dramaticImportOpenStatus').textContent = `${name} is already on the participant list.`;
      input.select();
      return;
    }
    const participant = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      name: name.slice(0,32),
      card: null
    };
    if (state.dramaticTask.status === 'active') drawDramaticCardForParticipant(participant);
    state.dramaticTask.participants.push(participant);
    input.value = '';
    $('#dramaticImportOpenStatus').hidden = true;
    save(); render(); input.focus();
  });
  $('#dramaticSetup').addEventListener('submit',event=>{
    event.preventDefault();
    const task = state.dramaticTask;
    state.dramaticTask={
      title:$('#dramaticTaskName').value.trim().slice(0,80),
      targetTokens:Math.max(1,Math.min(100,Math.trunc(Number($('#dramaticTargetTokens').value)||4))),
      maxRounds:Math.max(1,Math.min(20,Math.trunc(Number($('#dramaticRoundLimit').value)||3))),
      currentRound:1,
      actions:[],
      tokens:0,
      participants:task.participants,
      cardDeck:task.cardDeck,
      status:'active'
    };
    dealDramaticCards();
    save();render();
  });
  const addDramaticTokens = amount => {
    const task=state.dramaticTask;
    if(task.status!=='active')return;
    task.actions.push({tokens:amount,round:task.currentRound});
    task.tokens+=amount;
    if(task.tokens>=task.targetTokens)task.status='complete';
    save();render();
  };
  $('#addTaskSuccess').addEventListener('click',()=>addDramaticTokens(1));
  $('#addTaskRaise').addEventListener('click',()=>addDramaticTokens(2));
  $('#undoTaskAction').addEventListener('click',()=>{
    const task=state.dramaticTask;
    const previous=task.actions.pop();
    if(!previous)return;
    task.tokens=Math.max(0,task.tokens-previous.tokens);
    if(task.status==='complete')task.status='active';
    if(task.status==='expired')task.status='active';
    save();render();
  });
  $('#endTaskRound').addEventListener('click',()=>{
    const task=state.dramaticTask;
    if(task.status!=='active')return;
    if(task.currentRound>=task.maxRounds)task.status='expired';
    else { task.currentRound+=1; dealDramaticCards(); }
    save();render();
  });
  $('#resetDramaticTask').addEventListener('click',()=>{
    const task=state.dramaticTask;
    if(task.status==='active'&&task.actions.length&&!confirm('Start a new task and discard this task’s progress?'))return;
    state.dramaticTask={
      ...normalizeDramaticTask(null),
      title:task.title,
      targetTokens:task.targetTokens,
      maxRounds:task.maxRounds,
      participants:task.participants.map(participant=>({...participant,card:null}))
    };
    save();render();
  });
  $('#chaseAddForm').addEventListener('submit',event=>{
    event.preventDefault();
    const name=$('#chaseParticipantName').value.trim();if(!name)return;
    state.chase.participants.push({id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,name,card:null,color:nextChaseTokenColor(),position:0});
    $('#chaseParticipantName').value='';save();render();$('#chaseParticipantName').focus();
  });
  $('#dealChaseCards').addEventListener('click',dealChaseRound);
  $('#resetChase').addEventListener('click',()=>{
    if(!confirm('Reset the chase participants and cards?'))return;
    state.chase=normalizeChase(null);save();render();
  });
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
    activeJokerRevealIds=[];
    state={round:0,combatants:[],activeId:null,initiativeDeck:null,extraDeck:shuffledDeck(),extraDiscard:[],cardDraws:[],activeToolPanel:state.activeToolPanel,chase:normalizeChase(null),dramaticTask:normalizeDramaticTask(null)};
    save();render();ui.result.innerHTML='<span class="result-hint">Your roll will appear here.</span>';
  });
  window.addEventListener('message',event=>{
    if(!isHostMessage(event))return;
    if(event.data?.type==='gm-tools-reset')$('#resetAll').click();
    if(event.data?.type==='gm-dice-reference'){
      const sides=[4,6,8,10,12,20].includes(Number(event.data.sides))?Number(event.data.sides):6;
      const count=Math.max(1,Math.min(20,Math.trunc(Number(event.data.count)||1)));
      clearDiceResults();
      traitDice=Array.from({length:count},()=>({id:makeDieId(),sides}));
      keepCountTouched=false;
      $('#modifier').value=String(Math.max(-99,Math.min(99,Math.trunc(Number(event.data.modifier)||0))));
      $('#diceMode').value='sum';
      $('#wildDie').checked=count===1&&event.data.wild!==false;
      updateDiceControls();
      setToolPanel('dice');
      const preview=$('.dice-pool-preview');
      preview.classList.remove('is-loaded');
      requestAnimationFrame(()=>preview.classList.add('is-loaded'));
      window.setTimeout(()=>preview.classList.remove('is-loaded'),900);
      $('#rollBtn').focus({preventScroll:true});
    }
  });

  function explodingDie(sides) {
    let subtotal=0,rolls=[],count=0,face;
    do{face=1+Math.floor(Math.random()*sides);rolls.push(face);subtotal+=face;count++;}while(face===sides&&count<100);
    return{subtotal,rolls};
  }
  function makeDieId(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;}
  function formatDie(die){return die.rolls.join(' + ');}
  function clearDiceResults(){
    rollAnimationSequence++;
    if(rollAnimationTimer)window.clearTimeout(rollAnimationTimer);
    rollAnimationTimer=null;
    ui.result.classList.remove('is-rolling');
    ui.result.innerHTML='<span class="result-hint">Your roll will appear here.</span>';
    updateDiceControls();
  }
  function makePoolDieButton(die,label,rolling,onRemove){
    const item=document.createElement('button');item.type='button';item.className='pool-die-item pool-die-removable';item.title=`Remove ${label}`;item.setAttribute('aria-label',item.title);item.disabled=rolling;
    const shape=document.createElement('span');shape.className=`pool-die-shape d${die.sides}`;
    const number=document.createElement('strong');number.textContent=String(die.sides);shape.append(number);
    const caption=document.createElement('small');caption.className='pool-die-label';caption.textContent=label;
    item.append(shape,caption);item.addEventListener('click',onRemove);return item;
  }
  function renderDiceVisuals(dice,kept){
    return `<div class="dice-visual-results" aria-label="Rolled dice">${dice.map(item=>{
      const sides=item.sides;
      const faces=item.die.rolls.map(value=>{
        const face=sides===6?`<span class="die-pips pips-${value}">${Array.from({length:value},()=>'<i></i>').join('')}</span>`:`<strong>${value}</strong>`;
        return `<span class="die-visual-face d${sides}${value===sides?' is-ace':''}" role="img" aria-label="d${sides} shows ${value}${value===sides?' and aces':''}"><small>d${sides}</small>${face}</span>`;
      }).join('<span class="die-visual-plus" aria-hidden="true">+</span>');
      return `<div class="die-visual-group${kept.has(item)?'':' not-kept'}"><span class="die-visual-title">${escapeHTML(item.name)}</span><div class="die-visual-faces">${faces}</div><span class="die-visual-total">${item.die.subtotal}${valueLabel(item.die.rolls.length)}</span></div>`;
    }).join('')}</div>`;
  }
  function valueLabel(rollCount){return rollCount>1?' total':'';}
  function renderDicePool(rolling=false){
    const mode=$('#diceMode').value;
    const traitCount=traitDice.length;
    const wild=Boolean($('#wildDie').checked&&(traitCount===1||mode==='keep'||mode==='display'));
    const pool=$('#dicePoolImages');
    pool.replaceChildren();
    pool.classList.toggle('rolling',rolling);
    $('#dicePoolSummary').textContent=traitCount?`${traitDice.map(die=>`d${die.sides}`).join(' + ')}${wild?' + Wild d6':''}`:'Choose dice above';
    traitDice.forEach((die,index)=>{
      const item=makePoolDieButton(die,`d${die.sides}`,rolling,()=>{
        clearDiceResults();traitDice=traitDice.filter(candidate=>candidate.id!==die.id);updateDiceControls();
      });
      item.style.setProperty('--roll-delay',`${index*8}ms`);pool.append(item);
    });
    if(wild){
      const wildDie={sides:6};
      pool.append(makePoolDieButton(wildDie,'WILD',rolling,()=>{clearDiceResults();$('#wildDie').checked=false;updateDiceControls();}));
    }
  }
  function updatePaletteButtons(rolling=false){
    $('#diePalette').querySelectorAll('[data-add-die]').forEach(button=>{button.disabled=rolling||traitDice.length>=20;});
  }
  function animateRollResult(resultHtml){
    const sequence=++rollAnimationSequence;
    const button=$('#rollBtn');
    if(rollAnimationTimer)window.clearTimeout(rollAnimationTimer);
    button.disabled=true;
    renderDicePool(true);
    ui.result.classList.add('is-rolling');
    $('#diceMode').disabled=true;$('#keepCount').disabled=true;$('#wildDie').disabled=true;$('.wild-toggle').classList.add('is-disabled');
    updatePaletteButtons(true);
    ui.result.innerHTML='<span class="result-hint">Rolling dice…</span>';
    const duration=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?140:850;
    rollAnimationTimer=window.setTimeout(()=>{
      if(sequence!==rollAnimationSequence)return;
      rollAnimationTimer=null;
      ui.result.classList.remove('is-rolling');
      updateDiceControls();
      ui.result.innerHTML=resultHtml;
    },duration);
  }
  function renderOutcomeMarks(score,target){
    if(score<target)return '<span class="roll-outcome-marks" role="img" aria-label="Failure"><span class="roll-outcome-mark failure" aria-hidden="true">×</span></span>';
    const raises=Math.floor((score-target)/4);
    const label=raises?`Success, ${raises} ${raises===1?'raise':'raises'}`:'Success';
    const raiseMarks=Array.from({length:raises},()=>'<span class="roll-outcome-mark raise" aria-hidden="true">+</span>').join('');
    return `<span class="roll-outcome-marks" role="img" aria-label="${label}"><span class="roll-outcome-mark success" aria-hidden="true">✓</span>${raiseMarks}</span>`;
  }
  function updateDiceControls(){
    const traitCount=traitDice.length;
    const multiple=traitCount>1;
    const keepMode=$('#diceMode').value==='keep';
    const displayMode=$('#diceMode').value==='display';
    const toggle=$('.wild-toggle');
    const rolling=ui.result.classList.contains('is-rolling');
    $('#rollModeRow').hidden=!multiple;
    const keepCount=$('#keepCount');
    const oldKeep=keepCountTouched?Math.max(1,Number(keepCount.value)||1):Math.max(1,traitCount);
    keepCount.replaceChildren();
    for(let value=1;value<=Math.max(1,traitCount);value++){
      const option=document.createElement('option');option.value=String(value);option.textContent=String(value);keepCount.append(option);
    }
    keepCount.value=String(Math.min(oldKeep,Math.max(1,traitCount)));
    $('#keepCountWrap').hidden=!multiple||!keepMode;
    const wildUnavailable=(multiple&&!keepMode&&!displayMode)||rolling;
    $('#wildDie').disabled=wildUnavailable;toggle.classList.toggle('is-disabled',wildUnavailable);
    $('#diceMode').disabled=rolling;keepCount.disabled=rolling;
    $('#rollBtn').disabled=traitCount===0||rolling;
    updatePaletteButtons(rolling);
    $('#diceNote').textContent=displayMode
      ?'Show each die roll without applying the modifier, totaling the pool, or checking success. Aces explode.'
      :multiple
      ?(keepMode?'Roll all Trait dice plus an optional Wild Die. Keep the selected count highest, then check each kept die separately against the target. Aces explode.':'Trait dice are summed. To use a Wild Die with multiple dice, choose “Keep highest dice” or “Show rolls only.” Aces explode.')
      :traitCount===1?'Each die aces (maximum rolls) and explodes. With one Trait Die, the Wild Die keeps the higher result.':'Add at least one Trait die to roll.';
    renderDicePool();
  }
  $('#diePalette').addEventListener('click',event=>{
    const button=event.target.closest('[data-add-die]');
    if(!button||button.disabled||traitDice.length>=20)return;
    clearDiceResults();
    traitDice.push({id:makeDieId(),sides:Number(button.dataset.addDie)});
    if($('#wildDie').checked)$('#diceMode').value='keep';
    updateDiceControls();
  });
  $('#diceMode').addEventListener('change',()=>{clearDiceResults();updateDiceControls();});
  $('#keepCount').addEventListener('change',()=>{keepCountTouched=true;clearDiceResults();updateDiceControls();});
  $('#wildDie').addEventListener('change',()=>{clearDiceResults();updateDiceControls();});
  $('#rollBtn').addEventListener('click',()=>{
    const traitCount=traitDice.length;
    if(!traitCount)return;
    const modifier=Math.max(-99,Math.min(99,Number($('#modifier').value)||0));
    const target=Math.max(1,Math.min(99,Number($('#targetNumber').value)||4));
    $('#targetNumber').value=target;
    const mode=$('#diceMode').value;
    const keepCount=Math.max(1,Math.min(traitCount,Number($('#keepCount').value)||1));
    const traits=traitDice.map((die,index)=>({name:`Trait ${index+1} d${die.sides}`,die:explodingDie(die.sides),sides:die.sides}));
    const displayOnly=mode==='display';
    const useWild=$('#wildDie').checked&&(traitCount===1||mode==='keep'||displayOnly);
    const wild=useWild?explodingDie(6):null;
    const dice=[...traits];
    if(wild)dice.push({name:'Wild',die:wild,sides:6});
    const keepHighest=traitCount===1||mode==='keep';
    const kept=new Set(displayOnly?dice:keepHighest
      ?[...dice].sort((a,b)=>b.die.subtotal-a.die.subtotal).slice(0,traitCount===1?1:keepCount)
      :traits);
    if(displayOnly){
      const rows=dice.map(item=>`<div class="roll-only-row"><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(formatDie(item.die))} = ${item.die.subtotal}</span></div>`).join('');
      animateRollResult(`${renderDiceVisuals(dice,kept)}<div class="multi-result-heading"><strong>ROLLS ONLY</strong><span>No success check</span></div><div class="roll-only-list">${rows}</div>`);
      return;
    }
    if(traitCount===1){
      const rows=dice.map(item=>{
        const isKept=kept.has(item);
        const score=item.die.subtotal+(isKept?modifier:0);
        const label=isKept?(score<target?'FAIL':Math.floor((score-target)/4)>0?`${Math.floor((score-target)/4)} ${Math.floor((score-target)/4)===1?'RAISE':'RAISES'}`:'SUCCESS'):'NOT KEPT';
        const scoreText=isKept&&modifier?`${formatDie(item.die)} ${modifier>0?'+':'−'} ${Math.abs(modifier)} = ${score}`:`${formatDie(item.die)} = ${item.die.subtotal}`;
        return `<div class="multi-result-row ${isKept?'kept':'dropped'}"><span class="multi-die-name">${escapeHTML(item.name)}:</span><span class="multi-die-total">${escapeHTML(scoreText)}</span><strong>${label}${isKept?renderOutcomeMarks(score,target):''}</strong></div>`;
      }).join('');
      animateRollResult(`${renderDiceVisuals(dice,kept)}<div class="multi-result-list">${rows}</div>`);
      return;
    }
    if(traitCount>1&&mode==='keep'){
      const modifierText=modifier?` · ${modifier>0?'+':''}${modifier} modifier to each kept die`:'';
      const rows=dice.map(item=>{
        const isKept=kept.has(item);
        const score=item.die.subtotal+modifier;
        const outcome=score<target?'FAIL':Math.floor((score-target)/4)>0?`${Math.floor((score-target)/4)} ${Math.floor((score-target)/4)===1?'RAISE':'RAISES'}`:'SUCCESS';
        const scoreText=isKept&&modifier?`${formatDie(item.die)} ${modifier>0?'+':''}${modifier} = ${score}`:`${formatDie(item.die)} = ${item.die.subtotal}`;
        return `<div class="multi-result-row ${isKept?'kept':'dropped'}"><span class="multi-die-name">${escapeHTML(item.name)}:</span><span class="multi-die-total">${escapeHTML(scoreText)}</span><strong>${isKept?outcome:'NOT KEPT'}${isKept?renderOutcomeMarks(score,target):''}</strong></div>`;
      }).join('');
      animateRollResult(`${renderDiceVisuals(dice,kept)}<div class="multi-result-heading"><strong>KEEP HIGHEST ${keepCount} OF ${dice.length}</strong><span>TN ${target}${modifierText}</span></div><div class="multi-result-list">${rows}</div>`);
      return;
    }
    const rolledTotal=keepHighest
      ?[...kept].reduce((sum,item)=>sum+item.die.subtotal,0)
      :traits.reduce((sum,item)=>sum+item.die.subtotal,0);
    const total=rolledTotal+modifier;
    const raises=total>=target?Math.floor((total-target)/4):0;
    const outcome=total<target?'FAIL':raises?`${raises} ${raises===1?'RAISE':'RAISES'}`:'SUCCESS';
    const dieDetails=traitCount===1
      ?dice.map(item=>{
        const isKept=kept.has(item);
        const modifierPart=modifier&&isKept?` ${modifier>0?'+':'−'} ${Math.abs(modifier)} = ${item.die.subtotal+modifier}`:` = ${item.die.subtotal}`;
        return `${item.name}: ${formatDie(item.die)}${modifierPart}${isKept?' ✓':' ×'}`;
      }).join('  ·  ')
      :dice.map(item=>`${item.name}: ${formatDie(item.die)}${kept.has(item)?' ✓':' ×'}`).join('  ·  ');
    const methodLabel=traitCount>1&&mode==='keep'?`Keep ${keepCount} of ${dice.length}  ·  `:'';
    const detail=`${methodLabel}${dieDetails}${traitCount>1&&mode==='sum'&&modifier?`  ·  Modifier ${modifier>0?'+':''}${modifier} to total`:''}`;
    const label=`${outcome}<small class="target-caption">TN ${target}</small>`;
    animateRollResult(`${renderDiceVisuals(dice,kept)}<div class="result-line"><span class="result-label">${label}</span><strong class="result-total">${total}</strong>${renderOutcomeMarks(total,target)}</div><span class="die-breakdown">${escapeHTML(detail)}</span>`);
  });
  updateDiceControls();
  render();
  if(hostWindow()){
    window.WildCardToolsReady=true;
    postToHost({type:'gm-tools-ready'});
    syncOpenDocuments().catch(()=>{});
  }
})();
