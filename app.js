// ========================================================
// おみ句じ句帳 - 風月（製品版スタンドアロン・エンジン）
// ========================================================

const STORAGE_KEY_HAIKU = 'fugetsu_release_haikus';
const STORAGE_KEY_SETTINGS = 'fugetsu_release_settings';

// 代表的な歴代俳人マスター（入力補完用）
const FAMOUS_AUTHORS_MASTER = [
    { name: '松尾芭蕉', kana: 'まつおばしょう' },
    { name: '与謝蕪村', kana: 'よさぶそん' },
    { name: '小林一茶', kana: 'こばやしいっさ' },
    { name: '正岡子規', kana: 'まさおかしき' },
    { name: '高浜虚子', kana: 'たかはまきょし' },
    { name: '河東碧梧桐', kana: 'かわひがしへきごとう' },
    { name: '種田山頭火', kana: 'たねださんとうか' },
    { name: '尾崎放哉', kana: 'おざきほうさい' },
    { name: '水原秋櫻子', kana: 'みずはらしゅうおうし' },
    { name: '山口誓子', kana: 'やまぐちせいし' },
    { name: '中村草田男', kana: 'なかむらくさとお' },
    { name: '加藤楸邨', kana: 'かとうしゅうそん' },
    { name: '石田波郷', kana: 'いしだはきょう' },
    { name: '飯田蛇笏', kana: 'いいだだこつ' },
    { name: '飯田龍太', kana: 'いいだりゅうた' },
    { name: '西東三鬼', kana: 'さいとうさんき' },
    { name: '久保田万太郎', kana: 'くぼたまんたろう' },
    { name: '阿部みどり女', kana: 'あべみどりじょ' },
    { name: '星野立子', kana: 'ほしのたつこ' },
    { name: '橋本多佳子', kana: 'はしもとたかこ' },
    { name: '三橋鷹女', kana: 'みつはしたかじょ' },
    { name: '野沢凡兆', kana: 'のざわぼんちょう' },
    { name: '向井去来', kana: 'むかいきょらい' },
    { name: '服部嵐雪', kana: 'はっとりらんせつ' },
    { name: '宝井其角', kana: 'たからいきかく' },
    { name: '上島鬼貫', kana: 'うえじまおにつら' },
    { name: '加賀千代女', kana: 'かがのちよじょ' },
    { name: '山口青邨', kana: 'やまぐちせいそん' }
];

let saijikiDatabase = []; 
let koyomiDatabase = {};  
let haikuHistory = [];    

let currentReadTab = '完成句'; 
let currentAuthorFilter = null; // null: 自分の句帳, 'ALL': すべて, または特定作者名
let editingHaikuObj = null; 
let activeSelectedHaiku = null; 

let currentSaijikiSeason = 'haru';
let currentStep1Season = 'haru';

let omikujiPool = [];
let omikujiIndex = 0;
let touchStartX = 0;
let touchStartY = 0;

let userSettings = {
    authorName: '風月',
    authorKana: 'ふうげつ',
    initialized: false,
    startupOmikuji: false,
    homeKiyose: false
};

let currentHaikuData = {
    id: '', phrase: '', oldPhrase: '', kigo: '', parentKigo: '', parentKana: '',
    season: 'haru', detailSeason: '', author: '風月', authorKana: 'ふうげつ',
    sakkuDate: '', status: '完成句'
};

// ▼▼ XSS防止用HTMLエスケープ関数 ▼▼
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getTodayDateString() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function toKanjiNum(str) {
    const numMap = {'0':'〇', '1':'一', '2':'二', '3':'三', '4':'四', '5':'五', '6':'六', '7':'七', '8':'八', '9':'九'};
    return String(str).split('').map(char => numMap[char] || char).join('');
}

function parseDateLabel(dateStr) {
    if (!dateStr) return { groupKey: '0000-00-00', exactKey: '0000-00-00', label: '年代不詳' };
    let str = String(dateStr).trim().replace(/[/.]/g, '-');
    const parts = str.split('-').map(p => p.trim()).filter(Boolean);

    if (parts.length === 1 && /^\d{1,4}$/.test(parts[0])) {
        const yStr = String(parseInt(parts[0], 10));
        return { groupKey: `${parts[0].padStart(4, '0')}-00-00`, exactKey: `${parts[0].padStart(4, '0')}-00-00`, label: `${toKanjiNum(yStr)}年` };
    }
    if (parts.length >= 2 && /^\d{1,4}$/.test(parts[0])) {
        const y = parts[0].padStart(4, '0');
        const yNum = String(parseInt(parts[0], 10));
        const mNum = parseInt(parts[1], 10);
        if (!isNaN(mNum)) {
            const monthMap = {1:'一', 2:'二', 3:'三', 4:'四', 5:'五', 6:'六', 7:'七', 8:'八', 9:'九', 10:'十', 11:'十一', 12:'十二'};
            const dayMap = {
                1:'一', 2:'二', 3:'三', 4:'四', 5:'五', 6:'六', 7:'七', 8:'八', 9:'九', 10:'十',
                11:'十一', 12:'十二', 13:'十三', 14:'十四', 15:'十五', 16:'十六', 17:'十七', 18:'十八', 19:'十九', 20:'二十',
                21:'二十一', 22:'二十二', 23:'二十三', 24:'二十四', 25:'二十五', 26:'二十六', 27:'二十七', 28:'二十八', 29:'二十九', 30:'三十',
                31:'三十一'
            };
            
            let label = `${toKanjiNum(yNum)}年 ${monthMap[mNum] || mNum}月`;
            let dNum = parts[2] ? parseInt(parts[2], 10) : null;
            
            if (dNum && !isNaN(dNum)) {
                label += `${dayMap[dNum] || dNum}日`;
                return { 
                    groupKey: `${y}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`, 
                    exactKey: `${y}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`, 
                    label: label 
                };
            } else {
                return { 
                    groupKey: `${y}-${String(mNum).padStart(2, '0')}-00`, 
                    exactKey: `${y}-${String(mNum).padStart(2, '0')}-00`, 
                    label: label 
                };
            }
        }
    }
    return { groupKey: '0000-00-00', exactKey: '0000-00-00', label: '年代不詳' };
}

// ========================================================
// 初期化 & データ読み込み
// ========================================================
window.onload = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            // アプリ起動時に毎回バックグラウンドで最新アップデートを確認
            reg.update().catch(() => {});
        }).catch(() => {});

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    }

    loadUserSettings();
    loadLocalHaikus();
    loadInternalDatabases();

    initSwipeEvents();
    initKeyboardEvents();
    renderTodayCalendar();

    // 画面外クリックで作者サジェストを閉じる
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#authorInput') && !e.target.closest('#authorSuggestList')) {
            hideAuthorSuggestions();
        }
    });

    if (!userSettings.initialized) {
        document.getElementById('welcomeModal').classList.remove('hidden');
    } else if (userSettings.startupOmikuji) {
        triggerRandomOmikuji();
    }
};

function loadUserSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
        if (saved) {
            userSettings = Object.assign(userSettings, JSON.parse(saved));
        }
    } catch (e) {}
    applyUserSettingsToUI();
}

function applyUserSettingsToUI() {
    updateHeaderTitle();
    const kiyoseBlock = document.getElementById('homeKiyoseBlock');
    if (kiyoseBlock) {
        // デフォルトで表示（hideHomeKiyose が true の場合のみ非表示）
        const isHide = !!userSettings.hideHomeKiyose;
        kiyoseBlock.classList.toggle('hidden', isHide);
        kiyoseBlock.style.display = isHide ? 'none' : 'flex';
    }
}

function updateHeaderTitle() {
    const titleEl = document.getElementById('readTitleText');
    if (!titleEl) return;
    
    const myName = userSettings.authorName || '風月';
    if (currentAuthorFilter === null || currentAuthorFilter === myName) {
        titleEl.textContent = `${myName} 句帳`;
    } else if (currentAuthorFilter === 'ALL') {
        titleEl.textContent = '全句帳';
    } else {
        titleEl.textContent = `${currentAuthorFilter} 句集`;
    }
}

