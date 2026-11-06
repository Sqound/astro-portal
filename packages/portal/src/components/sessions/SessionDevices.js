// « Monture et pointage »: what the night's pointing devices did, one line per
// fact, on the page of a session and in the debriefing (« M110 pointée par GoTo
// à 21:57 », « Monture arrêtée à 23:40 », « Liaison perdue 2 min »). The
// facts are `session-device-lines.js`'s, the sentences `deviceLineText`'s. Nothing is
// drawn for a night that kept none.

import { message } from "../../i18n.js";
import { deviceLineText } from "./session-page-view.js";

export function SessionDevices({ locale = "en", lines = [], timeZone = null }) {
  if (!lines.length) return null;
  return (
    <section
      className="night-card session-devices"
      aria-labelledby="session-devices-title"
    >
      <h2 id="session-devices-title">
        {message(locale, "sessionDevicesTitle")}
      </h2>
      <ul className="session-device-lines">
        {lines.map((line, index) => (
          <li
            className="night-card-line"
            key={`${line.kind}-${line.at}-${index}`}
          >
            {deviceLineText(line, locale, timeZone)}
          </li>
        ))}
      </ul>
    </section>
  );
}
