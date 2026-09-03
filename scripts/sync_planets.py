#!/usr/bin/env python3
"""
惑星配置類似日ツール - 太陽中心黄経テーブル事前計算スクリプト

紀元前〜遠未来までの8惑星（水星〜海王星）の太陽中心黄道座標系（J2000固定分点）での
黄経を1日刻みで計算し、wakusei-hikaku/data/longitudes.bin（バイナリ）と
data/meta.json（ヘッダ情報）に書き出す。

暦計算そのものは物理法則であり将来変わらないため、sync_koyomi.py と違って
定期再実行や自動Git pushの仕組みは持たない。手動で一度実行するだけでよい。

必要な暦表: de406.bsp（NAIF公式配布、紀元前3000年〜西暦3000年をカバー、約190MB）。
初回実行時に scripts/.ephemeris_cache/ へ自動ダウンロードされる。
"""
import json
import os

WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(WORKSPACE_DIR)

# 探索範囲: 紀元前2999年〜西暦2999年
# de406の実カバー範囲は -3000-01-29 〜 3000-05-06 なので、年頭・年末が
# 範囲外にはみ出さないよう前後1年分の安全マージンを取っている。
START_YEAR = -2999
END_YEAR = 2999

BODIES = [
    ("mercury", "水星"),
    ("venus", "金星"),
    ("earth", "地球"),
    ("mars", "火星"),
    ("jupiter barycenter", "木星"),
    ("saturn barycenter", "土星"),
    ("uranus barycenter", "天王星"),
    ("neptune barycenter", "海王星"),
]

print("=" * 60)
print("🪐 惑星配置類似日ツール - 太陽中心黄経テーブル事前計算")
print("=" * 60)

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

print("\n[1/3] DE406暦表を読み込み中（未取得の場合は約190MBを自動ダウンロードします）...")
eph = load('de406.bsp')
sun = eph['sun']
planets = [eph[name] for name, _ in BODIES]

# ============================================================
# 2. 1日刻みで太陽中心黄経（J2000固定分点）を計算
# ============================================================
print(f"\n[2/3] {START_YEAR}年〜{END_YEAR}年、1日刻みで太陽中心黄経を計算中...")

# proleptic Gregorian で date を扱うため、年に -3000 のような負数を渡す必要がある。
# Python の datetime.date は年 1 以降しかサポートしないので、独自の実装で日付を進める
# （skyfield の ts.utc は年に負数を渡せる）。

def days_in_span(y1, y2):
    # おおよその日数（進捗表示用）。厳密さは不要。
    return int((y2 - y1 + 2) * 365.2425)

n_days_estimate = days_in_span(START_YEAR, END_YEAR)

def is_leap(y):
    return (y % 4 == 0) and (y % 100 != 0 or y % 400 == 0)

def next_ymd(y, m, d):
    days_in_month = [31, 29 if is_leap(y) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    d += 1
    if d > days_in_month[m - 1]:
        d = 1
        m += 1
        if m > 12:
            m = 1
            y += 1
    return y, m, d

out_dir = os.path.join(WORKSPACE_DIR, "wakusei-hikaku", "data")
os.makedirs(out_dir, exist_ok=True)
bin_path = os.path.join(out_dir, "longitudes.bin")

import numpy as np

# 日ごとにskyfieldを逐次呼び出すと(2,192,000日 x 8惑星)は非現実的な時間がかかるため、
# CHUNK_DAYS日分の年月日配列をまとめてts.utc()へ渡し、skyfieldのベクトル化計算を使う。
CHUNK_DAYS = 20000

y, m, d = START_YEAR, 1, 1
count = 0
with open(bin_path, "wb") as f:
    while y <= END_YEAR:
        years = np.empty(CHUNK_DAYS, dtype=np.int64)
        months = np.empty(CHUNK_DAYS, dtype=np.int64)
        days = np.empty(CHUNK_DAYS, dtype=np.int64)
        n_this_chunk = 0
        for i in range(CHUNK_DAYS):
            if y > END_YEAR:
                break
            years[i], months[i], days[i] = y, m, d
            n_this_chunk += 1
            y, m, d = next_ymd(y, m, d)

        if n_this_chunk == 0:
            break

        years = years[:n_this_chunk]
        months = months[:n_this_chunk]
        days = days[:n_this_chunk]

        t = ts.utc(years, months, days, -9, 0, 0)  # JST 0時（sync_koyomi.py と同じ流儀）
        cols = []
        for p in planets:
            astrometric = (p - sun).at(t)
            _, lon, _ = astrometric.ecliptic_latlon()  # epoch省略でJ2000固定分点
            cols.append(lon.degrees % 360.0)

        arr = np.stack(cols, axis=1)  # shape (n_this_chunk, 8), 度単位
        quant = np.round(arr * 10.0).astype(np.int64) % 3600
        f.write(quant.astype('<u2').tobytes())

        count += n_this_chunk
        print(f"    {count}/{n_days_estimate} 日分の黄経を計算済み...（現在 {y}年）")

print(f"  -> {count}日分の太陽中心黄経を計算しました。")

# ============================================================
# 3. meta.json へ書き出し
# ============================================================
print("\n[3/3] wakusei-hikaku/data/meta.json へ書き出し中...")

meta = {
    "startYear": START_YEAR,
    "startMonth": 1,
    "startDay": 1,
    "endYear": END_YEAR,
    "endMonth": 12,
    "endDay": 31,
    "dayCount": count,
    "bodies": [name_ja for _, name_ja in BODIES],
    "quantStep": 0.1,
    "frame": "heliocentric-ecliptic-J2000",
    "note": "各日付はJST0時代表・先発グレゴリオ暦（年は天文学的通番。0=紀元前1年）。黄経はUint16(リトルエンディアン)で0.1度刻み量子化。"
}
meta_path = os.path.join(out_dir, "meta.json")
with open(meta_path, "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)

bin_size_mb = os.path.getsize(bin_path) / (1024 * 1024)
print(f"  -> {bin_path} ({bin_size_mb:.1f}MB)")
print(f"  -> {meta_path}")
print("\n✅ 惑星配置テーブルの生成が完了しました！")
