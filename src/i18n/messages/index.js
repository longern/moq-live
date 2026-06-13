import { enMessages } from "./en.js";
import { zhCNMessages } from "./zh-CN.js";

export const DEFAULT_LOCALE = "zh-CN";
export const SUPPORTED_LOCALES = ["zh-CN", "en"];

export const messages = {
  "zh-CN": zhCNMessages,
  en: enMessages,
};
