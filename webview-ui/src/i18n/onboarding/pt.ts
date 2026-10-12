import type { Translation } from '../core.js';
import type { onboarding } from './en.js';

export const messages: Translation<typeof onboarding> = {
  title: 'Bem-vindo ao Catavasia',
  next: 'Seguinte',
  back: 'Voltar',
  skip: 'Pular',
  help: 'Ajuda',
  letsGo: 'Vamos lá',
  stepOf: 'Passo {n} de {total}',
  forLabel: 'Para que serve?',
  writeLabel: 'O que escrever?',
  languageTitle: 'Escolha o seu idioma',
  languageHint: 'Você pode mudar depois em Configurações.',
  catTitle: 'O que é um gato?',
  catBody:
    'Um gato é um ajudante de IA. Você dá um trabalho a ele e ele trabalha no seu computador. No escritório, você o vê como um gatinho. Ele digita quando trabalha e descansa quando termina.',
  ceoTitle: 'O CEO',
  ceoBody:
    'O CEO é o gato com quem você fala. Escreva o que você quer no chat à direita. O CEO decide quem faz o trabalho e traz o resultado para você.',
  teamTitle: 'O chefe e os trabalhadores',
  teamBody:
    'Cada equipe tem um chefe e alguns trabalhadores. O chefe divide um trabalho grande em partes pequenas. Cada trabalhador faz uma parte. Depois o chefe confere o resultado.',
  tasksTitle: 'Como uma tarefa avança',
  tasksBody:
    'Você escreve uma tarefa. O CEO a entrega ao chefe. O chefe distribui as partes aos trabalhadores. Os trabalhadores relatam o que fizeram. O chefe envia o resultado final para você.',
  whereTitle: 'Onde escrever o quê',
  whereBody:
    'Escreva objetivos e perguntas no chat do CEO. Escreva as regras de um gato no menu Gatos, no papel e no prompt dele. Toque em Ajuda se não tiver certeza.',
  enginesTitle: 'Claude Code e Codex',
  enginesBody:
    'Os gatos rodam no Claude Code ou no Codex. Instale pelo menos um deles. Cada gato pode usar qualquer um.',
  buildIntroTitle: 'Crie seus primeiros gatos',
  buildIntroBody:
    'Agora vamos criar sua equipe juntos. Começamos pelo chefe. Depois você pode adicionar trabalhadores. Eu explico cada campo.',
  bossLabel: 'Chefe',
  workerLabel: 'Trabalhador',
  nameTitleBoss: 'Dê um nome ao gato chefe',
  nameTitleWorker: 'Dê um nome ao gato trabalhador',
  nameFor:
    'Com o nome, você e os outros gatos chamam este gato. Ele também aparece acima do gato no escritório.',
  nameWrite: 'Escreva um nome curto, como o de um bichinho. Uma ou duas palavras.',
  nameMissing: 'Escreva um nome primeiro.',
  lookTitle: 'Escolha a aparência',
  lookFor: 'A aparência é só para diversão. Ela ajuda você a distinguir os gatos no escritório.',
  lookWrite: 'Escolha uma raça e um padrão. Mude as cores se quiser. Deixe cada gato diferente.',
  roleTitle: 'Dê um papel',
  roleFor:
    'O papel é uma etiqueta curta do trabalho. Ele aparece no menu Gatos e na lista de tarefas.',
  roleWrite: 'Escreva de uma a três palavras, por exemplo Líder, Designer ou Testador.',
  promptTitle: 'Escreva as instruções',
  promptFor:
    'O prompt diz ao gato quem ele é e como trabalhar. O gato o lê antes de cada tarefa. Um prompt claro dá resultados melhores.',
  promptWriteBoss:
    'Diga o que a equipe faz e como o chefe divide o trabalho. Seja curto e claro. Você pode mudar a minha sugestão.',
  promptWriteWorker:
    'Diga o que este gato sabe fazer e como ele deve trabalhar. Seja curto e claro. Você pode mudar a minha sugestão.',
  promptHelp: 'Não sabe o que escrever? Pergunte ao ajudante.',
  savedTitle: '{name} entrou na sua equipe!',
  savedBody: 'Agora você pode adicionar outro trabalhador ou continuar.',
  addWorker: 'Adicionar um trabalhador',
  continue: 'Continuar',
  templateTitle: 'Escolha uma equipe pronta',
  templateBody:
    'Cada equipe tem um chefe e três trabalhadores com prompts prontos. Você pode mudar tudo depois no menu Gatos.',
  templateEngineer: 'Engenheiro',
  templateEngineerDesc: 'Escreve, revisa e testa código.',
  templateDesigner: 'Designer',
  templateDesignerDesc: 'Planeja marca, telas e pesquisa com usuários.',
  templateProduct: 'Gerente de produto',
  templateProductDesc: 'Encontra problemas, define a estratégia e escreve especificações.',
  templateMarketer: 'Profissional de marketing',
  templateMarketerDesc: 'Planeja campanhas e escreve textos.',
  templateAnalyst: 'Analista de dados',
  templateAnalystDesc: 'Limpa dados, confere números e desenha gráficos.',
  templateWriter: 'Escritor',
  templateWriterDesc: 'Pesquisa, escreve e edita textos.',
  useTeam: 'Usar esta equipe',
  startEmpty: 'Começar sem gatos',
  startEmptyHint: 'Você pode adicionar gatos depois no menu Gatos.',
  templateFailed: 'Não foi possível salvar esta equipe: {error}',
  installHooks: 'Instalar hooks',
  installing: 'Instalando...',
  notNow: 'Agora não',
  dontAskAgain: 'Não perguntar de novo',
  doneTitle: 'Tudo pronto!',
  doneFailedTitle: 'Não foi possível instalar os hooks',
  doneBody: 'Seu escritório está pronto. Escreva sua primeira tarefa para o CEO no chat à direita.',
  doneFailedBody:
    'Algo deu errado ao gravar nas configurações do Claude Code, então o escritório vai acompanhar suas sessões do jeito mais lento. Tudo continua funcionando e você pode tentar de novo em Configurações a qualquer momento.',
  doneIssues: 'Achou um bug ou tem uma ideia? Conte no GitHub.',
};
