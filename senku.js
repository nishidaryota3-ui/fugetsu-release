// ========================================================
// 📝 選句（投句用に句をストックする機能）
//   ・句帳の完成句／下書きの句を「入選」でコピーしてためる（元の句はそのまま）
//   ・選句の中の句は元の句とは独立（修正・除外しても元に影響しない）
//   ・「選句を保存」で年月＋サブタイトル付きの記録にして、選句を空に戻す
// ========================================================
const STORAGE_KEY_SENKU = 'fugetsu_release_senku';

// items: 選句中の句 [{id, phrase, pos, ts, del}]（pos の昇順が表示順。縦書きなので先頭が右端）
// archives: 保存済みの選句 [{id, year, month, subtitle, phrases:[string], savedAt, ts, del}]
//   ts = 最後に変更した時刻、del = 削除済みの印（端末間で削除を正しく伝えるため、消さずに残す）
let senkuData = { items: [], archives: [] };
let activeSenkuItem = null;
let editingSenkuArchiveId = null;
let viewingSenkuArchiveId = null;

function newSenkuId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadSenkuData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_SENKU);
        if (!raw) return;
        const d = JSON.parse(raw);
        const base = d.updatedAt || Date.now();
        const rawItems = Array.isArray(d.items) ? d.items : (Array.isArray(d.current) ? d.current : []);
        senkuData.items = rawItems.map((x, i) => ({
            id: x.id || newSenkuId(),
            phrase: x.phrase || '',
            pos: typeof x.pos === 'number' ? x.pos : i,
            ts: x.ts || base,
            del: !!x.del
        }));
        senkuData.archives = (Array.isArray(d.archives) ? d.archives : []).map(a => ({
            id: a.id || newSenkuId(),
            year: a.year,
            month: a.month,
            subtitle: a.subtitle || '',
            phrases: Array.isArray(a.phrases) ? a.phrases : [],
            savedAt: a.savedAt || 0,
            ts: a.ts || a.savedAt || base,
            del: !!a.del
        }));
    } catch (e) {
        console.error('Failed to load senku:', e);
    }
}

function saveSenkuData() {
    try {
        localStorage.setItem(STORAGE_KEY_SENKU, JSON.stringify(senkuData));
    } catch (e) {
        console.error('Failed to save senku:', e);
    }
}

// 選句中の句（削除済みを除き、並び順に）
function senkuActiveItems() {
    return senkuData.items
        .filter(x => !x.del)
        .sort((a, b) => (a.pos - b.pos) || (a.id < b.id ? -1 : 1));
}

function senkuActiveArchives() {
    return senkuData.archives.filter(a => !a.del);
}

function isReadScreenActive() {
    const el = document.getElementById('readScreen');
    return !!(el && el.classList.contains('active'));
}

function refreshSenkuTabIfOpen() {
    if (currentReadTab === '選句' && isReadScreenActive()) renderYomuList(true);
}

// ========================================================
// 入選・除外・修正
// ========================================================
function addToSenku(phrase) {
    if (!phrase) return false;
    const active = senkuActiveItems();
    if (active.some(s => s.phrase === phrase)) {
        showToast('すでに入選しています');
        return false;
    }
    const item = {
        id: newSenkuId(),
        phrase: phrase,
        pos: active.length ? active[active.length - 1].pos + 1 : 0,
        ts: Date.now(),
        del: false
    };
    senkuData.items.push(item);
    saveSenkuData();
    pushSenkuRecords([item]);
    showToast(`入選しました（選句 ${active.length + 1}句）`);
    refreshSenkuTabIfOpen();
    return true;
}

// 完成句／下書きの詳細パネルの「入選」ボタン
function addSelectedHaikuToSenku() {
    if (!activeSelectedHaiku) return;
    closeHaikuDetailModal();
    addToSenku(activeSelectedHaiku.phrase);
}

