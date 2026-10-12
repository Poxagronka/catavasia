import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'もうひとつ：hooks です！',
  what: 'エージェントをリアルタイムで動かすため、catavasia は {count} 件の Claude Code イベント用の hooks を {file} に追加します。既存の設定はそのまま残り、一度だけ {backup} としてバックアップを保存します。',
  data: 'Claude Code は、ツール名やツール入力を含むこれらのイベントを、このマシン上の catavasia サーバーに送ります。すべてローカルに留まります。サーバーは 127.0.0.1 だけで待ち受けます。--host で起動してネットワークに公開した場合は別です。',
  reversible: 'hooks はいつでも Settings → Instant Detection (Hooks) から削除できます。',
};
