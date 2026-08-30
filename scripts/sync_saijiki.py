import urllib.request
import csv
import json
import re
import os
import subprocess
import datetime

# 設定
SPREADSHEET_ID = "1EOmZn53hFA8GpVdcn--aU-lj9uHjGQpnSZ1o9jbnsYs"
GID = "166630355"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid={GID}"

WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(WORKSPACE_DIR)

print("=" * 60)
print("🌸 おみ句じ句帳 風月 - 歳時記データベース自動同期・配信システム")
print("=" * 60)

# 1. GoogleスプレッドシートからCSVをダウンロード
print("\n[1/5] Googleスプレッドシートから最新データを取得中...")
req = urllib.request.Request(CSV_URL, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode('utf-8')
    print("  -> ダウンロード完了！")
except Exception as e:
    print(f"❌ エラー: スプレッドシートの取得に失敗しました: {e}")
    exit(1)

# 2. CSVを解析して saijiki.json を生成
print("\n[2/5] データを解析して saijiki.json を生成中...")
reader = csv.reader(content.splitlines())
header = next(reader, None)

data_items = []
row_idx = 0
for row in reader:
    row_idx += 1
    if not row or not any(row):
        continue
    
    # 季節, 詳細季節, 親季語, 親季語よみがな, 子季語, 文字数, 表示用子季語, 季語の説明, 分類
    season = row[0].strip() if len(row) > 0 else "muki"
    detailSeason = row[1].strip() if len(row) > 1 else ""
    parentKigo = row[2].strip() if len(row) > 2 else ""
    parentKana = row[3].strip() if len(row) > 3 else ""
    childKigo = row[4].strip() if len(row) > 4 else parentKigo
    desc = row[7].strip() if len(row) > 7 else ""
    category = row[8].strip() if len(row) > 8 else "時候"
    
    if not parentKigo and not childKigo:
        continue
    
    item = {
        "kigo": childKigo or parentKigo,
        "parentKigo": parentKigo or childKigo,
        "parentKana": parentKana,
        "season": season or "muki",
        "detailSeason": detailSeason,
        "desc": desc,
        "category": category
    }
    data_items.append(item)

# JSON保存 (fugetsu-app/data/ & data/)
os.makedirs('fugetsu-app/data', exist_ok=True)
os.makedirs('data', exist_ok=True)

with open('fugetsu-app/data/saijiki.json', 'w', encoding='utf-8') as f:
    json.dump(data_items, f, ensure_ascii=False, indent=2)

with open('data/saijiki.json', 'w', encoding='utf-8') as f:
    json.dump(data_items, f, ensure_ascii=False, indent=2)

# 最新マスターCSVとしても保存
with open('saijiki_master_clean.csv', 'w', encoding='utf-8-sig') as f:
    f.write(content)

print(f"  -> {len(data_items)} 件の季語データを saijiki.json に変換・保存しました！")

# 3. キャッシュバージョン（キャッシュバスター）の自動インクリメント
print("\n[3/5] キャッシュバージョン（更新番号）を更新中...")

# sw.js から現在のバージョン番号を取得
with open('fugetsu-app/sw.js', 'r', encoding='utf-8') as f:
    sw_code = f.read()

m = re.search(r"CACHE_NAME = 'fugetsu-release-v(\d+)';", sw_code)
current_v = int(m.group(1)) if m else 46
new_v = current_v + 1
new_v_str = f"2.0.{new_v}"

print(f"  -> バージョン更新: v{current_v} -> v{new_v} (v={new_v_str})")

# sw.js 更新
sw_code_new = re.sub(r"CACHE_NAME = 'fugetsu-release-v\d+';", f"CACHE_NAME = 'fugetsu-release-v{new_v}';", sw_code)
sw_code_new = re.sub(r"data/saijiki\.json\?v=[\d\.]+", f"data/saijiki.json?v={new_v_str}", sw_code_new)
with open('fugetsu-app/sw.js', 'w', encoding='utf-8') as f:
    f.write(sw_code_new)

# app.js 更新
with open('fugetsu-app/app.js', 'r', encoding='utf-8') as f:
    app_code = f.read()
app_code_new = re.sub(r"data/saijiki\.json\?v=[\d\.]+", f"data/saijiki.json?v={new_v_str}", app_code)
with open('fugetsu-app/app.js', 'w', encoding='utf-8') as f:
    f.write(app_code_new)

# index.html 更新
with open('fugetsu-app/index.html', 'r', encoding='utf-8') as f:
    html_code = f.read()
html_code_new = re.sub(r"style\.css\?v=[\d\.]+", f"style.css?v={new_v_str}", html_code)
html_code_new = re.sub(r"app\.js\?v=[\d\.]+", f"app.js?v={new_v_str}", html_code_new)
with open('fugetsu-app/index.html', 'w', encoding='utf-8') as f:
    f.write(html_code_new)

# 4. ルートへのファイル同期
print("\n[4/5] ルートディレクトリへ同期中...")
files_to_sync = ['index.html', 'app.js', 'style.css', 'sw.js', 'manifest.json']
for filename in files_to_sync:
    src = os.path.join('fugetsu-app', filename)
    if os.path.exists(src):
        with open(src, 'r', encoding='utf-8') as sf, open(filename, 'w', encoding='utf-8') as df:
            df.write(sf.read())

print("  -> 同期完了！")

# 5. Git Commit & Push
print("\n[5/5] GitHubへ自動配信（Push）中...")
now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
commit_msg = f"Auto-sync saijiki database from spreadsheet ({now_str})"

subprocess.run(['git', 'add', '.'], check=True)
subprocess.run(['git', 'commit', '-m', commit_msg], check=True)
subprocess.run(['git', 'push', 'origin', 'main'], check=True)

print("\n" + "=" * 60)
print("🎉 歳時記の更新・配信がすべて完了いたしました！")
print(f"📱 ユーザーのスマホアプリへ自動配信されます (v={new_v_str})")
print("=" * 60)
