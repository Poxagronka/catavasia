import { setLanguageLocal } from '../src/i18n/languageStore.js';

// The store starts from navigator.language, which Node 21+ takes from the OS locale. The tests expect English.
setLanguageLocal('en');