// 選句の中の句をタップしたときのパネル
function onSenkuCardClicked(item) {
    activeSenkuItem = item;
    const modalPhraseEl = document.getElementById('modalPhrase');
    modalPhraseEl.innerHTML = renderPhraseRubyHtml(item.phrase);
    applyPhraseLengthClass(modalPhraseEl, item.phrase);
    document.getElementById('modalActions').innerHTML = `
        <span class="text-action-btn primary" onclick="openSenkuEditModal()">修正</span>
        <span class="action-divider">|</span>
        <span class="text-action-btn danger" onclick="removeActiveSenkuItem()">選句から除外</span>
    `;
    document.getElementById('haikuDetailModal').classList.remove('hidden');
}

function removeActiveSenkuItem() {
    if (!activeSenkuItem) return;
    closeHaikuDetailModal();
    const target = senkuData.items.find(s => s.id === activeSenkuItem.id);
    activeSenkuItem = null;
    if (target) {
        target.del = true;
        target.ts = Date.now();
        saveSenkuData();
        pushSenkuRecords([target]);
    }
    showToast('選句から除外しました');
    refreshSenkuTabIfOpen();
}

function openSenkuEditModal() {
    if (!activeSenkuItem) return;
    closeHaikuDetailModal();
    document.getElementById('senkuEditInput').value = activeSenkuItem.phrase;
    document.getElementById('senkuEditModal').classList.remove('hidden');
}

function closeSenkuEditModal() {
    document.getElementById('senkuEditModal').classList.add('hidden');
}

function submitSenkuEdit() {
    if (!activeSenkuItem) return;
    const text = document.getElementById('senkuEditInput').value.replace(/[\r\n]+/g, '').trim();
    if (!text) { alert('句を入力してください。'); return; }
    const target = senkuData.items.find(s => s.id === activeSenkuItem.id);
    if (target) {
        target.phrase = text;
        target.ts = Date.now();
        saveSenkuData();
        pushSenkuRecords([target]);
    }
    closeSenkuEditModal();
    activeSenkuItem = null;
    refreshSenkuTabIfOpen();
}

// ========================================================
// 選句タブの描画
// ========================================================
function renderSenkuTab(preserveScroll = false) {
    const scroll = document.getElementById('readHaikuList');
    const single = document.getElementById('readSingleContainer');
    const bar = document.getElementById('senkuBar');
    if (!scroll) return;
    if (single) single.classList.add('hidden');
    scroll.classList.remove('hidden');
    if (bar) bar.classList.remove('hidden');

    const activeItems = senkuActiveItems();
    const countEl = document.getElementById('senkuCount');
    if (countEl) countEl.textContent = `選句 ${activeItems.length}句`;

    const savedScrollLeft = preserveScroll ? scroll.scrollLeft : 0;
    scroll.innerHTML = '';

    if (activeItems.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'senku-empty';
        msg.textContent = '入選した句はまだありません。句を長押しして上へスワイプするか、句をタップして「入選」を選んでください。';
        scroll.appendChild(msg);
        return;
    }

    const orderIds = activeItems.map(s => s.id);
    activeItems.forEach((item, i) => {
        const card = document.createElement('div');
        card.className = 'saijiki-haiku-card senku-card';
        card.dataset.id = item.id;
        card.style.order = i;
        card.onclick = () => onSenkuCardClicked(item);

        const phraseDiv = document.createElement('div');
        phraseDiv.className = 'saijiki-phrase';
        phraseDiv.innerHTML = renderPhraseRubyHtml(item.phrase);
        applyPhraseLengthClass(phraseDiv, item.phrase);
        card.appendChild(phraseDiv);

        scroll.appendChild(card);
        attachSenkuReorderGesture(card, scroll, orderIds, activeItems.map(s => s.id));
    });

    requestAnimationFrame(() => { scroll.scrollLeft = savedScrollLeft; });
}

