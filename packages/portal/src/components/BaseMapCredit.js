// The credit of the dark base map, in a corner of the map: « © OpenStreetMap
// contributors, © CARTO » — each name a link, never behind a click (CARTO's
// attribution page: « Cannot be hidden, faded, or behind a click »). The
// words are the licensors' own and stay in English in every language.

export function BaseMapCredit({ source }) {
  const [first, ...rest] = source.credits;
  return (
    <p className="base-map-credit" data-base-map={source.id}>
      {"© "}
      <a href={first.href} target="_blank" rel="noopener noreferrer">
        {first.text}
      </a>
      {" contributors"}
      {rest.map((credit) => (
        <span key={credit.text}>
          {", © "}
          <a href={credit.href} target="_blank" rel="noopener noreferrer">
            {credit.text}
          </a>
        </span>
      ))}
    </p>
  );
}
