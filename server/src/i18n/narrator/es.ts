import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'planeando la caza',
  exploring: 'olfateando por ahí',
  building: 'amasando el código',
  testing: 'cazando bugs a zarpazos',
  reviewing: 'acicalando el código',
  delivering: 'trayéndote un ratón',
  skill: 'leyendo el manual gatuno',
  briefing: 'en reunión de gatos',
  delegating: 'pastoreando gatos',
  teammate: 'husmeando a un colega',
  input: 'maullándote',
  permission: 'arañando la puerta',
  done: 'ronroneando, todo listo',
  error: 'bufando a un bug',
};
