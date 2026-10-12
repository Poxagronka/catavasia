import type { Translation } from '../core.js';
import type { onboarding } from './en.js';

export const messages: Translation<typeof onboarding> = {
  title: 'Catavasia에 오신 것을 환영합니다',
  next: '다음',
  back: '뒤로',
  skip: '건너뛰기',
  help: '도움말',
  letsGo: '시작하기',
  stepOf: '{total}단계 중 {n}단계',
  forLabel: '무엇에 쓰나요?',
  writeLabel: '무엇을 쓰나요?',
  languageTitle: '언어를 선택하세요',
  languageHint: '나중에 설정에서 바꿀 수 있습니다.',
  catTitle: '고양이란?',
  catBody:
    '고양이는 AI 도우미입니다. 일을 주면 컴퓨터에서 일합니다. 사무실에서는 작은 고양이로 보입니다. 일할 때는 타자를 치고, 끝나면 쉽니다.',
  ceoTitle: 'CEO',
  ceoBody:
    'CEO는 당신이 말을 거는 고양이입니다. 원하는 것을 오른쪽 채팅에 쓰세요. CEO가 누가 일할지 정하고 결과를 가져옵니다.',
  teamTitle: '보스와 일꾼',
  teamBody:
    '모든 팀에는 보스 한 마리와 일꾼 여러 마리가 있습니다. 보스는 큰 일을 작은 조각으로 나눕니다. 일꾼은 각자 한 조각을 맡습니다. 그다음 보스가 결과를 확인합니다.',
  tasksTitle: '작업이 흐르는 방식',
  tasksBody:
    '당신이 작업을 씁니다. CEO가 그것을 보스에게 줍니다. 보스가 조각을 일꾼에게 나눠 줍니다. 일꾼이 결과를 보고합니다. 보스가 최종 결과를 당신에게 보냅니다.',
  whereTitle: '어디에 무엇을 쓰나요',
  whereBody:
    '목표와 질문은 CEO 채팅에 쓰세요. 고양이 한 마리의 규칙은 고양이 메뉴의 역할과 프롬프트에 쓰세요. 잘 모르겠으면 도움말을 누르세요.',
  enginesTitle: 'Claude Code와 Codex',
  enginesBody:
    '고양이는 Claude Code 또는 Codex로 실행됩니다. 둘 중 하나 이상을 설치하세요. 모든 고양이가 둘 다 쓸 수 있습니다.',
  buildIntroTitle: '첫 고양이를 만들어요',
  buildIntroBody:
    '이제 함께 팀을 만듭니다. 보스부터 시작합니다. 그다음 일꾼을 추가할 수 있습니다. 각 항목을 설명해 드릴게요.',
  bossLabel: '보스',
  workerLabel: '일꾼',
  nameTitleBoss: '보스 고양이의 이름을 지어요',
  nameTitleWorker: '일꾼 고양이의 이름을 지어요',
  nameFor:
    '이 이름으로 당신과 다른 고양이들이 이 고양이를 부릅니다. 사무실에서 고양이 머리 위에도 표시됩니다.',
  nameWrite: '반려동물 이름처럼 짧은 이름을 쓰세요. 한두 단어면 됩니다.',
  nameMissing: '먼저 이름을 써 주세요.',
  lookTitle: '모습을 고르세요',
  lookFor: '모습은 재미를 위한 것입니다. 사무실에서 고양이를 구분하는 데 도움이 됩니다.',
  lookWrite: '품종과 무늬를 고르세요. 원하면 색을 바꾸세요. 고양이마다 다르게 만들어 보세요.',
  roleTitle: '역할을 주세요',
  roleFor: '역할은 일을 나타내는 짧은 이름표입니다. 고양이 메뉴와 작업 목록에 표시됩니다.',
  roleWrite: '한 단어에서 세 단어로 쓰세요. 예: 팀 리더, 디자이너, 테스터.',
  promptTitle: '지시문을 쓰세요',
  promptFor:
    '프롬프트는 고양이에게 자신이 누구이고 어떻게 일할지 알려 줍니다. 고양이는 작업마다 먼저 그것을 읽습니다. 분명한 프롬프트가 더 좋은 결과를 줍니다.',
  promptWriteBoss:
    '팀이 무엇을 하는지, 보스가 일을 어떻게 나누는지 쓰세요. 짧고 분명하게 쓰세요. 제 제안은 바꿔도 됩니다.',
  promptWriteWorker:
    '이 고양이가 무엇을 잘하고 어떻게 일해야 하는지 쓰세요. 짧고 분명하게 쓰세요. 제 제안은 바꿔도 됩니다.',
  promptHelp: '무엇을 써야 할지 모르겠나요? 도우미에게 물어보세요.',
  savedTitle: '{name}이(가) 팀에 합류했어요!',
  savedBody: '이제 일꾼을 더 추가하거나 계속 진행할 수 있습니다.',
  addWorker: '일꾼 추가',
  continue: '계속',
  templateTitle: '준비된 팀을 고르세요',
  templateBody:
    '모든 팀은 보스 한 마리와 일꾼 세 마리로 이루어져 있고 프롬프트도 준비되어 있습니다. 나중에 고양이 메뉴에서 모두 바꿀 수 있습니다.',
  templateEngineer: '엔지니어',
  templateEngineerDesc: '코드를 쓰고, 검토하고, 테스트합니다.',
  templateDesigner: '디자이너',
  templateDesignerDesc: '브랜드, 화면, 사용자 조사를 기획합니다.',
  templateProduct: '프로덕트 매니저',
  templateProductDesc: '문제를 찾고, 전략을 세우고, 명세를 씁니다.',
  templateMarketer: '마케터',
  templateMarketerDesc: '캠페인을 기획하고 글을 씁니다.',
  templateAnalyst: '데이터 분석가',
  templateAnalystDesc: '데이터를 정리하고, 숫자를 확인하고, 차트를 그립니다.',
  templateWriter: '작가',
  templateWriterDesc: '조사하고, 쓰고, 글을 다듬습니다.',
  useTeam: '이 팀 사용',
  startEmpty: '고양이 없이 시작',
  startEmptyHint: '고양이는 나중에 고양이 메뉴에서 추가할 수 있습니다.',
  templateFailed: '이 팀을 저장하지 못했습니다: {error}',
  installHooks: 'hooks 설치',
  installing: '설치 중...',
  notNow: '나중에',
  dontAskAgain: '다시 묻지 않기',
  doneTitle: '준비가 끝났어요!',
  doneFailedTitle: 'hooks를 설치하지 못했습니다',
  doneBody: '사무실이 준비되었습니다. 첫 작업을 오른쪽 채팅에서 CEO에게 써 보세요.',
  doneFailedBody:
    'Claude Code 설정에 쓰는 중 문제가 생겨서, 사무실이 더 느린 방식으로 세션을 지켜봅니다. 모든 것이 계속 작동하며, 언제든 설정에서 다시 시도할 수 있습니다.',
  doneIssues: '버그를 찾았거나 아이디어가 있나요? GitHub에 알려 주세요.',
};
