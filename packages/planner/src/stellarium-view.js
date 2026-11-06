// Stellarium's VIEW frame looks along negative Z.  This is also the direction
// used by the map projection: points with a non-negative VIEW Z are behind
// the camera.  Keeping it as a named helper prevents a spherical-coordinate
// origin ([1, 0, 0]) from being mistaken for the visible map centre.
export function stellariumViewCentreVector() {
  return [0, 0, -1];
}
