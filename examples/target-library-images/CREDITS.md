# Solar System pictures — credits

These 11 pictures of the Solar System's bodies ship with Astro Portal so that the target
catalogue shows them without any import. **They are NASA media, not part of
Astro Portal's source code, and they are not covered by its AGPL-3.0 licence.**
They are used under the [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/): NASA
content is generally not subject to copyright in the United States, may be used
for educational and informational purposes, and must be acknowledged as coming
from NASA, without implying NASA's endorsement of Astro Portal or of anything
else. None of these 11 pictures includes an identifiable person or a logo of a
third party, and none is marked by NASA as copyright-protected.

Source for all of them: NASA Image and Video Library (https://images.nasa.gov/).
Each file is the `~small` JPEG of the record (`~thumb` for Jupiter), downloaded
by `npm run import:solar-system-images -- --bundle`; the record's own
credit line is given below. The machine-readable version of this table is
`SOURCES.json`; `packages/astro-core/src/solar-system-image-sources.ts` is
where the records are declared.

| Body    | File                                                  | NASA ID                                                                                        | Credit                                                                                               | Notes                                                                                                                        |
| ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sun     | `solar-system-sun.jpg` (640×360, 23 KB)               | [GSFC_20171208_Archive_e002069](https://images.nasa.gov/details/GSFC_20171208_Archive_e002069) | NASA/GSFC/SVS/SDO                                                                                    | SDO AIA full-disk view of a launching filament                                                                               |
| Moon    | `solar-system-moon.jpg` (640×640, 49 KB)              | [GSFC_20171208_Archive_e001861](https://images.nasa.gov/details/GSFC_20171208_Archive_e001861) | NASA/Goddard Space Flight Center Scientific Visualization Studio                                     | Full Moon — Lunar Reconnaissance Orbiter visualization                                                                       |
| Mercury | `solar-system-mercury.jpg` (640×360, 28 KB)           | [PIA16853](https://images.nasa.gov/details/PIA16853)                                           | NASA/Johns Hopkins University Applied Physics Laboratory/Carnegie Institution of Washington          | Colors of the innermost planet                                                                                               |
| Venus   | `solar-system-venus.jpg` (312×312, 6 KB)              | [PIA23791](https://images.nasa.gov/details/PIA23791)                                           | NASA/JPL-Caltech (Mariner 10 data processed by Kevin M. Gill)                                        | Venus; left half of NASA's comparison board only (natural view, without the contrast-enhanced one and the rule between them) |
| Earth   | `solar-system-earth-blue-marble.jpg` (640×640, 67 KB) | [PIA18033](https://images.nasa.gov/details/PIA18033)                                           | NASA (Suomi NPP satellite, VIIRS instrument)                                                         | Blue Marble Earth                                                                                                            |
| Mars    | `solar-system-mars.jpg` (640×640, 50 KB)              | [PIA00407](https://images.nasa.gov/details/PIA00407)                                           | NASA/JPL/USGS                                                                                        | Mars                                                                                                                         |
| Jupiter | `solar-system-jupiter.jpg` (400×400, 11 KB)           | [PIA01509](https://images.nasa.gov/details/PIA01509)                                           | NASA/JPL (Voyager 1)                                                                                 | Jupiter                                                                                                                      |
| Saturn  | `solar-system-saturn.jpg` (576×640, 14 KB)            | [PIA02225](https://images.nasa.gov/details/PIA02225)                                           | NASA/JPL (Voyager)                                                                                   | Saturn                                                                                                                       |
| Uranus  | `solar-system-uranus.jpg` (640×640, 14 KB)            | [PIA18182](https://images.nasa.gov/details/PIA18182)                                           | NASA/JPL-Caltech (Voyager 2)                                                                         | Uranus                                                                                                                       |
| Neptune | `solar-system-neptune.jpg` (640×639, 20 KB)           | [PIA01492](https://images.nasa.gov/details/PIA01492)                                           | NASA/JPL (Voyager 2)                                                                                 | Neptune                                                                                                                      |
| Pluto   | `solar-system-pluto.jpg` (640×640, 47 KB)             | [PIA19952](https://images.nasa.gov/details/PIA19952)                                           | NASA/Johns Hopkins University Applied Physics Laboratory/Southwest Research Institute (New Horizons) | The rich color variations of Pluto                                                                                           |

To refresh the files from NASA: `npm run import:solar-system-images -- --bundle`.
