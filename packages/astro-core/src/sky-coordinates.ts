// Centre coordinates in the ICRS/J2000 reference frame.  The values were
// resolved from the catalogue object names with CDS Sesame/SIMBAD on
// 2026-09-07, then kept locally so the gallery map has no runtime dependency.
type TargetCoordinateSource = {
  stellarium?: { source?: string };
  objects?: readonly string[];
};

type EquatorialCoordinate = { ra: number; dec: number };

const coordinates: Record<string, readonly [number, number]> = {
  "IC 1318": [304.2, 41.9567],
  "IC 1396": [324.745, 57.5139],
  "IC 1805": [38.21, 61.4711],
  "IC 342": [56.7021, 68.0961],
  "IC 410": [80.5, 33.4833],
  "IC 434": [85.25, -2.5],
  "IC 443": [94.25, 22.57],
  LDN1235: [333.7292, 73.4167],
  M1: [83.6324, 22.0174],
  M100: [185.7289, 15.8223],
  M101: [210.8024, 54.3488],
  M13: [250.4235, 36.4613],
  M16: [274.688, -13.792],
  M17: [275.1958, -16.1717],
  M27: [299.9015, 22.7212],
  M31: [10.6847, 41.2688],
  M37: [88.0742, 32.545],
  M40: [185.55, 58.0833],
  M42: [83.8201, -5.3876],
  M43: [83.8792, -5.27],
  M45: [56.6008, 24.1139],
  M51: [202.4696, 47.1953],
  M57: [283.3962, 33.0291],
  M64: [194.1821, 21.6827],
  M65: [169.733, 13.0923],
  M78: [86.6908, 0.0792],
  M8: [270.9042, -24.3867],
  M81: [148.8882, 69.0653],
  M82: [148.9685, 69.6797],
  M97: [168.6988, 55.0191],
  "NGC 1491": [60.8163, 51.315],
  "NGC 1579": [67.514, 35.325],
  "NGC 2024": [85.4292, -1.8417],
  "NGC 2174": [92.425, 20.5],
  "NGC 2392": [112.2949, 20.9118],
  "NGC 2903": [143.0421, 21.5008],
  "NGC 4490": [187.6437, 41.6405],
  "NGC 4565": [189.0867, 25.9874],
  "NGC 6960": [311.4083, 30.7083],
  "NGC 6992": [314.0792, 31.7433],
  "NGC 7000": [314.6958, 44.33],
  "NGC 7023": [315.4038, 68.1633],
  "NGC 7635": [350.2013, 61.2017],
  Sadr: [305.5571, 40.2567],
};

export function coordinateForTarget(
  target: TargetCoordinateSource,
): EquatorialCoordinate | null {
  const name = target.stellarium?.source || target.objects?.[0];
  if (!name) return null;
  const coordinate = coordinates[name];
  return coordinate ? { ra: coordinate[0], dec: coordinate[1] } : null;
}
