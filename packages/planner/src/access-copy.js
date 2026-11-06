// The entry of the web planner: "Préparer la prochaine nuit", where a person
// who is not signed in chooses between planning here and signing in. Its
// words, and where "Se connecter" leads, depend on the service:
//
//  - a private server keeps its own: a guest of the portal, its sign-in with
//    the authenticator (`/auth/login`);
//  - a service made of spaces: the person continues "sans espace", signs in to "votre espace Astro Portal" and
//    is sent to the sign-in by e-mail code (`/auth/sign-in`), which brings
//    them back to the planner.
import { copyFor } from "portal/locales.js";
import { sitePath } from "portal/safe-redirect.js";
import { signInHrefFor } from "portal/sign-in-href.js";

const COPY = {
  fr: {
    loading: "Chargement du planificateur…",
    title: "Préparer la prochaine nuit",
    intro: "Choisissez simplement où garder vos plans d’observation.",
    guestHelp:
      "Vos plans restent sur cet appareil, dans le stockage local du navigateur.",
    signIn: "Se connecter",
    private: {
      guest: "Continuer en invité",
      signInHelp: "Retrouvez vos plans privés, sauvegardés dans votre portail.",
    },
    hosted: {
      guest: "Continuer sans espace",
      signInHelp:
        "Retrouvez vos plans privés, sauvegardés dans votre espace Astro Portal.",
    },
  },
  en: {
    loading: "Loading planner…",
    title: "Plan your next night",
    intro: "Choose where to keep your observing plans.",
    guestHelp: "Plans stay on this device, in this browser’s local storage.",
    signIn: "Sign in",
    private: {
      guest: "Continue as guest",
      signInHelp: "Open your private plans, saved in your portal.",
    },
    hosted: {
      guest: "Continue without a space",
      signInHelp: "Open your private plans, saved in your Astro Portal space.",
    },
  },
  ja: {
    loading: "観測プランナーを読み込み中…",
    title: "次の観測夜のプランを立てる",
    intro: "観測プランの保存場所を選んでください。",
    guestHelp: "プランはこの端末のブラウザ内ストレージにのみ保存されます。",
    signIn: "サインイン",
    private: {
      guest: "ゲストとして続ける",
      signInHelp: "ポータルに保存されたプライベートプランを開きます。",
    },
    hosted: {
      guest: "スペースなしで続ける",
      signInHelp:
        "Astro Portal スペースに保存されたプライベートプランを開きます。",
    },
  },
  de: {
    loading: "Planer wird geladen …",
    title: "Nächste Nacht planen",
    intro: "Wähle, wo deine Beobachtungspläne gespeichert werden.",
    guestHelp:
      "Pläne bleiben auf diesem Gerät, im lokalen Speicher dieses Browsers.",
    signIn: "Anmelden",
    private: {
      guest: "Als Gast fortfahren",
      signInHelp:
        "Öffne deine privaten Pläne, die in deinem Portal gespeichert sind.",
    },
    hosted: {
      guest: "Ohne Bereich fortfahren",
      signInHelp:
        "Öffne deine privaten Pläne, die in deinem Bereich in Astro Portal gespeichert sind.",
    },
  },
  es: {
    loading: "Cargando el planificador…",
    title: "Planifica tu próxima noche",
    intro: "Elige dónde guardar tus planes de observación.",
    guestHelp:
      "Los planes se quedan en este dispositivo, en el almacenamiento local de este navegador.",
    signIn: "Iniciar sesión",
    private: {
      guest: "Continuar como invitado",
      signInHelp: "Abre tus planes privados, guardados en tu portal.",
    },
    hosted: {
      guest: "Continuar sin un espacio",
      signInHelp:
        "Abre tus planes privados, guardados en tu espacio de Astro Portal.",
    },
  },
  it: {
    loading: "Caricamento del pianificatore…",
    title: "Pianificare la prossima notte",
    intro: "Scegli dove conservare i piani di osservazione.",
    guestHelp:
      "I piani restano su questo dispositivo, nell’archiviazione locale di questo browser.",
    signIn: "Accedere",
    private: {
      guest: "Continuare come ospite",
      signInHelp: "Apri i piani privati, salvati nel portale.",
    },
    hosted: {
      guest: "Continuare senza spazio",
      signInHelp: "Apri i piani privati, salvati nello spazio Astro Portal.",
    },
  },
  "pt-BR": {
    loading: "Carregando o planejador…",
    title: "Planeje sua próxima noite",
    intro: "Escolha onde guardar seus planos de observação.",
    guestHelp:
      "Os planos ficam neste dispositivo, no armazenamento local deste navegador.",
    signIn: "Entrar",
    private: {
      guest: "Continuar como convidado",
      signInHelp: "Abra seus planos privados, salvos no seu portal.",
    },
    hosted: {
      guest: "Continuar sem espaço",
      signInHelp:
        "Abra seus planos privados, salvos no seu espaço do Astro Portal.",
    },
  },
  "zh-Hans": {
    loading: "正在加载规划器…",
    title: "规划下一个观测夜",
    intro: "选择观测计划的保存位置。",
    guestHelp: "计划保存在此设备浏览器的本地存储中。",
    signIn: "登录",
    private: {
      guest: "以访客身份继续",
      signInHelp: "打开保存在你门户中的私人计划。",
    },
    hosted: {
      guest: "不使用空间，继续",
      signInHelp: "打开保存在Astro Portal空间中的私人计划。",
    },
  },
  "zh-Hant": {
    loading: "正在載入規劃工具…",
    title: "規劃下一個觀測夜",
    intro: "選擇觀測計畫的儲存位置。",
    guestHelp: "計畫儲存在此裝置瀏覽器的本機儲存空間中。",
    signIn: "登入",
    private: {
      guest: "以訪客身分繼續",
      signInHelp: "開啟儲存在你入口網站中的私人計畫。",
    },
    hosted: {
      guest: "不使用空間，繼續",
      signInHelp: "開啟儲存在 Astro Portal 空間中的私人計畫。",
    },
  },
  ru: {
    loading: "Загрузка планировщика…",
    title: "Спланируйте следующую ночь",
    intro: "Выберите, где хранить планы наблюдений.",
    guestHelp:
      "Планы остаются на этом устройстве, в локальном хранилище браузера.",
    signIn: "Войти",
    private: {
      guest: "Продолжить как гость",
      signInHelp: "Откройте личные планы, сохранённые в вашем портале.",
    },
    hosted: {
      guest: "Продолжить без пространства",
      signInHelp:
        "Откройте личные планы, сохранённые в вашем пространстве Astro Portal.",
    },
  },
};

