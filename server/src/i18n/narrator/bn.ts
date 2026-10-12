import type { Translation } from '../core.js';
import type { narrator } from './en.js';

export const messages: Translation<typeof narrator> = {
  planning: 'শিকারের ছক কষছে',
  exploring: 'চারদিকে শুঁকছে',
  building: 'কোড মাখছে',
  testing: 'বাগকে থাবা মারছে',
  reviewing: 'কোড আঁচড়ে সাজাচ্ছে',
  delivering: 'আপনার জন্য ইঁদুর আনছে',
  skill: 'বিড়ালের বই পড়ছে',
  briefing: 'বিড়ালদের সভা চলছে',
  delegating: 'বিড়ালদের সামলাচ্ছে',
  teammate: 'সহকর্মীকে শুঁকছে',
  input: 'আপনাকে ম্যাঁও ডাকছে',
  permission: 'দরজায় থাবা মারছে',
  done: 'গরগর, সব শেষ',
  error: 'বাগের দিকে ফোঁস করছে',
};
