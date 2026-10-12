import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'avı planlıyor',
  exploring: 'etrafı kokluyor',
  building: 'kodu yoğuruyor',
  testing: 'böceklere pati atıyor',
  reviewing: 'kodu tımarlıyor',
  delivering: 'sana bir fare getiriyor',
  skill: 'kedi kılavuzunu okuyor',
  briefing: 'kedi toplantısı yapıyor',
  delegating: 'kedileri güdüyor',
  teammate: 'takım arkadaşını kokluyor',
  input: 'senin için miyavlıyor',
  permission: 'kapıyı tırmalıyor',
  done: 'mırıl mırıl, hepsi bitti',
  error: 'bir hataya tıslıyor',
};