// ========================================================
// 長押しジェスチャー（タッチ・マウス共通）
//   長押し（約0.45秒、動かさない）で「つかんだ」状態になり、そのあと動かす
// ========================================================
function senkuLongPress(el, h) {
    const HOLD_MS = 450;
    const SLOP = 10;
    let timer = null, armed = false, active = false;
    let sx = 0, sy = 0, lx = 0, ly = 0, lastTouchEnd = 0;

    const pt = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
    const stopMouse = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    const finish = (cancelled) => {
        clearTimer();
        stopMouse();
        const wasArmed = armed;
        armed = false;
        active = false;
        if (wasArmed) {
            // 指を離したあとに続けて発生するクリックを無効にする
            el._senkuSuppress = true;
            setTimeout(() => { el._senkuSuppress = false; }, 400);
            if (h.onEnd) h.onEnd({ dx: lx - sx, dy: ly - sy, x: lx, y: ly, cancelled: cancelled });
        }
    };
    function onStart(e) {
        if (e.type === 'mousedown') {
            // タッチ操作のあとに発生するマウスの擬似イベントは無視する
            if (e.button !== 0 || Date.now() - lastTouchEnd < 700) return;
        }
        const p = pt(e);
        sx = lx = p.clientX;
        sy = ly = p.clientY;
        active = true;
        armed = false;
        clearTimer();
        timer = setTimeout(() => {
            if (!active) return;
            armed = true;
            try { if (navigator.vibrate) navigator.vibrate(15); } catch (_) {}
            if (h.onArm) h.onArm({ x: lx, y: ly });
        }, HOLD_MS);
        if (e.type === 'mousedown') {
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        }
    }
    function onMove(e) {
        if (!active) return;
        const p = pt(e);
        lx = p.clientX;
        ly = p.clientY;
        if (!armed) {
            // 長押しになる前に動いた → ふつうのスクロール／タップとして任せる
            if (Math.abs(lx - sx) > SLOP || Math.abs(ly - sy) > SLOP) {
                clearTimer();
                active = false;
                stopMouse();
            }
            return;
        }
        if (e.cancelable) e.preventDefault();
        if (h.onMove) h.onMove({ dx: lx - sx, dy: ly - sy, x: lx, y: ly });
    }
    function onUp() {
        if (!active) return;
        finish(false);
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', () => { lastTouchEnd = Date.now(); onUp(); });
    el.addEventListener('touchcancel', () => { lastTouchEnd = Date.now(); if (active) finish(true); });
    el.addEventListener('mousedown', onStart);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
        if (el._senkuSuppress) {
            e.stopImmediatePropagation();
            e.preventDefault();
            el._senkuSuppress = false;
        }
    }, true);
}

// 長押し → 上へスワイプで「入選」
function attachSenkuAddGesture(el, getPhrase) {
    const THRESH = 45;
    const reset = () => {
        el.classList.remove('senku-armed', 'senku-ready');
        el.style.transform = '';
    };
    senkuLongPress(el, {
        onArm() { el.classList.add('senku-armed'); },
        onMove({ dy }) {
            const up = Math.max(0, -dy);
            el.style.transform = `translateY(${-Math.min(up, 90)}px)`;
            el.classList.toggle('senku-ready', up >= THRESH);
        },
        onEnd({ dx, dy }) {
            // スマホのブラウザが途中で操作を取り消した（cancelled）場合でも、十分に上へ動いていれば入選にする
            const ok = -dy >= THRESH && Math.abs(dy) > Math.abs(dx);
            reset();
            if (ok) addToSenku(getPhrase());
        }
    });
}

