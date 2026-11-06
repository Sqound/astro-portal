// The icon of an observation mode: a camera for photo, an eye for visual. The
// planner's « Mode d'observation » switch and the « Prévisualiser » section of
// "Statistiques de la cible" draw it before « Photo » and « Visuel ».
export function ObservationModeIcon({ mode }) {
  if (mode === "visual")
    return (
      <svg className="planner-mode-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.8 12s3.3-5.6 9.2-5.6 9.2 5.6 9.2 5.6-3.3 5.6-9.2 5.6S2.8 12 2.8 12Z" />
        <circle cx="12" cy="12" r="2.7" />
      </svg>
    );
  return (
    <svg className="planner-mode-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 8.5h3l1.3-2h6.4l1.3 2h3A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Z" />
      <circle cx="12" cy="14" r="3.2" />
    </svg>
  );
}
