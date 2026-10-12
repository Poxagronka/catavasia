import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'І яшчэ нешта: hooks!',
  what: 'Каб ажывіць вашых агентаў у рэальным часе, catavasia дадае hooks для {count} падзей Claude Code ў {file}. Вашы бягучыя налады застаюцца, а адзін раз захоўваецца рэзервовая копія як {backup}.',
  data: 'Claude Code будзе адпраўляць гэтыя падзеі, разам з назвамі і ўваходнымі данымі інструментаў, на сервер catavasia на гэтым кампутары. Усё застаецца лакальна: сервер слухае толькі 127.0.0.1, калі вы самі не запусціце яго з --host і не адкрыеце для сваёй сеткі.',
  reversible: 'Вы можаце выдаліць hooks у любы момант у Settings → Instant Detection (Hooks).',
};