function loadLocalHaikus() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_HAIKU);
        if (saved) {
            haikuHistory = JSON.parse(saved);
        } else {
            haikuHistory = [
                {
                    id: 'sample-1',
                    phrase: '閑さや岩にしみ入る蝉の声',
                    author: userSettings.authorName || '風月',
                    authorKana: userSettings.authorKana || 'ふうげつ',
                    kigo: '蝉',
                    parentKigo: '蝉',
                    parentKana: 'せみ',
                    season: 'natsu',
                    detailSeason: '晩夏',
                    status: '完成句',
                    sakkuDate: getTodayDateString(),
                    createdAt: Date.now()
                },
                {
                    id: 'sample-2',
                    phrase: '古池や蛙飛びこむ水の音',
                    author: '松尾芭蕉',
                    authorKana: 'まつおばしょう',
                    kigo: '蛙',
                    parentKigo: '蛙',
                    parentKana: 'かわず',
                    season: 'haru',
                    detailSeason: '晩春',
                    status: '完成句',
                    sakkuDate: '1686',
                    createdAt: Date.now() - 1000
                },
                {
                    id: 'sample-3',
                    phrase: '菜の花や月は東に日は西に',
                    author: '与謝蕪村',
                    authorKana: 'よさぶそん',
                    kigo: '菜の花',
                    parentKigo: '菜の花',
                    parentKana: 'なのはな',
                    season: 'haru',
                    detailSeason: '晩春',
                    status: '完成句',
                    sakkuDate: '1774',
                    createdAt: Date.now() - 2000
                },
                {
                    id: 'sample-4',
                    phrase: '名月をとってくれろと泣く子かな',
                    author: '小林一茶',
                    authorKana: 'こばやしいっさ',
                    kigo: '名月',
                    parentKigo: '名月',
                    parentKana: 'めいげつ',
                    season: 'aki',
                    detailSeason: '仲秋',
                    status: '完成句',
                    sakkuDate: '1819',
                    createdAt: Date.now() - 3000
                }
            ];
            saveLocalHaikus();
        }
    } catch (e) {}
}

function saveLocalHaikus() {
    try {
        localStorage.setItem(STORAGE_KEY_HAIKU, JSON.stringify(haikuHistory));
    } catch (e) {}
}

async function loadInternalDatabases() {
    try {
        const respKoyomi = await fetch('data/koyomi.json');
        if (respKoyomi.ok) {
            koyomiDatabase = await respKoyomi.json();
            renderKoyomiFromLocal();
        }
    } catch (e) {
        console.warn('Koyomi load offline fallback:', e);
    }

    try {
        const respSaijiki = await fetch('data/saijiki.json');
        if (respSaijiki.ok) {
            saijikiDatabase = await respSaijiki.json();
        }
    } catch (e) {
        console.warn('Saijiki load offline fallback:', e);
    }
}

// ========================================================
// 作者名リアルタイムサジェスト（入力補完）
// ========================================================
function onAuthorInputChanged(val) {
    const inputVal = (val || '').trim().toLowerCase();
    const suggestBox = document.getElementById('authorSuggestList');
    if (!suggestBox) return;

    if (!inputVal) {
        suggestBox.classList.add('hidden');
        return;
    }

    // マスター作者 ＋ 過去に登録した作者を統合
    const myName = userSettings.authorName || '風月';
    const myKana = userSettings.authorKana || 'ふうげつ';
    const allAuthorsMap = new Map();
    
    // 1. 自分
    allAuthorsMap.set(myName, { name: myName, kana: myKana });
    
    // 2. マスター
    FAMOUS_AUTHORS_MASTER.forEach(item => allAuthorsMap.set(item.name, item));

    // 3. 句帳内の作者
    haikuHistory.forEach(h => {
        if (h.author && !allAuthorsMap.has(h.author)) {
            allAuthorsMap.set(h.author, { name: h.author, kana: h.authorKana || '' });
        }
    });

    const matches = Array.from(allAuthorsMap.values()).filter(item => {
        return item.name.toLowerCase().includes(inputVal) || (item.kana && item.kana.includes(inputVal));
    });

    if (matches.length === 0) {
        suggestBox.classList.add('hidden');
        return;
    }

    suggestBox.innerHTML = '';
    matches.slice(0, 6).forEach(item => {
        const div = document.createElement('div');
        div.className = 'author-suggest-item';
        div.innerHTML = `<span>${escapeHtml(item.name)}</span><span class="author-suggest-kana">${escapeHtml(item.kana)}</span>`;
        div.onmousedown = (e) => {
            e.preventDefault();
            selectAuthorSuggestion(item.name, item.kana);
        };
        suggestBox.appendChild(div);
    });

    suggestBox.classList.remove('hidden');
}

function selectAuthorSuggestion(name, kana) {
    document.getElementById('authorInput').value = name;
    if (kana) document.getElementById('authorKanaInput').value = kana;
    hideAuthorSuggestions();
}

function hideAuthorSuggestions() {
    const suggestBox = document.getElementById('authorSuggestList');
    if (suggestBox) suggestBox.classList.add('hidden');
}

// ========================================================
// 作句日付の入力制御
// ========================================================
function setTodaySakkuDate() {
    const today = new Date();
    document.getElementById('sakkuYearInput').value = today.getFullYear();
    document.getElementById('sakkuMonthInput').value = today.getMonth() + 1;
    document.getElementById('sakkuDayInput').value = today.getDate();
}

function populateSakkuDateFields(dateStr) {
    const yInput = document.getElementById('sakkuYearInput');
    const mInput = document.getElementById('sakkuMonthInput');
    const dInput = document.getElementById('sakkuDayInput');
    if (!yInput || !mInput || !dInput) return;

    if (!dateStr) {
        yInput.value = '';
        mInput.value = '';
        dInput.value = '';
        return;
    }

    const parts = String(dateStr).trim().replace(/[/.]/g, '-').split('-').map(p => p.trim()).filter(Boolean);
    yInput.value = parts[0] ? String(parseInt(parts[0], 10)) : '';
    mInput.value = (parts[1] && parts[1] !== '00') ? String(parseInt(parts[1], 10)) : '';
    dInput.value = (parts[2] && parts[2] !== '00') ? String(parseInt(parts[2], 10)) : '';
}

function getFormattedSakkuDateFromFields() {
    const yVal = document.getElementById('sakkuYearInput').value.trim();
    const mVal = document.getElementById('sakkuMonthInput').value.trim();
    const dVal = document.getElementById('sakkuDayInput').value.trim();

    if (!yVal) return ''; // 年がなければ空欄（年代不詳）

    const yNum = parseInt(yVal, 10);
    if (isNaN(yNum)) return '';

    const yStr = String(yNum);
    const mNum = parseInt(mVal, 10);
    const dNum = parseInt(dVal, 10);

    if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
        const mStr = String(mNum).padStart(2, '0');
        if (!isNaN(dNum) && dNum >= 1 && dNum <= 31) {
            const dStr = String(dNum).padStart(2, '0');
            return `${yStr}-${mStr}-${dStr}`;
        }
        return `${yStr}-${mStr}`;
    }

    return yStr; // 年のみ
}

// ========================================================
// 👤 句帳メニュー（三本柱アコーディオン）
// ========================================================
function toggleMenuAccordion(sectionId) {
    const sectionEl = document.getElementById(sectionId);
    if (!sectionEl) return;

    const isHidden = sectionEl.classList.contains('hidden');
    
    // すべてのセクションを一旦閉じる
    ['pillarSection1', 'pillarSection2', 'pillarSection3'].forEach((id, idx) => {
        const el = document.getElementById(id);
        const arrow = document.getElementById(`pillarArrow${idx + 1}`);
        if (el) el.classList.add('hidden');
        if (arrow) arrow.textContent = '▿';
    });

    // クリックされたセクションが閉じていた場合は開く
    if (isHidden) {
        sectionEl.classList.remove('hidden');
        const num = sectionId.replace('pillarSection', '');
        const arrow = document.getElementById(`pillarArrow${num}`);
        if (arrow) arrow.textContent = '▴';
    }
}

function openAuthorSelectModal() {
    const listEl = document.getElementById('authorSelectList');
    if (!listEl) return;
    listEl.innerHTML = '';

    // すべてのアコーディオンを閉じた状態にする
    ['pillarSection1', 'pillarSection2', 'pillarSection3'].forEach((id, idx) => {
        const el = document.getElementById(id);
        const arrow = document.getElementById(`pillarArrow${idx + 1}`);
        if (el) el.classList.add('hidden');
        if (arrow) arrow.textContent = '▿';
    });

    const myName = userSettings.authorName || '風月';
    
    // 作者ごとの句数を集計
    const authorCounts = {};
    let totalCount = 0;
    haikuHistory.forEach(h => {
        if (h.status === currentReadTab) {
            const a = h.author || myName;
            authorCounts[a] = (authorCounts[a] || 0) + 1;
            totalCount++;
        }
    });

    const isMyActive = (currentAuthorFilter === null || currentAuthorFilter === myName);
    const isAllActive = (currentAuthorFilter === 'ALL');

    // 1. 自分の句帳
    const myItem = document.createElement('div');
    myItem.className = `author-select-item ${isMyActive ? 'active' : ''}`;
    myItem.onclick = () => selectAuthorFilter(null);
    myItem.innerHTML = `<span>${escapeHtml(myName)} 句帳（自作）</span><span class="author-count-badge">${authorCounts[myName] || 0}句</span>`;
    listEl.appendChild(myItem);

    // 2. すべての作品
    const allItem = document.createElement('div');
    allItem.className = `author-select-item ${isAllActive ? 'active' : ''}`;
    allItem.onclick = () => selectAuthorFilter('ALL');
    allItem.innerHTML = `<span>全句帳（すべての作者）</span><span class="author-count-badge">${totalCount}句</span>`;
    listEl.appendChild(allItem);

    // 3. 他の作者一覧（句集）
    const otherAuthors = Object.keys(authorCounts).filter(a => a !== myName).sort();
    if (otherAuthors.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'settings-divider';
        divider.style.margin = '6px 0';
        listEl.appendChild(divider);

        otherAuthors.forEach(author => {
            const item = document.createElement('div');
            item.className = `author-select-item ${currentAuthorFilter === author ? 'active' : ''}`;
            item.onclick = () => selectAuthorFilter(author);
            item.innerHTML = `<span>${escapeHtml(author)} 句集</span><span class="author-count-badge">${authorCounts[author]}句</span>`;
            listEl.appendChild(item);
        });
    }

    document.getElementById('authorSelectModal').classList.remove('hidden');
}