export const ACCESS_COPY = COPY;

/**
 * Is this a service made of spaces? `GET /api/auth/status` names a sign-in page
 * (`signInPath`) wherever a person signs in; a private server also says
 * that it holds one space, its owner's (`spaceCreation: "closed"`), which
 * a service made of spaces never says.
 */
export const isHostedService = (auth) =>
  typeof auth?.signInPath === "string" &&
  Boolean(sitePath(auth.signInPath)) &&
  auth.spaceCreation !== "closed";

/** The words of the entry, for the service it is shown on. */
export function plannerAccessCopy(locale, { hosted = false } = {}) {
  const language = copyFor(COPY, locale, "access-copy.COPY");
  const service = hosted ? language.hosted : language.private;
  return {
    loading: language.loading,
    title: language.title,
    intro: language.intro,
    guestLabel: service.guest,
    guestHelp: language.guestHelp,
    signInLabel: language.signIn,
    signInHelp: service.signInHelp,
  };
}

/**
 * Where "Se connecter" leads, and back: the sign-in page of the service
 * (`/auth/sign-in` on a service made of spaces, `/auth/login` on a private
 * server signing in by password: `portal/sign-in-href.js`) with the planner
 * as its `next`. `next` goes through the same
 * same-site filter the sign-in pages apply again when they follow it
 * (`portal/safe-redirect.js`), so the address never carries anything but a
 * path of this site.
 */
export function plannerSignInHref({ locale, signInPath, method }) {
  const back = sitePath(`/${locale}/planner`) || `/${locale}`;
  return signInHrefFor({ signInPath, method }, back);
}