// 選句の中で、長押し → 横にドラッグして並べ替え
function attachSenkuReorderGesture(card, container, orderIds, initialIds) {
    let dragging = false, pointerX = 0, lastSwapX = null, rafId = null;

    const applyOrder = () => {
        container.querySelectorAll('.senku-card').forEach(c => {
            c.style.order = orderIds.indexOf(c.dataset.id);
        });
    };
    const tick = () => {
        if (!dragging) return;
        const r = container.getBoundingClientRect();
        const EDGE = 50;
        if (pointerX < r.left + EDGE) container.scrollLeft -= 10;
        else if (pointerX > r.right - EDGE) container.scrollLeft += 10;
        rafId = requestAnimationFrame(tick);
    };

    senkuLongPress(card, {
        onArm({ x }) {
            dragging = true;
            pointerX = x;
            lastSwapX = null;
            card.classList.add('senku-dragging');
            container.style.scrollBehavior = 'auto';
            rafId = requestAnimationFrame(tick);
        },
        onMove({ x }) {
            pointerX = x;
            if (lastSwapX !== null && Math.abs(x - lastSwapX) < 20) return;
            const myId = card.dataset.id;
            const cards = [...container.querySelectorAll('.senku-card')];
            for (const other of cards) {
                if (other === card) continue;
                const r = other.getBoundingClientRect();
                if (x < r.left || x > r.right) continue;
                const from = orderIds.indexOf(myId);
                const to = orderIds.indexOf(other.dataset.id);
                const mid = (r.left + r.right) / 2;
                // 縦書きなので順番が後ろの句ほど左。相手の中心を越えたら入れ替える
                const crossed = to > from ? x <= mid : x >= mid;
                if (!crossed) break;
                orderIds.splice(from, 1);
                orderIds.splice(to, 0, myId);
                applyOrder();
                lastSwapX = x;
                break;
            }
        },
        onEnd() {
            dragging = false;
            if (rafId) cancelAnimationFrame(rafId);
            container.style.scrollBehavior = '';
            card.classList.remove('senku-dragging');
            if (orderIds.join() === initialIds.join()) return;
            // 並びが変わった句だけ、新しい位置番号と更新時刻をつけて同期する
            const byId = new Map(senkuData.items.map(s => [s.id, s]));
            const changed = [];
            orderIds.forEach((id, i) => {
                const it = byId.get(id);
                if (it && it.pos !== i) {
                    it.pos = i;
                    it.ts = Date.now();
                    changed.push(it);
                }
            });
            saveSenkuData();
            pushSenkuRecords(changed);
        }
    });
}

// ========================================================
// 選句の保存・過去の選句
// ========================================================
function senkuArchiveTitle(a) {
    return `${a.year}年${a.month}月${a.subtitle || ''}`;
}

function fillSenkuMonthOptions() {
    const sel = document.getElementById('senkuMonthSelect');
    if (!sel || sel.options.length) return;
    for (let m = 1; m <= 12; m++) {
        const opt = document.createElement('option');
        opt.value = String(m);
        opt.textContent = String(m);
        sel.appendChild(opt);
    }
}

function openSenkuSaveModal() {
    if (senkuActiveItems().length === 0) {
        alert('保存できる選句がありません。');
        return;
    }
    editingSenkuArchiveId = null;
    fillSenkuMonthOptions();
    const now = new Date();
    document.getElementById('senkuYearInput').value = now.getFullYear();
    document.getElementById('senkuMonthSelect').value = String(now.getMonth() + 1);
    document.getElementById('senkuSubtitleInput').value = '';
    document.getElementById('senkuSaveTitle').textContent = '選句を保存';
    document.getElementById('senkuSaveNote').textContent = `${senkuActiveItems().length}句を保存して、選句を空にします。`;
    document.getElementById('senkuSaveSubmit').textContent = '保存';
    document.getElementById('senkuSaveModal').classList.remove('hidden');
}

function openSenkuArchiveRename(id) {
    const a = senkuActiveArchives().find(x => x.id === id);
    if (!a) return;
    editingSenkuArchiveId = id;
    fillSenkuMonthOptions();
    document.getElementById('senkuYearInput').value = a.year;
    document.getElementById('senkuMonthSelect').value = String(a.month);
    document.getElementById('senkuSubtitleInput').value = a.subtitle || '';
    document.getElementById('senkuSaveTitle').textContent = '題名を変更';
    document.getElementById('senkuSaveNote').textContent = `${a.phrases.length}句`;
    document.getElementById('senkuSaveSubmit').textContent = '変更';
    document.getElementById('senkuSaveModal').classList.remove('hidden');
}

