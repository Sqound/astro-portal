// The equipment a quick plan starts with: a paired owner's first telescope,
// camera and eyepiece, else nothing chosen yet (`null`, « Choisir… »).
export function quickPlanEquipment({ paired = false, profiles = {} } = {}) {
  return {
    mode: "imaging",
    telescopeId: (paired && profiles.telescopes?.[0]?.id) || null,
    mountId: "none",
    cameraId: (paired && profiles.cameras?.[0]?.id) || null,
    eyepieceId: (paired && profiles.eyepieces?.[0]?.id) || null,
    eyepieceFocalLengthMm: "",
    modifierId: "none",
    restrictToEquipment: false,
    filterIds: [],
  };
}
