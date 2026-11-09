// ========================================================
// 📝 選句（句群から、いくつでも作れる「箱」へ句を振り分けて、投句用の句を選ぶ機能）
//   ・句群：期間で集めた句、または「入選」で拾った句の集まり（元の句のコピー）
//   ・箱　：句群から句をドラッグして入れる入れ物。いくつでも作れ、同じ句を複数の箱に入れられる
//   ・箱を「保存」すると、年月＋サブタイトル付きの記録になる（過去の選句から箱に戻せる）
//   ・どの句も元の句（完成句・下書き）とは独立しているので、直したり外したりしても元には影響しない
// ========================================================
const STORAGE_KEY_SENKU = 'fugetsu_release_senku2';
const OLD_STORAGE_KEY_SENKU = 'fugetsu_release_senku';   // 旧方式（一次〜最終）のデータ。使わなくなったので消す

// どの記録にも id / ts（最後に変更した時刻）/ del（削除済みの印。端末間で削除を正しく伝えるため消さずに残す）がある
//   groups   : 句群       {k:'group', id, name, auto('nyusen'＝「入選」の句群 / ''), pos}
//   gitems   : 句群の句   {k:'gitem', id, gid, phrase, pos}
//   boxes    : 箱         {k:'box', id, name, pos}
//   bitems   : 箱の句     {k:'bitem', id, bid, phrase, pos}
//   archives : 保存済み   {k:'sarch', id, year, month, subtitle, savedAt}
//   sitems   : 保存済みの句 {k:'sitem', id, aid, phrase, pos}（1句ずつ別の記録なので、句数に上限はない）
let senkuData = { groups: [], gitems: [], boxes: [], bitems: [], archives: [], sitems: [] };
const SENKU_COLLECTIONS = { group: 'groups', gitem: 'gitems', box: 'boxes', bitem: 'bitems', sarch: 'archives', sitem: 'sitems' };

let senkuView = null;   // いま開いている句群／箱 { type: 'group' | 'box', id }
let activeSenkuItem = null;
let editingSenkuArchiveId = null;
let viewingSenkuArchiveId = null;
let savingSenkuBoxId = null;

// 同じ瞬間に何百件も作っても番号がかぶらないよう、連番と長めの乱数を混ぜる
let _senkuIdSeq = 0;
function newSenkuId() {
    _senkuIdSeq = (_senkuIdSeq + 1) % 46656;
    return 's' + Date.now().toString(36) + _senkuIdSeq.toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 7);
}

// 記録を読み込み用の形に整える。種類が分からなければ null
function senkuNormalize(kind, x, base) {
    const o = { k: kind, id: x.id || newSenkuId(), ts: Number(x.ts) || base || 0, del: !!x.del };
    const pos = typeof x.pos === 'number' ? x.pos : (Number(x.pos) || 0);
    switch (kind) {
        case 'group': return Object.assign(o, { name: x.name || '', auto: x.auto || '', pos: pos });
        case 'gitem': return Object.assign(o, { gid: x.gid || '', phrase: x.phrase || '', pos: pos });
        case 'box': return Object.assign(o, { name: x.name || '', pos: pos });
        case 'bitem': return Object.assign(o, { bid: x.bid || '', phrase: x.phrase || '', pos: pos });
        case 'sarch': return Object.assign(o, { year: x.year, month: x.month, subtitle: x.subtitle || '', savedAt: x.savedAt || 0 });
        case 'sitem': return Object.assign(o, { aid: x.aid || '', phrase: x.phrase || '', pos: pos });
        default: return null;
    }
}

