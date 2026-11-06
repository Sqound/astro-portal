// The font stack of an e-mail, by the language of its words. The base stack
// names Japanese faces (Hiragino Sans, Yu Gothic, Meiryo), which draw Han
// characters in their Japanese forms: a Chinese message asks for the faces of
// its own script first.
const base = "-apple-system,BlinkMacSystemFont,'Segoe UI'";
const japanese = "'Hiragino Sans','Yu Gothic',Meiryo";

export function fontStack(language) {
  if (language === "zh-Hans")
    return `${base},'PingFang SC','Microsoft YaHei',${japanese},sans-serif`;
  if (language === "zh-Hant")
    return `${base},'PingFang TC','Microsoft JhengHei',${japanese},sans-serif`;
  return `${base},${japanese},sans-serif`;
}
