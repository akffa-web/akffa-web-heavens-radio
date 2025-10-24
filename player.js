/* Heaven's Radio – player.js */
// Mounts into #hr-root and reads window.HR_CONFIG

(function(){
  const CFG = Object.assign({
    poolsUrl: "",
    introEvery: 6,
    podEvery: 12,
    skipsPerHour: 3
  }, (window.HR_CONFIG||{}));

  const root = document.getElementById('hr-root');
  if (!root) { console.error('[HR] Missing #hr-root'); return; }

  root.innerHTML = `
    <div class="hr-wrap">
      <div class="hr-player" id="hr-player">
        <div class="hr-titleCard" id="hr-titleCard">
          <div class="hr-onair" id="hr-onAir"><span class="hr-onair-dot"></span><span>ON AIR</span></div>
          <button class="hr-likeCorner hr-unliked" id="hr-likeBtn" title="Like">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.3l-5.4 3.3 1.6-6.1-4.7-3.9 6.2-.5L12 4l2.3 6.1 6.2.5-4.7 3.9 1.6 6.1z" stroke-width="2"/></svg>
          </button>
          <div class="hr-artist" id="hr-artistText">HEAVEN'S RADIO –</div>
          <div class="hr-track"  id="hr-trackText">Ready when you are</div>
          <div class="hr-stamp"  id="hr-stampText">0:00 • 0:00</div>
        </div>

        <div class="hr-cluster">
          <div style="display:flex; justify-content:flex-end;">
            <button class="hr-sq" id="hr-stopBtn" title="Stop">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"/></svg>
            </button>
          </div>

          <button class="hr-big" id="hr-playBtn" aria-label="Play">
            <div class="hr-ring" aria-hidden="true">
              <svg id="hr-ringSvg" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="hr-swirlGrad" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%"   stop-color="#6cf"/>
                    <stop offset="20%"  stop-color="#7fffd4"/>
                    <stop offset="40%"  stop-color="#f9f871"/>
                    <stop offset="60%"  stop-color="#ffa3e0"/>
                    <stop offset="80%"  stop-color="#9ad0ff"/>
                    <stop offset="100%" stop-color="#6cf"/>
                    <animateTransform attributeName="gradientTransform"
                                      type="rotate" from="0 60 60" to="360 60 60"
                                      dur="6s" repeatCount="indefinite"/>
                  </linearGradient>
                </defs>
                <circle class="hr-glassEdge" cx="60" cy="60" r="52"></circle>
                <circle class="hr-remain"    cx="60" cy="60" r="52" stroke-dasharray="327" stroke-dashoffset="0"></circle>
                <circle class="hr-elapsed"   cx="60" cy="60" r="52" stroke-dasharray="327" stroke-dashoffset="327"></circle>
              </svg>
              <div class="hr-marker" id="hr-ringMarker"></div>
            </div>
            <div class="hr-icon" id="hr-playIcon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </button>

          <div style="display:flex; justify-content:flex-start;">
            <button class="hr-sq" id="hr-nextBtn" title="Next">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6l7 6-7 6V6zm9 0h2v12h-2z"/></svg>
            </button>
          </div>
        </div>

        <div class="hr-notice" id="hr-skipNotice">YOU MAY ONLY SKIP THREE SONGS PER HOUR. PLEASE WAIT.</div>

        <audio id="hr-audio"></audio>
      </div>
    </div>
  `;

  /* DOM refs */
  const audio = id('hr-audio');
  const playBtn = id('hr-playBtn');
  const playIcon = id('hr-playIcon');
  const nextBtn = id('hr-nextBtn');
  const stopBtn = id('hr-stopBtn');
  const artistText = id('hr-artistText');
  const trackText  = id('hr-trackText');
  const stampText = id('hr-stampText');
  const notice = id('hr-skipNotice');
  const onAir = id('hr-onAir');
  const likeBtn = id('hr-likeBtn');
  const ringElapsed = qs('.hr-elapsed');
  const ringRemain  = qs('.hr-remain');
  const ringSvg = id('hr-ringSvg');
  const ringMarker = id('hr-ringMarker');

  /* State */
  let pools = {1:[],2:[],3:[]}, bags = {1:[],2:[],3:[]};
  let playCount = 0, current = null;
  let isPlaying = false, isPaused = false;
  const R = 52, CIRC = 2*Math.PI*R;
  ringElapsed.setAttribute('stroke-dasharray', CIRC);
  ringRemain.setAttribute('stroke-dasharray', CIRC);
  ringElapsed.setAttribute('stroke-dashoffset', CIRC);
  ringRemain.setAttribute('stroke-dashoffset', 0);

  /* Likes */
  let likes = loadLikes();
  function isLiked(t){ return !!likes[t?.url]; }
  function setLikeUI(liked){
    likeBtn.classList.toggle('hr-liked', liked);
    likeBtn.classList.toggle('hr-unliked', !liked);
  }
  likeBtn.addEventListener('click', () => {
    if (!current) return;
    const liked = !isLiked(current);
    if (liked) likes[current.url] = true; else delete likes[current.url];
    saveLikes(likes);
    setLikeUI(liked);
  });

  /* Utils */
  function id(s){ return document.getElementById(s); }
  function qs(s){ return root.querySelector(s); }
  function fmt(s){ return (!isFinite(s)||s<0) ? "0:00" : `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
  function splitTitle(full){
    const m = full?.split(' - ');
    if (m && m.length >= 2) return { artist: (m[0] + " –").toUpperCase(), track: m.slice(1).join(' - ') };
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
  function showNotice(){ notice.classList.add('hr-show'); setTimeout(()=>notice.classList.remove('hr-show'), 10000); }
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
    if (playing && !paused) {
      playIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    } else if (paused) {
      playIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    } else {
      playIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    }
  }
  function updateMarkerFraction(f){
    const w = ringSvg.getBoundingClientRect().width;
    const radiusPx = (w * (52/120));
    const angleDeg = -90 + f*360;
    ringMarker.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg) translate(${radiusPx}px)`;
  }

  async function loadAndPlay(item){
    current=item; audio.src=item.url;
    const parts = splitTitle(item.title);
    artistText.textContent = parts.artist || '';
    trackText.textContent  = parts.track  || item.title || "Heaven's Radio";
    setDocTitle(item.title);
    onAir.style.display = (item.pool===3) ? 'inline-flex' : 'none';
    setLikeUI(isLiked(item));

    ringElapsed.setAttribute('stroke-dashoffset', CIRC);
    stampText.textContent='0:00 • 0:00';
    updateMarkerFraction(0);

    setPlayVisual(true,false);
    try{ await audio.play(); isPlaying=true; isPaused=false; }catch{ setPlayVisual(false,false); }
  }

  /* Events */
  playBtn.addEventListener('click', async () => {
    if (!current) {
      const p=choosePool(); const n=pickFromBag(p); if (!n) return;
      playCount++; await loadAndPlay(n); return;
    }
    if (isPlaying && !audio.paused) { audio.pause(); isPlaying=false; isPaused=true; setPlayVisual(false,true); }
    else { try{ await audio.play(); isPlaying=true; isPaused=false; setPlayVisual(true,false); }catch{} }
  });

  stopBtn.addEventListener('click', () => {
    if (!current) return;
    audio.pause(); audio.currentTime=0; isPlaying=false; isPaused=false; setPlayVisual(false,false);
    ringElapsed.setAttribute('stroke-dashoffset', CIRC);
    updateMarkerFraction(0);
    stampText.textContent=`0:00 • ${fmt(audio.duration||0)}`;
  });

  nextBtn.addEventListener('click', async () => {
    if (!canSkip()) { showNotice(); return; }
    const p=choosePool(), n=pickFromBag(p); if (!n) { showNotice(); return; }
    playCount++; await loadAndPlay(n);
  });

  audio.addEventListener('ended', async () => {
    const p=choosePool(), n=pickFromBag(p); if (!n){ setPlayVisual(false,false); return; }
    playCount++; await loadAndPlay(n);
  });

  audio.addEventListener('timeupdate', () => {
    const d=audio.duration||0, c=audio.currentTime||0, f=d?c/d:0;
    ringElapsed.setAttribute('stroke-dashoffset', (1-f)*CIRC);
    updateMarkerFraction(f);
    stampText.textContent = `${fmt(c)} • ${fmt(d)}`;
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

  /* Storage helpers */
  function loadLikes(){ try{ return JSON.parse(localStorage.getItem('hr_likes')||'{}'); }catch{ return {}; } }
  function saveLikes(map){ localStorage.setItem('hr_likes', JSON.stringify(map)); }
})();
