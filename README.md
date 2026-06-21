# 労務日報アプリ - デプロイ手順

## このフォルダの中身
- `src/App.jsx` … メイン画面（Supabaseに接続済み）
- `src/supabaseClient.js` … Supabase接続設定（URL・キー入力済み）
- `src/main.jsx` … React起動ファイル
- `index.html` / `vite.config.js` / `package.json` … 動作に必要な設定ファイル

## Supabase側の準備（すでに完了していればスキップ）
1. SQL Editorで `workers` `machines` `entries` テーブルを作成済みであること
2. `machines` テーブルの初期データを1〜2件入れておくと最初の動作確認がしやすいです
   （Table Editor → machines → Insert row）

## GitHubにアップロードする手順
1. https://github.com にログイン
2. 右上の「+」→「New repository」
   - Repository name: `roumu-nippou`（任意）
   - Public/Private どちらでもOK
   - 「Create repository」をクリック
3. 作成された画面の案内に従い、このフォルダの中身をアップロード
   - 一番簡単なのは「uploading an existing file」リンクから、このフォルダの中身（node_modulesとdistを除く）をドラッグ＆ドロップ

## Vercelで公開する手順
1. https://vercel.com にアクセスし、GitHubアカウントでログイン
2. 「Add New」→「Project」
3. 先ほど作成したGitHubリポジトリ（roumu-nippou）を選択して「Import」
4. Framework Presetは自動的に「Vite」と認識されるはずです
   - 認識されない場合は手動で「Vite」を選択
5. そのまま「Deploy」をクリック
6. 1〜2分でビルドが完了し、`https://roumu-nippou-xxxx.vercel.app` のようなURLが発行されます

## 公開後の運用
- このURLを現場の作業員にLINEなどで共有すれば、スマホのブラウザからアクセスして入力できます
- ホーム画面に追加（iPhoneは共有→ホーム画面に追加、Androidはメニュー→ホーム画面に追加）すると、アプリのように使えます
- データはSupabase上の1つのデータベースに集約されるので、誰がどこから入力しても全員にリアルタイムで反映されます

## 困ったときは
- 画面が真っ白 → ブラウザの開発者ツール（F12）でエラーを確認、またはVercelの「Deployments」タブでビルドログを確認
- データが保存されない → Supabaseの「Table Editor」でRLS（Row Level Security）のポリシーが正しく設定されているか確認
- 動作確認だけしたい → ローカルで `npm install` → `npm run dev` を実行