function closeSenkuSaveModal() {
    document.getElementById('senkuSaveModal').classList.add('hidden');
}

function submitSenkuSave() {
    const year = parseInt(document.getElementById('senkuYearInput').value, 10);
    const month = parseInt(document.getElementById('senkuMonthSelect').value, 10);
    const subtitle = document.getElementById('senkuSubtitleInput').value.trim();
    if (!year || year < 1900 || year > 2999) { alert('年を正しく入力してください。'); return; }

    if (editingSenkuArchiveId) {
        const a = senkuData.archives.find(x => x.id === editingSenkuArchiveId);
        if (a) {
            a.year = year;
            a.month = month;
            a.subtitle = subtitle;
            a.ts = Date.now();
            saveSenkuData();
            pushSenkuRecords([a]);
        }
        editingSenkuArchiveId = null;
        closeSenkuSaveModal();
        renderSenkuArchiveList();
        if (viewingSenkuArchiveId) openSenkuArchiveView(viewingSenkuArchiveId);
        showToast('題名を変更しました');
        return;
    }

    const active = senkuActiveItems();
    if (active.length === 0) { closeSenkuSaveModal(); return; }
    const now = Date.now();
    const archive = {
        id: newSenkuId(),
        year: year,
        month: month,
        subtitle: subtitle,
        phrases: active.map(s => s.phrase),
        savedAt: now,
        ts: now,
        del: false
    };
    senkuData.archives.push(archive);
    // 選句の中身は空にする（削除済みの印をつけて、他の端末にも空になったことを伝える）
    active.forEach(it => { it.del = true; it.ts = now; });
    const count = active.length;
    saveSenkuData();
    pushSenkuRecords([archive].concat(active));
    closeSenkuSaveModal();
    showToast(`${year}年${month}月${subtitle}の選句（${count}句）を保存しました`);
    refreshSenkuTabIfOpen();
}

function sortedSenkuArchives() {
    return senkuActiveArchives().sort((a, b) =>
        (b.year - a.year) || (b.month - a.month) || ((b.savedAt || 0) - (a.savedAt || 0)));
}

function renderSenkuArchiveList() {
    const listEl = document.getElementById('senkuArchiveList');
    if (!listEl) return;
    listEl.innerHTML = '';
    const archives = sortedSenkuArchives();
    if (archives.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'senku-archive-empty';
        empty.textContent = '保存した選句はまだありません。';
        listEl.appendChild(empty);
        return;
    }
    archives.forEach(a => {
        const row = document.createElement('div');
        row.className = 'senku-archive-row';
        row.onclick = () => openSenkuArchiveView(a.id);
        const title = document.createElement('span');
        title.className = 'senku-archive-title';
        title.textContent = senkuArchiveTitle(a);
        const cnt = document.createElement('span');
        cnt.className = 'senku-archive-count';
        cnt.textContent = `${a.phrases.length}句`;
        row.appendChild(title);
        row.appendChild(cnt);
        listEl.appendChild(row);
    });
}

function openSenkuArchiveList() {
    syncSenkuWithCloud({ announce: true });
    renderSenkuArchiveList();
    document.getElementById('senkuArchiveListModal').classList.remove('hidden');
}

function closeSenkuArchiveList() {
    document.getElementById('senkuArchiveListModal').classList.add('hidden');
}

function openSenkuArchiveView(id) {
    const a = senkuActiveArchives().find(x => x.id === id);
    if (!a) return;
    viewingSenkuArchiveId = id;
    document.getElementById('senkuViewTitle').textContent = senkuArchiveTitle(a);
    const listEl = document.getElementById('senkuViewList');
    listEl.innerHTML = '';
    a.phrases.forEach(phrase => {
        const card = document.createElement('div');
        card.className = 'saijiki-haiku-card';
        card.style.cursor = 'default';
        const p = document.createElement('div');
        p.className = 'saijiki-phrase';
        p.innerHTML = renderPhraseRubyHtml(phrase);
        applyPhraseLengthClass(p, phrase);
        card.appendChild(p);
        listEl.appendChild(card);
    });
    closeSenkuArchiveList();
    document.getElementById('senkuArchiveViewModal').classList.remove('hidden');
}

