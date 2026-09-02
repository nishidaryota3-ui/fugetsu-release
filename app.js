// ========================================================
// おみ句じ句帳 - 風月（製品版スタンドアロン・エンジン）
// ========================================================

const STORAGE_KEY_HAIKU = 'fugetsu_release_haikus';
const STORAGE_KEY_SETTINGS = 'fugetsu_release_settings';
const STORAGE_KEY_TRASH = 'fugetsu_release_trash';
const STORAGE_KEY_SNAPSHOTS = 'fugetsu_release_snapshots';
const STORAGE_KEY_LAST_BACKUP = 'fugetsu_last_backup_time';

let trashList = [];

// 句帳内の作者一覧キャッシュ（haikuHistory更新時のみ再計算し、入力のたびの全件走査を避ける）
let cachedHaikuAuthorsMap = null;

function getHaikuAuthorsMap() {
    if (!cachedHaikuAuthorsMap) {
        cachedHaikuAuthorsMap = new Map();
        haikuHistory.forEach(h => {
            if (h.author && !cachedHaikuAuthorsMap.has(h.author)) {
                cachedHaikuAuthorsMap.set(h.author, { name: h.author, kana: h.authorKana || '' });
            }
        });
    }
    return cachedHaikuAuthorsMap;
}

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
    homeKiyose: false,
    fontSizeMode: 'normal', // 'normal' | 'large'
    fontFamily: 'mincho',   // 'mincho' | 'gothic'
    cloudSyncUrl: '',       // Googleスプレッドシート/クラウド同期URL
    omikujiScope: 'ALL',    // 'ALL' | 'MINE' | 'AUTHORS'
    omikujiSelectedAuthors: [], // 特定の作者リスト
    kuchoDisplayMode: 'scroll', // 'scroll' | 'single'
    kuchoPitch: 50          // スクロール時の俳句間隔ピッチ(px)
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

function normalizeSakkuDate(rawDate) {
    if (!rawDate) return '';
    let str = String(rawDate).trim();
    if (!str) return '';

    // ISO 8601 形式（2026-08-31T15:00:00.000Z など、GAS/JSONがUTCで出力した日付）を端末ローカル日時に完全復元
    if (str.includes('T') || str.endsWith('Z')) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
    }

    return str;
}

function formatDateArabic(sakkuDate) {
    sakkuDate = normalizeSakkuDate(sakkuDate);
    if (!sakkuDate) return '年代不詳';
    const parts = String(sakkuDate).trim().replace(/[/.]/g, '-').split('-').filter(Boolean);
    if (parts.length === 1 && /^\d{1,4}$/.test(parts[0])) {
        return `${parseInt(parts[0], 10)}年`;
    }
    if (parts.length === 2 && /^\d{1,4}$/.test(parts[0])) {
        const m = parseInt(parts[1], 10);
        return isNaN(m) ? sakkuDate : `${parseInt(parts[0], 10)}/${m}`;
    }
    if (parts.length >= 3 && /^\d{1,4}$/.test(parts[0])) {
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (!isNaN(m) && !isNaN(d)) {
            return `${parseInt(parts[0], 10)}/${m}/${d}`;
        }
    }
    return sakkuDate;
}

function parseDateLabel(dateStr) {
    dateStr = normalizeSakkuDate(dateStr);
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

// 📱 PWA インストールプロンプト制御
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
});

function triggerPwaInstall() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(() => {
            deferredInstallPrompt = null;
        });
    }
}

// ========================================================
// 初期化 & データ読み込み
// ========================================================
window.onload = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
            return navigator.serviceWorker.register('./sw.js');
        }).then((reg) => {
            if (reg) reg.update().catch(() => {});
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
    loadTrashList();
    loadInternalDatabases();
    initPersistentStorage();

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

    // 定期バックアップ案内のチェック
    setTimeout(checkBackupReminder, 1200);

    // クラウドからの自動双方向同期チェック
    setTimeout(fetchHaikusFromCloud, 800);

    // 電波復帰時（オンライン復帰時）の自動同期リスナー
    window.addEventListener('online', () => {
        setTimeout(fetchHaikusFromCloud, 800);
    });

    // 暗号キーのリアルタイムリスナー起動
    initSyncKeyListener();

    // 📱 キーボード開閉・画面サイズ変更時の動的フォント再計算
    const onViewportResize = () => {
        const step1Screen = document.getElementById('step1');
        if (step1Screen && step1Screen.classList.contains('active')) {
            adjustStep1FontSize();
        }
    };
    window.addEventListener('resize', onViewportResize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onViewportResize);
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

    // 文字サイズモードの適用
    const isLarge = userSettings.fontSizeMode === 'large';
    document.body.classList.toggle('large-text-mode', isLarge);

    const normalBtn = document.getElementById('fontSizeNormalBtn');
    const largeBtn = document.getElementById('fontSizeLargeBtn');
    if (normalBtn) normalBtn.classList.toggle('active', !isLarge);
    if (largeBtn) largeBtn.classList.toggle('active', isLarge);

    // フォント形式モードの適用（明朝 / ゴシック）
    const isGothic = userSettings.fontFamily === 'gothic';
    document.body.classList.toggle('font-gothic-mode', isGothic);
    document.body.classList.toggle('font-mincho-mode', !isGothic);

    const minchoBtn = document.getElementById('fontMinchoBtn');
    const gothicBtn = document.getElementById('fontGothicBtn');
    if (minchoBtn) minchoBtn.classList.toggle('active', !isGothic);
    if (gothicBtn) gothicBtn.classList.toggle('active', isGothic);

    // クラウド同期URLの適用
    const cloudInput = document.getElementById('settingCloudSyncUrl');
    if (cloudInput && !cloudInput.value && userSettings.cloudSyncUrl) {
        cloudInput.value = userSettings.cloudSyncUrl;
    }
    // 句帳ピッチ設定の適用
    const pitch = userSettings.kuchoPitch !== undefined ? userSettings.kuchoPitch : 50;
    document.documentElement.style.setProperty('--kucho-pitch', `${pitch}px`);
    updateCloudStatusBadge();
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
            cachedHaikuAuthorsMap = null;
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
        cachedHaikuAuthorsMap = null;
        localStorage.setItem(STORAGE_KEY_HAIKU, JSON.stringify(haikuHistory));
        saveSnapshotHistory();
    } catch (e) {
        console.error('Failed to save haikus:', e);
    }
}

function saveSnapshotHistory() {
    try {
        let snapshots = [];
        const saved = localStorage.getItem(STORAGE_KEY_SNAPSHOTS);
        if (saved) snapshots = JSON.parse(saved);
        snapshots.unshift({
            timestamp: Date.now(),
            count: haikuHistory.length,
            haikus: haikuHistory
        });
        if (snapshots.length > 1) snapshots = snapshots.slice(0, 1);
        localStorage.setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(snapshots));
    } catch (e) {}
}

