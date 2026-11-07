// ========================================================
// 📝 選句（投句用に句をストックする機能）
//   ・句帳の完成句／下書きの句を「入選」でコピーしてためる（元の句はそのまま）
//   ・選句の中の句は元の句とは独立（修正・除外しても元に影響しない）
//   ・「選句を保存」で年月＋サブタイトル付きの記録にして、選句を空に戻す
// ========================================================
const STORAGE_KEY_SENKU = 'fugetsu_release_senku';

// current: 選句中の句 [{id, phrase}]（配列の順番＝表示順。縦書きなので先頭が右端）
// archives: 保存済みの選句 [{id, year, month, subtitle, phrases:[string], savedAt}]
let senkuData = { current: [], archives: [], updatedAt: 0 };
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
        senkuData = {
            current: Array.isArray(d.current) ? d.current : [],
            archives: Array.isArray(d.archives) ? d.archives : [],
            updatedAt: d.updatedAt || 0
        };
    } catch (e) {
        console.error('Failed to load senku:', e);
    }
}

function saveSenkuData() {
    senkuData.updatedAt = Date.now();
    try {
        localStorage.setItem(STORAGE_KEY_SENKU, JSON.stringify(senkuData));
    } catch (e) {
        console.error('Failed to save senku:', e);
    }
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
    if (senkuData.current.some(s => s.phrase === phrase)) {
        showToast('すでに入選しています');
        return false;
    }
    senkuData.current.push({ id: newSenkuId(), phrase: phrase });
    saveSenkuData();
    showToast(`入選しました（選句 ${senkuData.current.length}句）`);
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
    senkuData.current = senkuData.current.filter(s => s.id !== activeSenkuItem.id);
    activeSenkuItem = null;
    saveSenkuData();
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
    const target = senkuData.current.find(s => s.id === activeSenkuItem.id);
    if (target) {
        target.phrase = text;
        saveSenkuData();
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

    const countEl = document.getElementById('senkuCount');
    if (countEl) countEl.textContent = `選句 ${senkuData.current.length}句`;

    const savedScrollLeft = preserveScroll ? scroll.scrollLeft : 0;
    scroll.innerHTML = '';

    if (senkuData.current.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'senku-empty';
        msg.textContent = '入選した句はまだありません。句を長押しして上へスワイプするか、句をタップして「入選」を選んでください。';
        scroll.appendChild(msg);
        return;
    }

    const orderIds = senkuData.current.map(s => s.id);
    senkuData.current.forEach((item, i) => {
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
        attachSenkuReorderGesture(card, scroll, orderIds);
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
    const THRESH = 60;
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
        onEnd({ dx, dy, cancelled }) {
            const ok = !cancelled && -dy >= THRESH && Math.abs(dy) > Math.abs(dx);
            reset();
            if (ok) addToSenku(getPhrase());
        }
    });
}

// 選句の中で、長押し → 横にドラッグして並べ替え
function attachSenkuReorderGesture(card, container, orderIds) {
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
            const byId = new Map(senkuData.current.map(s => [s.id, s]));
            senkuData.current = orderIds.map(id => byId.get(id)).filter(Boolean);
            saveSenkuData();
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
    if (senkuData.current.length === 0) {
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
    document.getElementById('senkuSaveNote').textContent = `${senkuData.current.length}句を保存して、選句を空にします。`;
    document.getElementById('senkuSaveSubmit').textContent = '保存';
    document.getElementById('senkuSaveModal').classList.remove('hidden');
}

function openSenkuArchiveRename(id) {
    const a = senkuData.archives.find(x => x.id === id);
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
            saveSenkuData();
        }
        editingSenkuArchiveId = null;
        closeSenkuSaveModal();
        renderSenkuArchiveList();
        if (viewingSenkuArchiveId) openSenkuArchiveView(viewingSenkuArchiveId);
        showToast('題名を変更しました');
        return;
    }

    if (senkuData.current.length === 0) { closeSenkuSaveModal(); return; }
    senkuData.archives.push({
        id: newSenkuId(),
        year: year,
        month: month,
        subtitle: subtitle,
        phrases: senkuData.current.map(s => s.phrase),
        savedAt: Date.now()
    });
    const count = senkuData.current.length;
    senkuData.current = [];
    saveSenkuData();
    closeSenkuSaveModal();
    showToast(`${year}年${month}月${subtitle}の選句（${count}句）を保存しました`);
    refreshSenkuTabIfOpen();
}

function sortedSenkuArchives() {
    return senkuData.archives.slice().sort((a, b) =>
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
    renderSenkuArchiveList();
    document.getElementById('senkuArchiveListModal').classList.remove('hidden');
}

function closeSenkuArchiveList() {
    document.getElementById('senkuArchiveListModal').classList.add('hidden');
}

function openSenkuArchiveView(id) {
    const a = senkuData.archives.find(x => x.id === id);
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
    const a = senkuData.archives.find(x => x.id === viewingSenkuArchiveId);
    if (!a) return;
    if (!confirm(`「${senkuArchiveTitle(a)}」を削除しますか？\n（元に戻せません）`)) return;
    senkuData.archives = senkuData.archives.filter(x => x.id !== a.id);
    saveSenkuData();
    closeSenkuArchiveView();
    openSenkuArchiveList();
    showToast('削除しました');
}

// ========================================================
// 初期化
// ========================================================
loadSenkuData();

// 「一句ずつ表示」モードの句にも、長押し→上スワイプの入選を付ける
(function initSenkuSingleModeGesture() {
    const el = document.querySelector('#readSingleContainer .haiku-screen');
    if (!el) return;
    attachSenkuAddGesture(el, () => {
        const cur = currentKuchoHaikus && currentKuchoHaikus[currentKuchoSingleIndex];
        return cur ? cur.phrase : '';
    });
})();
