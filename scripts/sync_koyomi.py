#!/usr/bin/env python3
"""
句帳風月 - 暦データベース自動同期・配信システム

「俳句イベントルール」シートを編集し、GAS側で「イベントを更新する」を
実行した後、このスクリプトを実行すると：

  1. Googleスプレッドシート「暦データベース」から最新の行事・祝日情報を取得
  2. 旧暦・二十四節気・七十二候・雑節は、JPL天文暦（DE421）による高精度計算で
     独自に算出する（スプレッドシート側の簡易計算式は、新月のタイミングが
     日付境界に近い場合に稀に1日ズレることが確認されているため、行事・祝日
     以外はここで計算し直す）
  3. data/koyomi.json を新しい内容で上書きする

歳時記の sync_saijiki.py と同じ位置づけの、暦データベース版。
"""
import csv
import io
import json
import math
import os
import urllib.request

WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(WORKSPACE_DIR)

SPREADSHEET_ID = "1xYYzjR_k9gnkHtZXEmI8fBLUoDyUQnEWUrHo1DUIBD0"
KOYOMI_DB_GID = "0"  # 「暦データベース」シート
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid={KOYOMI_DB_GID}"

START_YEAR = 2020
END_YEAR = 2040

print("=" * 60)
print("🌙 おみ句じ句帳 風月 - 暦データベース自動同期・配信システム")
print("=" * 60)