function closeAuthorSelectModal() {
    document.getElementById('authorSelectModal').classList.add('hidden');
}

function selectAuthorFilter(author) {
    currentAuthorFilter = author;
    updateHeaderTitle();
    closeAuthorSelectModal();
    renderYomuList();
}

// ========================================================
// 🌸 季寄せ・歳時記 大画面（マイ歳時記ハイブリッド）
// ========================================================
function openSaijikiScreenFromMenu() {
    closeAuthorSelectModal();
    document.querySelectorAll('.step-screen').forEach(el => el.classList.remove('active'));
    document.getElementById('saijikiScreen').classList.add('active');
    updateCatVisibility(false);
    switchSaijikiSeason(currentSaijikiSeason || 'haru');
}

function switchSaijikiSeason(season) {
    currentSaijikiSeason = season;
    
    // タブのactive切り替え（春、夏、秋、冬、新年）
    const tabs = ['haru', 'natsu', 'aki', 'huyu', 'shinnen'];
    tabs.forEach(s => {
        const cap = s.charAt(0).toUpperCase() + s.slice(1);
        const tabEl = document.getElementById(`stab${cap}`);
        if (tabEl) tabEl.classList.toggle('active', s === season);
    });

    renderSaijikiKigoList();
}

function expandSaijikiSearchInput() {
    const wrapper = document.getElementById('saijikiSearchWrapper');
    const input = document.getElementById('saijikiSearchInput');
    if (wrapper && input) { wrapper.classList.add('expanded'); input.focus(); }
}

function collapseSaijikiSearchIfEmpty() {
    const wrapper = document.getElementById('saijikiSearchWrapper');
    const input = document.getElementById('saijikiSearchInput');
    if (wrapper && input && input.value.trim() === '') wrapper.classList.remove('expanded');
}

function onSaijikiSearchChanged() {
    const input = document.getElementById('saijikiSearchInput');
    const clearBtn = document.getElementById('clearSaijikiSearchBtn');
    if (clearBtn && input) clearBtn.classList.toggle('hidden', input.value.trim() === '');
    renderSaijikiKigoList();
}

