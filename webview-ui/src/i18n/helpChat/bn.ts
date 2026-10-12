import type { Translation } from '../core.js';
import type { helpChat } from './en.js';

export const messages: Translation<typeof helpChat> = {
  title: 'সাহায্য',
  placeholder:
    'Catavasia সম্পর্কে যেকোনো কিছু জিজ্ঞাসা করুন, অথবা বিড়ালের প্রম্পট লিখতে সাহায্য চান।',
  close: 'বন্ধ করুন',
  send: 'পাঠান',
  stop: 'থামান',
  thinking: 'ভাবছি…',
  newChat: 'নতুন চ্যাট',
  greetingOnboarding:
    'নমস্কার! আমি আপনার Catavasia গাইড। সব কিছু কীভাবে কাজ করে তা জিজ্ঞাসা করুন, অথবা আপনার বিড়ালের প্রম্পট লিখতে আমার সাহায্য নিন।',
  greetingSettings:
    'নমস্কার! আমি আপনার Catavasia গাইড। অ্যাপ সম্পর্কে যেকোনো কিছু জিজ্ঞাসা করুন, অথবা বিড়ালের প্রম্পট লিখতে আমার সাহায্য নিন।',
};
