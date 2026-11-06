/**
 * The constellation keys of the shared catalogue (migration 109
 * `constellation-keys-iau`): until then a constellation was keyed by its French
 * name (« Lyre »), but for the Carina (« Car »), the Serpent in two parts
 * (« Se1 », « Se2 ») and a few English labels that had slipped in (« Air
 * Pump », « Bird of Paradise », « Boötes » / « Bootes »). The key is now the
 * IAU abbreviation (`Lyr`), the same for every constellation and for the one
 * Serpent (`Ser`). The pairs are a frozen copy of the spellings the catalogue
 * has carried, as they were when the migration was written: a migration is
 * history, a later change of the constellation table does not rewrite it.
 *
 * The migration renames the key of every catalogue row, and the key the
 * administration may have written into a row's overrides; a target the source
 * gives no constellation, with a position, is placed by the IAU boundaries by
 * the next import (the catalogue's source revision changes with this release).
 * Running the statements again changes nothing: no row carries an old key.
 */

/** `[old key, IAU abbreviation]`. */
export const CONSTELLATION_KEY_RENAMES = Object.freeze([
  Object.freeze(["Andromède", "And"]),
  Object.freeze(["Air Pump", "Ant"]),
  Object.freeze(["Antlia", "Ant"]),
  Object.freeze(["Apus", "Aps"]),
  Object.freeze(["Bird of Paradise", "Aps"]),
  Object.freeze(["Aigle", "Aql"]),
  Object.freeze(["Verseau", "Aqr"]),
  Object.freeze(["Autel", "Ara"]),
  Object.freeze(["Bélier", "Ari"]),
  Object.freeze(["Cocher", "Aur"]),
  Object.freeze(["Bootes", "Boo"]),
  Object.freeze(["Bouvier", "Boo"]),
  Object.freeze(["Boötes", "Boo"]),
  Object.freeze(["Grand Chien", "CMa"]),
  Object.freeze(["Petit Chien", "CMi"]),
  Object.freeze(["Chiens de chasse", "CVn"]),
  Object.freeze(["Burins", "Cae"]),
  Object.freeze(["Girafe", "Cam"]),
  Object.freeze(["Capricorne", "Cap"]),
  Object.freeze(["Cassiopée", "Cas"]),
  Object.freeze(["Centaure", "Cen"]),
  Object.freeze(["Céphée", "Cep"]),
  Object.freeze(["Baleine", "Cet"]),
  Object.freeze(["Caméléon", "Cha"]),
  Object.freeze(["Compas", "Cir"]),
  Object.freeze(["Cancer", "Cnc"]),
  Object.freeze(["Colombe", "Col"]),
  Object.freeze(["Chevelure de Bérénice", "Com"]),
  Object.freeze(["Couronne australe", "CrA"]),
  Object.freeze(["Couronne boréale", "CrB"]),
  Object.freeze(["Coupe", "Crt"]),
  Object.freeze(["Croix du Sud", "Cru"]),
  Object.freeze(["Corbeau", "Crv"]),
  Object.freeze(["Cygne", "Cyg"]),
  Object.freeze(["Dauphin", "Del"]),
  Object.freeze(["Dorade", "Dor"]),
  Object.freeze(["Dragon", "Dra"]),
  Object.freeze(["Petit Cheval", "Equ"]),
  Object.freeze(["Éridan", "Eri"]),
  Object.freeze(["Fourneau", "For"]),
  Object.freeze(["Gémeaux", "Gem"]),
  Object.freeze(["Grue", "Gru"]),
  Object.freeze(["Hercule", "Her"]),
  Object.freeze(["Horloge", "Hor"]),
  Object.freeze(["Hydre", "Hya"]),
  Object.freeze(["Hydre mâle", "Hyi"]),
  Object.freeze(["Indien", "Ind"]),
  Object.freeze(["Petit Lion", "LMi"]),
  Object.freeze(["Lézard", "Lac"]),
  Object.freeze(["Lion", "Leo"]),
  Object.freeze(["Lièvre", "Lep"]),
  Object.freeze(["Balance", "Lib"]),
  Object.freeze(["Loup", "Lup"]),
  Object.freeze(["Lynx", "Lyn"]),
  Object.freeze(["Lyre", "Lyr"]),
  Object.freeze(["Table", "Men"]),
  Object.freeze(["Microscope", "Mic"]),
  Object.freeze(["Licorne", "Mon"]),
  Object.freeze(["Mouche", "Mus"]),
  Object.freeze(["Règle", "Nor"]),
  Object.freeze(["Octant", "Oct"]),
  Object.freeze(["Ophiuchus", "Oph"]),
  Object.freeze(["Orion", "Ori"]),
  Object.freeze(["Paon", "Pav"]),
  Object.freeze(["Pégase", "Peg"]),
  Object.freeze(["Persée", "Per"]),
  Object.freeze(["Phénix", "Phe"]),
  Object.freeze(["Peintre", "Pic"]),
  Object.freeze(["Poisson austral", "PsA"]),
  Object.freeze(["Poissons", "Psc"]),
  Object.freeze(["Poupe", "Pup"]),
  Object.freeze(["Boussole", "Pyx"]),
  Object.freeze(["Réticule", "Ret"]),
  Object.freeze(["Sculpteur", "Scl"]),
  Object.freeze(["Scorpion", "Sco"]),
  Object.freeze(["Écu de Sobieski", "Sct"]),
  Object.freeze(["Se1", "Ser"]),
  Object.freeze(["Se2", "Ser"]),
  Object.freeze(["Serpens", "Ser"]),
  Object.freeze(["Serpent", "Ser"]),
  Object.freeze(["Sextant", "Sex"]),
  Object.freeze(["Flèche", "Sge"]),
  Object.freeze(["Sagittaire", "Sgr"]),
  Object.freeze(["Taureau", "Tau"]),
  Object.freeze(["Télescope", "Tel"]),
  Object.freeze(["Triangle austral", "TrA"]),
  Object.freeze(["Triangle", "Tri"]),
  Object.freeze(["Toucan", "Tuc"]),
  Object.freeze(["Grande Ourse", "UMa"]),
  Object.freeze(["Petite Ourse", "UMi"]),
  Object.freeze(["Voiles", "Vel"]),
  Object.freeze(["Vierge", "Vir"]),
  Object.freeze(["Poisson volant", "Vol"]),
  Object.freeze(["Renard", "Vul"]),
]);

