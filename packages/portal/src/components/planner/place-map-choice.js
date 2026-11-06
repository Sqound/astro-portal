import { onTouchLongPress } from "./touch-long-press.js";

// How the editor's place map chooses a position: a click (the mouse's gesture,
// and a short touch), a touch long press (the same choice) or the end of
// a marker drag. `choose` receives a Leaflet `LatLng`. Returns what unbinds it.
export function bindPlaceMapChoice(map, marker, choose) {
  const click = (event) => choose(event.latlng);
  const dragged = () => choose(marker.getLatLng());
  map.on("click", click);
  marker.on("dragend", dragged);
  const stopLongPress = onTouchLongPress(
    map.getContainer(),
    (point) => choose(map.mouseEventToLatLng(point)),
    { ignore: (event) => event.target.closest?.(".leaflet-marker-icon") },
  );
  return () => {
    map.off("click", click);
    marker.off("dragend", dragged);
    stopLongPress();
  };
}