async function loadInternalDatabases() {
    try {
        const respKoyomi = await fetch('data/koyomi.json?v=2.0.33');
        if (respKoyomi.ok) {
            koyomiDatabase = await respKoyomi.json();
            renderKoyomiFromLocal();
        }
    } catch (e) {
        console.warn('Koyomi load offline fallback:', e);
    }

    try {
        const respSaijiki = await fetch('data/saijiki.json?v=2.0.64');
        if (respSaijiki.ok) {
            saijikiDatabase = await respSaijiki.json();
            renderSaijikiKigoList();
            renderStep1KigoList();
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

    // 3. 句帳内の作者（キャッシュ済みのMapを使い回す）
    getHaikuAuthorsMap().forEach((item, name) => {
        if (!allAuthorsMap.has(name)) allAuthorsMap.set(name, item);
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
    dateStr = normalizeSakkuDate(dateStr);
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
// 👤 句帳メニュー（四本柱アコーディオン）
// ========================================================
function toggleMenuAccordion(sectionId) {
    const sectionEl = document.getElementById(sectionId);
    if (!sectionEl) return;

    const isHidden = sectionEl.classList.contains('hidden');
    
    // すべてのセクションを一旦閉じる
    ['pillarSection1', 'pillarSection2', 'pillarSection3', 'pillarSection4'].forEach((id, idx) => {
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

function updateKuchoDisplayModeUI(mode) {
    const scrollBtn = document.getElementById('kuchoModeScrollBtn');
    const singleBtn = document.getElementById('kuchoModeSingleBtn');
    const pitchRow = document.getElementById('kuchoPitchSettingRow');
    if (scrollBtn && singleBtn) {
        scrollBtn.classList.toggle('active', mode === 'scroll');
        singleBtn.classList.toggle('active', mode === 'single');
    }
    if (pitchRow) {
        pitchRow.style.display = (mode === 'scroll') ? 'block' : 'none';
    }
}

function updateKuchoPitchUI(pitch) {
    const slider = document.getElementById('kuchoPitchSlider');
    const label = document.getElementById('kuchoPitchValueLabel');
    if (slider) slider.value = pitch;
    if (label) label.textContent = `${pitch}px`;
    document.documentElement.style.setProperty('--kucho-pitch', `${pitch}px`);
}

function setKuchoDisplayMode(mode) {
    userSettings.kuchoDisplayMode = mode;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    updateKuchoDisplayModeUI(mode);
    renderYomuList();
    closeAuthorSelectModal();
}

function onKuchoPitchSliderChanged(val) {
    const pitch = parseInt(val, 10);
    userSettings.kuchoPitch = pitch;
    const label = document.getElementById('kuchoPitchValueLabel');
    if (label) label.textContent = `${pitch}px`;
    document.documentElement.style.setProperty('--kucho-pitch', `${pitch}px`);
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
}

let kuchoSingleTouchStartX = 0;
let kuchoSingleTouchStartY = 0;

function handleKuchoSingleTouchStart(e) {
    if (!e.touches || e.touches.length === 0) return;
    kuchoSingleTouchStartX = e.touches[0].clientX;
    kuchoSingleTouchStartY = e.touches[0].clientY;
}

function handleKuchoSingleTouchEnd(e) {
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const diffX = e.changedTouches[0].clientX - kuchoSingleTouchStartX;
    const diffY = e.changedTouches[0].clientY - kuchoSingleTouchStartY;

    // 縦スクロールと誤爆しないように、横の移動量が大きく40px以上のとき
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        if (diffX < 0) {
            changeKuchoSingleHaiku(-1); // 左スワイプ（前へ）
        } else {
            changeKuchoSingleHaiku(1); // 右スワイプ（次へ）
        }
    }
}

function openAuthorSelectModal() {
    const listEl = document.getElementById('authorSelectList');
    if (!listEl) return;
    listEl.innerHTML = '';

    // すべてのアコーディオンを閉じた状態にする
    ['pillarSection1', 'pillarSection2', 'pillarSection3', 'pillarSection4'].forEach((id, idx) => {
        const el = document.getElementById(id);
        const arrow = document.getElementById(`pillarArrow${idx + 1}`);
        if (el) el.classList.add('hidden');
        if (arrow) arrow.textContent = '▿';
    });

    // 表示設定の初期UI反映
    const currentMode = userSettings.kuchoDisplayMode || 'scroll';
    const currentPitch = userSettings.kuchoPitch !== undefined ? userSettings.kuchoPitch : 50;
    updateKuchoDisplayModeUI(currentMode);
    updateKuchoPitchUI(currentPitch);

    const myName = userSettings.authorName || '風月';
    
    // 作者ごとの句数および読み仮名を集計
    const authorCounts = {};
    const authorKanaMap = {};
    let totalCount = 0;

    haikuHistory.forEach(h => {
        if (h.status === currentReadTab) {
            const a = h.author || myName;
            authorCounts[a] = (authorCounts[a] || 0) + 1;
            if (h.authorKana && !authorKanaMap[a]) {
                authorKanaMap[a] = h.authorKana;
            }
            totalCount++;
        }
    });

    const isMyActive = (currentAuthorFilter === null || currentAuthorFilter === myName);
    const isAllActive = (currentAuthorFilter === 'ALL');

    // 固定ヘッダーエリア（登録者・全句帳）
    const fixedGroup = document.createElement('div');
    fixedGroup.className = 'author-select-fixed-group';

    // 1. 自分の句帳（登録者）
    const myCount = authorCounts[myName] || 0;
    const myRow = document.createElement('div');
    myRow.className = 'author-select-row';

    const myItem = document.createElement('div');
    myItem.className = `author-select-item ${isMyActive ? 'active' : ''}`;
    myItem.style.flex = '1';
    myItem.onclick = () => selectAuthorFilter(null);
    myItem.innerHTML = `<span>${escapeHtml(myName)} 句帳（自作）</span><span class="author-count-badge">${myCount}句</span>`;

    const myDelBtn = document.createElement('button');
    myDelBtn.type = 'button';
    myDelBtn.className = 'author-delete-btn';
    myDelBtn.title = `「${myName}」の句をすべて削除`;
    myDelBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
    `;
    myDelBtn.onclick = (e) => deleteAuthorHaikus(myName, myCount, e);

    myRow.appendChild(myItem);
    myRow.appendChild(myDelBtn);
    fixedGroup.appendChild(myRow);

    // 2. すべての作品（全句帳）
    const allRow = document.createElement('div');
    allRow.className = 'author-select-row';

    const allItem = document.createElement('div');
    allItem.className = `author-select-item ${isAllActive ? 'active' : ''}`;
    allItem.style.flex = '1';
    allItem.onclick = () => selectAuthorFilter('ALL');
    allItem.innerHTML = `<span>全句帳（すべての作者）</span><span class="author-count-badge">${totalCount}句</span>`;

    const allDelBtn = document.createElement('button');
    allDelBtn.type = 'button';
    allDelBtn.className = 'author-delete-btn';
    allDelBtn.title = 'すべての句をごみ箱に移動';
    allDelBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
    `;
    allDelBtn.onclick = (e) => deleteAllHaikus(totalCount, e);

    allRow.appendChild(allItem);
    allRow.appendChild(allDelBtn);
    fixedGroup.appendChild(allRow);

    listEl.appendChild(fixedGroup);

    // 3. 他の作者一覧（あいうえお順・スクロール可能）
    const otherAuthors = Object.keys(authorCounts).filter(a => a !== myName);

    // あいうえお順（五十音順）ソート
    otherAuthors.sort((a, b) => {
        const kanaA = authorKanaMap[a] || a;
        const kanaB = authorKanaMap[b] || b;
        return kanaA.localeCompare(kanaB, 'ja');
    });

    if (otherAuthors.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'settings-divider';
        divider.style.margin = '8px 0 6px';
        listEl.appendChild(divider);

        const scrollGroup = document.createElement('div');
        scrollGroup.className = 'author-select-scroll-group';

        otherAuthors.forEach(author => {
            const row = document.createElement('div');
            row.className = 'author-select-row';

            const item = document.createElement('div');
            item.className = `author-select-item ${currentAuthorFilter === author ? 'active' : ''}`;
            item.style.flex = '1';
            item.onclick = () => selectAuthorFilter(author);
            item.innerHTML = `<span>${escapeHtml(author)} 句集</span><span class="author-count-badge">${authorCounts[author]}句</span>`;
            
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'author-delete-btn';
            delBtn.title = `作者「${author}」の句をすべて削除`;
            delBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            `;
            delBtn.onclick = (e) => deleteAuthorHaikus(author, authorCounts[author], e);

            row.appendChild(item);
            row.appendChild(delBtn);
            scrollGroup.appendChild(row);
        });

        listEl.appendChild(scrollGroup);
    }

    document.getElementById('authorSelectModal').classList.remove('hidden');
}

function deleteAuthorHaikus(author, count, event) {
    if (event) event.stopPropagation();

    const ok = confirm(`作者「${author}」の全 ${count}句 をごみ箱に移動しますか？\n\n※30日以内であれば設定メニューの「ごみ箱」からいつでも復元できます。`);
    if (!ok) return;

    // 対象の句をごみ箱に移動
    const targetHaikus = haikuHistory.filter(h => (h.author || userSettings.authorName || '風月') === author);
    targetHaikus.forEach(h => {
        trashList.unshift({
            ...h,
            deletedAt: Date.now()
        });
        syncHaikuToCloud(h, 'delete', h.phrase);
    });

    // 句帳から除外
    haikuHistory = haikuHistory.filter(h => (h.author || userSettings.authorName || '風月') !== author);

    saveLocalHaikus();
    saveTrashList();

    // 削除した作者が現在選択中なら自作句帳に戻す
    if (currentAuthorFilter === author) {
        currentAuthorFilter = null;
        updateHeaderTitle();
    }

    // 作者選択モーダルを更新
    openAuthorSelectModal();
    if (document.getElementById('readScreen').classList.contains('active')) {
        renderYomuList();
    }

    showToast(`作者「${author}」の ${count}句 をごみ箱に移動しました`);
}

function deleteAllHaikus(count, event) {
    if (event) event.stopPropagation();
    if (!count || count === 0) {
        alert('削除できる句がありません。');
        return;
    }

    const ok = confirm(`句帳内の全 ${count}句 をすべてごみ箱に移動しますか？\n\n※30日以内であれば設定メニューの「ごみ箱」からいつでも復元できます。`);
    if (!ok) return;

    // 全句をごみ箱に移動
    haikuHistory.forEach(h => {
        trashList.unshift({
            ...h,
            deletedAt: Date.now()
        });
        syncHaikuToCloud(h, 'delete', h.phrase);
    });

    haikuHistory = [];
    saveLocalHaikus();
    saveTrashList();

    currentAuthorFilter = null;
    updateHeaderTitle();
    openAuthorSelectModal();
    if (document.getElementById('readScreen').classList.contains('active')) {
        renderYomuList();
    }

    showToast(`全 ${count}句 をごみ箱に移動しました`);
}

function closeAuthorSelectModal() {
    document.getElementById('authorSelectModal').classList.add('hidden');
}

function selectAuthorFilter(author) {
    currentAuthorFilter = author;
    currentKuchoSingleIndex = 0;
    updateHeaderTitle();
    closeAuthorSelectModal();
    renderYomuList();
}

// ========================================================
// 🌸 季寄せ・歳時記 大画面（マイ歳時記ハイブリッド）
// ========================================================
function openSaijikiScreenFromMenu() {
    closeSettingsModal();
    closeAuthorSelectModal();
    document.querySelectorAll('.step-screen').forEach(el => el.classList.remove('active'));
    document.getElementById('saijikiScreen').classList.add('active');
    updateCatVisibility(true);
    switchSaijikiSeason(currentSaijikiSeason || 'haru');
}

let currentSaijikiMode = 'gojuon'; // 'gojuon' | 'jikou'
let currentStep1Mode = 'gojuon';

const JIKI_ORDER = {
    'haru': ['三春', '初春', '仲春', '晩春'],
    'natsu': ['三夏', '初夏', '仲夏', '晩夏'],
    'aki': ['三秋', '初秋', '仲秋', '晩秋'],
    'huyu': ['三冬', '初冬', '仲冬', '晩冬', '暮'],
    'shinnen': ['新年']
};

const BUNRUI_ORDER = ['時候', '天文', '地理', '生活', '行事', '動物', '植物'];

function switchSaijikiMode(mode) {
    currentSaijikiMode = mode;
    ['Gojuon', 'Jikou'].forEach(m => {
        const tab = document.getElementById(`smode${m}`);
        if (tab) tab.classList.toggle('active', m.toLowerCase() === mode);
    });
    renderSaijikiKigoList();
}

function switchStep1Mode(mode) {
    currentStep1Mode = mode;
    ['Gojuon', 'Jikou'].forEach(m => {
        const tab = document.getElementById(`stmode${m}`);
        if (tab) tab.classList.toggle('active', m.toLowerCase() === mode);
    });
    renderStep1KigoList();
}

function switchSaijikiSeason(season) {
    currentSaijikiSeason = season;
    ['Haru', 'Natsu', 'Aki', 'Huyu', 'Shinnen'].forEach(s => {
        const tab = document.getElementById(`stab${s}`);
        if (tab) tab.classList.toggle('active', s.toLowerCase() === season);
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

function getGojuonRowChar(kana) {
    if (!kana) return 'あ';
    const c = kana.charAt(0);
    if ('あいうえおぁぃぅぇぉ'.includes(c)) return 'あ';
    if ('かきくけこがぎぐげご'.includes(c)) return 'か';
    if ('さしすせそざじずぜぞ'.includes(c)) return 'さ';
    if ('たちつてとだぢづでどっ'.includes(c)) return 'た';
    if ('なにぬねの'.includes(c)) return 'な';
    if ('はひふへほばびぶべぼぱぴぷぺぽ'.includes(c)) return 'は';
    if ('まみむめも'.includes(c)) return 'ま';
    if ('やゆよゃゅょ'.includes(c)) return 'や';
    if ('らりるれろ'.includes(c)) return 'ら';
    if ('わをん'.includes(c)) return 'わ';
    return 'あ';
}

function jumpToStep1Gojuon(rowChar) {
    const container = document.getElementById('step1KigoList');
    if (!container) return;
    const target = container.querySelector(`[data-row="${rowChar}"]`);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
}

// 🌸 和モダン 透かしフロート見出し（ウォーターマーク）の更新
function updateSaijikiCurrentIndicator() {
    const container = document.getElementById('saijikiKigoList');
    const watermark = document.getElementById('saijikiWatermark');
    const elTiming = document.getElementById('wmTiming');
    const elCat = document.getElementById('wmCat');
    if (!container || !watermark || !elTiming || !elCat) return;

    const query = document.getElementById('saijikiSearchInput') ? document.getElementById('saijikiSearchInput').value.trim() : '';

    if (currentSaijikiMode !== 'jikou' || query !== '') {
        watermark.classList.add('hidden');
        return;
    }
    watermark.classList.remove('hidden');

    const rect = container.getBoundingClientRect();
    const targetX = rect.left + rect.width * 0.55;

    const items = container.querySelectorAll('.saijiki-kigo-item[data-timing]');
    let closestItem = null;
    let minDiff = Infinity;

    items.forEach(item => {
        const iRect = item.getBoundingClientRect();
        const centerX = iRect.left + iRect.width / 2;
        const diff = Math.abs(centerX - targetX);
        if (diff < minDiff) {
            minDiff = diff;
            closestItem = item;
        }
    });

    if (closestItem) {
        const t = closestItem.getAttribute('data-timing');
        const c = closestItem.getAttribute('data-cat');
        if (t && elTiming.textContent !== t) elTiming.textContent = t;
        if (c && elCat.textContent !== c) elCat.textContent = c;
    }
}

function updateStep1CurrentIndicator() {
    const container = document.getElementById('step1KigoList');
    const watermark = document.getElementById('step1Watermark');
    const elTiming = document.getElementById('stWmTiming');
    const elCat = document.getElementById('stWmCat');
    if (!container || !watermark || !elTiming || !elCat) return;

    const query = document.getElementById('step1SearchInput') ? document.getElementById('step1SearchInput').value.trim() : '';

    if (currentStep1Mode !== 'jikou' || query !== '') {
        watermark.classList.add('hidden');
        return;
    }
    watermark.classList.remove('hidden');

    const rect = container.getBoundingClientRect();
    const targetX = rect.left + rect.width * 0.55;

    const items = container.querySelectorAll('.step1-kigo-item[data-timing]');
    let closestItem = null;
    let minDiff = Infinity;

    items.forEach(item => {
        const iRect = item.getBoundingClientRect();
        const centerX = iRect.left + iRect.width / 2;
        const diff = Math.abs(centerX - targetX);
        if (diff < minDiff) {
            minDiff = diff;
            closestItem = item;
        }
    });

    if (closestItem) {
        const t = closestItem.getAttribute('data-timing');
        const c = closestItem.getAttribute('data-cat');
        if (t && elTiming.textContent !== t) elTiming.textContent = t;
        if (c && elCat.textContent !== c) elCat.textContent = c;
    }
}

// 季寄せ季語一覧の描画（右から左へ並ぶ縦書きリスト ＋ 句数バッジ ＋ 3WAY切り替え）
function renderSaijikiKigoList() {
    const container = document.getElementById('saijikiKigoList');
    if (!container) return;
    container.innerHTML = '';

    const query = document.getElementById('saijikiSearchInput') ? document.getElementById('saijikiSearchInput').value.trim().toLowerCase() : '';

    // ジャンプバーの表示/非表示（五十音モードかつ非検索時のみ表示）
    const jumpBar = document.getElementById('saijikiGojuonBar');
    if (jumpBar) {
        jumpBar.classList.toggle('hidden', currentSaijikiMode !== 'gojuon' || query !== '');
    }

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
                    category: item.category || '生活',
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

    // 4. ソート＆グループ化ロジック（五十音順・時期別・分類別）
    const sortKana = (arr) => [...arr].sort((a, b) => (a.parentKana || a.parentKigo).localeCompare(b.parentKana || b.parentKigo, 'ja'));

    const renderItem = (pData) => {
        const works = kigoWorkMap.get(pData.parentKigo) || [];
        const workCount = works.length;
        const rowChar = getGojuonRowChar(pData.parentKana || pData.parentKigo);

        const itemEl = document.createElement('div');
        itemEl.className = 'saijiki-kigo-item';
        itemEl.setAttribute('data-row', rowChar);
        itemEl.setAttribute('data-timing', pData.detailSeason || '');
        itemEl.setAttribute('data-cat', pData.category || '');
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
    };

    // 🌸 一段上に掲げるワンセット見出し（時期＋分類、または分類単独）
    const renderHeadingSet = (timingText, catText) => {
        const sep = document.createElement('div');
        sep.className = 'saijiki-heading-set';
        if (timingText) {
            sep.classList.add('with-timing');
            sep.innerHTML = `
                <span class="saijiki-hb-timing">${escapeHtml(timingText)}</span>
                <span class="saijiki-hb-cat">${escapeHtml(catText)}</span>
            `;
        } else {
            sep.classList.add('only-cat');
            sep.innerHTML = `
                <span class="saijiki-hb-cat">${escapeHtml(catText)}</span>
            `;
        }
        container.appendChild(sep);
    };

    if (query !== '' || currentSaijikiMode === 'gojuon') {
        // 【五十音順】モード（または検索時）：あいうえお順で全件流す
        sortKana(parents).forEach(renderItem);
    } else if (currentSaijikiMode === 'jikou') {
        // 【時候順】モード：時期（三 ➔ 初 ➔ 仲 ➔ 晩） ➔ 分類（時候 ➔ 天文 ➔ 地理 ➔ 生活 ➔ 行事 ➔ 動物 ➔ 植物）
        const jikiKeys = JIKI_ORDER[currentSaijikiSeason] || ['三春', '初春', '仲春', '晩春'];
        jikiKeys.forEach(jKey => {
            const jikiGroup = parents.filter(p => p.detailSeason === jKey);
            if (jikiGroup.length > 0) {
                let isFirstCatInJiki = true;
                
                // 時期内の7大分類
                BUNRUI_ORDER.forEach(bKey => {
                    const catGroup = jikiGroup.filter(p => p.category === bKey);
                    if (catGroup.length > 0) {
                        if (isFirstCatInJiki) {
                            renderHeadingSet(jKey, bKey);
                            isFirstCatInJiki = false;
                        } else {
                            renderHeadingSet(null, bKey);
                        }
                        sortKana(catGroup).forEach(renderItem);
                    }
                });
                
                // 未分類があれば
                const othersInJiki = jikiGroup.filter(p => !BUNRUI_ORDER.includes(p.category));
                if (othersInJiki.length > 0) {
                    renderHeadingSet(isFirstCatInJiki ? jKey : null, 'その他');
                    sortKana(othersInJiki).forEach(renderItem);
                }
            }
        });
        
        // 定義外の時期があれば末尾に
        const others = parents.filter(p => !jikiKeys.includes(p.detailSeason));
        if (others.length > 0) {
            renderHeadingSet('その他', 'その他');
            sortKana(others).forEach(renderItem);
        }
    }

    container.scrollLeft = 0;
    updateSaijikiCurrentIndicator();
}

// ========================================================
// 🌸 季語解説ポップアップカード（うてなモデル＋マイ歳時記）
// ========================================================
function openKigoCard(parentKigoName, fromContext = null) {
    closeStep1KiyoseModal();
    const overlay = document.getElementById('kigoCardOverlay');
    if (!overlay) return;

    // 季語データの特定（親季語グループの一致を最優先）
    let parentItems = saijikiDatabase.filter(it => it.parentKigo === parentKigoName);
    let resolvedParentName = parentKigoName;

    if (parentItems.length === 0) {
        // 親季語として見つからない場合、子季語としての一致から親季語を特定
        const childMatch = saijikiDatabase.find(it => it.kigo === parentKigoName);
        if (childMatch && childMatch.parentKigo) {
            resolvedParentName = childMatch.parentKigo;
            parentItems = saijikiDatabase.filter(it => it.parentKigo === resolvedParentName);
        }
    }

    if (parentItems.length === 0) return;

    // 親季語自身のエントリ（parentKigo === kigo）を優先して基本情報・ルビを取得
    const baseItem = parentItems.find(it => it.kigo === resolvedParentName) || parentItems[0];
    const parentKana = baseItem.parentKana || '';
    const detailSeason = baseItem.detailSeason || '';
    const desc = baseItem.desc || '解説はありません。';

    // 傍題（子季語）一覧
    const childSet = new Set();
    parentItems.forEach(it => {
        if (it.kigo && it.kigo !== resolvedParentName) {
            childSet.add(it.kigo);
        }
    });
    const childList = Array.from(childSet);

    // 自作句・登録句の取得
    const works = haikuHistory.filter(h => h.status === '完成句' && (h.parentKigo === resolvedParentName || h.kigo === resolvedParentName));

    // 1. 親季語カラム
    const parentCol = document.getElementById('cardParentKigo');
    let rubyHtml = escapeHtml(resolvedParentName);
    if (parentKana && parentKana !== resolvedParentName) {
        rubyHtml = `<ruby>${escapeHtml(resolvedParentName)}<rt>${escapeHtml(parentKana)}</rt></ruby>`;
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
        // 作句中（ステップ1）から開いた場合：この季語を入力ボタンを表示（下詰め）
        worksHtml += `
            <div class="kigo-work-single-col action-only-col">
                <div class="kigo-insert-action" onclick="insertKigoToInput('${escapeHtml(resolvedParentName)}')">
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
        // 季寄せ画面から開いた場合：常に「この季語で詠む」ボタンを表示（下詰め）
        worksHtml += `
            <div class="kigo-work-single-col action-only-col">
                <div class="kigo-compose-action" onclick="composeWithKigo('${escapeHtml(resolvedParentName)}')">
                    この季語で詠む ➔
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
    }

    overlay.classList.remove('hidden');
}

function closeKigoCard() {
    const overlay = document.getElementById('kigoCardOverlay');
    if (overlay) overlay.classList.add('hidden');
}

function getStep1Phrase() {
    const el = document.getElementById('inputPhrase');
    return el ? (el.value || '').trim() : '';
}

function setStep1Phrase(text) {
    const el = document.getElementById('inputPhrase');
    if (el) {
        el.value = text;
        adjustStep1FontSize(el);
    }
}

function onStep1DirectInput(el) {
    if (!el) return;
    // 改行を除去して完全1行を維持
    if (el.value.includes('\n') || el.value.includes('\r')) {
        const start = el.selectionStart;
        el.value = el.value.replace(/\r?\n/g, '');
        el.selectionStart = el.selectionEnd = start;
    }
    adjustStep1FontSize(el);
}

function onStep1ContainerClicked(e) {
    if (e && e.target && e.target.id === 'inputPhrase') {
        return;
    }
    const el = document.getElementById('inputPhrase');
    if (el && document.activeElement === el) {
        el.blur();
        setTimeout(() => adjustStep1FontSize(el), 120);
    }
}

function adjustStep1FontSize(el) {
    if (!el) el = document.getElementById('inputPhrase');
    if (!el) return;

    // テキストエリアの実際のピクセル高さを取得
    const style = getComputedStyle(el);
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const availableHeight = el.clientHeight - paddingTop - paddingBottom;

    // 文字数（最低1文字＝プレースホルダー用）
    const charCount = Math.max(el.value.length, 1);
    // 表示用の文字数（少なくとも10文字分のスペースは想定して、大きすぎないように）
    const effectiveCount = Math.max(charCount, 10);

    // letter-spacing 0.12em 分を含めた1文字あたりの占有高さ ≒ fontSize * 1.12
    let fontSize = Math.floor(availableHeight / (effectiveCount * 1.12));

    // 上限・下限のクランプ（PCは30px、スマホは上品な23pxを上限にする）
    const isDesktop = window.innerWidth >= 768;
    const maxSize = isDesktop ? 30 : 23;
    const minSize = 12;
    fontSize = Math.min(fontSize, maxSize);
    fontSize = Math.max(fontSize, minSize);

    el.style.fontSize = fontSize + 'px';
}

function onStep1DirectKeyDown(e) {
    // 漢字変換確定中（isComposing / keyCode 229）はEnterで次へ行かない！
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        goToStep2();
    }
}

function focusStep1DirectInput() {
    const el = document.getElementById('inputPhrase');
    if (el) {
        el.focus();
        adjustStep1FontSize(el);
    }
}

function composeWithKigo(kigoName) {
    closeKigoCard();
    closeStep1KiyoseModal();
    startEmuMode();
    setStep1Phrase(kigoName);
    currentHaikuData.phrase = kigoName;
    currentHaikuData.kigo = kigoName;
    currentHaikuData.parentKigo = kigoName;
    focusStep1DirectInput();
}

function openStep1KiyoseModal() {
    renderStep1KigoList();
    const modal = document.getElementById('step1KiyoseModal');
    if (modal) modal.classList.remove('hidden');
}

function closeStep1KiyoseModal() {
    const modal = document.getElementById('step1KiyoseModal');
    if (modal) modal.classList.add('hidden');
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
                    category: item.category || '生活',
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

    const jumpBar = document.getElementById('step1GojuonBar');
    if (jumpBar) {
        jumpBar.classList.toggle('hidden', currentStep1Mode !== 'gojuon' || query !== '');
    }

    if (parents.length === 0) {
        container.innerHTML = '<div style="writing-mode: vertical-rl; color: #888; font-size: 0.88rem; margin: auto; letter-spacing: 0.2em;">該当する季語がありません</div>';
        return;
    }

    const sortKana = (arr) => [...arr].sort((a, b) => (a.parentKana || a.parentKigo).localeCompare(b.parentKana || b.parentKigo, 'ja'));

    const renderItem = (pData) => {
        const itemEl = document.createElement('div');
        const len = (pData.parentKigo || '').length;
        const rowChar = getGojuonRowChar(pData.parentKana || pData.parentKigo);
        let extraClass = '';
        if (len >= 8) extraClass = ' extra-long-kigo';
        else if (len >= 6) extraClass = ' long-kigo';

        itemEl.className = `step1-kigo-item${extraClass}`;
        itemEl.setAttribute('data-row', rowChar);
        itemEl.setAttribute('data-timing', pData.detailSeason || '');
        itemEl.setAttribute('data-cat', pData.category || '');
        // タップで季語カードを開く（step1コンテキスト）
        itemEl.onclick = () => openKigoCard(pData.parentKigo, 'step1');
        itemEl.textContent = pData.parentKigo;
        container.appendChild(itemEl);
    };

    const renderHeadingSet = (timingText, catText) => {
        const sep = document.createElement('div');
        sep.className = 'saijiki-heading-set';
        if (timingText) {
            sep.classList.add('with-timing');
            sep.innerHTML = `
                <span class="saijiki-hb-timing">${escapeHtml(timingText)}</span>
                <span class="saijiki-hb-cat">${escapeHtml(catText)}</span>
            `;
        } else {
            sep.classList.add('only-cat');
            sep.innerHTML = `
                <span class="saijiki-hb-cat">${escapeHtml(catText)}</span>
            `;
        }
        container.appendChild(sep);
    };

    if (query !== '' || currentStep1Mode === 'gojuon') {
        // 【五十音順】モード（または検索時）
        sortKana(parents).forEach(renderItem);
    } else if (currentStep1Mode === 'jikou') {
        // 【時候順】モード：時期（三 ➔ 初 ➔ 仲 ➔ 晩） ➔ 分類（時候 ➔ 天文 ➔ 地理 ➔ 生活 ➔ 行事 ➔ 動物 ➔ 植物）
        const jikiKeys = JIKI_ORDER[currentStep1Season] || ['三春', '初春', '仲春', '晩春'];
        jikiKeys.forEach(jKey => {
            const jikiGroup = parents.filter(p => p.detailSeason === jKey);
            if (jikiGroup.length > 0) {
                let isFirstCatInJiki = true;
                BUNRUI_ORDER.forEach(bKey => {
                    const catGroup = jikiGroup.filter(p => p.category === bKey);
                    if (catGroup.length > 0) {
                        if (isFirstCatInJiki) {
                            renderHeadingSet(jKey, bKey);
                            isFirstCatInJiki = false;
                        } else {
                            renderHeadingSet(null, bKey);
                        }
                        sortKana(catGroup).forEach(renderItem);
                    }
                });
                const othersInJiki = jikiGroup.filter(p => !BUNRUI_ORDER.includes(p.category));
                if (othersInJiki.length > 0) {
                    renderHeadingSet(isFirstCatInJiki ? jKey : null, 'その他');
                    sortKana(othersInJiki).forEach(renderItem);
                }
            }
        });
        const others = parents.filter(p => !jikiKeys.includes(p.detailSeason));
        if (others.length > 0) {
            renderHeadingSet('その他', 'その他');
            sortKana(others).forEach(renderItem);
        }
    }

    container.scrollLeft = 0;
    updateStep1CurrentIndicator();
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
let currentPrintMode = 'single'; // 'single' | 'booklet'

function setPrintMode(mode) {
    currentPrintMode = mode;
    const singleBtn = document.getElementById('printModeSingleBtn');
    const bookletBtn = document.getElementById('printModeBookletBtn');
    const subNote = document.getElementById('printSubNote');
    if (singleBtn) singleBtn.classList.toggle('active', mode === 'single');
    if (bookletBtn) bookletBtn.classList.toggle('active', mode === 'booklet');
    if (subNote) {
        if (mode === 'single') {
            subNote.textContent = '※片面印刷：半分に折って重ねるだけの簡単製本';
        } else {
            subNote.textContent = '※両面印刷（短辺とじ）：真ん中をホチキス留めする本格小冊子';
        }
    }
}

// ========================================================
// 🖨️ 句集の小冊子印刷・PDF出力（A4横・片面手折り ＆ 両面小冊子面付け対応）
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

    // 表紙タイトル
    const bookletTitle = (targetAuthor === 'ALL') ? '全句集' : `${targetAuthor} 句集`;

    // 俳句を半面ページ（A5縦相当）ごとに分割
    const haikuPages = [];
    for (let i = 0; i < targetHaikus.length; i += linesPerPage) {
        haikuPages.push(targetHaikus.slice(i, i + linesPerPage));
    }

    // 既存の印刷用iframeがあれば削除
    let printIframe = document.getElementById('fugetsu_print_iframe');
    if (printIframe) printIframe.remove();

    // 親画面のDOMやCSSの干渉を100%遮断する独立iframeを生成
    printIframe = document.createElement('iframe');
    printIframe.id = 'fugetsu_print_iframe';
    printIframe.style.position = 'fixed';
    printIframe.style.top = '0px';
    printIframe.style.left = '0px';
    printIframe.style.width = '297mm';
    printIframe.style.height = '210mm';
    printIframe.style.opacity = '0';
    printIframe.style.pointerEvents = 'none';
    printIframe.style.zIndex = '-9999';
    printIframe.style.border = 'none';
    document.body.appendChild(printIframe);

    const doc = printIframe.contentWindow.document;
    doc.open();

    let sheetsHtml = '';

    // 半面ページのHTML生成ヘルパー
    function renderHalfPageHtml(pageObj) {
        if (!pageObj || pageObj.type === 'blank') {
            return `
                <div class="sheet-half">
                    <div class="sheet-half-content"></div>
                    <div class="print-nombre"></div>
                </div>
            `;
        }
        if (pageObj.type === 'cover') {
            return `
                <div class="sheet-half cover-half">
                    <div class="sheet-half-content cover-content">
                        <div class="print-cover-title">${escapeHtml(bookletTitle)}</div>
                    </div>
                    <div class="print-nombre"></div>
                </div>
            `;
        }
        if (pageObj.type === 'colophon') {
            return `
                <div class="sheet-half colophon-half">
                    <div class="sheet-half-content colophon-content">
                        <div class="print-colophon-box">
                            <div class="print-colophon-title">${escapeHtml(bookletTitle)}</div>
                            <div class="print-colophon-author">著者　${escapeHtml(targetAuthor === 'ALL' ? myName : targetAuthor)}</div>
                            <div class="print-colophon-brand">句帳 風月 謹製</div>
                        </div>
                    </div>
                    <div class="print-nombre"></div>
                </div>
            `;
        }
        if (pageObj.type === 'tobira') {
            return `
                <div class="sheet-half tobira-half">
                    <div class="sheet-half-content tobira-content">
                        <div class="print-tobira-title">${escapeHtml(bookletTitle)}</div>
                    </div>
                    <div class="print-nombre"></div>
                </div>
            `;
        }
        // 本文ページ
        const linesHtml = (pageObj.haikus || []).map(h => `<div class="print-phrase-line">${escapeHtml(h.phrase)}</div>`).join('');
        const nombreHtml = pageObj.pageNumber ? `- ${pageObj.pageNumber} -` : '';
        return `
            <div class="sheet-half">
                <div class="sheet-half-content">
                    ${linesHtml}
                </div>
                <div class="print-nombre">${nombreHtml}</div>
            </div>
        `;
    }

    if (currentPrintMode === 'single') {
        // ==========================================
        // 🅰️ 片面手折り（山折りで重ねる手軽な製本）
        // ==========================================
        // Sheet 1: 表紙シート（右半分が表紙、左半分が余白）
        sheetsHtml += `
            <div class="print-sheet">
                <div class="sheet-half">
                    <div class="sheet-half-content"></div>
                    <div class="print-nombre"></div>
                </div>
                <div class="sheet-divider"></div>
                <div class="sheet-half cover-half">
                    <div class="sheet-half-content cover-content">
                        <div class="print-cover-title">${escapeHtml(bookletTitle)}</div>
                    </div>
                    <div class="print-nombre"></div>
                </div>
            </div>
        `;

        // Sheet 2以降: 本文（見開きで右から左へ流れる）
        let pageNumCounter = 1;
        for (let i = 0; i < haikuPages.length; i += 2) {
            const rightPageObj = { type: 'body', haikus: haikuPages[i], pageNumber: pageNumCounter++ };
            const leftPageObj = haikuPages[i + 1] ? { type: 'body', haikus: haikuPages[i + 1], pageNumber: pageNumCounter++ } : { type: 'blank' };

            sheetsHtml += `
                <div class="print-sheet">
                    ${renderHalfPageHtml(leftPageObj)}
                    <div class="sheet-divider"></div>
                    ${renderHalfPageHtml(rightPageObj)}
                </div>
            `;
        }
    } else {
        // ==========================================
        // 🅱️ 両面小冊子（コンビニ中綴じ面付け印刷・右綴じ）
        // ==========================================
        // 1. 全論理ページの配列を構築（Page 1: 表紙, Page 2: 扉, Page 3〜: 本文, 最終: 奥付）
        const logicalPages = [];
        // Page 1: 表紙
        logicalPages.push({ type: 'cover' });
        // Page 2: 扉
        logicalPages.push({ type: 'tobira' });
        // Page 3〜: 本文
        haikuPages.forEach((hList, idx) => {
            logicalPages.push({ type: 'body', haikus: hList, pageNumber: idx + 1 });
        });
        // 最終: 奥付
        logicalPages.push({ type: 'colophon' });

        // 2. 4の倍数になるよう白紙ページをパディング
        while (logicalPages.length % 4 !== 0) {
            // 奥付の直前に白紙を挿入
            logicalPages.splice(logicalPages.length - 1, 0, { type: 'blank' });
        }

        const totalPages = logicalPages.length;
        const totalSheets = totalPages / 4;

        // 3. 面付け（Imposition）ループ：各用紙ごとに表面（オモテ）と裏面（ウラ）を生成
        for (let s = 1; s <= totalSheets; s++) {
            // 表面（オモテ）: [ 左: Page 2s - 1 | 右: Page N - 2s + 2 ] (1-indexed)
            const leftIdxFront = (2 * s - 1) - 1;
            const rightIdxFront = (totalPages - 2 * s + 2) - 1;
            const leftPageFront = logicalPages[leftIdxFront];
            const rightPageFront = logicalPages[rightIdxFront];

            sheetsHtml += `
                <div class="print-sheet">
                    ${renderHalfPageHtml(leftPageFront)}
                    <div class="sheet-divider"></div>
                    ${renderHalfPageHtml(rightPageFront)}
                </div>
            `;

            // 裏面（ウラ）: [ 左: Page N - 2s + 1 | 右: Page 2s ] (1-indexed)
            const leftIdxBack = (totalPages - 2 * s + 1) - 1;
            const rightIdxBack = (2 * s) - 1;
            const leftPageBack = logicalPages[leftIdxBack];
            const rightPageBack = logicalPages[rightIdxBack];

            sheetsHtml += `
                <div class="print-sheet">
                    ${renderHalfPageHtml(leftPageBack)}
                    <div class="sheet-divider"></div>
                    ${renderHalfPageHtml(rightPageBack)}
                </div>
            `;
        }
    }

    doc.write(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <title>${escapeHtml(bookletTitle)}</title>
            <style>
                @page {
                    size: landscape;
                    size: A4 landscape;
                    margin: 0;
                }
                @page :left {
                    size: landscape;
                    margin: 0;
                }
                @page :right {
                    size: landscape;
                    margin: 0;
                }
                @media print {
                    @page {
                        size: landscape;
                        size: A4 landscape;
                        margin: 0;
                    }
                    html, body {
                        width: 297mm !important;
                        height: 210mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    background: #ffffff;
                    color: #000000;
                    font-family: "游明朝", "Yu Mincho", "ヒラギノ明朝 ProN", "Hiragino Mincho ProN", "Shippori Mincho", "MS P明朝", serif;
                }
                /* A4横 1枚のシート (297mm x 210mm) */
                .print-sheet {
                    width: 297mm;
                    height: 210mm;
                    page-break-after: always;
                    break-after: page;
                    page-break-inside: avoid;
                    break-inside: avoid;
                    display: flex;
                    flex-direction: row;
                    align-items: stretch;
                    box-sizing: border-box;
                    padding: 10mm 15mm;
                    background: #ffffff;
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
                    flex-direction: column;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6mm 10mm 4mm;
                    box-sizing: border-box;
                }
                .sheet-half-content {
                    flex: 1;
                    width: 100%;
                    display: flex;
                    flex-direction: row-reverse !important;
                    justify-content: space-around !important;
                    align-items: center !important;
                }
                /* 折り目のセンター線（極めて薄い目印） */
                .sheet-divider {
                    width: 1px;
                    height: 100%;
                    border-left: 1px dashed #e0ded8;
                }
                /* ノンブル（ページ番号） */
                .print-nombre {
                    font-size: 8.5pt;
                    color: #777777;
                    font-family: "游明朝", "Yu Mincho", serif;
                    letter-spacing: 0.1em;
                    height: 14px;
                    line-height: 14px;
                    text-align: center;
                }
                /* 表紙半面 */
                .cover-half, .tobira-half {
                    justify-content: center !important;
                    align-items: center !important;
                }
                .cover-content, .tobira-content {
                    justify-content: center !important;
                    align-items: center !important;
                }
                .print-cover-title {
                    writing-mode: vertical-rl;
                    -webkit-writing-mode: vertical-rl;
                    font-size: 30pt;
                    letter-spacing: 0.35em;
                    font-weight: 500;
                    line-height: 1.5;
                    margin: auto;
                }
                .print-tobira-title {
                    writing-mode: vertical-rl;
                    -webkit-writing-mode: vertical-rl;
                    font-size: 20pt;
                    letter-spacing: 0.3em;
                    color: #444;
                    margin: auto;
                }
                /* 奥付 */
                .colophon-content {
                    justify-content: center !important;
                    align-items: center !important;
                }
                .print-colophon-box {
                    border: 1px solid #dcd9d0;
                    padding: 8mm 12mm;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    margin: auto;
                }
                .print-colophon-title {
                    font-size: 14pt;
                    font-weight: 600;
                    letter-spacing: 0.15em;
                }
                .print-colophon-author {
                    font-size: 10pt;
                    color: #444;
                    letter-spacing: 0.1em;
                    margin-top: 4px;
                }
                .print-colophon-brand {
                    font-size: 8pt;
                    color: #888;
                    letter-spacing: 0.1em;
                    margin-top: 8px;
                    border-top: 1px solid #eee;
                    padding-top: 4px;
                }
                /* 縦書き俳句 */
                .print-phrase-line {
                    writing-mode: vertical-rl;
                    -webkit-writing-mode: vertical-rl;
                    font-size: 17pt;
                    letter-spacing: 0.26em;
                    line-height: 1.4;
                    white-space: nowrap;
                    height: auto;
                    max-height: 155mm;
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
    }, 300);
}

// ========================================================
// 設定 & プロフィール機能（三本柱アコーディオン）
// ========================================================
function toggleSettingsAccordion(sectionId) {
    const sectionEl = document.getElementById(sectionId);
    if (!sectionEl) return;

    const isHidden = sectionEl.classList.contains('hidden');
    
    // すべてのセクションを一旦閉じる
    ['settingSection1', 'settingSection2', 'settingSection3', 'settingSectionTrash', 'settingSection5', 'settingSection6', 'settingSection7'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    ['settingArrow1', 'settingArrow2', 'settingArrow3', 'settingArrowTrash', 'settingArrow5', 'settingArrow6', 'settingArrow7'].forEach(aid => {
        const arrow = document.getElementById(aid);
        if (arrow) arrow.textContent = '▿';
    });

    // クリックされたセクションが閉じていた場合は開く
    if (isHidden) {
        sectionEl.classList.remove('hidden');
        let arrowId = 'settingArrow1';
        if (sectionId === 'settingSection2') arrowId = 'settingArrow2';
        else if (sectionId === 'settingSection3') arrowId = 'settingArrow3';
        else if (sectionId === 'settingSectionTrash') arrowId = 'settingArrowTrash';
        else if (sectionId === 'settingSection5') arrowId = 'settingArrow5';
        else if (sectionId === 'settingSection6') arrowId = 'settingArrow6';
        else if (sectionId === 'settingSection7') arrowId = 'settingArrow7';
        const arrow = document.getElementById(arrowId);
        if (arrow) arrow.textContent = '▴';
    }
}

function openSettingsModal() {
    // すべてのアコーディオンを閉じた状態にする
    ['settingSection1', 'settingSection2', 'settingSection3', 'settingSectionTrash', 'settingSection5', 'settingSection6', 'settingSection7'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    ['settingArrow1', 'settingArrow2', 'settingArrow3', 'settingArrowTrash', 'settingArrow5', 'settingArrow6', 'settingArrow7'].forEach(aid => {
        const arrow = document.getElementById(aid);
        if (arrow) arrow.textContent = '▿';
    });

    document.getElementById('settingAuthorName').value = userSettings.authorName || '';
    document.getElementById('settingAuthorKana').value = userSettings.authorKana || '';
    
    const startupChk = document.getElementById('settingStartupOmikuji');
    if (startupChk) startupChk.checked = !!userSettings.startupOmikuji;
    
    const hideHomeKiyoseChk = document.getElementById('settingHideHomeKiyose');
    if (hideHomeKiyoseChk) hideHomeKiyoseChk.checked = !!userSettings.hideHomeKiyose;

    // おみ句じ句の範囲設定
    const currentScope = userSettings.omikujiScope || 'ALL';
    const radios = document.getElementsByName('omikujiScopeRadio');
    radios.forEach(r => {
        r.checked = (r.value === currentScope);
    });
    const authorsBox = document.getElementById('omikujiAuthorsBox');
    if (authorsBox) {
        if (currentScope === 'AUTHORS') {
            authorsBox.classList.remove('hidden');
            renderOmikujiAuthorsList();
        } else {
            authorsBox.classList.add('hidden');
        }
    }

    const cloudInput = document.getElementById('settingCloudSyncUrl');
    if (cloudInput) cloudInput.value = userSettings.cloudSyncUrl || '';
    updateCloudStatusBadge();
    updateSyncStatusUI();

    renderTrashList();
    document.getElementById('settingsModal').classList.remove('hidden');
}

function onOmikujiScopeChanged(scope) {
    userSettings.omikujiScope = scope;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));

    const authorsBox = document.getElementById('omikujiAuthorsBox');
    if (authorsBox) {
        if (scope === 'AUTHORS') {
            authorsBox.classList.remove('hidden');
            renderOmikujiAuthorsList();
        } else {
            authorsBox.classList.add('hidden');
        }
    }
}

function renderOmikujiAuthorsList() {
    const listEl = document.getElementById('omikujiAuthorsList');
    if (!listEl) return;

    const myName = userSettings.authorName || '風月';
    const authorCounts = {};
    haikuHistory.filter(h => h.status === '完成句').forEach(h => {
        const a = h.author || myName;
        authorCounts[a] = (authorCounts[a] || 0) + 1;
    });

    const authors = Object.keys(authorCounts).sort((a, b) => {
        if (a === myName) return -1;
        if (b === myName) return 1;
        return a.localeCompare(b, 'ja');
    });

    if (authors.length === 0) {
        listEl.innerHTML = '<div style="font-size: 0.74rem; color: #999; padding: 4px 0;">作者が登録されていません</div>';
        return;
    }

    if (!Array.isArray(userSettings.omikujiSelectedAuthors)) {
        userSettings.omikujiSelectedAuthors = [];
    }
    const selectedSet = new Set(userSettings.omikujiSelectedAuthors);

    listEl.innerHTML = authors.map(author => {
        const safeAuthor = escapeHtml(author);
        const count = authorCounts[author];
        const isChecked = selectedSet.has(author) ? 'checked' : '';
        return `
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.78rem; color: #444; cursor: pointer; padding: 3px 0; border-bottom: 1px solid #f0ede8;">
                <span style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" value="${safeAuthor}" ${isChecked} onchange="onOmikujiAuthorToggle('${safeAuthor}', this.checked)" style="cursor: pointer;">
                    <span>${safeAuthor}</span>
                </span>
                <span style="font-size: 0.72rem; color: #888;">${count}句</span>
            </label>
        `;
    }).join('');
}

function onOmikujiAuthorToggle(author, isChecked) {
    if (!Array.isArray(userSettings.omikujiSelectedAuthors)) {
        userSettings.omikujiSelectedAuthors = [];
    }
    if (isChecked) {
        if (!userSettings.omikujiSelectedAuthors.includes(author)) {
            userSettings.omikujiSelectedAuthors.push(author);
        }
    } else {
        userSettings.omikujiSelectedAuthors = userSettings.omikujiSelectedAuthors.filter(a => a !== author);
    }
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

// 🛡️ OSによる勝手なキャッシュ・ストレージ削除をブロック
function initPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then(granted => {
            if (granted) {
                console.log('🛡️ Persistent storage granted by OS.');
            }
        }).catch(() => {});
    }
}

// 🔄 ワンタップ安全更新（俳句データを1ミリも消さずにアプリだけ最新化）
async function checkForAppUpdate() {
    showToast('🔄 最新版を確認・更新しています...');
    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
                await reg.update();
                if (reg.waiting) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
            }
            if (window.caches) {
                const keys = await caches.keys();
                for (const key of keys) {
                    await caches.delete(key);
                }
            }
        }
    } catch (e) {
        console.warn('Update warning:', e);
    }
    setTimeout(() => {
        window.location.reload(true);
    }, 600);
}

// ♻️ ごみ箱管理（30日間保持 ＆ ワンタップ復元）
function loadTrashList() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_TRASH);
        if (saved) {
            trashList = JSON.parse(saved);
            const now = Date.now();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;
            trashList = trashList.filter(item => (now - (item.deletedAt || 0)) < thirtyDays);
            saveTrashList();
        }
    } catch (e) {}
    renderTrashList();
}

function saveTrashList() {
    try {
        localStorage.setItem(STORAGE_KEY_TRASH, JSON.stringify(trashList));
    } catch (e) {}
}

function restoreFromTrash(itemId) {
    const idx = trashList.findIndex(item => item.id === itemId);
    if (idx !== -1) {
        const item = trashList.splice(idx, 1)[0];
        item.status = item.originalStatus || '完成句';
        delete item.deletedAt;
        delete item.originalStatus;
        haikuHistory.unshift(item);
        saveLocalHaikus();
        saveTrashList();
        renderTrashList();
        if (document.getElementById('readScreen').classList.contains('active')) renderYomuList();
        showToast('句帳に復元しました！');
    }
}

function renderTrashList() {
    const container = document.getElementById('trashHaikuList');
    const emptyBtn = document.getElementById('emptyTrashBtn');
    if (!container) return;
    container.innerHTML = '';

    if (trashList.length === 0) {
        container.innerHTML = '<div class="trash-empty-msg">ごみ箱は空です</div>';
        if (emptyBtn) emptyBtn.style.display = 'none';
        return;
    }

    if (emptyBtn) emptyBtn.style.display = 'inline-block';

    trashList.forEach(item => {
        const row = document.createElement('div');
        row.className = 'trash-haiku-item';
        
        const textSpan = document.createElement('span');
        textSpan.className = 'trash-haiku-text';
        textSpan.textContent = item.phrase;
        
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'trash-restore-btn';
        restoreBtn.title = '句帳に復元';
        restoreBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 14 4 9 9 4"></polyline>
                <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
            </svg>
        `;
        // id があればidで、なければphraseにフォールバック（旧データ互換）
        const itemKey = item.id || item.phrase;
        restoreBtn.onclick = () => restoreFromTrash(itemKey);

        row.appendChild(textSpan);
        row.appendChild(restoreBtn);
        container.appendChild(row);
    });
}

function emptyTrashList() {
    if (!trashList || trashList.length === 0) {
        alert('ごみ箱はすでに空です。');
        return;
    }

    const ok = confirm(`ごみ箱内の全 ${trashList.length}句 を完全に削除しますか？\n\n※この操作は取り消せません。`);
    if (!ok) return;

    trashList = [];
    saveTrashList();
    renderTrashList();
    showToast('ゴミ箱を空にしました');
}

// 📝 テキスト一括取り込み機能（超インテリジェント・パーサー）
function openBatchImportModal() {
    const modal = document.getElementById('batchImportModal');
    const textarea = document.getElementById('batchImportTextarea');
    const authorInput = document.getElementById('batchAuthorName');
    const kanaInput = document.getElementById('batchAuthorKana');
    if (textarea) textarea.value = '';
    if (authorInput) authorInput.value = '';
    if (kanaInput) kanaInput.value = '';
    if (modal) modal.classList.remove('hidden');
}

function closeBatchImportModal() {
    const modal = document.getElementById('batchImportModal');
    if (modal) modal.classList.add('hidden');
}

function executeBatchImport() {
    const textarea = document.getElementById('batchImportTextarea');
    const rawText = textarea ? textarea.value.trim() : '';
    if (!rawText) {
        alert('取り込むテキストを入力してください。');
        return;
    }

    const modalAuthorInput = document.getElementById('batchAuthorName');
    const modalKanaInput = document.getElementById('batchAuthorKana');
    const modalAuthor = (modalAuthorInput ? modalAuthorInput.value.trim() : '');
    let modalKana = (modalKanaInput ? modalKanaInput.value.trim() : '');

    // モーダル指定作者が著名俳人マスターにあれば読み仮名を自動補完
    if (modalAuthor && !modalKana) {
        const famous = FAMOUS_AUTHORS_MASTER.find(a => a.name === modalAuthor);
        if (famous) modalKana = famous.kana;
    }

    let defaultAuthor = modalAuthor || userSettings.authorName || '風月';
    let defaultKana = modalKana || (modalAuthor ? '' : (userSettings.authorKana || 'ふうげつ'));

    let currentBatchAuthor = defaultAuthor;
    let currentBatchKana = defaultKana;

    const lines = rawText.split(/\r?\n/);
    let importedCount = 0;

    lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // 1. ブロック指定（例: 「作者：正岡子規」「作者: 松尾芭蕉」「【正岡子規】」）
        const authorBlockMatch = trimmed.match(/^(?:作者|著者|俳人)[：:]\s*(.+)$/) || trimmed.match(/^【(.+)】$/);
        if (authorBlockMatch) {
            currentBatchAuthor = authorBlockMatch[1].trim();
            const famous = FAMOUS_AUTHORS_MASTER.find(a => a.name === currentBatchAuthor);
            currentBatchKana = famous ? famous.kana : '';
            return;
        }

        let phrase = '';
        let author = currentBatchAuthor;
        let authorKana = currentBatchKana;

        // 2. 行内個別指定の判定（例: 「夕立やはちすを笠にかぶり行く 正岡子規」）
        const tokens = trimmed.split(/[\t\s]+/);
        if (tokens.length >= 2) {
            const candidateAuthor = tokens[tokens.length - 1];
            const matchFamous = FAMOUS_AUTHORS_MASTER.find(a => a.name === candidateAuthor);
            if (matchFamous) {
                author = matchFamous.name;
                authorKana = matchFamous.kana;
                phrase = tokens.slice(0, tokens.length - 1).join(' ');
            } else if (candidateAuthor.length <= 8 && tokens.length === 2) {
                author = candidateAuthor;
                authorKana = '';
                phrase = tokens[0];
            } else {
                phrase = trimmed;
            }
        } else {
            phrase = trimmed;
        }

        // 重複チェック（既に同じ句がある場合はスキップ）
        if (haikuHistory.some(h => h.phrase === phrase)) {
            return;
        }

        // 🧠 歳時記DBから季語・季節を最長一致で自動検知
        let detectedKigo = '無季';
        let detectedParentKigo = '無季';
        let detectedParentKana = 'むき';
        let detectedSeason = 'muki';
        let detectedDetail = '';

        let longestMatchLen = 0;

        if (saijikiDatabase && saijikiDatabase.length > 0) {
            for (const item of saijikiDatabase) {
                // 親季語とのマッチ
                if (item.kigo && phrase.includes(item.kigo) && item.kigo.length > longestMatchLen) {
                    longestMatchLen = item.kigo.length;
                    detectedKigo = item.kigo;
                    detectedParentKigo = item.kigo;
                    detectedParentKana = item.kana || '';
                    detectedSeason = item.season || 'muki';
                    detectedDetail = item.detailSeason || '';
                }
                // 子季語（関連季語）とのマッチ
                if (item.children && Array.isArray(item.children)) {
                    for (const c of item.children) {
                        const childName = (typeof c === 'string') ? c : (c.name || '');
                        if (childName && phrase.includes(childName) && childName.length > longestMatchLen) {
                            longestMatchLen = childName.length;
                            detectedKigo = childName;
                            detectedParentKigo = item.kigo;
                            detectedParentKana = item.kana || '';
                            detectedSeason = item.season || 'muki';
                            detectedDetail = item.detailSeason || '';
                        }
                    }
                }
            }
        }

        const newHaiku = {
            id: 'h-batch-' + Date.now() + '-' + idx,
            phrase: phrase,
            author: author,
            authorKana: authorKana,
            kigo: detectedKigo,
            parentKigo: detectedParentKigo,
            parentKana: detectedParentKana,
            season: detectedSeason,
            detailSeason: detectedDetail,
            status: '完成句',
            sakkuDate: '', // 一括取り込み時は日付不詳（空欄）とする
            createdAt: Date.now() - (lines.length - idx)
        };

        haikuHistory.unshift(newHaiku);
        syncHaikuToCloud(newHaiku);
        importedCount++;
    });

    if (importedCount > 0) {
        saveLocalHaikus();
        if (document.getElementById('readScreen').classList.contains('active')) {
            renderYomuList();
        }
        closeBatchImportModal();
        showToast(`✅ ${importedCount}句を一括取り込みました！`);
    } else {
        alert('取り込み可能な新しい句が見つかりませんでした（既に登録済みの可能性があります）。');
    }
}

function openExcelImportModal() {
    const modal = document.getElementById('excelImportModal');
    if (modal) modal.classList.remove('hidden');
}

function closeExcelImportModal() {
    const modal = document.getElementById('excelImportModal');
    if (modal) modal.classList.add('hidden');
}

function downloadSampleCsv() {
    const csvHeader = '俳句,作者,作者よみがな,季語,作句日\r\n';
    const sampleRows = [
        '閑さや岩にしみ入る蝉の声,松尾芭蕉,まつおばしょう,蝉,1689',
        '古池や蛙飛びこむ水の音,松尾芭蕉,まつおばしょう,蛙,1686',
        '菜の花や月は東に日は西に,与謝蕪村,よさぶそん,菜の花,1774',
        '春風や闘志いだきて丘に立つ,高浜虚子,たかはまきょし,春風,'
    ].join('\r\n');

    // UTF-8 BOM付き（Excel文字化け防止）
    const blob = new Blob(['\uFEFF' + csvHeader + sampleRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fugetsu_sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('見本CSVを保存しました');
}

async function executeExcelImport() {
    const inputEl = document.getElementById('excelImportUrlInput');
    const rawUrl = inputEl ? inputEl.value.trim() : '';
    if (!rawUrl) {
        alert('URLを入力してください。');
        return;
    }

    try {
        let fetchUrl = rawUrl;
        if (rawUrl.includes('docs.google.com/spreadsheets/d/')) {
            const sheetIdMatch = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
            if (sheetIdMatch && sheetIdMatch[1]) {
                const sheetId = sheetIdMatch[1];
                const gidMatch = rawUrl.match(/[#&?]gid=([0-9]+)/);
                const gid = gidMatch ? gidMatch[1] : '0';
                fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
            }
        }

        const resp = await fetch(fetchUrl);
        if (resp.ok) {
            const csvText = await resp.text();
            const count = parseAndMergeCsvHaikus(csvText);
            closeExcelImportModal();
            if (count > 0) {
                alert(`スプレッドシートから【${count}句】を取り込みました。`);
            } else {
                alert('取り込み可能な新しい句が見つかりませんでした（既に登録済みの可能性があります）。');
            }
            return;
        }
        alert('スプレッドシートからデータを読み取れませんでした。共有設定が「リンクを知っている全員が閲覧可」になっているかご確認ください。');
    } catch (e) {
        alert('スプレッドシートの読み込みに失敗しました：' + e.message);
    }
}

function openSyncKeyHelpModal() {
    const modal = document.getElementById('syncKeyHelpModal');
    if (modal) modal.classList.remove('hidden');
}

function closeSyncKeyHelpModal() {
    const modal = document.getElementById('syncKeyHelpModal');
    if (modal) modal.classList.add('hidden');
}

function copyGasCode() {
    const codeBlock = document.getElementById('gasScriptCodeBlock');
    if (codeBlock) {
        navigator.clipboard.writeText(codeBlock.value).then(() => {
            showToast('📋 GASコードをコピーしました！');
        }).catch(() => {
            codeBlock.select();
            document.execCommand('copy');
            showToast('📋 GASコードをコピーしました！');
        });
    }
}

function openCloudGuideModal() {
    const modal = document.getElementById('cloudGuideModal');
    if (modal) modal.classList.remove('hidden');
}

function closeCloudGuideModal() {
    const modal = document.getElementById('cloudGuideModal');
    if (modal) modal.classList.add('hidden');
}

// 🔑 暗号キー接続（手軽・リアルタイム完全同期）
let syncEventSource = null;
const myClientId = 'cli_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
let isSyncingStream = false;

function initSyncKeyListener() {
    if (!userSettings.syncKey) return;
    if (syncEventSource) {
        try { syncEventSource.close(); } catch(e) {}
        syncEventSource = null;
    }

    const cleanKey = userSettings.syncKey.replace(/[^a-zA-Z0-9]/g, '');
    if (!cleanKey) return;

    try {
        syncEventSource = new EventSource(`https://ntfy.sh/fugetsu-sync-${cleanKey}/sse`);
        syncEventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data && data.message) {
                    const payload = JSON.parse(data.message);
                    handleIncomingSyncPayload(payload);
                }
            } catch (e) {}
        };
        syncEventSource.onerror = () => {
            // 自動再接続待機
        };

        // 起動・接続時に相手端末へ「過去データ全同期リクエスト」を発行
        setTimeout(requestFullSyncFromPeers, 1000);
    } catch (e) {
        console.warn('SyncKey listener start error:', e);
    }
}

function broadcastSyncKeyPayload(payload) {
    if (!userSettings.syncKey) return;
    const cleanKey = userSettings.syncKey.replace(/[^a-zA-Z0-9]/g, '');
    if (!cleanKey) return;

    payload.senderClientId = myClientId;
    payload.timestamp = Date.now();

    try {
        fetch(`https://ntfy.sh/fugetsu-sync-${cleanKey}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        }).catch(e => console.warn('SyncKey broadcast silent fallback:', e));
    } catch (e) {}
}

// 🔄 相手端末へ「お互いの全句を同期しよう」と要求
function requestFullSyncFromPeers() {
    if (!userSettings.syncKey) return;
    const myPhrases = haikuHistory.map(h => h.phrase);
    broadcastSyncKeyPayload({
        type: 'REQUEST_FULL_SYNC',
        knownPhrases: myPhrases
    });
}

// 📥 相手から届いた同期メッセージの処理
async function handleIncomingSyncPayload(payload) {
    if (!payload || payload.senderClientId === myClientId) return; // 自分が送ったものは無視

    // ① 新規作句のリアルタイム同期
    if (payload.type === 'NEW_HAIKU' && payload.haiku) {
        const item = payload.haiku;
        if (item.phrase && !haikuHistory.some(h => h.phrase === item.phrase)) {
            haikuHistory.unshift(item);
            saveLocalHaikus();
            if (document.getElementById('readScreen').classList.contains('active')) {
                renderYomuList();
            }
            showToast(`✨ 他の端末から【${item.phrase}】が届きました！`);
        }
    }
    // ② 接続時の全句同期リクエストを受信 ➔ 相手が持っていない過去句をストリーム送信
    else if (payload.type === 'REQUEST_FULL_SYNC') {
        const peerPhrases = new Set(payload.knownPhrases || []);
        const toSend = haikuHistory.filter(h => !peerPhrases.has(h.phrase));
        
        if (toSend.length > 0) {
            showToast(`🔄 相手の端末へ ${toSend.length}句 を同期送信中...`);
            for (let i = 0; i < toSend.length; i++) {
                broadcastSyncKeyPayload({
                    type: 'STREAM_HAIKU_ITEM',
                    haiku: toSend[i],
                    index: i + 1,
                    total: toSend.length
                });
                await new Promise(r => setTimeout(r, 40)); // 制限回避の安全なウェイト
            }
            broadcastSyncKeyPayload({ type: 'STREAM_HAIKU_DONE', count: toSend.length });
        }

        // 相手の句で自分が持っていないものがあれば、こちらも要求する
        const myPhrasesSet = new Set(haikuHistory.map(h => h.phrase));
        const needed = (payload.knownPhrases || []).filter(p => !myPhrasesSet.has(p));
        if (needed.length > 0) {
            broadcastSyncKeyPayload({
                type: 'REQUEST_SPECIFIC_ITEMS',
                phrases: needed
            });
        }
    }
    // ③ 相手から過去句が1句ずつストリーム受信
    else if (payload.type === 'STREAM_HAIKU_ITEM' && payload.haiku) {
        const item = payload.haiku;
        if (item.phrase && !haikuHistory.some(h => h.phrase === item.phrase)) {
            haikuHistory.push(item);
            saveLocalHaikus();
            if (document.getElementById('readScreen').classList.contains('active')) {
                renderYomuList();
            }
        }
    }
    // ④ ストリーム受信完了
    else if (payload.type === 'STREAM_HAIKU_DONE') {
        showToast(`✨ 全同期完了！ ${payload.count}句 が反映され完全一致しました`);
    }
    // ⑤ 特定句の要求を受信
    else if (payload.type === 'REQUEST_SPECIFIC_ITEMS' && Array.isArray(payload.phrases)) {
        const neededSet = new Set(payload.phrases);
        const toSend = haikuHistory.filter(h => neededSet.has(h.phrase));
        for (let i = 0; i < toSend.length; i++) {
            broadcastSyncKeyPayload({
                type: 'STREAM_HAIKU_ITEM',
                haiku: toSend[i],
                index: i + 1,
                total: toSend.length
            });
            await new Promise(r => setTimeout(r, 40));
        }
    }
    // ⑥ 接続通知
    else if (payload.type === 'HELLO') {
        showToast('🔗 他の端末と接続しました！');
        requestFullSyncFromPeers();
    }
}

function updateSyncStatusUI() {
    const statusText = document.getElementById('syncStatusText');
    const inputEl = document.getElementById('inputSyncKey');
    if (!statusText) return;

    if (userSettings.syncKey) {
        statusText.textContent = `接続中（暗号キー: ${userSettings.syncKey}）`;
        statusText.style.color = '#2e7d32';
        if (inputEl) inputEl.value = userSettings.syncKey;
    } else {
        statusText.textContent = '未接続';
        statusText.style.color = '#888';
    }
}

function generateSyncKey() {
    const num1 = Math.floor(100 + Math.random() * 900);
    const num2 = Math.floor(100 + Math.random() * 900);
    const newKey = `${num1}-${num2}`;

    userSettings.syncKey = newKey;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    updateSyncStatusUI();
    initSyncKeyListener();
    broadcastSyncKeyPayload({ type: 'HELLO' });
    showToast(`暗号キー【${newKey}】を発行しました`);
}

function connectSyncKey() {
    const inputEl = document.getElementById('inputSyncKey');
    const key = inputEl ? inputEl.value.trim() : '';
    if (!key || key.length < 4) {
        alert('暗号キーを正しく入力してください');
        return;
    }

    userSettings.syncKey = key;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    updateSyncStatusUI();
    initSyncKeyListener();
    broadcastSyncKeyPayload({ type: 'HELLO' });
    alert(`暗号キー【${key}】で接続しました。\n相手端末の過去の句を含めて全自動で同期・一致させます。`);
}

// 手動でいつでも全同期を再実行できる関数
function triggerManualFullSync() {
    if (!userSettings.syncKey) {
        alert('合言葉で接続されていません');
        return;
    }
    showToast('🔄 相手端末へ全句の再同期を要求中...');
    requestFullSyncFromPeers();
}

// ☁️ クラウド自動同期（Googleスプレッドシート等への二重保存 ＆ 双方向受信）
async function saveCloudSyncSettings() {
    const urlInput = document.getElementById('settingCloudSyncUrl');
    let url = urlInput ? urlInput.value.trim() : '';
    if (!url) {
        userSettings.cloudSyncUrl = '';
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
        updateCloudStatusBadge();
        showToast('クラウド同期を解除しました');
        return;
    }

    userSettings.cloudSyncUrl = url;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    updateCloudStatusBadge();
    showToast('☁️ 同期URLを保存しました。データを取り込み中...');

    const res = await fetchHaikusFromCloud(true);
    if (res && res.success) {
        if (res.count > 0) {
            alert(`🎉 スプレッドシートから【${res.count}句】を取り込み、同期を完了しました！`);
        } else {
            alert('✅ スプレッドシートと同期完了しました（既に最新の状態です）');
        }
    } else if (res && res.error) {
        alert('⚠️ スプレッドシートの読み込みに失敗しました：\n' + res.error + '\n\n※スプレッドシートの共有が「リンクを知っている全員が閲覧可」、またはGASのアクセス権が「全員」になっているかご確認ください。');
    }
}

function updateCloudStatusBadge() {
    const badge = document.getElementById('cloudSyncStatusBadge');
    if (!badge) return;
    const isSet = !!(userSettings.cloudSyncUrl && userSettings.cloudSyncUrl.startsWith('http'));
    badge.textContent = isSet ? '同期中' : '未設定';
    badge.classList.toggle('active', isSet);
}

function syncHaikuToCloud(haikuObj, action = 'save', oldPhrase = '') {
    if (!userSettings.cloudSyncUrl || !userSettings.cloudSyncUrl.startsWith('http')) return;
    if (userSettings.cloudSyncUrl.includes('script.google.com')) {
        try {
            const params = new URLSearchParams();
            params.append('action', action);
            params.append('oldPhrase', oldPhrase || (haikuObj ? haikuObj.phrase : ''));
            if (haikuObj) {
                params.append('phrase', haikuObj.phrase || '');
                params.append('author', haikuObj.author || userSettings.authorName || '風月');
                params.append('authorKana', haikuObj.authorKana || userSettings.authorKana || '');
                params.append('kigo', haikuObj.kigo || '');
                params.append('parentKigo', haikuObj.parentKigo || '');
                params.append('parentKana', haikuObj.parentKana || '');
                params.append('season', haikuObj.season || '');
                params.append('detailSeason', haikuObj.detailSeason || '');
                params.append('status', haikuObj.status || '完成句');
                params.append('sakkuDate', haikuObj.sakkuDate || '');
            }

            // GETリクエストで送信（ブラウザのPOST/CORS遮断・リダイレクト消失を完全回避）
            const syncUrl = `${userSettings.cloudSyncUrl}?${params.toString()}`;
            fetch(syncUrl, {
                method: 'GET',
                mode: 'no-cors'
            }).catch(e => console.warn('Cloud sync background error:', e));
        } catch (e) {
            console.warn('Cloud sync error:', e);
        }
    }
}

// 📥 クラウド（スプレッドシート）から最新データを双方向受信・マージ
async function fetchHaikusFromCloud(isManual = false) {
    let rawUrl = userSettings.cloudSyncUrl;
    if (!rawUrl || !rawUrl.startsWith('http')) return { success: false, error: 'URLが未設定です' };

    try {
        // 通常のGoogleスプレッドシートURL（docs.google.com/spreadsheets/d/...）の場合
        if (rawUrl.includes('docs.google.com/spreadsheets/d/')) {
            const sheetIdMatch = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
            if (sheetIdMatch && sheetIdMatch[1]) {
                const sheetId = sheetIdMatch[1];
                const gidMatch = rawUrl.match(/[#&?]gid=([0-9]+)/);
                const gid = gidMatch ? gidMatch[1] : '0';
                
                // GViz API エンドポイント（CORS許可・gid対応）
                const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
                const resp = await fetch(csvUrl);
                if (resp.ok) {
                    const csvText = await resp.text();
                    const count = parseAndMergeCsvHaikus(csvText);
                    return { success: true, count: count };
                } else {
                    return { success: false, error: `スプレッドシートの取得に失敗しました（HTTP ${resp.status}）` };
                }
            }
        }

        // Web App URL（JSON返却形式）の場合
        const resp = await fetch(rawUrl, { method: 'GET', redirect: 'follow' });
        if (resp.ok) {
            const data = await resp.json();
            let rows = [];
            if (data && Array.isArray(data.rows)) {
                rows = data.rows;
            } else if (Array.isArray(data)) {
                rows = data;
            }

            if (rows.length > 0) {
                // 1. スプレッドシート（正本）から取得した句の一覧をパース
                const cloudHaikus = [];
                const cloudPhraseSet = new Set();

                rows.forEach((r, idx) => {
                    let phrase = '';
                    let author = '';
                    let authorKana = '';
                    let kigo = '';
                    let parentKigo = '';
                    let parentKana = '';
                    let season = '';
                    let detailSeason = '';
                    let status = '完成句';
                    let sakkuDate = '';

                    if (Array.isArray(r)) {
                        phrase = (r[0] || '').toString().trim();
                        if (phrase === '俳句' || phrase === 'phrase' || !phrase) return; // ヘッダー行スキップ
                        author = (r[1] || '').toString().trim() || userSettings.authorName || '風月';
                        authorKana = (r[2] || '').toString().trim() || userSettings.authorKana || '';
                        kigo = (r[3] || '').toString().trim();
                        parentKigo = (r[4] || '').toString().trim();
                        parentKana = (r[5] || '').toString().trim();
                        season = (r[6] || '').toString().trim();
                        detailSeason = (r[7] || '').toString().trim();
                        status = (r[10] || '').toString().trim() || '完成句';
                        sakkuDate = normalizeSakkuDate((r[11] || '').toString().trim());
                    } else if (typeof r === 'object' && r.phrase) {
                        phrase = r.phrase.trim();
                        if (!phrase) return;
                        author = r.author || userSettings.authorName || '風月';
                        authorKana = r.authorKana || userSettings.authorKana || '';
                        kigo = r.kigo || '';
                        parentKigo = r.parentKigo || '';
                        parentKana = r.parentKana || '';
                        season = r.season || '';
                        detailSeason = r.detailSeason || '';
                        status = r.status || '完成句';
                        sakkuDate = normalizeSakkuDate(r.sakkuDate || '');
                    }

                    if (phrase) {
                        cloudPhraseSet.add(phrase);
                        const existing = haikuHistory.find(h => h.phrase === phrase);
                        cloudHaikus.push({
                            id: existing ? existing.id : ('cloud_' + Date.now() + '_' + idx),
                            phrase,
                            author,
                            authorKana,
                            kigo,
                            parentKigo,
                            parentKana,
                            season,
                            detailSeason,
                            status,
                            sakkuDate,
                            createdAt: existing ? existing.createdAt : (Date.now() - (rows.length - idx))
                        });
                    }
                });

                // 2. オフライン中に端末ローカルで作成された句（SSに未反映の句）を検出・保護
                const offlineCreatedHaikus = haikuHistory.filter(h => h.phrase && !cloudPhraseSet.has(h.phrase));
                if (offlineCreatedHaikus.length > 0) {
                    offlineCreatedHaikus.forEach(offItem => {
                        cloudHaikus.unshift(offItem);
                        // スプレッドシートへ自動バックグラウンド追記
                        syncHaikuToCloud(offItem, 'save');
                    });
                }

                // 3. スプレッドシートの正本状態でローカル句帳を完全一致同期
                haikuHistory = cloudHaikus;
                saveLocalHaikus();

                if (document.getElementById('readScreen').classList.contains('active')) {
                    renderYomuList();
                }

                if (isManual) {
                    showToast(`☁️ スプレッドシートと完全同期しました（${cloudHaikus.length}句）`);
                }
                return { success: true, count: cloudHaikus.length };
            } else {
                return { success: true, count: 0 };
            }
        } else {
            return { success: false, error: `GASからのデータ取得に失敗しました（HTTP ${resp.status}）` };
        }
    } catch (e) {
        console.warn('Cloud fetch silent fallback:', e);
        return { success: false, error: e.message };
    }
}

// 📄 CSV文字列（引用符対応）をパースしてローカル句帳にマージする高度パーサー
function parseAndMergeCsvHaikus(csvText) {
    if (!csvText) return 0;
    const lines = parseCSVRows(csvText);
    if (lines.length < 2) return 0;

    // 1行目のヘッダー行から各列のインデックスを自動検出
    const headers = lines[0].map(h => h.trim());
    let phraseIdx = headers.findIndex(h => /^(俳句|句|phrase)$/i.test(h));
    if (phraseIdx === -1) phraseIdx = 0; // デフォルト1列目

    let authorIdx = headers.findIndex(h => /^(作者|作者名|author)$/i.test(h));
    let authorKanaIdx = headers.findIndex(h => /^(作者よみがな|作者カナ|authorKana)$/i.test(h));
    let kigoIdx = headers.findIndex(h => /^(季語|kigo)$/i.test(h));
    let parentKigoIdx = headers.findIndex(h => /^(親季語|parentKigo)$/i.test(h));
    let parentKanaIdx = headers.findIndex(h => /^(季語よみがな|季語カナ|親季語よみがな|parentKana)$/i.test(h));
    let seasonIdx = headers.findIndex(h => /^(季節|season)$/i.test(h));
    let detailSeasonIdx = headers.findIndex(h => /^(詳細季節|時候|detailSeason)$/i.test(h));
    let statusIdx = headers.findIndex(h => /^(状態|ステータス|status)$/i.test(h));
    let sakkuDateIdx = headers.findIndex(h => /^(作句日|日付|date|sakkuDate)$/i.test(h));

    const defaultAuthor = userSettings.authorName || '風月';
    const defaultKana = userSettings.authorKana || 'ふうげつ';
    let mergedCount = 0;

    const seasonMap = {
        '春': 'haru', '夏': 'natsu', '秋': 'aki', '冬': 'huyu', '新年': 'shinnen', '無季': 'muki',
        'haru': 'haru', 'natsu': 'natsu', 'aki': 'aki', 'huyu': 'huyu', 'shinnen': 'shinnen', 'muki': 'muki'
    };

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row || row.length === 0) continue;
        const phrase = (row[phraseIdx] || '').trim();
        if (!phrase) continue;

        if (!haikuHistory.some(h => h.phrase === phrase)) {
            let author = (authorIdx !== -1 && row[authorIdx]) ? row[authorIdx].trim() : defaultAuthor;
            let authorKana = (authorKanaIdx !== -1 && row[authorKanaIdx]) ? row[authorKanaIdx].trim() : (author === defaultAuthor ? defaultKana : '');
            let kigo = (kigoIdx !== -1 && row[kigoIdx]) ? row[kigoIdx].trim() : '';
            let parentKigo = (parentKigoIdx !== -1 && row[parentKigoIdx]) ? row[parentKigoIdx].trim() : (kigo || '無季');
            let parentKana = (parentKanaIdx !== -1 && row[parentKanaIdx]) ? row[parentKanaIdx].trim() : '';
            let rawSeason = (seasonIdx !== -1 && row[seasonIdx]) ? row[seasonIdx].trim() : '';
            let season = seasonMap[rawSeason] || (rawSeason ? rawSeason : 'muki');
            let detailSeason = (detailSeasonIdx !== -1 && row[detailSeasonIdx]) ? row[detailSeasonIdx].trim() : '';
            let status = (statusIdx !== -1 && row[statusIdx]) ? row[statusIdx].trim() : '完成句';
            let sakkuDate = (sakkuDateIdx !== -1 && row[sakkuDateIdx]) ? normalizeSakkuDate(row[sakkuDateIdx].trim()) : '';

            // 季語が空欄なら歳時記DBから自動補完
            if (!kigo && saijikiDatabase && saijikiDatabase.length > 0) {
                let longestMatchLen = 0;
                for (const item of saijikiDatabase) {
                    if (item.kigo && phrase.includes(item.kigo) && item.kigo.length > longestMatchLen) {
                        longestMatchLen = item.kigo.length;
                        kigo = item.kigo;
                        parentKigo = item.kigo;
                        parentKana = item.kana || '';
                        season = item.season || 'muki';
                        detailSeason = item.detailSeason || '';
                    }
                }
            }

            haikuHistory.push({
                id: 'h-sheet-' + Date.now() + '-' + i,
                phrase: phrase,
                author: author || defaultAuthor,
                authorKana: authorKana,
                kigo: kigo || '無季',
                parentKigo: parentKigo || '無季',
                parentKana: parentKana,
                season: season || 'muki',
                detailSeason: detailSeason,
                status: status || '完成句',
                sakkuDate: sakkuDate,
                createdAt: Date.now() - (lines.length - i)
            });
            mergedCount++;
        }
    }

    if (mergedCount > 0) {
        saveLocalHaikus();
        if (document.getElementById('readScreen').classList.contains('active')) {
            renderYomuList();
        }
        showToast(`☁️ スプレッドシートから ${mergedCount}句 を同期しました！`);
    } else {
        showToast('☁️ スプレッドシートと同期完了（最新の状態です）');
    }
    return mergedCount;
}

// 引用符（ダブルクォーテーション）対応の完全なCSV行パーサー
function parseCSVRows(text) {
    const p = [[]];
    let row = p[0], s = true;
    let value = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];
        if (c === '"') {
            if (s && next === '"') { value += '"'; i++; }
            else { s = !s; }
        } else if (c === ',' && s) {
            row.push(value); value = '';
        } else if ((c === '\r' || c === '\n') && s) {
            if (c === '\r' && next === '\n') i++;
            row.push(value); value = '';
            row = []; p.push(row);
        } else {
            value += c;
        }
    }
    if (value || row.length > 0) row.push(value);
    return p.filter(r => r.length > 0 && r.some(cell => cell.trim()));
}

// 💡 定期バックアップ案内
function checkBackupReminder() {
    // 新規ユーザー・初期化前は絶対に表示しない
    if (!userSettings.initialized) return;

    const myName = userSettings.authorName || '風月';
    const myKanseiCount = haikuHistory.filter(h => h.status === '完成句' && (!h.author || h.author === myName)).length;

    // 自作の句が10句以上ない場合は表示しない
    if (myKanseiCount < 10) return;

    const savedLastBackup = localStorage.getItem(STORAGE_KEY_LAST_BACKUP);
    if (!savedLastBackup) {
        localStorage.setItem(STORAGE_KEY_LAST_BACKUP, String(Date.now()));
        return;
    }

    const lastBackup = parseInt(savedLastBackup, 10);
    const daysSinceLastBackup = (Date.now() - lastBackup) / (1000 * 60 * 60 * 24);

    // 30日以上経過時のみ案内
    if (daysSinceLastBackup >= 30) {
        const modal = document.getElementById('backupReminderModal');
        const msg = document.getElementById('backupReminderMsg');
        if (modal && msg) {
            msg.innerHTML = `大切な作品が <strong>${myKanseiCount}句</strong> 蓄積されています。<br>万が一のスマホ故障や紛失に備えて、端末にバックアップを保存しますか？`;
            modal.classList.remove('hidden');
        }
    }
}

function acceptBackupReminder() {
    closeBackupReminderModal();
    exportHaikuData();
    localStorage.setItem(STORAGE_KEY_LAST_BACKUP, String(Date.now()));
    showToast('バックアップを保存しました');
}

function closeBackupReminderModal() {
    const modal = document.getElementById('backupReminderModal');
    if (modal) modal.classList.add('hidden');
    localStorage.setItem(STORAGE_KEY_LAST_BACKUP, String(Date.now() - (23 * 24 * 60 * 60 * 1000)));
}

// 🔔 トースト通知ヘルパー
let _toastTimer = null;
function showToast(msg) {
    const toast = document.getElementById('appToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
        _toastTimer = null;
    }, 2800);
}

function onSettingCheckboxChanged() {
    const startupChk = document.getElementById('settingStartupOmikuji');
    const hideHomeKiyoseChk = document.getElementById('settingHideHomeKiyose');

    if (startupChk) userSettings.startupOmikuji = startupChk.checked;
    if (hideHomeKiyoseChk) userSettings.hideHomeKiyose = hideHomeKiyoseChk.checked;

    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    applyUserSettingsToUI();
}

function setFontSizeMode(mode) {
    userSettings.fontSizeMode = mode;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    applyUserSettingsToUI();
}

function setFontFamilyMode(mode) {
    userSettings.fontFamily = mode;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    applyUserSettingsToUI();
}

function saveAuthorSettings() {
    const nameEl = document.getElementById('settingAuthorName');
    const kanaEl = document.getElementById('settingAuthorKana');
    const name = (nameEl ? nameEl.value.trim() : '') || '風月';
    const kana = (kanaEl ? kanaEl.value.trim() : '') || 'ふうげつ';
    userSettings.authorName = name;
    userSettings.authorKana = kana;
    userSettings.initialized = true;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    applyUserSettingsToUI();
    closeSettingsModal();
    alert('設定を保存しました。');
}

function completeWelcomeSetup() {
    const nameEl = document.getElementById('welcomeAuthorName');
    const kanaEl = document.getElementById('welcomeAuthorKana');
    const name = (nameEl ? nameEl.value.trim() : '') || '風月';
    const kana = (kanaEl ? kanaEl.value.trim() : '') || 'ふうげつ';
    userSettings.authorName = name;
    userSettings.authorKana = kana;
    userSettings.initialized = true;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    localStorage.setItem(STORAGE_KEY_LAST_BACKUP, String(Date.now()));
    updateHeaderTitle();
    const modal = document.getElementById('welcomeModal');
    if (modal) modal.classList.add('hidden');
}

// 漢数字表記の旧暦（例：旧暦七月十五日（文月））をアラビア数字（7月15日（文月））に変換するヘルパー
function convertKanjiDateToArabic(str) {
    if (!str) return '';
    let s = str.replace(/^旧暦/, '');
    
    function kanjiToNum(kStr) {
        const kanjiDigits = { '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
        if (kStr === '十') return 10;
        if (kStr.startsWith('十')) return 10 + (kanjiDigits[kStr[1]] || 0);
        if (kStr.endsWith('十')) return (kanjiDigits[kStr[0]] || 1) * 10;
        if (kStr.includes('十')) {
            const parts = kStr.split('十');
            return (kanjiDigits[parts[0]] || 1) * 10 + (kanjiDigits[parts[1]] || 0);
        }
        if (kStr === '二十') return 20;
        if (kStr === '三十') return 30;
        return kanjiDigits[kStr] !== undefined ? kanjiDigits[kStr] : kStr;
    }

    return s.replace(/([閏]?)([一二三四五六七八九十]+)月([一二三四五六七八九十]+)日/g, (match, leap, m, d) => {
        return `${leap}${kanjiToNum(m)}月${kanjiToNum(d)}日`;
    });
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
    const wafuList = ['睦月','如月','弥生','卯月','皐月','水無月','文月','葉月','長月','神無月','霜月','師走'];

    // ① 新暦（アラビア数字）: 2026年8月27日（葉月）
    document.getElementById('koyomiModalDate').textContent = `${year}年${month}月${date}日（${wafuList[month - 1]}）`;
    
    // ② 旧暦（一段下げ・アラビア数字）: 7月15日（文月）
    const lunarRaw = todayData.lunar || '';
    const lunarFormatted = convertKanjiDateToArabic(lunarRaw);
    const lunarEl = document.getElementById('koyomiModalLunar');
    if (lunarFormatted) {
        lunarEl.textContent = lunarFormatted;
        lunarEl.style.display = 'block';
    } else {
        lunarEl.style.display = 'none';
    }

    // 節気・候の探索
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

    // ③ 節気（一段下げ）: 節気：処暑
    const sekkiEl = document.getElementById('koyomiModalSekki');
    if (currentSekki) {
        sekkiEl.textContent = `節気：${currentSekki}`;
        sekkiEl.style.display = 'block';
    } else {
        sekkiEl.style.display = 'none';
    }

    // ④ 候（一段下げ）: 候：綿柎開（わたのはなしべひらく）
    const kouEl = document.getElementById('koyomiModalKou');
    if (currentKou) {
        kouEl.textContent = `候：${currentKou}${currentKouYomi ? `（${currentKouYomi}）` : ''}`;
        kouEl.style.display = 'block';
    } else {
        kouEl.style.display = 'none';
    }

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
        haikus: haikuHistory,
        trash: trashList   // ごみ箱データも保存
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
                const trashCount = Array.isArray(data.trash) ? data.trash.length : 0;
                const confirmMsg = trashCount > 0
                    ? `句帳データ（${data.haikus.length}句）とごみ箱（${trashCount}句）を読み込みますか？\n（現在の句帳に追加・統合されます）`
                    : `句帳データ（${data.haikus.length}句）を読み込みますか？\n（現在の句帳に追加・統合されます）`;
                if (confirm(confirmMsg)) {
                    // 句帳マージ（phraseで重複チェック）
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

                    // ごみ箱マージ（idで重複チェック）
                    let trashAddedCount = 0;
                    if (Array.isArray(data.trash)) {
                        const existingTrashIds = new Set(trashList.map(t => t.id));
                        data.trash.forEach(item => {
                            const key = item.id || item.phrase;
                            if (!existingTrashIds.has(key)) {
                                trashList.push(item);
                                existingTrashIds.add(key);
                                trashAddedCount++;
                            }
                        });
                        if (trashAddedCount > 0) saveTrashList();
                    }

                    if (data.settings && data.settings.authorName) {
                        userSettings = Object.assign(userSettings, data.settings);
                        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
                        updateHeaderTitle();
                    }
                    const trashMsg = trashAddedCount > 0 ? `\nごみ箱から ${trashAddedCount} 句を復元しました。` : '';
                    alert(`バックアップから ${addedCount} 句を復元しました！${trashMsg}`);
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
    updateCatVisibility(true);
    document.querySelectorAll('.step-screen').forEach(el => el.classList.remove('active'));
    document.getElementById('startScreen').classList.add('active');
}

function startEmuMode() {
    updateCatVisibility(false);
    editingHaikuObj = null;
    currentHaikuData.oldPhrase = ''; 
    setStep1Phrase('');
    document.getElementById('authorInput').value = userSettings.authorName || '風月';
    document.getElementById('authorKanaInput').value = userSettings.authorKana || 'ふうげつ';
    setTodaySakkuDate();
    hideAuthorSuggestions();
    goToStep(1);
    setTimeout(focusStep1DirectInput, 60);
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
    updateCatVisibility(false);
}

function switchReadTab(status) {
    currentReadTab = status;
    currentKuchoSingleIndex = 0;
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
function applyPhraseLengthClass(element, text) {
    if (!element) return;
    const len = (text || '').length;
    element.classList.remove('long-phrase', 'extra-long-phrase');
    if (len >= 22) {
        element.classList.add('extra-long-phrase');
    } else if (len >= 18) {
        element.classList.add('long-phrase');
    }
}

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

    const scrollContainer = document.getElementById('readHaikuList');
    const singleContainer = document.getElementById('readSingleContainer');
    const isSingleMode = (userSettings.kuchoDisplayMode === 'single');

    if (targetHaikus.length === 0) {
        currentKuchoHaikus = [];
        if (isSingleMode && singleContainer) {
            scrollContainer?.classList.add('hidden');
            singleContainer.classList.remove('hidden');
            renderKuchoSingleView();
        } else if (scrollContainer) {
            singleContainer?.classList.add('hidden');
            scrollContainer.classList.remove('hidden');
            scrollContainer.innerHTML = `<div style="text-align:center; color:#888; margin:auto; font-size:0.9rem;">該当する${currentReadTab}はありません。</div>`;
        }
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

    currentKuchoHaikus = targetHaikus;

    // 一句ずつ表示モードの場合
    if (isSingleMode) {
        if (scrollContainer) scrollContainer.classList.add('hidden');
        if (singleContainer) singleContainer.classList.remove('hidden');
        renderKuchoSingleView();
        return;
    }

    // スクロール表示モードの場合
    if (singleContainer) singleContainer.classList.add('hidden');
    if (scrollContainer) scrollContainer.classList.remove('hidden');

    let lastGroupKey = '';
    targetHaikus.forEach(item => {
        if (item._parsedDate.groupKey !== lastGroupKey) {
            lastGroupKey = item._parsedDate.groupKey;
            const divider = document.createElement('div');
            divider.className = 'date-divider-card';
            divider.textContent = item._parsedDate.label;
            scrollContainer.appendChild(divider);
        }
        const card = document.createElement('div');
        card.className = 'saijiki-haiku-card';
        card.onclick = () => window.onHaikuCardClicked(item); 
        
        const phraseDiv = document.createElement('div');
        phraseDiv.className = 'saijiki-phrase';
        phraseDiv.textContent = item.phrase;
        applyPhraseLengthClass(phraseDiv, item.phrase);
        card.appendChild(phraseDiv);
        
        scrollContainer.appendChild(card);
    });

    requestAnimationFrame(() => { scrollContainer.scrollLeft = scrollContainer.scrollWidth; });
}

let currentKuchoHaikus = [];
let currentKuchoSingleIndex = 0;

function renderKuchoSingleView() {
    const singleContainer = document.getElementById('readSingleContainer');
    if (!singleContainer) return;

    if (!currentKuchoHaikus || currentKuchoHaikus.length === 0) {
        const phraseEl = document.getElementById('kuchoSinglePhrase');
        if (phraseEl) phraseEl.textContent = `該当する${currentReadTab}はありません`;
        const counterEl = document.getElementById('kuchoSingleCounter');
        if (counterEl) counterEl.textContent = `0 / 0`;
        return;
    }

    if (currentKuchoSingleIndex < 0) currentKuchoSingleIndex = 0;
    if (currentKuchoSingleIndex >= currentKuchoHaikus.length) currentKuchoSingleIndex = currentKuchoHaikus.length - 1;

    const cur = currentKuchoHaikus[currentKuchoSingleIndex];
    const phraseEl = document.getElementById('kuchoSinglePhrase');
    if (phraseEl) {
        phraseEl.textContent = cur.phrase;
        applyPhraseLengthClass(phraseEl, cur.phrase);
    }

    const counterEl = document.getElementById('kuchoSingleCounter');
    if (counterEl) {
        counterEl.textContent = `${currentKuchoSingleIndex + 1} / ${currentKuchoHaikus.length}`;
    }

    hideKuchoSingleDateInfo();
}

function changeKuchoSingleHaiku(direction) {
    if (!currentKuchoHaikus || currentKuchoHaikus.length === 0) return;
    currentKuchoSingleIndex = (currentKuchoSingleIndex + direction + currentKuchoHaikus.length) % currentKuchoHaikus.length;
    renderKuchoSingleView();
}

function toggleKuchoSingleDateInfo() {
    const box = document.getElementById('kuchoSingleInfoBox');
    if (!box) return;
    if (box.classList.contains('hidden')) {
        showKuchoSingleDateInfo();
    } else {
        hideKuchoSingleDateInfo();
    }
}

function showKuchoSingleDateInfo() {
    if (!currentKuchoHaikus || currentKuchoHaikus.length === 0) return;
    const cur = currentKuchoHaikus[currentKuchoSingleIndex];
    const box = document.getElementById('kuchoSingleInfoBox');
    const dateEl = document.getElementById('kuchoSingleInfoDate');
    if (box && dateEl && cur) {
        dateEl.textContent = formatDateArabic(cur.sakkuDate);
        box.classList.remove('hidden');
    }
}

function hideKuchoSingleDateInfo() {
    const box = document.getElementById('kuchoSingleInfoBox');
    if (box) box.classList.add('hidden');
}

function onCurrentSingleHaikuClicked() {
    if (!currentKuchoHaikus || currentKuchoHaikus.length === 0) return;
    const cur = currentKuchoHaikus[currentKuchoSingleIndex];
    if (cur) window.onHaikuCardClicked(cur);
}

window.onHaikuCardClicked = function(haikuObj) {
    activeSelectedHaiku = haikuObj;
    const modalPhraseEl = document.getElementById('modalPhrase');
    modalPhraseEl.textContent = haikuObj.phrase;
    applyPhraseLengthClass(modalPhraseEl, haikuObj.phrase);
    const actionsContainer = document.getElementById('modalActions');

    if (haikuObj.status === '完成句') {
        actionsContainer.innerHTML = `
            <span class="text-action-btn primary" onclick="editSelectedHaiku()">修正</span>
            <span class="action-divider">|</span>
            <span class="text-action-btn" onclick="changeHaikuStatus('下書き')">下書きへ</span>
            <span class="action-divider">|</span>
            <span class="text-action-btn danger" onclick="deleteSelectedDraft()">削除</span>
        `;
    } else {
        actionsContainer.innerHTML = `
            <span class="text-action-btn primary" onclick="editSelectedHaiku()">修正</span>
            <span class="action-divider">|</span>
            <span class="text-action-btn" onclick="changeHaikuStatus('完成句')">完成句へ</span>
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
        syncHaikuToCloud(haikuHistory[idx], 'changeStatus');
    }
    if (document.getElementById('readScreen').classList.contains('active')) renderYomuList();
}

function deleteSelectedDraft() {
    if (!activeSelectedHaiku) return;
    if (!confirm('この句をごみ箱に移動しますか？\n（30日以内であれば「設定」のごみ箱からいつでも復元できます）')) return;
    closeHaikuDetailModal();

    const targetIndex = haikuHistory.findIndex(h => h.phrase === activeSelectedHaiku.phrase);
    if (targetIndex !== -1) {
        const deletedItem = Object.assign({}, haikuHistory[targetIndex], {
            deletedAt: Date.now(),
            originalStatus: haikuHistory[targetIndex].status
        });
        trashList.unshift(deletedItem);
        saveTrashList();
        haikuHistory.splice(targetIndex, 1);
        saveLocalHaikus();
        syncHaikuToCloud(deletedItem, 'delete');
        renderTrashList();
        showToast('句をごみ箱に移動しました（いつでも復元可能）');
    }
    if (document.getElementById('readScreen').classList.contains('active')) renderYomuList();
}

// ========================================================
// 🎲 おみ句じ鑑賞（全作者均等シャッフル ＆ ブラインド鑑賞）
// ========================================================
function triggerRandomOmikuji() {
    let kanseiHaikus = haikuHistory.filter(h => h.status === '完成句');
    if (kanseiHaikus.length === 0) { alert('鑑賞できる完成句がありません。'); return; }

    const myName = userSettings.authorName || '風月';
    const scope = userSettings.omikujiScope || 'ALL';

    if (scope === 'MINE') {
        kanseiHaikus = kanseiHaikus.filter(h => (h.author || myName) === myName);
    } else if (scope === 'AUTHORS') {
        const selectedAuthors = userSettings.omikujiSelectedAuthors || [];
        if (selectedAuthors.length > 0) {
            const authorSet = new Set(selectedAuthors);
            kanseiHaikus = kanseiHaikus.filter(h => authorSet.has(h.author || myName));
        } else {
            alert('おみ句じで表示する作者が選択されていません。\n「設定 ➔ 七、おみ句じ機能の設定」で作者を選択してください。');
            return;
        }
    }

    if (kanseiHaikus.length === 0) {
        alert('指定された条件（自分の句／特定作者）に該当する完成句がありません。');
        return;
    }

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
    hideOmikujiAuthor(); // 最初は答えを隠す（ブラインド）
    renderOmikujiDisplay();

    document.querySelectorAll('.step-screen').forEach(el => el.classList.remove('active'));
    document.getElementById('omikujiRoomScreen').classList.add('active');
    updateCatVisibility(false);
}

function changeOmikujiHaiku(direction) {
    if (omikujiIndex + direction >= 0 && omikujiIndex + direction < omikujiPool.length) {
        omikujiIndex += direction;
        hideOmikujiAuthor(); // 次の句へ進んだら再び「i」ボタンに戻す
        renderOmikujiDisplay();
    }
}

function renderOmikujiDisplay() {
    const cur = omikujiPool[omikujiIndex];
    const phraseEl = document.getElementById('omikujiPhrase');
    phraseEl.textContent = cur.phrase;
    applyPhraseLengthClass(phraseEl, cur.phrase);
    document.getElementById('prevBtn').classList.toggle('disabled', omikujiIndex === 0);
    document.getElementById('nextBtn').classList.toggle('disabled', omikujiIndex === omikujiPool.length - 1);

    // 作者名のみセット
    const authorEl = document.getElementById('omikujiInfoAuthor');
    if (authorEl) {
        authorEl.textContent = cur.author || userSettings.authorName || '風月';
    }
}

function showOmikujiAuthor() {
    const btn = document.getElementById('omikujiInfoBtn');
    const box = document.getElementById('omikujiInfoBox');
    if (btn) btn.classList.add('hidden');
    if (box) box.classList.remove('hidden');
}

function hideOmikujiAuthor() {
    const btn = document.getElementById('omikujiInfoBtn');
    const box = document.getElementById('omikujiInfoBox');
    if (box) box.classList.add('hidden');
    if (btn) btn.classList.remove('hidden');
}

function hideOmikujiInfo() {
    hideOmikujiAuthor();
}

function initKeyboardEvents() {
    document.addEventListener('keydown', function(e) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

        // 🎲 おみくじ画面でのキーボード操作
        const omikujiRoom = document.getElementById('omikujiRoomScreen');
        if (omikujiRoom && omikujiRoom.classList.contains('active')) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') changeOmikujiHaiku(-1);
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') changeOmikujiHaiku(1);
            return;
        }

        // 📖 句帳（一句ずつ表示モード）でのキーボード操作
        const readScreen = document.getElementById('readScreen');
        if (readScreen && readScreen.classList.contains('active') && userSettings.kuchoDisplayMode === 'single') {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                changeKuchoSingleHaiku(1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                changeKuchoSingleHaiku(-1);
            }
        }
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
    
    setStep1Phrase(activeSelectedHaiku.phrase);
    document.getElementById('kigoInput').value = activeSelectedHaiku.parentKigo || activeSelectedHaiku.kigo || '';
    if (activeSelectedHaiku.season) document.getElementById('seasonSelect').value = activeSelectedHaiku.season;
    if (activeSelectedHaiku.detailSeason) document.getElementById('detailSeasonSelect').value = activeSelectedHaiku.detailSeason;
    
    document.getElementById('authorInput').value = activeSelectedHaiku.author || userSettings.authorName || '風月';
    document.getElementById('authorKanaInput').value = activeSelectedHaiku.authorKana || userSettings.authorKana || 'ふうげつ';
    populateSakkuDateFields(activeSelectedHaiku.sakkuDate || '');

    hideAuthorSuggestions();
    goToStep(1);
    setTimeout(focusStep1DirectInput, 60);
}

function goToStep(stepNumber) {
    updateCatVisibility(false);
    hideAuthorSuggestions();
    document.querySelectorAll('.step-screen').forEach(el => el.classList.remove('active'));
    document.getElementById(`step${stepNumber}`).classList.add('active');
}

// レーベンシュタイン距離による文字列類似度（0.0 〜 1.0）
function calculateHaikuSimilarity(str1, str2) {
    if (!str1 || !str2) return 0.0;
    const s1 = str1.replace(/[\s、。！？!?,.・]/g, '');
    const s2 = str2.replace(/[\s、。！？!?,.・]/g, '');
    if (!s1 || !s2) return 0.0;
    if (s1 === s2) return 1.0;

    const len1 = s1.length;
    const len2 = s2.length;
    let prevRow = Array.from({ length: len2 + 1 }, (_, i) => i);

    for (let i = 0; i < len1; i++) {
        const curRow = [i + 1];
        for (let j = 0; j < len2; j++) {
            const cost = s1[i] === s2[j] ? 0 : 1;
            curRow.push(Math.min(
                curRow[j] + 1,       // 挿入
                prevRow[j + 1] + 1,   // 削除
                prevRow[j] + cost     // 置換
            ));
        }
        prevRow = curRow;
    }

    const dist = prevRow[len2];
    const maxLen = Math.max(len1, len2);
    return 1.0 - (dist / maxLen);
}

// 登録済みの句の中から類似句（85%以上一致）を探す
function findSimilarExistingHaiku(phrase, excludePhrase = '') {
    if (!haikuHistory || haikuHistory.length === 0) return null;
    let highestMatch = null;
    let maxSim = 0;

    for (const h of haikuHistory) {
        if (!h.phrase) continue;
        if (excludePhrase && h.phrase === excludePhrase) continue; // 編集中の自分自身は除外

        const sim = calculateHaikuSimilarity(phrase, h.phrase);
        if (sim >= 0.85 && sim > maxSim) {
            maxSim = sim;
            highestMatch = {
                phrase: h.phrase,
                similarity: sim,
                status: h.status,
                author: h.author
            };
        }
    }
    return highestMatch;
}

function goToStep2() {
    const phraseInput = getStep1Phrase();
    if (!phraseInput) { alert('句を入力してください。'); return; }

    // 85%以上の類似句（または同じ句）が既に登録されているかチェック
    const similar = findSimilarExistingHaiku(phraseInput, currentHaikuData.oldPhrase);
    if (similar) {
        const matchPercent = Math.round(similar.similarity * 100);
        const confirmMsg = `既に似た俳句（または同じ俳句）が登録されています：\n\n「${similar.phrase}」\n（一致率: ${matchPercent}%）\n\nこのまま進んで登録を続けますか？`;
        if (!confirm(confirmMsg)) {
            return; // キャンセルされたら入力画面に留まる
        }
    }

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

    const previewPhraseEl = document.getElementById('previewPhrase');
    previewPhraseEl.textContent = currentHaikuData.phrase;
    applyPhraseLengthClass(previewPhraseEl, currentHaikuData.phrase);
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
    syncHaikuToCloud(newHaiku, 'save', currentHaikuData.oldPhrase);
    broadcastSyncKeyPayload({ type: 'NEW_HAIKU', haiku: newHaiku });
    goToStep(4);
}

function finishAndReturn() {
    editingHaikuObj = null;
    currentHaikuData.oldPhrase = '';
    startYomuMode();
}

function resetForm() {
    setStep1Phrase('');
    document.getElementById('kigoInput').value = '';
    currentHaikuData.oldPhrase = '';
    setTodaySakkuDate();
    goToStep(1);
    setTimeout(focusStep1DirectInput, 60);
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

// 季寄せスクロール連動リスナーの登録
function initSaijikiScrollWatchers() {
    const saijikiList = document.getElementById('saijikiKigoList');
    if (saijikiList) {
        saijikiList.addEventListener('scroll', () => {
            requestAnimationFrame(updateSaijikiCurrentIndicator);
        });
    }

    const step1List = document.getElementById('step1KigoList');
    if (step1List) {
        step1List.addEventListener('scroll', () => {
            requestAnimationFrame(updateStep1CurrentIndicator);
        });
    }
}

// 🖱️ マウスホイール上下で横スクロール操作を可能にする（PC向け）
function initHorizontalWheelListeners() {
    window.addEventListener('wheel', (e) => {
        const target = e.target.closest('.horizontal-scroll-container, .saijiki-kigo-list, .step1-kigo-list, #readScreen .horizontal-scroll-container, #saijikiScreen .horizontal-scroll-container');
        if (target && e.deltaY !== 0) {
            if (target.scrollWidth > target.clientWidth) {
                e.preventDefault();
                target.scrollLeft += e.deltaY;
            }
        }
    }, { passive: false });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initSaijikiScrollWatchers();
        initHorizontalWheelListeners();
    });
} else {
    initSaijikiScrollWatchers();
    initHorizontalWheelListeners();
}
