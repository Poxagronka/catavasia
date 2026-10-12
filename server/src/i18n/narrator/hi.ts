import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'शिकार की योजना',
  exploring: 'इधर-उधर सूँघ रहा है',
  building: 'कोड गूँथ रहा है',
  testing: 'बग पर पंजा मार रहा है',
  reviewing: 'कोड को सँवार रहा है',
  delivering: 'आपके लिए चूहा ला रहा है',
  skill: 'बिल्ली की किताब पढ़ रहा है',
  briefing: 'बिल्लियों की बैठक चल रही',
  delegating: 'बिल्लियों को सँभाल रहा है',
  teammate: 'साथी को सूँघ रहा है',
  input: 'आपको म्याऊँ बुला रहा है',
  permission: 'दरवाज़े पर पंजा मार रहा',
  done: 'घुरघुर, सब पूरा हुआ',
  error: 'बग पर फुफकार रहा है',
};
