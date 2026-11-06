# The places of a space

The files here describe `/v1/places` (`../../schemas/api/place.schema.json`,
`../../schemas/api/v1.md`, « Places »). Like the recorded exchanges of
`../api/`, they are specification files, not generated from a function: the
service's tests replay them against the real routes, the contract tests check
them against the schema and against the rule they state, and the clients read
them for their own fakes and rules.

| File                       | What it holds                                                                                                                                                                      | Who replays it                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `places.json`              | One example of every body of the routes (a place, the list, a write and its answers, a deletion, the default place, an import, the errors), each with its schema                   | `packages/astro-contracts/tests/places.test.mjs` (schema)                                                        |
| `places-conflict.json`     | The matrix of the most recent edit: edit/edit, edit/delete, delete/edit, equal instants, a clock one hour ahead, a purged tombstone, the default place                             | the service (`packages/portal/tests/place-repository.test.mjs`, SQLite and PostgreSQL); the clients' fakes of it |
| `places-phone-writes.json` | What the phone writes: places as the phone's list keeps them, and the `PUT` body it builds from each (the zone completed by the service, the name taken from the locality, a note) | the phone (its builder must give exactly these bodies); the service                                              |
| `places-duplicates.json`   | The rule of possible duplicates (same name once folded, or less than 100 m), computed on the device, the same on the web and the phone                                             | `packages/astro-contracts/tests/places.test.mjs` (a reference reading of the rule); the clients                  |
| `places-default.json`      | The default place of a list: the marked one, else the oldest place with a position (earliest `editedAt`), whatever the order the list is shown in                                  | the clients                                                                                                      |

Never edit one of them without the other side: a change of the rule is a
change of `v1.md` and of the clients in the same change.