function clearSaijikiSearch(event) {
    if (event) event.stopPropagation();
    const input = document.getElementById('saijikiSearchInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('clearSaijikiSearchBtn');
    if (clearBtn) clearBtn.classList.add('hidden');
    collapseSaijikiSearchIfEmpty();
    renderSaijikiKigoList();
}

// 季寄せ季語一覧の描画（右から左へ並ぶ縦書きリスト ＋ 句数バッジ）
function renderSaijikiKigoList() {
    const container = document.getElementById('saijikiKigoList');
    if (!container) return;
    container.innerHTML = '';

    const query = document.getElementById('saijikiSearchInput') ? document.getElementById('saijikiSearchInput').value.trim().toLowerCase() : '';

    // 1. 作品データベースから季語ごとの句数を集計
    const kigoWorkMap = new Map();
    haikuHistory.forEach(h => {
        if (h.status === '完成句') {
            const p = h.parentKigo || h.kigo;
            if (p) {
                if (!kigoWorkMap.has(p)) kigoWorkMap.set(p, []);
                kigoWorkMap.get(p).push(h);
            }
        }
    });

    // 2. 現在の季節のユニークな親季語を抽出
    const parentMap = new Map();
    saijikiDatabase.forEach(item => {
        const s = (item.season || '').toLowerCase();
        const isSeasonMatch = (query !== '') ? true : (s === currentSaijikiSeason);
        
        if (isSeasonMatch) {
            const p = item.parentKigo || item.kigo;
            if (p && !parentMap.has(p)) {
                parentMap.set(p, {
                    parentKigo: p,
                    parentKana: item.parentKana || '',
                    season: item.season || '',
                    detailSeason: item.detailSeason || '',
                    desc: item.desc || '',
                    children: new Set()
                });
            }
            if (p && parentMap.has(p) && item.kigo && item.kigo !== p) {
                parentMap.get(p).children.add(item.kigo);
            }
        }
    });

    // 3. 検索フィルタリング
    let parents = Array.from(parentMap.values());
    if (query !== '') {
        parents = parents.filter(p => {
            if (p.parentKigo.toLowerCase().includes(query)) return true;
            if (p.parentKana.toLowerCase().includes(query)) return true;
            for (const child of p.children) {
                if (child.toLowerCase().includes(query)) return true;
            }
            return false;
        });
    }

    if (parents.length === 0) {
        container.innerHTML = '<div style="writing-mode: vertical-rl; color: #888; font-size: 0.95rem; margin: auto; letter-spacing: 0.2em;">該当する季語がありません</div>';
        return;
    }

    // 4. 縦書き要素の生成
    parents.forEach(pData => {
        const works = kigoWorkMap.get(pData.parentKigo) || [];
        const workCount = works.length;

        const itemEl = document.createElement('div');
        itemEl.className = 'saijiki-kigo-item';
        itemEl.onclick = () => openKigoCard(pData.parentKigo);

        let rubyHtml = escapeHtml(pData.parentKigo);
        if (pData.parentKana && pData.parentKana !== pData.parentKigo) {
            rubyHtml = `<ruby>${escapeHtml(pData.parentKigo)}<rt>${escapeHtml(pData.parentKana)}</rt></ruby>`;
        }

        let badgeHtml = '';
        if (workCount > 0) {
            const countStr = toKanjiNum(String(workCount));
            badgeHtml = `<span class="kigo-count-badge">${countStr}</span>`;
        }

        itemEl.innerHTML = `
            <div class="saijiki-kigo-text">${rubyHtml}</div>
            ${badgeHtml}
        `;

        container.appendChild(itemEl);
    });
}

// ========================================================
// 🌸 季語解説ポップアップカード（うてなモデル＋マイ歳時記）
// ========================================================
function openKigoCard(parentKigoName, fromContext = null) {
    const overlay = document.getElementById('kigoCardOverlay');
    if (!overlay) return;

    // 季語データの特定
    const items = saijikiDatabase.filter(it => (it.parentKigo === parentKigoName || it.kigo === parentKigoName));
    if (items.length === 0) return;

    const baseItem = items[0];
    const parentKana = baseItem.parentKana || '';
    const detailSeason = baseItem.detailSeason || '';
    const desc = baseItem.desc || '解説はありません。';

    // 傍題（子季語）一覧
    const childSet = new Set();
    items.forEach(it => {
        if (it.kigo && it.kigo !== parentKigoName) {
            childSet.add(it.kigo);
        }
    });
    const childList = Array.from(childSet);

    // 自作句・登録句の取得
    const works = haikuHistory.filter(h => h.status === '完成句' && (h.parentKigo === parentKigoName || h.kigo === parentKigoName));

    // 1. 親季語カラム
    const parentCol = document.getElementById('cardParentKigo');
    let rubyHtml = escapeHtml(parentKigoName);
    if (parentKana && parentKana !== parentKigoName) {
        rubyHtml = `<ruby>${escapeHtml(parentKigoName)}<rt>${escapeHtml(parentKana)}</rt></ruby>`;
    }
    parentCol.innerHTML = `
        <div>${rubyHtml}</div>
        ${detailSeason ? `<div class="parent-kigo-season">${escapeHtml(detailSeason)}</div>` : ''}
    `;

    // 2. 傍題カラム
    const childCol = document.getElementById('cardChildKigo');
    if (childList.length > 0) {
        childCol.innerHTML = `
            <div class="child-kigo-title">【傍題・子季語】</div>
            <div>${childList.map(c => escapeHtml(c)).join('、 ')}</div>
        `;
        childCol.style.display = 'flex';
    } else {
        childCol.innerHTML = '';
        childCol.style.display = 'none';
    }

    // 3. 解説カラム
    const descCol = document.getElementById('cardDesc');
    descCol.innerHTML = `<div>${escapeHtml(desc)}</div>`;

    // 4. アクション / 自作句カラム（右から左へ1句ずつ並ぶ純粋な横スクロール）
    const worksCol = document.getElementById('cardWorks');
    let worksHtml = '';

    if (fromContext === 'step1') {
        // 作句中（ステップ1）から開いた場合：この季語を入力ボタンを表示
        worksHtml += `
            <div class="kigo-work-single-col" style="display: flex; align-items: center; justify-content: center;">
                <div class="kigo-insert-action" onclick="insertKigoToInput('${escapeHtml(parentKigoName)}')">
                    この季語を入力 ➔
                </div>
            </div>
        `;
        if (works.length > 0) {
            works.forEach(w => {
                const author = w.author || (userSettings.authorName || '風月');
                worksHtml += `
                    <div class="kigo-work-single-col">
                        ${escapeHtml(w.phrase)}　<span class="kigo-work-author">${escapeHtml(author)}</span>
                    </div>
                `;
            });
        }
        worksCol.innerHTML = worksHtml;
        worksCol.style.display = 'flex';
    } else {
        // 季寄せ画面から開いた場合
        if (works.length > 0) {
            works.forEach(w => {
                const author = w.author || (userSettings.authorName || '風月');
                worksHtml += `
                    <div class="kigo-work-single-col">
                        ${escapeHtml(w.phrase)}　<span class="kigo-work-author">${escapeHtml(author)}</span>
                    </div>
                `;
            });
            worksCol.innerHTML = worksHtml;
            worksCol.style.display = 'flex';
        } else {
            worksCol.innerHTML = `
                <div class="kigo-compose-action" onclick="composeWithKigo('${escapeHtml(parentKigoName)}')">
                    この季語で詠む ➔
                </div>
            `;
            worksCol.style.display = 'flex';
        }
    }

    overlay.classList.remove('hidden');
}

function closeKigoCard() {
    const overlay = document.getElementById('kigoCardOverlay');
    if (overlay) overlay.classList.add('hidden');
}

function composeWithKigo(kigoName) {
    closeKigoCard();
    startEmuMode();
    const input = document.getElementById('inputPhrase');
    if (input) {
        input.value = kigoName;
        currentHaikuData.phrase = kigoName;
        currentHaikuData.kigo = kigoName;
        currentHaikuData.parentKigo = kigoName;
        input.focus();
    }
}

// ========================================================
// 🖋️ 【詠む】ステップ1 季寄せスマートトレイ
// ========================================================
function toggleStep1SaijikiTray() {
    const tray = document.getElementById('step1SaijikiTray');
    const icon = document.getElementById('step1TrayIcon');
    if (!tray) return;

    const isHidden = tray.classList.contains('hidden');
    tray.classList.toggle('hidden', !isHidden);
    if (icon) icon.textContent = isHidden ? '▴' : '▿';

    if (isHidden) {
        renderStep1KigoList();
    }
}

function switchStep1Season(season) {
    currentStep1Season = season;
    const tabs = ['haru', 'natsu', 'aki', 'huyu', 'shinnen'];
    tabs.forEach(s => {
        const cap = s.charAt(0).toUpperCase() + s.slice(1);
        const tabEl = document.getElementById(`sttab${cap}`);
        if (tabEl) tabEl.classList.toggle('active', s === season);
    });
    renderStep1KigoList();
}

function expandStep1SearchInput() {
    const wrapper = document.getElementById('step1SearchWrapper');
    const input = document.getElementById('step1SearchInput');
    if (wrapper && input) { wrapper.classList.add('expanded'); input.focus(); }
}

function collapseStep1SearchIfEmpty() {
    const wrapper = document.getElementById('step1SearchWrapper');
    const input = document.getElementById('step1SearchInput');
    if (wrapper && input && input.value.trim() === '') wrapper.classList.remove('expanded');
}

function onStep1SearchChanged() {
    const input = document.getElementById('step1SearchInput');
    const clearBtn = document.getElementById('clearStep1SearchBtn');
    if (clearBtn && input) clearBtn.classList.toggle('hidden', input.value.trim() === '');
    renderStep1KigoList();
}

function clearStep1Search(event) {
    if (event) event.stopPropagation();
    const input = document.getElementById('step1SearchInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('clearStep1SearchBtn');
    if (clearBtn) clearBtn.classList.add('hidden');
    collapseStep1SearchIfEmpty();
    renderStep1KigoList();
}

function renderStep1KigoList() {
    const container = document.getElementById('step1KigoList');
    if (!container) return;
    container.innerHTML = '';

    const query = document.getElementById('step1SearchInput') ? document.getElementById('step1SearchInput').value.trim().toLowerCase() : '';

    const parentMap = new Map();
    saijikiDatabase.forEach(item => {
        const s = (item.season || '').toLowerCase();
        const isSeasonMatch = (query !== '') ? true : (s === currentStep1Season);
        
        if (isSeasonMatch) {
            const p = item.parentKigo || item.kigo;
            if (p && !parentMap.has(p)) {
                parentMap.set(p, {
                    parentKigo: p,
                    parentKana: item.parentKana || '',
                    season: item.season || '',
                    detailSeason: item.detailSeason || '',
                    children: new Set()
                });
            }
            if (p && parentMap.has(p) && item.kigo && item.kigo !== p) {
                parentMap.get(p).children.add(item.kigo);
            }
        }
    });

    let parents = Array.from(parentMap.values());
    if (query !== '') {
        parents = parents.filter(p => {
            if (p.parentKigo.toLowerCase().includes(query)) return true;
            if (p.parentKana.toLowerCase().includes(query)) return true;
            for (const child of p.children) {
                if (child.toLowerCase().includes(query)) return true;
            }
            return false;
        });
    }

    if (parents.length === 0) {
        container.innerHTML = '<div style="writing-mode: vertical-rl; color: #888; font-size: 0.88rem; margin: auto; letter-spacing: 0.2em;">該当する季語がありません</div>';
        return;
    }

    parents.forEach(pData => {
        const itemEl = document.createElement('div');
        const len = (pData.parentKigo || '').length;
        let extraClass = '';
        if (len >= 8) extraClass = ' extra-long-kigo';
        else if (len >= 6) extraClass = ' long-kigo';

        itemEl.className = `step1-kigo-item${extraClass}`;
        // タップで季語カードを開く（step1コンテキスト）
        itemEl.onclick = () => openKigoCard(pData.parentKigo, 'step1');
        itemEl.textContent = pData.parentKigo;
        container.appendChild(itemEl);
    });
}

// カーソル位置へ季語をスマート挿入
function insertKigoToInput(kigoText) {
    closeKigoCard();

    const input = document.getElementById('inputPhrase');
    if (!input) return;

    const val = input.value;
    const start = input.selectionStart !== null ? input.selectionStart : val.length;
    const end = input.selectionEnd !== null ? input.selectionEnd : val.length;

    // カーソル位置（または選択範囲）に挿入
    const newVal = val.substring(0, start) + kigoText + val.substring(end);
    input.value = newVal;

    // カーソルを挿入した季語の直後に設定
    const newPos = start + kigoText.length;
    input.setSelectionRange(newPos, newPos);

    // トレイを閉じる
    const tray = document.getElementById('step1SaijikiTray');
    const icon = document.getElementById('step1TrayIcon');
    if (tray) tray.classList.add('hidden');
    if (icon) icon.textContent = '▿';

    input.focus();
}


// ========================================================
// 🖨️ 句集の小冊子印刷・PDF出力（A4横・真ん中折り・右綴じレイアウト）
// ========================================================
function printSelectedBooklet() {
    const myName = userSettings.authorName || '風月';
    const targetAuthor = (currentAuthorFilter === null) ? myName : currentAuthorFilter;
    
    // 対象となる完成句を取得
    const targetHaikus = haikuHistory.filter(h => {
        if (h.status !== '完成句') return false;
        if (targetAuthor === 'ALL') return true;
        const a = h.author || myName;
        return a === targetAuthor;
    });

    if (targetHaikus.length === 0) {
        alert('印刷できる完成句がありません。');
        return;
    }

    // 1ページ（半面）の句数
    const selectEl = document.getElementById('printLinesPerPage');
    const linesPerPage = selectEl ? (parseInt(selectEl.value, 10) || 3) : 3;

    // 表紙タイトル（「作者の名前＋句集」のみ）
    const bookletTitle = (targetAuthor === 'ALL') ? '全句集' : `${targetAuthor} 句集`;

    // 既存の印刷用iframeがあれば削除
    let printIframe = document.getElementById('fugetsu_print_iframe');
    if (printIframe) printIframe.remove();

    // 親画面のDOMやCSSの干渉を100%遮断する独立iframeを生成
    printIframe = document.createElement('iframe');
    printIframe.id = 'fugetsu_print_iframe';
    printIframe.style.position = 'fixed';
    printIframe.style.top = '-9999px';
    printIframe.style.left = '-9999px';
    printIframe.style.width = '0px';
    printIframe.style.height = '0px';
    printIframe.style.border = 'none';
    document.body.appendChild(printIframe);

    const doc = printIframe.contentWindow.document;
    doc.open();

    // 俳句を半面ページ（A5縦相当）ごとに分割
    const halfPages = [];
    for (let i = 0; i < targetHaikus.length; i += linesPerPage) {
        halfPages.push(targetHaikus.slice(i, i + linesPerPage));
    }

    let sheetsHtml = '';

    // Sheet 1: 表紙シート（A4横・右半分が表紙、左半分が余白）
    sheetsHtml += `
        <div class="print-sheet">
            <div class="sheet-half sheet-left"></div>
            <div class="sheet-divider"></div>
            <div class="sheet-half sheet-right cover-half">
                <div class="print-cover-title">${escapeHtml(bookletTitle)}</div>
            </div>
        </div>
    `;

    // Sheet 2以降: 本文シート（A4横・左右見開き、右から左へ流れる）
    for (let i = 0; i < halfPages.length; i += 2) {
        const rightHaikus = halfPages[i];
        const leftHaikus = halfPages[i + 1] || null;

        const rightLinesHtml = rightHaikus.map(h => `<div class="print-phrase-line">${escapeHtml(h.phrase)}</div>`).join('');
        const leftLinesHtml = leftHaikus ? leftHaikus.map(h => `<div class="print-phrase-line">${escapeHtml(h.phrase)}</div>`).join('') : '';

        sheetsHtml += `
            <div class="print-sheet">
                <div class="sheet-half sheet-left">
                    ${leftLinesHtml}
                </div>
                <div class="sheet-divider"></div>
                <div class="sheet-half sheet-right">
                    ${rightLinesHtml}
                </div>
            </div>
        `;
    }

    doc.write(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <title>${escapeHtml(bookletTitle)}</title>
            <style>
                @page {
                    size: A4 landscape;
                    margin: 12mm 15mm;
                }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    background: #ffffff;
                    color: #000000;
                    font-family: "游明朝", "Yu Mincho", "ヒラギノ明朝 ProN", "Hiragino Mincho ProN", "Shippori Mincho", "MS P明朝", serif;
                }
                /* A4横 1枚のシート */
                .print-sheet {
                    width: 100%;
                    height: 95vh;
                    page-break-after: always;
                    break-after: page;
                    page-break-inside: avoid;
                    break-inside: avoid;
                    display: flex;
                    flex-direction: row;
                    align-items: stretch;
                    box-sizing: border-box;
                }
                .print-sheet:last-child {
                    page-break-after: auto;
                    break-after: auto;
                }
                /* 左右の半面（各A5縦相当） */
                .sheet-half {
                    flex: 1;
                    height: 100%;
                    display: flex;
                    flex-direction: row-reverse !important;
                    justify-content: space-around !important;
                    align-items: center !important;
                    padding: 8mm 12mm;
                    box-sizing: border-box;
                }
                /* 折り目のセンター線（極めて薄い目印） */
                .sheet-divider {
                    width: 1px;
                    height: 100%;
                    border-left: 1px dashed #dcd9d0;
                }
                /* 表紙半面 */
                .cover-half {
                    justify-content: center !important;
                    align-items: center !important;
                    text-align: center;
                }
                .print-cover-title {
                    writing-mode: vertical-rl;
                    -webkit-writing-mode: vertical-rl;
                    font-size: 32pt;
                    letter-spacing: 0.35em;
                    font-weight: 500;
                    line-height: 1.5;
                    margin: auto;
                }
                /* 縦書き俳句 */
                .print-phrase-line {
                    writing-mode: vertical-rl;
                    -webkit-writing-mode: vertical-rl;
                    font-size: 18pt;
                    letter-spacing: 0.28em;
                    line-height: 1.4;
                    white-space: nowrap;
                    height: auto;
                    max-height: 75vh;
                    display: block;
                    margin: 0 auto;
                }
            </style>
        </head>
        <body>
            ${sheetsHtml}
        </body>
        </html>
    `);
    doc.close();

    // 描画待機後に印刷プレビューを呼び出し
    setTimeout(() => {
        printIframe.contentWindow.focus();
        printIframe.contentWindow.print();
        closeAuthorSelectModal();
    }, 250);
}

// ========================================================
// 設定 & プロフィール機能（三本柱アコーディオン）
// ========================================================
function toggleSettingsAccordion(sectionId) {
    const sectionEl = document.getElementById(sectionId);
    if (!sectionEl) return;

    const isHidden = sectionEl.classList.contains('hidden');
    
    // すべてのセクションを一旦閉じる
    ['settingSection1', 'settingSection2', 'settingSection3'].forEach((id, idx) => {
        const el = document.getElementById(id);
        const arrow = document.getElementById(`settingArrow${idx + 1}`);
        if (el) el.classList.add('hidden');
        if (arrow) arrow.textContent = '▿';
    });

    // クリックされたセクションが閉じていた場合は開く
    if (isHidden) {
        sectionEl.classList.remove('hidden');
        const num = sectionId.replace('settingSection', '');
        const arrow = document.getElementById(`settingArrow${num}`);
        if (arrow) arrow.textContent = '▴';
    }
}

function openSettingsModal() {
    // すべてのアコーディオンを閉じた状態にする
    ['settingSection1', 'settingSection2', 'settingSection3'].forEach((id, idx) => {
        const el = document.getElementById(id);
        const arrow = document.getElementById(`settingArrow${idx + 1}`);
        if (el) el.classList.add('hidden');
        if (arrow) arrow.textContent = '▿';
    });

    document.getElementById('settingAuthorName').value = userSettings.authorName || '';
    document.getElementById('settingAuthorKana').value = userSettings.authorKana || '';
    
    const startupChk = document.getElementById('settingStartupOmikuji');
    if (startupChk) startupChk.checked = !!userSettings.startupOmikuji;
    
    const hideHomeKiyoseChk = document.getElementById('settingHideHomeKiyose');
    if (hideHomeKiyoseChk) hideHomeKiyoseChk.checked = !!userSettings.hideHomeKiyose;

    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

function onSettingCheckboxChanged() {
    const startupChk = document.getElementById('settingStartupOmikuji');
    const hideHomeKiyoseChk = document.getElementById('settingHideHomeKiyose');

    if (startupChk) userSettings.startupOmikuji = startupChk.checked;
    if (hideHomeKiyoseChk) userSettings.hideHomeKiyose = hideHomeKiyoseChk.checked;

    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    applyUserSettingsToUI();
}

function saveAuthorSettings() {
    const name = document.getElementById('settingAuthorName').value.trim() || '風月';
    const kana = document.getElementById('settingAuthorKana').value.trim() || 'ふうげつ';
    userSettings.authorName = name;
    userSettings.authorKana = kana;
    userSettings.initialized = true;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    applyUserSettingsToUI();
    closeSettingsModal();
    alert('設定を保存しました。');
}

function completeWelcomeSetup() {
    const name = document.getElementById('welcomeAuthorName').value.trim() || '風月';
    const kana = document.getElementById('welcomeAuthorKana').value.trim() || 'ふうげつ';
    userSettings.authorName = name;
    userSettings.authorKana = kana;
    userSettings.initialized = true;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    updateHeaderTitle();
    document.getElementById('welcomeModal').classList.add('hidden');
}

// ========================================================
// 暦・行事詳細モーダル
// ========================================================
function openKoyomiDetailModal() {
    const todayStr = getTodayDateString();
    const todayData = koyomiDatabase[todayStr];
    if (!todayData) return;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const date = today.getDate();
    const eraYear = year - 2018; 
    const eraStr = eraYear === 1 ? "元" : toKanjiNum(eraYear.toString());
    const wafuList = ['睦月','如月','弥生','卯月','皐月','水無月','文月','葉月','長月','神無月','霜月','師走'];

    document.getElementById('koyomiModalDate').textContent = `令和${eraStr}年 ${toKanjiNum(month)}月${toKanjiNum(date)}日（${wafuList[month - 1]}）`;
    
    let subParts = [];
    if (todayData.lunar) subParts.push(todayData.lunar);
    
    let currentSekki = todayData.sekki || '';
    let currentKou = todayData.kou || '';
    let currentKouYomi = todayData.kou_yomi || '';
    if (!currentSekki || !currentKou) {
        const dateKeys = Object.keys(koyomiDatabase).sort();
        const curIdx = dateKeys.indexOf(todayStr);
        if (curIdx !== -1) {
            for (let i = curIdx; i >= 0; i--) {
                const d = koyomiDatabase[dateKeys[i]];
                if (!currentSekki && d.sekki) currentSekki = d.sekki;
                if (!currentKou && d.kou) {
                    currentKou = d.kou;
                    currentKouYomi = d.kou_yomi || '';
                }
                if (currentSekki && currentKou) break;
            }
        }
    }

    if (currentSekki) subParts.push(`節気: ${currentSekki}`);
    if (currentKou) subParts.push(`候: ${currentKou}${currentKouYomi ? `（${currentKouYomi}）` : ''}`);
    document.getElementById('koyomiModalSub').textContent = subParts.join(' ｜ ');

    const listEl = document.getElementById('koyomiModalList');
    listEl.innerHTML = '';

    const addSection = (title, items, isHoliday = false) => {
        if (!items || items.length === 0) return;
        const sec = document.createElement('div');
        sec.innerHTML = `<div class="koyomi-section-title">${escapeHtml(title)}</div>`;
        const tags = document.createElement('div');
        tags.className = 'koyomi-event-tags';
        items.forEach(text => {
            const t = document.createElement('span');
            t.className = isHoliday ? 'koyomi-event-tag holiday' : 'koyomi-event-tag';
            t.textContent = text;
            tags.appendChild(t);
        });
        sec.appendChild(tags);
        listEl.appendChild(sec);
    };

    // 1. 祝日・雑節
    let hList = [];
    if (todayData.holiday) hList.push(todayData.holiday);
    if (todayData.zassetsu) hList.push(todayData.zassetsu);
    addSection('祝日・雑節', hList, !!todayData.holiday);

    // 2. 重要年中行事
    if (todayData.important) addSection('重要年中行事', todayData.important);

    // 3. 神事
    if (todayData.jinja) addSection('神事・神社祭礼', todayData.jinja);

    // 4. 仏事
    if (todayData.tera) addSection('仏事・寺院法要', todayData.tera);

    // 5. 教会行事
    if (todayData.church) addSection('教会行事', todayData.church);

    // 6. その他・文学忌・伝統行事
    if (todayData.other) addSection('伝統行事・文学忌・その他', todayData.other);

    document.getElementById('koyomiDetailModal').classList.remove('hidden');
}

function closeKoyomiDetailModal() {
    document.getElementById('koyomiDetailModal').classList.add('hidden');
}

// ========================================================
// バックアップ & 復元機能 (JSON)
// ========================================================
function exportHaikuData() {
    const exportData = {
        app: '風月',
        version: '2.0',
        exportedAt: new Date().toISOString(),
        settings: userSettings,
        haikus: haikuHistory
    };
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `fugetsu_backup_${getTodayDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function triggerImportFileInput() {
    document.getElementById('importFileInput').click();
}

function importHaikuData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data && Array.isArray(data.haikus)) {
                if (confirm(`句帳データ（${data.haikus.length}句）を読み込みますか？\n（現在の句帳に追加・統合されます）`)) {
                    const existingPhrases = new Set(haikuHistory.map(h => h.phrase));
                    let addedCount = 0;
                    data.haikus.forEach(item => {
                        if (!existingPhrases.has(item.phrase)) {
                            haikuHistory.push(item);
                            existingPhrases.add(item.phrase);
                            addedCount++;
                        }
                    });
                    saveLocalHaikus();
                    if (data.settings && data.settings.authorName) {
                        userSettings = Object.assign(userSettings, data.settings);
                        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
                        updateHeaderTitle();
                    }
                    alert(`バックアップから ${addedCount} 句を復元しました！`);
                    closeSettingsModal();
                    if (document.getElementById('readScreen').classList.contains('active')) {
                        renderYomuList();
                    }
                }
            } else {
                alert('無効なバックアップファイルです。');
            }
        } catch (err) {
            alert('ファイルの読み込みに失敗しました。');
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ========================================================
// 画面遷移 & 基本操作
// ========================================================
function updateCatVisibility(show) {
    const cat = document.getElementById('fixedCatBtn');
    if (cat) cat.classList.toggle('hidden', !show);
}

function goToStartScreen() {
    updateCatVisibility(false);
    document.querySelectorAll('.step-screen').forEach(el => el.classList.remove('active'));
    document.getElementById('startScreen').classList.add('active');
}

function startEmuMode() {
    updateCatVisibility(false);
    editingHaikuObj = null;
    currentHaikuData.oldPhrase = ''; 
    document.getElementById('inputPhrase').value = '';
    document.getElementById('authorInput').value = userSettings.authorName || '風月';
    document.getElementById('authorKanaInput').value = userSettings.authorKana || 'ふうげつ';
    setTodaySakkuDate();
    hideAuthorSuggestions();
    goToStep(1);
    const input = document.getElementById('inputPhrase');
    if (input) input.focus();
}

function cancelEmuMode() {
    hideAuthorSuggestions();
    if (editingHaikuObj) startYomuMode(); else goToStartScreen();
}

function startYomuMode() {
    updateHeaderTitle();
    renderYomuList();
    document.querySelectorAll('.step-screen').forEach(el => el.classList.remove('active'));
    document.getElementById('readScreen').classList.add('active');
    updateCatVisibility(true);
}

function switchReadTab(status) {
    currentReadTab = status;
    document.getElementById('tabKansei').classList.toggle('active', status === '完成句');
    document.getElementById('tabShitagaki').classList.toggle('active', status === '下書き');
    renderYomuList();
}

function expandSearchInput() {
    const wrapper = document.getElementById('searchWrapper');
    const input = document.getElementById('kigoFilterInput');
    if (wrapper && input) { wrapper.classList.add('expanded'); input.focus(); }
}

function collapseSearchIfEmpty() {
    const wrapper = document.getElementById('searchWrapper');
    const input = document.getElementById('kigoFilterInput');
    if (wrapper && input && input.value.trim() === '') wrapper.classList.remove('expanded');
}

function onKigoFilterInputChanged() {
    const clearBtn = document.getElementById('clearKigoFilterBtn');
    if (clearBtn) clearBtn.classList.toggle('hidden', document.getElementById('kigoFilterInput').value.trim() === '');
    renderYomuList();
}

function clearKigoFilter(event) {
    if (event) event.stopPropagation();
    const input = document.getElementById('kigoFilterInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('clearKigoFilterBtn');
    if (clearBtn) clearBtn.classList.add('hidden');
    collapseSearchIfEmpty();
    renderYomuList();
}

// ========================================================
// 句帳一覧の描画（作者フィルタ対応 & 安全なDOM構築）
// ========================================================
function renderYomuList() {
    const container = document.getElementById('readHaikuList');
    if (!container) return;
    container.innerHTML = '';

    const filterQuery = document.getElementById('kigoFilterInput') ? document.getElementById('kigoFilterInput').value.trim().toLowerCase() : '';
    const myName = userSettings.authorName || '風月';

    const targetHaikus = haikuHistory.filter(h => {
        if (h.status !== currentReadTab) return false;
        
        // 作者フィルタリング
        const haikuAuthor = h.author || myName;
        if (currentAuthorFilter === null) {
            if (haikuAuthor !== myName) return false; // 自分の句帳のみ
        } else if (currentAuthorFilter !== 'ALL') {
            if (haikuAuthor !== currentAuthorFilter) return false; // 特定作者のみ
        }

        // キーワード（文字列）横断検索（本文・季語・作者名・季節・日付）
        if (filterQuery !== '') {
            const seasonJaMap = {'haru':'春', 'natsu':'夏', 'aki':'秋', 'huyu':'冬', 'shinnen':'新年', 'muki':'無季'};
            const seasonText = (seasonJaMap[h.season] || '') + ' ' + (h.detailSeason || '');
            const searchableText = [
                h.phrase || '',
                h.kigo || '',
                h.parentKigo || '',
                h.parentKana || '',
                h.author || '',
                h.authorKana || '',
                seasonText,
                h.sakkuDate || ''
            ].join(' ').toLowerCase();

            // スペース区切りの複数キーワード（AND検索）に対応
            const queryWords = filterQuery.split(/\s+/).filter(Boolean);
            return queryWords.every(word => searchableText.includes(word));
        }
        return true;
    });

    if (targetHaikus.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#888; margin:auto; font-size:0.9rem;">該当する${currentReadTab}はありません。</div>`;
        return;
    }

    targetHaikus.forEach(item => item._parsedDate = parseDateLabel(item.sakkuDate));

    targetHaikus.sort((a, b) => {
        if (a._parsedDate.groupKey !== b._parsedDate.groupKey) {
            return b._parsedDate.groupKey.localeCompare(a._parsedDate.groupKey); 
        }
        if (a._parsedDate.exactKey !== b._parsedDate.exactKey) {
            return b._parsedDate.exactKey.localeCompare(a._parsedDate.exactKey); 
        }
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    let lastGroupKey = '';
    targetHaikus.forEach(item => {
        if (item._parsedDate.groupKey !== lastGroupKey) {
            lastGroupKey = item._parsedDate.groupKey;
            const divider = document.createElement('div');
            divider.className = 'date-divider-card';
            divider.textContent = item._parsedDate.label;
            container.appendChild(divider);
        }
        const card = document.createElement('div');
        card.className = 'saijiki-haiku-card';
        card.onclick = () => window.onHaikuCardClicked(item); 
        
        const phraseDiv = document.createElement('div');
        phraseDiv.className = 'saijiki-phrase';
        phraseDiv.textContent = item.phrase;
        card.appendChild(phraseDiv);
        
        container.appendChild(card);
    });

    requestAnimationFrame(() => { container.scrollLeft = container.scrollWidth; });
}

window.onHaikuCardClicked = function(haikuObj) {
    activeSelectedHaiku = haikuObj;
    document.getElementById('modalPhrase').textContent = haikuObj.phrase;
    const actionsContainer = document.getElementById('modalActions');

    if (haikuObj.status === '完成句') {
        actionsContainer.innerHTML = `
            <span class="text-action-btn primary" onclick="editSelectedHaiku()">修正</span>
            <span class="action-divider">|</span>
            <span class="text-action-btn" onclick="changeHaikuStatus('下書き')">下書きへ</span>
        `;
    } else {
        actionsContainer.innerHTML = `
            <span class="text-action-btn primary" onclick="changeHaikuStatus('完成句')">完成句へ</span>
            <span class="action-divider">|</span>
            <span class="text-action-btn" onclick="editSelectedHaiku()">修正</span>
            <span class="action-divider">|</span>
            <span class="text-action-btn danger" onclick="deleteSelectedDraft()">削除</span>
        `;
    }
    document.getElementById('haikuDetailModal').classList.remove('hidden');
};

function closeHaikuDetailModal() { document.getElementById('haikuDetailModal').classList.add('hidden'); }

function changeHaikuStatus(targetStatus) {
    if (!activeSelectedHaiku) return;
    closeHaikuDetailModal();

    const idx = haikuHistory.findIndex(h => h.phrase === activeSelectedHaiku.phrase);
    if (idx !== -1) {
        haikuHistory[idx].status = targetStatus;
        saveLocalHaikus();
    }
    if (document.getElementById('readScreen').classList.contains('active')) renderYomuList();
}

function deleteSelectedDraft() {
    if (!activeSelectedHaiku) return;
    if (!confirm('本当に削除しますか？\n（句帳から完全に消去されます）')) return;
    closeHaikuDetailModal();

    haikuHistory = haikuHistory.filter(h => h.phrase !== activeSelectedHaiku.phrase);
    saveLocalHaikus();
    if (document.getElementById('readScreen').classList.contains('active')) renderYomuList();
}

// ========================================================
// 🎲 おみ句じ鑑賞（全作者均等シャッフル ＆ ブラインド鑑賞）
// ========================================================
function triggerRandomOmikuji() {
    const kanseiHaikus = haikuHistory.filter(h => h.status === '完成句');
    if (kanseiHaikus.length === 0) { alert('鑑賞できる完成句がありません。'); return; }

    const myName = userSettings.authorName || '風月';
    const authorMap = {};
    kanseiHaikus.forEach(h => {
        const a = h.author || myName;
        if (!authorMap[a]) authorMap[a] = [];
        authorMap[a].push(h);
    });

    const shuffleArray = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    Object.keys(authorMap).forEach(a => {
        shuffleArray(authorMap[a]);
    });

    omikujiPool = [];
    let hasMore = true;
    while (hasMore) {
        hasMore = false;
        const authors = shuffleArray(Object.keys(authorMap));
        authors.forEach(a => {
            if (authorMap[a].length > 0) {
                omikujiPool.push(authorMap[a].pop());
                if (authorMap[a].length > 0) hasMore = true;
            }
        });
    }

    omikujiIndex = 0;
    hideOmikujiInfo(); // 最初は答えを隠す（ブラインド）
    renderOmikujiDisplay();

    document.querySelectorAll('.step-screen').forEach(el => el.classList.remove('active'));
    document.getElementById('omikujiRoomScreen').classList.add('active');
    updateCatVisibility(true);
}

function changeOmikujiHaiku(direction) {
    if (omikujiIndex + direction >= 0 && omikujiIndex + direction < omikujiPool.length) {
        omikujiIndex += direction;
        hideOmikujiInfo(); // 次の句へ進んだら再びブラインド状態にする
        renderOmikujiDisplay();
    }
}

function renderOmikujiDisplay() {
    const cur = omikujiPool[omikujiIndex];
    document.getElementById('omikujiPhrase').textContent = cur.phrase;
    document.getElementById('prevBtn').classList.toggle('disabled', omikujiIndex === 0);
    document.getElementById('nextBtn').classList.toggle('disabled', omikujiIndex === omikujiPool.length - 1);

    // 答え合わせ用情報のセット（季語：小さめ、作者名：＋2pt）
    const seasonJa = {'haru':'春', 'natsu':'夏', 'aki':'秋', 'huyu':'冬', 'shinnen':'新年', 'muki':'無季'}[cur.season] || cur.season || '';
    const detailSeason = cur.detailSeason ? `（${cur.detailSeason}）` : (seasonJa ? `（${seasonJa}）` : '');
    const kigoText = cur.parentKigo || cur.kigo || '無季';
    
    document.getElementById('omikujiInfoKigo').textContent = `${kigoText} ${detailSeason}`;
    document.getElementById('omikujiInfoAuthor').textContent = cur.author || userSettings.authorName || '風月';
}

function toggleOmikujiInfo() {
    const box = document.getElementById('omikujiInfoBox');
    if (box) {
        box.classList.toggle('hidden');
    }
}

function hideOmikujiInfo() {
    const box = document.getElementById('omikujiInfoBox');
    if (box) {
        box.classList.add('hidden');
    }
}

function initKeyboardEvents() {
    document.addEventListener('keydown', function(e) {
        const room = document.getElementById('omikujiRoomScreen');
        if (!room || !room.classList.contains('active') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') changeOmikujiHaiku(-1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') changeOmikujiHaiku(1);
    });
}

function initSwipeEvents() {
    const room = document.getElementById('omikujiRoomScreen');
    if (!room) return;
    room.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }, { passive: true });
    room.addEventListener('touchend', e => {
        const diffX = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(e.changedTouches[0].clientY - touchStartY)) changeOmikujiHaiku(diffX > 0 ? 1 : -1);
    }, { passive: true });
}

// ========================================================
// 作句・季語検出・保存
// ========================================================
function editSelectedHaiku() {
    closeHaikuDetailModal();
    if (!activeSelectedHaiku) return;

    editingHaikuObj = activeSelectedHaiku;
    currentHaikuData.oldPhrase = activeSelectedHaiku.phrase; 
    
    document.getElementById('inputPhrase').value = activeSelectedHaiku.phrase;
    document.getElementById('kigoInput').value = activeSelectedHaiku.parentKigo || activeSelectedHaiku.kigo || '';
    if (activeSelectedHaiku.season) document.getElementById('seasonSelect').value = activeSelectedHaiku.season;
    if (activeSelectedHaiku.detailSeason) document.getElementById('detailSeasonSelect').value = activeSelectedHaiku.detailSeason;
    
    document.getElementById('authorInput').value = activeSelectedHaiku.author || userSettings.authorName || '風月';
    document.getElementById('authorKanaInput').value = activeSelectedHaiku.authorKana || userSettings.authorKana || 'ふうげつ';
    populateSakkuDateFields(activeSelectedHaiku.sakkuDate || '');

    hideAuthorSuggestions();
    goToStep(1);
}

function goToStep(stepNumber) {
    updateCatVisibility(false);
    hideAuthorSuggestions();
    document.querySelectorAll('.step-screen').forEach(el => el.classList.remove('active'));
    document.getElementById(`step${stepNumber}`).classList.add('active');
}

function goToStep2() {
    const phraseInput = document.getElementById('inputPhrase').value.trim();
    if (!phraseInput) { alert('句を入力してください。'); return; }
    currentHaikuData.phrase = phraseInput;
    detectKigo(phraseInput);
    goToStep(2);
}

function detectKigo(phrase) {
    let detected = null;
    const cleanPhrase = phrase.replace(/\s+/g, '');
    if (saijikiDatabase && saijikiDatabase.length > 0) {
        let sorted = [...saijikiDatabase].sort((a, b) => b.kigo.length - a.kigo.length);
        detected = sorted.find(item => cleanPhrase.includes(item.kigo));
    }
    const promptEl = document.getElementById('detectedKigoText');
    if (detected) {
        if (promptEl) promptEl.textContent = `${detected.kigo}`;
        document.getElementById('kigoInput').value = detected.parentKigo;
        document.getElementById('seasonSelect').value = detected.season || 'huyu';
        if (document.getElementById('detailSeasonSelect')) document.getElementById('detailSeasonSelect').value = detected.detailSeason || '';
        currentHaikuData.kigo = detected.kigo; currentHaikuData.parentKigo = detected.parentKigo; currentHaikuData.parentKana = detected.parentKana || '';
    } else {
        if (promptEl) promptEl.textContent = '見つかりませんでした';
        document.getElementById('kigoInput').value = '';
    }
}

function checkAndHokanKigoData() {
    const val = document.getElementById('kigoInput').value.trim();
    if (!val) return;
    let hit = saijikiDatabase.find(item => item.kigo === val || item.parentKigo === val);
    if (hit) {
        if (hit.season) document.getElementById('seasonSelect').value = hit.season;
        if (hit.detailSeason) document.getElementById('detailSeasonSelect').value = hit.detailSeason;
        currentHaikuData.parentKana = hit.parentKana || '';
    }
}

function goToStep3() {
    const inputKigoVal = document.getElementById('kigoInput').value.trim();
    let hit = saijikiDatabase.find(item => item.kigo === inputKigoVal || item.parentKigo === inputKigoVal);
    currentHaikuData.parentKigo = inputKigoVal;
    currentHaikuData.kigo = (hit && hit.kigo !== hit.parentKigo) ? hit.kigo : inputKigoVal;
    currentHaikuData.season = document.getElementById('seasonSelect').value;
    currentHaikuData.detailSeason = document.getElementById('detailSeasonSelect').value;
    
    currentHaikuData.author = document.getElementById('authorInput').value.trim() || userSettings.authorName || '風月';
    currentHaikuData.authorKana = document.getElementById('authorKanaInput').value.trim() || userSettings.authorKana || 'ふうげつ';
    currentHaikuData.sakkuDate = getFormattedSakkuDateFromFields();

    document.getElementById('previewPhrase').textContent = currentHaikuData.phrase;
    document.getElementById('previewAuthor').textContent = currentHaikuData.author;
    let seasonJa = {'haru':'春', 'natsu':'夏', 'aki':'秋', 'huyu':'冬', 'shinnen':'新年', 'muki':'無季'}[currentHaikuData.season] || currentHaikuData.season;
    let detailSuffix = currentHaikuData.detailSeason ? `（${currentHaikuData.detailSeason}）` : '';
    
    const safeSeason = escapeHtml(seasonJa);
    const safeKigo = escapeHtml(currentHaikuData.parentKigo || '無季');
    const safeSuffix = escapeHtml(detailSuffix);
    document.getElementById('previewBreadcrumb').innerHTML = `<span>季寄せ</span> <span class="separator">&lt;</span> <span>${safeSeason}</span> <span class="separator">&lt;</span> <span>${safeKigo}${safeSuffix}</span>`;
    
    goToStep(3);
}

function submitHaiku(statusType) {
    document.getElementById('completeTitle').textContent = `${statusType}として保存しました`;

    const newHaiku = {
        id: 'h-' + Date.now(),
        phrase: currentHaikuData.phrase,
        author: currentHaikuData.author,
        authorKana: currentHaikuData.authorKana,
        kigo: currentHaikuData.kigo || currentHaikuData.parentKigo,
        parentKigo: currentHaikuData.parentKigo,
        parentKana: currentHaikuData.parentKana,
        season: currentHaikuData.season,
        detailSeason: currentHaikuData.detailSeason,
        status: statusType,
        sakkuDate: currentHaikuData.sakkuDate,
        createdAt: Date.now()
    };

    if (currentHaikuData.oldPhrase) {
        const idx = haikuHistory.findIndex(h => h.phrase === currentHaikuData.oldPhrase);
        if (idx !== -1) {
            newHaiku.id = haikuHistory[idx].id || newHaiku.id;
            newHaiku.createdAt = haikuHistory[idx].createdAt || newHaiku.createdAt;
            haikuHistory[idx] = newHaiku;
        } else {
            haikuHistory.push(newHaiku);
        }
    } else {
        haikuHistory.push(newHaiku);
    }
    
    saveLocalHaikus();
    goToStep(4);
}

function finishAndReturn() {
    editingHaikuObj = null;
    currentHaikuData.oldPhrase = '';
    startYomuMode();
}

function resetForm() {
    document.getElementById('inputPhrase').value = '';
    document.getElementById('kigoInput').value = '';
    currentHaikuData.oldPhrase = '';
    setTodaySakkuDate();
    goToStep(1);
}

// ========================================================
// 暦ウィジェット表示（内蔵データ版）
// ========================================================
function renderTodayCalendar() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const date = today.getDate();
    
    const eraYear = year - 2018; 
    const eraStr = eraYear === 1 ? "元" : toKanjiNum(eraYear.toString());
    document.getElementById('calEraYear').textContent = `令和${eraStr}年`;
    document.getElementById('calGregorianDate').textContent = `${toKanjiNum(month.toString())}月${toKanjiNum(date.toString())}日`;

    const wafuList = ['睦月','如月','弥生','卯月','皐月','水無月','文月','葉月','長月','神無月','霜月','師走'];
    document.getElementById('calWafu').textContent = `（${wafuList[month - 1]}）`;
}

function renderKoyomiFromLocal() {
    if (!koyomiDatabase) return;
    const todayStr = getTodayDateString();
    const todayData = koyomiDatabase[todayStr];
    if (!todayData) return;

    if (todayData.lunar) {
        document.getElementById('calLunar').textContent = todayData.lunar;
    }

    let currentSekki = todayData.sekki || '';
    let currentKou = todayData.kou || '';
    let currentKouYomi = todayData.kou_yomi || '';

    if (!currentSekki || !currentKou) {
        const dateKeys = Object.keys(koyomiDatabase).sort();
        const curIdx = dateKeys.indexOf(todayStr);
        if (curIdx !== -1) {
            for (let i = curIdx; i >= 0; i--) {
                const d = koyomiDatabase[dateKeys[i]];
                if (!currentSekki && d.sekki) currentSekki = d.sekki;
                if (!currentKou && d.kou) {
                    currentKou = d.kou;
                    currentKouYomi = d.kou_yomi || '';
                }
                if (currentSekki && currentKou) break;
            }
        }
    }

    if (currentSekki) document.getElementById('calSolarTerm').textContent = currentSekki;
    
    const msElement = document.getElementById('calMicroseason');
    const dynamicContainer = document.getElementById('calDynamicEvents');
    if (dynamicContainer) dynamicContainer.innerHTML = '';

    if (currentKou) {
        msElement.textContent = currentKou;
        if (currentKouYomi) {
            msElement.style.marginLeft = '3px';
            const pYomi = document.createElement('p');
            pYomi.className = 'cal-line sub-info';
            pYomi.style.marginLeft = '10px';
            pYomi.style.fontSize = '11px';
            pYomi.textContent = `（${currentKouYomi}）`;
            if (dynamicContainer) dynamicContainer.appendChild(pYomi);
        } else {
            msElement.style.marginLeft = '7px';
        }
    } else {
        msElement.textContent = '';
    }

    // 祝日・雑節・重要行事の表示
    if (dynamicContainer) {
        // ① 祝日は必ず常時表示（朱色）
        if (todayData.holiday) {
            const p = document.createElement('p');
            p.className = 'cal-line sub-info holiday-text';
            p.textContent = todayData.holiday;
            dynamicContainer.appendChild(p);
        }
        // ② 雑節は必ず常時表示
        if (todayData.zassetsu) {
            const p = document.createElement('p');
            p.className = 'cal-line sub-info';
            p.textContent = todayData.zassetsu;
            dynamicContainer.appendChild(p);
        }
        // ③ 重要行事は先頭1件のみTOPに表示
        if (todayData.important && todayData.important.length > 0) {
            const p = document.createElement('p');
            p.className = 'cal-line sub-info';
            p.textContent = todayData.important[0];
            dynamicContainer.appendChild(p);
        }
    }

    // 神事・仏事・教会行事・その他・または複数の重要行事がある日は「i」ボタンを表示
    const hasDetailEvents = (
        (todayData.jinja && todayData.jinja.length > 0) ||
        (todayData.tera && todayData.tera.length > 0) ||
        (todayData.church && todayData.church.length > 0) ||
        (todayData.other && todayData.other.length > 0) ||
        (todayData.important && todayData.important.length > 1)
    );

    const infoBtn = document.getElementById('calInfoBtn');
    if (infoBtn) {
        if (hasDetailEvents) {
            infoBtn.classList.remove('hidden');
        } else {
            infoBtn.classList.add('hidden');
        }
    }
}
