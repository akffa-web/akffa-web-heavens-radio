/* Heaven's Radio • Player Logic (bind-to-DOM mode) */
(function(){
  const CFG = Object.assign({
    poolsUrl: "",
    introEvery: 6,
    podEvery: 12,
    skipsPerHour: 3
  }, (window.HR_CONFIG||{}));

  // Grab existing elements created in index.html
  const audio      = byId('hr-audio');
  const playBtn    = byId('hr-playBtn');
  const playIcon   = byId('hr-playIcon');
  const nextBtn    = byId('hr-nextBtn');
  const stopBtn    = byId('hr-stopBtn');
  const artistText = byId('hr-artistText');
  const trackText  = byId('hr-trackText');
  const stampText  = byId('hr-stampText');
  const notice     = byId('hr-skipNotice');
  const onAir      = byId('hr-onAir');
  const likeBtn    = byId('hr-likeBtn');

  const ringElapsed = q('.hr-elapsed');
  const ringRemain  = q('.hr-remain');
  const ringSvg     = byId('hr-ringSvg');
  const ringMarker  = byId('hr-ringMarker');

  // 10px timeline elements
  const tl      = byId('hr-timeline');
  const tlFill  = byId('hr-tl-fill');
  const tlThumb = byId('hr-tl-thumb');

  if (!audio || !playBtn) {
    console.error('[HR] Missing required DOM elements. Check index.html IDs.');
    return;
  }

  /* State */
  let pools = {1:[],2:[],3:[]}, bags = {1:[],2:[],3:[]};
  let playCount = 0, current = null;
  let isPlaying = false, isPaused = false;
  const R = 52, CIRC = 2*Math.PI*R;
  ringElapsed?.setAttribute('stroke-dasharray', CIRC);
  ringRemain?.setAttribute('stroke-dasharray', CIRC);
  ringElapsed?.setAttribute('stroke-dashoffset', CIRC);
  ringRemain?.setAttribute('stroke-dashoffset', 0);

  /* Likes */
  let likes = loadLikes();
  function isLiked(t){ return !!likes[t?.url]; }
  function setLikeUI(liked){
    likeBtn?.classList.toggle('hr-liked', liked);
    likeBtn?.classList.toggle('hr-unliked', !liked);
  }
  likeBtn?.addEventListener('click', () => {
    if (!current) return;
    const liked = !isLiked(current);
    if (liked) likes[current.url] = true; else delete likes[current.url];
    saveLikes(likes);
    setLikeUI(liked);
  });

  /* Helpers */
  function byId(id){ return document.getElementById(id); }
  function q(sel){ return document.querySelector(sel); }
  function fmt(s){ return (!isFinite(s)||s<0) ? "0:00" : `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }

  function splitTitle(full){
    const at = (full||"").split(' - ');
    if (at.length >= 2){
      return { artist: at[0].toUpperCase(), track: at.slice(1).join(' - ') };
    }
    return { artist: '', track: full||"Heaven's Radio" };
  }

  function parsePools(txt){
    const out={1:[],2:[],3:[]}; let cur=null;
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;
      const L=line.toLowerCase();
      if (L.startsWith('pool #1')){cur=1;continue;}
      if (L.startsWith('pool #2')){cur=2;continue;}
      if (L.startsWith('pool #3')){cur=3;continue;}
      if (!cur) continue;
      const [url,disp='']=line.split('#');
      const title=(disp.trim() || url.trim().split('/').pop().replace(/\.(mp3|wav|m4a)$/i,''));
      out[cur].push({ url:url.trim(), title, pool:cur });
    }
    return out;
  }

  function setDocTitle(t){ document.title = t ? `${t} — Heaven's Radio` : "Heaven's Radio"; }
  function showNotice(){ notice?.classList.add('hr-show'); setTimeout(()=>notice?.classList.remove('hr-show'), 10000); }

  function canSkip(){
    const k='hr_skip_times', now=Date.now(), hourAgo=now-3600_000;
    let arr=[]; try{arr=JSON.parse(localStorage.getItem(k)||'[]')}catch{}
    arr = arr.filter(t=>t>hourAgo);
    if (arr.length >= (CFG.skipsPerHour||3)) return false;
    arr.push(now); localStorage.setItem(k, JSON.stringify(arr)); return true;
  }

  function pickFromBag(p){
    if (!bags[p].length) {
      bags[p] = pools[p].slice().sort(()=>Math.random()-0.5);
      const likedOnes = bags[p].filter(t => isLiked(t));
      bags[p].push(...likedOnes);
      bags[p] = bags[p].sort(()=>Math.random()-0.5);
    }
    return bags[p].shift();
  }

  function choosePool(){
    const nextIndex = playCount + 1;
    const dueIntro = (nextIndex % (CFG.introEvery||6) === 0);
    const duePod   = (nextIndex % (CFG.podEvery||12) === 0);
    if (duePod && pools[3].length) return 3;
    if (dueIntro && pools[1].length) return 1;
    return 2;
  }

  function setPlayVisual(playing, paused){
    playBtn.classList.toggle('hr-paused', !!paused);
    if (playing && !paused) {
      playIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    } else if (paused) {
      playIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    } else {
      playIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    }
  }

  function updateMarkerFraction(f){
    if (!ringSvg) return;
    const w = ringSvg.getBoundingClientRect().width;
    const radiusPx = (w * (52/120));
    const angleDeg = -90 + f*360;
    ringMarker.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg) translate(${radiusPx}px)`;
  }

  function updateTimeline(cur, dur){
    if (!tlFill || !tlThumb) return;
    const pct = dur ? (cur/dur)*100 : 0;
    tlFill.style.width = pct + '%';
    tlThumb.style.left = pct + '%';
  }

  async function loadAndPlay(item){
    current=item; audio.src=item.url;
    const parts = splitTitle(item.title);
    if (artistText) artistText.textContent = parts.artist || '';
    if (trackText)  trackText.textContent  = parts.track  || item.title || "Heaven's Radio";
    setDocTitle(item.title);

    const onAirNow = (item.pool===3);
    if (onAir) onAir.style.display = onAirNow ? 'inline-flex' : 'none';
    setLikeUI(isLiked(item));

    ringElapsed?.setAttribute('stroke-dashoffset', CIRC);
    if (stampText) stampText.textContent='0:00 • 0:00';
    updateMarkerFraction(0);
    updateTimeline(0, audio.duration||0);

    // Optional: burst stars when ON AIR starts (if you implemented stars)
    // shootingStarBurst && onAirNow && shootingStarBurst(10);

    setPlayVisual(true,false);
    try{ await audio.play(); isPlaying=true; isPaused=false; }catch{ setPlayVisual(false,false); }
  }

  /* Events */
  playBtn.addEventListener('click', async () => {
    if (!current) {
      const p=choosePool(); const n=pickFromBag(p); if (!n) return;
      playCount++; await loadAndPlay(n); return;
    }
    if (isPlaying && !audio.paused) {
      audio.pause(); isPlaying=false; isPaused=true; setPlayVisual(false,true);
    } else {
      try{ await audio.play(); isPlaying=true; isPaused=false; setPlayVisual(true,false); }catch{}
    }
  });

  stopBtn?.addEventListener('click', () => {
    if (!current) return;
    audio.pause(); audio.currentTime=0; isPlaying=false; isPaused=false; setPlayVisual(false,false);
    ringElapsed?.setAttribute('stroke-dashoffset', CIRC);
    updateMarkerFraction(0);
    updateTimeline(0, audio.duration||0);
    if (stampText) stampText.textContent=`0:00 • ${fmt(audio.duration||0)}`;
  });

  nextBtn?.addEventListener('click', async () => {
    if (!canSkip()) { showNotice(); return; }
    const p=choosePool(), n=pickFromBag(p); if (!n) { showNotice(); return; }
    playCount++; await loadAndPlay(n);
  });

  audio.addEventListener('ended', async () => {
    const p=choosePool(), n=pickFromBag(p); if (!n){ setPlayVisual(false,false); return; }
    playCount++; await loadAndPlay(n);
  });

  audio.addEventListener('loadedmetadata', ()=>{
    if (stampText) stampText.textContent = `0:00 • ${fmt(audio.duration||0)}`;
    updateTimeline(0, audio.duration||0);
  });

  audio.addEventListener('timeupdate', () => {
    const d=audio.duration||0, c=audio.currentTime||0, f=d?c/d:0;
    ringElapsed?.setAttribute('stroke-dashoffset', (1-f)*CIRC);
    updateMarkerFraction(f);
    updateTimeline(c, d);
    if (stampText) stampText.textContent = `${fmt(c)} • ${fmt(d)}`;
  });

  /* Init */
  (async function init(){
    setPlayVisual(false,false);
    let text='';
    try{
      if (!CFG.poolsUrl) throw 0;
      const r = await fetch(CFG.poolsUrl, {mode:'cors', cache:'no-store'});
      if(!r.ok) throw 0;
      text = await r.text();
    }catch{
      text = `Pool #1: Radio Blurbs

Pool #2: Pulse List

Pool #3: Link Airtime`;
    }
    pools = parsePools(text);
    bags = {
      1: pools[1].slice().sort(()=>Math.random()-0.5),
      2: pools[2].slice().sort(()=>Math.random()-0.5),
      3: pools[3].slice().sort(()=>Math.random()-0.5)
    };
  })();

  /* Storage */
  function loadLikes(){ try{ return JSON.parse(localStorage.getItem('hr_likes')||'{}'); }catch{ return {}; } }
  function saveLikes(map){ localStorage.setItem('hr_likes', JSON.stringify(map)); }
})();
