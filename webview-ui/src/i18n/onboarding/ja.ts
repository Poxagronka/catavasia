import type { Translation } from '../core.js';
import type { onboarding } from './en.js';

export const messages: Translation<typeof onboarding> = {
  title: 'Catavasia へようこそ',
  next: '次へ',
  back: '戻る',
  skip: 'スキップ',
  help: 'ヘルプ',
  letsGo: '始めよう',
  stepOf: 'ステップ {n} / {total}',
  forLabel: '何のため？',
  writeLabel: '何を書く？',
  languageTitle: '言語を選んでください',
  languageHint: 'あとで設定から変更できます。',
  catTitle: 'ネコとは？',
  catBody:
    'ネコは AI のお手伝いです。仕事を渡すと、あなたのパソコンで働きます。オフィスでは小さなネコとして見えます。働いているときはタイプし、終わると休みます。',
  ceoTitle: 'CEO',
  ceoBody:
    'CEO はあなたが話しかけるネコです。ほしいものを右側のチャットに書いてください。CEO が誰に任せるかを決め、結果を持ってきます。',
  teamTitle: 'ボスとワーカー',
  teamBody:
    'どのチームにもボスが 1 匹とワーカーが数匹います。ボスは大きな仕事を小さく分けます。ワーカーはそれぞれ 1 つを担当します。そのあと、ボスが結果を確認します。',
  tasksTitle: 'タスクの流れ',
  tasksBody:
    'あなたがタスクを書きます。CEO がそれをボスに渡します。ボスが部分をワーカーに配ります。ワーカーが報告します。ボスが最終結果をあなたに送ります。',
  whereTitle: 'どこに何を書くか',
  whereBody:
    '目標や質問は CEO のチャットに書きます。ネコ 1 匹のルールは、ネコメニューのロールとプロンプトに書きます。迷ったら「ヘルプ」を押してください。',
  enginesTitle: 'Claude Code と Codex',
  enginesBody:
    'ネコは Claude Code か Codex で動きます。どちらか 1 つ以上をインストールしてください。どのネコも両方を使えます。',
  buildIntroTitle: '最初のネコを作ろう',
  buildIntroBody:
    'これからチームを一緒に作ります。まずボスからです。そのあとワーカーを追加できます。各項目を説明します。',
  bossLabel: 'ボス',
  workerLabel: 'ワーカー',
  nameTitleBoss: 'ボスネコの名前をつけよう',
  nameTitleWorker: 'ワーカーネコの名前をつけよう',
  nameFor:
    'この名前で、あなたや他のネコがこのネコを呼びます。オフィスではネコの頭上にも表示されます。',
  nameWrite: 'ペットの名前のような短い名前を書きます。1〜2 語です。',
  nameMissing: '先に名前を書いてください。',
  lookTitle: '見た目を選ぼう',
  lookFor: '見た目はお楽しみです。オフィスでネコを見分けるのに役立ちます。',
  lookWrite: '品種と模様を選びます。好きなら色も変えてください。ネコごとに違う見た目にしましょう。',
  roleTitle: 'ロールをつけよう',
  roleFor: 'ロールは仕事の短いラベルです。ネコメニューとタスク一覧に表示されます。',
  roleWrite: '1〜3 語で書きます。例: チームリーダー、デザイナー、テスター。',
  promptTitle: '指示を書こう',
  promptFor:
    'プロンプトは、ネコが誰で、どう働くかを伝えます。ネコはタスクのたびにそれを読みます。わかりやすいプロンプトほど良い結果になります。',
  promptWriteBoss:
    'チームが何をするか、ボスがどう仕事を分けるかを書きます。短く、はっきりと書きましょう。私の案は変更できます。',
  promptWriteWorker:
    'このネコが何を得意とし、どう働くかを書きます。短く、はっきりと書きましょう。私の案は変更できます。',
  promptHelp: '何を書くか迷いますか？ヘルパーに聞いてみましょう。',
  savedTitle: '{name} がチームに加わりました！',
  savedBody: 'ワーカーをもう 1 匹追加するか、このまま進めます。',
  addWorker: 'ワーカーを追加',
  continue: '続ける',
  templateTitle: '用意されたチームを選ぼう',
  templateBody:
    'どのチームも、ボス 1 匹とワーカー 3 匹で、プロンプトは用意済みです。あとでネコメニューからすべて変更できます。',
  templateEngineer: 'エンジニア',
  templateEngineerDesc: 'コードを書き、レビューし、テストします。',
  templateDesigner: 'デザイナー',
  templateDesignerDesc: 'ブランド、画面、ユーザー調査を考えます。',
  templateProduct: 'プロダクトマネージャー',
  templateProductDesc: '課題を見つけ、戦略を立て、仕様を書きます。',
  templateMarketer: 'マーケター',
  templateMarketerDesc: 'キャンペーンを計画し、文章を書きます。',
  templateAnalyst: 'データアナリスト',
  templateAnalystDesc: 'データを整え、数字を確かめ、グラフを描きます。',
  templateWriter: 'ライター',
  templateWriterDesc: '調べて、書いて、文章を直します。',
  useTeam: 'このチームを使う',
  startEmpty: 'ネコなしで始める',
  startEmptyHint: 'ネコはあとでネコメニューから追加できます。',
  templateFailed: 'このチームを保存できませんでした: {error}',
  installHooks: 'hooks をインストール',
  installing: 'インストール中...',
  notNow: '今はしない',
  dontAskAgain: '今後は聞かない',
  doneTitle: '準備完了です！',
  doneFailedTitle: 'hooks をインストールできませんでした',
  doneBody: 'オフィスの準備ができました。最初のタスクを右側のチャットで CEO に書いてください。',
  doneFailedBody:
    'Claude Code の設定への書き込みで問題が起きたため、オフィスはより遅い方法でセッションを見守ります。すべて引き続き動き、設定からいつでもやり直せます。',
  doneIssues: 'バグを見つけた、またはアイデアがありますか？ GitHub で教えてください。',
};
