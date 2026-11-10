// ========================================================
// 📝 選句（投句用に句をストックする機能）
//   ・句帳の完成句／下書きの句を「入選」でコピーしてためる（元の句はそのまま）
//   ・選句の中の句は元の句とは独立（修正・除外しても元に影響しない）
//   ・「選句を保存」で年月＋サブタイトル付きの記録にして、選句を空に戻す
// ========================================================
const STORAGE_KEY_SENKU = 'fugetsu_release_senku';

// items: 選句中の句 [{id, phrase, pos, lv, ts, del}]（pos の昇順が表示順。縦書きなので先頭が右端）
// archives: 保存済みの選句 [{id, year, month, subtitle, phrases:[string], savedAt, ts, del}]
//   ts = 最後に変更した時刻、del = 削除済みの印（端末間で削除を正しく伝えるため、消さずに残す）
let senkuData = { items: [], archives: [] };
// 選考の段階：lv が 2 以上なら一次を、3 以上なら二次を…通過した句（最終は lv=4）
const SENKU_STAGES = ['一次', '二次', '三次', '最終'];
let currentSenkuStage = 1;   // いま開いている段階タブ（1〜4）。その段階以上の句が見える
let activeSenkuItem = null;
let editingSenkuArchiveId = null;
let viewingSenkuArchiveId = null;

// 同じ瞬間に何百件も作っても番号がかぶらないよう、連番と長めの乱数を混ぜる
let _senkuIdSeq = 0;
function newSenkuId() {
    _senkuIdSeq = (_senkuIdSeq + 1) % 46656;
    return 's' + Date.now().toString(36) + _senkuIdSeq.toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 7);
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
            lv: Math.min(4, Math.max(1, Number(x.lv) || 1)),
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

// 指定した段階以上の句（段階タブに表示される句）
function senkuStageItems(stage) {
    return senkuActiveItems().filter(x => x.lv >= stage);
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
        lv: 1,
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
    const stage = currentSenkuStage;
    const parts = [`<span class="text-action-btn primary" onclick="openSenkuEditModal()">修正</span>`];
    if (stage < 4 && item.lv === stage) parts.push(`<span class="text-action-btn" onclick="moveActiveSenkuStage('up')">${SENKU_STAGES[stage]}へ進める</span>`);
    if (item.lv > stage) parts.push(`<span class="text-action-btn" onclick="moveActiveSenkuStage('down')">通過を取り消す</span>`);
    else if (stage > 1) parts.push(`<span class="text-action-btn" onclick="moveActiveSenkuStage('down')">${SENKU_STAGES[stage - 2]}に戻す</span>`);
    parts.push(`<span class="text-action-btn danger" onclick="removeActiveSenkuItem()">選句から除外</span>`);
    document.getElementById('modalActions').innerHTML = parts.join('<span class="action-divider">|</span>');
    document.getElementById('haikuDetailModal').classList.remove('hidden');
}

function moveActiveSenkuStage(dir) {
    if (!activeSenkuItem) return;
    closeHaikuDetailModal();
    moveSenkuStage(activeSenkuItem, dir);
    activeSenkuItem = null;
}