function closeSenkuArchiveView() {
    viewingSenkuArchiveId = null;
    document.getElementById('senkuArchiveViewModal').classList.add('hidden');
}

function backToSenkuArchiveList() {
    closeSenkuArchiveView();
    openSenkuArchiveList();
}

function renameViewingSenkuArchive() {
    if (viewingSenkuArchiveId) openSenkuArchiveRename(viewingSenkuArchiveId);
}

function deleteViewingSenkuArchive() {
    const a = senkuActiveArchives().find(x => x.id === viewingSenkuArchiveId);
    if (!a) return;
    if (!confirm(`「${senkuArchiveTitle(a)}」を削除しますか？\n（元に戻せません）`)) return;
    a.del = true;
    a.ts = Date.now();
    saveSenkuData();
    pushSenkuRecords([a]);
    closeSenkuArchiveView();
    openSenkuArchiveList();
    showToast('削除しました');
}

// ========================================================
// ☁️ 端末間の共有（Googleスプレッドシートの「選句」シート）
//   ・1件ごとに固有ID＋更新時刻をつけ、新しいほうを採用して統合する
//   ・通信は ?senku=... だけを使う。古いGoogleスクリプトのままでも、
//     選句の通信は俳句のシートに何も書き込まない（無視される）
// ========================================================
let senkuCloudSupported = null;   // null: 未確認 / true: 対応 / false: スクリプトが未更新
let _senkuSyncing = false;
let _senkuLastSyncAt = 0;
let _senkuWarned = false;

function senkuCloudAvailable() {
    const u = userSettings.cloudSyncUrl;
    return !!(u && u.startsWith('http') && u.includes('script.google.com'));
}

function senkuCloudUrl(params) {
    const base = userSettings.cloudSyncUrl;
    return base + (base.includes('?') ? '&' : '?') + params.toString();
}

function senkuToRecord(r) {
    if (Array.isArray(r.phrases)) {
        return { id: r.id, kind: 'archive', ts: r.ts, del: r.del ? 1 : 0,
            data: { year: r.year, month: r.month, subtitle: r.subtitle || '', phrases: r.phrases, savedAt: r.savedAt || 0 } };
    }
    return { id: r.id, kind: 'item', ts: r.ts, del: r.del ? 1 : 0, data: { phrase: r.phrase, pos: r.pos } };
}

// 変更した記録をクラウドへ送る（送りっぱなし。届かなかった分は次回の同期で再送される）
function pushSenkuRecords(records) {
    if (!records || !records.length) return;
    if (!senkuCloudAvailable() || senkuCloudSupported === false) return;
    const MAX_URL = 6500;
    let chunk = [];
    const send = () => {
        if (!chunk.length) return;
        const params = new URLSearchParams();
        params.append('senku', 'put');
        params.append('recs', JSON.stringify(chunk));
        try {
            fetch(senkuCloudUrl(params), { method: 'GET', mode: 'no-cors', keepalive: true })
                .catch(e => console.warn('Senku sync error:', e));
        } catch (e) {
            console.warn('Senku sync error:', e);
        }
        chunk = [];
    };
    records.forEach(r => {
        const rec = senkuToRecord(r);
        const tentative = chunk.concat([rec]);
        const probe = new URLSearchParams();
        probe.append('senku', 'put');
        probe.append('recs', JSON.stringify(tentative));
        if (chunk.length && senkuCloudUrl(probe).length > MAX_URL) send();
        chunk.push(rec);
    });
    send();
}

