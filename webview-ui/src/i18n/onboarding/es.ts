import type { Translation } from '../core.js';
import type { onboarding } from './en.js';

export const messages: Translation<typeof onboarding> = {
  title: 'Te damos la bienvenida a Catavasia',
  next: 'Siguiente',
  back: 'Atrás',
  skip: 'Omitir',
  help: 'Ayuda',
  letsGo: 'Vamos',
  stepOf: 'Paso {n} de {total}',
  forLabel: '¿Para qué sirve?',
  writeLabel: '¿Qué escribir?',
  languageTitle: 'Elige tu idioma',
  languageHint: 'Podrás cambiarlo más tarde en Ajustes.',
  catTitle: '¿Qué es un gato?',
  catBody:
    'Un gato es un ayudante de IA. Le das un trabajo y trabaja en tu ordenador. En la oficina lo ves como un gatito. Escribe cuando trabaja y descansa cuando termina.',
  ceoTitle: 'El CEO',
  ceoBody:
    'El CEO es el gato con el que hablas. Escribe lo que quieres en el chat de la derecha. El CEO decide quién hace el trabajo y te trae el resultado.',
  teamTitle: 'El jefe y los trabajadores',
  teamBody:
    'Cada equipo tiene un jefe y varios trabajadores. El jefe divide un trabajo grande en partes pequeñas. Cada trabajador hace una parte. Después el jefe revisa el resultado.',
  tasksTitle: 'Cómo avanza una tarea',
  tasksBody:
    'Tú escribes una tarea. El CEO se la da al jefe. El jefe reparte las partes entre los trabajadores. Los trabajadores informan. El jefe te envía el resultado final.',
  whereTitle: 'Dónde escribir qué',
  whereBody:
    'Escribe los objetivos y las preguntas en el chat del CEO. Escribe las reglas de un gato en el menú Gatos, en su rol y su prompt. Pulsa Ayuda si no estás seguro.',
  enginesTitle: 'Claude Code y Codex',
  enginesBody:
    'Los gatos funcionan con Claude Code o Codex. Instala al menos uno. Cada gato puede usar cualquiera de los dos.',
  buildIntroTitle: 'Crea tus primeros gatos',
  buildIntroBody:
    'Ahora creamos tu equipo juntos. Empezamos por el jefe. Después puedes añadir trabajadores. Te explico cada campo.',
  bossLabel: 'Jefe',
  workerLabel: 'Trabajador',
  nameTitleBoss: 'Pon nombre al gato jefe',
  nameTitleWorker: 'Pon nombre al gato trabajador',
  nameFor:
    'Con el nombre tú y los otros gatos llamáis a este gato. También se ve sobre el gato en la oficina.',
  nameWrite: 'Escribe un nombre corto, como el de una mascota. Una o dos palabras.',
  nameMissing: 'Primero escribe un nombre.',
  lookTitle: 'Elige el aspecto',
  lookFor: 'El aspecto es solo para divertirse. Te ayuda a distinguir los gatos en la oficina.',
  lookWrite:
    'Elige una raza y un patrón. Cambia los colores si quieres. Haz que cada gato sea distinto.',
  roleTitle: 'Dale un rol',
  roleFor:
    'El rol es una etiqueta corta del trabajo. Se ve en el menú Gatos y en la lista de tareas.',
  roleWrite: 'Escribe de una a tres palabras, por ejemplo Líder, Diseñador o Tester.',
  promptTitle: 'Escribe las instrucciones',
  promptFor:
    'El prompt dice al gato quién es y cómo trabajar. El gato lo lee antes de cada tarea. Un prompt claro da mejores resultados.',
  promptWriteBoss:
    'Explica qué hace el equipo y cómo reparte el trabajo el jefe. Sé breve y claro. Puedes cambiar mi sugerencia.',
  promptWriteWorker:
    'Explica qué sabe hacer este gato y cómo debe trabajar. Sé breve y claro. Puedes cambiar mi sugerencia.',
  promptHelp: '¿No sabes qué escribir? Pregunta al ayudante.',
  savedTitle: '¡{name} se une a tu equipo!',
  savedBody: 'Ahora puedes añadir otro trabajador o continuar.',
  addWorker: 'Añadir un trabajador',
  continue: 'Continuar',
  templateTitle: 'Elige un equipo listo',
  templateBody:
    'Cada equipo tiene un jefe y tres trabajadores con prompts listos. Puedes cambiarlo todo más tarde en el menú Gatos.',
  templateEngineer: 'Ingeniero',
  templateEngineerDesc: 'Escribe, revisa y prueba código.',
  templateDesigner: 'Diseñador',
  templateDesignerDesc: 'Planea marca, pantallas e investigación de usuarios.',
  templateProduct: 'Product manager',
  templateProductDesc: 'Encuentra problemas, define la estrategia y escribe especificaciones.',
  templateMarketer: 'Marketing',
  templateMarketerDesc: 'Planea campañas y escribe textos.',
  templateAnalyst: 'Analista de datos',
  templateAnalystDesc: 'Limpia datos, comprueba cifras y dibuja gráficos.',
  templateWriter: 'Escritor',
  templateWriterDesc: 'Investiga, escribe y edita textos.',
  useTeam: 'Usar este equipo',
  startEmpty: 'Empezar sin gatos',
  startEmptyHint: 'Puedes añadir gatos más tarde en el menú Gatos.',
  templateFailed: 'No se pudo guardar este equipo: {error}',
  installHooks: 'Instalar hooks',
  installing: 'Instalando...',
  notNow: 'Ahora no',
  dontAskAgain: 'No preguntar más',
  doneTitle: '¡Todo listo!',
  doneFailedTitle: 'No se pudieron instalar los hooks',
  doneBody: 'Tu oficina está lista. Escribe tu primera tarea al CEO en el chat de la derecha.',
  doneFailedBody:
    'Algo falló al escribir en los ajustes de Claude Code, así que la oficina vigilará tus sesiones de forma más lenta. Todo sigue funcionando y puedes reintentarlo desde Ajustes cuando quieras.',
  doneIssues: '¿Has encontrado un error o tienes una idea? Cuéntalo en GitHub.',
};
