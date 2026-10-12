import type { Translation } from '../core.js';
import type { consent } from './en.js';

export const messages: Translation<typeof consent> = {
  headline: 'ایک بات اور: hooks!',
  what: 'آپ کے ایجنٹس کو ریئل ٹائم میں زندہ کرنے کے لیے catavasia {count} Claude Code ایونٹس کے hooks کو {file} میں شامل کرتا ہے۔ آپ کی موجودہ سیٹنگز برقرار رہتی ہیں، اور ایک بار کا بیک اپ {backup} کے نام سے محفوظ ہوتا ہے۔',
  data: 'Claude Code یہ ایونٹس، بشمول ٹول کے نام اور ٹول کے ان پٹ، اسی مشین پر موجود catavasia سرور کو بھیجے گا۔ سب کچھ مقامی رہتا ہے: سرور صرف 127.0.0.1 پر سنتا ہے، جب تک آپ اسے خود --host کے ساتھ شروع کر کے اپنے نیٹ ورک پر کھلا نہ کر دیں۔',
  reversible: 'آپ جب چاہیں Settings → Instant Detection (Hooks) سے hooks ہٹا سکتے ہیں۔',
};
