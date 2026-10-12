import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'मदद',
  placeholder: 'Catavasia के बारे में कुछ भी पूछें, या बिल्ली का प्रॉम्प्ट लिखने में मदद माँगें।',
  close: 'बंद करें',
  send: 'भेजें',
  stop: 'रोकें',
  thinking: 'सोच रहा हूँ…',
  newChat: 'नई चैट',
  greetingOnboarding:
    'नमस्ते! मैं आपका Catavasia गाइड हूँ। पूछिए कि सब कुछ कैसे काम करता है, या अपनी बिल्ली का प्रॉम्प्ट लिखने में मदद माँगिए।',
  greetingSettings:
    'नमस्ते! मैं आपका Catavasia गाइड हूँ। ऐप के बारे में कुछ भी पूछिए, या बिल्ली का प्रॉम्प्ट लिखने में मदद माँगिए।',
};
