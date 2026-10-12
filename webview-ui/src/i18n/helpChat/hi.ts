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
  errReplaced: 'किसी दूसरी विंडो ने नया सवाल पूछा। फिर से पूछें।',
  errNoAnswer: 'कोई जवाब नहीं मिला।',
  errExited: 'Claude Code एग्ज़िट कोड {code} के साथ रुक गया। फिर से कोशिश करें।',
  unavailableNotInstalled: 'Claude Code इंस्टॉल नहीं है। इसे इंस्टॉल करें, फिर दोबारा कोशिश करें।',
  unavailableNotLoggedIn: 'Claude Code में लॉग इन नहीं है। लॉग इन करें, फिर दोबारा कोशिश करें।',
};
