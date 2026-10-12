import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'मालिक',
  ownerNone: 'कोई नहीं',
  ownerHint:
    'पालतू अपने मालिक के पास ज़्यादा रहता है: उसके पीछे चलता है, उसकी मेज़ पर आराम करता है और पास में सोता है।',
};