const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

function caseOf(expression) {
  return `CASE ${expression} ${CONSTELLATION_KEY_RENAMES.map(
    ([from, to]) => `WHEN ${literal(from)} THEN ${literal(to)}`,
  ).join(" ")} END`;
}

const oldKeys = () =>
  CONSTELLATION_KEY_RENAMES.map(([from]) => literal(from)).join(", ");

/**
 * The statements of migration 109 for [dialect]: the column, then the key an
 * administrator may have written into a row's overrides. The migration runner
 * cuts the text at every « ; »: no value holds one.
 */
export function constellationKeySql(dialect) {
  const column = `UPDATE target_catalogue_entries SET constellation_key = ${caseOf("constellation_key")} WHERE constellation_key IN (${oldKeys()});`;
  const overrides =
    dialect === "postgres"
      ? `UPDATE target_catalogue_entries SET overrides_json = jsonb_set(overrides_json::jsonb, '{constellationKey}', to_jsonb(${caseOf("overrides_json::jsonb ->> 'constellationKey'")}))::text WHERE overrides_json::jsonb ->> 'constellationKey' IN (${oldKeys()});`
      : `UPDATE target_catalogue_entries SET overrides_json = json_set(overrides_json, '$.constellationKey', ${caseOf("json_extract(overrides_json, '$.constellationKey')")}) WHERE json_valid(overrides_json) AND json_extract(overrides_json, '$.constellationKey') IN (${oldKeys()});`;
  return `${column}\n${overrides}`;
}