# ============================================================
# 1. Googleスプレッドシートから行事・祝日データを取得
# ============================================================
print("\n[1/4] Googleスプレッドシート「暦データベース」から最新データを取得中...")
req = urllib.request.Request(CSV_URL, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        csv_text = resp.read().decode('utf-8')
except Exception as e:
    print(f"❌ エラー: スプレッドシートの取得に失敗しました: {e}")
    raise SystemExit(1)

reader = csv.reader(io.StringIO(csv_text))
header = next(reader, None)
# 列構成: A新暦の日付 B旧暦 C二十四節気 D七十二候 E七十二候よみ F十干 G十二支
#         H雑節 I祝日 J重要年中行事 K神事 L仏事 M教会行事 N その他 O祝日手動入力
sheet_events = {}  # dateStr -> {holiday, important, jinja, tera, church, other}
row_count = 0
for row in reader:
    if not row or not row[0].strip():
        continue
    date_str = row[0].strip()
    row_count += 1

    def split_multi(v):
        v = (v or '').strip()
        if not v:
            return None
        return [x for x in v.split('・') if x]

    holiday = (row[8].strip() if len(row) > 8 else '') or None
    sheet_events[date_str] = {
        'holiday': holiday,
        'important': split_multi(row[9] if len(row) > 9 else ''),
        'jinja': split_multi(row[10] if len(row) > 10 else ''),
        'tera': split_multi(row[11] if len(row) > 11 else ''),
        'church': split_multi(row[12] if len(row) > 12 else ''),
        'other': split_multi(row[13] if len(row) > 13 else ''),
    }
print(f"  -> {row_count}日分の行事・祝日データを取得しました。")

# ============================================================
# 2. 旧暦・二十四節気・七十二候・雑節を高精度計算（JPL DE421）
# ============================================================
print("\n[2/4] JPL天文暦（DE421）で旧暦・二十四節気・雑節を高精度計算中...")
try:
    from skyfield.api import Loader
except ImportError:
    print("❌ エラー: skyfieldが必要です。次のコマンドでインストールしてください：")
    print("   pip3 install --user skyfield")
    raise SystemExit(1)

EPHEM_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.ephemeris_cache')
os.makedirs(EPHEM_DIR, exist_ok=True)
load = Loader(EPHEM_DIR)
ts = load.timescale()
eph = load('de421.bsp')
earth, sun, moon = eph['earth'], eph['sun'], eph['moon']

from datetime import date, timedelta

def get_julian_date(y, m, d):
    if m <= 2:
        y -= 1
        m += 12
    A = math.floor(y / 100)
    B = 2 - A + math.floor(A / 4)
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + d + B - 1524.5

def longitudes(y, m, d):
    """指定日 0時JST時点の太陽・月の視黄経（その時点の黄道基準）"""
    t = ts.utc(y, m, d, -9, 0, 0)
    a_sun = earth.at(t).observe(sun).apparent()
    a_moon = earth.at(t).observe(moon).apparent()
    _, slon, _ = a_sun.ecliptic_latlon(epoch='date')
    _, mlon, _ = a_moon.ecliptic_latlon(epoch='date')
    return slon.degrees % 360, mlon.degrees % 360

def crossed(l1, l2, target):
    if l1 > 300 and l2 < 60:
        l2 += 360
    t = target
    if l1 > 300 and t < 60:
        t += 360
    return l1 <= t < l2

SEKKI_NAMES = {0:"春分",15:"清明",30:"穀雨",45:"立夏",60:"小満",75:"芒種",90:"夏至",105:"小暑",120:"大暑",
               135:"立秋",150:"処暑",165:"白露",180:"秋分",195:"寒露",210:"霜降",225:"立冬",240:"小雪",
               255:"大雪",270:"冬至",285:"小寒",300:"大寒",315:"立春",330:"雨水",345:"啓蟄"}
SEKKI_ORDER = ["立春","雨水","啓蟄","春分","清明","穀雨","立夏","小満","芒種","夏至","小暑","大暑",
               "立秋","処暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至","小寒","大寒"]
KOU_TABLE = [
    ("東風解凍","はるかぜこおりをとく"), ("黄鶯睍睆","うぐいすなく"), ("魚上氷","うおこおりをいずる"),
    ("土脉潤起","つちのしょううるおいおこる"), ("霞始靆","かすみはじめてたなびく"), ("草木萠動","そうもくめばえいずる"),
    ("蟄虫啓戸","すごもりむしとをひらく"), ("桃始笑","ももはじめてさく"), ("菜虫化蝶","なむしちょうとなる"),
    ("雀始巣","すずめはじめてすくう"), ("桜始開","さくらはじめてひらく"), ("雷乃発声","かみなりすなわちこえをはっす"),
    ("玄鳥至","つばめきたる"), ("鴻雁北","こうがんかえる"), ("虹始見","にじはじめてあらわる"),
    ("葭始生","あしはじめてしょうず"), ("霜止出苗","しもやんでなえいずる"), ("牡丹華","ぼたんはなさく"),
    ("蛙始鳴","かわずはじめてなく"), ("蚯蚓出","みみずいずる"), ("竹笋生","たけのこしょうず"),
    ("蚕起食桑","かいこおきてくわをはむ"), ("紅花栄","べにばなさかう"), ("麦秋至","むぎのときいたる"),
    ("螳螂生","かまきりしょうず"), ("腐草為蛍","くれたるくさほたるとなる"), ("梅子黄","うめのみきばむ"),
    ("乃東枯","なつかれくさかるる"), ("菖蒲華","あやめはなさく"), ("半夏生","はんげしょうず"),
    ("温風至","あつかぜいたる"), ("蓮始開","はすはじめてひらく"), ("鷹乃学習","たかすなわちわざをならう"),
    ("桐始結花","きりはじめてはなをむすぶ"), ("土潤溽暑","つちうるおってむしあつい"), ("大雨時行","たいうときどきふる"),
    ("涼風至","すずかぜいたる"), ("寒蝉鳴","ひぐらしなく"), ("蒙霧升降","ふかききりまとう"),
    ("綿柎開","わたのはなしべひらく"), ("天地始粛","てんちはじめてさむし"), ("禾乃登","こくものすなわちみのる"),
    ("草露白","くさのつゆしろし"), ("鶺鴒鳴","せきれいなく"), ("玄鳥去","つばめさる"),
    ("雷乃収声","かみなりすなわちこえをおさむ"), ("蟄虫坏戸","むしかくれてとをふさぐ"), ("水始涸","みずはじめてかれる"),
    ("鴻雁来","こうがんきたる"), ("菊花開","きくのはなひらく"), ("蟋蟀在戸","きりぎりすとにあり"),
    ("霜始降","しもはじめてふる"), ("霎時施","こさめときどきふる"), ("楓有蔓","もみじつたあり"),
    ("山茶始開","つばきはじめてひらく"), ("地始凍","ちはじめてこおる"), ("金盞香","きんせんかさく"),
    ("虹蔵不見","にじかくれてみえず"), ("朔風払葉","きたかぜこのはをはらう"), ("橘始開","たちばなはじめてひらく"),
    ("閉塞成冬","そらさむくふゆとなる"), ("熊蟄穴","くまあなにこもる"), ("鱖魚群","さけのうおむらがる"),
    ("乃東生","なつかれくさしょうず"), ("麋角解","さわしかのつのおつる"), ("雪下出麦","ゆきわたりてむぎのびる"),
    ("芹乃栄","せりすなわちさかう"), ("水泉動","しみずあたたかをふくむ"), ("雉始雊","きじはじめてなく"),
    ("款冬華","ふきのはなさく"), ("水沢腹堅","さわみずこおりつめる"), ("鶏始乳","にわとりはじめてとやにつく"),
]
WAFU_LIST = ['睦月','如月','弥生','卯月','皐月','水無月','文月','葉月','長月','神無月','霜月','師走']
KANJI_NUM = ['','一','二','三','四','五','六','七','八','九','十','十一','十二']

def kanji_num(n):
    if n <= 12:
        return KANJI_NUM[n]
    tens, ones = divmod(n, 10)
    return (KANJI_NUM[tens] if tens > 1 else '') + '十' + (KANJI_NUM[ones] if ones > 0 else '')

# ---- 探索範囲全体の日次黄経テーブルを1回だけ作成 ----
span_start = date(START_YEAR - 1, 11, 1)
span_end = date(END_YEAR + 1, 2, 1)
n_span_days = (span_end - span_start).days + 2

dates, sl_arr, ml_arr = [], [], []
d = span_start
i = 0
while d <= span_end:
    sl, ml = longitudes(d.year, d.month, d.day)
    dates.append(d)
    sl_arr.append(sl)
    ml_arr.append(ml)
    d += timedelta(days=1)
    i += 1
    if i % 1000 == 0:
        print(f"    {i}/{n_span_days} 日分の黄経を計算済み...")
date_index = {dt: idx for idx, dt in enumerate(dates)}
print("  -> 黄経テーブル作成完了。")

# ---- 新月・二十四節気（15度）・中気（30度）の検出 ----
new_moons = []       # date（新月が起きたJST日）
sekki_events = []    # (date, name)
chuki_events = []    # (date, deg)  月番号決定用（30度刻み）

for i in range(len(dates) - 1):
    sl1, sl2 = sl_arr[i], sl_arr[i+1]
    ml1, ml2 = ml_arr[i], ml_arr[i+1]

    for deg in range(0, 360, 15):
        if crossed(sl1, sl2, deg):
            sekki_events.append((dates[i], SEKKI_NAMES[deg]))
            if deg % 30 == 0:
                chuki_events.append((dates[i], deg))

    phase1 = (ml1 - sl1) % 360
    phase2 = (ml2 - sl2) % 360
    if phase1 > 300 and phase2 < 60:
        new_moons.append(dates[i])

print(f"  -> 新月 {len(new_moons)}件、二十四節気 {len(sekki_events)}件を検出。")

# ---- 旧暦の月組み立て（中気を含まない月＝閏月、のルール） ----
lunar_months = []  # {start, end(exclusive), month, is_leap}
current_month_num = 11
for i in range(len(new_moons) - 1):
    m_start, m_end = new_moons[i], new_moons[i+1]
    contained = [c for c in chuki_events if m_start <= c[0] < m_end]
    if len(contained) == 1:
        month_num = ((contained[0][1] // 30) + 2) % 12
        if month_num == 0:
            month_num = 12
        current_month_num = month_num
        is_leap = False
    elif len(contained) == 0:
        month_num = current_month_num
        is_leap = True
    else:
        month_num = current_month_num + 1
        if month_num > 12:
            month_num = 1
        current_month_num = month_num
        is_leap = False
    lunar_months.append({'start': m_start, 'end': m_end, 'month': month_num, 'is_leap': is_leap})

def get_lunar_info(d):
    for lm in lunar_months:
        if lm['start'] <= d < lm['end']:
            day = (d - lm['start']).days + 1
            return lm['month'], day, lm['is_leap']
    return None

# ---- 節気開始日インデックス（七十二候の算出用） ----
sekki_events_sorted = sorted(sekki_events, key=lambda x: x[0])

def find_kou(d):
    """dが属する節気の開始日からの経過日数で七十二候を決める（0/5/10日目）"""
    current = None
    for ev_date, name in sekki_events_sorted:
        if ev_date <= d:
            current = (ev_date, name)
        else:
            break
    if not current:
        return None, None
    ev_date, name = current
    diff = (d - ev_date).days
    if diff not in (0, 5, 10):
        return None, None
    sekki_idx = SEKKI_ORDER.index(name) if name in SEKKI_ORDER else None
    if sekki_idx is None:
        return None, None
    kou_idx = sekki_idx * 3 + (0 if diff == 0 else (1 if diff == 5 else 2))
    if 0 <= kou_idx < len(KOU_TABLE):
        return KOU_TABLE[kou_idx]
    return None, None

def find_current_sekki(d):
    current_name = None
    for ev_date, name in sekki_events_sorted:
        if ev_date <= d:
            current_name = name
        else:
            break
    return current_name

def find_risshun(year):
    for ev_date, name in sekki_events_sorted:
        if name == "立春" and ev_date.year == year:
            return ev_date
    return None

def find_equinox(year, name):
    for ev_date, ev_name in sekki_events_sorted:
        if ev_name == name and ev_date.year == year:
            return ev_date
    return None

# ============================================================
# 3. 1日ずつ、旧暦・節気・候・雑節を組み立て
# ============================================================
print("\n[3/4] 1日ごとに旧暦・節気・候・雑節を組み立て中...")
sekki_by_date = {ev_date: name for ev_date, name in sekki_events}

out = {}
d = date(START_YEAR, 1, 1)
end_date = date(END_YEAR, 12, 31)
risshun_cache = {}
shunbun_cache = {}
shuubun_cache = {}

while d <= end_date:
    date_str = d.isoformat()

    lunar_str = None
    info = get_lunar_info(d)
    if info:
        month, day, is_leap = info
        wafu = WAFU_LIST[month - 1]
        lunar_str = f"旧暦{'閏' if is_leap else ''}{kanji_num(month)}月{kanji_num(day)}日（{wafu}）"

    sekki = sekki_by_date.get(d)
    kou_name, kou_yomi = find_kou(d)

    y = d.year
    if y not in risshun_cache:
        risshun_cache[y] = find_risshun(y)
        shunbun_cache[y] = find_equinox(y, "春分")
        shuubun_cache[y] = find_equinox(y, "秋分")

    idx = date_index.get(d)
    sl1 = sl_arr[idx] if idx is not None else None
    sl2 = sl_arr[idx + 1] if idx is not None else None

    zassetsu_list = []
    if sl1 is not None:
        if crossed(sl1, sl2, 80):
            zassetsu_list.append("入梅")
        if crossed(sl1, sl2, 100):
            zassetsu_list.append("半夏生")
        if 27 <= sl1 < 45:
            zassetsu_list.append("春の土用")
        if 117 <= sl1 < 135:
            zassetsu_list.append("夏の土用")
        if 207 <= sl1 < 225:
            zassetsu_list.append("秋の土用")
        if 297 <= sl1 < 315:
            zassetsu_list.append("冬の土用")

    risshun = risshun_cache[y]
    if risshun:
        diff_r = (d - risshun).days
        if diff_r == -1:
            zassetsu_list.append("節分")
        if diff_r == 87:
            zassetsu_list.append("八十八夜")
        if diff_r == 209:
            zassetsu_list.append("二百十日")
        if diff_r == 219:
            zassetsu_list.append("二百二十日")

    shunbun = shunbun_cache[y]
    if shunbun:
        diff_s = (d - shunbun).days
        if diff_s == -3:
            zassetsu_list.append("春彼岸入り")
        elif -2 <= diff_s <= 2:
            zassetsu_list.append("春彼岸")
        elif diff_s == 3:
            zassetsu_list.append("春彼岸明け")

    shuubun = shuubun_cache[y]
    if shuubun:
        diff_f = (d - shuubun).days
        if diff_f == -3:
            zassetsu_list.append("秋彼岸入り")
        elif -2 <= diff_f <= 2:
            zassetsu_list.append("秋彼岸")
        elif diff_f == 3:
            zassetsu_list.append("秋彼岸明け")

    zassetsu = "・".join(zassetsu_list) if zassetsu_list else None

    ev = sheet_events.get(date_str, {})
    out[date_str] = {
        "lunar": lunar_str,
        "sekki": sekki,
        "kou": kou_name,
        "kou_yomi": kou_yomi,
        "holiday": ev.get('holiday'),
        "zassetsu": zassetsu,
        "important": ev.get('important'),
        "jinja": ev.get('jinja'),
        "tera": ev.get('tera'),
        "church": ev.get('church'),
        "other": ev.get('other'),
    }
    d += timedelta(days=1)

print(f"  -> {len(out)}日分のデータを生成しました。")

# ============================================================
# 4. data/koyomi.json へ書き出し
# ============================================================
print("\n[4/4] data/koyomi.json へ書き出し中...")
out_path = os.path.join(WORKSPACE_DIR, "data", "koyomi.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(f"  -> 書き出し完了: {out_path}")
print("\n✅ 暦データベースの同期が完了しました！")
