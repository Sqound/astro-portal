# The acquisition lines of a plan, carried by every hand

`acquisition-round-trip.json` describes one plan with the plan's defaults
(`acquisitionDefaults`) and the lines of its targets (`items[].acquisition`),
written by the web planner, served by the service, pushed back by the phone
with the lines frozen at the launch (`launchedSchedule[].acquisition`,
`ruleVersion`), and kept by the service (`../../schemas/api/v1.md`, « What to
shoot: the acquisition lines of a plan »). It is a specification file, written
by hand except for `served`, which was recorded from the real route handlers.

| Member       | What it holds                                             | Who replays it                                                             |
| ------------ | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `web`        | the plan the web planner saves with `PUT /api/plans`      | the service's tests                                                        |
| `served`     | the payload `GET /v1/plans` answers for it                | the service's answer, and the clients (they read it)                       |
| `phoneWrite` | what the phone pushes back after a retouch and the launch | the phone's push; the service (`PUT /v1/plans/{planId}` keeps every field) |

Never edit one side without the other: a change of the payload is a change of
every reader in the same change.