function loadSenkuData() {
    try {
        localStorage.removeItem(OLD_STORAGE_KEY_SENKU);
    } catch (e) { /* ignore */ }
    try {
        const raw = localStorage.getItem(STORAGE_KEY_SENKU);
        if (!raw) return;
        const d = JSON.parse(raw);
        Object.keys(SENKU_COLLECTIONS).forEach(kind => {
            const key = SENKU_COLLECTIONS[kind];
            senkuData[key] = (Array.isArray(d[key]) ? d[key] : []).map(x => senkuNormalize(kind, x, Date.now())).filter(Boolean);
        });
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

const senkuByPos = (a, b) => (a.pos - b.pos) || (a.id < b.id ? -1 : 1);

function senkuGroups() { return senkuData.groups.filter(x => !x.del).sort(senkuByPos); }
function senkuBoxes() { return senkuData.boxes.filter(x => !x.del).sort(senkuByPos); }
function senkuGroupItems(gid) { return senkuData.gitems.filter(x => !x.del && x.gid === gid).sort(senkuByPos); }
function senkuBoxItems(bid) { return senkuData.bitems.filter(x => !x.del && x.bid === bid).sort(senkuByPos); }
function senkuActiveArchives() { return senkuData.archives.filter(a => !a.del); }
// 保存した選句の句（並び順に）
function senkuArchivePhrases(a) {
    return senkuData.sitems.filter(x => !x.del && x.aid === a.id).sort(senkuByPos).map(x => x.phrase);
}
function senkuNextPos(list) { return list.length ? list[list.length - 1].pos + 1 : 0; }

function senkuMakeGroup(name, auto) {
    const now = Date.now();
    const g = { k: 'group', id: newSenkuId(), name: name, auto: auto || '', pos: senkuNextPos(senkuGroups()), ts: now, del: false };
    senkuData.groups.push(g);
    return g;
}

function senkuUniqueBoxName(wanted) {
    const names = new Set(senkuBoxes().map(b => b.name));
    if (wanted) {
        if (!names.has(wanted)) return wanted;
        let i = 2;
        while (names.has(`${wanted}(${i})`)) i++;
        return `${wanted}(${i})`;
    }
    let n = senkuBoxes().length + 1;
    while (names.has(`箱${n}`)) n++;
    return `箱${n}`;
}

function senkuMakeBox(name) {
    const b = { k: 'box', id: newSenkuId(), name: senkuUniqueBoxName(name), pos: senkuNextPos(senkuBoxes()), ts: Date.now(), del: false };
    senkuData.boxes.push(b);
    return b;
}

// 箱の中にその句を入れる（すでにあれば何もしない）。入れた記録を返す
function senkuPutInBox(box, phrase) {
    const items = senkuBoxItems(box.id);
    if (items.some(x => x.phrase === phrase)) return null;
    const it = { k: 'bitem', id: newSenkuId(), bid: box.id, phrase: phrase, pos: senkuNextPos(items), ts: Date.now(), del: false };
    senkuData.bitems.push(it);
    return it;
}

function isReadScreenActive() {
    const el = document.getElementById('readScreen');
    return !!(el && el.classList.contains('active'));
}

function refreshSenkuTabIfOpen() {
    if (currentReadTab === '選句' && isReadScreenActive()) renderYomuList(true);
}

// ========================================================
// 入選（読む画面から、句を1つ「入選」の句群に入れる）
// ========================================================
function addToSenku(phrase) {
    if (!phrase) return false;
    const recs = [];
    let g = senkuGroups().find(x => x.auto === 'nyusen');
    if (!g) {
        g = senkuMakeGroup('入選', 'nyusen');
        recs.push(g);
    }
    const items = senkuGroupItems(g.id);
    if (items.some(s => s.phrase === phrase)) {
        showToast('すでに入選しています');
        return false;
    }
    const it = { k: 'gitem', id: newSenkuId(), gid: g.id, phrase: phrase, pos: senkuNextPos(items), ts: Date.now(), del: false };
    senkuData.gitems.push(it);
    recs.push(it);
    saveSenkuData();
    pushSenkuRecords(recs);
    showToast(`入選しました（入選の句群 ${items.length + 1}句）`);
    refreshSenkuTabIfOpen();
    return true;
}

// 完成句／下書きの詳細パネルの「入選」ボタン
function addSelectedHaikuToSenku() {
    if (!activeSelectedHaiku) return;
    closeHaikuDetailModal();
    addToSenku(activeSelectedHaiku.phrase);
}

// ========================================================
// 小さなメニュー（箱の選択・⋯メニューに使う）
// ========================================================
function openSenkuMenu(title, entries) {
    document.getElementById('senkuMenuTitle').textContent = title;
    const list = document.getElementById('senkuMenuList');
    list.innerHTML = '';
    entries.forEach(en => {
        const row = document.createElement('div');
        row.className = 'senku-archive-row' + (en.danger ? ' senku-menu-danger' : '');
        row.textContent = en.label;
        row.onclick = () => { closeSenkuMenu(); en.fn(); };
        list.appendChild(row);
    });
    document.getElementById('senkuMenuModal').classList.remove('hidden');
}

function closeSenkuMenu() {
    document.getElementById('senkuMenuModal').classList.add('hidden');
}

// ========================================================
// 句群・箱の操作
// ========================================================
function senkuCurrentGroup() {
    return senkuView && senkuView.type === 'group' ? senkuGroups().find(g => g.id === senkuView.id) : null;
}
function senkuCurrentBox() {
    return senkuView && senkuView.type === 'box' ? senkuBoxes().find(b => b.id === senkuView.id) : null;
}

// いま見ているものが無くなっていたら、最初の句群（なければ最初の箱）を開く
function ensureSenkuView() {
    if (senkuCurrentGroup() || senkuCurrentBox()) return;
    const g = senkuGroups()[0];
    if (g) { senkuView = { type: 'group', id: g.id }; return; }
    const b = senkuBoxes()[0];
    senkuView = b ? { type: 'box', id: b.id } : null;
}

function setSenkuView(type, id) {
    senkuView = { type: type, id: id };
    renderYomuList(false);
}

// 「＋」：空の箱を作って開く
function addSenkuBoxAndOpen() {
    const b = senkuMakeBox();
    saveSenkuData();
    pushSenkuRecords([b]);
    showToast(`「${b.name}」を作りました`);
    setSenkuView('box', b.id);
}

function openSenkuViewMenu() {
    const g = senkuCurrentGroup();
    const b = senkuCurrentBox();
    if (g) {
        openSenkuMenu(`句群「${g.name}」`, [
            { label: '名前を変更', fn: renameSenkuView },
            { label: 'この句群を削除', fn: deleteSenkuView, danger: true }
        ]);
    } else if (b) {
        openSenkuMenu(`箱「${b.name}」`, [
            { label: '名前を変更', fn: renameSenkuView },
            { label: 'この箱を保存', fn: openSenkuSaveModal },
            { label: 'この箱を削除', fn: deleteSenkuView, danger: true }
        ]);
    }
}

function renameSenkuView() {
    const target = senkuCurrentGroup() || senkuCurrentBox();
    if (!target) return;
    const name = prompt('名前を入力してください', target.name);
    if (name === null) return;
    const text = name.trim();
    if (!text) return;
    target.name = text;
    target.ts = Date.now();
    saveSenkuData();
    pushSenkuRecords([target]);
    refreshSenkuTabIfOpen();
}

function deleteSenkuView() {
    const g = senkuCurrentGroup();
    const b = senkuCurrentBox();
    const target = g || b;
    if (!target) return;
    const msg = g
        ? `句群「${g.name}」を削除しますか？\n（元の句や、箱に入れた句は消えません）`
        : `箱「${b.name}」を削除しますか？\n（箱の中の句だけが消えます。句群や元の句は消えません）`;
    if (!confirm(msg)) return;
    target.del = true;
    target.ts = Date.now();
    saveSenkuData();
    pushSenkuRecords([target]);
    senkuView = null;
    showToast('削除しました');
    renderYomuList(false);
}

// 句をタップしたときのパネル
function onSenkuCardClicked(item) {
    activeSenkuItem = item;
    const modalPhraseEl = document.getElementById('modalPhrase');
    modalPhraseEl.innerHTML = renderPhraseRubyHtml(item.phrase);
    applyPhraseLengthClass(modalPhraseEl, item.phrase);
    const parts = item.k === 'gitem'
        ? [`<span class="text-action-btn primary" onclick="chooseBoxForActiveSenkuItem()">箱に入れる</span>`,
           `<span class="text-action-btn danger" onclick="removeActiveSenkuItem()">句群から外す</span>`]
        : [`<span class="text-action-btn primary" onclick="openSenkuEditModal()">修正</span>`,
           `<span class="text-action-btn danger" onclick="removeActiveSenkuItem()">箱から外す</span>`];
    document.getElementById('modalActions').innerHTML = parts.join('<span class="action-divider">|</span>');
    document.getElementById('haikuDetailModal').classList.remove('hidden');
}

// 句をタップ →「箱に入れる」（ドラッグできないときの代わりの方法）
function chooseBoxForActiveSenkuItem() {
    if (!activeSenkuItem) return;
    closeHaikuDetailModal();
    const phrase = activeSenkuItem.phrase;
    activeSenkuItem = null;
    const entries = senkuBoxes().map(b => ({ label: b.name, fn: () => senkuDropPhrase('box:' + b.id, phrase) }));
    entries.push({ label: '＋ 新しい箱', fn: () => senkuDropPhrase('new', phrase) });
    openSenkuMenu('どの箱に入れますか', entries);
}

function removeActiveSenkuItem() {
    if (!activeSenkuItem) return;
    closeHaikuDetailModal();
    const coll = activeSenkuItem.k === 'gitem' ? senkuData.gitems : senkuData.bitems;
    const target = coll.find(s => s.id === activeSenkuItem.id);
    const isGroup = activeSenkuItem.k === 'gitem';
    activeSenkuItem = null;
    if (target) {
        target.del = true;
        target.ts = Date.now();
        saveSenkuData();
        pushSenkuRecords([target]);
    }
    showToast(isGroup ? '句群から外しました' : '箱から外しました');
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
    const target = senkuData.bitems.find(s => s.id === activeSenkuItem.id);
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

// 句群の句を箱に入れる（target は 'new' か 'box:<箱のid>'）
function senkuDropPhrase(target, phrase) {
    if (!phrase) return;
    const recs = [];
    let box = null;
    let created = false;
    if (target === 'new') {
        box = senkuMakeBox();
        recs.push(box);
        created = true;
    } else if (target && target.startsWith('box:')) {
        box = senkuBoxes().find(b => b.id === target.slice(4));
    }
    if (!box) return;
    const it = senkuPutInBox(box, phrase);
    if (it) recs.push(it);
    if (recs.length) {
        saveSenkuData();
        pushSenkuRecords(recs);
    }
    if (!it) showToast(`「${box.name}」には、すでに入っています`);
    else showToast(created ? `「${box.name}」を作って入れました` : `「${box.name}」に入れました`);
    refreshSenkuTabIfOpen();
}

// ========================================================
// 選句タブの描画
// ========================================================
function senkuChip(label, count, active, onclick) {
    const el = document.createElement('span');
    el.className = 'senku-chip' + (active ? ' active' : '');
    el.appendChild(document.createTextNode(label));
    if (count !== null) {
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = String(count);
        el.appendChild(n);
    }
    el.onclick = onclick;
    return el;
}

function updateSenkuBar() {
    const bar = document.getElementById('senkuBar');
    if (!bar) return;
    bar.innerHTML = '';
    const mkRow = (label) => {
        const row = document.createElement('div');
        row.className = 'senku-row';
        const l = document.createElement('span');
        l.className = 'senku-row-label';
        l.textContent = label;
        row.appendChild(l);
        bar.appendChild(row);
        return row;
    };
    const mkMore = () => {
        const m = document.createElement('span');
        m.className = 'senku-more';
        m.textContent = '⋯';
        m.title = '名前の変更・削除など';
        m.onclick = openSenkuViewMenu;
        return m;
    };

    const groupRow = mkRow('句群');
    senkuGroups().forEach(g => {
        const active = !!(senkuView && senkuView.type === 'group' && senkuView.id === g.id);
        groupRow.appendChild(senkuChip(g.name, senkuGroupItems(g.id).length, active, () => setSenkuView('group', g.id)));
        if (active) groupRow.appendChild(mkMore());
    });
    const addGroup = document.createElement('span');
    addGroup.className = 'senku-add';
    addGroup.textContent = '＋';
    addGroup.title = '期間を決めて句群を作る';
    addGroup.onclick = openSenkuRangeModal;
    groupRow.appendChild(addGroup);

    const boxRow = mkRow('箱');
    senkuBoxes().forEach(b => {
        const active = !!(senkuView && senkuView.type === 'box' && senkuView.id === b.id);
        const chip = senkuChip(b.name, senkuBoxItems(b.id).length, active, () => setSenkuView('box', b.id));
        chip.dataset.drop = 'box:' + b.id;
        boxRow.appendChild(chip);
        if (active) boxRow.appendChild(mkMore());
    });
    const addBox = document.createElement('span');
    addBox.className = 'senku-add';
    addBox.textContent = '＋';
    addBox.title = '新しい箱を作る';
    addBox.dataset.drop = 'new';
    addBox.onclick = addSenkuBoxAndOpen;
    boxRow.appendChild(addBox);
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
    ensureSenkuView();
    updateSenkuBar();

    // 下の操作：箱を開いているときだけ「この箱を保存」を出す
    const inBox = !!senkuCurrentBox();
    ['senkuSaveBtn', 'senkuSaveDivider'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !inBox);
    });

    const group = senkuCurrentGroup();
    const box = senkuCurrentBox();
    const items = group ? senkuGroupItems(group.id) : (box ? senkuBoxItems(box.id) : []);
    const savedScrollLeft = preserveScroll ? scroll.scrollLeft : 0;
    scroll.innerHTML = '';

    if (items.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'senku-empty';
        if (group) msg.textContent = '句群は空です。';
        else if (box) msg.textContent = '箱は空です。句群の句を、上の箱の名前へドラッグして入れてください。';
        else msg.textContent = '句群はまだありません。上の「句群」の「＋」で期間を決めて句を集めるか、完成句を上へスワイプしてください。';
        scroll.appendChild(msg);
        return;
    }

    // 句群の中の句のうち、どれかの箱に入っているものには傍線をつける
    const boxed = new Set();
    if (group) {
        const activeBoxIds = new Set(senkuBoxes().map(b => b.id));
        senkuData.bitems.forEach(x => { if (!x.del && activeBoxIds.has(x.bid)) boxed.add(x.phrase); });
    }

    const orderIds = items.map(s => s.id);
    const initialIds = orderIds.slice();
    items.forEach((item, i) => {
        const card = document.createElement('div');
        card.className = 'saijiki-haiku-card senku-card' + (group && boxed.has(item.phrase) ? ' senku-boxed' : '');
        card.dataset.id = item.id;
        card.style.order = i;
        card.onclick = () => onSenkuCardClicked(item);

        const phraseDiv = document.createElement('div');
        phraseDiv.className = 'saijiki-phrase';
        phraseDiv.innerHTML = renderPhraseRubyHtml(item.phrase);
        applyPhraseLengthClass(phraseDiv, item.phrase);
        card.appendChild(phraseDiv);

        scroll.appendChild(card);
        if (group) attachSenkuGroupCardGestures(card, item);
        else attachSenkuBoxCardGestures(card, scroll, orderIds, initialIds, item);
    });

    requestAnimationFrame(() => { scroll.scrollLeft = savedScrollLeft; });
}

// ========================================================
// 長押しジェスチャー（タッチ・マウス共通）
//   長押し（約0.45秒、動かさない）で「つかんだ」状態になり、そのあと動かす
//   instantMouse: マウスのときは、長押しせず、動かし始めたらすぐ「つかんだ」状態にする
//   instantVertical: タッチのとき、はっきり縦に動かし始めたら、長押しせずすぐ「つかんだ」状態にする
//                    （横に動かし始めたときは、ふつうのスクロールに任せる）
// ========================================================
function senkuLongPress(el, h) {
    const HOLD_MS = 450;
    const SLOP = 10;
    let timer = null, armed = false, active = false, byMouse = false;
    let sx = 0, sy = 0, lx = 0, ly = 0, lastTouchEnd = 0;

    const pt = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
    const stopMouse = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    const arm = (instant) => {
        armed = true;
        try { if (navigator.vibrate && !byMouse && !instant) navigator.vibrate(15); } catch (_) {}
        if (h.onArm) h.onArm({ x: lx, y: ly });
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
        byMouse = e.type === 'mousedown';
        clearTimer();
        timer = setTimeout(() => {
            if (!active) return;
            arm();
        }, HOLD_MS);
        if (byMouse) {
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
            if (Math.abs(lx - sx) > SLOP || Math.abs(ly - sy) > SLOP) {
                clearTimer();
                if (h.instantMouse && byMouse) {
                    arm(true);   // マウスは、動かし始めたらすぐ「つかんだ」状態にする
                } else if (h.instantVertical && !byMouse && Math.abs(ly - sy) > Math.abs(lx - sx) * 1.5) {
                    arm(true);   // タッチは、はっきり縦に動かしたときだけ、すぐ「つかんだ」状態にする
                } else {
                    // 長押しになる前に動いた → ふつうのスクロール／タップとして任せる
                    active = false;
                    stopMouse();
                    return;
                }
            } else {
                return;
            }
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

// 読む画面：上へスワイプで「入選」
function attachSenkuAddGesture(el, getPhrase) {
    const THRESH = 45;
    const reset = () => {
        el.classList.remove('senku-armed', 'senku-ready');
        el.style.transform = '';
    };
    senkuLongPress(el, {
        instantVertical: true,
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

// 句群の中の句：上へスワイプして（または長押ししてつかんで）、上にある箱の名前（または「＋」）へ運んで入れる
function attachSenkuGroupCardGestures(card, item) {
    let ghost = null, hover = null;
    const bar = () => document.getElementById('senkuBar');
    const targetAt = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.closest('[data-drop]') : null;
    };
    const setHover = (t) => {
        if (hover === t) return;
        if (hover) hover.classList.remove('senku-drop-hover');
        hover = t;
        if (hover) hover.classList.add('senku-drop-hover');
    };
    const cleanup = () => {
        if (ghost) ghost.remove();
        ghost = null;
        card.classList.remove('senku-lifted');
        const b = bar();
        if (b) b.classList.remove('senku-dropping');
        setHover(null);
    };

    senkuLongPress(card, {
        instantMouse: true,
        instantVertical: true,
        onArm() {
            const r = card.getBoundingClientRect();
            ghost = card.cloneNode(true);
            ghost.classList.add('senku-ghost');
            ghost.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
            document.body.appendChild(ghost);
            card.classList.add('senku-lifted');
            const b = bar();
            if (b) b.classList.add('senku-dropping');
        },
        onMove({ dx, dy, x, y }) {
            if (ghost) ghost.style.transform = `translate(${dx}px, ${dy}px)`;
            setHover(targetAt(x, y));
        },
        onEnd({ x, y, cancelled }) {
            // スマホのブラウザが途中で操作を取り消した場合は、最後に重なっていた場所に入れる
            const t = cancelled ? hover : targetAt(x, y);
            const value = t ? t.dataset.drop : null;
            cleanup();
            if (value) senkuDropPhrase(value, item.phrase);
        }
    });
}

// 箱の中の句：上か下へスワイプすると箱から外れる ／ 長押ししてから横へドラッグで並べ替え
function attachSenkuBoxCardGestures(card, container, orderIds, initialIds, item) {
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
        instantMouse: true,
        instantVertical: true,
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
            // 動かし始めの向きで「並べ替え（横）」か「箱から外す（縦）」かを決める
            if (!mode && (Math.abs(dx) > 14 || Math.abs(dy) > 14)) {
                mode = Math.abs(dy) > Math.abs(dx) ? 'out' : 'reorder';
                if (mode === 'reorder') card.classList.add('senku-dragging');
            }
            if (mode === 'out') {
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

            if (finalMode === 'out') {
                if (Math.abs(dy) >= THRESH && Math.abs(dy) > Math.abs(dx)) {
                    const target = senkuData.bitems.find(s => s.id === item.id);
                    if (target) {
                        target.del = true;
                        target.ts = Date.now();
                        saveSenkuData();
                        pushSenkuRecords([target]);
                        showToast('箱から外しました');
                        refreshSenkuTabIfOpen();
                    }
                }
                return;
            }
            if (finalMode !== 'reorder' || orderIds.join() === initialIds.join()) return;

            // 並べ替え：見えている句どうしで、元の位置番号を入れ替える
            const byId = new Map(senkuData.bitems.map(s => [s.id, s]));
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
// 箱の保存・過去の選句
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
    const box = senkuCurrentBox();
    if (!box) {
        alert('保存する箱を開いてください。');
        return;
    }
    const items = senkuBoxItems(box.id);
    if (items.length === 0) {
        alert('この箱は空です。');
        return;
    }
    editingSenkuArchiveId = null;
    savingSenkuBoxId = box.id;
    fillSenkuMonthOptions();
    const now = new Date();
    document.getElementById('senkuYearInput').value = now.getFullYear();
    document.getElementById('senkuMonthSelect').value = String(now.getMonth() + 1);
    // 箱に自分で名前をつけているなら、それをサブタイトルの初期値にする
    document.getElementById('senkuSubtitleInput').value = /^箱\d+$/.test(box.name) ? '' : box.name;
    document.getElementById('senkuSaveTitle').textContent = '箱を保存';
    document.getElementById('senkuSaveNote').textContent = `「${box.name}」の${items.length}句を保存します。箱はそのまま残ります。`;
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
    document.getElementById('senkuSaveNote').textContent = `${senkuArchivePhrases(a).length}句`;
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

    const box = senkuBoxes().find(b => b.id === savingSenkuBoxId);
    const items = box ? senkuBoxItems(box.id) : [];
    if (items.length === 0) { closeSenkuSaveModal(); return; }
    const now = Date.now();
    const archive = {
        k: 'sarch',
        id: newSenkuId(),
        year: year,
        month: month,
        subtitle: subtitle,
        savedAt: now,
        ts: now,
        del: false
    };
    const sitems = items.map((s, i) => ({ k: 'sitem', id: newSenkuId(), aid: archive.id, phrase: s.phrase, pos: i, ts: now, del: false }));
    senkuData.archives.push(archive);
    senkuData.sitems.push(...sitems);
    saveSenkuData();
    pushSenkuRecords([archive].concat(sitems));
    closeSenkuSaveModal();
    showToast(`${year}年${month}月${subtitle}（${items.length}句）を保存しました`);
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
        cnt.textContent = `${senkuArchivePhrases(a).length}句`;
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
    senkuArchivePhrases(a).forEach(phrase => {
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

function renameViewingSenkuArchive() {
    if (viewingSenkuArchiveId) openSenkuArchiveRename(viewingSenkuArchiveId);
}

// 保存した句群を、新しい箱として戻す（編集し直せる）
function restoreViewingSenkuArchive() {
    const a = senkuActiveArchives().find(x => x.id === viewingSenkuArchiveId);
    if (!a) return;
    const box = senkuMakeBox(senkuArchiveTitle(a));
    const recs = [box];
    senkuArchivePhrases(a).forEach(phrase => {
        const it = senkuPutInBox(box, phrase);
        if (it) recs.push(it);
    });
    saveSenkuData();
    pushSenkuRecords(recs);
    closeSenkuArchiveView();
    showToast(`「${box.name}」として箱に戻しました`);
    setSenkuView('box', box.id);
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
//   ・種類は group / gitem / box / bitem / sarch / sitem。旧方式（item / archive）の行は読み飛ばす
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
    const rec = { id: r.id, kind: r.k, ts: r.ts, del: r.del ? 1 : 0 };
    switch (r.k) {
        case 'group': rec.data = { name: r.name, auto: r.auto || '', pos: r.pos }; break;
        case 'gitem': rec.data = { gid: r.gid, phrase: r.phrase, pos: r.pos }; break;
        case 'box': rec.data = { name: r.name, pos: r.pos }; break;
        case 'bitem': rec.data = { bid: r.bid, phrase: r.phrase, pos: r.pos }; break;
        case 'sarch': rec.data = { year: r.year, month: r.month, subtitle: r.subtitle || '', savedAt: r.savedAt || 0 }; break;
        case 'sitem': rec.data = { aid: r.aid, phrase: r.phrase, pos: r.pos }; break;
        default: return null;
    }
    return rec;
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
        if (!rec) return;
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
    Object.keys(SENKU_COLLECTIONS).forEach(kind => {
        senkuData[SENKU_COLLECTIONS[kind]].forEach(x => local.set(x.id, x));
    });
    const seen = new Set();
    const toPush = [];
    let changed = false;

    (rows || []).forEach(row => {
        const id = String(row[0] || '');
        const kind = String(row[1] || '');
        if (!id || !SENKU_COLLECTIONS[kind]) return;   // 旧方式の行などは読み飛ばす
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
        const rec = senkuNormalize(kind, Object.assign({}, data, { id: id, ts: ts, del: del }), ts);
        if (!rec) return;
        if (mine) Object.assign(mine, rec); else senkuData[SENKU_COLLECTIONS[kind]].push(rec);
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
            if (!document.querySelector('.senku-dragging, .senku-lifted')) {
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
// 範囲で句群を作る（作句日が指定した期間内の、自分の完成句を集める）
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
    const seen = new Set();
    return haikuHistory
        .filter(h => h.status === '完成句' && (h.author || myName) === myName && h.phrase
            && senkuDateInRange(h.sakkuDate, startStr, endStr))
        .sort((a, b) => parseDateLabel(a.sakkuDate).exactKey.localeCompare(parseDateLabel(b.sakkuDate).exactKey)
            || (a.createdAt || 0) - (b.createdAt || 0))
        .filter(h => !seen.has(h.phrase) && seen.add(h.phrase));   // 同じ句は1つにまとめる
}

// 期間から句群の名前の初期値をつくる（例：10/1〜11/1）。年が今年でなければ年もつける
function senkuRangeDefaultName(startStr, endStr) {
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const thisYear = new Date().getFullYear();
    const s = (sy === thisYear ? '' : `${sy}/`) + `${sm}/${sd}`;
    const e = (ey === sy ? '' : `${ey}/`) + `${em}/${ed}`;
    return `${s}〜${e}`;
}

let _senkuRangeNameEdited = false;

function updateSenkuRangePreview() {
    const startStr = document.getElementById('senkuRangeStart').value;
    const endStr = document.getElementById('senkuRangeEnd').value;
    const note = document.getElementById('senkuRangePreview');
    const btn = document.getElementById('senkuRangeSubmit');
    let n = 0;
    if (!startStr || !endStr) note.textContent = '開始日と終了日を選んでください。';
    else if (startStr > endStr) note.textContent = '終了日は開始日より後にしてください。';
    else {
        if (!_senkuRangeNameEdited) document.getElementById('senkuRangeName').value = senkuRangeDefaultName(startStr, endStr);
        n = senkuRangeCandidates().length;
        note.textContent = n ? `自分の完成句 ${n}句 を集めます。` : '該当する句はありません。';
    }
    btn.disabled = n === 0;
}

function openSenkuRangeModal() {
    const now = new Date();
    _senkuRangeNameEdited = false;
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
    const startStr = document.getElementById('senkuRangeStart').value;
    const endStr = document.getElementById('senkuRangeEnd').value;
    const name = document.getElementById('senkuRangeName').value.trim() || senkuRangeDefaultName(startStr, endStr);
    const g = senkuMakeGroup(name, '');
    const now = Date.now();
    const items = cands.map((h, i) => ({ k: 'gitem', id: newSenkuId(), gid: g.id, phrase: h.phrase, pos: i, ts: now, del: false }));
    senkuData.gitems.push(...items);
    saveSenkuData();
    pushSenkuRecords([g].concat(items));
    closeSenkuRangeModal();
    showToast(`句群「${g.name}」を作りました（${items.length}句）`);
    setSenkuView('group', g.id);
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

// 「一句ずつ表示」モードの句にも、上スワイプの入選を付ける
(function initSenkuSingleModeGesture() {
    const el = document.querySelector('#readSingleContainer .haiku-screen');
    if (!el) return;
    attachSenkuAddGesture(el, () => {
        const cur = currentKuchoHaikus && currentKuchoHaikus[currentKuchoSingleIndex];
        return cur ? cur.phrase : '';
    });
})();
