import { copyFor } from "../locales.js";
import { flowMessagesEn } from "../messages/flow/en.js";
import { flowMessagesFr } from "../messages/flow/fr.js";
import { flowMessagesJa } from "../messages/flow/ja.js";
import { flowMessagesZhHans } from "../messages/flow/zh-Hans.js";
import { flowMessagesZhHant } from "../messages/flow/zh-Hant.js";
import { flowMessagesRu } from "../messages/flow/ru.js";
import { flowMessagesDe } from "../messages/flow/de.js";
import { flowMessagesEs } from "../messages/flow/es.js";
import { flowMessagesIt } from "../messages/flow/it.js";
import { flowMessagesPtBR } from "../messages/flow/pt-BR.js";

const messages = {
  en: flowMessagesEn,
  fr: flowMessagesFr,
  ja: flowMessagesJa,
  "zh-Hans": flowMessagesZhHans,
  "zh-Hant": flowMessagesZhHant,
  ru: flowMessagesRu,
  de: flowMessagesDe,
  es: flowMessagesEs,
  it: flowMessagesIt,
  "pt-BR": flowMessagesPtBR,
};

export { messages as plannerFlowMessages };

export function plannerFlowMessage(locale, key) {
  return (
    copyFor(messages, locale, "planner.flowMessages")[key] ||
    messages.en[key] ||
    key
  );
}