// 段階を動かす（up: いまの選考を通過 / down: 通過の取り消し、または1つ前の段階へ戻す）
function moveSenkuStage(item, dir) {
    const stage = currentSenkuStage;
    let newLv = item.lv;
    let msg = '';
    if (dir === 'up') {
        if (stage >= 4) { showToast('最終がいちばん上の段階です'); return; }
        if (item.lv > stage) { showToast(`すでに${SENKU_STAGES[stage - 1]}を通過しています`); return; }
        newLv = stage + 1;
        msg = `${SENKU_STAGES[stage]}へ進めました`;
    } else {
        if (item.lv > stage) {
            newLv = stage;
            msg = `${SENKU_STAGES[stage - 1]}の通過を取り消しました`;
        } else if (stage > 1) {
            newLv = stage - 1;
            msg = `${SENKU_STAGES[stage - 2]}に戻しました`;
        } else {
            showToast('一次より前はありません（外すときは句をタップして「選句から除外」）');
            return;
        }
    }
    item.lv = newLv;
    item.ts = Date.now();
    saveSenkuData();
    pushSenkuRecords([item]);
    showToast(msg);
    refreshSenkuTabIfOpen();
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
function setSenkuStage(stage) {
    currentSenkuStage = stage;
    renderYomuList(false);
}

function updateSenkuStageBar() {
    const bar = document.getElementById('senkuBar');
    if (!bar) return;
    bar.innerHTML = '';
    SENKU_STAGES.forEach((name, i) => {
        const stage = i + 1;
        const el = document.createElement('span');
        el.className = 'senku-stage' + (stage === currentSenkuStage ? ' active' : '');
        el.appendChild(document.createTextNode(name));
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = String(senkuStageItems(stage).length);
        el.appendChild(n);
        el.onclick = () => setSenkuStage(stage);
        bar.appendChild(el);
    });
}

function renderSenkuTab(preserveScroll = false) {
    const scroll = document.getElementById('readHaikuList');
    const single = document.getElementById('readSingleContainer');
    const bar = document.getElementById('senkuBar');
    const actions = document.getElementById('senkuActions');
    if (!scroll) return;
    if (single) single.classList.add('hidden');
    scroll.classList.remove('hidden');
    if (bar) bar.classList.remove('hidden');
    if (actions) actions.classList.remove('hidden');
    document.getElementById('readScreen').classList.add('senku-mode');
    updateSenkuStageBar();

    const stage = currentSenkuStage;
    const items = senkuStageItems(stage);
    const savedScrollLeft = preserveScroll ? scroll.scrollLeft : 0;
    scroll.innerHTML = '';

    if (items.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'senku-empty';
        msg.textContent = stage === 1
            ? '入選した句はまだありません。句を長押しして上へスワイプするか、句をタップして「入選」を選んでください。'
            : `${SENKU_STAGES[stage - 1]}に進んだ句はまだありません。${SENKU_STAGES[stage - 2]}で句を長押しして上へスワイプすると、ここに進みます。`;
        scroll.appendChild(msg);
        return;
    }

    const orderIds = items.map(s => s.id);
    const initialIds = orderIds.slice();
    items.forEach((item, i) => {
        const card = document.createElement('div');
        card.className = 'saijiki-haiku-card senku-card' + (item.lv > stage ? ' senku-passed' : '');
        card.dataset.id = item.id;
        card.style.order = i;
        card.onclick = () => onSenkuCardClicked(item);

        const phraseDiv = document.createElement('div');
        phraseDiv.className = 'saijiki-phrase';
        phraseDiv.innerHTML = renderPhraseRubyHtml(item.phrase);
        applyPhraseLengthClass(phraseDiv, item.phrase);
        card.appendChild(phraseDiv);

        scroll.appendChild(card);
        attachSenkuCardGestures(card, scroll, orderIds, initialIds, item);
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

// 選句の中の句：長押し → 横へドラッグで並べ替え ／ 上へスワイプで次の段階へ ／ 下へスワイプで戻す
function attachSenkuCardGestures(card, container, orderIds, initialIds, item) {
    const THRESH = 45;
    let dragging = false, mode = null, pointerX = 0, lastSwapX = null, rafId = null;

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
    const resetLook = () => {
        card.classList.remove('senku-dragging', 'senku-armed', 'senku-ready');
        card.style.transform = '';
    };

    senkuLongPress(card, {
        onArm({ x }) {
            dragging = true;
            mode = null;
            pointerX = x;
            lastSwapX = null;
            card.classList.add('senku-armed');
            container.style.scrollBehavior = 'auto';
            rafId = requestAnimationFrame(tick);
        },
        onMove({ dx, dy, x }) {
            pointerX = x;
            // 動かし始めの向きで「並べ替え（横）」か「段階の移動（縦）」かを決める
            if (!mode && (Math.abs(dx) > 14 || Math.abs(dy) > 14)) {
                mode = Math.abs(dy) > Math.abs(dx) ? 'stage' : 'reorder';
                if (mode === 'reorder') card.classList.add('senku-dragging');
            }
            if (mode === 'stage') {
                card.style.transform = `translateY(${Math.max(-90, Math.min(90, dy))}px)`;
                card.classList.toggle('senku-ready', Math.abs(dy) >= THRESH);
                return;
            }
            if (mode !== 'reorder') return;
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
        onEnd({ dx, dy }) {
            dragging = false;
            if (rafId) cancelAnimationFrame(rafId);
            container.style.scrollBehavior = '';
            const finalMode = mode;
            mode = null;
            resetLook();

            if (finalMode === 'stage') {
                if (Math.abs(dy) >= THRESH && Math.abs(dy) > Math.abs(dx)) {
                    moveSenkuStage(item, dy < 0 ? 'up' : 'down');
                }
                return;
            }
            if (finalMode !== 'reorder' || orderIds.join() === initialIds.join()) return;

            // 見えている句どうしで、元の位置番号を入れ替える（見えていない句の位置は動かさない）
            const byId = new Map(senkuData.items.map(s => [s.id, s]));
            const slots = initialIds.map(id => byId.get(id).pos).sort((a, b) => a - b);
            const changed = [];
            orderIds.forEach((id, i) => {
                const it = byId.get(id);
                if (it && it.pos !== slots[i]) {
                    it.pos = slots[i];
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
// 選句を空にする（いま開いている段階）
//   一次: 選句の句をすべて外す
//   二次以降: その段階の句を、ひとつ前の段階に戻す
// ========================================================
function clearSenkuStage() {
    const stage = currentSenkuStage;
    const items = senkuStageItems(stage);
    if (items.length === 0) { showToast('このタブに句はありません'); return; }
    const name = SENKU_STAGES[stage - 1];
    const msg = stage === 1
        ? `選句の${items.length}句をすべて外します。\nよろしいですか？\n（先に「選句を保存」しておくと、あとで戻せます）`
        : `${name}の${items.length}句を、${SENKU_STAGES[stage - 2]}に戻します。\nよろしいですか？`;
    if (!confirm(msg)) return;
    const now = Date.now();
    items.forEach(it => {
        if (stage === 1) it.del = true; else it.lv = stage - 1;
        it.ts = now;
    });
    saveSenkuData();
    pushSenkuRecords(items);
    showToast(stage === 1 ? '選句を空にしました' : `${name}を空にしました（${SENKU_STAGES[stage - 2]}に戻しました）`);
    refreshSenkuTabIfOpen();
}

// ========================================================
// 選句の保存・過去の選句
// ========================================================
const SENKU_MAX_SAVE = 30;   // 1回に保存できる句数（同期の通信量の上限のため）

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
    const items = senkuStageItems(currentSenkuStage);
    if (items.length === 0) {
        alert('このタブに、保存できる句がありません。');
        return;
    }
    if (items.length > SENKU_MAX_SAVE) {
        alert(`一度に保存できるのは${SENKU_MAX_SAVE}句までです。\n二次以降のタブで句を絞ってから保存してください。`);
        return;
    }
    editingSenkuArchiveId = null;
    fillSenkuMonthOptions();
    const now = new Date();
    document.getElementById('senkuYearInput').value = now.getFullYear();
    document.getElementById('senkuMonthSelect').value = String(now.getMonth() + 1);
    document.getElementById('senkuSubtitleInput').value = '';
    document.getElementById('senkuSaveTitle').textContent = '選句を保存';
    document.getElementById('senkuSaveNote').textContent =
        `「${SENKU_STAGES[currentSenkuStage - 1]}」の${items.length}句を保存します。保存した句は選句から外れます。`;
    document.getElementById('senkuClearRest').checked = false;
    document.getElementById('senkuClearRestRow').classList.remove('hidden');
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
    document.getElementById('senkuClearRestRow').classList.add('hidden');
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

    const active = senkuStageItems(currentSenkuStage);
    if (active.length === 0) { closeSenkuSaveModal(); return; }
    const now = Date.now();
    const archive = {
        id: newSenkuId(),
        year: year,
        month: month,
        subtitle: subtitle,
        phrases: active.map(s => s.phrase),
        lvs: active.map(s => s.lv),   // 保存したときの段階（選句に戻すときに再現する）
        savedAt: now,
        ts: now,
        del: false
    };
    senkuData.archives.push(archive);
    // 保存した句は選句から外す（削除済みの印をつけて、他の端末にも伝える）。
    // 「残りの句も外す」を選んだときは、選句を空にする
    const clearRest = document.getElementById('senkuClearRest').checked;
    const removed = clearRest ? senkuActiveItems() : active;
    removed.forEach(it => { it.del = true; it.ts = now; });
    const count = active.length;
    saveSenkuData();
    pushSenkuRecords([archive].concat(removed));
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
    // 長い句がモーダルの高さに収まるよう、はみ出す句だけ文字を小さくする
    requestAnimationFrame(() => fitSenkuPhrasesToHeight(listEl));
}

function fitSenkuPhrasesToHeight(listEl) {
    const limit = listEl.clientHeight * 0.94;
    if (!limit) return;
    listEl.querySelectorAll('.saijiki-phrase').forEach(p => {
        let size = parseFloat(getComputedStyle(p).fontSize);
        let guard = 30;
        while (p.getBoundingClientRect().height > limit && size > 11 && guard-- > 0) {
            size -= 1;
            p.style.setProperty('font-size', size + 'px', 'important');
        }
    });
}

function closeSenkuArchiveView() {
    viewingSenkuArchiveId = null;
    document.getElementById('senkuArchiveViewModal').classList.add('hidden');
}

function backToSenkuArchiveList() {
    closeSenkuArchiveView();
    openSenkuArchiveList();
}

// ========================================================
// 過去の選句を、いまの選句に戻す
// ========================================================
function openSenkuRestore() {
    const a = senkuActiveArchives().find(x => x.id === viewingSenkuArchiveId);
    if (!a || !a.phrases.length) return;
    const cur = senkuActiveItems().length;
    if (cur === 0) { restoreSenkuArchive('add'); return; }
    document.getElementById('senkuRestoreNote').textContent =
        `「${senkuArchiveTitle(a)}」の${a.phrases.length}句を選句に戻します。いまの選句は${cur}句あります。`;
    document.getElementById('senkuRestoreModal').classList.remove('hidden');
}

function closeSenkuRestore() {
    document.getElementById('senkuRestoreModal').classList.add('hidden');
}

// mode: 'replace' いまの選句を外して戻す / 'add' いまの選句に加える
function restoreSenkuArchive(mode) {
    const a = senkuActiveArchives().find(x => x.id === viewingSenkuArchiveId);
    closeSenkuRestore();
    if (!a) return;
    const now = Date.now();
    const changed = [];
    if (mode === 'replace') {
        senkuActiveItems().forEach(it => { it.del = true; it.ts = now; changed.push(it); });
    }
    const existing = new Set(senkuActiveItems().map(x => x.phrase));
    let pos = 0;
    senkuActiveItems().forEach(it => { if (it.pos >= pos) pos = it.pos + 1; });
    let added = 0;
    a.phrases.forEach((phrase, i) => {
        if (existing.has(phrase)) return;
        existing.add(phrase);
        const lv = Math.min(4, Math.max(1, Number(a.lvs && a.lvs[i]) || 1));
        const item = { id: newSenkuId(), phrase: phrase, pos: pos++, lv: lv, ts: now, del: false };
        senkuData.items.push(item);
        changed.push(item);
        added++;
    });
    saveSenkuData();
    pushSenkuRecords(changed);
    closeSenkuArchiveView();
    currentSenkuStage = 1;
    showToast(`${added}句を選句に戻しました` + (added < a.phrases.length ? `（すでにある${a.phrases.length - added}句は除く）` : ''));
    refreshSenkuTabIfOpen();
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
            data: { year: r.year, month: r.month, subtitle: r.subtitle || '', phrases: r.phrases, lvs: Array.isArray(r.lvs) ? r.lvs : undefined, savedAt: r.savedAt || 0 } };
    }
    return { id: r.id, kind: 'item', ts: r.ts, del: r.del ? 1 : 0, data: { phrase: r.phrase, pos: r.pos, lv: r.lv || 1 } };
}

// 変更した記録をクラウドへ送る（送りっぱなし。届かなかった分は次回の同期で再送される）
// 通信は1つずつ順番に行う（スプレッドシート側が同時に1件ずつしか処理できないため）
let _senkuPushChain = Promise.resolve();

function pushSenkuRecords(records) {
    if (!records || !records.length) return;
    if (!senkuCloudAvailable() || senkuCloudSupported === false) return;
    const MAX_URL = 6500;
    const urls = [];
    let chunk = [];
    const urlOf = (recs) => {
        const params = new URLSearchParams();
        params.append('senku', 'put');
        params.append('recs', JSON.stringify(recs));
        return senkuCloudUrl(params);
    };
    records.forEach(r => {
        const rec = senkuToRecord(r);
        if (chunk.length && urlOf(chunk.concat([rec])).length > MAX_URL) {
            urls.push(urlOf(chunk));
            chunk = [];
        }
        chunk.push(rec);
    });
    if (chunk.length) urls.push(urlOf(chunk));

    urls.forEach(u => {
        _senkuPushChain = _senkuPushChain
            .then(() => fetch(u, { method: 'GET', mode: 'no-cors', keepalive: true }))
            .catch(e => console.warn('Senku sync error:', e));
    });
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
            const rec = { id: id, phrase: data.phrase || '', pos: Number(data.pos) || 0, lv: Math.min(4, Math.max(1, Number(data.lv) || 1)), ts: ts, del: del };
            if (mine) Object.assign(mine, rec); else senkuData.items.push(rec);
        } else if (kind === 'archive') {
            const rec = { id: id, year: data.year, month: data.month, subtitle: data.subtitle || '',
                phrases: Array.isArray(data.phrases) ? data.phrases : [], lvs: Array.isArray(data.lvs) ? data.lvs : undefined, savedAt: data.savedAt || 0, ts: ts, del: del };
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
// 範囲で入選（作句日が指定した期間内の完成句を、まとめて一次に入れる）
// ========================================================
function senkuDateInputValue(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 作句日が [startStr, endStr]（YYYY-MM-DD）に重なるか。月だけ・年だけの日付は、その月・年と期間が重なれば対象にする
function senkuDateInRange(sakkuDate, startStr, endStr) {
    const key = parseDateLabel(sakkuDate).exactKey;   // 'YYYY-MM-DD'（不明な部分は 00）
    if (!key || key.startsWith('0000')) return false;   // 年代不詳は対象外
    const [y, m, d] = key.split('-');
    const low = `${y}-${m === '00' ? '01' : m}-${d === '00' ? '01' : d}`;
    const high = `${y}-${m === '00' ? '12' : m}-${d === '00' ? '31' : d}`;
    return low <= endStr && high >= startStr;
}

function senkuRangeCandidates() {
    const startStr = document.getElementById('senkuRangeStart').value;
    const endStr = document.getElementById('senkuRangeEnd').value;
    if (!startStr || !endStr || startStr > endStr) return [];
    const myName = userSettings.authorName || '風月';
    const have = new Set(senkuActiveItems().map(x => x.phrase));
    return haikuHistory
        .filter(h => h.status === '完成句' && (h.author || myName) === myName && h.phrase && !have.has(h.phrase)
            && senkuDateInRange(h.sakkuDate, startStr, endStr))
        .sort((a, b) => parseDateLabel(a.sakkuDate).exactKey.localeCompare(parseDateLabel(b.sakkuDate).exactKey)
            || (a.createdAt || 0) - (b.createdAt || 0));
}

function updateSenkuRangePreview() {
    const startStr = document.getElementById('senkuRangeStart').value;
    const endStr = document.getElementById('senkuRangeEnd').value;
    const note = document.getElementById('senkuRangePreview');
    const btn = document.getElementById('senkuRangeSubmit');
    let n = 0;
    if (!startStr || !endStr) note.textContent = '開始日と終了日を選んでください。';
    else if (startStr > endStr) note.textContent = '終了日は開始日より後にしてください。';
    else {
        n = senkuRangeCandidates().length;
        note.textContent = n ? `自分の完成句 ${n}句 が入選します（すでに選句にある句は除きます）。` : '該当する句はありません。';
    }
    btn.disabled = n === 0;
}

function openSenkuRangeModal() {
    const now = new Date();
    document.getElementById('senkuRangeStart').value = senkuDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
    document.getElementById('senkuRangeEnd').value = senkuDateInputValue(now);
    updateSenkuRangePreview();
    document.getElementById('senkuRangeModal').classList.remove('hidden');
}

function closeSenkuRangeModal() {
    document.getElementById('senkuRangeModal').classList.add('hidden');
}

function submitSenkuRange() {
    const cands = senkuRangeCandidates();
    if (!cands.length) return;
    const active = senkuActiveItems();
    let pos = active.length ? active[active.length - 1].pos + 1 : 0;
    const now = Date.now();
    const added = cands.map(h => ({ id: newSenkuId(), phrase: h.phrase, pos: pos++, lv: 1, ts: now, del: false }));
    senkuData.items.push(...added);
    saveSenkuData();
    pushSenkuRecords(added);
    closeSenkuRangeModal();
    currentSenkuStage = 1;
    showToast(`${added.length}句を入選しました`);
    refreshSenkuTabIfOpen();
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
