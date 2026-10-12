import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'আরও একটা কথা: hooks!',
  what: 'আপনার এজেন্টদের রিয়েল টাইমে জীবন্ত করতে catavasia {count}টি Claude Code ইভেন্টের hooks {file}-এ যোগ করে। আপনার বিদ্যমান সেটিংস থেকে যায়, আর একবারের ব্যাকআপ {backup} নামে সংরক্ষিত হয়।',
  data: 'Claude Code এই ইভেন্টগুলো, টুলের নাম ও টুলের ইনপুটসহ, এই মেশিনের একটি catavasia সার্ভারে পাঠাবে। সবকিছু স্থানীয় থাকে: সার্ভার শুধু 127.0.0.1-এ শোনে, যদি না আপনি নিজে --host দিয়ে চালিয়ে আপনার নেটওয়ার্কে খুলে দেন।',
  reversible: 'আপনি যেকোনো সময় Settings → Instant Detection (Hooks) থেকে hooks সরাতে পারেন।',
};
