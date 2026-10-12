import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'merencanakan perburuan',
  exploring: 'mengendus sekeliling',
  building: 'menguleni kode',
  testing: 'mencakar bug',
  reviewing: 'merapikan kode',
  delivering: 'membawakanmu tikus',
  skill: 'membaca buku panduan kucing',
  briefing: 'rapat para kucing',
  delegating: 'menggiring kucing',
  teammate: 'mengendus rekan tim',
  input: 'mengeong untukmu',
  permission: 'mencakar pintu',
  done: 'mendengkur, semua beres',
  error: 'mendesis pada bug',
};
