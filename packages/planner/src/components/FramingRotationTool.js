import { message } from "portal/i18n.js";
import { framingAngleFromInput } from "../framing-rotation.js";

// The "Rotation" tool of the web framing editor -- the frame alone turns (the
// map never does on the web). A slider from 0 to 359°, a field, "Remettre à
// 0°" (a link: it puts things back), and the hint for Alt + the wheel over the
// map. Disabled, like "Créer ce cadrage", while there is no frame.
export function FramingRotationTool({
  angleDegrees,
  angleText,
  disabled = false,
  locale,
  onAngleText,
  onTurn,
}) {
  const title = message(locale, "plannerFramingRotation");
  const hintId = "planner-framing-rotation-hint";
  return (
    <section
      aria-label={title}
      className="planner-framing-rotation"
      data-testid="framing-rotation-tool"
    >
      <div className="planner-framing-rotation-head">
        <h3>{title}</h3>
        <button
          className="btn-link"
          data-testid="framing-rotation-reset"
          disabled={disabled || angleDegrees === 0}
          onClick={() => onTurn(0)}
          type="button"
        >
          {message(locale, "plannerFramingRotationReset")}
        </button>
      </div>
      <div className="planner-framing-rotation-inputs">
        <input
          aria-describedby={hintId}
          aria-label={title}
          aria-valuetext={message(
            locale,
            "plannerFramingPositionAngle",
          ).replace("{angle}", String(angleDegrees))}
          data-testid="framing-rotation-slider"
          disabled={disabled}
          max={359}
          min={0}
          onChange={(event) => onTurn(Number(event.target.value))}
          step={1}
          type="range"
          value={angleDegrees}
        />
        <label className="planner-framing-rotation-field">
          <input
            aria-describedby={hintId}
            aria-label={title}
            data-testid="framing-rotation-field"
            disabled={disabled}
            inputMode="numeric"
            max={359}
            min={0}
            onBlur={() =>
              onTurn(framingAngleFromInput(angleText) ?? angleDegrees)
            }
            onChange={(event) => onAngleText(event.target.value)}
            step={1}
            type="number"
            value={angleText}
          />
          <span aria-hidden="true">°</span>
        </label>
      </div>
      <p className="planner-framing-rotation-hint" id={hintId}>
        {message(locale, "plannerFramingRotationHint")}
      </p>
    </section>
  );
}