// クラウドの記録とこの端末の記録を統合する（新しいほうを採用）
// 戻り値: { changed: この端末の内容が変わったか, toPush: クラウドへ送り直す記録 }
function mergeSenkuFromCloud(rows) {
    const local = new Map();
    senkuData.items.forEach(x => local.set(x.id, x));
    senkuData.archives.forEach(x => local.set(x.id, x));
    const seen = new Set();
    const toPush = [];
    let changed = false;

    (rows || []).forEach(row => {
        const id = String(row[0] || '');
        const kind = String(row[1] || '');
        if (!id) return;
        const ts = Number(row[3]) || 0;
        const del = Number(row[4]) === 1 || row[4] === true;
        let data;
        try { data = JSON.parse(row[2]); } catch (e) { return; }
        if (!data) return;
        seen.add(id);

        const mine = local.get(id);
        if (mine && mine.ts > ts) { toPush.push(mine); return; }
        if (mine && mine.ts === ts) return;

        // クラウドのほうが新しい（または、この端末にまだ無い）
        if (kind === 'item') {
            const rec = { id: id, phrase: data.phrase || '', pos: Number(data.pos) || 0, ts: ts, del: del };
            if (mine) Object.assign(mine, rec); else senkuData.items.push(rec);
        } else if (kind === 'archive') {
            const rec = { id: id, year: data.year, month: data.month, subtitle: data.subtitle || '',
                phrases: Array.isArray(data.phrases) ? data.phrases : [], savedAt: data.savedAt || 0, ts: ts, del: del };
            if (mine) Object.assign(mine, rec); else senkuData.archives.push(rec);
        } else {
            return;
        }
        changed = true;
    });

    // クラウドにまだ無い記録は送る
    local.forEach((rec, id) => { if (!seen.has(id)) toPush.push(rec); });
    return { changed: changed, toPush: toPush };
}

async function syncSenkuWithCloud(opts) {
    const announce = !!(opts && opts.announce);
    if (!senkuCloudAvailable() || _senkuSyncing) return;
    if (Date.now() - _senkuLastSyncAt < 3000) return;
    _senkuSyncing = true;
    try {
        const params = new URLSearchParams();
        params.append('senku', 'list');
        const resp = await fetch(senkuCloudUrl(params), { method: 'GET', redirect: 'follow' });
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data || data.senku !== true) {
            // Googleスクリプトが選句に未対応（古いまま）
            senkuCloudSupported = false;
            if (announce && !_senkuWarned) {
                _senkuWarned = true;
                showToast('選句を他の端末と共有するには、Googleスクリプトの更新が必要です');
            }
            return;
        }
        senkuCloudSupported = true;
        const result = mergeSenkuFromCloud(data.rows);
        if (result.changed) {
            saveSenkuData();
            if (!document.querySelector('.senku-dragging')) {
                refreshSenkuTabIfOpen();
                const listModal = document.getElementById('senkuArchiveListModal');
                if (listModal && !listModal.classList.contains('hidden')) renderSenkuArchiveList();
            }
        }
        pushSenkuRecords(result.toPush);
    } catch (e) {
        console.warn('Senku cloud sync failed:', e);
    } finally {
        _senkuLastSyncAt = Date.now();
        _senkuSyncing = false;
    }
}

// ========================================================
// 初期化
// ========================================================
loadSenkuData();

// 起動時・オンライン復帰時・アプリに戻ってきたときに同期する
setTimeout(() => syncSenkuWithCloud(), 1800);
window.addEventListener('online', () => setTimeout(() => syncSenkuWithCloud(), 1000));
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncSenkuWithCloud();
});

// 「一句ずつ表示」モードの句にも、長押し→上スワイプの入選を付ける
(function initSenkuSingleModeGesture() {
    const el = document.querySelector('#readSingleContainer .haiku-screen');
    if (!el) return;
    attachSenkuAddGesture(el, () => {
        const cur = currentKuchoHaikus && currentKuchoHaikus[currentKuchoSingleIndex];
        return cur ? cur.phrase : '';
    });
})();
