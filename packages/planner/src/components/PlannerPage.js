"use client";

import { dateLabel, savedPlannerDate } from "../date-label.js";
import { plannerOpeningState, takePlannerOpening } from "../planner-opening.js";
import { localizedPlanName } from "../quick-plan-messages.js";
import { CatalogueCardImage } from "./CatalogueCardImage.js";
import {
  skyCatalogueMetaLine,
  skyCultureArtCredit,
  skyPictureKindOf,
} from "portal/sky-pictures.js";
import { NightPlaceBand } from "./NightPlaceBand.js";
import { PlannerPlanExistsDialog } from "./PlanExistsDialog.js";
import { planItemOverlaps } from "../plan-overlap.js";
import { AvailabilityGraph } from "./AvailabilityGraph.js";
import { HourlyForecast, InfoDisclosure } from "./HourlyForecast.js";
import { NightZone, VerdictSection } from "./NightDetailParts.js";
import { ConditionsCalendar } from "./ConditionsCalendar.js";
import { ConditionsPage } from "./ConditionsPage.js";
import { useConditionsCalendar } from "./useConditionsCalendar.js";
import {
  conditionsOffsetFor,
  conditionsPastAllowed,
} from "../conditions-calendar.js";
import {
  Fragment,
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  TargetKnowledgeDetails,
  knowledgeRouteIdOf,
} from "./TargetKnowledgeDetails.js";
import {
  localizedServerError,
  message,
  productName,
  sentenceSeparator,
} from "portal/i18n.js";
import { randomUuid } from "portal/random-uuid.js";
import { sameShallowContentProps } from "../render-stability.js";
import { observeStageCrumbs, scrollToStageTitle } from "../stage-crumb.js";
import { modifierChoices } from "../equipment-labels.js";
import { formatDeclination, formatRightAscension } from "portal/format.js";
import { durationText, labelValue } from "portal/written-forms.js";
import { reconcileCatalogueSnapshot } from "astro-core/planner-coordinates.js";
import {
  catalogueSourceCredit,
  distanceSourceCredits,
} from "astro-core/catalogue-sources.js";
import {
  frozenPlanTarget,
  framingPlanEquipmentDiffers,
  framingPlanMosaicGrid,
  framingPreviewPictureStyle,
  framingPreviewView,
  framingTargetIsLocked,
  normalizeFramingAngle,
} from "../framings.js";
import { framingAngleFromInput, framingAngleOf } from "../framing-rotation.js";
import { FramingRotationTool } from "./FramingRotationTool.js";
import { HorizonGlyph, PlannerHorizonBadge } from "./PlannerHorizonBadge.js";
import { ScheduleDisplaySwitch } from "./ScheduleDisplaySwitch.js";
import {
  deleteFraming,
  listFramings,
  putFraming,
  restoreFraming,
} from "../framing-client.js";
import {
  addFramingTargetToNight,
  rememberNightFraming,
} from "../night-framing-client.js";
import { nightFramingRequest, nightPagePath } from "../night-targets-search.js";
import {
  framingEditorConfirmLabelKey,
  framingEditorMapInputs,
} from "../framing-editor.js";
import { framingSearchFieldDegrees } from "../framing-target-search.js";
import {
  FramingHighlightChip,
  FramingTargetSearchPanel,
} from "./FramingTargetSearch.js";
import {
  MissingObjectContext,
  MissingObjectLink,
  missingObjectAvailable,
} from "../missing-object-slot.js";
import {
  addPlannerPlan,
  applyNightPlace,
  movePendingPlansToNight,
  nightFollowingPlace,
  choosePlannerDate,
  defaultPlanView,
  knownElevation,
  migratePlannerState,
  nightDateLabel,
  normalizePlace,
  normalizeKnownPlaceLink,
  normalizePlanHorizonLayers,
  planViewForTargetSelection,
  placeFingerprint,
  placeIsVeryFar,
  repairPlannerDocument,
  selectPlannerPlan,
  validatePlannerDocument,
} from "portal/planner/state.js";
import {
  chooseDateAtPlace,
  mergeNightsAtSamePlace,
  nightBesideFinishedPlans,
  nightPlaceConflict,
  plansMovedToPlace,
  unifyNightPlace,
} from "portal/planner/night-place.js";
import {
  defaultConfigurationKeys,
  normalizeDefaultConfiguration,
  planStartEquipment,
} from "portal/planner/default-configuration.js";
import {
  plannerDeviceStorageKey,
  plannerDocumentFingerprint,
  resolvePlannerDocuments,
  stampPlannerDocument,
} from "portal/planner/sync.js";
import {
  CHANGE_SIGNAL_EVENT,
  clientInstanceHeaders,
  startChangeSubscription,
} from "portal/planner/change-subscription.js";
import {
  PlannerPlaceDialog,
  locationRequest,
} from "portal/components/planner/PlannerPlaceDialog.js";
import { PlaceFarDialog } from "portal/components/planner/PlaceFarDialog.js";
import { PlannerHorizonViewer } from "portal/components/planner/PlannerHorizonViewer.js";
import {
  WebConfirmDialog,
  WebDialog,
} from "portal/components/dialog/WebDialog.js";
import { EmptyState } from "portal/components/empty/EmptyState.js";
import { LoadingState } from "portal/components/LoadingState.js";
import { InfoButton } from "portal/components/dialog/InfoButton.js";
import { levelClass } from "portal/components/dialog/button-levels.js";
import { InfoLine } from "portal/components/dialog/InfoButton.js";
import { horizonTimeIndex } from "portal/planner/horizon-time.js";
import {
  defaultHorizonMask,
  horizonCardinalDirection,
  horizonMaskPointCount,
  horizonMaskHasProfile,
  horizonMaskStep,
  normaliseHorizonMask,
} from "portal/planner/horizon-mask.js";
import { plannerDateAfterDays } from "portal/planner/calendar.js";
import {
  createPlacementGesture,
  itemHasNoTimeTonight,
  meridianCut,
  meridianTransit,
  mountFlipsAtMeridian,
  overlapSegments,
  placementCommit,
  placementReading,
  placementSlotsOf,
  plannedWindow,
  scheduleBlockCarriesContent,
  scheduleBlockMark,
  scheduleExtendBounds,
  scheduleExtendPatch,
  scheduleOrderNumbers,
  scheduleRowOrder,
  scheduleSnapMinutes,
  scheduleStartUpdate,
  scheduleWindowShift,
  snapToScheduleEdge,
} from "../schedule.js";
import { PlanMergeFieldsSection } from "./PlanMergeFields.js";
import {
  planFieldChoicesFor,
  planFieldDifferences,
  planFieldSideLocal,
  planFieldSideOther,
  mergeOverlaps,
  mergeRailLanes,
  mergeResultItems,
  mergeSideBrowser,
  mergeSideOther,
  mergeSlotState,
  mergeTotalMinutes,
  mergeWindows,
  removeMergeEntry,
  toggleMergeEntry,
  updateMergeEntryWindow,
  wholeVersionEntries,
} from "../plan-merge.js";
import { plannedItemPlacement } from "../item-placement.js";
import {
  itemsWithSpread,
  placeAddedItem,
  spreadCardsByTarget,
  spreadOverlappingItems,
} from "../spread-targets.js";
import { PlanOverlapNotice } from "./PlanOverlapNotice.js";
import { targetIdsTakenOnNight } from "../night-taken-targets.js";
import { nextNumberedPlanName } from "../night-plan-names.js";
import {
  spreadDoneLine,
  timelineAddLine,
  timelinePlanSlotLine,
  timelinePlanTargets,
  timelineTotals,
  timelineTotalsLine,
} from "../timeline-column.js";
import {
  cardWithinNightSpan,
  readSlotAgainstSpan,
  customSpanOfWindow,
  planWithNightSpan,
} from "../night-span.js";
import { NightSpanTimeline } from "./NightSpanTimeline.js";
import { scheduleRevealOffset } from "../schedule-reveal.js";
import {
  clearLocationReview,
  withLocationReviewReason,
} from "../location-review.js";
import { transposeNightSpansOfPlaceChange } from "../night-slot-transpose.js";
import { foldedPlaceSummary, placeSummaryLabel } from "../place-summary.js";
import {
  normaliseMeridianLimit,
  normaliseMountSafety,
  plannerAdvancedConstraintsActive,
  plannerFilterThresholdRange,
  zenithLimitAltitude,
} from "../constraints.js";
import {
  availabilityWindow,
  framingFitKey,
  hipsPreviewUrl,
  nightMinutes,
  plannedPlanItem,
  primaryVisibilityWindow,
  recommendationCatalogueOptions,
  recommendationCataloguesFor,
  recommendationFilteredCards,
  recommendationPlanFilterCounts,
  recommendationSourceCards,
  recommendationTypeFor,
  recommendationTypeOptions,
  recommendationVisibleCards,
  scheduleItemNightSpanReason,
  scheduleItemUsableWindowReason,
  scheduleItemWindReason,
  targetAddDisabledReason,
  targetCardSummary,
  targetCardVisibleFacts,
  targetPlanActionState,
  withHorizonMask,
} from "../recommendations.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import { filterAdviceForNight, targetFilterCompatibility } from "../filters.js";
import { taxonomyLabel } from "astro-core/catalog-taxonomy.js";
import { targetCatalogueLabel } from "astro-core/target-catalogues.js";
import {
  selectionModeOfEquipmentMode,
  targetInSelectionPool,
} from "astro-core/target-selection.js";
import { TargetVisual } from "./TargetVisual.js";
import {
  EyepieceViewContext,
  eyepieceViewCaption,
  useEyepieceSetting,
} from "./EyepieceViewImage.js";
import { eyepieceViewFor, eyepieceViewSetting } from "../eyepiece-view.js";
import { targetLookupKey } from "portal/target-library.js";
import {
  facetedCounterLabel,
  hasActiveFacetFilter,
} from "portal/target-catalogue-counters.js";
import { targetImageVariant } from "portal/target-image-variants.js";
import { reportClientLog } from "portal/client-log.js";
import { floatingPopoverPosition } from "portal/floating-popover.js";
import {
  MapTargetActionIcon,
  MapTargetPreview,
  MapTargetSummary,
  PlannerNightSkyMap,
  PrintableNightSkyMap,
} from "./PlannerNightSkyMap.js";
import {
  hourlyAstronomyForecast,
  summarizeAstronomyForecast,
  weatherCodeForDate,
} from "portal/astronomy-forecast.js";
import { requestAstronomyWeather } from "portal/astronomy-weather.js";
import {
  requestPlannerSkyDirection,
  requestPlannerSkyQuality,
} from "portal/planner/sky-quality.js";
import { normalizeSkyEntered } from "portal/sky-brightness-source.js";
import {
  placeSkyBrightness,
  placeSkyLoading,
  placeVisualSky,
  previewSkyProps,
  scoreSkyOfChoice,
} from "../sky-brightness.js";
import {
  openingNightDate,
  placeForecastAvailability,
  planTargetCount,
  tonightDate,
  tonightOverview,
  newPlanPlace,
  tonightSubject,
} from "../tonight-overview.js";
import {
  catalogueCoordinateLine,
  catalogueCountLine,
  catalogueFactsCard,
} from "../target-facts-model.js";
import { loadTonightDocument, readStorage } from "../tonight-document.js";
import { tonightVerdictStatus, tonightWords } from "../tonight-words.js";
import {
  PlaceSkyMeasuresContext,
  SkyQualityCards,
  usePlaceSkyMeasures,
} from "./SkyBrightnessParts.js";
import {
  horizonLightLayerState,
  horizonLightLegendGradient,
} from "../horizon-light-layer.js";
import {
  HorizonLayersPanel,
  HorizonLightLayerImage,
  horizonLightDescription,
} from "./HorizonLightLayer.js";
import {
  HorizonLayersChip,
  MapControlsRow,
  MapMenuChip,
  MapSettingsButton,
} from "./MapControlChips.js";
import {
  horizonRotateStartsInCentre,
  horizonRotationForDrag,
} from "../horizon-rotate-gesture.js";
import {
  planArchiveDocument,
  planCalendarIcs,
  planShareText,
  weatherReminderIcs,
} from "portal/planner/export.js";
import {
  asiairCopyLines,
  framingAsiairCsv,
  framingNinaCsv,
  planAsiairCsv,
  planExportFilename,
  planNinaCsv,
  planNinaTargetSet,
  safeFilename,
} from "../export.js";
import {
  acquisitionExportWords,
  acquisitionTextByItem,
  exportAcquisitionByItem,
  exportAcquisitionContext,
  planMoonIllumination,
} from "../acquisition-export.js";
import {
  framingDraftName,
  framingNameSuggestions,
  savedFramingTarget,
} from "../framings.js";
import {
  horizonCircularCardinalPoint,
  horizonCircularPoint,
  horizonTargetState,
} from "../horizon-projection.js";
import {
  estimatedLabelWidth,
  layOutMapLabels,
  mapLabelPriority,
  positionLabelFontSize,
  positionLabelTargetIds,
  positionLabelWidth,
} from "../map-labels.js";
import {
  createMapTapCycle,
  horizonTargetCandidatesAtPoint,
  horizonTargetTapTolerancePx,
} from "../map-tap-cycle.js";
import { printablePlanSheet } from "../printable.js";
import {
  addOwnedFilter,
  ownedFiltersAsEquipment,
  plannerOwnedFilters,
  readOwnedFilters,
  removeOwnedFilter,
  renameOwnedFilter,
  writeOwnedFilters,
} from "../owned-filters.js";
import { WindToleranceDialog, WindToleranceRow } from "./WindTolerance.js";
import { OwnedFilters } from "./OwnedFilters.js";
import { EquipmentManageLink } from "./EquipmentManageLink.js";
import {
  ConfigurationNotice,
  DefaultConfigurationLine,
} from "./DefaultConfigurationLine.js";
import { DefineEquipmentLink, EquipmentPicker } from "./EquipmentPicker.js";
import { useEquipmentReturn } from "./useEquipmentReturn.js";
import { defineEquipmentHref } from "../equipment-picker.js";
import { equipmentSelectionWithReturn } from "../equipment-return.js";
import {
  forgetFramingEditorDraft,
  framingEditorStateFromDraft,
  rememberFramingEditorDraft,
  takeFramingEditorDraft,
} from "../framing-editor-draft.js";
import {
  bundledDefaultEquipmentProfiles,
  equipmentHiddenAndEmpty,
  mySpaceEquipmentPath,
} from "../equipment-groups.js";
import {
  equipmentStageName,
  integratedCameraLine,
  integratedCameraNote,
  integratedMountName,
  effectiveFocalLengthText,
  equipmentProfileIsEstimated,
  telescopeOpticsLine,
} from "../telescope-picker.js";
import { FilterAdvice } from "./FilterAdvice.js";
import { FiltersField } from "./FiltersField.js";
import {
  offeredFilterGroups,
  ownFiltersOnlyNote,
  planFilterOwners,
  planOfferedFilters,
} from "../offered-filters.js";
import { filterDisplayName } from "../telescope-order.js";
import {
  newPlanAcquisitionDefaults,
  planWithAcquisitionDefaults,
  planWithItemLine,
  readAcquisitionDefaultsPreference,
  writeAcquisitionDefaultsPreference,
} from "../acquisition-edit.js";
import {
  acquisitionBasisOf,
  acquisitionBlockLine,
  acquisitionExampleItem,
  acquisitionItemView,
  chosenDefaults,
  chosenLineOf,
  skySqmOf,
} from "../acquisition-reading.js";
import {
  planDialogModel,
  targetDialogModel,
} from "../acquisition-dialog-model.js";
import { AcquisitionDefaultsBlock } from "./AcquisitionDefaultsBlock.js";
import { AcquisitionDialog } from "./AcquisitionDialog.js";
import {
  AcquisitionCardLine,
  AcquisitionEditorLine,
} from "./AcquisitionParts.js";
import { acquisitionBlockLineMinWidth } from "../acquisition-words.js";
import {
  applyDarknessToPlans,
  darknessChoices,
  darknessEffects,
  darknessLabelKey,
  newPlanDarkness,
  planDarkness,
  readDarknessPreference,
  writeDarknessPreference,
} from "../darkness-setting.js";
import {
  applyWindToleranceToPlans,
  equipmentWithWindTolerance,
  normalizeWindTolerance,
  planWindTolerance,
  readWindTolerancePreferences,
  windAssessment,
  equipmentHasMount,
  windToleranceKey,
  writeWindTolerancePreferences,
} from "../wind.js";
import { SuggestFiltersDialog } from "./SuggestFiltersDialog.js";
import {
  nightPeriods,
  normalizeSuggestFilters,
  suggestionFilteredCount,
  suggestionPeriodSpans,
  suggestionTargetMatches,
} from "../suggest-filters.js";
import {
  readSuggestFilters,
  subscribeSuggestFilters,
  suggestFilterBadges,
  writeSuggestFilters,
} from "../suggest-filters-web.js";
import { withMaskHidden } from "../tonight-suggestions.js";
import {
  clock as placeClock,
  fill as fillTemplate,
  windSectionLabels,
} from "../wind-section.js";
import { planFriseScale } from "../plan-frise.js";
import { sharePlanText } from "../plan-share.js";
import { planFriseInput, planFriseOf } from "../plan-frise-input.js";
import {
  executionByPlanIdOf,
  planExecutionOf,
  planIsExecuting,
} from "../plan-execution.js";
import {
  PlanExecutionCard,
  PlanExecutionTag,
  PlanExecutionWhere,
} from "./PlanExecutionCard.js";
import {
  PlanFrise,
  PlanTargetViewButtons,
  usePlanTargetView,
} from "./PlanFrise.js";
import { PlanDetailsRows, planDetailsThumbnails } from "./PlanDetailsRows.js";
import {
  loadPlanTargetPictures,
  plansTargetIds,
} from "../plan-target-pictures.js";
import { planDisplayTags } from "../plan-readiness.js";
import { PlanSheetDialog } from "./PlanSheetDialog.js";
import {
  planNightIsAhead,
  planTimeLeft,
  planTimeLeftText,
} from "../plan-time-left.js";
import { planDaysAgo } from "../plan-sheet-words.js";
import {
  activePlanCardReviewReasons,
  applyActivePlanSnapshot,
  bundledPlannerFilters,
  cameraProfiles,
  defaultEquipmentProfiles,
  eyepieceProfiles,
  equipmentProfilesFromInventory,
  fieldOfView,
  normalizedEquipmentSelection,
  ownerStartEquipment,
  opticalModifiers,
  forecastMoonOfNight,
  planNight,
  planNightGeometry,
  planNightSpanSky,
  planNightWindow,
  planLibraryStatus,
  planLibraryStatusKey,
  planLibraryStatuses,
  planStatus,
  planWithStatus,
  planWithValidArchivedFrom,
  planningTargets,
  plannerPlanStatuses,
  plansForNight,
  plannerTabPlans,
  recordPlanHistory,
  resolveEquipment,
  restorePlanHistoryState,
  restoredActivePlanId,
  savedPlanConstraints,
  stepPlanHistory,
  suggestedIntegration,
  targetMatchesEquipmentGuide,
  stellariumTargetUrl,
  telescopeProfiles,
  instrumentProfiles,
  validTimeZone,
  withCommonBinoculars,
  withSmartTelescopeFilters,
} from "../planner.js";
import { equipmentCapabilityLine } from "../equipment-capability.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";
import {
  browserFavoriteIds,
  browserFavoritesPayload,
  carryBrowserFavorites,
  readBrowserFavorites,
  withBrowserFavorite,
  writeBrowserFavorites,
} from "../browser-favorites.js";
import {
  createsPendingPlan,
  framingNeedsMosaic,
  heldCopy,
  planCreationGate,
  plannerGates,
} from "../capability-gates.js";
import { PlacePickerSheet } from "./PlacePickerSheet.js";
import { PlacesView } from "./PlacesView.js";
import { PlaceIdealDialog } from "./PlaceIdealDialog.js";
import { readDefaultPlaceId } from "../places-preferences.js";
import { planCopyOfPlace } from "../places-client.js";
import { clearSpacePlacesCache } from "../space-places.js";
import { localPlaceUsage, useSpacePlaces } from "./useSpacePlaces.js";
import { createPlacesClient } from "../places-client.js";
import {
  alreadyMinePlace,
  defaultPlaceOf,
  duplicatesOfPlace,
  ownPlaceKinds,
  personalPlaceFromSuggestion,
  placeKindOf,
} from "../places-rules.js";
import { FrameSettingsSheet } from "./FrameSettingsSheet.js";
import {
  LockedChip,
  OffersSession,
  PurchaseBoxDialog,
  lockedOffersHref,
} from "../offers-slot.js";
import {
  isLinkRefusal,
  keptProjectLinks,
  revertRefusedLinks,
} from "../plan-link-refusal.js";
import { SuggestNightDialog } from "./SuggestNightDialog.js";
import { suggestionDefaults } from "../suggest-dialog-model.js";
import { suggestMessage } from "../suggest-messages.js";
import { suggestionSpanAt } from "../suggest-span.js";
import { loadSuggestionHistory } from "../suggest-history-client.js";
import { suggestionNoteNow } from "../suggestion-note.js";
import { suggestNight } from "../suggest-night.js";
import {
  observationComfortFamily,
  observationComfortRange,
  readObservationComfort,
  writeObservationComfort,
} from "../observation-comfort.js";
import { visualCardAdviceText } from "../visual-filter-advice.js";
import { visualInventoryOf } from "../visual-pairs.js";
import { autoFillAppliedNotice } from "../auto-fill-copy.js";
import { magnificationAdviceLine } from "../magnification-advice-copy.js";
import {
  favoriteNoticeDurationMs,
  favoriteNoticeKey,
} from "../favorite-notice.js";
import {
  TargetScoreChip,
  TargetFactsIcon,
  TargetScoreExplained,
} from "./TargetScoreExplained.js";
import { ObservationModeIcon } from "./ObservationModeIcon.js";
import {
  HorizonPathCard,
  HorizonPathLegend,
  HorizonPathMarkers,
  HorizonPathStrokes,
  HorizonPathTargetChips,
  HorizonPositionLabels,
  horizonPathCardLabel,
} from "./HorizonPathLayer.js";
import { targetNightPath } from "../target-path.js";
import { targetTonightScore } from "../target-score.js";
import {
  horizonPathLayer,
  horizonPathSummary,
  horizonPathTargetId,
  zoneOffsetMinutes,
} from "../horizon-path-mode.js";
import { getPlannerExtensions } from "portal/planner/extensions.js";
import { placesLightMapAccess } from "../places-light-map-access.js";
import {
  isHostedService,
  plannerAccessCopy,
  plannerSignInHref,
} from "../access-copy.js";
import {
  browserDocumentAfterEdit,
  clearSpaceReplica,
  isBrowserPlan,
  mergeBrowserPlans,
  mostRecentFirst,
  readSpaceReplica,
  sameSpace,
  spacePlansOf,
  splitPlannerDocument,
  writeSpaceReplica,
} from "../browser-plans.js";
import { browserPlansCopy } from "../browser-plans-copy.js";
import { carryBrowserPlans } from "../browser-plans-sync.js";
import {
  rebaseOnRevisions,
  revisionsOf,
  servedFormOfUntouchedPlans,
  servedPlanEntries,
  spaceContentKey,
} from "../plan-revisions.js";
import { describeSyncFailure } from "../sync-status.js";
import {
  loadPlanSessions,
  planSessionHref,
  planToDebrief,
} from "../plan-sessions.js";
import {
  counted as journalCounted,
  durationOf as journalDurationOf,
  fill as journalFill,
  groupSpanText,
  multiNightPlanHref,
} from "portal/components/sessions/journal-list-view.js";
import {
  PLAN_MAIN_FILTERS,
  planMainFilterOf,
  noPlanFilters,
  planActionsOf,
  planDebriefWordKey,
  planFiltersCount,
  planFiltersFromAddress,
  planFiltersToAddress,
  planFiltersWithStatuses,
  planPassesFilters,
  planStatusSelection,
  planStatusTags,
  planStatusesTicked,
} from "../plan-library-filters.js";
import { PlanFiltersDialog, planFilterWord } from "./PlanFiltersDialog.js";
import { ActionMenu } from "portal/components/menu/ActionMenu.js";
import {
  FilterBadges,
  FiltersButton,
} from "portal/components/filters/FilterControls.js";
import { StatusTag } from "portal/components/status/StatusTag.js";
import { revealSelection } from "portal/components/calendar/reveal-selection.js";
import { requestJson } from "portal/components/sessions/portal-fetch.js";
import { SyncStatusDialog } from "./SyncStatusDialog.js";
import { PastNightDebriefDialog } from "./PastNightDebriefDialog.js";
import {
  pastNightCandidates,
  pastNightDebriefHref,
  pastNightKey,
  pastNightPlansDue,
  planDatesOf,
  serverPlanIdFor,
} from "../past-night-debrief.js";
import {
  multiNightAccess,
  multiNightWindowReads,
  multiNightBadgeFor,
  multiNightCoreCopy,
  planBandText,
  planItemTargetName,
  planKindChoiceOutcome,
  shownPlanKindFor,
} from "../multi-night-access.js";
import { planLibraryEntries } from "../plan-groups.js";
import { createScheduleBlockMeasure } from "../schedule-block-measure.js";
import {
  MultiNightReadOnlyView,
  useReadOnlyMultiNightPlans,
} from "./MultiNightReadOnly.js";
import {
  HeldFollowAction,
  NewPlanChoiceDialog,
  PlanActionsMenu,
  PlanKindSwitch,
} from "./MultiNightEntries.js";

// The plans made in this browser without a space. A signed-in person's space
// keeps its own copy under `spaceReplicaStorageKey` (`browser-plans.js`): the
// two are never mixed. What a shell registered at one of the planner's points
// (`portal/planner/extensions.js`), or `null`: the open core registers nothing,
// and the planner is complete without them. A shell can add mosaics
// (`planner.framing.surface`, `planner.map.*`, `planner.export.asiair`) and the
// words and the way to offers (`planner.offers`).
function plannerExtension(point) {
  return getPlannerExtensions(point)[0] || null;
}

// What a framing made with the surface the person set stores beside its
// frame (`planner.framing.surface`); nothing without one: the framing of a
// single field, everyone's.
function surfaceDraftFields(surfaceModel, surface, field) {
  return surfaceModel && surface
    ? surfaceModel.draftFields(surface, field)
    : { mosaic: undefined, mosaicField: undefined };
}

// The words of what a capability holds back, and the way to the offers when
// a shell registered them at `planner.offers`; the core's own neutral words
// otherwise, with no way to buy anything.
function refusalCopy(locale) {
  return (
    plannerExtension("planner.offers")?.gateCopy(locale) || heldCopy(locale)
  );
}

const storageKey = "astro-portal:planner:v1";
const targetCataloguePageSize = 48;
const emptyProfiles = [];

// The tab's session storage, or `null` where it is refused.
const tabSessionStorage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

function emptyTargetCatalogueResult() {
  return {
    total: 0,
    offset: 0,
    limit: targetCataloguePageSize,
    targets: [],
    attribution: null,
    imageAttribution: null,
    curatedPhotoImageAttribution: null,
    visualImageAttribution: null,
    visualPreviewImageAttribution: null,
    catalogueOptions: [],
    typeOptions: [],
    counts: { total: 0, best: 0, extended: 0 },
    countsUnfiltered: null,
  };
}
const horizonCurrentMaskStorageKey =
  "astro-portal:planner:horizon-current-mask:v1";
const horizonControlsStorageKey = "astro-portal:planner:horizon-controls:v1";

function savedHorizonControls() {
  const fallback = {
    projection: "circular",
    rotation: 0,
    showLabels: false,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(localStorage.getItem(horizonControlsStorageKey));
    if (!value || typeof value !== "object") return fallback;
    return {
      projection: value.projection === "linear" ? "linear" : "circular",
      rotation:
        Math.round(clamp(Number(value.rotation) || 0, -180, 180) / 5) * 5,
      showLabels: Boolean(value.showLabels),
    };
  } catch {
    return fallback;
  }
}

// The night being lived at the place (`tonightDate`: the previous evening's
// until that night's dawn, then today's). A place not chosen yet has no
// coordinates: its zone is the browser's, so this is the browser's civil date.
function placeToday(place) {
  return tonightDate({ place });
}

function catalogueSelectionDefault(instanceSettings = null) {
  const selection = instanceSettings?.planner?.defaultCatalogueSelection;
  return ["all", "best", "extended"].includes(selection) ? selection : "best";
}

function favoriteTargetIdsFromPayload(payload) {
  return new Set(
    [
      ...(payload?.photoTargetIds || []),
      ...(payload?.visualTargetIds || []),
    ].map(String),
  );
}

// The one write of a favorite the service takes from a signed-in person
// (`PUT /api/target-favorites`, idempotent): a tick on the catalogue, and the
// carry of what this browser kept before the sign-in (`browser-favorites.js`).
function putTargetFavorite(body) {
  return fetch("/api/target-favorites", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-astro-csrf": csrfCookieValue() || "",
      ...clientInstanceHeaders(),
    },
    body: JSON.stringify(body),
  });
}

// Where "Mes préférées" live: the browser for a person with no space
// here, the space for a signed-in one. Nothing while the sign-in is still
// being read.
const favoritesInBrowserFor = (auth) =>
  Boolean(auth?.checked && !auth.authenticated);

function defaultState(instanceSettings = null) {
  return {
    date: placeToday({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    }),
    location: {
      name: "",
      latitude: "",
      longitude: "",
      elevation: "0",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
    equipment: {
      mode: "imaging",
      // A new plan starts with nothing chosen (`null`, « Choisir… »), never
      // on a common profile chosen in silence; an owner's inventory fills it
      // once known (`newPlanEquipment`).
      telescopeId: null,
      mountId: "none",
      cameraId: null,
      eyepieceId: null,
      eyepieceFocalLengthMm: "",
      modifierId: "none",
      restrictToEquipment: false,
      filterIds: [],
    },
    minAltitude: 30,
    catalogueSelection: catalogueSelectionDefault(instanceSettings),
    moonSeparationMinimum: 25,
    moonSeparationMinimumByFilter: {},
    mountSafety: normaliseMountSafety(),
    knownLocations: [],
    horizonProfiles: [],
    activeHorizonProfileId: null,
    currentHorizonMask: defaultHorizonMask(),
    plans: [],
    activePlanId: null,
  };
}

function savedLocation(location) {
  const coordinates = locationCoordinates(location);
  if (!coordinates) return null;
  const horizonMask = normaliseHorizonMask(location?.horizonMask);
  const knownPlace = normalizeKnownPlaceLink(location?.knownPlace);
  const skyEntered = normalizeSkyEntered(location?.skyEntered);
  return {
    ...(location.id ? { id: location.id, version: location.version || 1 } : {}),
    ...(location.locality ? { locality: location.locality } : {}),
    ...(location.horizonStatus
      ? { horizonStatus: location.horizonStatus }
      : {}),
    name: String(location?.name || "").trim(),
    latitude: coordinates.latitude.toFixed(5),
    longitude: coordinates.longitude.toFixed(5),
    // Unknown stays empty: it is not "0" (a real zero is the string "0").
    elevation: String(location?.elevation ?? ""),
    timeZone: validTimeZone(location?.timeZone || "UTC"),
    ...(horizonMask.enabled ||
    horizonMask.points.some((point) => point.altitude)
      ? { horizonMask }
      : {}),
    // The link to a known place, never its details.
    ...(knownPlace ? { knownPlace } : {}),
    // The sky background the observer typed.
    ...(skyEntered ? { skyEntered } : {}),
  };
}

// A place of mine keeps, beyond what a plan's copy keeps, its type and its note:
// a visitor's places live in this
// document, and `savedLocation` alone would drop both.
function rememberedPlace(location) {
  const saved = savedLocation(location);
  if (!saved) return null;
  const note = String(location?.note ?? "").trim();
  return {
    ...saved,
    ...(ownPlaceKinds.includes(location?.kind) ? { kind: location.kind } : {}),
    ...(note ? { note: note.slice(0, 500) } : {}),
  };
}

function rememberedLocations(locations) {
  const seen = new Set();
  return locations
    .map(rememberedPlace)
    .filter(Boolean)
    .filter((location) => {
      const key =
        location.id ||
        `${location.name.toLowerCase()}:${location.latitude}:${location.longitude}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function addRememberedLocation(locations, location) {
  const next = rememberedPlace(location);
  return next
    ? rememberedLocations([next, ...locations])
    : rememberedLocations(locations);
}

function savedHorizonProfile(profile, index = 0) {
  const location = savedLocation(profile?.location);
  const name = String(profile?.name || location?.name || "").trim();
  if (!name) return null;
  const mask = normaliseHorizonMask(profile?.mask || profile?.horizonMask);
  return {
    id: String(profile?.id || `horizon-profile-${index + 1}`),
    name,
    mask: { ...mask, enabled: true },
    location,
  };
}

function rememberedHorizonProfiles(profiles) {
  const seen = new Set();
  return profiles
    .map(savedHorizonProfile)
    .filter(Boolean)
    .filter((profile) => {
      if (seen.has(profile.id)) return false;
      seen.add(profile.id);
      return true;
    });
}

function validSavedState(value, fallback = defaultState()) {
  if (!value || typeof value !== "object") return null;
  // A device that never calls PUT /api/plans can hand back a plan whose night
  // was never written to `nights`. Repair that at read time — reconstructing
  // the missing night from the plan's own date and location — before the strict
  // validator gets a chance to reject the whole document over it.
  if (value.schemaVersion) value = repairPlannerDocument(value);
  if (value.schemaVersion) validatePlannerDocument(value);
  // The import of an export writes a document with no date: the
  // planner opens on the day its defaults give, never on `null`.
  const date = savedPlannerDate(value.date, fallback.date);
  const legacyItems = Array.isArray(value.items) ? value.items : [];
  const plans = Array.isArray(value.plans)
    ? value.plans
    : legacyItems.length
      ? [
          {
            id: "legacy-plan",
            date,
            name: "",
            items: legacyItems,
          },
        ]
      : [];
  const readPlans = plans.map((plan, index) => ({
    ...plan,
    id: String(plan.id || `plan-${index + 1}`),
    date: typeof plan.date === "string" ? plan.date : date,
    name: typeof plan.name === "string" ? plan.name : "",
    items: Array.isArray(plan.items) ? plan.items : [],
    location: savedLocation(plan.location),
    equipment: plan.equipment
      ? cloneEquipment({ ...fallback.equipment, ...plan.equipment })
      : null,
    ...savedPlanConstraints(plan),
    mountSafety: plan.mountSafety
      ? normaliseMountSafety(plan.mountSafety)
      : null,
    status: planStatus(plan),
    archivedAt:
      planStatus(plan) === "archived" && typeof plan.archivedAt === "string"
        ? plan.archivedAt
        : null,
  }));
  // An `archivedFrom` belongs to an archived plan alone.
  const normalizedPlans = readPlans.map(planWithValidArchivedFrom);
  const knownLocations = rememberedLocations([
    ...(Array.isArray(value.knownLocations) ? value.knownLocations : []),
    ...(value.schemaVersion === 2
      ? []
      : [...normalizedPlans.map((plan) => plan.location), value.location]),
  ]);
  const legacyProfiles = knownLocations
    .filter((location) => {
      const mask = normaliseHorizonMask(location.horizonMask);
      return mask.enabled || mask.points.some((point) => point.altitude > 0);
    })
    .map((location) => ({
      id: `legacy-${location.latitude}-${location.longitude}`,
      name: location.name || "Lieu d’observation",
      mask: location.horizonMask,
      location,
    }));
  const horizonProfiles = rememberedHorizonProfiles([
    ...(Array.isArray(value.horizonProfiles) ? value.horizonProfiles : []),
    ...legacyProfiles,
  ]);
  const activeHorizonProfileId = horizonProfiles.some(
    (profile) => profile.id === value.activeHorizonProfileId,
  )
    ? value.activeHorizonProfileId
    : horizonProfiles.find((profile) => {
        const profileLocation = locationCoordinates(profile.location);
        const currentLocation = locationCoordinates(value.location);
        return (
          profileLocation &&
          currentLocation &&
          profileLocation.latitude === currentLocation.latitude &&
          profileLocation.longitude === currentLocation.longitude
        );
      })?.id || null;
  const normalized = {
    ...fallback,
    ...value,
    date,
    schemaVersion: value.schemaVersion || 1,
    location: { ...fallback.location, ...(value.location || {}) },
    equipment: normalizedEquipmentSelection(
      value.equipment,
      fallback.equipment,
    ),
    moonSeparationMinimum: clamp(
      Number(value.moonSeparationMinimum) || fallback.moonSeparationMinimum,
      10,
      60,
    ),
    catalogueSelection: ["all", "best", "extended", "favorites"].includes(
      value.catalogueSelection,
    )
      ? value.catalogueSelection
      : fallback.catalogueSelection,
    moonSeparationMinimumByFilter:
      value.moonSeparationMinimumByFilter &&
      typeof value.moonSeparationMinimumByFilter === "object"
        ? Object.fromEntries(
            Object.entries(value.moonSeparationMinimumByFilter)
              .map(([key, threshold]) => [
                key,
                clamp(Number(threshold), 10, 60),
              ])
              .filter(([, threshold]) => Number.isFinite(threshold)),
          )
        : {},
    mountSafety: normaliseMountSafety(value.mountSafety),
    plans: normalizedPlans,
    knownLocations,
    horizonProfiles,
    activeHorizonProfileId,
    currentHorizonMask: normaliseHorizonMask(value.currentHorizonMask),
    activePlanId: restoredActivePlanId({
      plans: normalizedPlans,
      activePlanId: value.activePlanId,
      date,
    }),
  };
  return migratePlannerState(normalized, fallback);
}

function time(value, locale, timeZone) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: validTimeZone(timeZone),
  }).format(new Date(value));
}

function minutesInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: validTimeZone(timeZone),
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(
    parts
      .filter(({ type }) => type === "hour" || type === "minute")
      .map(({ type, value: partValue }) => [type, Number(partValue)]),
  );
  return (fields.hour || 0) * 60 + (fields.minute || 0);
}

function closestCurrentTimeIndex(series, timeZone) {
  if (!series?.length) return 0;
  const nowMinutes = minutesInTimeZone(new Date(), timeZone);
  return series.reduce(
    (closest, point, index) => {
      const distance = Math.abs(
        minutesInTimeZone(point.time, timeZone) - nowMinutes,
      );
      return distance < closest.distance ? { distance, index } : closest;
    },
    { distance: Number.POSITIVE_INFINITY, index: 0 },
  ).index;
}

function decimal(value, locale, digits = 1) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
  }).format(value);
}

function fieldLabel(field, locale) {
  if (!field) return "—";
  if (field.shape === "circle")
    return `Ø ${decimal(field.diameter || field.width, locale, 2)}°`;
  return `${decimal(field.width, locale, 2)}° × ${decimal(field.height, locale, 2)}°`;
}

function rangeLabel(card, locale, timeZone) {
  return `${time(card.usableStart, locale, timeZone)}–${time(card.usableEnd, locale, timeZone)}`;
}

function monthLabel(month, year, locale) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, 1)));
}

function weekdayLabels(locale) {
  return Array.from({ length: 7 }, (_, offset) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2024, 0, 1 + offset))),
  );
}

const dateAfterDays = plannerDateAfterDays;

function PlannerDatePicker({
  latitude,
  locale,
  place,
  pastAllowed = false,
  retry = 0,
  onChange,
  onRetry,
  value,
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const calendarRef = useRef(null);
  const [calendarStyle, setCalendarStyle] = useState(null);
  // The calendar of "Conditions à {lieu}" in one-date
  // mode — the window of the chosen date, the band, the two past days seen
  // and not chosen, the back-to-today icon in a reserved slot.
  const [offset, setOffset] = useState(null);
  const { calendar, today } = useConditionsCalendar({
    place,
    offset: offset ?? 0,
    pastAllowed,
    retry,
  });
  useEffect(() => {
    if (open) setOffset(value ? conditionsOffsetFor(value, today) : 0);
  }, [open, today, value]);
  const choose = (date) => {
    onChange(date);
    setOpen(false);
  };
  useLayoutEffect(() => {
    if (!open) {
      setCalendarStyle(null);
      return undefined;
    }
    let frame = null;
    const reposition = () => {
      frame = window.requestAnimationFrame(() => {
        const anchor = triggerRef.current?.getBoundingClientRect();
        const calendar = calendarRef.current;
        if (!anchor || !calendar) return;
        const naturalHeight =
          calendar.scrollHeight + calendar.offsetHeight - calendar.clientHeight;
        const position = floatingPopoverPosition({
          anchor,
          viewport: {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight,
          },
          popover: { width: calendar.offsetWidth, height: naturalHeight },
        });
        setCalendarStyle((current) => {
          const next = {
            left: `${position.left}px`,
            top: `${position.top}px`,
            width: `${position.width}px`,
            maxHeight: `${position.maxHeight}px`,
          };
          return Object.entries(next).every(
            ([key, entry]) => current?.[key] === entry,
          )
            ? current
            : next;
        });
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    const observer = new ResizeObserver(reposition);
    if (triggerRef.current) observer.observe(triggerRef.current);
    if (calendarRef.current) observer.observe(calendarRef.current);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
      observer.disconnect();
    };
  }, [open]);

  return (
    <div className="planner-date-picker">
      <span>{message(locale, "plannerDate")}</span>
      <button
        ref={triggerRef}
        className="btn-tertiary"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <strong>{dateLabel(value, locale)}</strong>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && calendar && (
        <section
          className="planner-calendar-picker"
          ref={calendarRef}
          role="dialog"
          aria-label={message(locale, "plannerCalendarOpen")}
          style={calendarStyle || undefined}
        >
          <ConditionsCalendar
            calendar={calendar}
            locale={locale}
            mode="single"
            latitude={latitude}
            selected={value}
            onDate={choose}
            onShift={(delta) => setOffset((current) => (current ?? 0) + delta)}
            onToday={() => setOffset(0)}
            onRetry={onRetry}
            showTodayIcon={(offset ?? 0) !== 0}
          />
          <p className="planner-calendar-picker-help">
            {calendar.stale && calendar.bandVisible
              ? flow(locale, "weatherCached")
              : calendar.state === "idle"
                ? message(locale, "plannerCalendarNoOutlook")
                : message(locale, "plannerCalendarOutlook")}
          </p>
        </section>
      )}
    </div>
  );
}

function cloneEquipment(equipment) {
  return {
    ...equipment,
    filterIds: [...(equipment?.filterIds || [])],
  };
}

function planSnapshot(state) {
  return {
    nightId: state.activeNightId,
    catalogueSelection: state.catalogueSelection,
    location: savedLocation(state.location),
    equipment: cloneEquipment(state.equipment),
    minAltitude: Number(state.minAltitude),
    moonSeparationMinimum: Number(state.moonSeparationMinimum),
    moonSeparationMinimumByFilter: {
      ...(state.moonSeparationMinimumByFilter || {}),
    },
    mountSafety: normaliseMountSafety(state.mountSafety),
  };
}

function downloadText(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function plannerTargetTitle(target) {
  return (
    target?.title ||
    target?.designation ||
    target?.objects?.[0] ||
    target?.catalogue ||
    ""
  );
}

function plannerTimelineLabel(target) {
  const title = plannerTargetTitle(target);
  // A saved framing is named by the photographer. Its matched catalogue object
  // remains useful metadata, but it must not replace that explicit name in the
  // timeline (or a custom framing becomes indistinguishable from the catalogue
  // target it contains).
  if (target?.plannerSource === "framing" || target?.framing) return title;
  return target?.objects?.[0] || target?.catalogue || title;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function minuteAtPointer(event, total) {
  const bounds = event.currentTarget.parentElement.getBoundingClientRect();
  const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  return Math.round(ratio * total);
}

// Two handles that sit close together (a short interval, or one pinned
// to the edge of the night) have overlapping touch areas, and the later one in
// the DOM used to take every touch. Whichever handle is under the pointer, the
// drag belongs to the one whose minute is nearest the finger; on a tie, to the
// one that was touched.
function nearestHandle(event, total, window, touched) {
  const bounds = event.currentTarget.parentElement.getBoundingClientRect();
  const minute =
    clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * total;
  const toStart = Math.abs(minute - window.start);
  const toEnd = Math.abs(minute - window.end);
  if (toStart === toEnd) return touched;
  return toStart < toEnd ? "start" : "end";
}

function coordinate(value, minimum, maximum) {
  // Number("") is 0. Empty form fields must never silently become the
  // Gulf-of-Guinea location used by the weather provider.
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (minimum !== undefined && number < minimum) return null;
  if (maximum !== undefined && number > maximum) return null;
  return number;
}

function locationCoordinates(location) {
  const latitude = coordinate(location?.latitude, -90, 90);
  const longitude = coordinate(location?.longitude, -180, 180);
  // There is no observatory at this null-island point in the saved portal
  // data. It is the legacy representation of two empty coordinate fields.
  if (
    latitude === null ||
    longitude === null ||
    (latitude === 0 && longitude === 0)
  )
    return null;
  return { latitude, longitude };
}

// The schedule stage's location-review banner explains which of
// `LocationReviewReason`'s values actually caused it, Named
// `plannerReviewCause*` rather than reusing this file's existing `review_*`
// flow-message keys, which already name a *card's* own review reasons
// ("equipment compatibility", "minimum altitude", …) -- a distinct vocabulary
// from the plan-level cause a location, date or equipment change left behind.
function locationReviewCauseKey(reason) {
  const cause =
    reason === "date" || reason === "equipment" ? reason : "location";
  return `plannerReviewCause${cause[0].toUpperCase()}${cause.slice(1)}`;
}

function framingMessage(card, locale) {
  return message(locale, framingFitKey(card));
}

function framingEquipmentSummary(target, locale) {
  const setup = target?.framing?.equipment;
  if (!setup || (setup.mode !== "imaging" && setup.mode !== "visual"))
    return null;
  const telescope = setup.telescope || {};
  const telescopeDetails = [
    telescope.name,
    Number.isFinite(Number(telescope.apertureMm))
      ? `${decimal(telescope.apertureMm, locale, 0)} mm`
      : null,
    Number.isFinite(Number(setup.effectiveFocalLengthMm))
      ? `${decimal(setup.effectiveFocalLengthMm, locale, 0)} mm`
      : null,
  ].filter(Boolean);
  const accessory =
    setup.mode === "visual" ? setup.eyepiece || {} : setup.camera || {};
  const accessoryDetails = [accessory.name];
  if (
    setup.mode === "visual" &&
    Number.isFinite(Number(accessory.focalLengthMm))
  )
    accessoryDetails.push(`${decimal(accessory.focalLengthMm, locale, 1)} mm`);
  const field = setup.field || target?.framing?.field;
  const fieldDetails = Number.isFinite(Number(field?.width))
    ? setup.mode === "visual"
      ? `${decimal(field.width, locale, 2)}°`
      : Number.isFinite(Number(field?.height))
        ? `${decimal(field.width, locale, 2)} × ${decimal(field.height, locale, 2)}°`
        : `${decimal(field.width, locale, 2)}°`
    : null;
  return {
    mode: message(
      locale,
      setup.mode === "visual" ? "plannerVisual" : "plannerImaging",
    ),
    setup: [
      telescopeDetails.join(" · "),
      accessoryDetails.filter(Boolean).join(" · "),
      fieldDetails,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

// "3 cibles", "1 cible", "Aucune cible": the unit the plan's tab gives its
// count.
function planTabCount(locale, count) {
  if (count === 0) return message(locale, "plannerPlanTabCountNone");
  return message(
    locale,
    count === 1 ? "nightSummaryTargetCountOne" : "nightSummaryTargetCountOther",
  ).replace("{count}", String(count));
}

function TargetPlanAction({
  addDisabledReason,
  canAdd,
  editable = true,
  iconOnly = false,
  locale,
  onAdd,
  onRemove,
  selected,
}) {
  const [hintVisible, setHintVisible] = useState(false);
  const state = targetPlanActionState({
    selected,
    canAdd,
    editable,
    addDisabledReason,
  });
  const explanation = state.explanation
    ? message(locale, state.explanation)
    : null;
  const isExplainedDisabled = Boolean(explanation);
  const isDisabled = state.disabled;
  const isHardDisabled = state.hardDisabled;
  const label = message(
    locale,
    state.action === "remove" ? "plannerRemove" : "plannerAdd",
  );

  const activate = (event) => {
    if (isExplainedDisabled) {
      setHintVisible((visible) => !visible);
      return;
    }
    if (isDisabled || isHardDisabled) return;
    // Both edits move the schedule stage above this card, so both hand the
    // page the element to keep still.
    if (selected) onRemove?.(event.currentTarget);
    else onAdd?.(event.currentTarget);
  };

  if (iconOnly) {
    // On a card the plan action is an icon button -- "+" to add, the
    // destructive tint to remove -- named "Ajouter au plan" / "Retirer du plan"
    //.
    const iconLabel = message(
      locale,
      state.action === "remove" ? "plannerRemoveFromPlan" : "plannerAdd",
    );
    return (
      <span
        className={`planner-target-action-wrap${hintVisible ? " is-hint-visible" : ""}`}
      >
        <button
          className={`planner-target-icon-action ${selected ? "is-remove" : "is-add"}${isExplainedDisabled ? " is-disabled" : ""}`}
          type="button"
          aria-disabled={isExplainedDisabled || undefined}
          aria-label={explanation ? `${iconLabel}. ${explanation}` : iconLabel}
          title={iconLabel}
          disabled={isHardDisabled}
          onBlur={() => setHintVisible(false)}
          onClick={activate}
        >
          <MapTargetActionIcon added={selected} />
        </button>
        {explanation && (
          <span className="planner-target-action-tooltip" role="tooltip">
            {explanation}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={`planner-target-action-wrap${hintVisible ? " is-hint-visible" : ""}`}
    >
      <button
        className={`${selected ? "btn-tertiary is-destructive" : "btn-primary"} planner-target-action${isExplainedDisabled ? " is-disabled" : ""}`}
        type="button"
        aria-disabled={isExplainedDisabled || undefined}
        aria-label={explanation ? `${label}. ${explanation}` : label}
        disabled={isHardDisabled}
        onBlur={() => setHintVisible(false)}
        onClick={activate}
      >
        <span className="planner-target-action-label">{label}</span>
        <MapTargetActionIcon added={selected} />
      </button>
      {explanation && (
        <span className="planner-target-action-tooltip" role="tooltip">
          {explanation}
        </span>
      )}
    </span>
  );
}

// A small, dimmed lock icon next to a framing
// target's name, everywhere it appears in a plan's own target lists (this
// card, "Cibles de la soirée", a plan's own preview) -- the badge and its
// actions stay in the full library/target-detail views.
function FramingLockIcon({ locale }) {
  return (
    <svg
      aria-label={message(locale, "plannerFramingLockedIconLabel")}
      className="planner-framing-lock-icon"
      role="img"
      viewBox="0 0 24 24"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// The "Carte" glyph of the list / map switch (Material `public`): a globe,
// meridians and parallels.
function TargetMapIcon() {
  return (
    <svg
      className="planner-target-map-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.4 4 5.5 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.5-4-9s1.4-6.6 4-9z" />
    </svg>
  );
}

function TargetCard({
  addDisabledReason,
  card,
  locale,
  timeZone,
  field,
  selected,
  canAdd,
  editable = true,
  onAdd,
  onRemove,
  onOpen = null,
  onShowOnMap = null,
  mapSelected = false,
  showAction = true,
  visualMode = false,
  framingFiche = null,
  score = null,
  onShowScore = null,
  planSlot = null,
  // "Prise de vue par cible": the line of the target at the foot of the
  // card, under the facts — its pose, gain and filter, the count of
  // exposures and the chip "suggéré".
  acquisitionLine = null,
}) {
  const target = card.target;
  const stellariumUrl = stellariumTargetUrl(target, field);
  const targetTitle = target.title || target.designation || target.objects?.[0];
  const summary = targetCardSummary(card);
  const integrationAvailable = summary.integrationAvailable;
  // Which facts this card shows, in the order `targetCardVisibleFacts`
  // (`recommendations.js`) is tested against.
  const visibleFacts = targetCardVisibleFacts(summary);
  // The card of the stage 4 list is no longer a click target -- the map has its
  // own icon button, `onShowOnMap`. Only the plan's list under the timeline
  // gives an `onOpen`: a click on its card opens the slot's editing.
  const openOnClick = onOpen
    ? (event) => {
        // The image is a link to Stellarium and the action button changes the
        // plan.  Neither should also open the slot.
        if (event.target.closest("a, button")) return;
        onOpen(target.id);
      }
    : undefined;
  return (
    <article
      className={`planner-target-card${onOpen ? " is-openable" : ""}${mapSelected ? " is-map-selected" : ""}`}
      onClick={openOnClick}
    >
      <AvailabilityGraph card={card} />
      {summary.capturedMarker && (
        <span
          className="planner-captured-marker"
          aria-label={message(locale, "plannerAlreadyCaptured")}
          title={message(locale, "plannerAlreadyCaptured")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4.5h10v15l-5-3.25L7 19.5z" />
          </svg>
        </span>
      )}
      <div className="planner-target-content">
        <TargetVisual
          target={target}
          previewUrl={hipsPreviewUrl(card)}
          stellariumUrl={stellariumUrl}
          label={`${message(locale, "openStellarium")} — ${targetTitle}`}
          visualMode={visualMode}
        />
        <div className="planner-target-copy">
          <div className="planner-target-heading">
            <h3 className="planner-target-title">
              {targetTitle}
              {framingTargetIsLocked(target) && (
                <FramingLockIcon locale={locale} />
              )}
            </h3>
            {score && onShowScore && (
              // The score of the target for the night, opening "Pourquoi
              // cette cible ce soir".
              <TargetScoreChip
                score={score}
                locale={locale}
                onOpen={() => onShowScore(card)}
              />
            )}
            <TargetKnowledgeDetails
              target={target}
              locale={locale}
              visualMode={visualMode}
            />
          </div>
          <p className="planner-target-subtitle">
            {[target.skyTarget?.type, target.skyTarget?.constellation]
              .filter(Boolean)
              .join(" · ")}
            {summary.ownCapture && (
              <span className="planner-target-origin">
                {message(locale, "plannerOwnCapture")}
              </span>
            )}
          </p>
          {planSlot && (
            // A plan's target listed under the timeline says its slot, "Dans ce
            // plan · 19:55 → 21:05 · 1 h 10".
            <p className="planner-target-in-plan">{planSlot}</p>
          )}
          <div className="planner-target-facts">
            {visibleFacts.map((fact) => {
              switch (fact) {
                case "window":
                  return (
                    <span key={fact}>
                      {message(locale, "plannerWindow")}{" "}
                      <strong>{rangeLabel(card, locale, timeZone)}</strong>
                    </span>
                  );
                case "framingCenter":
                  return (
                    <span key={fact}>
                      {message(locale, "plannerUseFramingCenter")}{" "}
                      <strong>
                        {formatRightAscension(
                          summary.savedFramingCoordinate.ra,
                        )}{" "}
                        ·{" "}
                        {formatDeclination(summary.savedFramingCoordinate.dec)}
                      </strong>
                    </span>
                  );
                case "culmination":
                  // The trailing "above minimum" wording
                  // (`plannerAboveMinimum`) is dropped as redundant with the
                  // already-explicit "+X°".
                  return (
                    <span key={fact}>
                      {message(locale, "plannerCulmination")}{" "}
                      <strong>{decimal(card.maxAltitude, locale)}°</strong>
                      {" · "}
                      <strong>+{decimal(card.altitudeMargin, locale)}°</strong>
                    </span>
                  );
                case "visual":
                  return (
                    <span key={fact}>
                      {message(locale, "plannerVisualObservation")}{" "}
                      <strong>
                        {message(
                          locale,
                          `plannerVisual${summary.visualStatus[0].toUpperCase()}${summary.visualStatus.slice(1)}`,
                        )}
                      </strong>
                    </span>
                  );
                case "magnification":
                  return (
                    <span key={fact}>
                      {message(locale, "plannerMagnification")}{" "}
                      <strong>
                        {decimal(summary.magnification, locale, 0)}×
                      </strong>
                    </span>
                  );
                case "exitPupil":
                  return (
                    <span key={fact}>
                      {message(locale, "plannerExitPupil")}{" "}
                      <strong>
                        {decimal(summary.exitPupilMm, locale, 1)} mm
                      </strong>
                    </span>
                  );
                case "direction":
                  return (
                    <span key={fact}>
                      {message(locale, "plannerDirection")}{" "}
                      <strong>{card.direction}</strong>
                    </span>
                  );
                case "horizonNote":
                  return (
                    <span key={fact} className="planner-horizon-note">
                      {summary.horizonNote.initiallyBlocked
                        ? message(locale, "plannerHorizonClearAt")
                        : message(locale, "plannerHorizonPartlyMasked")}{" "}
                      {summary.horizonNote.clearTime && (
                        <strong>
                          {time(
                            summary.horizonNote.clearTime,
                            locale,
                            timeZone,
                          )}
                        </strong>
                      )}
                    </span>
                  );
                case "moonNote":
                  return (
                    <span key={fact} className="planner-constraint-note">
                      {message(locale, "plannerConstraintMoon")}{" "}
                      <strong>
                        ≥{" "}
                        {decimal(
                          summary.moonNote.moonSeparationMinimum,
                          locale,
                        )}
                        °
                      </strong>
                    </span>
                  );
                case "suggestedFilter":
                  return (
                    <span key={fact}>
                      {message(locale, "plannerSuggestedFilter")}{" "}
                      <strong>{card.filter}</strong>
                    </span>
                  );
                case "framing":
                  return (
                    <span key={fact}>
                      {message(locale, "plannerFraming")}{" "}
                      <strong>{framingMessage(card, locale)}</strong>
                    </span>
                  );
                case "suggestedIntegration":
                  // Last, deliberately after `framing`: a minimum-maximum
                  // duration is the fact most likely to wrap at a narrow width,
                  // and with nothing left below it, its own wrap never pushes
                  // another fact down.
                  return (
                    <span key={fact}>
                      {message(locale, "plannerSuggestedIntegration")}{" "}
                      <strong>
                        {integrationAvailable ? (
                          <>
                            {durationText(
                              card.integration.minimumMinutes,
                              locale,
                            )}
                            {" – "}
                            {durationText(
                              card.integration.maximumMinutes,
                              locale,
                            )}
                          </>
                        ) : (
                          "NA"
                        )}
                      </strong>
                    </span>
                  );
                default:
                  return null;
              }
            })}
          </div>
          {/* The target's shooting line stands at the foot of the card,
              under the facts. */}
          {acquisitionLine}
          {framingFiche &&
            (target.plannerSource === "framing" || target.framing) && (
              <FramingPlanFiche
                locale={locale}
                target={target}
                field={field}
                fiche={framingFiche}
              />
            )}
        </div>
        {showAction && (
          // Rule 8: the actions of a card are icon buttons of one size on its
          // right, weakest first -- "Voir sur la carte", then the plan action,
          // last. The score is the chip of the heading.
          <div className="planner-target-actions">
            {onShowOnMap && (
              <button
                type="button"
                className="planner-target-map-action"
                aria-label={message(locale, "targetMapOpen")}
                title={message(locale, "targetMapOpen")}
                onClick={() => onShowOnMap(target.id)}
              >
                <TargetMapIcon />
              </button>
            )}
            <TargetPlanAction
              addDisabledReason={addDisabledReason}
              canAdd={canAdd}
              editable={editable}
              iconOnly
              locale={locale}
              onAdd={onAdd}
              onRemove={onRemove}
              selected={selected}
            />
          </div>
        )}
      </div>
    </article>
  );
}

// The recommendation list is the bulk of the page (~100 cards, several thousand
// nodes). Memoised with a by-content comparator and fed only stable callbacks,
// it skips the re-renders a fold, a filter menu or an autosave cause elsewhere
// in the planner.
const RecommendationTargetList = memo(function RecommendationTargetList({
  addDisabledReason,
  cards,
  locale,
  timeZone,
  field,
  selectedIds,
  canAdd,
  editable,
  onAddCard,
  onRemoveCard,
  onShowOnMap,
  onShowScore,
  scores,
  mapSelectedTargetId,
  visualMode,
}) {
  return cards.map((card) => (
    <TargetCard
      addDisabledReason={addDisabledReason}
      key={card.target.id}
      card={card}
      locale={locale}
      timeZone={timeZone}
      field={field}
      selected={selectedIds.has(card.target.id)}
      canAdd={canAdd}
      editable={editable}
      onAdd={(anchor) => onAddCard(card, anchor)}
      onRemove={(anchor) => onRemoveCard(card.target.id, anchor)}
      onShowOnMap={onShowOnMap}
      score={scores?.get(card.target.id) || null}
      onShowScore={onShowScore}
      mapSelected={mapSelectedTargetId === card.target.id}
      visualMode={visualMode}
    />
  ));
}, sameShallowContentProps);

// Built after the stage-4 cards: the plan's targets under the timeline, sorted
// by the start of their slot (`timelinePlanTargets`), each the stage-4 card
// with "Dans ce plan · 19:55 → 21:05 · 1 h 10", its ⓘ and the red ✕ "Retirer du
// plan". A click on the card opens its slot editing, as a click on its block
// does.
function PlanTargetList({
  rows,
  locale,
  timeZone,
  night,
  editable,
  onOpen,
  onRemove,
  onShowScore,
  scores,
  visualMode,
  acquisition = null,
}) {
  if (!rows.length) return null;
  const clock = (minute) =>
    time(
      new Date(new Date(night.start).getTime() + minute * 60000),
      locale,
      timeZone,
    );
  return (
    <ul
      className="planner-timeline-plan-targets"
      aria-label={message(locale, "plannerTimelinePlanTargets")}
    >
      {rows.map((row) => (
        <li key={row.itemId} data-plan-target={row.itemId}>
          <TargetCard
            card={row.card}
            locale={locale}
            timeZone={timeZone}
            field={night.field}
            selected
            canAdd={editable}
            editable={editable}
            onRemove={() => onRemove(row.itemId)}
            onOpen={editable ? () => onOpen(row.itemId) : null}
            score={scores?.get(row.itemId) || null}
            onShowScore={onShowScore}
            visualMode={visualMode}
            planSlot={timelinePlanSlotLine(locale, row, clock)}
            acquisitionLine={
              acquisition ? (
                <AcquisitionCardLine
                  locale={locale}
                  view={acquisition.viewOf(row.item)}
                />
              ) : null
            }
          />
        </li>
      ))}
    </ul>
  );
}

// A plan's own fiche of a scheduled framing target: the state line ("Cadrage ·
// verrouillé"...), the framing's indicative reference equipment (dim), a
// warning when a *simple* framing's plan equipment differs from it or the panel
// grid recomputed for a *mosaic* framing, and the two actions ("Modifier le
// cadrage"/"Voir dans Cadrages"). Absent entirely while the referenced framing
// is not (yet) known (`fiche.resource` missing) -- a plain fact row, never a
// crash, matching every other optional fact this card already tolerates being
// unavailable.
function FramingPlanFiche({ locale, target, field, fiche }) {
  const { resource, planEquipment, readOnly = false, onModify, onView } = fiche;
  if (!resource) return null;
  const locked = resource.state === "locked" || resource.state === "archived";
  const stateLabel = locked
    ? message(locale, "plannerFramingStateLineLocked")
    : resource.state === "shared"
      ? message(locale, "plannerFramingStateLineShared").replace(
          "{count}",
          resource.usage?.pendingPlans?.length || 0,
        )
      : message(locale, "plannerFramingStateLineFree");
  const referenceEquipment = framingEquipmentSummary(target, locale);
  const referenceLine = labelValue(
    message(locale, "plannerFramingReferenceEquipmentLabel"),
    referenceEquipment
      ? referenceEquipment.setup || referenceEquipment.mode
      : message(locale, "plannerFramingReferenceEquipmentNone"),
    locale,
  );
  const mosaicGrid = framingPlanMosaicGrid(target, field);
  const fieldMismatch =
    !mosaicGrid && framingPlanEquipmentDiffers(target, planEquipment);
  return (
    <div className="planner-framing-plan-fiche">
      <p className="planner-framing-plan-fiche-state">{stateLabel}</p>
      <p className="planner-framing-plan-fiche-reference">{referenceLine}</p>
      {mosaicGrid ? (
        <p className="planner-framing-plan-fiche-mosaic">
          {message(locale, "plannerFramingFieldRecalculated")
            .replace("{columns}", mosaicGrid.columns)
            .replace("{rows}", mosaicGrid.rows)}
        </p>
      ) : (
        fieldMismatch && (
          <p className="planner-framing-plan-fiche-warning">
            {message(locale, "plannerFramingFieldWarning")}
          </p>
        )
      )}
      <div className="planner-framing-plan-fiche-actions">
        {onModify && (
          <button
            className="btn-tertiary"
            type="button"
            disabled={readOnly}
            onClick={() => onModify(target)}
          >
            {message(locale, "plannerFramingEditAction")}
          </button>
        )}
        <button
          className="btn-link"
          type="button"
          onClick={() => onView?.(target)}
        >
          {message(locale, "plannerFramingViewInLibrary")}
        </button>
      </div>
    </div>
  );
}

// Every planner dialog is
// drawn by the shared web shell (`portal/components/dialog/WebDialog.js`) —
// cross at the top right, actions at the bottom, its own top-layer dialog
// so one opened from another modal always lands above it.
// `destructive` is for an action that erases or removes something (deleting a
// plan): the action keeps its level, the primary, and takes the destructive
// tint. Abandoning, archiving and restoring a
// plan keep it, and changing the place of a night recalculates it: plain
// primaries, never the dark red of an erasure.
function ConfirmationDialog({
  locale,
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
  destructive = false,
}) {
  return (
    <WebConfirmDialog
      cancelLabel={message(locale, "plannerCancel")}
      className="planner-confirmation-dialog"
      closeLabel={flow(locale, "close")}
      confirmLabel={confirmLabel}
      description={description}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={title}
      titleAs="h3"
      tone={destructive ? "danger" : "primary"}
    />
  );
}

// "Une ligne, puis ⓘ": an export row is its title and one line, the detail of
// the format behind the ⓘ beside it. A disabled row says why in amber and
// carries no ⓘ. `lines` are the shooting lines the file does not carry, one per
// target, to copy by hand: listed under the sentence.
function ExportDetailButton({ locale, title, body, testId, lines = [] }) {
  return (
    <InfoButton
      locale={locale}
      label={message(locale, "plannerExportFormatDetail")}
      title={title}
      body={body}
      testId={testId}
    >
      {lines.length ? (
        <ul
          className="planner-export-copy-lines"
          data-testid={`${testId}-lines`}
        >
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </InfoButton>
  );
}

// `acquisition` ("Prise de vue par cible"): `{ available, copyLines }`,
// `available` when the plan has shooting lines (photo mode). The ASIAIR file
// carries coordinates only, so its detail gives the line of each target to
// copy into ASIAIR's Plan; the N.I.N.A. target set row exists only then.
function PlanExportDialog({
  locale,
  onClose,
  onExportAsiair,
  onExportNina,
  onExportNinaTargetSet,
  onExportPortal,
  acquisition = null,
}) {
  const copyLines = acquisition?.available ? acquisition.copyLines : [];
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-export-dialog"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      onClose={onClose}
      title={message(locale, "plannerExportTitle")}
      titleAs="h3"
      footer={
        <button className="btn-link" type="button" onClick={onClose}>
          {message(locale, "plannerCancel")}
        </button>
      }
    >
      <div className="planner-export-options">
        <div className="planner-export-row">
          <button
            className="btn-tertiary"
            data-testid="planner-export-asiair"
            type="button"
            onClick={onExportAsiair}
          >
            <strong>{message(locale, "plannerExportAsiairTitle")}</strong>
            <span>
              {message(
                locale,
                copyLines.length
                  ? "expoEAsiairLine"
                  : "plannerExportAsiairLine",
              )}
            </span>
          </button>
          <ExportDetailButton
            locale={locale}
            title={message(locale, "plannerExportAsiairTitle")}
            body={message(
              locale,
              copyLines.length ? "expoEAsiairHelp" : "plannerExportAsiairHelp",
            )}
            lines={copyLines.map((copy) => `${copy.name} · ${copy.line}`)}
            testId="planner-export-asiair-info"
          />
        </div>
        <div className="planner-export-row">
          <button
            className="btn-tertiary"
            data-testid="planner-export-nina"
            type="button"
            onClick={onExportNina}
          >
            <strong>{message(locale, "plannerExportNinaTitle")}</strong>
            <span>{message(locale, "plannerExportNinaLine")}</span>
          </button>
          <ExportDetailButton
            locale={locale}
            title={message(locale, "plannerExportNinaTitle")}
            body={message(locale, "plannerExportNinaHelp")}
            testId="planner-export-nina-info"
          />
        </div>
        {acquisition?.available && (
          <div className="planner-export-row">
            <button
              className="btn-tertiary"
              data-testid="planner-export-nina-set"
              type="button"
              onClick={onExportNinaTargetSet}
            >
              <strong>{message(locale, "expoENinaSetTitle")}</strong>
              <span>{message(locale, "expoENinaSetLine")}</span>
            </button>
            <ExportDetailButton
              locale={locale}
              title={message(locale, "expoENinaSetTitle")}
              body={message(locale, "expoENinaSetHelp")}
              testId="planner-export-nina-set-info"
            />
          </div>
        )}
        <button
          className="btn-tertiary"
          data-testid="planner-export-archive"
          type="button"
          onClick={onExportPortal}
        >
          <strong>{message(locale, "plannerExportPortalTitle")}</strong>
          <span>{message(locale, "plannerExportPortalHelp")}</span>
        </button>
      </div>
    </WebDialog>
  );
}

// "Exporter ce cadrage": the group "Matériel" only, ASIAIR then N.I.N.A.
// `asiairReady` / `ninaReady` say whether the framing has a coordinate to
// write; a row that cannot be used says why and carries no ⓘ.
function FramingExportDialog({
  locale,
  asiairReady,
  ninaReady,
  onClose,
  onExportAsiair,
  onExportNina,
}) {
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-export-dialog"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      onClose={onClose}
      title={message(locale, "plannerExportFramingTitle")}
      titleAs="h3"
      footer={
        <button className="btn-link" type="button" onClick={onClose}>
          {message(locale, "plannerCancel")}
        </button>
      }
    >
      <div className="planner-export-options">
        <p className="planner-export-group">
          {message(locale, "plannerEquipment")}
        </p>
        <div className="planner-export-row">
          <button
            className="btn-tertiary"
            data-testid="planner-export-asiair"
            disabled={!asiairReady}
            type="button"
            onClick={onExportAsiair}
          >
            <strong>{message(locale, "plannerExportAsiairTitle")}</strong>
            <span>{message(locale, "plannerExportFramingAsiairLine")}</span>
            {!asiairReady && (
              <span className="planner-export-reason">
                {message(locale, "plannerFramingAsiairNoCoordinate")}
              </span>
            )}
          </button>
          {asiairReady && (
            <ExportDetailButton
              locale={locale}
              title={message(locale, "plannerExportAsiairTitle")}
              body={message(locale, "plannerExportAsiairHelp")}
              testId="planner-export-asiair-info"
            />
          )}
        </div>
        <div className="planner-export-row">
          <button
            className="btn-tertiary"
            data-testid="planner-export-nina"
            disabled={!ninaReady}
            type="button"
            onClick={onExportNina}
          >
            <strong>{message(locale, "plannerExportNinaTitle")}</strong>
            <span>{message(locale, "plannerExportFramingNinaLine")}</span>
            {!ninaReady && (
              <span className="planner-export-reason">
                {message(locale, "plannerFramingNinaNoCoordinate")}
              </span>
            )}
          </button>
          {ninaReady && (
            <ExportDetailButton
              locale={locale}
              title={message(locale, "plannerExportNinaTitle")}
              body={message(locale, "plannerExportNinaHelp")}
              testId="planner-export-nina-info"
            />
          )}
        </div>
      </div>
    </WebDialog>
  );
}

// The single "Imprimer" entry point the schedule stage's tool row now opens, in
// place of the two separate print buttons that used to exist (this one, and the
// one next to the sky map). It offers "sky map only" or "whole plan".
function PrintChoiceDialog({ locale, onClose, onPrintPlan, onPrintSkyMap }) {
  return (
    <WebDialog
      className="planner-confirmation-dialog"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      onClose={onClose}
      title={message(locale, "plannerPrintChoiceTitle")}
      titleAs="h3"
      footer={
        <button className="btn-link" type="button" onClick={onClose}>
          {message(locale, "plannerCancel")}
        </button>
      }
    >
      <div className="planner-export-options">
        <button className="btn-tertiary" type="button" onClick={onPrintSkyMap}>
          <strong>{message(locale, "plannerPrintChoiceSkyMap")}</strong>
        </button>
        <button className="btn-tertiary" type="button" onClick={onPrintPlan}>
          <strong>{message(locale, "plannerPrintChoicePlan")}</strong>
        </button>
      </div>
    </WebDialog>
  );
}

function FramingDialog({
  draft,
  locale,
  onCancel,
  onConfirm,
  // 6c.9: the "+" flow (no plan, result #1) saves to the library only --
  // "Add framing to plan" would be wrong when there is no plan to add it
  // to. The classic in-plan capture keeps its original wording.
  confirmLabelKey = "plannerUseFramingSave",
}) {
  const [name, setName] = useState(draft.name);
  const center = draft.center;
  const coordinate = `${Number(center.ra).toFixed(5)}°, ${Number(center.dec).toFixed(5)}°`;
  // What lies under the frame is offered as choices — the target a search put
  // forward first, then by nearness and fame — and a click puts a choice's name
  // in the field, which stays editable. With nothing known under the frame the
  // field holds the centre's coordinates, and a line says why.
  const suggestions = useMemo(() => framingNameSuggestions(draft), [draft]);
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-framing-dialog"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      onClose={onCancel}
      title={message(locale, "plannerUseFramingTitle")}
      titleAs="h3"
      footer={
        <>
          <button className="btn-link" type="button" onClick={onCancel}>
            {message(locale, "plannerCancel")}
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim())}
          >
            {message(locale, confirmLabelKey)}
          </button>
        </>
      }
    >
      <p>{message(locale, "plannerUseFramingHelp")}</p>
      <label className="planner-framing-name">
        <span>{message(locale, "plannerUseFramingName")}</span>
        <input
          data-autofocus=""
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) onConfirm(name.trim());
          }}
        />
      </label>
      {suggestions.length > 0 ? (
        <div className="planner-framing-suggestions">
          <p className="planner-framing-suggestions-title">
            {message(locale, "plannerUseFramingUnderFrame")}
          </p>
          <ul>
            {suggestions.map((suggestion) => (
              <li key={suggestion.name}>
                <button
                  aria-label={message(
                    locale,
                    "plannerUseFramingUseName",
                  ).replace("{name}", suggestion.name)}
                  aria-pressed={name.trim() === suggestion.name}
                  className="planner-framing-suggestion"
                  onClick={() => setName(suggestion.name)}
                  type="button"
                >
                  <strong>{suggestion.name}</strong>
                  {suggestion.detail && <span>{suggestion.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="planner-framing-no-target">
          {message(locale, "plannerUseFramingNoTarget")}
        </p>
      )}
      <dl className="planner-framing-details">
        <dt>{message(locale, "plannerUseFramingCenter")}</dt>
        <dd>{coordinate}</dd>
      </dl>
    </WebDialog>
  );
}

// B sexies: the short, reusable explanation of the two framing natures,
// opened from the ⓘ of the editor's overlay menu.
// A `state.equipment`-shaped selection rebuilt from a framing's indicative
// `referenceEquipment` snapshot (A1's `framing.equipment`), so "Modifier une
// copie" reopens the editor with that equipment pre-selected rather than
// whatever the planner currently has picked. Falls back to `fallback`
// (typically the planner's own current selection) field by field.
function equipmentSelectionFromSnapshot(snapshot, fallback) {
  if (!snapshot) return { ...fallback };
  const telescopeId = snapshot.telescope?.id || fallback.telescopeId;
  const cameraId = snapshot.camera?.id || fallback.cameraId;
  const eyepieceId = snapshot.eyepiece?.id || fallback.eyepieceId;
  const modifierId = snapshot.modifier?.id || fallback.modifierId;
  return {
    ...fallback,
    mode: snapshot.mode || fallback.mode,
    telescopeId,
    cameraId,
    eyepieceId,
    modifierId,
  };
}

// The fullscreen sky map used to create or edit a framing. Reuses the planner's
// own `PlannerNightSkyMap` rather than a second map implementation: only the
// equipment selection and the mosaic surface are local to this dialog -- night,
// location and the planner's own equipment are left untouched.
//
// The editor has no night/place row: a framing is J2000-absolute, and the web
// editor reuses whichever night/location the planner already has open rather
// than exposing its own pickers.
// The editor's equipment is still the one it opened with.
function sameEquipmentSelection(current, initial) {
  const keys = new Set([...Object.keys(current), ...Object.keys(initial)]);
  return [...keys].every(
    (key) => JSON.stringify(current[key]) === JSON.stringify(initial[key]),
  );
}

function FramingEditorDialog({
  locale,
  mode,
  night,
  location,
  plannerProfiles,
  plannerTelescopes,
  plannerCameras,
  plannerEyepieces,
  plannerModifiers,
  initialEquipmentSelection,
  fullCatalogueTargets,
  editingTarget = null,
  initialFrameSurface = null,
  initialAngleDegrees = null,
  initialHighlightedTarget = null,
  initialView = null,
  // FRAMING-FROM-PREVIEW-01: the equipment the editor opened on is the app's
  // default one (said in a pill while it is still the one drawn).
  defaultEquipment = false,
  mosaicAllowed = true,
  signedIn = false,
  pickerProps = null,
  returnedEquipment = null,
  onReturnedUsed,
  onLeaveForEquipment,
  onCancel,
  onConfirm,
}) {
  const mapRef = useRef(null);
  const [equipmentSelection, setEquipmentSelection] = useState(
    initialEquipmentSelection,
  );
  // The note left for « Définir mon matériel » is the editor's while it is
  // away: shown again by the browser as it was left (its back-forward
  // cache), or closed, the editor needs it no more.
  useEffect(() => {
    const storage = tabSessionStorage();
    const shownAgain = (event) => {
      if (event.persisted) forgetFramingEditorDraft(storage);
    };
    window.addEventListener("pageshow", shownAgain);
    return () => {
      window.removeEventListener("pageshow", shownAgain);
      forgetFramingEditorDraft(storage);
    };
  }, []);
  // The piece « Définir mon matériel » brought back goes into the editor's
  // own equipment, never the plan's.
  useEffect(() => {
    if (!returnedEquipment) return;
    setEquipmentSelection((current) =>
      equipmentSelectionWithReturn(current, returnedEquipment.chosen),
    );
    onReturnedUsed?.(returnedEquipment);
    // Each piece brought back is taken once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedEquipment]);
  const localVisualMode = equipmentSelection.mode === "visual";
  const localEquipment = useMemo(
    () => resolveEquipment(equipmentSelection, plannerProfiles),
    [equipmentSelection, plannerProfiles],
  );
  const field = localEquipment.field || night?.field || null;
  // The surface a shell registered at `planner.framing.surface` extends the
  // frame into (a mosaic), live only for a profile that carries
  // `planner.mosaic`; without it, the framing of a single field the editor
  // makes for everyone. "Paramètres" opens the framing settings either way
  // (`FrameSettingsSheet`).
  const surfaceModel = plannerExtension("planner.framing.surface");
  const [frameSurface, setFrameSurface] = useState(initialFrameSurface);
  const liveSurface = surfaceModel && mosaicAllowed ? frameSurface : null;
  const [surfaceSheetOpen, setSurfaceSheetOpen] = useState(false);
  const [infoSheetOpen, setInfoSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedTarget, setHighlightedTarget] = useState(
    initialHighlightedTarget,
  );
  // The frame's
  // position angle -- 0° for a new framing whatever the rig, the saved one
  // for a framing reopened. The "Rotation" tool and Alt + the wheel over the
  // map set it; the map turns the frame and ends its caption with it.
  const [angleDegrees, setAngleDegrees] = useState(
    () => initialAngleDegrees ?? framingAngleOf(editingTarget),
  );
  const [angleText, setAngleText] = useState(() =>
    String(Math.round(initialAngleDegrees ?? framingAngleOf(editingTarget))),
  );
  const turnFrame = (next) => {
    const angle = Math.round(normalizeFramingAngle(next)) % 360;
    setAngleDegrees(angle);
    setAngleText(String(angle));
  };
  const updateEquipmentField = (key, value) =>
    setEquipmentSelection((current) => ({ ...current, [key]: value }));
  // « Définir mon matériel » leaves the page: the framing not saved yet is
  // noted first (`framing-editor-draft.js`), and the planner reopens the
  // editor on it on the way back.
  const noteBeforeLeaving = () =>
    onLeaveForEquipment?.({
      equipmentSelection,
      frameSurface,
      angleDegrees,
      highlightedTarget,
      view: mapRef.current?.viewState?.() ?? null,
    });
  const editorPickerProps = pickerProps
    ? (category, value) => {
        const props = pickerProps(category, value);
        if (!props?.define) return props;
        return {
          ...props,
          define: {
            ...props.define,
            onNavigate: (event) => {
              noteBeforeLeaving();
              props.define.onNavigate?.(event);
            },
          },
        };
      }
    : null;
  const telescopeProfile = plannerTelescopes.find(
    (profile) => profile.id === equipmentSelection.telescopeId,
  );
  const cameraProfile = plannerCameras.find(
    (profile) => profile.id === equipmentSelection.cameraId,
  );
  const eyepieceProfile = plannerEyepieces.find(
    (profile) => profile.id === equipmentSelection.eyepieceId,
  );
  const modifierProfile = plannerModifiers.find(
    (profile) => profile.id === equipmentSelection.modifierId,
  );
  const equipmentLabel = [
    telescopeProfile?.name,
    localVisualMode ? eyepieceProfile?.name : cameraProfile?.name,
  ]
    .filter(Boolean)
    .join(" · ");
  const equipmentControls = [
    {
      key: "telescope",
      icon: "telescope",
      label: message(locale, "plannerTelescope"),
      value: equipmentSelection.telescopeId,
      // Nothing chosen yet: « Choisir… », never the first of the list.
      placeholder: message(locale, "plannerEquipmentChoose"),
      options: plannerTelescopes,
      picker: editorPickerProps?.("telescope", equipmentSelection.telescopeId),
      onChange: (value) => updateEquipmentField("telescopeId", value),
    },
    localVisualMode
      ? {
          key: "eyepiece",
          icon: "eyepiece",
          label: message(locale, "plannerEyepiece"),
          value: equipmentSelection.eyepieceId,
          placeholder: message(locale, "plannerEquipmentChoose"),
          options: plannerEyepieces,
          picker: editorPickerProps?.(
            "eyepiece",
            equipmentSelection.eyepieceId,
          ),
          onChange: (value) => updateEquipmentField("eyepieceId", value),
        }
      : {
          key: "camera",
          icon: "camera",
          label: message(locale, "plannerCamera"),
          value: equipmentSelection.cameraId,
          placeholder: message(locale, "plannerEquipmentChoose"),
          options: plannerCameras,
          picker: editorPickerProps?.("camera", equipmentSelection.cameraId),
          onChange: (value) => updateEquipmentField("cameraId", value),
        },
    {
      key: "modifier",
      icon: "modifier",
      label: message(locale, "plannerOpticalModifier"),
      value: equipmentSelection.modifierId,
      options: modifierChoices(locale, plannerModifiers),
      picker: editorPickerProps?.("modifier", equipmentSelection.modifierId),
      onChange: (value) => updateEquipmentField("modifierId", value),
    },
  ];
  const referenceEquipmentSnapshot = () => ({
    schemaVersion: 1,
    mode: equipmentSelection.mode,
    telescope: {
      id: equipmentSelection.telescopeId,
      name: telescopeProfile?.name || null,
      apertureMm: Number(telescopeProfile?.apertureMm) || null,
      focalLengthMm: Number(telescopeProfile?.focalLengthMm) || null,
    },
    modifier: {
      id: equipmentSelection.modifierId,
      name: modifierProfile?.name || null,
      multiplier: Number(modifierProfile?.multiplier) || 1,
    },
    effectiveFocalLengthMm: Number(localEquipment.focalLengthMm) || null,
    field: field ? { ...field } : null,
    ...(localVisualMode
      ? {
          eyepiece: {
            id: equipmentSelection.eyepieceId,
            name: eyepieceProfile?.name || null,
            focalLengthMm: Number(localEquipment.eyepieceFocalLengthMm) || null,
            apparentFieldDegrees:
              Number(localEquipment.apparentFieldDegrees) || null,
          },
          magnification: Number(localEquipment.magnification) || null,
          exitPupilMm: Number(localEquipment.exitPupilMm) || null,
        }
      : {
          camera: {
            id: equipmentSelection.cameraId,
            name: cameraProfile?.name || null,
            sensorWidthMm: Number(cameraProfile?.sensorWidthMm) || null,
            sensorHeightMm: Number(cameraProfile?.sensorHeightMm) || null,
          },
        }),
  });
  // The target search. Choosing a result closes the panel, points the map at
  // the target in the field its size asks for (the frame being placed kept
  // whole), and keeps it highlighted -- under its own name, with the selection
  // reticle -- until the chip takes it off or another result replaces it.
  const closeSearch = () => {
    setSearchOpen(false);
    mapRef.current?.focusSearchControl();
  };
  const chooseSearchResult = (target) => {
    setHighlightedTarget(target);
    setSearchOpen(false);
    mapRef.current?.focusOnTarget(
      target,
      framingSearchFieldDegrees(target, field),
    );
    mapRef.current?.focusSearchControl();
  };
  const handleUseFraming = (draft) => {
    onConfirm({
      ...draft,
      ...surfaceDraftFields(surfaceModel, liveSurface, field),
      referenceEquipment: referenceEquipmentSnapshot(),
    });
  };
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="planner-framing-editor-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={message(
        locale,
        mode === "create" ? "plannerFramingNew" : "plannerFramingEditTitle",
      )}
    >
      {/* On the web the cross
          sits at the top right and the actions at the bottom. */}
      <div className="planner-framing-editor-topbar">
        <button
          aria-label={message(locale, "plannerFramingInfoTitle")}
          className="planner-framing-editor-info"
          onClick={() => setInfoSheetOpen(true)}
          title={message(locale, "plannerFramingInfoTitle")}
          type="button"
        >
          ⓘ
        </button>
        <button
          aria-label={flow(locale, "close")}
          className="planner-framing-editor-cancel"
          onClick={onCancel}
          title={flow(locale, "close")}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {defaultEquipment &&
      sameEquipmentSelection(equipmentSelection, initialEquipmentSelection) ? (
        <button
          className="btn-link planner-framing-editor-default-equipment"
          data-testid="framing-editor-default-equipment"
          onClick={() => mapRef.current?.focusEquipmentControl()}
          type="button"
        >
          {fillTemplate(message(locale, "plannerFramingDefaultEquipment"), {
            name: equipmentLabel,
          })}
        </button>
      ) : null}
      {highlightedTarget && (
        <FramingHighlightChip
          locale={locale}
          onRemove={() => setHighlightedTarget(null)}
          target={highlightedTarget}
        />
      )}
      {/* No plan card, so no catalogue marker of the map's own accord --
          `framingEditorMapInputs` (`framing-editor.js`) is the rule and its
          test. `framingTargets` is the pool a framing is named from, never
          drawn. */}
      {/* Without a
          field there is no frame to draw and nothing to record. The reason
          stands at the centre of the map, with the one action that brings the
          frame back; « Créer ce cadrage » below is disabled until a field
          exists. */}
      {!field && (
        <div
          className="planner-framing-editor-no-field"
          data-testid="framing-editor-no-field"
          role="status"
        >
          <p>{message(locale, "plannerFramingNoFieldTitle")}</p>
          <button
            className="btn-tertiary"
            onClick={() => mapRef.current?.focusEquipmentControl()}
            type="button"
          >
            {message(locale, "plannerFramingNoFieldAction")}
          </button>
        </div>
      )}
      <PlannerNightSkyMap
        // A view brought back wins over the framing's own centre.
        autoCenterOnSelected={Boolean(editingTarget) && !initialView}
        initialView={initialView}
        canAdd
        {...framingEditorMapInputs({ editingTarget, highlightedTarget })}
        editable
        equipmentControls={equipmentControls}
        equipmentLabel={equipmentLabel}
        field={field}
        framingTargets={fullCatalogueTargets}
        hideUseFramingAction
        locale={locale}
        location={location}
        frameSurface={liveSurface}
        frameAngleDegrees={angleDegrees}
        frameAngleShown
        onTurnFrame={field ? turnFrame : null}
        night={night}
        onConfigureFrameSurface={() => setSurfaceSheetOpen(true)}
        onSearch={() => setSearchOpen((open) => !open)}
        onUseFraming={handleUseFraming}
        ref={mapRef}
        searchOpen={searchOpen}
        selectedTargetId={editingTarget?.id}
        showSectionHeading={false}
        visualMode={localVisualMode}
      />
      {searchOpen && (
        <FramingTargetSearchPanel
          locale={locale}
          onChoose={chooseSearchResult}
          onClose={closeSearch}
        />
      )}
      <FramingRotationTool
        angleDegrees={angleDegrees}
        angleText={angleText}
        disabled={!field}
        locale={locale}
        onAngleText={(text) => {
          setAngleText(text);
          const angle = framingAngleFromInput(text);
          if (angle != null) setAngleDegrees(angle);
        }}
        onTurn={turnFrame}
      />
      <div className="planner-framing-editor-actions">
        <button className="btn-link" onClick={onCancel} type="button">
          {message(locale, "plannerCancel")}
        </button>
        <button
          className="btn-primary"
          disabled={!field}
          onClick={() => mapRef.current?.triggerFraming()}
          type="button"
        >
          {message(locale, framingEditorConfirmLabelKey(mode))}
        </button>
      </div>
      {surfaceSheetOpen && (
        <FrameSettingsSheet
          enabled={Boolean(liveSurface)}
          equipmentLabel={equipmentLabel}
          field={field}
          initial={frameSurface}
          locale={locale}
          mosaicAllowed={mosaicAllowed}
          signedIn={signedIn}
          onCancel={() => setSurfaceSheetOpen(false)}
          onConfirm={({ enabled, surface }) => {
            setFrameSurface(enabled ? surface : null);
            setSurfaceSheetOpen(false);
          }}
        />
      )}
      {infoSheetOpen && (
        <FramingInfoSheet
          locale={locale}
          onClose={() => setInfoSheetOpen(false)}
        />
      )}
    </div>,
    document.body,
  );
}

// Locked/shared rule sheets and the three delete cases, plus the short
// rename-only form always available on a locked/archived framing. One dialog
// rather than six components -- the shape (title, message, optional plan list,
// actions) is identical, only the wording and buttons differ per `kind`.
function FramingRuleSheet({
  locale,
  kind,
  framingName,
  plans = [],
  onClose,
  onAction,
}) {
  const replaced = (key) =>
    message(locale, key)
      .replace("{name}", framingName || "")
      .replace("{count}", String(plans.length));
  const titleIcon = (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
  const body = (() => {
    switch (kind) {
      case "locked":
        return {
          title: replaced("plannerFramingLockedSheetTitle"),
          message: replaced("plannerFramingLockedSheetMessage"),
          actions: [
            {
              key: "close",
              label: message(locale, "plannerFramingClose"),
              level: "link",
              onClick: onClose,
            },
            {
              key: "rename",
              label: message(locale, "plannerFramingLockedSheetActionRename"),
              level: "secondary",
              onClick: () => onAction("rename"),
            },
            {
              key: "copy",
              label: message(locale, "plannerFramingLockedSheetActionCopy"),
              level: "primary",
              onClick: () => onAction("editCopy"),
            },
          ],
        };
      case "shared":
        return {
          title: replaced("plannerFramingSharedSheetTitle"),
          message: replaced("plannerFramingSharedSheetMessage"),
          actions: [
            {
              key: "cancel",
              label: message(locale, "plannerCancel"),
              level: "link",
              onClick: onClose,
            },
            {
              key: "copy",
              label: message(locale, "plannerFramingSharedSheetActionCopy"),
              level: "secondary",
              onClick: () => onAction("editCopy"),
            },
            {
              key: "all",
              label: message(locale, "plannerFramingSharedSheetActionApplyAll"),
              level: "primary",
              onClick: () => onAction("editFree"),
            },
          ],
        };
      case "deleteLocked":
        return {
          title: replaced("plannerFramingDeleteLockedTitle"),
          message: replaced("plannerFramingDeleteLockedMessage"),
          actions: [
            {
              key: "cancel",
              label: message(locale, "plannerCancel"),
              level: "link",
              onClick: onClose,
            },
            {
              key: "archive",
              label: message(locale, "plannerFramingArchiveAction"),
              level: "primary",
              onClick: () => onAction("archive"),
            },
          ],
        };
      case "deleteShared":
        return {
          title: null,
          message: replaced("plannerFramingDeleteSharedMessage"),
          actions: [
            {
              key: "cancel",
              label: message(locale, "plannerCancel"),
              level: "link",
              onClick: onClose,
            },
            {
              key: "remove",
              label: message(locale, "plannerFramingRemoveAndDelete"),
              level: "primary",
              danger: true,
              onClick: () => onAction("removeAndDelete"),
            },
          ],
        };
      case "deleteFree":
      default:
        return {
          title: null,
          message: replaced("plannerFramingDeleteFreeMessage"),
          actions: [
            {
              key: "cancel",
              label: message(locale, "plannerCancel"),
              level: "link",
              onClick: onClose,
            },
            {
              key: "delete",
              label: message(locale, "plannerFramingDeleteAction"),
              level: "primary",
              danger: true,
              onClick: () => onAction("delete"),
            },
          ],
        };
    }
  })();
  return (
    <WebDialog
      ariaLabel={body.message}
      className="planner-confirmation-dialog planner-framing-dialog planner-framing-rule-sheet"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      onClose={onClose}
      role={
        body.actions.some((action) => action.danger) ? "alertdialog" : "dialog"
      }
      title={
        body.title ? (
          <>
            {titleIcon}
            <span>{body.title}</span>
          </>
        ) : null
      }
      titleAs="h3"
      footer={body.actions.map((action) => (
        <button
          className={levelClass(action.level, { destructive: action.danger })}
          data-autofocus={action.key === "cancel" ? "" : undefined}
          key={action.key}
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      ))}
    >
      <p>{body.message}</p>
      {plans.length > 0 && (
        <div className="planner-framing-rule-sheet-plans">
          {plans.map((plan) => (
            <div className="row" key={plan.planId}>
              <span>{plan.name}</span>
              <span className="s">
                {plan.planDate ? dateLabel(plan.planDate, locale) : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </WebDialog>
  );
}

// Renaming stays possible on a locked/archived framing without a copy —
// only the `name` field is sent, so the server accepts it even while every
// other change on that framing would be `409 framing_locked`.
function FramingRenameDialog({ locale, initialName, onCancel, onConfirm }) {
  const [name, setName] = useState(initialName || "");
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-framing-dialog"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      onClose={onCancel}
      title={message(locale, "plannerFramingRenameTitle")}
      titleAs="h3"
      footer={
        <>
          <button className="btn-link" onClick={onCancel} type="button">
            {message(locale, "plannerCancel")}
          </button>
          <button
            className="btn-primary"
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim())}
            type="button"
          >
            {message(locale, "plannerFramingRenameSave")}
          </button>
        </>
      }
    >
      <label className="planner-framing-name">
        <span>{message(locale, "plannerUseFramingName")}</span>
        <input
          data-autofocus=""
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) onConfirm(name.trim());
          }}
          value={name}
        />
      </label>
    </WebDialog>
  );
}

// A non-blocking notice, shown once, after a write was silently turned into a
// copy rather than losing or overwriting anything.
function FramingCopyNotice({ locale, notice, onDismiss }) {
  if (!notice) return null;
  const text = message(
    locale,
    notice.reason === "locked"
      ? "plannerFramingConflictLockedNotice"
      : "plannerFramingConflictConcurrentNotice",
  ).replaceAll("{name}", notice.name || "");
  return (
    <div className="planner-copy-notice-banner" role="status">
      <p>{text}</p>
      <button
        onClick={onDismiss}
        type="button"
        aria-label={message(locale, "plannerFramingClose")}
      >
        ×
      </button>
    </div>
  );
}

// What a profile holds back is refused in words, never silently -- the
// sentence, then the way to the offers (a link: it goes to see elsewhere) and
// to close it (a link too). A signed-in person is sent to "Abonnement et
// achats", where they buy; a visitor, who has no space yet, to the public page
// of the offers.
function CapabilityNotice({ locale, refusal, signedIn, onDismiss }) {
  if (!refusal || typeof document === "undefined") return null;
  const offers = plannerExtension("planner.offers");
  const copy = refusalCopy(locale);
  return createPortal(
    <aside
      className="planner-add-notice planner-capability-notice"
      key={refusal.id}
      role="status"
      aria-live="polite"
    >
      <span
        className="planner-add-notice-icon planner-capability-notice-icon"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <span>{copy[refusal.kind]}</span>
      <span className="planner-capability-notice-actions">
        {offers && refusal.kind !== "planGuard" && (
          <a className="btn-link" href={offers.href({ locale, signedIn })}>
            {copy.seeOffers}
          </a>
        )}
        <button className="btn-link" type="button" onClick={onDismiss}>
          {message(locale, "plannerFramingClose")}
        </button>
      </span>
    </aside>,
    document.body,
  );
}

// The plans made in this browser without a space, when the person signs in to a
// space that already holds something. "Add them" is the action; "Keep them in
// this browser" is its direct alternative and keeps them where they are. The cross and Escape answer nothing:
// the question comes back at the next launch.
function BrowserPlansDialog({ copy, count, locale, onAnswer, onDismiss }) {
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-browser-plans-dialog"
      closeLabel={flow(locale, "close")}
      onClose={onDismiss}
      title={copy.title}
      titleAs="h3"
      footer={
        <>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => onAnswer("declined")}
          >
            {copy.leave(count)}
          </button>
          <button
            className="btn-primary"
            type="button"
            data-autofocus=""
            onClick={() => onAnswer("accepted")}
          >
            {copy.add(count)}
          </button>
        </>
      }
    >
      <p>{copy.question(count)}</p>
      <p className="planner-browser-plans-help">{copy.help(count)}</p>
    </WebDialog>
  );
}

// What was done with the plans of the browser, in words: taken into the space,
// what stayed (each plan that stayed says why, where it is: the note of the
// offer and the way to the offers, or the space that did not answer and "try
// again"). A notice has no primary: its ways are links.
function BrowserPlansNotice({
  copy,
  locale,
  notice,
  onDismiss,
  onRetry,
  signedIn,
}) {
  if (!notice || typeof document === "undefined") return null;
  const offers = plannerExtension("planner.offers");
  const settled = notice.kind === "settled";
  const sentences = settled
    ? [
        notice.taken > 0 && copy.carried(notice.taken),
        notice.limit > 0 && copy.left(notice.limit),
        notice.waiting > 0 && copy.failed,
      ].filter(Boolean)
    : [copy.failed];
  return createPortal(
    <aside
      className="planner-add-notice planner-capability-notice planner-browser-plans-notice"
      key={notice.id}
      role="status"
      aria-live="polite"
    >
      <span
        className="planner-add-notice-icon planner-capability-notice-icon"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 16V5" />
          <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
          <path d="M5 19h14" />
        </svg>
      </span>
      <span>
        <span className="planner-browser-plans-line">
          {sentences.join(sentenceSeparator(locale))}
        </span>
      </span>
      <span className="planner-capability-notice-actions">
        {settled && notice.limit > 0 && offers && (
          <a className="btn-link" href={offers.href({ locale, signedIn })}>
            {copy.seeOffers}
          </a>
        )}
        {(!settled || notice.waiting > 0) && (
          <button className="btn-link" type="button" onClick={onRetry}>
            {copy.retry}
          </button>
        )}
        <button className="btn-link" type="button" onClick={onDismiss}>
          {copy.close}
        </button>
      </span>
    </aside>,
    document.body,
  );
}

function FramingInfoSheet({ locale, onClose }) {
  // The second nature of a framing is the surface a shell registered at
  // `planner.framing.surface` (a mosaic).
  const InfoParagraph = plannerExtension(
    "planner.framing.surface",
  )?.InfoParagraph;
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-framing-dialog"
      closeLabel={flow(locale, "close")}
      closeOnBackdrop
      onClose={onClose}
      title={message(locale, "plannerFramingInfoTitle")}
      titleAs="h3"
      footer={
        <button className="btn-link" type="button" onClick={onClose}>
          {message(locale, "plannerFramingGotIt")}
        </button>
      }
    >
      <p>{message(locale, "plannerFramingInfoSimple")}</p>
      {InfoParagraph && <InfoParagraph locale={locale} />}
    </WebDialog>
  );
}

function HorizonTargetPreview({
  addDisabledReason,
  card,
  canAdd,
  editable = true,
  locale,
  onAdd,
  onRemove,
  selected,
  timeZone,
  visualMode = false,
}) {
  if (!card) return null;
  const target = card.target;
  const targetTitle =
    target.title || target.designation || target.objects?.[0] || "";
  return (
    <aside
      className="planner-night-map-target-preview planner-horizon-target-preview"
      aria-label={targetTitle}
    >
      <MapTargetPreview
        key={target.id}
        target={target}
        visualMode={visualMode}
      />
      <MapTargetSummary
        action={
          <TargetPlanAction
            addDisabledReason={addDisabledReason}
            canAdd={canAdd}
            editable={editable}
            locale={locale}
            onAdd={(anchor) => onAdd?.(card, anchor)}
            onRemove={(anchor) => onRemove?.(target.id, anchor)}
            selected={selected}
          />
        }
        card={card}
        locale={locale}
        target={target}
        timeZone={timeZone}
      />
    </aside>
  );
}

// The plot's own label geometry, in the SVG user units the two projections
// are drawn in. `.planner-horizon-target-label` is 2.45px bold, and an SVG
// `<text>` has no measurable box until it is in the document, so its width is
// estimated from a mean advance -- deliberately a touch generous, because
// over-reserving only spaces the names further apart. The estimate is a plain
// product, so the server's first render and the browser's agree and the plot
// cannot jump on hydration.
const horizonLabelFontSize = 2.45;
const horizonLabelAdvance = 1.45;
const horizonLabelAscent = horizonLabelFontSize * 0.78;
const horizonLabelHeight = horizonLabelFontSize * 1.15;

function HorizonProjectionCanvas({
  cards,
  latitude,
  locale,
  mask,
  maskLabel,
  minAltitude,
  mountSafety,
  projection,
  rotation,
  sampleIndex,
  showLabels,
  // Only used to rank the labels -- a target already in the plan keeps its
  // name when a neighbour has to lose one.
  selectedIds,
  selectedTargetId,
  // The night score of every card, to name the best-rated targets on the
  // "Positions" map.
  labelScores = null,
  onTargetSelect,
  targetPreview,
  printable = false,
  timeLabel,
  sampleCount = 0,
  onTimeChange,
  // Path mode: the night of one target (`targetNightPath`) drawn over the
  // map, the instant of the time slider, the plot's label. `cards` are
  // then the plan's other targets, dimmed.
  path = null,
  pathSampleTime = null,
  pathLabel = null,
  timeZone,
  // The light-pollution layer (the grid by direction, or null) drawn under
  // everything, and the mask layer's switch. The mask still decides which
  // targets it hides when it is not drawn.
  lightGrid = null,
  showMask = true,
  // On the circular sky a vertical drag between the two side bands turns
  // the orientation (`horizon-rotate-gesture.js`).
  onRotationChange = null,
}) {
  const gestureRef = useRef(null),
    suppressClickUntil = useRef(0),
    plotRef = useRef(null);
  // On a touch screen: the plot lets the page pan vertically
  // (`touch-action: pan-y`), so a finger that starts between the side bands
  // of the circular sky and goes up or down is kept from the page here,
  // before the browser starts scrolling; the pointer handlers turn the map.
  useEffect(() => {
    const element = plotRef.current;
    if (!element || !onRotationChange || printable) return undefined;
    const keepFromPage = (event) => {
      const gesture = gestureRef.current;
      const touch = event.touches?.[0];
      if (!gesture?.canRotate || !touch || gesture.dragging) return;
      const dx = touch.clientX - gesture.x,
        dy = touch.clientY - gesture.y;
      if (gesture.rotating || Math.abs(dy) > Math.abs(dx))
        event.preventDefault();
    };
    element.addEventListener("touchmove", keepFromPage, { passive: false });
    return () => element.removeEventListener("touchmove", keepFromPage);
  }, [onRotationChange, printable]);
  // The mask's hatching is a pattern of this plot's own document (a shared
  // id would break when one of two plots on the page is hidden).
  const hatchId = `planner-horizon-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // The plot's size on screen: the path's hour labels are spaced in pixels.
  const [plotSize, setPlotSize] = useState(null);
  // The names of the "Positions" map are laid out in pixels too, so the
  // plot's rendered size is observed for them as well.
  const measuresPlot = Boolean(path) || (showLabels && !printable);
  useEffect(() => {
    const element = plotRef.current;
    if (!measuresPlot || !element || typeof ResizeObserver === "undefined")
      return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setPlotSize((current) =>
        current?.width === width && current?.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [measuresPlot]);
  // The hours are written at 11 px at least; their width, from the place's
  // own writing of an hour, places each one beside its dot, off the
  // stroke.
  const hourLabelWidth = path?.hourTicks?.length
    ? positionLabelWidth(
        placeClock(path.hourTicks[0].time, locale, timeZone),
        positionLabelFontSize,
      )
    : 0;
  const pathLayer = useMemo(() => {
    if (!path) return null;
    const circular = projection === "circular";
    const width = plotSize?.width || (circular ? 340 : 320);
    const height = plotSize?.height || (circular ? 340 : 210);
    const side = Math.min(width, height);
    return horizonPathLayer(path, {
      projection,
      rotation,
      sampleTime: pathSampleTime,
      scale: circular
        ? { x: side / 200, y: side / 200 }
        : { x: width / 360, y: height / 90 },
      labelSize: {
        width: hourLabelWidth || undefined,
        height: Math.round(positionLabelFontSize * 1.2),
      },
      // The clock and the mask's badge lie over the plot's top corners: an
      // hour is never written under them.
      avoid: [
        ...(!printable && timeLabel
          ? [{ x: 8, y: 8, width: 68, height: 30 }]
          : []),
        ...(!printable && mask?.enabled && showMask && maskLabel
          ? [
              {
                x: width - 8 - Math.min(width * 0.58, 272),
                y: 8,
                width: Math.min(width * 0.58, 272),
                height: 30,
              },
            ]
          : []),
      ],
    });
  }, [
    path,
    projection,
    rotation,
    pathSampleTime,
    plotSize,
    hourLabelWidth,
    printable,
    timeLabel,
    mask?.enabled,
    showMask,
    maskLabel,
  ]);
  // One cycle per plot, kept across renders -- it *is* the memory of where
  // the last click landed and what it produced.
  const tapCycleRef = useRef(null);
  if (!tapCycleRef.current) tapCycleRef.current = createMapTapCycle();
  const draft = normaliseHorizonMask(mask);
  const polarisAltitude = Number(latitude);
  const hasPolaris =
    String(latitude ?? "").trim() !== "" &&
    Number.isFinite(polarisAltitude) &&
    polarisAltitude >= 0;
  const circularPoint = (azimuth, altitude) =>
    horizonCircularPoint(azimuth, altitude, rotation);
  const circularCardinalPoint = (azimuth) =>
    horizonCircularCardinalPoint(azimuth, rotation);
  const meridianOuter = circularPoint(180, 0);
  const meridianLabel = circularPoint(180, 12);
  const profilePath = [...draft.points, { ...draft.points[0], azimuth: 360 }]
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${point.azimuth} ${(90 - point.altitude).toFixed(2)}`,
    )
    .join(" ");
  const maskedArea = `${profilePath} L360 90 L0 90 Z`;
  const circularProfilePoints = [
    ...draft.points,
    { ...draft.points[0], azimuth: 360 },
  ].map((point) => circularPoint(point.azimuth, point.altitude));
  // The altitude-0 ring, one corner per mask direction and back to north.
  const circularOuterPoints = Array.from(
    { length: horizonMaskPointCount + 1 },
    (_, index) => circularPoint(index * horizonMaskStep, 0),
  );
  const circularProfilePath = circularProfilePoints
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const circularMaskedArea = `${circularProfilePath} L${circularOuterPoints
    .at(-1)
    .x.toFixed(
      2,
    )} ${circularOuterPoints.at(-1).y.toFixed(2)} ${circularOuterPoints
    .slice(0, -1)
    .reverse()
    .map((point) => `L${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")} Z`;
  const hasMask = Boolean(mask?.enabled) && showMask;
  // Pixels per user unit on each axis, at the plot's size on screen (or the
  // size the server assumes before it is measured).
  const plotScale = (() => {
    const circular = projection === "circular";
    const width = plotSize?.width || (circular ? 340 : 320);
    const height = plotSize?.height || (circular ? 340 : 210);
    const side = Math.min(width, height);
    return circular
      ? { x: side / 200, y: side / 200 }
      : { x: width / 360, y: height / 90 };
  })();
  const zenithAltitude = zenithLimitAltitude(mountSafety);
  const lightDescription = lightGrid
    ? horizonLightDescription(locale, lightGrid)
    : "";
  const cardPosition = (card) => {
    const point = card.series[sampleIndex];
    if (!point || point.altitude < 0) return null;
    return projection === "circular"
      ? circularPoint(point.azimuth, point.altitude)
      : { x: point.azimuth, y: 90 - clamp(point.altitude, 0, 90) };
  };
  const cardLabel = (card) =>
    card.target.designation || card.target.objects?.[0] || card.target.title;
  // The names of two targets a degree apart used to be written on top of one
  // another. They are now laid out by the shared rule (`map-labels.js`) --
  // ranked selected first, then the plan's own targets -- and a name with
  // nowhere free to go is dropped, never its dot. Arithmetic only, so it costs
  // nothing to redo while the observer drags the plot through the night. In
  // path mode the names of the other targets are written by the path's HTML
  // layer (`HorizonPathMarkers`) instead.
  const labelPlacements =
    showLabels && !path && printable
      ? new Map(
          layOutMapLabels({
            canvas:
              projection === "circular"
                ? { width: 200, height: 200 }
                : { width: 360, height: 90 },
            requests: cards.flatMap((card) => {
              const position = cardPosition(card);
              const text = cardLabel(card);
              if (!position || !text) return [];
              const nudge = projection === "circular" ? 2.5 : 2;
              return [
                {
                  key: card.target.id,
                  text,
                  origin: position,
                  size: {
                    width: estimatedLabelWidth(text, horizonLabelAdvance),
                    height: horizonLabelHeight,
                  },
                  priority: mapLabelPriority({
                    selected: selectedTargetId === card.target.id,
                    inPlan: Boolean(selectedIds?.has(card.target.id)),
                  }),
                  // The plot writes a name to the upper right of its dot; that
                  // stays the preferred position, and `layOutMapLabels` only
                  // moves the ones that cannot have it.
                  offset: { x: nudge, y: -1.7 - horizonLabelAscent },
                  gap: nudge + 0.7,
                },
              ];
            }),
          }).map((placement) => [placement.key, placement]),
        )
      : new Map();
  // On the screen the "Positions" map names the selected target, the plan's
  // targets and the ten best-rated others, at 11 px at least at the plot's
  // rendered size, in an HTML layer, laid out in pixels by the same rule.
  // Every dot stays, with its name in its `<title>`.
  const positionPlacements = useMemo(() => {
    if (!showLabels || path || printable) return [];
    const circular = projection === "circular";
    const width = plotSize?.width || (circular ? 340 : 320);
    const height = plotSize?.height || (circular ? 340 : 210);
    const named = positionLabelTargetIds({
      cards,
      selectedTargetId,
      planIds: selectedIds,
      scores: labelScores,
    });
    const labelHeight = Math.round(positionLabelFontSize * 1.2);
    // The clock and the mask's badge lie over the plot's top corners: they
    // take their place first, as labels of the highest rank that are not
    // written, so no name goes under them.
    const badges = [
      timeLabel ? { x: 8, y: 8, width: 68, height: 30 } : null,
      mask?.enabled && showMask && maskLabel
        ? {
            x: width - 8 - Math.min(width * 0.58, 272),
            y: 8,
            width: Math.min(width * 0.58, 272),
            height: 30,
          }
        : null,
    ].flatMap((rectangle, index) =>
      rectangle
        ? [
            {
              key: `!badge-${index}`,
              text: "·",
              origin: { x: rectangle.x, y: rectangle.y },
              size: { width: rectangle.width, height: rectangle.height },
              priority: "selected",
              offset: { x: 0, y: 0 },
              gap: 0,
            },
          ]
        : [],
    );
    const placed = layOutMapLabels({
      canvas: { width, height },
      // Two names a pixel or two apart read as one: leave room for the halo.
      clearance: 5,
      requests: [
        ...badges,
        ...cards.flatMap((card) => {
          const point = card.series[sampleIndex];
          const text =
            card.target.designation ||
            card.target.objects?.[0] ||
            card.target.title;
          if (
            !named.has(card.target.id) ||
            !point ||
            point.altitude < 0 ||
            !text
          )
            return [];
          const position = circular
            ? horizonCircularPoint(point.azimuth, point.altitude, rotation)
            : { x: point.azimuth, y: 90 - clamp(point.altitude, 0, 90) };
          const origin = circular
            ? { x: (position.x / 200) * width, y: (position.y / 200) * height }
            : { x: (position.x / 360) * width, y: (position.y / 90) * height };
          return [
            {
              key: card.target.id,
              text,
              origin,
              size: {
                width: positionLabelWidth(text, positionLabelFontSize),
                height: labelHeight,
              },
              priority: mapLabelPriority({
                selected: selectedTargetId === card.target.id,
                inPlan: Boolean(selectedIds?.has(card.target.id)),
              }),
              // To the upper right of its dot.
              offset: { x: 6, y: -labelHeight - 3 },
              gap: 8,
            },
          ];
        }),
      ],
    });
    return placed.filter((placement) => !placement.key.startsWith("!badge-"));
  }, [
    showLabels,
    path,
    printable,
    projection,
    rotation,
    plotSize,
    cards,
    selectedTargetId,
    selectedIds,
    labelScores,
    sampleIndex,
    timeLabel,
    mask?.enabled,
    showMask,
    maskLabel,
  ]);
  // A second click at the same spot used to re-resolve to the same nearest dot
  // and merely toggle it off again, so a target sitting under another was
  // unreachable. It now walks the overlapping ones, one per click. The camera
  // signature is this plot's own -- projection, orientation and the sample
  // being shown -- so any of the three changing restarts the walk rather than
  // resuming a stale one.
  const selectNearestTarget = (event, fallbackTargetId) => {
    const svg = event.currentTarget.ownerSVGElement;
    const screenMatrix = svg?.getScreenCTM?.();
    if (!svg || !screenMatrix) {
      const fallbackIsSelected = selectedTargetId === fallbackTargetId;
      onTargetSelect?.(fallbackIsSelected ? null : fallbackTargetId);
      return;
    }

    const pointer = svg.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const click = pointer.matrixTransform(screenMatrix.inverse());
    // The tolerance is written in CSS pixels; the plot is drawn in its own
    // user units, and the two projections scale differently, so it is
    // converted through the matrix that is actually in force.
    const scale = Math.min(
      Math.abs(screenMatrix.a) || 1,
      Math.abs(screenMatrix.d) || 1,
    );
    const candidates = horizonTargetCandidatesAtPoint({
      point: { x: click.x, y: click.y },
      targets: cards.flatMap((card) => {
        const position = cardPosition(card);
        return position
          ? [{ id: card.target.id, x: position.x, y: position.y }]
          : [];
      }),
      tolerance: horizonTargetTapTolerancePx / scale,
    });
    const targetId = tapCycleRef.current.resolve({
      position: { x: event.clientX, y: event.clientY },
      candidates: candidates.length ? candidates : [fallbackTargetId],
      currentSelection: selectedTargetId,
      viewSignature: `${projection}:${rotation}:${sampleIndex}`,
    });
    // The plot's own toggle still turns a repeated identical selection into
    // a deselect, which is what a lone candidate resolves to on a second
    // click.
    onTargetSelect?.(selectedTargetId === targetId ? null : targetId);
  };

  return (
    <div
      className={`planner-horizon-plot-shell is-${projection}${printable ? " is-printable" : ""}`}
    >
      {projection === "linear" && (
        <div className="planner-horizon-altitude-axis" aria-hidden="true">
          <strong>{message(locale, "plannerHorizonAltitudeAxis")}</strong>
          <div>
            {[90, 75, 60, 45, 30, 15, 0].map((altitude) => (
              <span key={altitude}>{altitude}°</span>
            ))}
          </div>
        </div>
      )}
      <div
        className={`planner-horizon-plot-wrap${onTimeChange && !printable ? " is-time-interactive" : ""}${path ? " is-path-mode" : ""}`}
        ref={plotRef}
        onPointerDown={
          onTimeChange && !printable
            ? (event) => {
                if (
                  event.button !== 0 ||
                  !event.isPrimary ||
                  event.target.closest("aside,button,input")
                )
                  return;
                const box = event.currentTarget.getBoundingClientRect();
                gestureRef.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  index: sampleIndex,
                  width: box.width,
                  height: box.height,
                  rotation,
                  // The side bands never turn the map: a vertical drag
                  // there is left to the page.
                  canRotate:
                    Boolean(onRotationChange) &&
                    projection === "circular" &&
                    horizonRotateStartsInCentre(
                      event.clientX - box.left,
                      box.width,
                    ),
                  dragging: false,
                  rotating: false,
                };
              }
            : undefined
        }
        onPointerMove={
          onTimeChange && !printable
            ? (event) => {
                const gesture = gestureRef.current;
                if (!gesture || gesture.pointerId !== event.pointerId) return;
                const dx = event.clientX - gesture.x,
                  dy = event.clientY - gesture.y;
                if (
                  !gesture.dragging &&
                  !gesture.rotating &&
                  Math.abs(dy) > Math.abs(dx) &&
                  Math.abs(dy) > 8
                ) {
                  if (!gesture.canRotate) {
                    gestureRef.current = null;
                    return;
                  }
                  gesture.rotating = true;
                }
                if (gesture.rotating) {
                  suppressClickUntil.current = Date.now() + 400;
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  } catch {
                    /* Some embedded browsers cancel capture during a page scroll. */
                  }
                  const next = horizonRotationForDrag({
                    startRotation: gesture.rotation,
                    dy,
                    height: gesture.height,
                  });
                  if (next !== rotation) onRotationChange(next);
                  return;
                }
                if (!gesture.dragging && Math.abs(dx) < 8) return;
                gesture.dragging = true;
                suppressClickUntil.current = Date.now() + 400;
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  /* Some embedded browsers cancel capture during a page scroll. */
                }
                onTimeChange(
                  horizonTimeIndex(
                    gesture.index,
                    dx,
                    gesture.width,
                    sampleCount,
                  ),
                );
              }
            : undefined
        }
        onPointerUp={(event) => {
          gestureRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          gestureRef.current = null;
        }}
        onClickCapture={(event) => {
          if (Date.now() < suppressClickUntil.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <svg
          className="planner-horizon-plot"
          viewBox={projection === "circular" ? "0 0 200 200" : "0 0 360 90"}
          preserveAspectRatio={
            projection === "circular" ? "xMidYMid meet" : "none"
          }
          role="img"
          aria-label={[
            pathLabel || message(locale, "plannerHorizonMaskPlot"),
            lightDescription,
          ]
            .filter(Boolean)
            .join(". ")}
        >
          {lightGrid && (
            <HorizonLightLayerImage
              grid={lightGrid}
              projection={projection}
              rotation={rotation}
            />
          )}
          {projection === "linear" ? (
            <>
              {[0, 15, 30, 45, 60, 75, 90].map((altitude) => (
                <line
                  className="planner-horizon-gridline"
                  key={altitude}
                  x1="0"
                  x2="360"
                  y1={90 - altitude}
                  y2={90 - altitude}
                />
              ))}
              {[0, 90, 180, 270, 360].map((azimuth) => (
                <line
                  className="planner-horizon-gridline is-vertical"
                  key={azimuth}
                  x1={azimuth}
                  x2={azimuth}
                  y1="0"
                  y2="90"
                />
              ))}
              <line
                className="planner-horizon-minimum-line"
                x1="0"
                x2="360"
                y1={90 - clamp(minAltitude, 0, 90)}
                y2={90 - clamp(minAltitude, 0, 90)}
              />
              {zenithAltitude !== null && (
                <line
                  className="planner-horizon-zenith-limit"
                  x1="0"
                  x2="360"
                  y1={90 - zenithAltitude}
                  y2={90 - zenithAltitude}
                >
                  <title>
                    {message(locale, "plannerHorizonZenithLimit").replace(
                      "{altitude}",
                      `${zenithAltitude}°`,
                    )}
                  </title>
                </line>
              )}
              <line
                className="planner-horizon-meridian"
                x1="180"
                x2="180"
                y1="0"
                y2="90"
              >
                <title>{message(locale, "plannerHorizonMeridianFlip")}</title>
              </line>
              <text className="planner-horizon-meridian-label" x="180" y="5">
                {message(locale, "plannerHorizonMeridian")}
              </text>
            </>
          ) : (
            <>
              {[0, 15, 30, 45, 60, 75, 90].map((altitude) => (
                <circle
                  className="planner-horizon-gridline"
                  key={altitude}
                  cx="100"
                  cy="100"
                  r={((90 - altitude) / 90) * 86}
                />
              ))}
              {[0, 15, 30, 45, 60, 75, 90].map((altitude) => {
                const radius = ((90 - altitude) / 90) * 86;
                const angle = (225 * Math.PI) / 180;
                return (
                  <text
                    className="planner-horizon-radial-label"
                    key={`altitude-${altitude}`}
                    x={100 + Math.cos(angle) * radius}
                    y={100 + Math.sin(angle) * radius}
                  >
                    {altitude}°
                  </text>
                );
              })}
              <circle
                className="planner-horizon-minimum-line"
                cx="100"
                cy="100"
                r={((90 - clamp(minAltitude, 0, 90)) / 90) * 86}
              />
              {zenithAltitude !== null && (
                <circle
                  className="planner-horizon-zenith-limit"
                  cx="100"
                  cy="100"
                  r={((90 - zenithAltitude) / 90) * 86}
                >
                  <title>
                    {message(locale, "plannerHorizonZenithLimit").replace(
                      "{altitude}",
                      `${zenithAltitude}°`,
                    )}
                  </title>
                </circle>
              )}
              <line
                className="planner-horizon-meridian"
                x1="100"
                x2={meridianOuter.x}
                y1="100"
                y2={meridianOuter.y}
              >
                <title>{message(locale, "plannerHorizonMeridianFlip")}</title>
              </line>
              <text
                className="planner-horizon-meridian-label"
                x={meridianLabel.x}
                y={meridianLabel.y}
              >
                {message(locale, "plannerHorizonMeridian")}
              </text>
              {[0, 90, 180, 270].map((azimuth) => {
                const outer = circularPoint(azimuth, 0);
                return (
                  <line
                    className="planner-horizon-gridline is-vertical"
                    key={azimuth}
                    x1="100"
                    x2={outer.x}
                    y1="100"
                    y2={outer.y}
                  />
                );
              })}
              {[
                { azimuth: 0, label: "N" },
                { azimuth: 90, label: "E" },
                { azimuth: 180, label: "S" },
                { azimuth: 270, label: "O" },
              ].map(({ azimuth, label }) => {
                const position = circularCardinalPoint(azimuth);
                return (
                  <text
                    className="planner-horizon-circular-cardinal"
                    key={label}
                    x={position.x}
                    y={position.y}
                  >
                    {horizonCardinalDirection(azimuth, locale)}
                  </text>
                );
              })}
            </>
          )}
          {hasMask && (
            <>
              <defs>
                {/* The mask is hatched as well as violet. The pattern is
                    drawn in pixels (rotated, then scaled back into the
                    plot's user space) so its lines stay at 45 degrees on the
                    stretched linear plot too. */}
                <pattern
                  id={hatchId}
                  className="planner-horizon-hatch"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform={`scale(${1 / plotScale.x} ${1 / plotScale.y}) rotate(45)`}
                >
                  <line x1="0" y1="0" x2="0" y2="6" />
                </pattern>
              </defs>
              <path
                className="planner-horizon-masked-area"
                d={projection === "circular" ? circularMaskedArea : maskedArea}
              />
              <path
                className="planner-horizon-masked-hatch"
                d={projection === "circular" ? circularMaskedArea : maskedArea}
                fill={`url(#${hatchId})`}
              />
            </>
          )}
          {pathLayer && <HorizonPathStrokes layer={pathLayer} />}
          {cards.map((card) => {
            const point = card.series[sampleIndex];
            if (!point || point.altitude < 0) return null;
            const state = horizonTargetState({
              point,
              mask,
              minAltitude,
              mountSafety,
            });
            const normallyUsable = state.usable;
            const blocked = state.blocked;
            const zenithBlocked = state.zenithBlocked;
            const position = cardPosition(card);
            const label = cardLabel(card);
            const labelPlacement = labelPlacements.get(card.target.id);
            const interactive = Boolean(onTargetSelect) && !printable;
            const selected = selectedTargetId === card.target.id;
            const select = () =>
              onTargetSelect?.(selected ? null : card.target.id);
            return (
              <g
                key={card.target.id}
                className={`planner-horizon-target-group${interactive ? " is-interactive" : ""}${zenithBlocked ? " is-zenith-blocked" : ""}${path ? " is-dimmed" : ""}`}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? label : undefined}
                onClick={
                  interactive
                    ? (event) => selectNearestTarget(event, card.target.id)
                    : undefined
                }
                onKeyDown={
                  interactive
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          select();
                        }
                      }
                    : undefined
                }
              >
                {interactive && (
                  <circle
                    className="planner-horizon-target-hit"
                    cx={position.x}
                    cy={position.y}
                    r={projection === "circular" ? "2.35" : "1.85"}
                  />
                )}
                <circle
                  className={`planner-horizon-target${
                    zenithBlocked
                      ? " is-zenith-blocked"
                      : blocked
                        ? " is-blocked"
                        : normallyUsable
                          ? " is-usable"
                          : ""
                  }${selected ? " is-selected" : ""}`}
                  cx={position.x}
                  cy={position.y}
                  r={projection === "circular" ? "1.65" : "1.25"}
                >
                  <title>{label}</title>
                </circle>
                {labelPlacement && (
                  <text
                    className="planner-horizon-target-label"
                    x={labelPlacement.rect.x}
                    // `<text>` is placed on its baseline, while the layout
                    // works in top-left rectangles.
                    y={labelPlacement.rect.y + horizonLabelAscent}
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
          {hasPolaris && (
            <circle
              className="planner-horizon-polaris"
              cx={
                projection === "circular"
                  ? circularPoint(0, polarisAltitude).x
                  : 0
              }
              cy={
                projection === "circular"
                  ? circularPoint(0, polarisAltitude).y
                  : 90 - clamp(polarisAltitude, 0, 90)
              }
              r={projection === "circular" ? "0.8" : "0.62"}
            >
              <title>{message(locale, "plannerHorizonNorthStar")}</title>
            </circle>
          )}
          {hasMask && (
            <path
              className="planner-horizon-profile"
              d={projection === "circular" ? circularProfilePath : profilePath}
            />
          )}
        </svg>
        {hasMask && maskLabel && !printable && (
          <span
            className="planner-horizon-mask-badge"
            title={message(locale, "plannerHorizonMaskActive").replace(
              "{name}",
              maskLabel,
            )}
          >
            {message(locale, "plannerHorizonMaskActive").replace(
              "{name}",
              maskLabel,
            )}
          </span>
        )}
        {pathLayer && (
          <HorizonPathMarkers
            layer={pathLayer}
            locale={locale}
            // The names of the plan's other targets: in the HTML layer, so the
            // linear plot's stretch leaves them readable.
            others={
              showLabels
                ? cards.flatMap((card) => {
                    const position = cardPosition(card);
                    const label = cardLabel(card);
                    return position && label
                      ? [{ id: card.target.id, label, ...position }]
                      : [];
                  })
                : []
            }
            timeZone={timeZone}
          />
        )}
        <HorizonPositionLabels placements={positionPlacements} />
        {!printable && Number.isFinite(Number(minAltitude)) && (
          // The minimum height's value beside its dotted line, in the line's
          // colour.
          <span
            className="planner-horizon-minimum-value"
            aria-hidden="true"
            style={
              projection === "circular"
                ? {
                    left: "50%",
                    top: `${(100 - ((90 - clamp(minAltitude, 0, 90)) / 90) * 86) / 2}%`,
                  }
                : {
                    left: 0,
                    top: `${((90 - clamp(minAltitude, 0, 90)) / 90) * 100}%`,
                  }
            }
          >
            {Math.round(Number(minAltitude))}°
          </span>
        )}
        {targetPreview}
        {!printable && timeLabel && (
          <output
            className="planner-horizon-clock"
            aria-label={message(locale, "plannerHorizonMaskTime")}
          >
            {timeLabel}
          </output>
        )}
      </div>
      {projection === "linear" && (
        <div className="planner-horizon-azimuth-axis" aria-hidden="true">
          <strong>{message(locale, "plannerHorizonAzimuthAxis")}</strong>
          <div>
            <span>N</span>
            <span>E</span>
            <span>S</span>
            <span>O</span>
            <span>N</span>
          </div>
        </div>
      )}
    </div>
  );
}

function HorizonProjectionControls({
  locale,
  projection,
  rotation,
  showLabels,
  sampleIndex,
  series,
  timeZone,
  setProjection,
  setRotation,
  setShowLabels,
  setSampleIndex,
}) {
  const previewTime = series[sampleIndex]?.time || null;
  return (
    <div className="planner-horizon-control-panel">
      <div className="planner-horizon-controls">
        <div
          className="planner-horizon-projection-switch"
          role="tablist"
          aria-label={message(locale, "plannerHorizonProjection")}
        >
          <button
            className={projection === "linear" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={projection === "linear"}
            onClick={() => setProjection("linear")}
          >
            {message(locale, "plannerHorizonProjectionLinear")}
          </button>
          <button
            className={projection === "circular" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={projection === "circular"}
            onClick={() => setProjection("circular")}
          >
            {message(locale, "plannerHorizonProjectionCircular")}
          </button>
        </div>
        <button
          className={`planner-mini-switch${showLabels ? " is-active" : ""}`}
          type="button"
          role="switch"
          aria-checked={showLabels}
          onClick={() => setShowLabels((current) => !current)}
        >
          <span aria-hidden="true" />
          {message(locale, "plannerHorizonLabels")}
        </button>
        {projection === "circular" && (
          <label className="planner-horizon-time-slider planner-horizon-orientation-slider">
            <span>{message(locale, "plannerHorizonOrientation")}</span>
            <input
              type="range"
              min="-180"
              max="180"
              step="5"
              value={rotation}
              onChange={(event) => setRotation(Number(event.target.value))}
            />
            <output className="planner-horizon-time">
              {rotation > 0 ? `+${rotation}°` : `${rotation}°`}
            </output>
          </label>
        )}
      </div>
      {series.length > 1 && (
        <label className="planner-horizon-time-slider planner-horizon-time-control">
          <span>{message(locale, "plannerHorizonMaskTime")}</span>
          <input
            type="range"
            min="0"
            max={series.length - 1}
            value={sampleIndex}
            onChange={(event) => setSampleIndex(Number(event.target.value))}
          />
          {previewTime && (
            <output className="planner-horizon-time">
              {time(previewTime, locale, timeZone)}
            </output>
          )}
        </label>
      )}
    </div>
  );
}

function PlannerHorizonProjection({
  controls,
  onControlsChange,
  addDisabledReason,
  cards,
  latitude,
  longitude,
  locale,
  mask,
  maskLabel,
  minAltitude,
  mountSafety,
  timeZone,
  selectedIds,
  selectedTargetId,
  onAdd,
  onRemove,
  onTargetSelect,
  canAdd,
  editable = true,
  visualMode = false,
  // The plan's targets, in the plan's order, as night cards — the chips
  // "Cible du trajet" of the path mode.
  planCards = [],
  // The night score of every card, to name the best-rated targets on the
  // "Positions" map.
  scores = null,
  // The chip "Horizon ▾" of the stage, first of the map's row.
  viewChip = null,
}) {
  const initialControls = useMemo(() => savedHorizonControls(), []);
  const values = { ...initialControls, ...controls };
  const projection = values.projection,
    rotation = values.rotation,
    showLabels = values.showLabels;
  const changeControl = (key, value) =>
    onControlsChange?.({
      [key]: typeof value === "function" ? value(values[key]) : value,
    });
  const setProjection = (value) => changeControl("projection", value);
  const setRotation = (value) => changeControl("rotation", value);
  const setShowLabels = (value) => changeControl("showLabels", value);
  const series = cards[0]?.series || [];
  const sampleIndex = Math.max(
    0,
    Math.min(
      series.length - 1,
      values.sampleIndex ?? closestCurrentTimeIndex(series, timeZone),
    ),
  );
  const setSampleIndex = (value) => changeControl("sampleIndex", value);
  const selectedCard = selectedTargetId
    ? cards.find((card) => card.target.id === selectedTargetId) || null
    : null;
  // Path mode: the night of one of the plan's targets. With no target in
  // the plan the switch is disabled and the map stays on positions; a
  // chosen target removed from the plan falls back to the selected one,
  // then to the plan's first (`horizonPathTargetId`).
  const pathModeReason = planCards.length
    ? null
    : message(locale, "horizonMapModeNoTarget");
  const mode = values.mode === "path" && !pathModeReason ? "path" : "positions";
  const pathTargetId = horizonPathTargetId({
    targetIds: planCards.map((card) => card.target.id),
    pathTargetId: values.pathTargetId,
    selectedTargetId,
  });
  const pathCard =
    mode === "path"
      ? planCards.find((card) => card.target.id === pathTargetId) || null
      : null;
  const pathTickOffset = zoneOffsetMinutes(
    pathCard?.series?.[0]?.time,
    validTimeZone(timeZone),
  );
  const path = useMemo(
    () =>
      pathCard
        ? targetNightPath({
            series: pathCard.series || [],
            mask,
            minAltitude: Number(minAltitude),
            moonSeparationMinimum:
              pathCard.constraints?.moonSeparationMinimum ?? 0,
            mountSafety,
            tickOffsetMinutes: pathTickOffset,
          })
        : null,
    [pathCard, mask, minAltitude, mountSafety, pathTickOffset],
  );
  const pathName = pathCard ? horizonPathCardLabel(pathCard) : "";
  // The panel "Calques": the mask of the place and the light pollution by
  // direction (an estimate, off by default). The grid is asked for when the
  // panel opens or the layer is on, kept in memory only.
  const layers = normalizePlanHorizonLayers(values.layers);
  const setLayer = (name, on) =>
    changeControl("layers", { ...layers, [name]: on });
  const [layersOpen, setLayersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lightRequest, setLightRequest] = useState({ status: "idle" });
  const hasPlace =
    String(latitude ?? "").trim() !== "" &&
    String(longitude ?? "").trim() !== "" &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude));
  const wantsLight = layersOpen || layers.lightPollution;
  useEffect(() => {
    if (!wantsLight) return undefined;
    if (!hasPlace) {
      setLightRequest({ status: "no-place" });
      return undefined;
    }
    const controller = new AbortController();
    setLightRequest((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );
    requestPlannerSkyDirection(
      { latitude: Number(latitude), longitude: Number(longitude) },
      { signal: controller.signal },
    )
      .then((grid) => setLightRequest({ status: "ready", grid }))
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setLightRequest({ status: "unavailable" });
      });
    return () => controller.abort();
  }, [wantsLight, hasPlace, latitude, longitude]);
  const light = horizonLightLayerState({
    enabled: layers.lightPollution,
    request: lightRequest,
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        horizonControlsStorageKey,
        JSON.stringify({ projection, rotation, showLabels }),
      );
    } catch {
      // These display preferences remain usable for the current visit.
    }
  }, [projection, rotation, showLabels]);

  // "Calques" carries its dot while a layer is on — the place's mask drawn,
  // or the light pollution's colours — never because its dialog is open.
  const layersActive = (Boolean(maskLabel) && layers.mask) || light.drawn;

  return (
    <section
      className="planner-horizon-map"
      aria-label={message(locale, "plannerHorizonProjection")}
    >
      {/* One row of chips, the settings icon at its end, the map right
          under it. */}
      <MapControlsRow
        settings={
          <MapSettingsButton
            locale={locale}
            open={settingsOpen}
            onOpen={() => setSettingsOpen(true)}
          />
        }
      >
        {viewChip}
        <MapMenuChip
          className="planner-map-chip-mode"
          label={message(
            locale,
            mode === "path" ? "horizonMapModePath" : "horizonMapModePositions",
          )}
          glyph={mode === "path" ? "path" : "positions"}
          menuLabel={message(locale, "horizonMapMode")}
          value={mode}
          items={[
            {
              value: "positions",
              label: message(locale, "horizonMapModePositions"),
              glyph: "positions",
            },
            {
              value: "path",
              label: message(locale, "horizonMapModePath"),
              glyph: "path",
            },
          ]}
          reason={pathModeReason}
          onSelect={(value) => changeControl("mode", value)}
        />
        <HorizonLayersChip
          locale={locale}
          open={layersOpen}
          active={layersActive}
          onOpen={() => setLayersOpen(true)}
        />
      </MapControlsRow>
      <HorizonProjectionCanvas
        cards={
          path
            ? planCards.filter((card) => card.target.id !== pathTargetId)
            : cards
        }
        path={path}
        pathSampleTime={path ? series[sampleIndex]?.time || null : null}
        pathLabel={
          path
            ? message(
                locale,
                projection === "circular"
                  ? "horizonPathPlotCircular"
                  : "horizonPathPlot",
              ).replace("{target}", pathName)
            : null
        }
        timeZone={timeZone}
        latitude={latitude}
        locale={locale}
        mask={mask}
        maskLabel={maskLabel}
        showMask={layers.mask}
        lightGrid={light.drawn ? lightRequest.grid : null}
        minAltitude={minAltitude}
        mountSafety={mountSafety}
        projection={projection}
        rotation={rotation}
        sampleIndex={sampleIndex}
        showLabels={showLabels}
        selectedIds={selectedIds}
        labelScores={scores}
        selectedTargetId={path ? null : selectedTargetId}
        // In path mode a tap on one of the plan's other targets draws its
        // night instead.
        onTargetSelect={
          path
            ? (id) => {
                if (id) changeControl("pathTargetId", id);
              }
            : onTargetSelect
        }
        timeLabel={
          series[sampleIndex]?.time
            ? time(series[sampleIndex].time, locale, timeZone)
            : null
        }
        sampleCount={series.length}
        onTimeChange={setSampleIndex}
        onRotationChange={setRotation}
        targetPreview={
          selectedCard && !path ? (
            <HorizonTargetPreview
              addDisabledReason={addDisabledReason}
              card={selectedCard}
              canAdd={canAdd}
              editable={editable}
              locale={locale}
              onAdd={onAdd}
              onRemove={onRemove}
              selected={Boolean(selectedIds?.has(selectedCard.target.id))}
              timeZone={timeZone}
              visualMode={visualMode}
            />
          ) : null
        }
      />
      {/* While the light layer is on its legend follows the frame, so the
          colour reads without opening « Calques ». */}
      {light.drawn && (
        <div
          className="planner-horizon-layer-legend is-under-map"
          aria-hidden="true"
        >
          <div style={{ background: horizonLightLegendGradient }} />
          <p>
            <span>{message(locale, "horizonLayerDarker")}</span>
            <span>{message(locale, "horizonLayerBrighter")}</span>
          </p>
        </div>
      )}
      {/* Under the map: the list of targets first … */}
      {path && (
        <HorizonPathTargetChips
          cards={planCards}
          locale={locale}
          selectedId={pathTargetId}
          onSelect={(id) => changeControl("pathTargetId", id)}
        />
      )}
      {/* … then the messages: « Une ligne, puis ⓘ » (log 18:10), the
          registered horizon in one line… */}
      <InfoLine
        className="planner-horizon-map-help"
        locale={locale}
        text={message(locale, "horizonMapHelpLine")}
        label={flow(locale, "horizonMapHelp")}
        title={message(locale, "plannerHorizonProjection")}
        body={flow(locale, "horizonMapHelp")}
        testId="planner-horizon-map-help-info"
      />
      {/* … the horizontal drag that changes the hour… */}
      {series.length > 1 && (
        <p className="planner-horizon-gesture-hint">
          <span aria-hidden="true">↔</span>
          {flow(locale, "horizonTimeHint")}
        </p>
      )}
      {/* … and the vertical drag that turns the circular sky, its side
          bands told by the ⓘ. */}
      {projection === "circular" && (
        <div className="planner-horizon-gesture-hint is-rotate">
          <span aria-hidden="true">⇅</span>
          <p>{flow(locale, "horizonRotateHint")}</p>
          <InfoButton
            locale={locale}
            label={message(locale, "horizonRotateHintInfoLabel")}
            title={message(locale, "plannerHorizonProjection")}
            body={flow(locale, "horizonRotateHintInfo")}
            testId="planner-horizon-rotate-hint-info"
          />
        </div>
      )}
      {path && (
        <>
          <HorizonPathLegend
            locale={locale}
            path={path}
            timeZone={timeZone}
            minAltitude={Number(minAltitude)}
          />
          <HorizonPathCard
            card={pathCard}
            locale={locale}
            summary={horizonPathSummary(path, {
              minAltitude: Number(minAltitude),
            })}
            nightEnd={path.end}
            timeZone={timeZone}
          />
        </>
      )}
      {layersOpen && (
        <HorizonLayersPanel
          locale={locale}
          onClose={() => setLayersOpen(false)}
          maskOn={layers.mask}
          maskLabel={maskLabel}
          onMaskChange={(on) => setLayer("mask", on)}
          light={light}
          onLightChange={(on) => setLayer("lightPollution", on)}
        />
      )}
      {settingsOpen && (
        <WebDialog
          className="planner-map-settings-dialog"
          closeLabel={message(locale, "plannerMapSettingsClose")}
          closeOnBackdrop
          onClose={() => setSettingsOpen(false)}
          title={message(locale, "plannerMapSettings")}
          titleAs="h3"
        >
          <HorizonProjectionControls
            locale={locale}
            projection={projection}
            rotation={rotation}
            showLabels={showLabels}
            sampleIndex={sampleIndex}
            series={series}
            timeZone={timeZone}
            setProjection={setProjection}
            setRotation={setRotation}
            setShowLabels={setShowLabels}
            setSampleIndex={setSampleIndex}
          />
        </WebDialog>
      )}
    </section>
  );
}

function PrintableHorizonProjection({
  cards,
  latitude,
  locale,
  mask,
  minAltitude,
  projectionState,
}) {
  return (
    <section className="planner-print-horizon-projection">
      <HorizonProjectionCanvas
        cards={cards}
        latitude={latitude}
        locale={locale}
        mask={mask}
        minAltitude={minAltitude}
        projection={projectionState.projection}
        rotation={projectionState.rotation}
        sampleIndex={projectionState.sampleIndex}
        showLabels={projectionState.showLabels}
        printable
      />
    </section>
  );
}

function PlannerCalendarMonth({
  locale,
  month,
  plans,
  year,
  selectedDate,
  onSelectDate,
}) {
  const today = new Date();
  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const plansByDay = new Map();
  plans
    .filter((plan) => Number(plan.date.slice(5, 7)) === month + 1)
    .forEach((plan) => {
      const day = Number(plan.date.slice(8, 10));
      plansByDay.set(day, [...(plansByDay.get(day) || []), plan]);
    });
  return (
    <article
      className={`planner-calendar-month${isCurrentMonth ? " is-current-month" : ""}`}
    >
      <h3>{monthLabel(month, year, locale)}</h3>
      <div className="calendar-weekdays" aria-hidden="true">
        {weekdayLabels(locale).map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="calendar-days">
        {Array.from({ length: firstWeekday }, (_, index) => (
          <span className="calendar-day is-empty" key={`empty-${index}`} />
        ))}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const dayPlans = plansByDay.get(day) || [];
          const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = isCurrentMonth && day === today.getDate();
          return dayPlans.length ? (
            <button
              className={`calendar-day has-session has-plan${
                selectedDate === date ? " is-selected" : ""
              }${isToday ? " is-today" : ""}`}
              type="button"
              key={day}
              data-date={date}
              title={`${dateLabel(date, locale)} · ${dayPlans.length} ${message(locale, "plannerSessionPlans")} · ${[...new Set(dayPlans.map(planStatus))].map((status) => message(locale, `plannerPlanStatus${status[0].toUpperCase()}${status.slice(1)}`)).join(", ")}`}
              onClick={() => onSelectDate(date)}
              aria-expanded={selectedDate === date}
            >
              <span className="planner-calendar-day-number">{day}</span>
              <span className="planner-calendar-day-indicators">
                <strong>{dayPlans.length}</strong>
                <span
                  className="planner-calendar-status-dots"
                  aria-hidden="true"
                >
                  {[...new Set(dayPlans.map(planStatus))].map((status) => (
                    <i className={`is-${status}`} key={status} />
                  ))}
                </span>
              </span>
            </button>
          ) : (
            <span
              className={`calendar-day${isToday ? " is-today" : ""}`}
              key={day}
            >
              {day}
            </span>
          );
        })}
      </div>
    </article>
  );
}

function PlannerCalendarPlansPanel({ locale, date, plans, children }) {
  return (
    <section className="planner-calendar-plans-panel" aria-live="polite">
      <div className="planner-calendar-plans-heading">
        <div>
          <p className="eyebrow">{dateLabel(date, locale)}</p>
          <h3>{message(locale, "plannerCalendarSelectedPlans")}</h3>
        </div>
        <p>
          {plans.length} {message(locale, "plannerSessionPlans")}
        </p>
      </div>
      <div className="planner-calendar-plans-list">{children}</div>
    </section>
  );
}

function PlannerLibraryAction({ icon, label, onClick }) {
  const paths = {
    edit: (
      <>
        <path d="m4 16.5-.8 4.3 4.3-.8L19.3 8.2l-3.5-3.5L4 16.5Z" />
        <path d="m13.8 6.7 3.5 3.5" />
      </>
    ),
    execute: <path d="m5 12.5 4.2 4.2L19.5 6.5" />,
    abandon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m7 7 10 10" />
      </>
    ),
    archive: (
      <>
        <path d="M4 8h16v11H4z" />
        <path d="M3 5h18v3H3zM9 13h6" />
      </>
    ),
    delete: (
      <>
        <path d="M5 7h14M10 11v5M14 11v5M8 7l.8-3h6.4l.8 3M7 7l.8 13h8.4L17 7" />
      </>
    ),
    restore: (
      <>
        <path d="M5 10V5h5" />
        <path d="M5.5 6.5A8 8 0 1 1 4.2 14" />
      </>
    ),
    snapshot: (
      <>
        <path d="M5 8.5h2.6L9 6h6l1.4 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z" />
        <circle cx="12" cy="14" r="3.2" />
      </>
    ),
    export: (
      <>
        <path d="M12 3v11M8 10l4 4 4-4M5 18.5h14" />
      </>
    ),
  };
  return (
    <button
      className={`planner-library-action is-${icon}`}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {paths[icon]}
      </svg>
    </button>
  );
}

// The sticky bar of the page (the titles of the section being read stick
// right below the header: always one bar, whole, right under what is
// stuck at the top of the page, naming the stage being read). One bar per
// stage -- the stage's number and title -- all in one fixed container that
// takes no room in the page. `observeStageCrumbs` (`stage-crumb.js`) shows the
// one stage whose title has last passed the line, places the container on that
// line, and fades it in and out; the bar itself never moves with the scroll.
//
// A click on the bar scrolls the page, smoothly, to the start of the stage --
// its title on the line -- and does nothing else (`scrollToStageTitle`): it
// used to fold or unfold the stage as well, and a page moving
// with nothing else said was unintelligible. The fold stays on the
// stage's own heading. The bar is a button that says where it leads ("Go to
// the start of section ...", in its aria-label); it is not a copy of the
// heading, so it is left in the accessibility tree -- only the bar of the
// stage being read is ever displayed, the others are `display: none`.
//
// What it does NOT repeat is a stage's short summary (the equipment name, the
// constraints line, the folded place line): the summary stays in the stage's
// heading, where it has always been. Nor the plan's name and mode: the plan
// tabs just above it are sticky too (`.planner-night-tabs-row`) and already
// say which plan this is.
function StageCrumbs({ locale, stages }) {
  return (
    <div className="planner-stage-crumbs">
      {stages.map(({ step, title }) => (
        <button
          className="planner-stage-crumb-bar"
          data-step={step}
          key={step}
          type="button"
          aria-label={flow(locale, "stageCrumbLabel").replace("{title}", title)}
          onClick={() => scrollToStageTitle(step)}
        >
          <span className="planner-step-number">{step}</span>
          <span className="planner-stage-crumb-title">{title}</span>
        </button>
      ))}
    </div>
  );
}

// The chip of a plan in the library: one of the six statuses of
// `planLibraryStatus`. The word carries the state; the colour only repeats it.
function PlannerPlanStatus({ locale, status }) {
  return (
    <span
      className={`planner-plan-status is-${status}`}
      data-plan-status={status}
    >
      {message(locale, planLibraryStatusKey(status))}
    </span>
  );
}

const libraryFromAddress = () => {
  if (typeof window === "undefined")
    return { main: "to_execute", filters: noPlanFilters };
  return planFiltersFromAddress(window.location.search, planLibraryStatuses);
};
const writeLibraryToAddress = (state) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const name of ["main", "year", "status"]) url.searchParams.delete(name);
  for (const [name, value] of planFiltersToAddress(state))
    url.searchParams.set(name, value);
  window.history.replaceState({}, "", url);
};

function plannerPlanReadOnlyMessage(locale, status) {
  const key = `plannerPlanReadOnly${status[0].toUpperCase()}${status.slice(1)}`;
  return message(locale, key);
}

function plannerPlanDeleteDescription(plan, locale) {
  const count = planTargetCount(plan);
  const quantity = count === 0 ? "Zero" : count === 1 ? "One" : "Many";
  // The plan goes to the trash of « Mon espace » for 30 days
  // (SPACE-DATA-MANAGE-01): the dialog says where, no longer « irréversible ».
  return `${message(locale, `plannerPlanDeleteDescription${quantity}`)
    .replace("{name}", plan?.name || message(locale, "plannerUntitledPlan"))
    .replace("{count}", String(count))}${sentenceSeparator(locale)}${message(
    locale,
    "spacePlanDeleteTrash",
  ).replace("{days}", "30")}`;
}

function PlannerLibrary({
  locale,
  plans,
  unsyncedLabel,
  // "· plan multi-nuits NGC 7000" under a plan that holds a night of a
  // multi-night plan, when those are shown, and the switch "Une nuit |
  // Multi-nuits" first.
  bandFor = null,
  kindSwitch = null,
  // The name the planner resolves for a plan's
  // equipment, for the rows of "détails".
  rigFor = () => "",
  // The equipment sets, to score the targets of
  // a plan's dialog for their slot.
  profileSets = null,
  // What the space's Journal
  // says of each plan, by the planner's plan id (`plan-sessions.js`): its
  // session, and whether its debriefing is still to be done.
  sessions = new Map(),
  onArchive,
  onDelete,
  onEdit,
  onSetStatus,
  // "Prise de vue par cible": the filters the person owns, the place's sky
  // as the sky-brightness rule shows it (`skySqmFor(place, model)`: the
  // measured or typed value, else the estimate `model`) and the two writes
  // of a plan's lines from its dialog.
  ownedFilters = [],
  skySqmFor = () => null,
  // The sky the visual limit of a plan's targets reads (`{ sqm, bortleClass }`
  // of the plan's place), or null: the dark-sky limit.
  visualSkyFor = () => null,
  onAcquisitionDefaults = () => {},
  onAcquisitionItem = () => {},
  // The plan's dialog exports the plan as it is (the planner's export menu,
  // for this plan id), whatever its state.
  onExport = () => {},
  // The Journal changed (a session recreated from a plan).
  onSessionsChanged = () => {},
  // The plans whose night runs on a phone, `{ [planId]: { state } }`: "Nuit
  // en cours", read-only; "Supprimer" says why it is refused.
  executionByPlanId = {},
  onRunningRefusal = () => {},
}) {
  // A click on a card opens the plan's dialog.
  const [openedPlanId, setOpenedPlanId] = useState(null);
  const openedPlan = openedPlanId
    ? plans.find((plan) => plan.id === openedPlanId) || null
    : null;
  // The sky of the opened plan's place: the estimate is asked once per place
  // (the page's own request is shared), the measured or typed value wins.
  const openedCoordinates = openedPlan
    ? locationCoordinates(openedPlan.location)
    : null;
  const openedSkyKey = openedCoordinates
    ? `${openedCoordinates.latitude},${openedCoordinates.longitude}`
    : "";
  const [openedSkyModel, setOpenedSkyModel] = useState({
    key: "",
    value: null,
  });
  useEffect(() => {
    if (!openedSkyKey) return undefined;
    const controller = new AbortController();
    requestPlannerSkyQuality(openedCoordinates, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted)
          setOpenedSkyModel({ key: openedSkyKey, value });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setOpenedSkyModel({ key: openedSkyKey, value: null });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedSkyKey]);
  const openedAcquisition =
    openedPlan &&
    (openedPlan.equipment?.mode ?? "imaging") !== "visual" &&
    planStatus(openedPlan) === "pending" &&
    !planExecutionOf(executionByPlanId, openedPlan)
      ? {
          basis: acquisitionBasisOf({
            plan: openedPlan,
            profileSets,
            ownedFilters,
            sqm: skySqmFor(
              openedPlan.location,
              openedSkyModel.key === openedSkyKey ? openedSkyModel.value : null,
            ),
          }),
          onWriteDefaults: (line) => onAcquisitionDefaults(openedPlan.id, line),
          onWriteItemLine: (itemId, line) =>
            onAcquisitionItem(openedPlan.id, itemId, line),
        }
      : null;
  // A main filter
  // of two values, "À exécuter" / "Exécutés", and a "Filtres" button
  // (the year, "Toutes" by default, and the statuses, several at once);
  // abandoned and archived plans are listed only by their status. All of it
  // lives in the address (`?main=executed&year=2026&status=abandoned`).
  const [libraryState, setViewState] = useState(libraryFromAddress);
  const { main, filters } = libraryState;
  const changeView = (next) => {
    setViewState(next);
    writeLibraryToAddress(next);
  };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recreating, setRecreating] = useState(null);
  const [view, setView] = useState("list");
  // The calendar has no main filter; its own statuses (six,
  // the same preselection) are kept apart from the list's, the year is shared
  // (the web shows the whole year, its choice stays in "Filtres").
  const [calendarStatuses, setCalendarStatuses] = useState(null);
  const calendarView = view === "calendar";
  const barMain = calendarView ? null : main;
  const barFilters = calendarView
    ? { year: filters.year, statuses: calendarStatuses }
    : filters;
  const toDebriefOf = (plan) => planToDebrief(sessions.get(plan.id));
  const passes = (plan, nextFilters = barFilters, nextMain = barMain) =>
    planPassesFilters(plan, {
      toDebrief: toDebriefOf(plan),
      main: nextMain,
      filters: nextFilters,
    });
  const yearsOf = (nextMain) =>
    [
      ...new Set(
        plans
          .filter((plan) =>
            planPassesFilters(plan, {
              toDebrief: toDebriefOf(plan),
              main: nextMain,
              filters: { ...barFilters, year: null },
            }),
          )
          .map((plan) => plan.date.slice(0, 4)),
      ),
    ].sort((left, right) => right.localeCompare(left));
  const allYears = [
    ...new Set(plans.map((plan) => plan.date.slice(0, 4))),
  ].sort((left, right) => right.localeCompare(left));
  const shownPlans = plans.filter((plan) => passes(plan));
  const years = useMemo(
    () => yearsOf(barMain),
    [plans, sessions, barMain, barFilters.year, barFilters.statuses],
  );
  const [selectedDate, setSelectedDate] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [calendarColumns, setCalendarColumns] = useState(3);
  useEffect(() => {
    const compact = window.matchMedia("(max-width: 850px)");
    const narrow = window.matchMedia("(max-width: 480px)");
    const updateColumns = () =>
      setCalendarColumns(narrow.matches ? 1 : compact.matches ? 2 : 3);
    updateColumns();
    compact.addEventListener("change", updateColumns);
    narrow.addEventListener("change", updateColumns);
    return () => {
      compact.removeEventListener("change", updateColumns);
      narrow.removeEventListener("change", updateColumns);
    };
  }, []);
  // The calendar is the calendar of one year: the one chosen in "Filtres",
  // else the most recent the list holds.
  const calendarYear = filters.year ?? years[0] ?? allYears[0] ?? "";
  const visiblePlans = [...shownPlans].sort((left, right) =>
    right.date.localeCompare(left.date),
  );
  const calendarPlans = shownPlans
    .filter((plan) => plan.date.startsWith(calendarYear))
    .sort((left, right) => left.date.localeCompare(right.date));
  // The plans as a frise: in the list view and the open archives only, never
  // in the calendar view; one hour scale for the plans of the list; the
  // planner's own heights, once per version of each plan. The three-icon
  // control of "Cette nuit" and Planifier, on the list (compact, détails,
  // frise).
  const [targetView, setTargetView] = usePlanTargetView();
  const friseShown = targetView === "frise" && view === "list";
  const detailsShown = targetView === "details" && view === "list";
  // The pictures of the targets the cards of « détails » draw, as the cards
  // of the catalogue have them: one request for the whole list, the pictogram
  // until then and where the catalogue has none.
  const detailsIdsKey = detailsShown
    ? plansTargetIds(visiblePlans, planDetailsThumbnails).join(",")
    : "";
  const [detailsPictures, setDetailsPictures] = useState(() => new Map());
  useEffect(() => {
    const ids = detailsIdsKey ? detailsIdsKey.split(",") : [];
    if (!ids.length) return undefined;
    const controller = new AbortController();
    loadPlanTargetPictures({ locale, ids, signal: controller.signal }).then(
      (rows) => {
        if (!controller.signal.aborted) setDetailsPictures(rows);
      },
    );
    return () => controller.abort();
  }, [locale, detailsIdsKey]);
  const friseFor = useMemo(() => {
    if (!friseShown) return () => null;
    const listed = visiblePlans;
    const inputs = new Map(
      listed.map((plan) => [plan.id, planFriseInput(plan)]),
    );
    const scale = planFriseScale([...inputs.values()].filter(Boolean));
    const frises = new Map();
    for (const [id, input] of inputs)
      if (input) frises.set(id, planFriseOf(input, { scale }));
    return (plan) => frises.get(plan.id) ?? null;
  }, [friseShown, plans, filters, main]);
  const selectedPlans = selectedDate
    ? calendarPlans.filter((plan) => plan.date === selectedDate)
    : [];
  const selectDate = (date) => setSelectedDate(date);
  // A touch on a date scrolls the page by the smallest
  // offset that shows the date's line and the card of its plans.
  useEffect(() => {
    if (!selectedDate) return;
    revealSelection(
      document.querySelector(
        `.planner-year-calendar button[data-date="${selectedDate}"]`,
      ),
      document.querySelector(".planner-calendar-plans-panel"),
    );
  }, [selectedDate]);
  const requestStatus = (plan, status) => {
    if (status === "executed") {
      onSetStatus(plan.id, status);
      return;
    }
    setConfirmation({ action: "abandon", plan, status });
  };
  const confirmAction = () => {
    if (!confirmation) return;
    if (confirmation.action === "abandon")
      onSetStatus(confirmation.plan.id, confirmation.status);
    if (confirmation.action === "archive") onArchive(confirmation.plan.id);
    if (confirmation.action === "delete") {
      onDelete(confirmation.plan.id);
      // The plan's dialog closes with its plan.
      if (confirmation.plan.id === openedPlanId) setOpenedPlanId(null);
    }
    if (confirmation.action === "restore")
      onSetStatus(confirmation.plan.id, "pending");
    setConfirmation(null);
  };
  const nameOf = (plan) => plan.name || message(locale, "plannerUntitledPlan");
  const actionCopy = confirmation
    ? {
        abandon: {
          title: message(locale, "plannerPlanAbandonTitle"),
          description: message(locale, "plannerPlanAbandonDescription").replace(
            "{name}",
            nameOf(confirmation.plan),
          ),
          confirmLabel: message(locale, "plannerPlanAbandon"),
        },
        archive: {
          title: message(locale, "plannerPlanArchiveTitle"),
          // An executed plan is only put aside, and says that its
          // session stays where it is.
          description: [
            message(locale, "planArchiveConfirmBody").replace(
              "{name}",
              nameOf(confirmation.plan),
            ),
            sessions.get(confirmation.plan.id)?.sessionId
              ? message(locale, "planArchiveConfirmSessionStays")
              : null,
          ]
            .filter(Boolean)
            .join(" "),
          confirmLabel: message(locale, "plannerPlanArchive"),
        },
        delete: {
          title: message(locale, "plannerPlanDeleteTitle"),
          description: plannerPlanDeleteDescription(confirmation.plan, locale),
          confirmLabel: message(locale, "plannerDeletePlan"),
        },
        restore: {
          title: message(locale, "plannerPlanRestoreTitle"),
          description: message(locale, "plannerPlanRestoreDescription").replace(
            "{name}",
            nameOf(confirmation.plan),
          ),
          confirmLabel: message(locale, "plannerPlanRestore"),
        },
      }[confirmation.action]
    : null;
  /** What each action of a plan does (the card's ⋯ menu and the plan's dialog). */
  const runAction = (plan, action) => {
    // The night of this plan runs on a phone — nothing is removed, and the
    // refusal is read in words (the service refuses it too).
    if (action === "delete" && planExecutionOf(executionByPlanId, plan))
      onRunningRefusal(plan);
    else if (action === "edit") {
      setOpenedPlanId(null);
      onEdit(plan.id);
    } else if (action === "export") onExport(plan.id);
    else if (action === "execute") requestStatus(plan, "executed");
    else if (action === "abandon") requestStatus(plan, "abandoned");
    else if (["archive", "delete", "restore"].includes(action))
      setConfirmation({ action, plan });
  };
  const ACTION_WORDS = {
    edit: "plannerEditPlan",
    execute: "plannerPlanExecute",
    abandon: "plannerPlanAbandon",
    debrief: "journalDebriefSession",
    session: "planSeeSession",
    restore: "plannerPlanRestore",
    archive: "plannerPlanArchive",
    delete: "plannerDeletePlan",
  };
  /** The facts one plan's actions rest on. */
  const factsOf = (plan) => {
    const entry = sessions.get(plan.id) ?? null;
    const live = entry?.state === "missing" ? null : entry;
    return {
      entry,
      // A pending night done without the application, to be declared
      // afterwards (no session of its own).
      declared:
        planStatus(plan) === "pending" &&
        planToDebrief(live) &&
        !live?.sessionId,
      toDebrief: planToDebrief(live),
      href: planSessionHref(locale, live),
      // A plan whose night has not begun is neither marked executed nor
      // abandoned (the service refuses it too).
      nightAhead: planNightIsAhead({
        date: plan.date,
        location: plan.location ?? null,
        darkness: plan.darkness,
      }),
    };
  };
  const actionsOf = (plan) => {
    const facts = factsOf(plan);
    return planActionsOf(plan, {
      toDebrief: facts.toDebrief,
      nightAhead: facts.nightAhead,
      hasSession: Boolean(facts.href),
      declared: facts.declared,
      running: Boolean(planExecutionOf(executionByPlanId, plan)),
    });
  };
  const menuItemsOf = (plan) => {
    const { keep, remove } = actionsOf(plan);
    const { href } = factsOf(plan);
    const item = (action, extra = {}) => ({
      key: action,
      label: message(
        locale,
        action === "debrief"
          ? planDebriefWordKey(factsOf(plan).declared)
          : ACTION_WORDS[action],
      ),
      ...(action === "debrief" || action === "session"
        ? { href }
        : { onSelect: () => runAction(plan, action) }),
      ...extra,
    });
    return [
      ...keep.map((action) => item(action)),
      ...remove.map((action, index) =>
        item(action, {
          destructive: action === "delete",
          separatorBefore: index === 0 && keep.length > 0,
        }),
      ),
    ];
  };
  const recreateSession = async (plan) => {
    const serverId = factsOf(plan).entry?.planId;
    if (!serverId) return;
    setRecreating(plan.id);
    try {
      const response = await requestJson(
        `/api/v1/plans/${encodeURIComponent(serverId)}/session`,
        { method: "POST", body: {} },
      );
      if (response.ok) onSessionsChanged();
    } finally {
      setRecreating(null);
    }
  };
  // `compact`, a night inside the group of its multi-night plan — its
  // name, its date, one tag ("À débriefer" before "Exécuté"), its
  // targets in "Détails", its frise; its ⋯ as everywhere.
  const planCard = (plan, { listed = false, compact = false } = {}) => {
    const status = planStatus(plan);
    const archived = status === "archived";
    const facts = factsOf(plan);
    // A plan not ready to be lived says "Brouillon".
    const allTags = planDisplayTags(
      plan,
      planStatusTags(plan, { toDebrief: facts.toDebrief }),
    );
    const tags = compact
      ? [allTags.includes("toDebrief") ? "toDebrief" : allTags[0]].filter(
          Boolean,
        )
      : allTags;
    const frise = listed ? friseFor(plan) : null;
    const execution = planExecutionOf(executionByPlanId, plan);
    // The time left before the night of a plan still ahead.
    const timeLeft =
      status === "pending" && !execution
        ? planTimeLeftText(
            locale,
            planTimeLeft({
              date: plan.date,
              location: plan.location ?? null,
              darkness: plan.darkness,
            }),
          )
        : null;
    return (
      <article
        className={`planner-library-card is-openable${compact ? " is-compact" : ""}`}
        key={plan.id}
        data-plan-id={plan.id}
        onClick={(event) => {
          // A click on the card opens the plan's dialog; its own
          // controls keep their action.
          if (event.target.closest?.(".action-menu")) return;
          if (event.target.closest?.(".planner-library-card-open")) return;
          if (event.target.closest?.(".status-tag")) return;
          setOpenedPlanId(plan.id);
        }}
      >
        <div>
          <div className="planner-library-card-head">
            <div className="planner-library-card-heading">
              <p className="eyebrow">
                {dateLabel(plan.date, locale)}
                {timeLeft && (
                  <span className="planner-library-time-left">
                    {" "}
                    · {timeLeft}
                  </span>
                )}
              </p>
              <h3>
                <button
                  type="button"
                  className="planner-library-card-open"
                  onClick={() => setOpenedPlanId(plan.id)}
                >
                  {nameOf(plan)}
                </button>
              </h3>
            </div>
            {/* The upper right corner carries the sign of an
                unsynchronised plan and the ⋯ menu that replaces the buttons
                of the card (no swipe on the web), nothing else; the tags take
                their own line under the title, on the whole width. */}
            <div className="planner-library-card-corner">
              {isBrowserPlan(plan) && (
                <span className="planner-plan-status is-unsynced">
                  {unsyncedLabel}
                </span>
              )}
              <ActionMenu
                label={`${message(locale, "plannerPlanMenuOpen")} — ${nameOf(plan)}`}
                items={menuItemsOf(plan)}
              />
            </div>
          </div>
          <div className="planner-library-card-tags">
            {execution ? (
              <PlanExecutionTag locale={locale} execution={execution} />
            ) : (
              tags.map((tag) => (
                <StatusTag
                  key={tag}
                  tone={tag}
                  locale={locale}
                  data-plan-status={tag}
                />
              ))
            )}
          </div>
          {execution ? (
            <PlanExecutionWhere
              locale={locale}
              execution={execution}
              data-testid="plan-card-execution-where"
            />
          ) : null}
          {compact ? (
            listed &&
            detailsShown && (
              <p className="planner-library-night-targets">
                {[
                  ...new Set(
                    plan.items.map((item) => planItemTargetName(item)),
                  ),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )
          ) : (
            <>
              <p>
                {planTargetCount(plan)}{" "}
                {message(locale, "plannerPlannedTargets")}
                {plan.location?.name ? ` · ${plan.location.name}` : ""}
              </p>
              {bandFor?.(plan) && (
                <p className="multi-night-plan-band">{bandFor(plan)}</p>
              )}
            </>
          )}
          {listed && detailsShown && !compact && (
            <PlanDetailsRows
              locale={locale}
              plan={plan}
              rigName={rigFor(plan)}
              pictures={detailsPictures}
              clock={(value) =>
                placeClock(value, locale, plan.location?.timeZone)
              }
            />
          )}
          {frise && (
            <PlanFrise
              frise={frise}
              locale={locale}
              clock={(value) =>
                placeClock(value, locale, plan.location?.timeZone)
              }
              variant="reduced"
            />
          )}
        </div>
      </article>
    );
  };
  // A multi-night plan is
  // one card of the list, its nights inside, never twice. Its header reads
  // the Journal's group of the plan (`GET /v1/journal`, `groups[]`): its
  // state, its progress, its nights to debrief, the whole plan's.
  const groupCard = (entry) => {
    const group = sessions.groups?.get(entry.projectId) ?? null;
    const first = entry.nights[0];
    const item = first.items.find((each) => each.projectId === entry.projectId);
    const title = group
      ? [group.name, group.targetLabel]
          .filter((part, index, parts) => part && parts.indexOf(part) === index)
          .join(" · ")
      : planItemTargetName(item);
    const past = entry.nights
      .filter((night) => planMainFilterOf(planStatus(night)) === "executed")
      .map((night) => night.date)
      .sort();
    const goal = group?.goalSeconds ?? 0;
    const acquired = journalDurationOf(group?.acquiredSeconds ?? 0, locale);
    const progress =
      goal > 0
        ? journalFill(message(locale, "journalGroupProgressValue"), {
            acquired,
            goal: journalDurationOf(goal, locale),
          })
        : null;
    const toDebrief = group?.toDebriefCount ?? 0;
    const href = multiNightPlanHref(locale, entry.projectId);
    return (
      <article
        className="planner-library-group"
        key={`group-${entry.projectId}`}
        data-project={entry.projectId}
      >
        <p className="planner-library-group-eyebrow">
          <span className="journal-badge is-plan">
            {message(locale, "journalGroupPlanLabel")}
          </span>
          <a
            className="journal-group-corner"
            href={href}
            aria-label={`${message(locale, "journalGroupOpenPlan")} — ${title}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>
        </p>
        <h3>
          <a href={href}>{title}</a>
        </h3>
        <p className="planner-library-group-line">
          {[
            past.length ? groupSpanText(past[0], past.at(-1), locale) : null,
            first.location?.name ?? null,
            goal > 0
              ? journalFill(message(locale, "plansGroupGoal"), {
                  goal: journalDurationOf(goal, locale),
                })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {group ? (
          <div className="planner-library-card-tags">
            <StatusTag
              tone={
                group.status === "finished"
                  ? "executed"
                  : group.status === "archived"
                    ? "archived"
                    : "pending"
              }
              locale={locale}
              scheme={false}
              label={message(
                locale,
                group.status === "finished"
                  ? "journalGroupFinished"
                  : group.status === "archived"
                    ? "journalGroupArchived"
                    : "journalGroupInProgress",
              )}
            />
            {toDebrief > 0 ? (
              <StatusTag
                tone="toDebrief"
                locale={locale}
                scheme={false}
                label={journalCounted(
                  locale,
                  "journalGroupToDebrief",
                  toDebrief,
                )}
              />
            ) : null}
          </div>
        ) : null}
        {progress ? (
          <div className="journal-progress">
            <span className="journal-progress-text">{progress}</span>
            <span
              className="journal-progress-bar"
              role="img"
              aria-label={progress}
            >
              <span
                style={{
                  width: `${(Math.min(1, (group.acquiredSeconds ?? 0) / goal) * 100).toFixed(1)}%`,
                }}
              />
            </span>
          </div>
        ) : null}
        <div className="planner-library-group-nights">
          {entry.nights.map((night) =>
            planCard(night, { listed: true, compact: true }),
          )}
        </div>
        {entry.hidden > 0 ? (
          <p className="planner-library-group-note">
            {journalCounted(locale, "plansGroupHiddenByFilters", entry.hidden)}
          </p>
        ) : null}
        {entry.otherList > 0 ? (
          <p className="planner-library-group-note">
            {journalCounted(
              locale,
              main === "executed"
                ? "plansGroupOtherListPlanned"
                : "plansGroupOtherList",
              entry.otherList,
            )}
          </p>
        ) : null}
      </article>
    );
  };
  // The year, then "Statut · Tous" when everything is ticked, or
  // the badge of each status ticked when the selection is neither the
  // preselection nor everything (the cross unticks it).
  const applyBarFilters = (next) => {
    if (calendarView) {
      setCalendarStatuses(next.statuses);
      changeView({ main, filters: { ...filters, year: next.year } });
    } else changeView({ main, filters: next });
  };
  const barSelection = planStatusSelection(barFilters, barMain);
  const barTicked = planStatusesTicked(barFilters, barMain);
  const badges = [
    ...(barFilters.year
      ? [
          {
            id: "year",
            category: message(locale, "year"),
            value: barFilters.year,
            onRemove: () => applyBarFilters({ ...barFilters, year: null }),
          },
        ]
      : []),
    ...(barSelection === "all"
      ? [
          {
            id: "status-all",
            category: message(locale, "filterCategoryStatus"),
            value: message(locale, "plannerPlanFilterAll"),
            onRemove: () =>
              applyBarFilters(
                planFiltersWithStatuses(barFilters, null, barMain),
              ),
          },
        ]
      : barSelection === "custom"
        ? barTicked.map((status) => ({
            id: `status-${status}`,
            category: message(locale, "filterCategoryStatus"),
            value: planFilterWord(locale, status),
            tone: status,
            onRemove: () =>
              applyBarFilters(
                planFiltersWithStatuses(
                  barFilters,
                  barTicked.filter((entry) => entry !== status),
                  barMain,
                ),
              ),
          }))
        : []),
  ];
  return (
    <main className="planner-library">
      {kindSwitch}
      <section className="planner-library-heading">
        <div>
          <p className="eyebrow">{message(locale, "plannerSessionPlans")}</p>
          <h2>{message(locale, "plannerLibraryTitle")}</h2>
          <p>{message(locale, "plannerLibraryHelp")}</p>
        </div>
      </section>
      {!plans.length ? (
        <p className="planner-empty-copy">
          {message(locale, "plannerLibraryEmpty")}
        </p>
      ) : (
        <>
          <div className="planner-library-filter-row">
            {!calendarView && (
              <div
                className="session-view-switch planner-library-main-filter"
                role="tablist"
                aria-label={message(locale, "planMainFilterLabel")}
              >
                {PLAN_MAIN_FILTERS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    className={main === value ? "is-active" : ""}
                    aria-selected={main === value}
                    data-main-filter={value}
                    onClick={() => {
                      setSelectedDate("");
                      // The statuses ticked belong to a main filter; the
                      // other begins again from its preselection.
                      changeView({
                        main: value,
                        filters: { ...filters, statuses: null },
                      });
                    }}
                  >
                    {message(
                      locale,
                      value === "executed"
                        ? "plannerPlanFilterExecuted"
                        : "planMainFilterToExecute",
                    )}
                  </button>
                ))}
              </div>
            )}
            <FiltersButton
              locale={locale}
              count={planFiltersCount(barFilters, barMain)}
              onClick={() => setFiltersOpen(true)}
              testId="plan-filters-button"
            />
          </div>
          <FilterBadges
            locale={locale}
            badges={badges}
            onReset={() => applyBarFilters(noPlanFilters)}
          />
          {view === "list" && !shownPlans.length && (
            <p
              className="planner-empty-copy planner-library-filter-empty"
              data-status-filter-empty=""
            >
              {message(locale, "plannerPlanFilterEmpty")}{" "}
              {(filters.year || filters.statuses) && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => changeView({ main, filters: noPlanFilters })}
                >
                  {message(locale, "plannerPlanFilterReset")}
                </button>
              )}
            </p>
          )}
          {(shownPlans.length > 0 ||
            calendarView ||
            filters.year ||
            filters.statuses) && (
            <>
              <div
                className={`session-view-switch planner-library-view-switch${
                  view === "calendar" ? " is-calendar" : ""
                }`}
                role="tablist"
                aria-label={message(locale, "plannerLibrary")}
              >
                <button
                  className={view === "list" ? "is-active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={view === "list"}
                  onClick={() => setView("list")}
                >
                  {message(locale, "plannerList")}
                </button>
                <button
                  className={view === "calendar" ? "is-active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={view === "calendar"}
                  onClick={() => setView("calendar")}
                >
                  {message(locale, "plannerToolCalendar")}
                </button>
              </div>
              {view === "list" ? (
                shownPlans.length > 0 && (
                  <section className="planner-library-list" aria-live="polite">
                    <div className="planner-library-list-heading has-view-buttons">
                      <h2>{message(locale, "plannerAllPlans")}</h2>
                      <PlanTargetViewButtons
                        locale={locale}
                        plans
                        view={targetView}
                        onChange={setTargetView}
                        disabled={!visiblePlans.length}
                      />
                    </div>
                    {planLibraryEntries({
                      plans,
                      main,
                      passes: (plan, nextMain) =>
                        passes(plan, filters, nextMain),
                      mainOf: (plan) => planMainFilterOf(planStatus(plan)),
                    }).map((entry) =>
                      entry.kind === "group"
                        ? groupCard(entry)
                        : planCard(entry.plan, { listed: true }),
                    )}
                  </section>
                )
              ) : (
                <section
                  className="planner-year-calendar"
                  aria-label={message(locale, "yearCalendar")}
                >
                  <div>
                    <h2>{message(locale, "yearCalendar")}</h2>
                    <p>{message(locale, "plannerCalendarLegend")}</p>
                    <div className="planner-calendar-status-legend">
                      {["pending", "executed", "partial", "abandoned"].map(
                        (status) => (
                          <span key={status}>
                            <i className={`is-${status}`} aria-hidden="true" />
                            {message(
                              locale,
                              `plannerPlanStatus${status[0].toUpperCase()}${status.slice(1)}`,
                            )}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="calendar-months">
                    {Array.from({ length: 12 }, (_, month) => {
                      const rowEndsHere =
                        (month + 1) % calendarColumns === 0 || month === 11;
                      const selectedMonth = selectedDate
                        ? Number(selectedDate.slice(5, 7)) - 1
                        : null;
                      const panelBelongsHere =
                        selectedDate &&
                        rowEndsHere &&
                        Math.floor(selectedMonth / calendarColumns) ===
                          Math.floor(month / calendarColumns);
                      return [
                        <PlannerCalendarMonth
                          key={month}
                          locale={locale}
                          month={month}
                          plans={calendarPlans}
                          year={Number(calendarYear)}
                          selectedDate={selectedDate}
                          onSelectDate={selectDate}
                        />,
                        panelBelongsHere && (
                          <PlannerCalendarPlansPanel
                            key={`panel-${selectedDate}`}
                            locale={locale}
                            date={selectedDate}
                            plans={selectedPlans}
                          >
                            {selectedPlans.map((plan) => planCard(plan))}
                          </PlannerCalendarPlansPanel>
                        ),
                      ];
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
      {filtersOpen && (
        <PlanFiltersDialog
          locale={locale}
          main={barMain}
          filters={barFilters}
          years={allYears}
          countOf={(draft) =>
            plans.filter((plan) => passes(plan, draft, barMain)).length
          }
          onApply={(draft) => {
            setFiltersOpen(false);
            setSelectedDate("");
            applyBarFilters(draft);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}
      {openedPlan && (
        <PlanSheetDialog
          locale={locale}
          plan={openedPlan}
          clock={(value) =>
            placeClock(value, locale, openedPlan.location?.timeZone)
          }
          rigName={rigFor(openedPlan)}
          profileSets={profileSets}
          visualSkyQuality={visualSkyFor(openedPlan)}
          unsyncedLabel={isBrowserPlan(openedPlan) ? unsyncedLabel : null}
          acquisition={openedAcquisition}
          session={sessions.get(openedPlan.id) ?? null}
          actions={actionsOf(openedPlan)}
          execution={planExecutionOf(executionByPlanId, openedPlan)}
          recreating={recreating === openedPlan.id}
          onClose={() => setOpenedPlanId(null)}
          onAction={(action) => runAction(openedPlan, action)}
          onRecreate={() => recreateSession(openedPlan)}
        />
      )}
      {confirmation && actionCopy && (
        <ConfirmationDialog
          locale={locale}
          title={actionCopy.title}
          description={actionCopy.description}
          confirmLabel={actionCopy.confirmLabel}
          destructive={confirmation.action === "delete"}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmAction}
        />
      )}
    </main>
  );
}

// The library reads the account's framing resources
// (`GET /v1/framings`) instead of scanning every loaded plan
// (`savedPlanFramings`) -- a framing exists on its own, with or without a
// plan. One grid card per resource: preview, name (+ the
// small lock icon next to it, section E), a single meta line ("Mosaïque
// {w}° × {h}°" or "Champ simple" · state), and the actions that state
// allows. Archived framings sit in their own collapsed section (A4/6c.8).
function PlannerFramingLibrary({
  locale,
  resources,
  loaded,
  highlightedId = null,
  // Creating, renaming, editing, copying and restoring a framing of a single
  // field are everyone's. A mosaic is `planner.mosaic`'s (the service says the
  // same): without it, its card keeps what reads, exports and clears it up.
  mosaicAllowed = true,
  onNew,
  onAction,
}) {
  const [archivedOpen, setArchivedOpen] = useState(false);
  const highlightedCardRef = useRef(null);
  const active = resources.filter((resource) => !resource.archivedAt);
  const archived = resources.filter((resource) => resource.archivedAt);
  // "Voir dans Cadrages" lands here with
  // the card of the framing the fiche came from already open (the archived
  // section auto-expands when that is where it lives) and scrolled into
  // view -- otherwise a long library would leave the visitor to search for
  // it themselves.
  useEffect(() => {
    if (!highlightedId) return;
    if (archived.some((resource) => resource.id === highlightedId))
      setArchivedOpen(true);
  }, [highlightedId, archived]);
  useEffect(() => {
    highlightedCardRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [highlightedId]);
  const card = (resource) => {
    const target = resource.payload?.target;
    const name = resource.name || message(locale, "plannerFraming");
    const mosaic = target?.framing?.mosaic;
    const canWrite = mosaicAllowed || !framingNeedsMosaic(target);
    const locked = resource.state === "locked" || resource.state === "archived";
    const highlighted = resource.id === highlightedId;
    const stateLabel =
      resource.state === "locked"
        ? message(locale, "plannerFramingLocked")
        : resource.state === "archived"
          ? message(locale, "plannerFramingArchivedState")
          : resource.state === "shared"
            ? `${message(locale, "plannerFramingInPlansPrefix")} ${resource.usage?.pendingPlans?.length || 0} ${message(locale, "plannerFramingPlansSuffix")}`
            : message(locale, "plannerFramingFreeState");
    const fieldLine = mosaic
      ? `${message(locale, "plannerFramingMosaicLabel")} ${Number(mosaic.widthDegrees).toFixed(1)}° × ${Number(mosaic.heightDegrees).toFixed(1)}°`
      : message(locale, "plannerFramingSimpleField");
    return (
      <article
        className={`planner-library-card planner-framing-library-card${highlighted ? " is-highlighted" : ""}`}
        key={resource.id}
        ref={highlighted ? highlightedCardRef : null}
      >
        <PlannerFramingPreview locale={locale} name={name} target={target} />
        <div className="planner-framing-library-card-content">
          <h3>
            {name}
            {locked && (
              <svg
                aria-label={message(locale, "plannerFramingLockedIconLabel")}
                className="planner-framing-lock-icon"
                role="img"
                viewBox="0 0 24 24"
              >
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            )}
          </h3>
          <p className="planner-framing-library-meta">
            {fieldLine} · {stateLabel}
          </p>
        </div>
        <div className="planner-library-actions" role="group" aria-label={name}>
          {canWrite && resource.state !== "archived" && (
            <PlannerLibraryAction
              icon="edit"
              label={message(locale, "plannerFramingRenameTitle")}
              onClick={() => onAction(resource, "rename")}
            />
          )}
          {resource.state === "archived" ? (
            <>
              <PlannerLibraryAction
                icon="export"
                label={message(locale, "plannerFramingExportAction")}
                onClick={() => onAction(resource, "export")}
              />
              {canWrite && (
                <>
                  <PlannerLibraryAction
                    icon="edit"
                    label={message(locale, "plannerFramingCreateCopyAction")}
                    onClick={() => onAction(resource, "editCopy")}
                  />
                  <PlannerLibraryAction
                    icon="restore"
                    label={message(locale, "plannerFramingRestoreAction")}
                    onClick={() => onAction(resource, "restore")}
                  />
                </>
              )}
            </>
          ) : (
            <>
              {canWrite && (
                <PlannerLibraryAction
                  icon="edit"
                  label={message(locale, "plannerFramingEditAction")}
                  onClick={() => onAction(resource, "edit")}
                />
              )}
              <PlannerLibraryAction
                icon="export"
                label={message(locale, "plannerFramingExportAction")}
                onClick={() => onAction(resource, "export")}
              />
              <PlannerLibraryAction
                icon={resource.state === "locked" ? "archive" : "delete"}
                label={
                  resource.state === "locked"
                    ? message(locale, "plannerFramingArchiveAction")
                    : message(locale, "plannerFramingDeleteAction")
                }
                onClick={() => onAction(resource, "delete")}
              />
            </>
          )}
        </div>
      </article>
    );
  };
  return (
    <main className="planner-library planner-framing-library">
      <section className="planner-library-heading">
        <div>
          <p className="eyebrow">{message(locale, "plannerFramings")}</p>
          <h2>{message(locale, "plannerFramingLibraryTitle")}</h2>
          <p>{message(locale, "plannerFramingLibraryHelp")}</p>
        </div>
        {/* With no framing yet the empty state below carries the one primary
            « Nouveau cadrage »; the heading's appears with the first framing
            (one primary per zone, UI rule 1). */}
        {!(loaded && !active.length && !archived.length) && (
          <button
            className="btn-primary planner-framing-new-button"
            onClick={onNew}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {message(locale, "plannerFramingNew")}
          </button>
        )}
      </section>
      {loaded && !active.length && !archived.length ? (
        // "One line, then ⓘ": the empty message carries the add icon in its
        // button, which adds a framing; the heading's button waits for the
        // first framing.
        <EmptyState
          className="planner-framing-empty"
          sentence={message(locale, "plannerFramingLibraryEmpty")}
          actionLabel={message(locale, "plannerFramingNew")}
          actionIcon={
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
          actionTestId="planner-framing-empty-action"
          onAction={onNew}
        />
      ) : (
        <section
          className="planner-library-list planner-framing-library-grid"
          aria-live="polite"
        >
          {active.map(card)}
        </section>
      )}
      {archived.length > 0 && (
        <details
          className="planner-framing-archived-section"
          onToggle={(event) => setArchivedOpen(event.target.open)}
          open={archivedOpen}
        >
          <summary>
            {message(locale, "plannerFramingArchivedSectionPrefix")} (
            {archived.length})
          </summary>
          <section className="planner-library-list planner-framing-library-grid">
            {archived.map(card)}
          </section>
        </details>
      )}
    </main>
  );
}

function TargetFavoriteModeIcon({ mode }) {
  if (mode === "photo")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 8.5h3l1.3-2h6.4l1.3 2h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19.5 19.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Z" />
        <circle cx="12" cy="14" r="3.2" />
        <path
          className="planner-target-favorite-star"
          d="m18 1.1 1.65 3.25 3.6.5-2.6 2.55.62 3.6L18 9.28 14.73 11l.62-3.6-2.6-2.55 3.6-.5L18 1.1Z"
        />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.8 12s3.3-5.6 9.2-5.6 9.2 5.6 9.2 5.6-3.3 5.6-9.2 5.6S2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.7" />
      <path
        className="planner-target-favorite-star"
        d="m18 1.1 1.65 3.25 3.6.5-2.6 2.55.62 3.6L18 9.28 14.73 11l.62-3.6-2.6-2.55 3.6-.5L18 1.1Z"
      />
    </svg>
  );
}

function PlannerTargetCatalogue({
  locale,
  visualMode = false,
  auth = {},
  onFavoritesChanged,
  onAddPlace,
  // `{ planEquipment, configuration, profiles, sky }` of the dialog's
  // « Prévisualiser »: no plan's equipment from the catalogue, the default
  // configuration (« Mon matériel »), the planner's profile sets, the sky
  // shown.
  preview = null,
}) {
  // The target whose "Statistiques de la cible" are open, and the
  // planner document "Cette nuit" reads, which gives the place of the
  // dialog's "Lieu" line and the saved places it may pick from.
  const [factsTarget, setFactsTarget] = useState(null);
  // The text of a card opens the same popover as its « i » (the target's page,
  // whole); the photo keeps its enlargement.
  const [textTarget, setTextTarget] = useState(null);
  const textAnchorRef = useRef(null);
  const [factsDocument, setFactsDocument] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadTonightDocument().then((loaded) => {
      if (!cancelled) setFactsDocument(loaded?.document ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const factsPlaces = useMemo(
    () =>
      (Array.isArray(factsDocument?.knownLocations)
        ? factsDocument.knownLocations
        : []
      ).filter(
        (entry) =>
          Number.isFinite(Number(entry?.latitude)) &&
          Number.isFinite(Number(entry?.longitude)),
      ),
    [factsDocument],
  );
  const factsSubject = useMemo(
    () =>
      tonightSubject({
        document: factsDocument,
        darkness: readStorage(readDarknessPreference, "astronomical"),
      }),
    [factsDocument],
  );
  const [query, setQuery] = useState("");
  const [catalogue, setCatalogue] = useState("");
  const [type, setType] = useState("");
  const [selection, setSelection] = useState("");
  const [hemisphere, setHemisphere] = useState("");
  const [season, setSeason] = useState("");
  const [catalogueView, setCatalogueView] = useState("all");
  const [favoriteMode, setFavoriteMode] = useState("");
  const [catalogueVisualMode, setCatalogueVisualMode] = useState(visualMode);
  // The plan's eyepiece setting, for the visual images.
  const { setting: eyepieceSetting } = useEyepieceSetting();
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState(emptyTargetCatalogueResult);
  const [status, setStatus] = useState("loading");
  const [favoriteIds, setFavoriteIds] = useState(() => ({
    photo: new Set(),
    visual: new Set(),
  }));
  const [favoriteError, setFavoriteError] = useState(false);
  const [favoriteUpdatingIds, setFavoriteUpdatingIds] = useState(
    () => new Set(),
  );
  const [favoriteVersion, setFavoriteVersion] = useState(0);
  // Which favorite the last tick touched, said for a moment.
  const [favoriteNotice, setFavoriteNotice] = useState(null);
  const [listEnd, setListEnd] = useState(null);
  const loadingNextPageRef = useRef(false);
  // A person with no space keeps the favorites in this browser, as the
  // plans and the places; nothing is greyed out for lack of a space.
  const favoritesInBrowser = favoritesInBrowserFor(auth);
  const catalogueLoading = status === "loading";
  const initialCatalogueLoading =
    catalogueLoading && result.targets.length === 0;
  const formatCatalogueCount = (value) =>
    new Intl.NumberFormat(locale).format(value);

  useEffect(() => {
    if (!auth.checked) return undefined;
    if (favoritesInBrowser) {
      const held = readBrowserFavorites(window.localStorage);
      setFavoriteIds({
        photo: browserFavoriteIds(held, "photo"),
        visual: browserFavoriteIds(held, "visual"),
      });
      setFavoriteError(false);
      return undefined;
    }
    const controller = new AbortController();
    // What this browser kept before the sign-in goes to the space first.
    carryBrowserFavorites({
      storage: window.localStorage,
      request: putTargetFavorite,
    })
      .catch(() => {})
      .then(() => fetch("/api/target-favorites", { signal: controller.signal }))
      .then((response) => {
        if (!response.ok) throw new Error("favorites unavailable");
        return response.json();
      })
      .then((data) => {
        setFavoriteIds({
          photo: new Set((data.photoTargetIds || []).map(String)),
          visual: new Set((data.visualTargetIds || []).map(String)),
        });
        setFavoriteError(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setFavoriteError(true);
      });
    return () => controller.abort();
  }, [auth.checked, favoritesInBrowser, catalogueView]);

  useEffect(() => {
    if (catalogueView === "favorites" && !auth.checked) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      const parameters = new URLSearchParams({
        locale,
        q: query,
        catalogue,
        type,
        selection,
        hemisphere,
        season,
        favorites:
          catalogueView === "favorites" && !favoritesInBrowser ? "1" : "0",
        favoriteMode: catalogueView === "favorites" ? favoriteMode : "",
        // The catalogue is ordered by notoriety, not alphabetically.
        sort: "notoriety",
        offset: String(offset),
        limit: String(targetCataloguePageSize),
      });
      // The favorites of a browser are asked by their identifiers (a
      // public read of the shared catalogue: nothing personal is sent but the
      // targets the person ticked).
      if (catalogueView === "favorites" && favoritesInBrowser)
        parameters.set(
          "targetIds",
          [
            ...browserFavoriteIds(
              readBrowserFavorites(window.localStorage),
              favoriteMode,
            ),
          ].join(","),
        );
      fetch(`/api/target-library?${parameters}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("target library unavailable");
          return response.json();
        })
        .then((next) => {
          setResult((previous) => {
            if (offset === 0) return next;
            const existingIds = new Set(
              previous.targets.map((target) => target.id),
            );
            return {
              ...next,
              targets: [
                ...previous.targets,
                ...next.targets.filter((target) => !existingIds.has(target.id)),
              ],
            };
          });
          loadingNextPageRef.current = false;
          setStatus("ready");
        })
        .catch((error) => {
          if (error.name !== "AbortError") {
            loadingNextPageRef.current = false;
            setStatus("error");
          }
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    catalogue,
    catalogueView,
    hemisphere,
    locale,
    offset,
    query,
    season,
    selection,
    type,
    favoriteMode,
    favoriteVersion,
    auth.checked,
    favoritesInBrowser,
  ]);

  const updateQuery = (value) => {
    loadingNextPageRef.current = false;
    setQuery(value);
    setOffset(0);
  };
  const updateCatalogue = (value) => {
    loadingNextPageRef.current = false;
    setCatalogue(value);
    setOffset(0);
  };
  const updateType = (value) => {
    loadingNextPageRef.current = false;
    setType(value);
    setOffset(0);
  };
  const updateSelection = (value) => {
    loadingNextPageRef.current = false;
    setSelection(value);
    setOffset(0);
  };
  const updateHemisphere = (value) => {
    loadingNextPageRef.current = false;
    setHemisphere(value);
    if (!value) setSeason("");
    setOffset(0);
  };
  const updateSeason = (value) => {
    loadingNextPageRef.current = false;
    setSeason(value);
    setOffset(0);
  };
  const updateCatalogueView = (value) => {
    loadingNextPageRef.current = false;
    setCatalogueView(value);
    setOffset(0);
  };
  const updateFavoriteMode = (value) => {
    loadingNextPageRef.current = false;
    setFavoriteMode(value);
    setOffset(0);
  };
  useEffect(() => {
    if (!favoriteNotice) return undefined;
    const timeout = window.setTimeout(
      () => setFavoriteNotice(null),
      favoriteNoticeDurationMs,
    );
    return () => window.clearTimeout(timeout);
  }, [favoriteNotice]);
  const toggleFavorite = async (targetId, mode) => {
    const updateKey = `${mode}:${targetId}`;
    if (!auth.checked || favoriteUpdatingIds.has(updateKey)) return;
    const favorite = !favoriteIds[mode].has(targetId);
    setFavoriteUpdatingIds((current) => new Set(current).add(updateKey));
    setFavoriteNotice({
      id: `${Date.now()}-${updateKey}`,
      key: favoriteNoticeKey(mode, favorite),
    });
    setFavoriteIds((current) => {
      const next = {
        photo: new Set(current.photo),
        visual: new Set(current.visual),
      };
      if (favorite) next[mode].add(targetId);
      else next[mode].delete(targetId);
      return next;
    });
    try {
      if (favoritesInBrowser) {
        // No space, no request: the tick stays in this browser.
        const kept = withBrowserFavorite(
          readBrowserFavorites(window.localStorage),
          targetId,
          mode,
          favorite,
        );
        if (!writeBrowserFavorites(window.localStorage, kept))
          throw new Error("favorites unavailable");
        onFavoritesChanged?.(browserFavoritesPayload(kept));
        setFavoriteError(false);
        setFavoriteVersion((current) => current + 1);
        return;
      }
      const response = await putTargetFavorite({ targetId, mode, favorite });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "favorites unavailable");
      setFavoriteIds({
        photo: new Set((data.photoTargetIds || []).map(String)),
        visual: new Set((data.visualTargetIds || []).map(String)),
      });
      onFavoritesChanged?.(data);
      setFavoriteError(false);
      setFavoriteVersion((current) => current + 1);
    } catch {
      setFavoriteIds((current) => {
        const next = {
          photo: new Set(current.photo),
          visual: new Set(current.visual),
        };
        if (favorite) next[mode].delete(targetId);
        else next[mode].add(targetId);
        return next;
      });
      setFavoriteError(true);
      setFavoriteNotice(null);
    } finally {
      setFavoriteUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(updateKey);
        return next;
      });
    }
  };
  const selectedCatalogue = result.catalogueOptions.find(
    (option) => option.id === catalogue,
  );
  const counts = result.counts || emptyTargetCatalogueResult().counts;
  // The same three counts as `counts` (`total`/`best`/`extended`), with no
  // facetable filter applied at all — `null` for a portal predating the field,
  // in which case `counterLabel` below falls back to the plain count, exactly
  // like the admin target library screen.
  const countsUnfiltered = result.countsUnfiltered || null;
  // Whether any of the catalogue's facetable filters is active (the trigger for
  // an "x/n" display): the same six dropdowns/search box as the admin target
  // library screen, plus the planner's own favorites tab — selecting it narrows
  // the pool every facet is computed over.
  const hasActiveFilter = hasActiveFacetFilter([
    query.trim(),
    catalogue,
    type,
    selection,
    hemisphere,
    season,
    catalogueView === "favorites" ? "favorites" : "",
  ]);
  // `count`/`total` faceted counters, shared with the admin target library
  // screen through `portal/target-catalogue-counters.js` so the two web
  // surfaces never read the same server contract two slightly different
  // ways.
  const counterLabel = (count, total) =>
    facetedCounterLabel(count, total, hasActiveFilter, formatCatalogueCount);
  // The three counters share one figure size, shrunk by the widest of the
  // three ("14386/14386" must stay whole in a 100 px box): the CSS reads
  // the longest figure's length from `--catalogue-figure-chars`.
  const summaryFigures = catalogueLoading
    ? ["—", "—", "—"]
    : [
        counterLabel(counts.total, countsUnfiltered?.total),
        counterLabel(counts.best, countsUnfiltered?.best),
        counterLabel(counts.extended, countsUnfiltered?.extended),
      ];
  const summaryFigureChars = Math.max(
    3,
    ...summaryFigures.map((figure) => String(figure).length),
  );
  const hasMoreTargets =
    status === "ready" && result.targets.length < result.total;

  useEffect(() => {
    if (!hasMoreTargets) return undefined;
    const loadNextPage = () => {
      if (loadingNextPageRef.current) return;
      loadingNextPageRef.current = true;
      setOffset((current) => current + result.limit);
    };
    const loadWhenNearPageEnd = () => {
      const documentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      if (window.innerHeight + window.scrollY >= documentHeight - 640)
        loadNextPage();
    };
    window.addEventListener("scroll", loadWhenNearPageEnd, { passive: true });
    window.addEventListener("resize", loadWhenNearPageEnd);
    const frame = window.requestAnimationFrame(loadWhenNearPageEnd);
    const proximityCheck = window.setInterval(loadWhenNearPageEnd, 250);
    return () => {
      window.removeEventListener("scroll", loadWhenNearPageEnd);
      window.removeEventListener("resize", loadWhenNearPageEnd);
      window.cancelAnimationFrame(frame);
      window.clearInterval(proximityCheck);
    };
  }, [hasMoreTargets, offset, result.limit]);

  useEffect(() => {
    if (
      !listEnd ||
      !hasMoreTargets ||
      typeof IntersectionObserver !== "function"
    )
      return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        if (loadingNextPageRef.current) return;
        loadingNextPageRef.current = true;
        setOffset((current) => current + result.limit);
      },
      { rootMargin: "480px 0px" },
    );
    observer.observe(listEnd);
    return () => {
      observer.disconnect();
    };
  }, [hasMoreTargets, listEnd, offset, result.limit]);

  return (
    <main className="planner-library planner-target-catalogue">
      <section className="planner-library-heading planner-target-catalogue-heading">
        <div>
          <p className="eyebrow">
            {message(locale, "plannerTargetCatalogueEyebrow")}
          </p>
          <h2>{message(locale, "plannerTargetCatalogueTitle")}</h2>
          <PlannerCatalogueHelp
            locale={locale}
            result={result}
            visualMode={catalogueVisualMode}
          />
        </div>
        <div
          className="planner-target-catalogue-view-switch"
          role="tablist"
          aria-label={message(locale, "plannerTargetCatalogueTitle")}
        >
          <button
            className={catalogueView === "all" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={catalogueView === "all"}
            onClick={() => updateCatalogueView("all")}
          >
            {message(locale, "plannerTargetCatalogueComplete")}
          </button>
          <button
            className={catalogueView === "favorites" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={catalogueView === "favorites"}
            onClick={() => updateCatalogueView("favorites")}
          >
            {message(locale, "plannerTargetCatalogueFavorites")}
          </button>
        </div>
        {catalogueView === "favorites" && (
          <div
            className="planner-target-catalogue-favorite-filter"
            role="group"
            aria-label={message(locale, "plannerTargetCatalogueFavorites")}
          >
            {[
              ["", "plannerTargetCatalogueAllFavorites"],
              ["photo", "plannerTargetCataloguePhotoFavorites"],
              ["visual", "plannerTargetCatalogueVisualFavorites"],
            ].map(([mode, label]) => (
              <button
                className={favoriteMode === mode ? "is-active" : ""}
                type="button"
                key={mode || "all"}
                aria-pressed={favoriteMode === mode}
                onClick={() => updateFavoriteMode(mode)}
              >
                {message(locale, label)}
              </button>
            ))}
          </div>
        )}
        <div className="planner-target-catalogue-controls">
          <label className="planner-target-catalogue-search">
            <span>{message(locale, "plannerTargetCatalogueSearch")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder={message(locale, "plannerTargetCataloguePlaceholder")}
            />
          </label>
          <label className="planner-target-catalogue-search">
            <span>{message(locale, "plannerTargetCatalogueFilter")}</span>
            <select
              value={catalogue}
              onChange={(event) => updateCatalogue(event.target.value)}
            >
              <option value="">
                {message(locale, "plannerTargetCatalogueAll")}
              </option>
              {result.catalogueOptions.map((option) => (
                <option value={option.id} key={option.id}>
                  {targetCatalogueLabel(option.name, locale)} (
                  {counterLabel(option.count, option.total)})
                </option>
              ))}
            </select>
          </label>
          <label className="planner-target-catalogue-search">
            <span>{message(locale, "plannerTargetCatalogueType")}</span>
            <select
              value={type}
              onChange={(event) => updateType(event.target.value)}
            >
              <option value="">
                {message(locale, "plannerTargetCatalogueAllTypes")}
              </option>
              {result.typeOptions.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.name} ({counterLabel(option.count, option.total)})
                </option>
              ))}
            </select>
          </label>
          <label className="planner-target-catalogue-search">
            <span>{message(locale, "plannerTargetCatalogueSelection")}</span>
            <select
              value={selection}
              onChange={(event) => updateSelection(event.target.value)}
            >
              <option value="">
                {message(locale, "plannerTargetCatalogueAllTargets")}
              </option>
              <option value="best">
                {`${message(locale, "plannerTargetCatalogueEssential")} · ${counterLabel(counts.best, countsUnfiltered?.best)}`}
              </option>
              <option value="extended">
                {`${message(locale, "plannerTargetCatalogueExtended")} · ${counterLabel(counts.extended, countsUnfiltered?.extended)}`}
              </option>
            </select>
          </label>
          <label className="planner-target-catalogue-search">
            <span>{message(locale, "plannerTargetCatalogueHemisphere")}</span>
            <select
              value={hemisphere}
              onChange={(event) => updateHemisphere(event.target.value)}
            >
              <option value="">
                {message(locale, "plannerTargetCatalogueAllHemispheres")}
              </option>
              <option value="north">
                {message(locale, "plannerTargetCatalogueNorthernHemisphere")}
              </option>
              <option value="south">
                {message(locale, "plannerTargetCatalogueSouthernHemisphere")}
              </option>
            </select>
          </label>
          <label className="planner-target-catalogue-search">
            <span>{message(locale, "plannerTargetCatalogueSeason")}</span>
            <select
              value={season}
              disabled={!hemisphere}
              onChange={(event) => updateSeason(event.target.value)}
            >
              <option value="">
                {message(locale, "plannerTargetCatalogueAllSeasons")}
              </option>
              {[
                ["winter", "seasonWinter"],
                ["spring", "seasonSpring"],
                ["summer", "seasonSummer"],
                ["autumn", "seasonAutumn"],
              ].map(([value, label]) => (
                <option value={value} key={value}>
                  {message(locale, label)}
                </option>
              ))}
            </select>
          </label>
          <div
            className="planner-target-catalogue-mode"
            role="group"
            aria-label={message(locale, "plannerTargetCatalogueImageMode")}
          >
            <span>{message(locale, "plannerTargetCatalogueImageMode")}</span>
            <div>
              <button
                type="button"
                aria-pressed={!catalogueVisualMode}
                className={!catalogueVisualMode ? "is-active" : ""}
                onClick={() => setCatalogueVisualMode(false)}
              >
                {message(locale, "plannerTargetCataloguePhoto")}
              </button>
              <button
                type="button"
                aria-pressed={catalogueVisualMode}
                className={catalogueVisualMode ? "is-active" : ""}
                onClick={() => setCatalogueVisualMode(true)}
              >
                {message(locale, "plannerTargetCatalogueVisual")}
              </button>
            </div>
          </div>
        </div>
      </section>
      {selectedCatalogue && (
        <section className="planner-target-catalogue-description">
          <p className="eyebrow">{selectedCatalogue.name}</p>
          {selectedCatalogue.description && (
            <p>{selectedCatalogue.description}</p>
          )}
        </section>
      )}
      <p className="planner-target-catalogue-count" aria-live="polite">
        {catalogueLoading ? (
          <>
            <span
              className="planner-target-catalogue-spinner"
              aria-hidden="true"
            />
            {message(locale, "plannerTargetCatalogueLoading")}
          </>
        ) : (
          catalogueCountLine(locale, result.total)
        )}
      </p>
      <div
        className="planner-target-catalogue-summary"
        aria-label={message(locale, "plannerTargetCatalogueTitle")}
        aria-busy={catalogueLoading}
        style={{ "--catalogue-figure-chars": summaryFigureChars }}
      >
        <article>
          <strong>{summaryFigures[0]}</strong>
          <span>{message(locale, "plannerTargetCatalogueTotal")}</span>
        </article>
        <article>
          <strong>{summaryFigures[1]}</strong>
          <span>{message(locale, "plannerTargetCatalogueEssential")}</span>
        </article>
        <article>
          <strong>{summaryFigures[2]}</strong>
          <span>{message(locale, "plannerTargetCatalogueExtended")}</span>
        </article>
      </div>
      {status === "error" ? (
        <p className="planner-empty-copy">
          {message(locale, "plannerTargetCatalogueError")}
        </p>
      ) : favoriteError && catalogueView === "favorites" ? (
        <p className="planner-empty-copy" role="alert">
          {message(locale, "plannerTargetCatalogueFavoritesError")}
        </p>
      ) : status === "ready" &&
        catalogueView === "favorites" &&
        result.targets.length === 0 ? (
        // The web's one empty state: the sentence, and the primary that leads
        // to the full catalogue.
        <EmptyState
          className="planner-target-catalogue-favorites-empty"
          sentence={message(locale, "plannerTargetCatalogueFavoritesEmpty")}
          actionLabel={message(locale, "plannerTargetCatalogueFavoritesBrowse")}
          actionTestId="planner-catalogue-favorites-browse"
          onAction={() => updateCatalogueView("all")}
        />
      ) : (
        <section className="planner-target-catalogue-list" aria-live="polite">
          {initialCatalogueLoading ? (
            <div className="planner-target-catalogue-loading" role="status">
              <span
                className="planner-target-catalogue-spinner"
                aria-hidden="true"
              />
              {message(locale, "plannerTargetCatalogueLoading")}
            </div>
          ) : status === "ready" &&
            catalogueView === "all" &&
            result.targets.length === 0 &&
            query.trim() ? (
            <div className="planner-target-catalogue-empty">
              <p className="planner-empty-copy">
                {message(locale, "plannerFramingSearchEmpty")}
              </p>
              <MissingObjectLink locale={locale} query={query} />
            </div>
          ) : (
            result.targets.map((target) => {
              const image = targetImageVariant(target, {
                visualMode: catalogueVisualMode,
              });
              // In visual mode, the eyepiece view in a disc inside the
              // same square, said as a simulation.
              // A bright star's or a constellation's sky picture is a map:
              // the same in both modes, never in the disc.
              const eyepiece =
                catalogueVisualMode && !skyPictureKindOf(target)
                  ? eyepieceViewFor(target, eyepieceSetting, {
                      imageSource: image.source,
                    })
                  : null;
              const photoFavorite = favoriteIds.photo.has(target.id);
              const visualFavorite = favoriteIds.visual.has(target.id);
              return (
                <article
                  className={`planner-target-catalogue-card${
                    image.url ? " has-image" : " has-no-image"
                  }`}
                  key={target.id}
                >
                  {(target.isBest || target.isExtended) && (
                    <div className="planner-target-catalogue-tags is-overlay">
                      {target.isBest && (
                        <span className="is-best">
                          {message(locale, "plannerTargetCatalogueEssential")}
                        </span>
                      )}
                      {!target.isBest && target.isExtended && (
                        <span>
                          {message(locale, "plannerTargetCatalogueExtended")}
                        </span>
                      )}
                    </div>
                  )}
                  {image.url && (
                    <CatalogueCardImage
                      target={target}
                      image={image}
                      eyepiece={eyepiece}
                      locale={locale}
                      creditTitle={
                        skyPictureKindOf(target) === "constellation"
                          ? skyCultureArtCredit(locale)
                          : null
                      }
                    />
                  )}
                  <div
                    className={`planner-target-catalogue-copy${
                      target.story || knowledgeRouteIdOf(target)
                        ? " has-page"
                        : ""
                    }`}
                    data-catalogue-copy=""
                    onClick={
                      target.story || knowledgeRouteIdOf(target)
                        ? (event) => {
                            textAnchorRef.current = event.currentTarget;
                            setTextTarget(target);
                          }
                        : undefined
                    }
                  >
                    <p className="eyebrow">
                      {(target.catalogues || [target.catalogue])
                        .filter(Boolean)
                        .map((entry) => targetCatalogueLabel(entry, locale))
                        .join(" · ")}
                    </p>
                    <h3>
                      {target.caldwellReference &&
                      !/^C0*\d+$/i.test(target.designation)
                        ? `${target.caldwellReference} / ${target.title}`
                        : target.title}
                    </h3>
                    <p className="planner-target-catalogue-meta">
                      {skyCatalogueMetaLine(target, locale) ??
                        [target.type, target.constellation]
                          .filter(Boolean)
                          .join(" · ")}
                    </p>
                    <p className="planner-target-catalogue-data">
                      {catalogueCoordinateLine(target)}
                      {target.apparentSizeLabel &&
                        ` · ${target.apparentSizeLabel}`}
                    </p>
                    {target.observingGuide && (
                      <p className="planner-target-catalogue-guide">
                        {message(locale, "plannerTargetGuideFocalCompact")}{" "}
                        {target.observingGuide.focalLengthMinimumMm}–
                        {target.observingGuide.focalLengthMaximumMm} mm
                        {" · "}
                        {message(
                          locale,
                          "plannerTargetGuideVisualCompact",
                        )}{" "}
                        {target.observingGuide.visualMinimumApertureMm} mm+
                      </p>
                    )}
                  </div>
                  {/* One reserved column of actions at the card's right: the
                      statistics, the « i » when the target has a page, then the
                      photo and visual favorites, the same gap, never over the
                      text (under it when the card is too narrow). */}
                  <div className="planner-target-catalogue-actions">
                    {/* The statistics button, an icon button outside the four
                        levels (UI rules, « Buttons: four levels », rule 7), the first of the column. */}
                    <button
                      type="button"
                      className={`planner-target-facts-open${target.story ? " has-knowledge" : ""}`}
                      aria-label={message(locale, "targetFactsOpenTooltip")}
                      title={message(locale, "targetFactsOpenTooltip")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setFactsTarget(target);
                      }}
                    >
                      <TargetFactsIcon />
                    </button>
                    <TargetKnowledgeDetails
                      target={target}
                      locale={locale}
                      visualMode={catalogueVisualMode}
                    />
                    <div className="planner-target-catalogue-favorites">
                      {[
                        ["photo", photoFavorite],
                        ["visual", visualFavorite],
                      ].map(([mode, favorite]) => {
                        const actionKey = favorite
                          ? mode === "photo"
                            ? "plannerTargetCataloguePhotoFavoriteRemove"
                            : "plannerTargetCatalogueVisualFavoriteRemove"
                          : mode === "photo"
                            ? "plannerTargetCataloguePhotoFavoriteAdd"
                            : "plannerTargetCatalogueVisualFavoriteAdd";
                        return (
                          <button
                            className={`planner-target-catalogue-favorite is-${mode}${favorite ? " is-active" : ""}`}
                            type="button"
                            key={mode}
                            aria-pressed={favorite}
                            aria-label={message(locale, actionKey)}
                            title={message(locale, actionKey)}
                            disabled={
                              !auth.checked ||
                              favoriteUpdatingIds.has(`${mode}:${target.id}`)
                            }
                            onClick={() => toggleFavorite(target.id, mode)}
                          >
                            <TargetFavoriteModeIcon mode={mode} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      )}
      {textTarget ? (
        <TargetKnowledgeDetails
          key={textTarget.id}
          target={textTarget}
          locale={locale}
          visualMode={catalogueVisualMode}
          forcedOpen
          onForcedClose={() => setTextTarget(null)}
          anchorRef={textAnchorRef}
        />
      ) : null}
      {factsTarget ? (
        <TargetScoreExplained
          card={catalogueFactsCard(factsTarget)}
          locale={locale}
          visualMode={catalogueVisualMode}
          catalogue={{
            place: factsSubject.place,
            places: factsPlaces,
            darkness: factsSubject.darkness,
            onAddPlace: onAddPlace
              ? () => {
                  setFactsTarget(null);
                  onAddPlace();
                }
              : null,
          }}
          preview={preview}
          onClose={() => setFactsTarget(null)}
        />
      ) : null}
      {favoriteNotice &&
        typeof document !== "undefined" &&
        createPortal(
          <aside
            className="planner-add-notice planner-favorite-notice"
            key={favoriteNotice.id}
            role="status"
            aria-live="polite"
          >
            <span className="planner-add-notice-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="m5 12.5 4.2 4.2L19 7" />
              </svg>
            </span>
            <span>{message(locale, favoriteNotice.key)}</span>
          </aside>,
          document.body,
        )}
      {hasMoreTargets && (
        <div className="planner-target-catalogue-loader" ref={setListEnd} />
      )}
      {status === "loading" && result.targets.length > 0 && (
        <LoadingState
          layout="inline"
          className="planner-target-catalogue-loader"
        >
          {message(locale, "plannerTargetCatalogueLoadingMore")}
        </LoadingState>
      )}
    </main>
  );
}

// "Licences and sources go to a translated Sources section": the catalogue's
// credits — the reference data, the nebula catalogues, the distances, the image
// sets — are the "Sources" of the ⓘ at the end of the help line, no longer
// printed under every list, even an empty one.
function PlannerCatalogueHelp({ locale, result, visualMode }) {
  const withLicence = (label, attribution) =>
    `${message(locale, label)} ${attribution.source}${
      attribution.license ? ` · ${attribution.license}` : ""
    }`;
  const credits = [];
  if (result.attribution?.source)
    credits.push({
      key: "source",
      text: withLicence("plannerTargetCatalogueSource", result.attribution),
    });
  for (const catalogue of result.attribution?.catalogues || []) {
    // The nebula catalogues' own credit — source, author, year, reference,
    // and that no explicit licence is published.
    const credit = catalogueSourceCredit(catalogue, locale);
    if (credit)
      credits.push({
        key: catalogue,
        text: credit,
        attributes: { "data-catalogue-credit": catalogue },
      });
  }
  if (result.attribution?.distances)
    // Where the distances come from, and under which licence —
    // OpenNGC's share-alike line, then the published values with their
    // acknowledgements.
    distanceSourceCredits(locale).forEach((credit, index) =>
      credits.push({
        key: `distance-credit-${index}`,
        text: credit,
        attributes: {
          "data-distance-credit": index === 0 ? "openngc" : "published",
        },
      }),
    );
  if (result.imageAttribution?.source)
    credits.push({
      key: "image",
      text: withLicence(
        "plannerTargetCatalogueImageSource",
        result.imageAttribution,
      ),
    });
  if (result.curatedPhotoImageAttribution?.source)
    credits.push({
      key: "curated",
      text: withLicence(
        "plannerTargetCatalogueCuratedPhotoSource",
        result.curatedPhotoImageAttribution,
      ),
    });
  if (visualMode && result.visualImageAttribution?.source)
    credits.push({
      key: "visual",
      text: withLicence(
        "plannerTargetCatalogueImageSource",
        result.visualImageAttribution,
      ),
    });
  if (visualMode && result.visualPreviewImageAttribution?.source)
    credits.push({
      key: "visual-preview",
      text: withLicence(
        "plannerTargetCatalogueVisualPreviewSource",
        result.visualPreviewImageAttribution,
      ),
    });
  // The constellations' drawings, after the pictures' credits, when the list
  // shows a constellation.
  if (
    (result.targets || []).some(
      (target) => skyPictureKindOf(target) === "constellation",
    )
  )
    credits.push({
      key: "sky-culture-art",
      text: skyCultureArtCredit(locale),
      attributes: { "data-sky-culture-art-credit": "" },
    });
  const help = message(locale, "plannerTargetCatalogueHelp");
  if (credits.length === 0) return <p>{help}</p>;
  return (
    <InfoLine
      locale={locale}
      text={help}
      label={message(locale, "infoSources")}
      title={message(locale, "plannerTargetCatalogueTitle")}
      testId="planner-target-catalogue-sources-info"
    >
      <section className="info-sources" data-kind="sources">
        <h3>{message(locale, "infoSources")}</h3>
        {credits.map((credit) => (
          <p
            key={credit.key}
            className="planner-target-catalogue-attribution"
            {...credit.attributes}
          >
            {credit.text}
          </p>
        ))}
      </section>
    </InfoLine>
  );
}

// The sky the framing covers, and nothing drawn on it (the red frame must not
// be taken with the background image for the preview): no frame, no panel grid, no panel numbers, no outline glyph when
// the picture is missing. The box has the field's proportions and the picture
// is cropped to that field (`framingPreviewView`, `framings.js`).
function PlannerFramingPreview({ locale, name, target }) {
  const [failed, setFailed] = useState(false);
  const image = target?.featured?.imageUrl || target?.framing?.previewImageUrl;
  const view = framingPreviewView(target);
  const box = view ? { aspectRatio: view.aspect, minHeight: 0 } : undefined;
  if (image && !failed)
    return (
      <div className="planner-framing-library-preview" style={box}>
        <img
          alt={`${message(locale, "plannerFramingPreview")} — ${name}`}
          loading="lazy"
          onError={() => setFailed(true)}
          src={image}
          style={framingPreviewPictureStyle(view)}
        />
      </div>
    );
  return (
    <div
      className="planner-framing-library-preview is-unavailable"
      role="img"
      aria-label={`${message(locale, "plannerFramingPreview")} — ${name}`}
      style={box}
    />
  );
}

function scheduleTimeMarks(night, total, timeAtMinute, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    minute: "2-digit",
  });
  const start = new Date(night.start).getTime();
  const marks = [];
  for (let minute = 1; minute < total; minute += 1) {
    const parts = formatter.formatToParts(new Date(start + minute * 60000));
    if (Number(parts.find((part) => part.type === "minute")?.value) !== 0)
      continue;
    marks.push({ minute, label: timeAtMinute(minute) });
  }
  return marks;
}

function MoonAltitudeCurve({
  moonSeries,
  night,
  total,
  locale,
  variant = "timeline",
}) {
  if (!Array.isArray(moonSeries) || !moonSeries.length || total <= 0)
    return null;
  const start = new Date(night.start).getTime();
  const segments = [];
  let segment = [];
  const flush = () => {
    if (segment.length > 1) segments.push(segment);
    segment = [];
  };
  moonSeries.forEach((point) => {
    const altitude = Number(point?.altitude);
    const minute = (new Date(point?.time).getTime() - start) / 60000;
    if (
      !Number.isFinite(altitude) ||
      !Number.isFinite(minute) ||
      altitude < 0
    ) {
      flush();
      return;
    }
    const x = Math.max(0, Math.min(100, (minute / total) * 100));
    const y = 100 - Math.max(0, Math.min(90, altitude)) / 0.9;
    segment.push(`${x.toFixed(3)} ${y.toFixed(3)}`);
  });
  flush();
  if (!segments.length) return null;
  const [endX, endY] = segments.at(-1).at(-1).split(" ").map(Number);
  return (
    <>
      <svg
        className={`planner-schedule-moon-curve is-${variant}`}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {segments.map((points) => (
          <polyline key={points[0]} points={points.join(" ")} />
        ))}
      </svg>
      <span
        className={`planner-moon-curve-marker is-${variant}`}
        style={{ left: `${endX}%`, top: `${clamp(endY, 6, 94)}%` }}
        role="img"
        aria-label={message(locale, "plannerMoonAltitudeTimeline")}
      >
        ☾
      </span>
    </>
  );
}

function moonSeparationColor(separation, threshold) {
  if (!Number.isFinite(separation)) return "#aebbc2";
  if (separation < threshold) return "#f0a4b2";
  if (separation < threshold + 12) return "#f3b5a3";
  return "#a5d7c9";
}

function MoonSeparationArea({ card, moonSeries }) {
  if (!Array.isArray(moonSeries) || moonSeries.length < 2) return null;
  const threshold = Number(card.moonSeparationMinimum) || 25;
  const total = Math.min(card.series.length, moonSeries.length);
  const segments = [];
  for (let index = 0; index < total - 1; index += 1) {
    const current = card.series[index];
    const next = card.series[index + 1];
    const currentMoon = moonSeries[index];
    const nextMoon = moonSeries[index + 1];
    if (
      ![current, next, currentMoon, nextMoon].every(
        (point) => Number(point.altitude) >= 0,
      )
    )
      continue;
    const x1 = (index / Math.max(1, total - 1)) * 100;
    const x2 = ((index + 1) / Math.max(1, total - 1)) * 100;
    const y = (altitude) => 100 - Math.max(0, Math.min(90, altitude)) / 0.9;
    segments.push({
      key: `${index}-${current.time}`,
      points: `${x1},${y(current.altitude)} ${x2},${y(next.altitude)} ${x2},${y(nextMoon.altitude)} ${x1},${y(currentMoon.altitude)}`,
      gradientId: `planner-moon-separation-${card.target.id}-${index}`,
      startColor: moonSeparationColor(
        Number(current.moonSeparation),
        threshold,
      ),
      endColor: moonSeparationColor(Number(next.moonSeparation), threshold),
    });
  }
  if (!segments.length) return null;
  return (
    <svg
      className="planner-moon-separation-area"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {segments.map((segment) => (
          <linearGradient
            id={segment.gradientId}
            key={segment.gradientId}
            x1="0"
            x2="1"
            y1="0"
            y2="0"
          >
            <stop offset="0" stopColor={segment.startColor} />
            <stop offset="1" stopColor={segment.endColor} />
          </linearGradient>
        ))}
      </defs>
      {segments.map((segment) => (
        <polygon
          key={segment.key}
          points={segment.points}
          fill={`url(#${segment.gradientId})`}
        />
      ))}
    </svg>
  );
}

// The parts of the night outside the plan's chosen span, dimmed across the
// schedule's rows; nothing for the whole night.
function NightSpanScheduleShade({ nightSpan, night, startHour, endHour }) {
  const start = Date.parse(nightSpan?.start ?? "");
  const end = Date.parse(nightSpan?.end ?? "");
  const nightStart = Date.parse(night?.start ?? "");
  const nightEnd = Date.parse(night?.end ?? "");
  if (
    ![start, end, nightStart, nightEnd].every(Number.isFinite) ||
    !(nightEnd > nightStart)
  )
    return null;
  const percent = (value) =>
    Math.min(
      100,
      Math.max(0, ((value - nightStart) / (nightEnd - nightStart)) * 100),
    );
  const left = percent(start);
  const right = percent(end);
  return (
    <div
      className="planner-schedule-span"
      aria-hidden="true"
      data-span-start={nightSpan.start}
      data-span-end={nightSpan.end}
    >
      {left > 0 && (
        <span
          className="planner-schedule-span-out"
          style={{ left: 0, width: `${left}%` }}
        />
      )}
      {right < 100 && (
        <span
          className="planner-schedule-span-out"
          style={{ left: `${right}%`, width: `${100 - right}%` }}
        />
      )}
      <span
        className="planner-schedule-span-in"
        style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
      />
      {/* The two hours at the foot of the gold lines. */}
      {startHour && left > 0 && left < 100 && (
        <span
          className="planner-schedule-span-hour is-start"
          style={{ left: `${left}%` }}
        >
          {startHour}
        </span>
      )}
      {endHour && right > 0 && right < 100 && (
        <span
          className="planner-schedule-span-hour is-end"
          style={{ left: `${right}%` }}
        >
          {endHour}
        </span>
      )}
    </div>
  );
}

function PlanSchedule({
  cards,
  darkness = "astronomical",
  // The plan's custom span of the night, `{ start, end }`, or `null` for the
  // whole night. The rows dim what lies outside it.
  nightSpan = null,
  // How the blocks of the one row are
  // written, "intervals" (name and duration) or "numbers" (the order
  // number of the night in place of the name).
  display = "intervals",
  editingId,
  forecast,
  highlightedId = null,
  items,
  locale,
  night,
  onEdit,
  onWindowEditStart,
  onRemove,
  onScrollToRecommendations,
  onWindowChange,
  readOnly = false,
  timeZone,
  visualMode = false,
  // The plan's own framing fiche is only wired at the real plan editor's call
  // site -- the plan-merge preview reuses this same component but never passes
  // these, so it renders no fiche at all rather than a half-wired one whose
  // actions would go nowhere.
  framingResourcesById = null,
  planEquipment = null,
  onModifyFraming = null,
  onViewFramingInLibrary = null,
  // The fusion modal's
  // Résultat is this very interval editor. There, what the timeline shows
  // must be what gets saved, so every handle move is handed to
  // `onWindowChange` as it happens (`liveWindowChange`) rather than only on
  // the editor's ✓; each target carries a small cross (`onQuickRemove`);
  // the editor skips the target's full card (`showTargetDetails`), which the
  // modal has no room for. Every slot is on one row, the common stretch
  // of two that overlap in red, for every caller.
  liveWindowChange = false,
  onQuickRemove = null,
  quickRemoveLabel = null,
  showTargetDetails = true,
  // What the open card of a target adds under its legends -- the
  // multi-night plan's "Suivre sur plusieurs nuits" -- from
  // `{ item, card, availability, total, timeAtMinute }`. Only the real plan
  // editor passes it.
  renderEditorExtra = null,
  // "Prise de vue par cible": the short line of a target inside its block
  // when the block is wide enough, and its line, provenance and link in the
  // interval editor, from `{ viewOf(item, slot), open(itemId) }`. Only the
  // real plan editor passes it (the merge's preview does not).
  acquisition = null,
  // MERIDIAN-LIMIT-02a: `{ mount, safety }` of the plan -- its mount (with
  // the minutes it keeps tracking past the meridian) and its mountSafety. Only
  // the real plan editor passes it: a slot that tracks through meridian + N
  // gets the flip mark, its legend and its useful time.
  meridianCutContext = null,
}) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const total = nightMinutes(night);
  const selectedCards = cards.filter(
    (card) =>
      itemsById.has(card.target.id) &&
      !itemHasNoTimeTonight(itemsById.get(card.target.id)),
  );
  // The targets the last drag left with no time tonight stay in the
  // plan; the frise does not draw them, a chip lists them.
  const noTimeCards = cards.filter((card) =>
    itemHasNoTimeTonight(itemsById.get(card.target.id)),
  );
  const [placementNotice, setPlacementNotice] = useState(null);
  const [snappedHandle, setSnappedHandle] = useState(null);
  const [stackedSelectionLabels, setStackedSelectionLabels] = useState({});
  const [scheduleEditDraft, setScheduleEditDraft] = useState(null);
  const scheduleDragRef = useRef(null);
  const scheduleEditorHostRef = useRef(null);
  const scheduleDetailsHostRef = useRef(null);
  const selectionLabelRefs = useRef(new Map());
  const timeScaleRef = useRef(null);
  const [timeScaleWidth, setTimeScaleWidth] = useState(1000);
  // The width of a name in a block of the frise, measured on a canvas in the
  // block's own font (0.67 rem, bold); `null` where there is no canvas (a
  // server render), where the older rule stands.
  const measureScheduleBlockName = useMemo(
    () => createScheduleBlockMeasure(),
    [],
  );
  useLayoutEffect(() => {
    const element = timeScaleRef.current;
    if (!element) return;
    const measure = () =>
      setTimeScaleWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedCards.length]);

  useEffect(
    () => () => {
      const gesture = scheduleDragRef.current;
      if (gesture?.frame) cancelAnimationFrame(gesture.frame);
    },
    [],
  );

  useEffect(() => {
    if (!readOnly) return;
    const gesture = scheduleDragRef.current;
    if (gesture?.frame) cancelAnimationFrame(gesture.frame);
    scheduleDragRef.current = null;
    setScheduleEditDraft(null);
    setSnappedHandle(null);
  }, [readOnly]);

  const liveWindowChangeRef = useRef(null);
  liveWindowChangeRef.current = liveWindowChange ? onWindowChange : null;
  // The neighbours a drag pushed, written live (the merge's result) and put
  // back when the finger backs off: `base` holds their slot as it was.
  const liveOthersRef = useRef({ ids: new Set(), base: new Map() });
  useEffect(() => {
    if (!scheduleEditDraft || !liveWindowChangeRef.current) return;
    const write = liveWindowChangeRef.current;
    write(scheduleEditDraft.itemId, scheduleEditDraft.patch, {
      recordHistory: false,
    });
    const live = liveOthersRef.current;
    const others = scheduleEditDraft.others ?? {};
    for (const id of [...live.ids]) {
      if (id in others) continue;
      write(id, live.base.get(id) ?? {}, { recordHistory: false });
      live.ids.delete(id);
    }
    for (const [id, patch] of Object.entries(others)) {
      if (!live.ids.has(id)) {
        const item = itemsById.get(id);
        live.base.set(id, {
          startMinute: item?.startMinute,
          endMinute: item?.endMinute,
          durationMinutes: item?.durationMinutes,
          noTimeTonight: item?.noTimeTonight,
        });
        live.ids.add(id);
      }
      write(id, patch, { recordHistory: false });
    }
  }, [scheduleEditDraft]);

  const previewScheduleDrag = (gesture, value) => {
    const resolved = gesture.resolve(value);
    gesture.lastValue = value;
    gesture.patch = { ...gesture.patch, ...resolved.patch };
    setSnappedHandle(resolved.snappedHandle);
    gesture.others = resolved.others ?? {};
    gesture.preview = resolved.preview ?? null;
    setScheduleEditDraft((current) => ({
      itemId: gesture.itemId,
      patch: {
        ...(current?.itemId === gesture.itemId ? current.patch : {}),
        ...resolved.patch,
      },
      others: resolved.others ?? {},
      preview: resolved.preview ?? null,
    }));
  };

  const flushScheduleDrag = () => {
    const gesture = scheduleDragRef.current;
    if (!gesture || gesture.value === null) return;
    if (gesture.frame) {
      cancelAnimationFrame(gesture.frame);
      gesture.frame = null;
    }
    const value = gesture.value;
    gesture.value = null;
    previewScheduleDrag(gesture, value);
  };

  const queueScheduleDrag = (event) => {
    const gesture = scheduleDragRef.current;
    if (
      !gesture ||
      gesture.pointerId !== event.pointerId ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    event.preventDefault();
    gesture.value =
      minuteAtPointer(event, total) - gesture.pointerOffsetMinutes;
    if (gesture.frame) return;
    gesture.frame = requestAnimationFrame(() => {
      gesture.frame = null;
      flushScheduleDrag();
    });
  };

  const startScheduleDrag = (event, itemId, value, resolve) => {
    if (readOnly) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scheduleDragRef.current = {
      frame: null,
      itemId,
      lastValue: null,
      patch: {},
      others: {},
      preview: null,
      placement: null,
      pointerId: event.pointerId,
      pointerOffsetMinutes: minuteAtPointer(event, total) - value,
      resolve,
      value: null,
    };
  };

  const endScheduleDrag = (event) => {
    const gesture = scheduleDragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.frame) {
      cancelAnimationFrame(gesture.frame);
      gesture.frame = null;
    }
    const finalValue = gesture.value ?? gesture.lastValue;
    if (finalValue !== null) previewScheduleDrag(gesture, finalValue);
    scheduleDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    writeScheduleRetouch(
      gesture.itemId,
      gesture.patch,
      gesture.others,
      gesture.preview,
    );
  };

  // No "Valider". What a handle, the moved
  // range, an arrow key or ↔ changed is written as soon as it is let go --
  // the first write of an opening of the editor as one undoable change
  // (`onWindowEditStart` with this opening's `editSession`, which the page
  // uses to join the next ones), so closing the editor, opening another
  // target or leaving loses nothing, and "Annuler" takes it back.
  const editSession = useMemo(() => ({ itemId: editingId }), [editingId]);
  const slotKeys = [
    "startMinute",
    "endMinute",
    "durationMinutes",
    "noTimeTonight",
  ];
  const writeScheduleRetouch = (itemId, patch, others = {}, preview = null) => {
    setScheduleEditDraft(null);
    liveOthersRef.current = { ids: new Set(), base: new Map() };
    const item = itemsById.get(itemId);
    if (readOnly || !item || !patch) return;
    const changes = (id, change) =>
      Object.entries(change).some(
        ([key, value]) => itemsById.get(id)?.[key] !== value,
      );
    const changedOthers = Object.entries(others).filter(([id, change]) =>
      changes(id, change),
    );
    if (!changes(itemId, patch) && !changedOthers.length) return;
    // What stood before: "Annuler" puts exactly that back.
    const before = new Map(
      [itemId, ...changedOthers.map(([id]) => id)].map((id) => [
        id,
        Object.fromEntries(
          slotKeys.map((key) => [key, itemsById.get(id)?.[key]]),
        ),
      ]),
    );
    onWindowEditStart(itemId, editSession);
    onWindowChange(itemId, patch, { recordHistory: false });
    for (const [id, change] of changedOthers)
      onWindowChange(id, change, { recordHistory: false });
    setPlacementNotice(
      preview?.lines?.length ? { lines: preview.lines, before } : null,
    );
  };
  const undoPlacement = () => {
    if (!placementNotice || readOnly) return;
    for (const [id, keys] of placementNotice.before)
      onWindowChange(id, keys, { recordHistory: false });
    setPlacementNotice(null);
  };

  const baseSchedule = selectedCards.map((card) => {
    const item = itemsById.get(card.target.id);
    return { card, item, window: plannedWindow(item, card, night) };
  });
  const schedule = baseSchedule.map((entry) => {
    const patch =
      scheduleEditDraft?.itemId === entry.item.id
        ? scheduleEditDraft.patch
        : scheduleEditDraft?.others?.[entry.item.id];
    if (!patch) return entry;
    const item = { ...entry.item, ...patch };
    return { ...entry, item, window: plannedWindow(item, entry.card, night) };
  });
  const hasEditingItem =
    !readOnly && schedule.some(({ item }) => item.id === editingId);
  const timelineTickLayout = baseSchedule
    .map(({ item, window }) => `${item.id}:${window.start}:${window.end}`)
    .join("|");
  // The one row paints the slots by start, then end, then list order —
  // of two that overlap the later lies over the earlier — and numbers them in
  // that order from the plan as it is written (not from a draft being dragged).
  const renderOrder = scheduleRowOrder(schedule);
  const numberById = scheduleOrderNumbers(baseSchedule);
  // The block that was open goes back up to its hole when the card
  // closes (220 ms; nothing with reduced motion).
  const [landedId, setLandedId] = useState(null);
  const lastEditingRef = useRef(null);
  useEffect(() => {
    const before = lastEditingRef.current;
    lastEditingRef.current = editingId;
    if (!before || before === editingId) return undefined;
    setLandedId(before);
    const timer = setTimeout(() => setLandedId(null), 260);
    return () => clearTimeout(timer);
  }, [editingId]);

  useLayoutEffect(() => {
    let frame = null;
    const updateCollisionState = () => {
      frame = null;
      const next = {};
      schedule.forEach(({ item }) => {
        const start = selectionLabelRefs.current.get(`${item.id}:start`);
        const end = selectionLabelRefs.current.get(`${item.id}:end`);
        if (!start || !end) return;
        const startBounds = start.getBoundingClientRect();
        const endBounds = end.getBoundingClientRect();
        if (startBounds.right + 4 > endBounds.left) next[item.id] = true;
      });
      setStackedSelectionLabels((current) => {
        const currentIds = Object.keys(current);
        const nextIds = Object.keys(next);
        if (
          currentIds.length === nextIds.length &&
          currentIds.every((id) => next[id])
        )
          return current;
        return next;
      });
    };
    const scheduleMeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateCollisionState);
    };
    scheduleMeasure();
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(scheduleMeasure)
        : null;
    selectionLabelRefs.current.forEach((element) => observer?.observe(element));
    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
    };
  }, [editingId, timelineTickLayout]);

  const timeAtMinute = (minute) =>
    time(
      new Date(new Date(night.start).getTime() + minute * 60000),
      locale,
      timeZone,
    );
  const timelineTimeMarks = scheduleTimeMarks(
    night,
    total,
    timeAtMinute,
    timeZone,
  );

  // The short line "120 s · g100 · UV/IR" is inside the label of a block that
  // is wide enough (118 px) to carry its name, below its name and its
  // duration; a narrower label has nothing, and no text is ever drawn outside
  // a block. The block grows by 12 px downward, and the row with it.
  const blockLines = new Map();
  if (acquisition && display !== "numbers")
    for (const entry of renderOrder) {
      const widthPixels =
        ((entry.window.end - entry.window.start) / total) * timeScaleWidth;
      if (widthPixels < acquisitionBlockLineMinWidth) continue;
      const mark = scheduleBlockMark({
        name: plannerTimelineLabel(entry.card.target),
        number: numberById.get(entry.item.id),
        widthPixels,
        measure: measureScheduleBlockName,
      });
      if (mark !== "name") continue;
      const line = acquisitionBlockLine(locale, {
        width: widthPixels,
        view: acquisition.viewOf(entry.item),
      });
      if (line) blockLines.set(entry.item.id, line);
    }

  if (!selectedCards.length) {
    return (
      <section
        className="planner-empty-plan"
        aria-label={message(locale, "plannerEmptyPlanTitle")}
      >
        <button
          className="planner-empty-plan-icon"
          type="button"
          aria-label={message(locale, "plannerBrowseRecommendations")}
          title={message(locale, "plannerBrowseRecommendations")}
          onClick={onScrollToRecommendations}
        >
          +
        </button>
        {/* The invitation « Commencez ce plan d'observation » is the
            timeline's totals line, right above; the card does not say it
            again, it says how. */}
        <div>
          <p>{message(locale, "plannerEmptyPlan")}</p>
        </div>
      </section>
    );
  }

  return (
    <div className="planner-schedule">
      {forecast?.status === "ready" && forecast.value && (
        <HourlyForecast
          forecast={forecast.value}
          locale={locale}
          night={night}
          timeZone={timeZone}
        />
      )}
      <div
        className="planner-schedule-night"
        aria-label={message(locale, darknessLabelKey(darkness))}
      >
        <span>☼ {time(night.start, locale, timeZone)}</span>
        <strong>{message(locale, darknessLabelKey(darkness))}</strong>
        <span>{time(night.end, locale, timeZone)} ☼</span>
      </div>
      <div className="planner-schedule-time-scale" ref={timeScaleRef}>
        {timelineTimeMarks
          .filter((mark, index) => {
            const x = (mark.minute / total) * timeScaleWidth;
            const step = Math.max(
              1,
              Math.ceil((total * 38) / (timeScaleWidth * 60)),
            );
            return index % step === 0 && x >= 16 && x <= timeScaleWidth - 16;
          })
          .map((mark) => (
            <span
              className="planner-schedule-time-mark"
              key={mark.minute}
              style={{ left: `${(mark.minute / total) * 100}%` }}
            >
              {mark.label}
            </span>
          ))}
      </div>
      <div
        className={`planner-schedule-rows${nightSpan ? " has-span" : ""}${
          blockLines.size ? " has-acquisition-line" : ""
        }`}
      >
        <NightSpanScheduleShade
          nightSpan={nightSpan}
          night={night}
          startHour={
            nightSpan
              ? timeAtMinute(
                  (Date.parse(nightSpan.start) - Date.parse(night.start)) /
                    60000,
                )
              : null
          }
          endHour={
            nightSpan
              ? timeAtMinute(
                  (Date.parse(nightSpan.end) - Date.parse(night.start)) / 60000,
                )
              : null
          }
        />
        <div className="planner-schedule-shared-moon" aria-hidden="true">
          <MoonAltitudeCurve
            locale={locale}
            moonSeries={night.moonSeries}
            night={night}
            total={total}
            variant="overview"
          />
        </div>
        {timelineTimeMarks.map((mark) => (
          <span
            className="planner-schedule-hour-guide"
            key={mark.minute}
            style={{ left: `${(mark.minute / total) * 100}%` }}
          />
        ))}
        <div className="planner-schedule-row" data-planner-schedule-row="">
          {/* Where the touched neighbours were (grey, dashed) and, while
          the dragged slot is held back, where the pointer is (yellow). */}
          {scheduleEditDraft?.preview &&
            Object.entries(scheduleEditDraft.preview.origins).map(
              ([id, origin]) => (
                <span
                  aria-hidden="true"
                  className="planner-placement-origin"
                  key={`origin-${id}`}
                  style={{
                    left: `${(origin.start / total) * 100}%`,
                    width: `${((origin.end - origin.start) / total) * 100}%`,
                  }}
                />
              ),
            )}
          {scheduleEditDraft?.preview?.resisting &&
            Math.abs(
              scheduleEditDraft.preview.fingerStart -
                scheduleEditDraft.preview.start,
            ) >= 1 && (
              <span
                aria-hidden="true"
                className="planner-placement-finger"
                style={{
                  left: `${(scheduleEditDraft.preview.fingerStart / total) * 100}%`,
                  width: `${((scheduleEditDraft.preview.fingerEnd - scheduleEditDraft.preview.fingerStart) / total) * 100}%`,
                }}
              />
            )}
          {renderOrder.map((entry) => {
            const { card, item, window } = entry;
            // The drawn extent is exactly the slot's window.
            const left = (window.start / total) * 100;
            const width = ((window.end - window.start) / total) * 100;
            // A block carries its name and its duration when it is wide enough;
            // a 20 minute block is a block, nothing else.
            const title = plannerTargetTitle(card.target);
            const timelineLabel = plannerTimelineLabel(card.target);
            // The name when it fits whole, else its number, block by block;
            // never a name cut to "M…".
            const blockMark = scheduleBlockMark({
              name: timelineLabel,
              number: numberById.get(item.id),
              widthPixels: (width / 100) * timeScaleWidth,
              measure: measureScheduleBlockName,
            });
            const showsContent = blockMark === "name";
            const showsNumber = display === "numbers" || blockMark === "number";
            const isEditing = !readOnly && editingId === item.id;
            const duration = Math.max(0, window.end - window.start);
            const overlaps = overlapSegments(entry, schedule);
            const meridian = meridianTransit(card, night);
            const meridianIsInSelection =
              meridian &&
              meridian.minute >= window.start &&
              meridian.minute <= window.end;
            const flipCut = meridianCutContext
              ? meridianCut(
                  window,
                  card,
                  night,
                  meridianCutContext.mount,
                  meridianCutContext.safety,
                )
              : null;
            const hasLowAltitudeSegment = card.series.some(
              (point) => point.altitude < Number(card.minAltitude || 30),
            );
            const hasHorizonSegment = card.series.some(
              (point) => point.horizonBlocked,
            );
            const selectedLowAltitudeSegment = card.series.some((point) => {
              const pointMinute = Math.round(
                (new Date(point.time).getTime() -
                  new Date(night.start).getTime()) /
                  60000,
              );
              return (
                point.altitude < Number(card.minAltitude || 30) &&
                pointMinute >= window.start &&
                pointMinute <= window.end
              );
            });
            const selectedHorizonSegment = card.series.some((point) => {
              const pointMinute = Math.round(
                (new Date(point.time).getTime() -
                  new Date(night.start).getTime()) /
                  60000,
              );
              return (
                point.horizonBlocked &&
                pointMinute >= window.start &&
                pointMinute <= window.end
              );
            });
            const closestMoonPoint = card.series
              .map((point) => ({
                point,
                minute: Math.round(
                  (new Date(point.time).getTime() -
                    new Date(night.start).getTime()) /
                    60000,
                ),
              }))
              .filter(
                ({ point, minute }) =>
                  Number.isFinite(Number(point.moonSeparation)) &&
                  minute >= window.start &&
                  minute <= window.end,
              )
              .reduce(
                (closest, candidate) =>
                  !closest ||
                  candidate.point.moonSeparation < closest.point.moonSeparation
                    ? candidate
                    : closest,
                null,
              );
            // Start/end labels have variable widths depending on locale, font
            // scaling and viewport. Their actual rendered bounds decide whether
            // the end label needs a second line.
            const crowdedSelectionLabels = Boolean(
              stackedSelectionLabels[item.id],
            );
            // The left handle always changes the start, the right one always
            // the end, overlap or not.
            const resolveStart = (value) => {
              const update = scheduleStartUpdate({
                value,
                itemId: item.id,
                schedule,
                window,
              });
              return {
                patch: update.patch,
                snappedHandle: update.snapped ? `${item.id}:start` : null,
              };
            };
            const setStart = (value) => {
              const resolved = resolveStart(value);
              setSnappedHandle(resolved.snappedHandle);
              writeScheduleRetouch(item.id, resolved.patch);
            };
            const resolveEnd = (value) => {
              const snapped = snapToScheduleEdge(
                value,
                item.id,
                schedule,
                window.start + 5,
                total,
              );
              return {
                patch: { endMinute: snapped.value },
                snappedHandle: snapped.snapped ? `${item.id}:end` : null,
              };
            };
            // Pressing and dragging the selected range moves the whole
            // slot, duration kept, either edge snapping to a neighbour.
            // The neighbours react (the one in the way resists, is
            // compressed, escapes to the biggest free stretch or, with none,
            // is covered: "no more time tonight"). The edge snap only holds
            // while nothing is touched.
            const resolveShift = (value) => {
              const gesture = scheduleDragRef.current;
              if (!gesture.placement) {
                const slots = placementSlotsOf(baseSchedule, item.id);
                gesture.origin = slots;
                gesture.placement = createPlacementGesture({
                  items: slots,
                  movingId: item.id,
                  lo: 0,
                  hi: total,
                });
              }
              const touches = (scene) =>
                scene.hopped.length > 0 ||
                Object.values(scene.items).some(
                  (place) => place.state !== "solid",
                );
              let scene = gesture.placement.update(value);
              let snappedEdge = null;
              if (!touches(scene)) {
                const update = scheduleWindowShift({
                  value,
                  itemId: item.id,
                  schedule: baseSchedule,
                  window,
                  total,
                });
                if (update.snapped) {
                  const edge = update.patch.startMinute;
                  const candidate = gesture.placement.update(edge);
                  if (
                    !touches(candidate) &&
                    Math.abs(candidate.start - edge) < 0.5
                  ) {
                    scene = candidate;
                    snappedEdge = update.snappedEdge;
                  } else scene = gesture.placement.update(value);
                }
              }
              const commit = placementCommit(gesture.placement, scene);
              const reading = placementReading({
                scene,
                commit,
                origin: gesture.origin,
                asked: value,
              });
              return {
                patch: {
                  startMinute: commit.moving.start,
                  endMinute: commit.moving.end,
                },
                snappedHandle: snappedEdge ? `${item.id}:${snappedEdge}` : null,
                others: reading.others,
                preview: reading.preview,
              };
            };
            const setEnd = (value) => {
              const resolved = resolveEnd(value);
              setSnappedHandle(resolved.snappedHandle);
              writeScheduleRetouch(item.id, resolved.patch);
            };
            // How the slot sits against the night the plan
            // chose — entirely outside, grey and dashed; on a line, gold inside
            // and grey outside, its name grey when less than half is inside.
            const nightOrigin = Date.parse(night.start);
            const reading = nightSpan
              ? readSlotAgainstSpan({
                  start: nightOrigin + window.start * 60000,
                  end: nightOrigin + window.end * 60000,
                  span: nightSpan,
                })
              : null;
            const spanLeft = nightSpan
              ? ((Date.parse(nightSpan.start) - nightOrigin) / 60000 / total) *
                100
              : 0;
            const spanRight = nightSpan
              ? ((Date.parse(nightSpan.end) - nightOrigin) / 60000 / total) *
                100
              : 100;
            return (
              <Fragment key={item.id}>
                <button
                  className={`planner-schedule-block${isEditing ? " is-editing" : ""}${
                    scheduleEditDraft?.others?.[item.id]
                      ? scheduleEditDraft.preview?.lines?.some(
                          (line) =>
                            line.id === item.id &&
                            (line.kind === "movedLeft" ||
                              line.kind === "movedRight"),
                        )
                        ? " is-risen"
                        : " is-pushed"
                      : ""
                  }${
                    overlaps.length ? " has-overlap" : ""
                  }${onQuickRemove && !readOnly ? " has-quick-remove" : ""}${
                    reading?.fit === "outside" ? " is-beyond" : ""
                  }${reading?.greyed ? " is-greyed" : ""}${
                    highlightedId === item.id ? " is-revealed" : ""
                  }${landedId === item.id ? " is-landing" : ""}${
                    blockLines.has(item.id) ? " has-acquisition-line" : ""
                  }${
                    showsNumber
                      ? " is-numbered"
                      : showsContent
                        ? ""
                        : " is-compact"
                  }`}
                  data-planner-schedule-item={item.id}
                  type="button"
                  style={{ left: `${left}%`, width: `${width}%` }}
                  disabled={readOnly}
                  aria-label={showsNumber || !showsContent ? title : undefined}
                  onClick={() => {
                    if (!readOnly) {
                      setScheduleEditDraft(null);
                      setSnappedHandle(null);
                      onEdit(isEditing ? null : item.id);
                    }
                  }}
                  title={title}
                >
                  {showsNumber ? (
                    <strong>{numberById.get(item.id)}</strong>
                  ) : showsContent ? (
                    <>
                      <strong>{timelineLabel}</strong>
                      {scheduleBlockCarriesContent(
                        (width / 100) * timeScaleWidth,
                      ) && <span>{durationText(duration, locale)}</span>}
                      {blockLines.has(item.id) && (
                        <span
                          className="planner-schedule-block-acquisition"
                          data-acquisition="block"
                        >
                          {blockLines.get(item.id)}
                        </span>
                      )}
                    </>
                  ) : null}
                </button>
                {reading?.fit === "straddling" &&
                  [
                    [left, Math.min(left + width, spanLeft)],
                    [Math.max(left, spanRight), left + width],
                  ]
                    .filter(([from, to]) => to > from)
                    .map(([from, to]) => (
                      <span
                        aria-hidden="true"
                        className="planner-schedule-block-beyond"
                        data-beyond-span="true"
                        key={`beyond-${from}`}
                        style={{ left: `${from}%`, width: `${to - from}%` }}
                      />
                    ))}
                {overlaps.map((segment) => (
                  <span
                    aria-hidden="true"
                    className="planner-schedule-row-overlap"
                    key={`overlap-${segment.start}-${segment.end}`}
                    style={{
                      left: `${(segment.start / total) * 100}%`,
                      width: `${((segment.end - segment.start) / total) * 100}%`,
                    }}
                  />
                ))}
                {onQuickRemove && !readOnly && (
                  <button
                    className="planner-schedule-block-remove"
                    type="button"
                    style={{
                      left: `min(calc(${left + width}% - 0.7rem), calc(100% - 1.25rem))`,
                    }}
                    aria-label={
                      quickRemoveLabel ? quickRemoveLabel(timelineLabel) : title
                    }
                    title={
                      quickRemoveLabel ? quickRemoveLabel(timelineLabel) : title
                    }
                    onClick={() => {
                      if (isEditing) {
                        setScheduleEditDraft(null);
                        setSnappedHandle(null);
                      }
                      onQuickRemove(item.id);
                    }}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <line x1="17" y1="7" x2="7" y2="17" />
                      <line x1="7" y1="7" x2="17" y2="17" />
                    </svg>
                  </button>
                )}
                {isEditing &&
                  scheduleEditorHostRef.current &&
                  createPortal(
                    <>
                      <section
                        className="planner-schedule-editor"
                        aria-label={title}
                      >
                        <div className="planner-schedule-editor-heading">
                          <div>
                            <h3>{title}</h3>
                            <p className="planner-schedule-editor-subtitle">
                              {[
                                card.target.skyTarget?.type,
                                card.target.skyTarget?.constellation,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <strong
                            data-planner-schedule-useful={
                              flipCut ? "" : undefined
                            }
                          >
                            {flipCut
                              ? message(
                                  locale,
                                  "scheduleUsefulDuration",
                                ).replace(
                                  "{duration}",
                                  durationText(flipCut.usefulMinutes, locale),
                                )
                              : durationText(duration, locale)}
                          </strong>
                        </div>
                        <div className="planner-schedule-curve">
                          <AvailabilityGraph
                            card={card}
                            highlightHorizon={selectedHorizonSegment}
                            highlightLowAltitude={selectedLowAltitudeSegment}
                          />
                          <MoonSeparationArea
                            card={card}
                            moonSeries={night.moonSeries}
                          />
                          <MoonAltitudeCurve
                            locale={locale}
                            moonSeries={night.moonSeries}
                            night={night}
                            total={total}
                            variant="editor"
                          />
                          <div
                            className={`planner-schedule-selection${
                              readOnly ? "" : " is-movable"
                            }`}
                            data-planner-schedule-selection={item.id}
                            style={{
                              left: `${(window.start / total) * 100}%`,
                              width: `${((window.end - window.start) / total) * 100}%`,
                            }}
                            onPointerDown={(event) => {
                              // A plain drag moves the slot with any
                              // pointer, from the first movement (a finger
                              // included: the range is `touch-action: pan-y`,
                              // so a vertical drag still scrolls the page and
                              // a horizontal one is the slot's).
                              startScheduleDrag(
                                event,
                                item.id,
                                window.start,
                                resolveShift,
                              );
                            }}
                            onPointerMove={queueScheduleDrag}
                            onPointerUp={endScheduleDrag}
                            onPointerCancel={endScheduleDrag}
                          />
                          {overlaps.map((segment) => (
                            <span
                              className="planner-schedule-overlap"
                              key={`${segment.start}-${segment.end}`}
                              style={{
                                left: `${(segment.start / total) * 100}%`,
                                width: `${((segment.end - segment.start) / total) * 100}%`,
                              }}
                            />
                          ))}
                          {meridian && (
                            <span
                              className={`planner-schedule-meridian-marker${
                                meridianIsInSelection ? " is-in-selection" : ""
                              }`}
                              style={{
                                left: `${(meridian.minute / total) * 100}%`,
                              }}
                              role="img"
                              aria-label={`${message(locale, "plannerMeridianFlip")} · ${timeAtMinute(meridian.minute)}`}
                              title={`${message(locale, "plannerMeridianFlip")} · ${timeAtMinute(meridian.minute)}`}
                            />
                          )}
                          {flipCut && (
                            <>
                              <span
                                className="planner-schedule-flip-band"
                                role="img"
                                aria-label={message(
                                  locale,
                                  "scheduleFlipTitle",
                                ).replace(
                                  "{time}",
                                  timeAtMinute(flipCut.markMinute),
                                )}
                                style={{
                                  left: `${(flipCut.markMinute / total) * 100}%`,
                                  width: `${((flipCut.flipEndMinute - flipCut.markMinute) / total) * 100}%`,
                                }}
                              />
                              <span
                                className="planner-schedule-flip-label"
                                aria-hidden="true"
                                style={{
                                  left: `${(flipCut.markMinute / total) * 100}%`,
                                }}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M4 12a8 8 0 1 0 3-6.2M4 4v4.5h4.5" />
                                </svg>
                                {timeAtMinute(flipCut.markMinute)}
                              </span>
                            </>
                          )}
                          <button
                            className={`planner-schedule-handle is-start${
                              snappedHandle === `${item.id}:start`
                                ? " is-snapped"
                                : ""
                            }`}
                            aria-label={message(locale, "plannerStartTime")}
                            aria-orientation="horizontal"
                            aria-valuemin={0}
                            aria-valuemax={Math.max(0, window.end - 5)}
                            aria-valuenow={window.start}
                            role="slider"
                            style={{ left: `${(window.start / total) * 100}%` }}
                            type="button"
                            onKeyDown={(event) => {
                              const step = event.shiftKey ? 10 : 5;
                              if (
                                event.key === "ArrowLeft" ||
                                event.key === "ArrowDown"
                              ) {
                                event.preventDefault();
                                setStart(window.start - step);
                              }
                              if (
                                event.key === "ArrowRight" ||
                                event.key === "ArrowUp"
                              ) {
                                event.preventDefault();
                                setStart(window.start + step);
                              }
                            }}
                            onPointerDown={(event) => {
                              if (
                                nearestHandle(event, total, window, "start") ===
                                "end"
                              ) {
                                startScheduleDrag(
                                  event,
                                  item.id,
                                  window.end,
                                  resolveEnd,
                                );
                                return;
                              }
                              startScheduleDrag(
                                event,
                                item.id,
                                window.start,
                                resolveStart,
                              );
                            }}
                            onPointerMove={queueScheduleDrag}
                            onPointerUp={endScheduleDrag}
                            onPointerCancel={endScheduleDrag}
                          />
                          <button
                            className={`planner-schedule-handle is-end${
                              snappedHandle === `${item.id}:end`
                                ? " is-snapped"
                                : ""
                            }`}
                            aria-label={message(locale, "plannerEndTime")}
                            aria-orientation="horizontal"
                            aria-valuemin={Math.min(total, window.start + 5)}
                            aria-valuemax={total}
                            aria-valuenow={window.end}
                            role="slider"
                            style={{ left: `${(window.end / total) * 100}%` }}
                            type="button"
                            onKeyDown={(event) => {
                              const step = event.shiftKey ? 10 : 5;
                              if (
                                event.key === "ArrowLeft" ||
                                event.key === "ArrowDown"
                              ) {
                                event.preventDefault();
                                setEnd(window.end - step);
                              }
                              if (
                                event.key === "ArrowRight" ||
                                event.key === "ArrowUp"
                              ) {
                                event.preventDefault();
                                setEnd(window.end + step);
                              }
                            }}
                            onPointerDown={(event) => {
                              if (
                                nearestHandle(event, total, window, "end") ===
                                "start"
                              ) {
                                startScheduleDrag(
                                  event,
                                  item.id,
                                  window.start,
                                  resolveStart,
                                );
                                return;
                              }
                              startScheduleDrag(
                                event,
                                item.id,
                                window.end,
                                resolveEnd,
                              );
                            }}
                            onPointerMove={queueScheduleDrag}
                            onPointerUp={endScheduleDrag}
                            onPointerCancel={endScheduleDrag}
                          />
                        </div>
                        <div className="planner-schedule-axis">
                          <span className="planner-schedule-axis-edge is-start">
                            {time(night.start, locale, timeZone)}
                          </span>
                          <span className="planner-schedule-axis-edge is-end">
                            {time(night.end, locale, timeZone)}
                          </span>
                          <span
                            className="planner-schedule-axis-selection is-start"
                            style={{ left: `${(window.start / total) * 100}%` }}
                            ref={(element) => {
                              const key = `${item.id}:start`;
                              if (element)
                                selectionLabelRefs.current.set(key, element);
                              else selectionLabelRefs.current.delete(key);
                            }}
                          >
                            <b>{message(locale, "plannerStart")}</b>{" "}
                            {timeAtMinute(window.start)}
                          </span>
                          <span
                            className={`planner-schedule-axis-selection is-end${
                              crowdedSelectionLabels ? " is-crowded" : ""
                            }`}
                            style={{ left: `${(window.end / total) * 100}%` }}
                            ref={(element) => {
                              const key = `${item.id}:end`;
                              if (element)
                                selectionLabelRefs.current.set(key, element);
                              else selectionLabelRefs.current.delete(key);
                            }}
                          >
                            <b>{message(locale, "plannerEnd")}</b>{" "}
                            {timeAtMinute(window.end)}
                          </span>
                        </div>
                        <div className="planner-schedule-editor-foot">
                          {acquisition && (
                            <AcquisitionEditorLine
                              locale={locale}
                              view={acquisition.viewOf(item, {
                                startMinute: window.start,
                                endMinute: window.end,
                              })}
                              onOpen={() => acquisition.open(item.id)}
                            />
                          )}
                          <div className="planner-schedule-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setSnappedHandle(null);
                                // The room between the
                                // neighbouring targets, or the night's bounds
                                // (the plan's chosen span when it has one).
                                const patch = scheduleExtendPatch({
                                  itemId: item.id,
                                  window,
                                  schedule,
                                  bounds: scheduleExtendBounds({
                                    nightStart: night.start,
                                    total,
                                    span: nightSpan,
                                  }),
                                });
                                writeScheduleRetouch(item.id, patch);
                              }}
                              aria-label={message(
                                locale,
                                "plannerFillAvailability",
                              )}
                              title={message(locale, "plannerFillAvailability")}
                            >
                              ↔
                            </button>
                            <button
                              className="is-remove"
                              type="button"
                              onClick={() => {
                                setScheduleEditDraft(null);
                                onRemove(item.id);
                              }}
                              aria-label={message(locale, "plannerRemove")}
                              title={message(locale, "plannerRemove")}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M5 7h14M10 11v5M14 11v5M8 7l.8-3h6.4l.8 3M7 7l.8 13h8.4L17 7" />
                              </svg>
                            </button>
                            {/* The tick closes the edit line (no ✕ on the
                          web): every release has already written the slot. */}
                            <button
                              className="is-validate"
                              type="button"
                              onClick={() => {
                                setScheduleEditDraft(null);
                                setSnappedHandle(null);
                                onEdit(null);
                              }}
                              aria-label={message(
                                locale,
                                "plannerSlotValidate",
                              )}
                              title={message(locale, "plannerSlotValidate")}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7.5" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="planner-schedule-legends">
                          {closestMoonPoint && (
                            <p className="planner-schedule-moon-separation-summary">
                              <span aria-hidden="true">☾</span>
                              {message(locale, "plannerMoonSeparationSummary")
                                .replace(
                                  "{distance}",
                                  decimal(
                                    closestMoonPoint.point.moonSeparation,
                                    locale,
                                    0,
                                  ),
                                )
                                .replace(
                                  "{time}",
                                  timeAtMinute(closestMoonPoint.minute),
                                )}
                            </p>
                          )}
                          {flipCut && (
                            <p className="planner-schedule-flip-legend">
                              <strong>
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M4 12a8 8 0 1 0 3-6.2M4 4v4.5h4.5" />
                                </svg>
                                {message(locale, "scheduleFlipTitle").replace(
                                  "{time}",
                                  timeAtMinute(flipCut.markMinute),
                                )}
                              </strong>
                              <span>
                                {message(locale, "scheduleFlipDetail")
                                  .replace(
                                    "{transit}",
                                    timeAtMinute(flipCut.transitMinute),
                                  )
                                  .replace("{limit}", flipCut.limitMinutes)
                                  .replace("{flip}", flipCut.flipMinutes)}
                              </span>
                            </p>
                          )}
                          {meridian && (
                            <p className="planner-schedule-meridian-legend">
                              <i aria-hidden="true" />
                              {message(locale, "plannerMeridianFlipLegend")}
                            </p>
                          )}
                          {hasLowAltitudeSegment && (
                            <p className="planner-schedule-altitude-legend">
                              <i aria-hidden="true" />
                              {flow(locale, "belowMinimum").replace(
                                "{altitude}",
                                `${decimal(card.minAltitude, locale, 0)}°`,
                              )}
                            </p>
                          )}
                          {hasHorizonSegment && (
                            <p className="planner-schedule-horizon-legend">
                              <i aria-hidden="true" />
                              {flow(locale, "behindHorizon")}
                            </p>
                          )}
                        </div>
                        {renderEditorExtra?.({
                          item,
                          card,
                          availability: window.availability,
                          total,
                          timeAtMinute,
                        })}
                      </section>
                    </>,
                    scheduleEditorHostRef.current,
                  )}
                {isEditing &&
                  showTargetDetails &&
                  scheduleDetailsHostRef.current &&
                  createPortal(
                    <div className="planner-schedule-target-details">
                      <TargetCard
                        card={card}
                        locale={locale}
                        timeZone={timeZone}
                        field={night.field}
                        showAction={false}
                        visualMode={visualMode}
                        framingFiche={
                          framingResourcesById
                            ? {
                                resource: framingResourcesById.get(
                                  card.target.framingId,
                                ),
                                planEquipment,
                                readOnly,
                                onModify: onModifyFraming,
                                onView: onViewFramingInLibrary,
                              }
                            : null
                        }
                      />
                    </div>,
                    scheduleDetailsHostRef.current,
                  )}
              </Fragment>
            );
          })}
        </div>
        {/* Under the row, the edit line — a dashed line with its help at
          rest; the card of the open slot takes its place. */}
        {!readOnly && (
          <>
            <div className="planner-schedule-edit-line" hidden={hasEditingItem}>
              {message(locale, "plannerScheduleEditLineHelp")}
            </div>
            <div
              className="planner-schedule-editor-host"
              ref={scheduleEditorHostRef}
            />
          </>
        )}
      </div>
      <PlacementReadout
        chips={noTimeCards.map((card) => plannerTimelineLabel(card.target))}
        locale={locale}
        lines={
          scheduleEditDraft?.preview?.lines?.length
            ? scheduleEditDraft.preview.lines
            : (placementNotice?.lines ?? [])
        }
        nameOf={(id) => {
          const card = cards.find((candidate) => candidate.target.id === id);
          return card ? plannerTimelineLabel(card.target) : id;
        }}
        hourOf={timeAtMinute}
        onUndo={
          !scheduleEditDraft?.preview?.lines?.length && placementNotice
            ? undoPlacement
            : null
        }
        previewing={Boolean(scheduleEditDraft?.preview?.lines?.length)}
      />
      <div
        className="planner-schedule-details-host"
        ref={scheduleDetailsHostRef}
      />
    </div>
  );
}

/**
 * Under the frise, the line that says what a drag does to the other targets --
 * before the release ("Aperçu avant de lâcher"), after it with "Annuler" -- and
 * the chips of the targets left with no time tonight (they stay in the plan).
 */
function PlacementReadout({
  chips,
  hourOf,
  lines,
  locale,
  nameOf,
  onUndo,
  previewing,
}) {
  if (!lines.length && !chips.length) return null;
  const text = (line) => {
    const name = nameOf(line.id);
    const span = `${hourOf(line.to.start)} → ${hourOf(line.to.end)}`;
    if (line.kind === "noTime")
      return message(locale, "plannerPlacementLineNoTime").replace(
        "{name}",
        name,
      );
    const fromMinutes = line.from.end - line.from.start;
    const toMinutes = line.to.end - line.to.start;
    if (line.kind === "shortened")
      return message(locale, "plannerPlacementLineShortened")
        .replace("{name}", name)
        .replace("{from}", String(fromMinutes))
        .replace("{to}", String(toMinutes))
        .replace("{span}", span);
    const moved = message(
      locale,
      line.kind === "movedLeft"
        ? "plannerPlacementLineMovedLeft"
        : "plannerPlacementLineMovedRight",
    )
      .replace("{name}", name)
      .replace("{span}", span);
    return toMinutes < fromMinutes
      ? `${moved} ${message(locale, "plannerPlacementLineInstead")
          .replace("{to}", String(toMinutes))
          .replace("{from}", String(fromMinutes))}`
      : moved;
  };
  return (
    <div className="planner-placement-readout">
      {lines.length > 0 && (
        <div
          className={`planner-placement-lines${previewing ? " is-preview" : ""}`}
          role="status"
        >
          {previewing && (
            <p className="planner-placement-title">
              {message(locale, "plannerPlacementPreviewTitle")}
            </p>
          )}
          {lines.map((line) => (
            <p key={`${line.id}-${line.kind}`}>{text(line)}</p>
          ))}
          {onUndo && (
            <button
              className="btn-link planner-placement-undo"
              type="button"
              onClick={onUndo}
            >
              {message(locale, "plannerPlacementUndo")}
            </button>
          )}
        </div>
      )}
      {chips.length > 0 && (
        <ul className="planner-placement-chips">
          {chips.map((name) => (
            <li key={name}>
              {message(locale, "plannerPlacementChipNoTime").replace(
                "{name}",
                name,
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One of the fusion modal's two comparison timelines. Deliberately not
 * `PlanSchedule` in a read-only mode: clicking a target here puts it in (or
 * takes it out of) the Résultat, an interaction unique to this modal. Slots are
 * placed with the plan editor's own `plannedWindow` (`mergeWindows`), so a
 * target lands where it would on the plan's own timeline.
 *
 * A click is a toggle — a second
 * click on a target already in the Résultat takes it out again — and every
 * slot says what a click will do: "+" (add), ✓ (in the Résultat; × on
 * hover, click removes), ⇄ (the other version's copy is there; click swaps
 * it for this one). Two targets of the same version that overlap sit on
 * separate lanes instead of hiding each other.
 */
function PlanMergeVersionRail({ column, entries, locale, night, onToggle }) {
  const total = night ? nightMinutes(night) : 0;
  const windows = mergeWindows(column.items, night);
  if (!night || total <= 0 || !windows.length) return null;
  const cardsById = new Map(
    (night.cards || []).map((card) => [card.target.id, card]),
  );
  const itemsById = new Map(column.items.map((item) => [item.id, item]));
  const { lanes, count } = mergeRailLanes(windows);
  return (
    <div className="planner-merge-rail">
      <div className="planner-merge-rail-head">
        <span>{column.label}</span>
        <span>{durationText(mergeTotalMinutes(windows), locale)}</span>
      </div>
      <div
        className="planner-merge-rail-track"
        style={{ "--planner-merge-lanes": count }}
      >
        {windows.map((window) => {
          const card = cardsById.get(window.id);
          const name = plannerTimelineLabel(card.target);
          const state = mergeSlotState(entries, column.side, window.id);
          const action = message(
            locale,
            state === "selected"
              ? "planMergeSlotRemove"
              : state === "replaced"
                ? "planMergeSlotReplace"
                : "planMergeSlotAdd",
          ).replace("{name}", name);
          return (
            <button
              type="button"
              key={window.id}
              className={`planner-merge-rail-slot is-${state}`}
              style={{
                "--planner-merge-lane": lanes.get(window.id) || 0,
                left: `${(window.start / total) * 100}%`,
                width: `${Math.max(((window.end - window.start) / total) * 100, 3)}%`,
              }}
              aria-pressed={state === "selected"}
              aria-label={action}
              title={action}
              onClick={() => onToggle(column.side, itemsById.get(window.id))}
            >
              <span className="planner-merge-rail-slot-name">{name}</span>
              <span className="planner-merge-rail-slot-mark" aria-hidden="true">
                {state === "selected" ? (
                  <>
                    <svg className="is-check" viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <svg className="is-remove" viewBox="0 0 24 24">
                      <line x1="17" y1="7" x2="7" y2="17" />
                      <line x1="7" y1="7" x2="17" y2="17" />
                    </svg>
                  </>
                ) : state === "replaced" ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M6 9h12l-3.5-3.5M18 15H6l3.5 3.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24">
                    <line x1="12" y1="6" x2="12" y2="18" />
                    <line x1="6" y1="12" x2="18" y2="12" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "Deux versions de ce plan". [compareVersion], when given, reopens this
 * against a specific `history` row from "Versions précédentes" (step 6's own
 * "Comparer") instead of the plan's live set-aside version; confirming then
 * composes onto the *current* plan's own settings via the restore route's
 * `items` rather than resolving a live divergence.
 *
 * Which version is which: the server keeps the other device's write as the
 * live plan (`versions.current`) and parks this browser's rejected attempt
 * as the set-aside version (`versions.setAside`) — so "Ce navigateur" is
 * the set-aside one, and "Garder la version de ce navigateur" is the
 * server's `keepBrowser`.
 *
 * - The version timelines toggle (`PlanMergeVersionRail`), and each
 *   Résultat target carries a small cross;
 * - the Résultat *is* the plan editor's own interval editor
 *   (`PlanSchedule`: click a target, drag its start/end handles — the start
 *   handle moves the whole window while it overlaps, exactly as in the
 *   planner). Everything can be added; overlaps are drawn in red and
 *   listed, never refused; the total follows every change; and each change
 *   is written into the Résultat as it happens, so what is validated is
 *   exactly what the timeline shows;
 * - the shared web modal shell (cross at the top right,
 *   actions at the bottom), and both confirmations — leaving and
 *   validating — are dialogs of their own, stacked above this one.
 */
function PlanMergeModal({
  compareVersion = null,
  fetchPlanVersions,
  locale,
  night,
  onClose,
  onResolved,
  plan,
  postPlanVersionsResolve,
  postPlanVersionRestore,
  profiles = null,
  timeZone,
}) {
  const [versions, setVersions] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [entries, setEntries] = useState([]);
  const [choice, setChoice] = useState("merged");
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [confirmStep, setConfirmStep] = useState(null);
  // "Réglages du plan": the person's own choices, row id → "local" (this
  // browser) / "other" (the other device).
  const [fieldChoices, setFieldChoices] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetchPlanVersions(plan.id)
      .then((data) => {
        if (!cancelled) setVersions(data);
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(error.message || "Could not load plan versions.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);

  const currentVersion = {
    items: versions?.current?.payload?.items || [],
    modified: versions?.current?.updatedAt || plan.updatedAt,
  };
  const columns = compareVersion
    ? [
        {
          ...currentVersion,
          side: "current",
          label: message(locale, "planMergeColumnCurrent"),
          keepLabel: message(locale, "planMergeShortcutKeepCurrent"),
          choice: "merged",
        },
        {
          side: "previous",
          items: compareVersion.payload?.items || [],
          modified: compareVersion.createdAt,
          label: message(locale, "planMergeColumnPrevious"),
          keepLabel: message(locale, "planMergeShortcutKeepPrevious"),
          choice: "merged",
        },
      ]
    : [
        {
          side: mergeSideBrowser,
          items: versions?.setAside?.payload?.items || [],
          modified: versions?.setAside?.createdAt,
          label: message(locale, "planMergeColumnBrowser"),
          keepLabel: message(locale, "planMergeShortcutKeepBrowser"),
          choice: "keepBrowser",
        },
        {
          ...currentVersion,
          side: mergeSideOther,
          label: message(locale, "planMergeColumnOther"),
          keepLabel: message(locale, "planMergeShortcutKeepOther"),
          choice: "keepOther",
        },
      ];
  // The settings that differ — only for a live divergence: "Comparer"
  // from "Versions précédentes" still composes the targets onto the
  // current plan's own settings.
  const fieldRows =
    !compareVersion && versions?.setAside
      ? planFieldDifferences(
          versions.setAside.payload,
          versions.current?.payload,
          versions.base || null,
          { newer: versions.newer || planFieldSideLocal },
        )
      : [];
  const effectiveFieldChoices = Object.fromEntries(
    fieldRows
      .map((row) => [row.field, fieldChoices[row.field] || row.preselected])
      .filter(([, side]) => side),
  );
  const fieldsMissing = fieldRows.some(
    (row) => !effectiveFieldChoices[row.field],
  );
  const launched =
    !compareVersion &&
    [versions?.setAside?.payload, versions?.current?.payload].some(
      (payload) =>
        Array.isArray(payload?.launchedSchedule) &&
        payload.launchedSchedule.length > 0,
    );
  const chooseField = (field, side) => {
    if (busy) return;
    setFieldChoices((current) => ({ ...current, [field]: side }));
    setChoice("merged");
  };
  const resultItems = mergeResultItems(entries);
  const resultIds = new Set(resultItems.map((item) => item.id));
  const resultWindows = mergeWindows(resultItems, night);
  const resultOverlaps = mergeOverlaps(resultWindows);

  const toggleTarget = (side, item) => {
    if (!item || busy) return;
    const next = toggleMergeEntry(entries, side, item);
    setEntries(next);
    setChoice("merged");
    // The target just put in the Résultat opens in the interval editor, so
    // its handles are right there; one just taken out closes it.
    setEditingId(
      next.some((entry) => entry.item.id === item.id)
        ? item.id
        : editingId === item.id
          ? null
          : editingId,
    );
  };
  const removeTarget = (id) => {
    setEntries((current) => removeMergeEntry(current, id));
    setChoice("merged");
    setEditingId((current) => (current === id ? null : current));
  };
  const changeTarget = (id, patch) => {
    setEntries((current) => updateMergeEntryWindow(current, id, patch));
    setChoice("merged");
  };
  // "Garder la version de ce navigateur" / "Garder l'autre version":
  // the whole version, its settings rows included.
  const keepWhole = (column) => {
    setEntries(wholeVersionEntries(column.items, column.side));
    setChoice(column.choice);
    setEditingId(null);
    if (column.side === mergeSideBrowser || column.side === mergeSideOther)
      setFieldChoices(
        planFieldChoicesFor(
          fieldRows,
          column.side === mergeSideBrowser
            ? planFieldSideLocal
            : planFieldSideOther,
        ),
      );
  };

  const cardsById = new Map(
    (night?.cards || []).map((card) => [card.target.id, card]),
  );
  const nameOf = (id) =>
    cardsById.get(id) ? plannerTimelineLabel(cardsById.get(id).target) : id;
  const codesFor = (items) =>
    items
      .map((item) => cardsById.get(item.id))
      .filter(Boolean)
      .map((card) => plannerTimelineLabel(card.target))
      .join(" · ");
  const totalMinutesFor = (items) =>
    night
      ? mergeTotalMinutes(mergeWindows(items, night))
      : items.reduce(
          (sum, item) => sum + (Number(item.durationMinutes) || 60),
          0,
        );
  const formatModified = (iso) => {
    const parsed = iso ? new Date(iso) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return "—";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      hourCycle: "h23",
    }).format(parsed);
  };
  const timeAtMinute = (minute) =>
    time(
      new Date(new Date(night.start).getTime() + minute * 60000),
      locale,
      timeZone,
    );

  const requestCancel = () => {
    if (busy) return;
    if (entries.length === 0) {
      onClose();
      return;
    }
    setConfirmStep("cancel");
  };

  const confirmResolution = async () => {
    setBusy(true);
    setResolveError("");
    try {
      const resource = compareVersion
        ? await postPlanVersionRestore(plan.id, compareVersion.versionId, {
            items: resultItems,
          })
        : await postPlanVersionsResolve(plan.id, {
            choice,
            items: resultItems,
            // Always sent by this build, so the server composes the
            // settings with the same rule; an older build sends none and
            // keeps the live plan's settings (compatibility rule).
            fields: effectiveFieldChoices,
          });
      onResolved(resource);
      onClose();
    } catch (error) {
      setResolveError(error.message || "Plan resolution failed.");
    } finally {
      setBusy(false);
    }
  };

  const resultSummary =
    entries.length > 0
      ? `${message(
          locale,
          entries.length === 1
            ? "planMergeResultTargetsOne"
            : "planMergeResultTargetsOther",
        ).replace("{count}", String(entries.length))} · ${durationText(
          mergeTotalMinutes(resultWindows),
          locale,
        )}`
      : null;

  return (
    <>
      <WebDialog
        bodyClassName="planner-merge-body"
        className="planner-merge-modal"
        closeDisabled={busy}
        focusTitle
        closeLabel={flow(locale, "close")}
        onClose={requestCancel}
        title={message(locale, "planMergeTitle")}
        footer={
          <>
            <button
              type="button"
              className="btn-link"
              disabled={busy}
              onClick={requestCancel}
            >
              {message(locale, "planMergeCancelTooltip")}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={entries.length === 0 || fieldsMissing || busy}
              onClick={() => setConfirmStep("validate")}
            >
              {message(locale, "planMergeConfirmTooltip")}
            </button>
          </>
        }
      >
        {loadError && <p role="alert">{loadError}</p>}
        {!loadError && !versions && <p role="status">…</p>}
        {versions && (
          <>
            <table className="planner-merge-compare">
              <thead>
                <tr>
                  <th></th>
                  {columns.map((column) => (
                    <th key={column.side}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{message(locale, "planMergeRowTargets")}</td>
                  {columns.map((column) => (
                    <td key={column.side}>{codesFor(column.items)}</td>
                  ))}
                </tr>
                <tr>
                  <td>{message(locale, "planMergeRowTotalTime")}</td>
                  {columns.map((column) => (
                    <td key={column.side}>
                      {durationText(totalMinutesFor(column.items), locale)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>{message(locale, "planMergeRowModified")}</td>
                  {columns.map((column) => (
                    <td key={column.side}>{formatModified(column.modified)}</td>
                  ))}
                </tr>
                {fieldRows.length > 0 && (
                  <tr className="planner-merge-fields-summary">
                    <td colSpan={columns.length + 1}>
                      {message(
                        locale,
                        fieldRows.length === 1
                          ? "planMergeFieldsSummaryOne"
                          : "planMergeFieldsSummaryOther",
                      ).replace("{count}", String(fieldRows.length))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {columns.map((column) => (
              <PlanMergeVersionRail
                column={column}
                entries={entries}
                key={column.side}
                locale={locale}
                night={night}
                onToggle={toggleTarget}
              />
            ))}

            <div className="planner-merge-result">
              <div className="planner-merge-result-head">
                <span className="planner-merge-result-label">
                  {message(locale, "planMergeResultLabel")}
                </span>
                {resultSummary && <span>{resultSummary}</span>}
              </div>
              {entries.length === 0 ? (
                <>
                  <div className="planner-merge-result-empty">
                    {message(locale, "planMergeResultEmpty")}
                  </div>
                  <p className="planner-merge-result-prompt">
                    {message(locale, "planMergeResultPrompt")}
                  </p>
                </>
              ) : !night ? (
                // `PlanSchedule` needs a night to place anything on its
                // timeline (its one other caller never renders it without
                // one either) — a place must be chosen before the Résultat
                // can be arranged, exactly like the plan editor itself.
                <p className="planner-merge-result-prompt">
                  {flow(locale, "noPlace")}
                </p>
              ) : (
                // `planner-flow`: the plan page's own scope for the interval
                // editor's styles (legends, time scale), so the Résultat's
                // editor looks exactly like the planner's.
                <div className="planner-flow planner-merge-result-editor">
                  {resultOverlaps.length > 0 && (
                    <ul className="planner-merge-overlaps" role="status">
                      {resultOverlaps.map((overlap) => (
                        <li
                          key={`${overlap.firstId}-${overlap.secondId}-${overlap.start}`}
                        >
                          {message(locale, "planMergeResultOverlap")
                            .replace("{first}", nameOf(overlap.firstId))
                            .replace("{second}", nameOf(overlap.secondId))
                            .replace("{start}", timeAtMinute(overlap.start))
                            .replace("{end}", timeAtMinute(overlap.end))}
                        </li>
                      ))}
                      <li className="is-hint">
                        {message(locale, "planMergeResultOverlapHint")}
                      </li>
                    </ul>
                  )}
                  <PlanSchedule
                    cards={(night.cards || []).filter((card) =>
                      resultIds.has(card.target.id),
                    )}
                    editingId={editingId}
                    forecast={null}
                    items={resultItems}
                    liveWindowChange
                    locale={locale}
                    night={night}
                    onEdit={setEditingId}
                    onQuickRemove={removeTarget}
                    onRemove={removeTarget}
                    onScrollToRecommendations={() => {}}
                    onWindowChange={changeTarget}
                    onWindowEditStart={() => {}}
                    quickRemoveLabel={(name) =>
                      message(locale, "planMergeSlotRemove").replace(
                        "{name}",
                        name,
                      )
                    }
                    readOnly={busy}
                    showTargetDetails={false}
                    timeZone={timeZone}
                  />
                  {!editingId && (
                    <p className="planner-merge-result-prompt is-left">
                      {message(locale, "planMergeResultEditHint")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="planner-merge-shortcuts">
              {columns.map((column) => (
                <button
                  type="button"
                  className="btn-tertiary"
                  key={column.side}
                  disabled={busy || !column.items.length}
                  onClick={() => keepWhole(column)}
                >
                  {column.keepLabel}
                </button>
              ))}
            </div>
            {fieldRows.length > 0 && (
              <PlanMergeFieldsSection
                busy={busy}
                choices={effectiveFieldChoices}
                locale={locale}
                onChoose={chooseField}
                profiles={profiles}
                rows={fieldRows}
                timeZone={timeZone}
              />
            )}
            {launched && (
              <p className="planner-merge-result-prompt is-left planner-merge-fields-launched">
                {message(locale, "planMergeFieldsLaunched")}
              </p>
            )}
            {resolveError && <p role="alert">{resolveError}</p>}
          </>
        )}
      </WebDialog>

      {confirmStep === "cancel" && (
        <WebConfirmDialog
          cancelLabel={message(locale, "planMergeCancelConfirmKeep")}
          closeLabel={flow(locale, "close")}
          confirmLabel={message(locale, "planMergeCancelConfirmDiscard")}
          description={message(locale, "planMergeCancelConfirmBody")}
          onCancel={() => setConfirmStep(null)}
          onConfirm={onClose}
          title={message(locale, "planMergeCancelConfirmTitle")}
          tone="primary"
        />
      )}

      {confirmStep === "validate" && (
        <WebConfirmDialog
          busy={busy}
          cancelLabel={message(locale, "planMergeValidateCancel")}
          closeLabel={flow(locale, "close")}
          confirmLabel={message(locale, "planMergeValidateConfirm")}
          description={message(locale, "planMergeValidateMessage")}
          onCancel={() => setConfirmStep(null)}
          onConfirm={() => {
            setConfirmStep(null);
            confirmResolution();
          }}
          title={message(locale, "planMergeValidateTitle")}
          tone="primary"
        />
      )}
    </>
  );
}

function PrintablePlan({
  activePlan,
  darkness = "astronomical",
  equipment,
  forecast,
  locale,
  location,
  minAltitude,
  night,
  timeZone,
  acquisitionText = {},
}) {
  if (!activePlan || !night) return null;
  const cardsById = new Map(night.cards.map((card) => [card.target.id, card]));
  const sheet = printablePlanSheet({
    plan: activePlan,
    night,
    acquisitionText,
  });
  const layoutById = new Map(sheet.entries.map((entry) => [entry.id, entry]));
  const entries = activePlan.items
    .map((item) => {
      const card = cardsById.get(item.id);
      return card
        ? { card, item, window: plannedWindow(item, card, night) }
        : null;
    })
    .filter(Boolean);
  const total = sheet.totalMinutes;
  const timeAtMinute = (minute) =>
    time(
      new Date(new Date(night.start).getTime() + minute * 60000),
      locale,
      timeZone,
    );
  const forecastValue =
    forecast.status === "ready" && forecast.value ? forecast.value : null;
  const forecastLabel = forecastValue
    ? `${message(
        locale,
        `plannerForecast${forecastValue.category[0].toUpperCase()}${forecastValue.category.slice(1)}`,
      )} · ${forecastValue.score}/100`
    : null;

  return (
    <section className="planner-print-sheet">
      <header className="planner-print-heading">
        <div>
          <p className="planner-print-eyebrow">
            {productName().toUpperCase()} · PLAN
          </p>
          {/* The page has one h1 (« Planificateur d’observation »); the
              sheet that is printed heads with an h2. */}
          <h2>
            {activePlan.name
              ? localizedPlanName(locale, activePlan.name, activePlan.date)
              : message(locale, "plannerUntitledPlan")}
          </h2>
          <p>{dateLabel(activePlan.date, locale)}</p>
        </div>
        <div className="planner-print-heading-targets">
          <strong>{entries.length}</strong>
          <span>{message(locale, "plannerPlannedTargets")}</span>
        </div>
      </header>

      <section className="planner-print-night">
        <h2>{message(locale, darknessLabelKey(darkness))}</h2>
        <dl>
          <div>
            <dt>{message(locale, "plannerLocation")}</dt>
            <dd>
              {location.name || "—"}
              <small>
                {decimal(location.latitude, locale, 4)}° ·{" "}
                {decimal(location.longitude, locale, 4)}°
              </small>
            </dd>
          </div>
          <div>
            <dt>{message(locale, darknessLabelKey(darkness))}</dt>
            <dd>
              {time(night.start, locale, timeZone)} –{" "}
              {time(night.end, locale, timeZone)}
              <small>{durationText(total, locale)}</small>
            </dd>
          </div>
          <div>
            <dt>{message(locale, "plannerMoon")}</dt>
            <dd>
              {night.moonIllumination} %
              <small>
                {message(locale, "plannerMinAltitude")} ·{" "}
                {decimal(minAltitude, locale)}°
              </small>
            </dd>
          </div>
          <div>
            <dt>{message(locale, "plannerEquipment")}</dt>
            <dd>
              {equipment.name}
              {night.field && (
                <small>
                  {message(locale, "plannerField")} ·{" "}
                  {fieldLabel(night.field, locale)}
                </small>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <PrintableNightSkyMap
        cards={entries.map((entry) => entry.card)}
        locale={locale}
      />

      {forecastValue && (
        <section className="planner-print-forecast">
          <div className="planner-print-section-heading">
            <div>
              <h2>{message(locale, "plannerForecast")}</h2>
              <p>
                {message(
                  locale,
                  forecastValue.fallback
                    ? "plannerForecastFallbackSource"
                    : "plannerForecastSource",
                )}
              </p>
            </div>
            <strong>{forecastLabel}</strong>
          </div>
          <dl>
            <div className={`is-${forecastValue.category}`}>
              <dt>{message(locale, "plannerCalendarScore")}</dt>
              <dd>
                {forecastValue.score}/100
                {forecastValue.uncertain
                  ? ` · ${message(locale, "plannerForecastUncertain")}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>{message(locale, "plannerForecastCloud")}</dt>
              <dd>{forecastValue.cloud} %</dd>
            </div>
            <div>
              <dt>{message(locale, "plannerForecastVisibility")}</dt>
              <dd>
                {forecastValue.visibilityKm === null
                  ? "—"
                  : `${decimal(forecastValue.visibilityKm, locale, 1)} km`}
              </dd>
            </div>
            <div>
              <dt>{message(locale, "plannerForecastWind")}</dt>
              <dd>
                {forecastValue.wind === null
                  ? "—"
                  : `${forecastValue.wind} km/h`}
              </dd>
            </div>
            <div>
              <dt>{message(locale, "plannerForecastPrecipitation")}</dt>
              <dd>
                {forecastValue.precipitation === null
                  ? "—"
                  : `${forecastValue.precipitation} %`}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="planner-print-timeline">
        <div className="planner-print-section-heading">
          <h2>{message(locale, "plannerPrintTimeline")}</h2>
          <p>
            ☼ {time(night.start, locale, timeZone)} –{" "}
            {time(night.end, locale, timeZone)} ☼
          </p>
        </div>
        {entries.length ? (
          <div className="planner-print-timeline-rows">
            {entries.map(({ card, item, window }) => {
              const title = plannerTargetTitle(card.target);
              const timelineLabel = plannerTimelineLabel(card.target);
              const layout = layoutById.get(item.id);
              const left = layout.leftPercent;
              const width = layout.widthPercent;
              return (
                <div className="planner-print-timeline-row" key={item.id}>
                  <div>
                    <strong>{timelineLabel}</strong>
                    <span>
                      {timeAtMinute(window.start)} – {timeAtMinute(window.end)}
                    </span>
                  </div>
                  <div className="planner-print-timeline-track">
                    <span
                      className="planner-print-timeline-block"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  </div>
                  <strong>
                    {durationText(window.end - window.start, locale)}
                  </strong>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="planner-print-empty">
            {message(locale, "plannerEmptyPlan")}
          </p>
        )}
      </section>

      <section className="planner-print-targets">
        <h2>{message(locale, "plannerPrintTargetDetails")}</h2>
        {entries.map(({ card, item, window }) => {
          const target = card.target;
          const integrationAvailable =
            card.integration?.available !== false &&
            Number.isFinite(Number(card.integration?.recommendedMinutes));
          const title = plannerTargetTitle(target);
          const image = target.featured?.imageUrl || hipsPreviewUrl(card);
          const typeAndConstellation = [
            target.skyTarget?.type,
            target.skyTarget?.constellation,
          ]
            .filter(Boolean)
            .join(" · ");
          const knowledge = target.knowledge || target.targetKnowledge;
          const storyParagraphs = Array.isArray(knowledge?.storyParagraphs)
            ? knowledge.storyParagraphs.filter(Boolean)
            : [knowledge?.story].filter(Boolean);
          return (
            <article className="planner-print-target" key={item.id}>
              {image ? (
                <img
                  src={image}
                  alt=""
                  className="planner-print-target-image"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="planner-print-target-placeholder"
                  aria-hidden="true"
                >
                  {target.catalogue || target.objects?.[0]}
                </div>
              )}
              <div className="planner-print-target-copy">
                <h3>{title}</h3>
                <p>{typeAndConstellation}</p>
                <dl>
                  <div>
                    <dt>{message(locale, "plannerPrintScheduled")}</dt>
                    <dd>
                      {timeAtMinute(window.start)} – {timeAtMinute(window.end)}
                      {" · "}
                      {durationText(window.end - window.start, locale)}
                    </dd>
                  </div>
                  {acquisitionText[item.id] && (
                    <div data-testid="planner-print-acquisition">
                      <dt>{message(locale, "expoEPrintAcquisition")}</dt>
                      <dd>{acquisitionText[item.id]}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{message(locale, "plannerWindow")}</dt>
                    <dd>{rangeLabel(card, locale, timeZone)}</dd>
                  </div>
                  <div>
                    <dt>{message(locale, "plannerMaximum")}</dt>
                    <dd>
                      {decimal(card.maxAltitude, locale)}° ·{" "}
                      {time(card.best.time, locale, timeZone)}
                    </dd>
                  </div>
                  <div>
                    <dt>{message(locale, "plannerDirection")}</dt>
                    <dd>{card.direction}</dd>
                  </div>
                  {target.skyTarget?.constellation && (
                    <div>
                      <dt>{message(locale, "plannerConstellation")}</dt>
                      <dd>{target.skyTarget.constellation}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{message(locale, "plannerSuggestedIntegration")}</dt>
                    <dd>
                      {integrationAvailable ? (
                        <>
                          {durationText(
                            card.integration.recommendedMinutes,
                            locale,
                          )}
                          {" · "}
                          {durationText(
                            card.integration.minimumMinutes,
                            locale,
                          )}
                          –
                          {durationText(
                            card.integration.maximumMinutes,
                            locale,
                          )}
                        </>
                      ) : (
                        "NA"
                      )}
                    </dd>
                  </div>
                  {card.filter && (
                    <div>
                      <dt>{message(locale, "plannerSuggestedFilter")}</dt>
                      <dd>{card.filter}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{message(locale, "plannerFraming")}</dt>
                    <dd>{framingMessage(card, locale)}</dd>
                  </div>
                </dl>
                {storyParagraphs.length > 0 && (
                  <section className="planner-print-target-knowledge">
                    <h4>{message(locale, "aboutTarget")}</h4>
                    {storyParagraphs.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </section>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </section>
  );
}

function PlanToolIcon({ name }) {
  if (name === "calendar")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="14" rx="2" />
        <path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    );
  if (name === "weather")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.5 17.5h9a3.5 3.5 0 1 0-1-6.86A5 5 0 0 0 6 12.5a2.5 2.5 0 0 0 1.5 5Z" />
        <path d="M9 20.5h.01M12 20.5h.01M15 20.5h.01" />
      </svg>
    );
  if (name === "print")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 9V4h10v5M7.5 18.5h9V14h-9v4.5Z" />
        <path d="M7.5 18.5H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2.5M17 12h.01" />
      </svg>
    );
  if (name === "share")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="18" cy="5" r="2" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="m7.8 11 8.4-4.8M7.8 13l8.4 4.8" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v11M8 10l4 4 4-4M5 18.5h14" />
    </svg>
  );
}

/**
 * The small gold cloud in front of the state of the plans' sync line — the
 * cloud when synchronised, the cloud with arrows while a write waits or runs,
 * the crossed cloud when the plan stays on this device.
 */
function PlannerSyncIcon({ status }) {
  const cloud =
    "M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 11.1 3.5 3.5 0 0 0 7 18z";
  return (
    <svg
      className="planner-sync-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {status === "synced" ? (
        <path d={cloud} />
      ) : status === "syncing" || status === "pending" ? (
        <>
          <path d={cloud} />
          <path d="M9.5 14a3 3 0 0 1 5-1.2M14.5 14a3 3 0 0 1-5 1.2" />
        </>
      ) : (
        <>
          <path d={cloud} />
          <path d="M4 4l16 16" />
        </>
      )}
    </svg>
  );
}

function AdvancedConstraintIcon({ kind }) {
  if (kind === "zenith")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18a8 8 0 0 1 16 0M12 16V5M8.8 8.2 12 5l3.2 3.2" />
      </svg>
    );
  if (kind === "cableStart")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4v4a5 5 0 0 0 10 0V4M12 12v8M9 17l3 3 3-3" />
      </svg>
    );
  if (kind === "cableEnd")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 20v-4a5 5 0 0 1 10 0v4M12 12V4M9 7l3-3 3 3" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16l-6.5 7.5V19l-3 1v-7.5L4 5Z" />
    </svg>
  );
}

function AdvancedConstraintSummary({
  filterThresholdRange,
  locale,
  mountSafety,
}) {
  const safety = normaliseMountSafety(mountSafety);
  const items = [];
  if (safety.enabled && safety.zenithAvoidanceDegrees > 0)
    items.push({
      kind: "zenith",
      label: message(locale, "plannerMountZenithSummary"),
      value: `${decimal(safety.zenithAvoidanceDegrees, locale)}°`,
    });
  if (
    safety.enabled &&
    safety.azimuthStart !== "" &&
    safety.azimuthEnd !== ""
  ) {
    items.push({
      kind: "cableStart",
      label: message(locale, "plannerMountCableStart"),
      value: `${decimal(safety.azimuthStart, locale)}°`,
    });
    items.push({
      kind: "cableEnd",
      label: message(locale, "plannerMountCableEnd"),
      value: `${decimal(safety.azimuthEnd, locale)}°`,
    });
  }
  if (filterThresholdRange) {
    const minimum = decimal(filterThresholdRange.minimum, locale);
    const maximum = decimal(filterThresholdRange.maximum, locale);
    items.push({
      kind: "filter",
      label: message(locale, "plannerMoonSeparationByFilter"),
      value: minimum === maximum ? `${minimum}°` : `${minimum}°–${maximum}°`,
    });
  }
  if (!items.length) return null;

  return (
    <span className="planner-constraint-summary-active">
      <span>{flow(locale, "advancedSummary")}</span>
      {items.map((item) => (
        <span
          className="planner-advanced-summary-item"
          aria-label={`${item.label} ${item.value}`}
          title={`${item.label} ${item.value}`}
          key={`${item.kind}-${item.value}`}
        >
          <AdvancedConstraintIcon kind={item.kind} />
          <span>{item.value}</span>
        </span>
      ))}
    </span>
  );
}

function TargetViewIcon({ view }) {
  if (view === "map")
    return (
      <svg className="planner-view-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3.5 6 5-2.2 7 2.4 5-2.2v14l-5 2.2-7-2.4-5 2.2V6Z" />
        <path d="M8.5 3.8v14M15.5 6.2v14" />
      </svg>
    );
  return (
    <svg className="planner-view-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}

function PlanToolButton({ icon, label, onClick, title }) {
  return (
    <button
      className="btn-tertiary planner-plan-tool"
      type="button"
      onClick={onClick}
      title={title}
    >
      <PlanToolIcon name={icon} />
      <span>{label}</span>
    </button>
  );
}

export function PlannerPage({
  locale = "en",
  initialization = {},
  capabilities = null,
  readOnlyWindow = false,
}) {
  const plannerStateDefaults = useMemo(() => {
    const defaults = defaultState(initialization?.instanceSettings);
    return migratePlannerState(defaults, defaults);
  }, [initialization?.instanceSettings]);
  const plannerReferenceSeed = useMemo(
    () => ({
      catalogue: initialization?.plannerTargets?.targets,
      nameLabels: initialization?.plannerTargets?.nameLabels,
      taxonomy: initialization?.taxonomy,
    }),
    [initialization],
  );
  const plannerPresets = initialization?.plannerEquipment || {};
  const planetReferences = initialization?.plannerPlanets || {};
  // EQUIPMENT-INSTRUMENTS-01: the common binoculars come with the common
  // telescopes (type « Jumelles » of the picker).
  const guestTelescopes = useMemo(
    () =>
      withCommonBinoculars(
        Array.isArray(plannerPresets.telescopes)
          ? plannerPresets.telescopes
          : telescopeProfiles,
      ),
    [plannerPresets.telescopes],
  );
  const guestCameras = Array.isArray(plannerPresets.cameras)
    ? plannerPresets.cameras
    : cameraProfiles;
  const guestEyepieces = Array.isArray(plannerPresets.eyepieces)
    ? plannerPresets.eyepieces
    : eyepieceProfiles;
  const guestModifiers = Array.isArray(plannerPresets.opticalModifiers)
    ? plannerPresets.opticalModifiers
    : opticalModifiers;
  const [state, setState] = useState(() => plannerStateDefaults);
  const planView =
    state.plans.find((plan) => plan.id === state.activePlanId)?.view ||
    defaultPlanView;
  const updatePlanView = (key, value) =>
    setState((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === current.activePlanId
          ? {
              ...plan,
              view: {
                ...defaultPlanView,
                ...plan.view,
                [key]:
                  typeof value === "function"
                    ? value(plan.view?.[key] ?? defaultPlanView[key])
                    : value,
              },
            }
          : plan,
      ),
    }));
  const [targets, setTargets] = useState([]);
  const [targetKnowledge, setTargetKnowledge] = useState({});
  const [catalogueSuggestionTargets, setCatalogueSuggestionTargets] = useState(
    [],
  );
  const [inventory, setInventory] = useState([]);
  // "Matériel par défaut": the default rows the service offers every
  // space (null from a portal older than the list: the bundled profiles
  // stand in), and the space's option "Masquer le matériel par défaut".
  const [defaultEquipment, setDefaultEquipment] = useState(null);
  const [hideDefaultEquipment, setHideDefaultEquipment] = useState(false);
  // "Ma configuration par défaut" of the space: what every new plan starts
  // from when it is set; null for a visitor or a space that has none. A ref
  // too, for the plans made in the same turn as its arrival.
  const [defaultConfiguration, setDefaultConfigurationState] = useState(null);
  const defaultConfigurationRef = useRef(null);
  const setDefaultConfiguration = (value) => {
    const configuration = normalizeDefaultConfiguration(value);
    defaultConfigurationRef.current = configuration;
    setDefaultConfigurationState(configuration);
  };
  const [configurationNotice, setConfigurationNotice] = useState(null);
  const [, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hydrationFailed, setHydrationFailed] = useState(false);
  const [placeDialog, setPlaceDialog] = useState(null);
  const [horizonViewer, setHorizonViewer] = useState(null);
  const [placePicker, setPlacePicker] = useState(false);
  const [forecastRetry, setForecastRetry] = useState(0);
  // Remembers which place/night the last forecast fetch was for, so a manual
  // refresh of that exact same context can keep the prior content on screen
  // while it re-fetches (only the hourly section's own refresh icon spins)
  // without also doing that across a genuine place or date change, where the
  // old forecast belongs to a different night entirely and must not linger
  // on screen even briefly.
  const forecastContextRef = useRef(null);
  // The time of the last good forecast of this place and
  // night, for "Service indisponible" when a later read fails.
  const lastGoodForecastRef = useRef({ context: null, at: null });
  const [placeChange, setPlaceChange] = useState(null);
  // The distance dialog of the band's choice (`{ place, current }`): the
  // second validation before the plans of the night move.
  const [nightPlaceChoice, setNightPlaceChoice] = useState(null);
  const targetView = planView.view;
  const [mapHasOpened, setMapHasOpened] = useState(false);
  // Swapping the list for the map replaces some 25 000 px of page with about
  // 500: whatever the observer was reading is gone and the browser simply
  // clamps the scroll offset to the new, much shorter document. Coming back
  // it is the opposite -- the page grows again and the offset stays where
  // the short page left it, tens of screens above the card that was tapped.
  // So the outbound offset is remembered and the return is landed
  // deliberately, on the card the map is showing when there is one
  // (the list/map swap).
  const listScrollOffsetRef = useRef(null);
  const [pendingTargetViewLanding, setPendingTargetViewLanding] =
    useState(null);
  const setTargetView = (value) => {
    if (value === "map" || targetView === "map") setMapHasOpened(true);
    if (value !== targetView) {
      if (targetView === "list") listScrollOffsetRef.current = window.scrollY;
      setPendingTargetViewLanding({ view: value, at: Date.now() });
    }
    updatePlanView("view", value);
  };
  const typeFilter = planView.type,
    setTypeFilter = (value) => updatePlanView("type", value);
  const catalogueFilter = planView.catalogue,
    setCatalogueFilter = (value) => updatePlanView("catalogue", value);
  const planFilter = planView.plan,
    setPlanFilter = (value) => updatePlanView("plan", value);
  const recommendationQuery = planView.query,
    setRecommendationQuery = (value) => updatePlanView("query", value);
  const recommendationSource = planView.source,
    setRecommendationSource = (value) => updatePlanView("source", value);
  const recommendationSort = planView.sort,
    setRecommendationSort = (value) => updatePlanView("sort", value);
  const [framingDraft, setFramingDraft] = useState(null);
  // The account's
  // framing library (`GET /v1/framings`), independent of any plan.
  // Reloaded on mount and on every `framings` (or generic) change signal —
  // the same "always the complete list" doctrine as `GET /v1/plans`.
  const [framingsLibrary, setFramingsLibrary] = useState([]);
  const [framingsLibraryLoaded, setFramingsLibraryLoaded] = useState(false);
  const [framingSaveError, setFramingSaveError] = useState(null);
  const [framingEditorState, setFramingEditorState] = useState(null);
  const framingEditorStateRef = useRef(null);
  framingEditorStateRef.current = framingEditorState;
  // The pieces « Définir mon matériel » brought back to the framing editor
  // (`{ chosen }`), which its own equipment takes.
  const [framingEditorReturned, setFramingEditorReturned] = useState(null);
  const [framingRuleSheet, setFramingRuleSheet] = useState(null);
  const [framingCopyNotice, setFramingCopyNotice] = useState(null);
  const [framingInfoSheetOpen, setFramingInfoSheetOpen] = useState(false);
  const [framingRenameTarget, setFramingRenameTarget] = useState(null);
  // "Voir dans Cadrages" switches to the
  // library and highlights the card of the framing the fiche came from --
  // cleared as soon as the visitor leaves the Cadrages view again, so it
  // never survives to point at the wrong card after a later visit.
  const [highlightedFramingId, setHighlightedFramingId] = useState(null);
  // The account's framings resources keyed by id -- what the plan's own framing
  // fiche needs to read a target's live state
  // (`resource.state`/`resource.usage`) rather than the possibly stale copy a
  // plan item's own `target.framingState` carries.
  const framingResourcesById = useMemo(
    () => new Map(framingsLibrary.map((resource) => [resource.id, resource])),
    [framingsLibrary],
  );
  const reloadFramingsLibrary = () => {
    listFramings()
      .then((list) => {
        setFramingsLibrary(list);
        setFramingsLibraryLoaded(true);
      })
      .catch(() => {});
  };
  // The account's framings as map-ready targets (the framing resource's
  // `target` shape, plus the state fields the library/target cards read) —
  // archived ones stay out of "add an existing framing to this plan", never out
  // of the library itself.
  const libraryFramingTargets = useMemo(
    () =>
      framingsLibrary
        .filter((resource) => !resource.archivedAt)
        .map((resource) => ({
          ...resource.payload.target,
          framingId: resource.id,
          framingRevision: resource.revision,
          framingState: resource.state,
        })),
    [framingsLibrary],
  );
  // The full compact catalogue already loaded by the page (`targets`,
  // unfiltered by source/type/visibility -- filters only ever narrow
  // `night.cards`/`recommendedCards`), the pool the framing naming/matching
  // rule now runs against on both creation paths (the planner's own map and the
  // fullscreen editor).
  const fullCatalogueFramingTargets = useMemo(
    () =>
      targets.filter(
        (target) =>
          target?.id &&
          Number.isFinite(Number(target.coordinate?.ra)) &&
          Number.isFinite(Number(target.coordinate?.dec)),
      ),
    [targets],
  );
  // The surface a shell registered at `planner.framing.surface` extends the
  // map's frame into (a mosaic): the one set, and
  // the one last configured, kept even while none is active, so reopening
  // its sheet offers it again rather than its default. It is live only for
  // a profile that carries `planner.mosaic` (`liveFrameSurface`).
  const surfaceModel = plannerExtension("planner.framing.surface");
  const [frameSurface, setFrameSurface] = useState(null);
  const [lastFrameSurface, setLastFrameSurface] = useState(null);
  const [frameSurfaceSheetOpen, setFrameSurfaceSheetOpen] = useState(false);
  // The card whose "Pourquoi cette cible ce soir" is open.
  const [scoreCard, setScoreCard] = useState(null);
  // "Tolérance au vent": the dialog the row of stage 3 opens, and the
  // links "Régler la tolérance au vent" of the score.
  const [windDialogOpen, setWindDialogOpen] = useState(false);
  // "Remplir la nuit automatiquement" is open.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  // How the blocks of the stage-5 frise are written (not stored).
  const [scheduleDisplay, setScheduleDisplay] = useState("intervals");
  const [planNameEdit, setPlanNameEdit] = useState(null);
  const [planDeleteConfirmation, setPlanDeleteConfirmation] = useState(null);
  const [printPlanId, setPrintPlanId] = useState(null);
  const [printSkyMap, setPrintSkyMap] = useState(null);
  // Which plan the single "Imprimer" tool-row button opened the choice
  // dialog for -- a plan id rather than a plain boolean for the same reason
  // `printPlanId`/`exportPlanId` already are, so the dialog always acts on
  // the plan it was opened from even if `activePlanId` changes meanwhile.
  const [printChoicePlanId, setPrintChoicePlanId] = useState(null);
  const skyMapView = planView.skyMap,
    setSkyMapView = (value) => updatePlanView("skyMap", value);
  // "Absolue | Horizon" is the first chip of the map's row, a menu with
  // the globe and the mountain of the old segments.
  const skyMapViewChip = (
    <MapMenuChip
      className="planner-map-chip-view"
      label={message(
        locale,
        skyMapView === "realistic"
          ? "plannerSkyMapRealistic"
          : "plannerSkyMapProjection",
      )}
      glyph={skyMapView === "realistic" ? "absolute" : "horizon"}
      menuLabel={message(locale, "plannerSkyMapView")}
      value={skyMapView}
      items={[
        {
          value: "realistic",
          label: message(locale, "plannerSkyMapRealistic"),
          glyph: "absolute",
        },
        {
          value: "projection",
          label: message(locale, "plannerSkyMapProjection"),
          glyph: "horizon",
        },
      ]}
      onSelect={setSkyMapView}
    />
  );
  const mapSelectedTargetId = planView.selectedTargetId,
    setMapSelectedTargetId = (value) =>
      updatePlanView("selectedTargetId", value);
  const [forecast, setForecast] = useState({ status: "idle", value: null });
  const [skyQuality, setSkyQuality] = useState({
    status: "idle",
    value: null,
  });
  // The brightness by direction around the place, the grid of the horizon
  // map's light layer, read by the ranking whether or not the layer is
  // switched on (`requestPlannerSkyDirection` keeps one answer per place in
  // memory, so the layer's own request reuses it). Null until it arrives, and
  // without a raster or a place: the score is then the zenith's.
  const [skyDirection, setSkyDirection] = useState(null);
  const selectRecommendationSource = (source) => {
    // The source tabs describe distinct target libraries.  Carrying a type,
    // catalogue or search filter from one into another can make a saved
    // framing appear to have vanished, even though it is still in the plan.
    setRecommendationSource(source);
    setTypeFilter("");
    setCatalogueFilter("");
    setRecommendationQuery("");
    setPlanFilter("");
  };
  const updateCatalogueSelection = (selection) =>
    update("catalogueSelection", selection);
  const [plannerView, setPlannerView] = useState("editor");
  // "Conditions à {lieu}", a page of the planner
  // (`view=conditions&place=<id>&date=`), opened from a place's detail.
  const [conditionsOf, setConditionsOf] = useState(null);
  const [exportStatus, setExportStatus] = useState("");
  const [addNotice, setAddNotice] = useState(null);
  // The overlaps the observer chose to keep ("Valider sans pouvoir lancer"):
  // the plan id and the pairs, so that a new overlap speaks again.
  const [keptOverlaps, setKeptOverlaps] = useState(() => new Set());
  const [exportPlanId, setExportPlanId] = useState(null);
  const [exportFramingResource, setExportFramingResource] = useState(null);
  const [auth, setAuth] = useState({
    checked: false,
    enabled: false,
    authenticated: false,
  });
  // The measured sky backgrounds of the account, for every place the
  // page shows; nothing is asked of a visitor.
  const placeSkyMeasures = usePlaceSkyMeasures(Boolean(auth.authenticated));
  // The account's framings are read for a signed-in person only: a visitor has
  // none, and asking would only leave a refused request in the console.
  useEffect(() => {
    if (!auth.authenticated) {
      if (auth.checked) setFramingsLibraryLoaded(true);
      return undefined;
    }
    reloadFramingsLibrary();
    if (typeof window === "undefined") return undefined;
    window.addEventListener(CHANGE_SIGNAL_EVENT, reloadFramingsLibrary);
    return () =>
      window.removeEventListener(CHANGE_SIGNAL_EVENT, reloadFramingsLibrary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authenticated, auth.checked]);
  const [plannerFavoriteTargetIds, setPlannerFavoriteTargetIds] = useState(
    () => new Set(),
  );
  const [plannerFavoritesStatus, setPlannerFavoritesStatus] = useState("idle");
  const [accessMode, setAccessMode] = useState(null);
  // What the person's profile holds back (several plans, the mosaics) stays
  // visible and says so when it is asked for, with the way to the offers.
  // `capabilityRefusal` is the sentence being shown, `kind` naming it
  // (`planLimit`, `planLimitLocal`, `mosaic`); it goes as soon as what it
  // refused is allowed again. The service refuses the same things itself. Only
  // the plans of the space count toward its limit: a plan kept in this browser
  // takes no place in it.
  const gates = plannerGates({
    capabilities,
    plans: spacePlansOf(state.plans),
    date: state.date,
    signedIn: Boolean(auth.authenticated),
  });
  // A mosaic needs both a surface registered at `planner.framing.surface`
  // and `planner.mosaic`; without them the frame is the equipment's single
  // field, which every profile frames and saves.
  const mosaicAvailable = Boolean(surfaceModel) && gates.mosaic.allowed;
  const liveFrameSurface = mosaicAvailable ? frameSurface : null;
  // The multi-night plans' views are registered at `planner.projects` by every
  // shell (the open core's); the core only says where they belong, and draws
  // their entries held back when the profile lacks the capability
  // (`multi-night-access.js`). Where nothing restricts them, they stay open to
  // the person.
  const projectsExtension = plannerExtension("planner.projects");
  // In the read-only window of an ended subscription they are read, to show
  // them read-only.
  const readOnlyMultiNight = useReadOnlyMultiNightPlans(
    multiNightWindowReads({
      registered: Boolean(projectsExtension),
      hosted: isHostedService(auth),
      signedIn: Boolean(auth.authenticated),
      capabilities,
      readOnlyWindow,
    }),
  );
  const multiNight = multiNightAccess({
    registered: Boolean(projectsExtension),
    hosted: isHostedService(auth),
    signedIn: Boolean(auth.authenticated),
    capabilities,
    stored: readOnlyMultiNight.projects.length,
    readOnlyWindow,
  });
  // Read-only, the plans library shows them and nothing else asks for them:
  // "Nouveau plan", the plan's menu and the timeline draw no entry.
  const multiNightEntries = multiNight === "readOnly" ? "absent" : multiNight;
  const [readOnlyProjectId, setReadOnlyProjectId] = useState(null);
  // "One night | Multi-night" in the plans library; "What do you want to
  // prepare?" behind "New plan"; the shell's dialog of a new
  // multi-night plan, when that is the answer.
  const [shownPlanKind, setPlanKind] = useState("one");
  // While the purchase is missing the
  // multi-night side is never shown locked -- its tab opens the offers
  // (`choosePlanKind`) and the library stays on "Une nuit", whatever kept
  // a "multi" (a link, a side left from before).
  const planKind = shownPlanKindFor(multiNight, shownPlanKind);
  const [planKindChoice, setPlanKindChoice] = useState(false);
  const [multiNightCreate, setMultiNightCreate] = useState(false);
  const [capabilityRefusal, setCapabilityRefusal] = useState(null);
  // "A plan already exists for tonight" of "New plan": `{ planId, kind }`.
  const [planExistsDialog, setPlanExistsDialog] = useState(null);
  // The purchase box a refused gesture opens (`{ offer, feature }`), in a
  // dialog.
  const [purchaseBoxFor, setPurchaseBoxFor] = useState(null);
  // The last link to a multi-night plan the service refused (`{ code, itemId }`):
  // said under "Actions du plan".
  const [linkRefusal, setLinkRefusal] = useState(null);
  // `fromService`: the service refused what this screen had allowed (another
  // device filled the space): the screen cannot tell when that stops being
  // true, so the person closes it.
  const refuseCapability = (kind, { fromService = false, date } = {}) => {
    // Where the offers are sold, what a plan limit or a mosaic holds back
    // leads straight to them, on the right purchase, "Vous venez de : …" --
    // no sentence, no "Voir les offres" link. The service's own refusal
    // (another device filled the space) keeps its notice: the screen cannot
    // tell when that stops being true. The way to them is the purchase box,
    // in a dialog, not the page of the offers.
    const feature =
      !fromService &&
      (kind === "planLimit" || kind === "planLimitLocal"
        ? "multiple"
        : kind === "mosaic"
          ? "mosaic"
          : null);
    if (feature && lockedOffersHref(locale, "planning", feature)) {
      setPurchaseBoxFor({ offer: "planning", feature });
      return;
    }
    setCapabilityRefusal({
      kind,
      fromService,
      date,
      id: `${Date.now()}-${kind}`,
    });
  };
  useEffect(() => {
    if (!capabilityRefusal || capabilityRefusal.fromService) return;
    const stillHeld =
      capabilityRefusal.kind === "mosaic"
        ? !mosaicAvailable
        : capabilityRefusal.kind === "multiNight"
          ? multiNight !== "open"
          : !planCreationGate({
              capabilities,
              plans: spacePlansOf(state.plans),
              signedIn: Boolean(auth.authenticated),
              date: capabilityRefusal.date ?? state.date,
            }).allowed;
    if (!stillHeld) setCapabilityRefusal(null);
  }, [
    capabilityRefusal,
    mosaicAvailable,
    multiNight,
    gates.planCreation.allowed,
    capabilities,
    state.plans,
    state.date,
    auth.authenticated,
  ]);
  const [serverReady, setServerReady] = useState(false);
  const [persistenceError, setPersistenceError] = useState("");
  // The plans the service refused to delete (history).
  const [deletionRefusal, setDeletionRefusal] = useState(null);
  const [syncStatusState, setSyncStatusState] = useState("local");
  // The last attempt to send, for the detail the status line
  // opens -- when it was, how it ended and, if it did not go through, why in
  // plain words. Nothing of the error is kept but its status and code.
  const [syncAttempt, setSyncAttempt] = useState(null);
  const [syncDetailOpen, setSyncDetailOpen] = useState(false);
  const [syncRetrying, setSyncRetrying] = useState(false);
  const lastSyncErrorRef = useRef(null);
  const syncStatus = syncStatusState;
  const setSyncStatus = (next) => {
    setSyncStatusState(next);
    if (next === "synced") {
      lastSyncErrorRef.current = null;
      setSyncAttempt({ at: Date.now(), ok: true });
    } else if (next === "pending") {
      setSyncAttempt({
        at: Date.now(),
        ok: false,
        failure: describeSyncFailure(lastSyncErrorRef.current, {
          online:
            typeof navigator === "undefined" || navigator.onLine !== false,
        }),
      });
    }
  };
  // Plan ids the last full-document save could not overwrite because the server
  // held a newer revision (the revision guard of planner-state-repository.js's
  // savePlannerState) — also returned by `GET /api/plans` itself, so the
  // trigger below survives a reload rather than only appearing right after the
  // save that discovered it.
  const [divergentPlanIds, setDivergentPlanIds] = useState([]);
  // The plans whose night runs on a phone,
  // `{ [planId]: { state: "running" | "paused", sessionId } }`, as the service
  // derives it from the open session (`GET /api/plans`, the answer of every
  // save) and as the change signal brings it up to date. Such a plan is "Nuit
  // en cours" here, read-only; the web never decides it nor stores it.
  const [executionByPlanId, setExecutionByPlanId] = useState({});
  const executionRef = useRef({});
  executionRef.current = executionByPlanId;
  // The fusion modal, opened either from a divergent plan's "Comparer"
  // (mergeCompareVersion stays null — the live set-aside version) or from
  // "Versions précédentes"' own "Comparer" against one specific history
  // row.
  const [mergePlanId, setMergePlanId] = useState(null);
  const [mergeCompareVersion, setMergeCompareVersion] = useState(null);
  const [activePlanVersions, setActivePlanVersions] = useState(null);
  const placesClient = useMemo(() => createPlacesClient(), []);
  // The places this browser kept before any sign-in: read at launch, sent to
  // the space once at the first sign-in (`POST /v1/places/import`), before the
  // plans of the browser are carried and the browser's document is reduced.
  const browserPlacesRef = useRef([]);
  // Where my places come from: the space
  // (`/v1/places`, read at launch and at each change signal, written at once)
  // for a signed-in person; this browser's document for a visitor, as before.
  // A failure is told by the planner's one-line notice.
  const placesFromSpace = Boolean(auth.authenticated);
  const spacePlaces = useSpacePlaces({
    active: placesFromSpace,
    email: auth.user?.email || null,
    browserPlacesRef,
    onError: (kind, error) => {
      // Offline, the copy this browser keeps is shown: nothing to tell.
      if (kind === "read" && error?.status === undefined) return;
      setPersistenceError(
        message(
          locale,
          error?.code === "entitlement_read_only"
            ? "placesReadOnly"
            : {
                read: "placesReadFailed",
                write: "placesWriteFailed",
                delete: "placesDeleteFailed",
                default: "placesDefaultFailed",
                import: "placesImportFailed",
              }[kind],
        ),
      );
    },
  });
  // The space gives its places most recently edited first; the default place
  // leads the list.
  // "the default place" is the one rule of `defaultPlaceOf` — the marked
  // place, else the oldest — never the mark alone: with
  // `defaultPlaceId: null` the same place leads here, wears the label in
  // "Lieux" and gives the distances.
  const spacePlacesOrdered = useMemo(() => {
    const leadingId = defaultPlaceOf(
      spacePlaces.places,
      spacePlaces.defaultId,
    )?.id;
    return [
      ...spacePlaces.places.filter((place) => place.id === leadingId),
      ...spacePlaces.places.filter((place) => place.id !== leadingId),
    ];
  }, [spacePlaces.places, spacePlaces.defaultId]);
  const knownPlaces = placesFromSpace
    ? spacePlacesOrdered
    : state.knownLocations;
  const knownPlacesRef = useRef(knownPlaces);
  knownPlacesRef.current = knownPlaces;
  // "Voir ce lieu" of the editor's duplicate line: the sheet of that place,
  // opened in "Lieux".
  const [placeToShow, setPlaceToShow] = useState(null);
  const stateRef = useRef(state);
  // The plans whose slot a place change put back on the
  // astronomical night. Kept for this page only, never written to a plan: the
  // place change leaves what it did in `slotNoticeChange`, read once the new
  // state is on screen.
  const slotNoticeChange = useRef(null);
  const [slotNotices, setSlotNotices] = useState({});
  useEffect(() => {
    const change = slotNoticeChange.current;
    if (!change) return;
    slotNoticeChange.current = null;
    setSlotNotices((previous) => {
      const next = { ...previous };
      for (const id of change.slots) delete next[id];
      for (const id of change.fellBack) next[id] = true;
      return next;
    });
  }, [state]);
  // The twilight threshold preference of this browser: the default of new
  // plans, written to the pending plans when it changes.
  const [darknessPreference, setDarknessPreference] = useState("astronomical");
  const darknessPreferenceRef = useRef(darknessPreference);
  useEffect(() => {
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage refused (private window, blocked site data): the default.
    }
    const stored = readDarknessPreference(storage);
    darknessPreferenceRef.current = stored;
    setDarknessPreference(stored);
  }, []);
  // "Prise de vue par cible": the last defaults chosen on this browser (pose,
  // gain, filter...), the defaults of the next new plan.
  const acquisitionPreferenceRef = useRef(null);
  useEffect(() => {
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage refused (private window, blocked site data): none.
    }
    acquisitionPreferenceRef.current =
      readAcquisitionDefaultsPreference(storage);
  }, []);
  // The wind tolerance of each mount on this browser: keyed by the
  // inventory mount's id, `default` without one, copied into the pending
  // plans of that mount when it changes.
  const [windPreferences, setWindPreferences] = useState({});
  const windPreferencesRef = useRef(windPreferences);
  // The equipment a new plan starts with — `{ equipment }` for the plan
  // rules when "Ma configuration par défaut" is set (with the wind tolerance
  // this browser keeps for its mount), nothing otherwise: the new plan then
  // takes the current equipment, the rule of before (an effect below
  // adopts the equipment for a signed-in owner). "Prise de vue par
  // cible": and the defaults of the last plan chosen on this browser
  // (`acquisitionDefaults`), when it chose any.
  const newPlanStart = (current) => {
    const configuration = defaultConfigurationRef.current;
    const acquisition = newPlanAcquisitionDefaults(
      acquisitionPreferenceRef.current,
    );
    if (!configuration) return acquisition;
    return {
      equipment: equipmentWithWindTolerance(
        planStartEquipment(current?.equipment, configuration),
        windPreferencesRef.current,
      ),
      ...acquisition,
    };
  };
  useEffect(() => {
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage refused (private window, blocked site data): no preference.
    }
    const stored = readWindTolerancePreferences(storage);
    windPreferencesRef.current = stored;
    setWindPreferences(stored);
  }, []);
  // The filters added in this browser: they never leave it; the inventory's
  // are read only and come from the profiles.
  const [localFilters, setLocalFilters] = useState([]);
  const localFiltersRef = useRef(localFilters);
  useEffect(() => {
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage refused (private window, blocked site data): none.
    }
    const stored = readOwnedFilters(storage);
    localFiltersRef.current = stored;
    setLocalFilters(stored);
  }, []);
  const keepLocalFilters = (next) => {
    localFiltersRef.current = next;
    setLocalFilters(next);
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage refused: the list stays for this page.
    }
    writeOwnedFilters(storage, next);
  };
  // Signed in to a space, the browser's
  // "Filtres possédés" join the "Filtres" of "Mon matériel" once — the
  // space never takes the same filter twice — and leave the browser.
  useEffect(() => {
    if (!auth.authenticated || localFilters.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/v1/manage/equipment", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-astro-csrf": csrfCookieValue() || "",
        },
        body: JSON.stringify({
          action: "import",
          items: ownedFiltersAsEquipment(localFilters),
        }),
      });
      if (!response.ok || cancelled) return;
      const read = await response.json();
      if (Array.isArray(read.equipment))
        setInventory(read.equipment.filter((item) => !item.archivedAt));
      keepLocalFilters([]);
    })().catch(() => {
      // Sent at the next visit.
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authenticated, localFilters]);
  const planTimelineRefs = useRef(new Map());
  const recommendationListRef = useRef(null);
  // The heading of the plan tabs, where a plan opened to be edited
  // lands (stage 1 folded, the tabs right under the page's sticky bar).
  const planTabsHeadingRef = useRef(null);
  const planHistoryRef = useRef({});
  const saveRevisionRef = useRef(0);
  // The date of each plan as the last settled document held it, the plans
  // a save created or re-dated since (ids), those already offered
  // (`id:date`), and the dialog "Plan d’une nuit passée" when one is due.
  const planDatesRef = useRef(null);
  const pastNightIdsRef = useRef(new Set());
  const pastNightOfferedRef = useRef(new Set());
  const [pastNightOffer, setPastNightOffer] = useState(null);
  const recommendationScrollAnchorRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const persistedFingerprintRef = useRef(null);
  // The revision the service last gave for each plan (plan id → revision),
  // from the loads and from the answers to this page's own saves: the base of
  // the next save, whatever the screen's copy was read at.
  const serviceRevisionsRef = useRef(new Map());
  // What the service served for each plan and what the screen made of it: a
  // plan nobody touched is written as it was served.
  const servedPlansRef = useRef(new Map());
  // What a save of the space half of `document` would change at the service
  // (`spaceContentKey`), read against what the service last served.
  const spaceKeyOf = (document) =>
    spaceContentKey(
      splitPlannerDocument(document).space,
      servedPlansRef.current,
    );
  const deviceIdRef = useRef(null);
  // Plans the observer removed on this device since the page loaded. Sent
  // alongside every full-document save so the server can tell an explicit
  // deletion from a plan another device wrote that this browser's in-memory
  // document simply has not learned about yet — see
  // planner-state-repository.js's savePlannerState.
  const deletedPlanIdsRef = useRef(new Set());
  // The plans taken out of the screen and named for deletion, until the
  // service has said yes — one it refuses (`plan_not_deletable`) comes back.
  const removedPlansRef = useRef(new Map());
  // Plans made in this browser without a space, once the person is signed in
  // to a space. The browser's own document is what its store
  // holds; the screen shows the space, and — marked "non synchronisé" — the
  // browser's plans that stayed. `spaceModeRef`: edits go to the space's copy
  // (and the service), the browser's plans to the browser's store; otherwise
  // (a guest, or a signed-in person whose space cannot be reached and who kept
  // no copy of it) everything is the browser's.
  const browserDocumentRef = useRef(null);
  const spaceModeRef = useRef(false);
  const spaceRecordRef = useRef({ email: null, answer: null, held: null });
  const spaceReplicaDocumentRef = useRef(null);
  const persistedSpaceFingerprintRef = useRef(null);
  const browserPlansShownRef = useRef(false);
  const questionDismissedRef = useRef(false);
  const announceRef = useRef(false);
  // The "Enregistrement…" indicator is on while a save waits for its
  // debounce or is on its way to the space, and off when neither is: a save
  // that a synchronization made pointless must not leave it on.
  const persistsInFlightRef = useRef(0);
  const saveTimerPendingRef = useRef(false);
  const synchronizeQueueRef = useRef(Promise.resolve());
  const synchronizeSpaceRef = useRef(null);
  const currentHorizonMaskRef = useRef(null);
  const [browserPlansQuestion, setBrowserPlansQuestion] = useState(null);
  const [browserPlansNotice, setBrowserPlansNotice] = useState(null);
  const [holdForSpace, setHoldForSpace] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [timelineScrollPlanId, setTimelineScrollPlanId] = useState(null);
  const [highlightedScheduleItemId, setHighlightedScheduleItemId] =
    useState(null);
  useEffect(() => {
    if (!addNotice) return undefined;
    const timeout = window.setTimeout(() => setAddNotice(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [addNotice]);
  // The confirmation of the two links of stage 2 goes by itself after
  // eight seconds.
  useEffect(() => {
    if (!configurationNotice) return undefined;
    const timeout = window.setTimeout(() => setConfigurationNotice(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [configurationNotice]);
  const firstNightInitialized = useRef(false);
  // The night "Nouveau plan" of "Cette nuit" asked a plan for.
  const newPlanOnOpening = useRef(null);
  useEffect(() => {
    if (
      !loaded ||
      !serverReady ||
      hydrationFailed ||
      firstNightInitialized.current
    )
      return;
    // A signed-in person's places are read from the space before the page
    // decides it has none to open on -- only when the document has no
    // place of its own, so that the opening of any other document is the
    // one it always was (and writes nothing).
    if (
      placesFromSpace &&
      !spacePlaces.loaded &&
      !locationCoordinates(state.location)
    )
      return;
    firstNightInitialized.current = true;
    // The page opens the night it shows; it never starts a plan for it. A
    // "Plan 1" made here at every load was written to the space, counted for
    // the night (one plan per night in a free space) and turned the first
    // "Nouveau plan" into the offer of Advanced Planning, while the page said
    // "Aucun plan pour cette nuit". A plan is made by "Nouveau plan", or by
    // choosing a night (`update("date")`). And the night it opens on is the
    // one in progress until dawn at the place, not the browser's civil date
    // (past midnight, the next night)., (3): opened from "Cette nuit", the
    // planner opens on the night that page shows, at its place -- not on the
    // night remembered from another visit -- and "Nouveau plan" adds the plan
    // once there.
    const opening = takePlannerOpening();
    const firstPlan = {
      id: randomUuid(),
      name: `${message(locale, "plannerPlan")} 1`,
    };
    if (opening) {
      if (opening.newPlan) newPlanOnOpening.current = opening.date;
      setState((current) =>
        plannerOpeningState(
          current,
          {
            date: opening.date,
            place: opening.place ? planCopyOfPlace(opening.place) : null,
          },
          firstPlan,
        ),
      );
      return;
    }
    // Without a place of its own (a space whose plans were never made here),
    // the planner opens as "Cette nuit" does: at the default place, on the
    // night that place is in. It used to ask "Choisissez un lieu" of a space
    // that had one marked, on the browser's own date.
    const defaultId = placesFromSpace
      ? spacePlaces.defaultId
      : readDefaultPlaceId();
    const known = knownPlacesRef.current || [];
    const defaultPlace =
      known.find((entry) => entry.id && entry.id === defaultId) ?? null;
    setState((current) => {
      if (
        defaultPlace &&
        !locationCoordinates(current.location) &&
        locationCoordinates(defaultPlace)
      ) {
        const subject = tonightSubject({
          document: current,
          defaultPlace,
          knownPlaces: known,
        });
        if (locationCoordinates(subject.place))
          return plannerOpeningState(
            current,
            { date: subject.date, place: planCopyOfPlace(subject.place) },
            firstPlan,
          );
      }
      return choosePlannerDate(
        current,
        openingNightDate({
          date: current.date,
          place: current.location,
          zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          planDates: current.plans.map((plan) => plan.date),
        }),
        { ...firstPlan, seed: false },
      );
    });
  }, [
    loaded,
    serverReady,
    hydrationFailed,
    locale,
    placesFromSpace,
    spacePlaces.loaded,
  ]);
  const plannerReferences = useMemo(
    () => ({
      ...plannerReferenceSeed,
      catalogueTargets: catalogueSuggestionTargets,
    }),
    [catalogueSuggestionTargets, plannerReferenceSeed],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const revealPlanTimeline = (planId, itemId = null) => {
    if (planId) setTimelineScrollPlanId({ planId, itemId });
  };

  // "Voir la frise" must show the *timeline*, not
  // one bar of it. `scrollIntoView` on the stage already lands under the
  // sticky header (`.planner-flow-stage` carries a scroll-margin-top of the
  // header plus 5rem), but it says nothing about the row that was just
  // added: a plan with a dozen entries puts that row far below the heading.
  // So the destination is computed -- heading at the top while the row still
  // fits, the row a third of the way down otherwise -- once the layout has
  // stopped moving, and applied in a single scroll, with the row flashed on
  // arrival rather than before the page moves.
  useEffect(() => {
    if (!timelineScrollPlanId) return undefined;
    const { planId, itemId } = timelineScrollPlanId;
    const plan = state.plans.find((entry) => entry.id === planId);
    const timeline = planTimelineRefs.current.get(planId);
    // Wait until React has painted the newly inserted schedule item; otherwise
    // a card added from the map can scroll to the old timeline height.
    if (!plan?.items?.length || !timeline) return undefined;
    let frame = null;
    let previous = null;
    let remaining = 8;
    const measure = () => {
      const stage = timeline.closest(".planner-schedule-stage") || timeline;
      const row = itemId
        ? timeline.querySelector(
            `[data-planner-schedule-item="${CSS.escape(itemId)}"]`,
          )
        : null;
      const rowBounds = row?.getBoundingClientRect();
      const header = document.querySelector(".portal-header");
      return scheduleRevealOffset({
        stageTop: window.scrollY + stage.getBoundingClientRect().top,
        stageInset:
          Number.parseFloat(
            window.getComputedStyle(stage).scrollMarginTop || "0",
          ) || 0,
        headerHeight: header
          ? Math.max(0, header.getBoundingClientRect().bottom)
          : 0,
        rowTop: rowBounds ? window.scrollY + rowBounds.top : null,
        rowHeight: rowBounds?.height ?? 0,
        viewportHeight: window.innerHeight,
        maxScroll: Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        ),
      });
    };
    const land = (destination) => {
      setTimelineScrollPlanId(null);
      if (destination !== null)
        window.scrollTo({
          top: destination,
          left: window.scrollX,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
      if (itemId) setHighlightedScheduleItemId(itemId);
    };
    const step = () => {
      frame = null;
      const destination = measure();
      remaining -= 1;
      // Still settling -- the row that was just added may not be laid out
      // yet. An offset measured now is the one that lands beside the target.
      if (
        remaining > 0 &&
        destination !== null &&
        (previous === null || Math.abs(destination - previous) > 0.5)
      ) {
        previous = destination;
        frame = window.requestAnimationFrame(step);
        return;
      }
      land(destination);
    };
    frame = window.requestAnimationFrame(step);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [state.plans, timelineScrollPlanId]);

  useEffect(() => {
    if (!highlightedScheduleItemId) return undefined;
    const timeout = window.setTimeout(
      () => setHighlightedScheduleItemId(null),
      1800,
    );
    return () => window.clearTimeout(timeout);
  }, [highlightedScheduleItemId]);

  // The deliberate landing for a list/map swap. One jump, never an animation:
  // the document's height changes by tens of screens in the same commit, and
  // there is nothing meaningful to travel across.
  useEffect(() => {
    if (!pendingTargetViewLanding) return undefined;
    const { view } = pendingTargetViewLanding;
    let frame = window.requestAnimationFrame(() => {
      frame = null;
      setPendingTargetViewLanding(null);
      const options = { behavior: "instant", block: "start" };
      if (view === "map") {
        document
          .querySelector(".planner-sky-map-section")
          ?.scrollIntoView(options);
        return;
      }
      // Back to the list: the card the map was showing is where the observer
      // left off, so that is where they land. Failing that -- the selection
      // is filtered out of the list, or there was none -- the offset they
      // came from is restored.
      const selected = document.querySelector(
        ".planner-target-list .planner-target-card.is-map-selected",
      );
      if (selected) {
        selected.scrollIntoView(options);
        return;
      }
      const remembered = listScrollOffsetRef.current;
      if (remembered === null) return;
      window.scrollTo({
        top: Math.min(
          remembered,
          Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight,
          ),
        ),
        left: window.scrollX,
        behavior: "instant",
      });
    });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [pendingTargetViewLanding]);

  const csrfToken = () => csrfCookieValue();
  // What the service holds of the links, read again after a refusal.
  const revertRefusedLink = async (refusal) => {
    let kept = new Map();
    try {
      const response = await fetch("/api/plans", { cache: "no-store" });
      if (response.ok) kept = keptProjectLinks(await response.json());
    } catch {
      // Offline: the links go back to none; the plan is rewritten whole later.
    }
    setState((current) => {
      const reverted = revertRefusedLinks(current.plans, refusal, kept);
      return reverted.itemIds.length
        ? { ...current, plans: reverted.plans }
        : current;
    });
    if (refusal.code === "multi_night_not_active")
      setPurchaseBoxFor({ offer: "planning", feature: "multiNight" });
    else
      setLinkRefusal({
        code: refusal.code,
        itemId: refusal.planItemId ?? null,
      });
  };
  // `screenDocument`: the screen's copy `stateToPersist` was made from (the
  // plans nobody touched go out in the form they were served in).
  const persistToServer = async (
    stateToPersist,
    mode = "replace",
    screenDocument = stateToPersist,
  ) => {
    const response = await fetch("/api/plans", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-astro-csrf": csrfToken() || "",
        ...clientInstanceHeaders(),
      },
      body: JSON.stringify({
        mode,
        state: {
          ...stateToPersist,
          deletedPlanIds: [...deletedPlanIdsRef.current],
        },
      }),
    });
    const data = await response.json();
    if (!response.ok)
      // `code` is the service's own refusal (`plan_limit_reached`,
      // `entitlement_read_only`…), which the autosave below words itself.
      throw Object.assign(
        new Error(data.error || "Planner persistence failed."),
        {
          code: data.code || null,
          status: response.status,
          // The refused link, when that is the refusal.
          capability: data.capability ?? null,
          planItemId: data.planItemId ?? null,
          projectId: data.projectId ?? null,
          // The plans a refusal names: the browser's own ids.
          planIds: Array.isArray(data.planIds) ? data.planIds : [],
          // Those of them whose night is running on a device.
          inProgressPlanIds: Array.isArray(data.inProgressPlanIds)
            ? data.inProgressPlanIds
            : [],
        },
      );
    removedPlansRef.current.clear();
    for (const [id, revision] of revisionsOf(data?.state))
      serviceRevisionsRef.current.set(id, revision);
    for (const [id, entry] of servedPlanEntries(data?.state, screenDocument))
      servedPlansRef.current.set(id, entry);
    return data;
  };
  // The fusion modal's own three network calls, kept deliberately outside
  // the `/v1` contract (`api/plans/{id}/versions*`), exactly like
  // `persistToServer` above.
  const fetchPlanVersions = async (planId) => {
    const response = await fetch(
      `/api/plans/${encodeURIComponent(planId)}/versions`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Could not load the plan's versions.");
    return data;
  };
  const postPlanVersionsResolve = async (planId, body) => {
    const response = await fetch(
      `/api/plans/${encodeURIComponent(planId)}/versions/resolve`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-astro-csrf": csrfToken() || "",
          ...clientInstanceHeaders(),
        },
        body: JSON.stringify(body),
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "The plan resolution failed.");
    return data;
  };
  const postPlanVersionRestore = async (planId, versionId, body = {}) => {
    const response = await fetch(
      `/api/plans/${encodeURIComponent(planId)}/versions/${encodeURIComponent(versionId)}/restore`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-astro-csrf": csrfToken() || "",
          ...clientInstanceHeaders(),
        },
        body: JSON.stringify(body),
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "The version could not be restored.");
    return data;
  };
  // Patches the one resolved/restored plan into the in-memory document
  // directly, rather than a full reload — the response already carries its
  // new revision and items exactly like a `/v1` write's own resource.
  const applyResolvedPlanResource = (resource) => {
    setState((current) => ({
      ...current,
      plans: current.plans.map((entry) =>
        entry.id === resource.payload?.id
          ? { ...resource.payload, revision: resource.revision }
          : entry,
      ),
    }));
    setDivergentPlanIds((current) =>
      current.filter((id) => id !== resource.payload?.id),
    );
  };
  // A document as the planner keeps it — the browser's store, the space's
  // copy, what the service answers — read back into the shape of the screen.
  const restoreDocument = (document) =>
    validSavedState(
      {
        ...plannerStateDefaults,
        ...document,
        schemaVersion: document?.schemaVersion || 1,
      },
      plannerStateDefaults,
    );
  // The browser's own store: the plans made here without a space. `null`
  // empties it (nothing of the browser's is left).
  const rememberBrowser = (document) => {
    browserDocumentRef.current = document;
    if (document) localStorage.setItem(storageKey, JSON.stringify(document));
    else localStorage.removeItem(storageKey);
  };
  // The space's copy: what this browser keeps of the space it is signed in to,
  // for the observing site with no reception. `dirty`: it holds edits the space
  // has not received.
  const rememberSpace = (document, { dirty } = {}) => {
    if (dirty !== undefined) spaceRecordRef.current.dirty = dirty;
    writeSpaceReplica(localStorage, {
      email: spaceRecordRef.current.email,
      document,
      dirty: Boolean(spaceRecordRef.current.dirty),
      answer: spaceRecordRef.current.answer,
      held: spaceRecordRef.current.held ?? null,
    });
  };
  // The screen of a space read from its copy in this browser: the space's
  // plans, and the browser's that were on the screen beside them (and why), so
  // that what is marked "non synchronisé" is there without reception too.
  const screenFromCopy = (replica) => {
    const copy = restoreDocument(replica.document);
    const held = browserDocumentRef.current;
    const plans = (held?.plans || []).filter((plan) => replica.held?.[plan.id]);
    if (!copy || !plans.length) {
      browserPlansShownRef.current = false;
      return copy;
    }
    browserPlansShownRef.current = true;
    const merged = mergeBrowserPlans(
      copy,
      { plans, nights: held.nights },
      (plan) => replica.held[plan.id],
    );
    return spacePlansOf(copy.plans).length
      ? merged
      : selectPlannerPlan(merged, mostRecentFirst(plans)[0].id, merged);
  };
  // The space this browser is signed in to, brought up to date; then the plans
  // this browser made without a space. One path for the launch and for every
  // return of the network or change signal.
  const synchronizeSpaceOnce = async () => {
    // `first`: this page has not yet settled with the space — the launch, or
    // the return of a network that was down at launch.
    const first = !spaceModeRef.current;
    const snapshot = stateRef.current;
    const response = await fetch("/api/plans", { cache: "no-store" });
    const persisted = await response.json();
    if (!response.ok)
      throw new Error(persisted.error || "Planner loading failed.");
    // Bloc 4 step 1: a live browser-origin set-aside version survives a
    // reload, so the trigger must too.
    setDivergentPlanIds(persisted.divergentPlanIds || []);
    setExecutionByPlanId(executionByPlanIdOf(persisted));
    // What the service holds now is the base of the next save.
    serviceRevisionsRef.current = revisionsOf(persisted);
    if (first) {
      const inventoryResponse = await fetch("/api/equipment");
      const inventoryPayload = await inventoryResponse.json();
      if (!inventoryResponse.ok)
        throw new Error(inventoryPayload.error || "Equipment loading failed.");
      setInventory(inventoryPayload.equipment || []);
      setDefaultEquipment(
        Array.isArray(inventoryPayload.defaults)
          ? inventoryPayload.defaults
          : null,
      );
      setHideDefaultEquipment(inventoryPayload.hideDefaultEquipment === true);
      setDefaultConfiguration(inventoryPayload.defaultConfiguration ?? null);
    }
    const serverDocument = restoreDocument(persisted);
    if (!serverDocument) throw new Error("Planner loading failed.");
    servedPlansRef.current = servedPlanEntries(persisted, serverDocument);
    // What is compared with the space is the space's own half of the screen,
    // never a plan that belongs to the browser.
    const localDocument = first
      ? spaceReplicaDocumentRef.current
      : splitPlannerDocument(snapshot).space;
    const resolution = resolvePlannerDocuments({
      local: localDocument,
      server: serverDocument,
    });
    let winner = resolution.winner;
    // The first synchronized launch upgrades old test/legacy documents which
    // predate `sync.updatedAt`. From then on, reconnect decisions are
    // deterministic even if the observer edits with no reception.
    const needsSyncMetadata = !winner?.sync?.updatedAt;
    if (needsSyncMetadata)
      winner = stampPlannerDocument(winner, {
        deviceId: deviceIdRef.current || randomUuid(),
        now: Date.now(),
      });
    if (resolution.source === "local" || needsSyncMetadata) {
      setSyncStatus("syncing");
      // The plans nobody touched go out as they were served: a launch that
      // only stamps the document, or brings back the edits made offline, does
      // not rewrite every plan of the space with the page's own defaults.
      const result = await persistToServer(
        servedFormOfUntouchedPlans(winner, servedPlansRef.current),
        "replace",
        winner,
      );
      winner = restoreDocument(result.state);
      if (!winner) throw new Error("Planner synchronization failed.");
    }
    rememberSpace(winner, { dirty: false });

    // The plans of the browser: an empty space takes them, a space that holds
    // something is asked, what the profile has no room for stays.
    let outcome = null;
    if (browserDocumentRef.current?.plans?.length) {
      outcome = await carryBrowserPlans({
        browser: browserDocumentRef.current,
        space: winner,
        capabilities,
        answer: spaceRecordRef.current.answer,
        restore: restoreDocument,
        listFramings,
        importPlans: (document) => persistToServer(document, "import"),
        stamp: (document) =>
          stampPlannerDocument(document, {
            deviceId: deviceIdRef.current || randomUuid(),
            now: Date.now(),
          }),
        keepBrowser: rememberBrowser,
        keepSpace: (document) => rememberSpace(document, { dirty: false }),
      });
      browserDocumentRef.current = outcome.browser;
      if (outcome.kind === "carried") {
        winner = outcome.space;
        // Taken without asking, or after a "yes": what stays is the person's
        // to have taken as soon as the profile has room for it.
        spaceRecordRef.current.answer = "accepted";
        rememberSpace(winner);
      }
    }
    // The plans of the browser that stay are on the screen beside the space's,
    // marked and, for each, why: the profile has no room for it (`limit`), or
    // the space did not take it (`waiting`).
    const held = browserDocumentRef.current;
    const reasons = {};
    if (held?.plans?.length && ["carried", "failed"].includes(outcome?.kind)) {
      const waiting = new Set(
        (outcome.kind === "failed" ? held.plans : outcome.waiting).map(
          (plan) => plan.id,
        ),
      );
      for (const plan of held.plans)
        reasons[plan.id] = waiting.has(plan.id) ? "waiting" : "limit";
    }
    const shown = Object.keys(reasons).length > 0;
    let screen = shown
      ? mergeBrowserPlans(winner, held, (plan) => reasons[plan.id])
      : winner;
    // A space with no plan of its own opens on the most recent plan that
    // stayed, rather than on an empty planner that hides them.
    if (shown && !spacePlansOf(winner.plans).length)
      screen = selectPlannerPlan(
        screen,
        mostRecentFirst(held.plans)[0].id,
        screen,
      );
    browserPlansShownRef.current = shown;
    spaceRecordRef.current.held = shown ? reasons : null;
    rememberSpace(winner);
    screen = {
      ...screen,
      currentHorizonMask: first
        ? currentHorizonMaskRef.current || screen.currentHorizonMask
        : snapshot.currentHorizonMask,
    };
    persistedFingerprintRef.current = plannerDocumentFingerprint(screen);
    persistedSpaceFingerprintRef.current = spaceKeyOf(screen);
    spaceModeRef.current = true;
    setState((current) =>
      first ||
      plannerDocumentFingerprint(current) ===
        plannerDocumentFingerprint(snapshot)
        ? screen
        : current,
    );
    if (outcome?.kind === "ask") {
      if (!questionDismissedRef.current)
        setBrowserPlansQuestion({ count: outcome.count });
    } else setBrowserPlansQuestion(null);
    // Said when something was taken, and when the person has just said "yes"
    // (whatever stays is then the reason nothing, or little, went): not at
    // every launch, the plans that stayed are marked where they are.
    const announced = announceRef.current;
    announceRef.current = false;
    if (
      outcome?.kind === "carried" &&
      (outcome.taken > 0 ||
        (announced && outcome.limit.length + outcome.waiting.length > 0))
    ) {
      setBrowserPlansNotice({
        kind: "settled",
        taken: outcome.taken,
        limit: outcome.limit.length,
        waiting: outcome.waiting.length,
        id: `settled-${Date.now()}`,
      });
    } else if (outcome?.kind === "failed")
      setBrowserPlansNotice({ kind: "failed", id: "failed" });
    setHydrationFailed(false);
    setHoldForSpace(false);
    setServerReady(true);
    setSyncStatus("synced");
    setPersistenceError("");
    return outcome;
  };
  // One at a time: the launch, a return of the network and a change signal may
  // meet, and the plans of the browser are only sent once.
  const synchronizeSpace = () => {
    const next = synchronizeQueueRef.current
      .catch(() => {})
      .then(synchronizeSpaceOnce);
    synchronizeQueueRef.current = next;
    return next;
  };
  useEffect(() => {
    synchronizeSpaceRef.current = synchronizeSpace;
  });
  const reportSynchronizationFailure = (error) => {
    lastSyncErrorRef.current = error;
    setSyncStatus("pending");
    // A refused link is said where the gesture was, not as a failure of the
    // synchronization.
    if (isLinkRefusal(error)) {
      setPersistenceError("");
      void revertRefusedLink(error);
      return;
    }
    setPersistenceError(error.message);
  };
  // The person's answer to "You have N plans in this browser. Add them
  // to your space?": "Add them" takes them, "Keep them in this
  // browser" keeps them where they are — until this browser is signed out,
  // when they are the browser's again — and the question is not asked again.
  const answerBrowserPlans = (answer) => {
    setBrowserPlansQuestion(null);
    spaceRecordRef.current.answer = answer;
    rememberSpace(splitPlannerDocument(stateRef.current).space);
    if (answer === "accepted") {
      announceRef.current = true;
      synchronizeSpaceRef.current().catch(reportSynchronizationFailure);
    }
  };
  // The dialog closed without an answer: the plans stay where they are, and
  // the question comes back at the next launch, not at every change signal.
  const dismissBrowserPlansQuestion = () => {
    questionDismissedRef.current = true;
    setBrowserPlansQuestion(null);
  };
  const retryBrowserPlans = () => {
    setBrowserPlansNotice(null);
    setSyncStatus("syncing");
    synchronizeSpaceRef.current().catch(reportSynchronizationFailure);
  };
  // "Réessayer maintenant" of the detail the status line opens: the same
  // resynchronization as the return of the network.
  const retrySynchronization = async () => {
    setSyncRetrying(true);
    setSyncStatus("syncing");
    try {
      await synchronizeSpaceRef.current();
    } catch (error) {
      reportSynchronizationFailure(error);
    } finally {
      setSyncRetrying(false);
    }
  };
  useEffect(() => {
    const deviceId = () => {
      const previous = localStorage.getItem(plannerDeviceStorageKey);
      if (previous) return previous;
      const next = randomUuid();
      localStorage.setItem(plannerDeviceStorageKey, next);
      return next;
    };
    // A run of this effect that was left (React's development double run, a
    // change of language) applies none of what its requests answer: a late
    // `/api/auth/status` would otherwise send a person who just chose
    // "Continuer sans espace" back to the choice, and a second
    // synchronization of the space would race the first.
    let runIsCurrent = true;
    let replica = null;
    let statusKnown = false;
    let signedInEmail = null;
    try {
      const original = localStorage.getItem(storageKey);
      const parsed = JSON.parse(original);
      const stored = validSavedState(parsed, plannerStateDefaults);
      const currentHorizonMask = normaliseHorizonMask(
        JSON.parse(localStorage.getItem(horizonCurrentMaskStorageKey)),
      );
      currentHorizonMaskRef.current = currentHorizonMask;
      if (stored) {
        if (
          parsed?.schemaVersion !== 2 &&
          !localStorage.getItem(storageKey + ":before-v2")
        )
          localStorage.setItem(storageKey + ":before-v2", original);
        const restored = { ...stored, currentHorizonMask };
        setState(restored);
        browserDocumentRef.current = restored;
        browserPlacesRef.current = restored.knownLocations || [];
        persistedFingerprintRef.current = plannerDocumentFingerprint(restored);
      } else {
        setState((current) => ({ ...current, currentHorizonMask }));
      }
      replica = readSpaceReplica(localStorage);
      deviceIdRef.current = deviceId();
    } catch (error) {
      setHydrationFailed(true);
      setPersistenceError(error.message);
    } finally {
      setLoaded(true);
    }
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then(async (status) => {
        if (!runIsCurrent) return;
        statusKnown = true;
        setAuth({ ...status, checked: true });
        setAccessMode(status.authenticated ? "authenticated" : null);
        if (!status.authenticated) {
          // Signed out: what is on the screen is the browser's own. The copy
          // of a space leaves the browser with its person — unless it holds
          // edits the space never received, which wait for that person.
          if (replica && !replica.dirty) clearSpaceReplica(localStorage);
          // The copy of a space's places leaves the browser with its person.
          clearSpacePlacesCache(localStorage);
          spaceModeRef.current = false;
          setServerReady(true);
          setSyncStatus("local");
          return;
        }
        signedInEmail = status.user?.email || "";
        const own =
          replica && sameSpace(replica.email, signedInEmail) ? replica : null;
        // Another person's space is not this person's to see or to send.
        if (replica && !own) clearSpaceReplica(localStorage);
        spaceRecordRef.current = {
          email: signedInEmail,
          answer: own?.answer ?? null,
          dirty: Boolean(own?.dirty),
          held: own?.held ?? null,
        };
        spaceReplicaDocumentRef.current = own
          ? restoreDocument(own.document)
          : null;
        // Until the space answers, the screen shows the copy this browser
        // keeps of it (the observing site has no reception), never the
        // browser's own plans as if they were the space's.
        const shownCopy = own ? screenFromCopy(own) : null;
        if (shownCopy)
          setState({
            ...shownCopy,
            currentHorizonMask:
              currentHorizonMaskRef.current || shownCopy.currentHorizonMask,
          });
        else {
          // Nothing of the space to show yet, and nothing of the browser's
          // either: an empty planner, held back until the space answers.
          setState({
            ...plannerStateDefaults,
            currentHorizonMask:
              currentHorizonMaskRef.current ||
              plannerStateDefaults.currentHorizonMask,
          });
          setHoldForSpace(true);
        }
        await synchronizeSpace();
      })
      .catch((error) => {
        if (!runIsCurrent) return;
        // A link the service refused while the page was still
        // synchronizing: said where the gesture was, nothing else to do.
        if (isLinkRefusal(error)) {
          setAuth((previous) => ({ ...previous, checked: true }));
          reportSynchronizationFailure(error);
          return;
        }
        setPersistenceError(error.message);
        setAuth((previous) => ({ ...previous, checked: true }));
        // A cached planner remains fully usable when the observer loses the
        // network: the copy of the space this browser holds (of the person
        // signed in, or — the status itself not answering — of whoever was),
        // else the browser's own plans as they were. The `online` handler
        // below will reconcile it on return.
        try {
          if (
            !spaceModeRef.current &&
            replica &&
            (!statusKnown || sameSpace(replica.email, signedInEmail))
          ) {
            const copy = screenFromCopy(replica);
            if (copy) {
              spaceRecordRef.current = {
                email: replica.email,
                answer: replica.answer ?? null,
                dirty: Boolean(replica.dirty),
                held: replica.held ?? null,
              };
              spaceModeRef.current = true;
              persistedFingerprintRef.current =
                plannerDocumentFingerprint(copy);
              persistedSpaceFingerprintRef.current = spaceKeyOf(copy);
              setState({
                ...copy,
                currentHorizonMask:
                  currentHorizonMaskRef.current || copy.currentHorizonMask,
              });
            }
          }
        } catch {
          // The copy is unreadable: the browser's own plans stay on screen.
        }
        setHoldForSpace(false);
        setServerReady(true);
        setSyncStatus("pending");
      });
    return () => {
      runIsCurrent = false;
    };
  }, [locale, plannerStateDefaults]);

  // The catalogue and the knowledge of the targets are read once the planner is
  // up -- the sign-in and the space's plans answered -- never together with
  // them. A fresh browser asked for all of it at once, and a service that had
  // to load its catalogue answered the sign-in and the plans after it: 13 to 20
  // s on "Chargement du planificateur…" for what the first screen (a place, a
  // night) does not need.
  useEffect(() => {
    if (!serverReady) return undefined;
    let runIsCurrent = true;
    fetch(`/api/catalog?locale=${encodeURIComponent(locale)}&all=1&summary=1`)
      .then((response) => response.json())
      .then((data) => {
        if (runIsCurrent) setTargets(data.targets || []);
      })
      .catch(() => {
        if (runIsCurrent) setTargets([]);
      });
    fetch(
      `/api/target-library?locale=${encodeURIComponent(locale)}&featured=1&limit=96`,
    )
      .then((response) => response.json())
      .then((data) => {
        if (!runIsCurrent) return;
        const byKey = {};
        for (const target of data.targets || []) {
          for (const key of [
            target.id,
            target.designation,
            ...(target.aliases || []),
          ])
            byKey[targetLookupKey(key)] = target;
        }
        setTargetKnowledge(byKey);
      })
      .catch(() => {
        if (runIsCurrent) setTargetKnowledge({});
      });
    return () => {
      runIsCurrent = false;
    };
  }, [locale, serverReady]);

  useEffect(() => {
    if (!auth.checked) return undefined;
    if (!auth.authenticated) {
      // A person with no space keeps the favorites in this browser, like
      // the plans and the places: the planner reads them from there.
      setPlannerFavoriteTargetIds(
        browserFavoriteIds(readBrowserFavorites(window.localStorage)),
      );
      setPlannerFavoritesStatus("ready");
      return undefined;
    }
    const controller = new AbortController();
    setPlannerFavoritesStatus("loading");
    // What this browser kept before the sign-in goes to the space first.
    carryBrowserFavorites({
      storage: window.localStorage,
      request: putTargetFavorite,
    })
      .catch(() => {})
      .then(() => fetch("/api/target-favorites", { signal: controller.signal }))
      .then((response) => {
        if (!response.ok) throw new Error("favorites unavailable");
        return response.json();
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setPlannerFavoriteTargetIds(favoriteTargetIdsFromPayload(payload));
        setPlannerFavoritesStatus("ready");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setPlannerFavoriteTargetIds(new Set());
        setPlannerFavoritesStatus("error");
      });
    return () => controller.abort();
  }, [
    auth.authenticated,
    auth.checked,
    plannerStateDefaults.catalogueSelection,
  ]);

  useEffect(() => {
    // After the planner is up, and once the place is read: not first with no
    // latitude, then again with it.
    if (!serverReady) return undefined;
    let cancelled = false;
    const parameters = new URLSearchParams({
      locale,
      latitude: String(state.location?.latitude || ""),
      minimumAltitude: String(state.minAltitude || 30),
      // A selection in the equipment's mode (TARGET-SELECTIONS-TAGS-01).
      ...(["best", "extended"].includes(state.catalogueSelection)
        ? {
            selection: state.catalogueSelection,
            mode: selectionModeOfEquipmentMode(state.equipment.mode),
          }
        : {}),
    });
    fetch(`/api/planner-targets?${parameters}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Planner targets unavailable.");
        return data.targets;
      })
      .then((entries) => {
        if (!cancelled) setCatalogueSuggestionTargets(entries || []);
      })
      .catch(() => !cancelled && setCatalogueSuggestionTargets([]));
    return () => {
      cancelled = true;
    };
  }, [
    locale,
    serverReady,
    state.catalogueSelection,
    state.equipment.mode,
    state.location?.latitude,
    state.minAltitude,
  ]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        horizonCurrentMaskStorageKey,
        JSON.stringify(state.currentHorizonMask),
      );
    } catch {
      // The active display remains usable during this session.
    }
  }, [loaded, state.currentHorizonMask]);

  // Private inventory must never leak into a guest planning session: a
  // previously selected private profile is discarded (nothing chosen) as soon
  // as the visitor is known to be outside an authenticated session; a
  // default profile, which a visitor may use, stays.
  useEffect(() => {
    if (!auth.checked || !auth.enabled || auth.authenticated) return;
    const kept = (list, id, otherwise) =>
      list.some((profile) => profile.id === id) ? id : otherwise;
    setState((current) => ({
      ...current,
      equipment: {
        ...current.equipment,
        telescopeId: kept(guestTelescopes, current.equipment.telescopeId, null),
        cameraId: kept(guestCameras, current.equipment.cameraId, null),
        eyepieceId: kept(guestEyepieces, current.equipment.eyepieceId, null),
        modifierId: kept(guestModifiers, current.equipment.modifierId, "none"),
        filterIds: [],
      },
    }));
    // The default lists are the page's own data: only the session matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authenticated, auth.checked, auth.enabled]);

  // What the screen's document becomes in the stores. A guest, or a person
  // whose space could not be reached and who kept no copy of it, has one
  // store: the browser's. A signed-in person has two: the space's copy (the
  // space's plans) and the browser's store (the plans that stayed, marked on
  // the screen) — a plan is in one of them, never in both.
  const rememberScreen = (screenDocument, { dirty } = {}) => {
    if (!spaceModeRef.current) {
      localStorage.setItem(storageKey, JSON.stringify(screenDocument));
      return;
    }
    const { space, browser } = splitPlannerDocument(screenDocument);
    rememberSpace(space, { dirty });
    if (browserPlansShownRef.current) {
      rememberBrowser(
        browserDocumentAfterEdit(
          browserDocumentRef.current,
          browser || { plans: [], nights: [] },
        ),
      );
      // Every plan that stayed is gone from the screen (deleted).
      if (!browser) browserPlansShownRef.current = false;
    }
  };

  useEffect(() => {
    if (!loaded || !serverReady || hydrationFailed) {
      setSaving(false);
      return undefined;
    }
    const fingerprint = plannerDocumentFingerprint(state);
    if (fingerprint === persistedFingerprintRef.current) {
      // Nothing to save: this document is what the page settled on (a load,
      // a plan read from the space), not an edit of the observer's.
      planDatesRef.current = planDatesOf(state.plans);
      if (!persistsInFlightRef.current && !saveTimerPendingRef.current)
        setSaving(false);
      return undefined;
    }
    for (const id of pastNightCandidates({
      previous: planDatesRef.current,
      plans: state.plans,
    }))
      pastNightIdsRef.current.add(id);
    planDatesRef.current = planDatesOf(state.plans);
    const revision = ++saveRevisionRef.current;
    const document = stampPlannerDocument(state, {
      deviceId: deviceIdRef.current || randomUuid(),
      now: Date.now(),
    });
    deviceIdRef.current = document.sync.deviceId;
    // What the space is sent is its own half of the screen; a change that
    // only touches a plan kept in the browser sends the space nothing.
    // Compared in the form the service would be sent (each plan it would take
    // as served, in its served form): what the page made of a plan it read --
    // a default, the snapshot of a target in an executed plan -- is not an edit,
    // and rewriting it at every reading of the space wrote the space in a loop
    // with any other page or device open on it (PORTAL-SYNC-LOOP-01).
    const spaceFingerprint = spaceKeyOf(document);
    const spaceChanged =
      spaceFingerprint !== persistedSpaceFingerprintRef.current;
    // The stamp says "this copy holds edits newer than the space": a copy
    // whose space half has nothing to send keeps the stamp it had. Stamped,
    // the next reading of the space took this copy for the newer one and
    // wrote it back over what another device had written meanwhile.
    if (
      auth.authenticated &&
      spaceModeRef.current &&
      !spaceChanged &&
      state.sync?.updatedAt
    )
      document.sync = { ...state.sync };
    setSaving(true);
    saveTimerPendingRef.current = true;
    const timer = window.setTimeout(() => {
      saveTimerPendingRef.current = false;
      // Always write the local copy first, even for a connected person.
      // This is the offline copy used at the observing site and makes a failed
      // server request a pending sync rather than a lost edit.
      try {
        rememberScreen(document, { dirty: spaceChanged ? true : undefined });
        persistedFingerprintRef.current = fingerprint;
        // Only the sync stamp is new. `document` is a deep JSON copy, and
        // swapping it in wholesale gave every location, equipment and plan
        // object a new identity -- so each autosave recomputed the whole night
        // (planNightGeometry, planNight) and re-rendered every target card.
        // Same content, same references.
        setState((current) =>
          plannerDocumentFingerprint(current) === fingerprint
            ? { ...current, sync: document.sync }
            : current,
        );
      } catch (error) {
        setPersistenceError(error.message);
      }
      const toSpace =
        auth.authenticated && spaceModeRef.current && spaceChanged;
      const persist = toSpace
        ? (saveQueueRef.current = saveQueueRef.current
            .catch(() => {})
            .then(() => {
              setSyncStatus("syncing");
              persistsInFlightRef.current += 1;
              // Written after the saves queued before it: the revision it
              // goes out with is the one the service gave them back, not
              // the one this copy was read at.
              const screenSpace = splitPlannerDocument(document).space;
              return persistToServer(
                rebaseOnRevisions(
                  servedFormOfUntouchedPlans(
                    screenSpace,
                    servedPlansRef.current,
                  ),
                  serviceRevisionsRef.current,
                ),
                "replace",
                screenSpace,
              ).finally(() => {
                persistsInFlightRef.current -= 1;
              });
            }))
        : Promise.resolve();
      persist
        .then((result) => {
          if (revision !== saveRevisionRef.current) {
            if (!persistsInFlightRef.current && !saveTimerPendingRef.current)
              setSaving(false);
            return;
          }
          const divergent = result?.divergentPlanIds || [];
          if (toSpace && result?.state)
            setExecutionByPlanId(executionByPlanIdOf(result.state));
          // A plan this particular autosave did not itself touch keeps
          // whatever divergence a prior load or save already reported — only
          // an explicit fusion-modal resolution
          // (`applyResolvedPlanResource`) or a fresh conflict on this exact
          // plan ever changes its status, never an unrelated save's silence.
          setDivergentPlanIds((current) => [
            ...new Set([...current, ...divergent]),
          ]);
          let settled = document;
          if (divergent.length) {
            // The server kept a newer revision of these plans: this
            // browser's attempted content is safely parked as a set-aside
            // version there (the revision guard), but the local document
            // must stop repeating the same rejected write on every autosave
            // — reread exactly those plans from the response's
            // authoritative state, nothing else. No automatic merge: the
            // observer's other edits and any actually-new plan are left
            // untouched.
            const serverPlansById = new Map(
              (result.state?.plans || []).map((plan) => [plan.id, plan]),
            );
            const reconciled = {
              ...document,
              plans: document.plans.map((plan) =>
                divergent.includes(plan.id) && serverPlansById.has(plan.id)
                  ? serverPlansById.get(plan.id)
                  : plan,
              ),
            };
            const reconciledFingerprint =
              plannerDocumentFingerprint(reconciled);
            persistedFingerprintRef.current = reconciledFingerprint;
            settled = reconciled;
            setState((current) =>
              plannerDocumentFingerprint(current) === fingerprint
                ? reconciled
                : current,
            );
          }
          if (toSpace) {
            // The space has it: the copy no longer holds anything it lacks,
            // and it holds the revisions the space gave: the same content,
            // so nothing to save again.
            const adopted = rebaseOnRevisions(
              settled,
              revisionsOf(result?.state),
            );
            if (adopted !== settled) {
              const adoptedFingerprint = plannerDocumentFingerprint(adopted);
              persistedFingerprintRef.current = adoptedFingerprint;
              const settledFingerprint = plannerDocumentFingerprint(settled);
              setState((current) =>
                plannerDocumentFingerprint(current) === settledFingerprint
                  ? adopted
                  : current,
              );
              settled = adopted;
            }
            persistedSpaceFingerprintRef.current = spaceKeyOf(settled);
            rememberScreen(settled, { dirty: false });
          } else if (divergent.length) rememberScreen(settled);
          setSaved(true);
          setSaving(false);
          // A save that wrote nothing to the space (the launch has not settled
          // with it, say: the service refused what it asked) does not take
          // back the refusal the person has just been told.
          if (toSpace || !auth.authenticated) setPersistenceError("");
          if (toSpace) setSyncStatus("synced");
          else if (!auth.authenticated) setSyncStatus("local");
          // A plan this save created or re-dated whose night is already over
          // offers its debriefing, to a person whose space holds the plan (a
          // visitor's plans stay in the browser: no debriefing).
          if (toSpace) {
            const ids = [...pastNightIdsRef.current];
            pastNightIdsRef.current.clear();
            const due = pastNightPlansDue({
              plans: settled.plans,
              ids,
              now: Date.now(),
              offered: pastNightOfferedRef.current,
            });
            if (due.length) {
              const plan = due[0];
              void serverPlanIdFor(plan.id).then((serverId) => {
                if (!serverId) return;
                for (const candidate of due)
                  pastNightOfferedRef.current.add(pastNightKey(candidate));
                setPastNightOffer({
                  planId: plan.id,
                  href: pastNightDebriefHref(locale, serverId),
                });
              });
            }
          }
        })
        .catch((error) => {
          if (revision !== saveRevisionRef.current) {
            if (!persistsInFlightRef.current && !saveTimerPendingRef.current)
              setSaving(false);
            return;
          }
          // The service refused a plan beyond the limit of the person's
          // profile (the screen holds it back first, so this is a stale
          // screen or another device having filled the space): the same
          // sentence, never the service's English one.
          if (error.code === "plan_limit_reached") {
            const refusedPlan = document.plans
              .map((plan) =>
                planCreationGate({
                  capabilities,
                  plans: document.plans,
                  date: plan.date,
                  planId: plan.id,
                  signedIn: true,
                }),
              )
              .find((gate) => !gate.allowed);
            refuseCapability(refusedPlan?.refusal || "planLimit", {
              fromService: true,
            });
            setPersistenceError("");
          } else if (
            error.code === "plan_not_deletable" ||
            error.code === "plan_night_not_begun"
          ) {
            // Said as refusals, with the plan back where it
            // was: a plan that is history is not deleted ("archivez-le"),
            // a night that has not begun is not marked executed or abandoned.
            if (error.code === "plan_not_deletable") {
              // A refusal, said as a refusal — a neutral
              // notice with the action that is possible ("Archiver ce plan")
              // — and not a banner of conflict.
              setDeletionRefusal(
                (error.planIds ?? []).map((id) => ({
                  id,
                  name:
                    removedPlansRef.current.get(id)?.name ||
                    message(locale, "plannerUntitledPlan"),
                  // A plan running on a device is not history: it is said
                  // so, and there is nothing to archive.
                  inProgress: (error.inProgressPlanIds ?? []).includes(id),
                })),
              );
              restoreRefusedDeletions(error.planIds);
              setPersistenceError("");
            } else {
              revertRefusedClosures(error.planIds);
              setPersistenceError(message(locale, "plannerPlanNightNotBegun"));
            }
          } else if (error.code === "plan_night_place_conflict") {
            // Rule "une nuit = un lieu": the service holds plans of this
            // night at another place (a phone wrote them meanwhile). The plan
            // stays in the page, unsaved and unchanged — never dropped, never
            // made twice; the plans of the night are read again, and once
            // they are in the document the band shows with its two choices
            // (`nightPlaceConflict`).
            setPersistenceError("");
            void synchronizeSpaceRef.current().catch(() => {});
          } else if (isLinkRefusal(error)) {
            // A link to a multi-night plan the service refused: nothing of
            // the document was written, the link goes back to what the
            // service holds, the rest of the edit stays and is written by
            // the next autosave, and the page says why.
            setPersistenceError("");
            void revertRefusedLink(error);
          } else setPersistenceError(error.message);
          setSaving(false);
          lastSyncErrorRef.current = error;
          setSyncStatus("pending");
        });
    }, 700);
    return () => {
      window.clearTimeout(timer);
      saveTimerPendingRef.current = false;
    };
  }, [auth.authenticated, loaded, serverReady, hydrationFailed, state]);

  useEffect(() => {
    if (!auth.authenticated) return undefined;
    let cancelled = false;
    const synchronizeWhenOnline = async () => {
      if (cancelled) return;
      setSyncStatus("syncing");
      try {
        await synchronizeSpaceRef.current();
      } catch (error) {
        if (!cancelled) reportSynchronizationFailure(error);
      }
    };
    window.addEventListener("online", synchronizeWhenOnline);
    // The reactive change signal: a plan changed elsewhere reruns this
    // exact same, already-tested resync path — this module adds no
    // synchronization logic of its own, only a faster trigger for this one.
    // Removing this listener (and the `startChangeSubscription` effect
    // below) is the whole revert for this lot.
    window.addEventListener(CHANGE_SIGNAL_EVENT, synchronizeWhenOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", synchronizeWhenOnline);
      window.removeEventListener(CHANGE_SIGNAL_EVENT, synchronizeWhenOnline);
    };
  }, [auth.authenticated, plannerStateDefaults]);

  useEffect(() => {
    if (!auth.authenticated) return undefined;
    return startChangeSubscription();
  }, [auth.authenticated]);

  // What the Journal says of each plan (its session, "À débriefer"), read when
  // the library opens and again when the change signal says a night was
  // debriefed elsewhere.
  const [planSessions, setPlanSessions] = useState(() => new Map());
  // A session made again from a plan changes what the Journal says.
  const [planSessionsStamp, setPlanSessionsStamp] = useState(0);
  useEffect(() => {
    if (!auth.authenticated || plannerView !== "library") return undefined;
    let current = true;
    const read = () =>
      loadPlanSessions().then((read) => current && setPlanSessions(read));
    read();
    window.addEventListener(CHANGE_SIGNAL_EVENT, read);
    return () => {
      current = false;
      window.removeEventListener(CHANGE_SIGNAL_EVENT, read);
    };
  }, [auth.authenticated, plannerView, planSessionsStamp]);

  // "Créer un cadrage sur la carte…" of a night's "Cibles": the address carries
  // the night the new framing is made for (`new=1&night=`).
  const [framingForNight, setFramingForNight] = useState(null);
  const framingForNightOpened = useRef(false);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const view = parameters.get("view");
    setFramingForNight(nightFramingRequest(window.location.search));
    // `kind=multi`: the multi-night side of the plans library (the link of
    // the debriefing to a multi-night plan's progress lands there).
    if (parameters.get("kind") === "multi") setPlanKind("multi");
    if (view === "plans") setPlannerView("library");
    if (view === "framings") setPlannerView("framings");
    if (view === "catalogue") setPlannerView("catalogue");
    if (view === "places") setPlannerView("places");
    if (view === "conditions") {
      setConditionsOf({
        placeId: parameters.get("place"),
        date: parameters.get("date"),
      });
      setPlannerView("conditions");
    }
  }, []);

  const changePlannerView = (nextView) => {
    setPlannerView(nextView);
    if (nextView !== "framings") setHighlightedFramingId(null);
    const url = new URL(window.location.href);
    if (nextView === "library") url.searchParams.set("view", "plans");
    else if (nextView === "framings") url.searchParams.set("view", "framings");
    else if (nextView === "catalogue")
      url.searchParams.set("view", "catalogue");
    else if (nextView === "places") url.searchParams.set("view", "places");
    else if (nextView === "conditions")
      url.searchParams.set("view", "conditions");
    else url.searchParams.delete("view");
    if (nextView !== "conditions") {
      url.searchParams.delete("place");
      url.searchParams.delete("date");
    }
    window.history.replaceState({}, "", url);
  };
  const openConditions = (place, date = null) => {
    setConditionsOf({ place, placeId: place?.id ?? null, date });
    changePlannerView("conditions");
    const url = new URL(window.location.href);
    if (place?.id) url.searchParams.set("place", place.id);
    if (date) url.searchParams.set("date", date);
    window.history.replaceState({}, "", url);
  };
  // "Voir dans Cadrages": jumps to the library and highlights
  // this target's own framing card there, reusing `handleFramingAction`'s
  // "edit" case for "Modifier le cadrage" (same rule sheets the library's
  // own "Modifier" already opens -- not a second implementation of the
  // rule, only a different landing place for its result, `forPlanId` telling
  // a copy which plan to replace the reference in).
  const modifyFramingFromTarget = (target) => {
    const resource = framingResourcesById.get(target.framingId);
    if (!resource || !activePlan) return;
    handleFramingAction(resource, "edit", { forPlanId: activePlan.id });
  };
  const viewFramingInLibrary = (target) => {
    if (!target.framingId) return;
    setHighlightedFramingId(target.framingId);
    changePlannerView("framings");
  };

  const availableTargets = useMemo(
    () => planningTargets(targets, locale, targetKnowledge, plannerReferences),
    [locale, plannerReferences, targets, targetKnowledge],
  );
  // The initial candidate request follows the editorial selection whenever it
  // is bounded. “Toutes” and private favorites retain the broader candidate
  // pool so a later local filter never drops a potentially relevant target.
  const selectionFilteredTargets = useMemo(() => {
    const selection = state.catalogueSelection;
    if (selection === "all") return availableTargets;
    if (selection === "favorites") {
      // Avoid a transient empty planner while the user-scoped relation loads.
      if (plannerFavoritesStatus !== "ready") return availableTargets;
      return availableTargets.filter(
        (target) =>
          target.plannerSource !== "catalogue" ||
          plannerFavoriteTargetIds.has(target.id),
      );
    }
    // « Étendues » is the two selections together (disjoint since
    // TARGET-SELECTIONS-TAGS-01), each kept to the equipment's mode.
    const mode = selectionModeOfEquipmentMode(state.equipment.mode);
    return availableTargets.filter(
      (target) =>
        target.plannerSource !== "catalogue" ||
        targetInSelectionPool(target, selection, mode),
    );
  }, [
    availableTargets,
    plannerFavoriteTargetIds,
    plannerFavoritesStatus,
    state.catalogueSelection,
    state.equipment.mode,
  ]);
  // Fill missing snapshots, and repair only positively identified legacy
  // catalogue RA units. User framing centres are never rewritten.
  useEffect(() => {
    if (!availableTargets.length) return;
    const targetsById = new Map(
      availableTargets.map((target) => [target.id, target]),
    );
    let changed = false;
    const plans = state.plans.map((plan) => {
      let planChanged = false;
      let coordinateCorrected = false;
      const items = plan.items.map((item) => {
        if (item.target?.coordinate) {
          const target = reconcileCatalogueSnapshot(
            item.target,
            targetsById.get(item.id),
          );
          if (target === item.target) return item;
          changed = planChanged = coordinateCorrected = true;
          return { ...item, target };
        }
        const target = frozenPlanTarget(targetsById.get(item.id));
        if (!target) return item;
        changed = true;
        planChanged = true;
        return { ...item, target };
      });
      return planChanged
        ? {
            ...plan,
            items,
            ...(coordinateCorrected ? { migrationReview: true } : {}),
          }
        : plan;
    });
    if (!changed) return;
    setSaved(false);
    setState((current) => ({ ...current, plans }));
  }, [availableTargets, state.plans]);
  const inventoryProfiles = useMemo(
    () => equipmentProfilesFromInventory(inventory),
    [inventory],
  );
  // The default group of every picker of a signed-in person: always
  // resolved, so that a plan naming a default item keeps it even while the
  // space hides the group; shown unless the space hides it.
  const defaultProfiles = useMemo(() => {
    const profiles = defaultEquipment
      ? defaultEquipmentProfiles(defaultEquipment)
      : bundledDefaultEquipmentProfiles;
    // The smart telescopes' own filters, which a list read from the portal
    // predates ("Prise de vue par cible").
    return {
      ...profiles,
      // EQUIPMENT-INSTRUMENTS-01: the common binoculars, which the portal's
      // default rows predate.
      telescopes: withCommonBinoculars(profiles.telescopes),
      filters: withSmartTelescopeFilters(profiles.filters),
    };
  }, [defaultEquipment]);
  const shownDefaults = auth.authenticated && !hideDefaultEquipment;
  const guestWithPrivateInventory =
    auth.checked && auth.enabled && !auth.authenticated;
  const visualMode = state.equipment.mode === "visual";
  const plannerTelescopes = useMemo(() => {
    // A visitor, of a private portal too, is limited to the default
    // equipment: « Personnalisé… » is gone, a space is needed for one's own.
    const available = auth.authenticated
      ? inventoryProfiles.telescopes
      : guestTelescopes;
    // Binoculars deliberately stay out of an imaging configuration: they are
    // visual instruments and cannot form a camera field of view.
    return visualMode
      ? available
      : available.filter((profile) => !profile.isBinoculars);
  }, [
    auth.authenticated,
    inventoryProfiles.telescopes,
    guestTelescopes,
    visualMode,
  ]);
  // The default telescopes the picker lists after a signed-in owner's own
  // ("Matériel par défaut"); a guest's `plannerTelescopes` already are
  // the common ones.
  const commonTelescopes = auth.authenticated
    ? visualMode
      ? defaultProfiles.telescopes
      : defaultProfiles.telescopes.filter((profile) => !profile.isBinoculars)
    : emptyProfiles;
  // Every telescope a select outside the equipment section can name.
  const plannerTelescopeOptions = useMemo(
    () => [...plannerTelescopes, ...commonTelescopes],
    [plannerTelescopes, commonTelescopes],
  );
  // A guest's lists are the page's shared default lists (and an empty list
  // the module-level `emptyProfiles`), never a fresh `[]`. A new array on
  // every render made `plannerProfiles` and
  // `equipment` new objects each time, so any render at all -- a stage fold, an
  // autosave -- recomputed `planNight` and rebuilt every target card. A
  // signed-in person's lists: "Mon matériel" then "Matériel par défaut", the
  // defaults kept even when the space hides them so that a plan naming one
  // still resolves; the selects show the two groups apart
  // (`EquipmentPicker`). Computed once per inventory and default list,
  // so each list keeps its reference from one render to the next, as the
  // guest's shared lists do.
  const signedInLists = useMemo(() => {
    const both = (kind) => [
      ...inventoryProfiles[kind],
      ...defaultProfiles[kind],
    ];
    return {
      cameras: both("cameras"),
      eyepieces: both("eyepieces"),
      modifiers: both("modifiers"),
      mounts: both("mounts"),
      filters: both("filters"),
    };
  }, [inventoryProfiles, defaultProfiles]);
  const plannerCameras = auth.authenticated
    ? signedInLists.cameras
    : guestCameras;
  const plannerEyepieces = auth.authenticated
    ? signedInLists.eyepieces
    : guestEyepieces;
  const plannerModifiers = auth.authenticated
    ? signedInLists.modifiers
    : guestModifiers;
  const plannerMounts = auth.authenticated
    ? signedInLists.mounts
    : emptyProfiles;
  // The filters of "Mon matériel" are ticked in a plan and count in the
  // score, as the default ones do: both resolve through
  // `resolveEquipment` into the plan's `filterProfiles`.
  const plannerFilters = auth.authenticated
    ? signedInLists.filters
    : bundledPlannerFilters;
  // The calendar forecast effect depends on the resolved equipment. Keeping
  // this profile set referentially stable prevents every forecast state update
  // from starting a fresh request.
  const plannerProfiles = useMemo(
    () => ({
      ...inventoryProfiles,
      telescopes: plannerTelescopes,
      commonTelescopes,
      cameras: plannerCameras,
      eyepieces: plannerEyepieces,
      modifiers: plannerModifiers,
      mounts: plannerMounts,
      filters: plannerFilters,
    }),
    [
      inventoryProfiles,
      plannerCameras,
      plannerEyepieces,
      plannerModifiers,
      plannerMounts,
      plannerFilters,
      plannerTelescopes,
      commonTelescopes,
    ],
  );
  // The lists of every equipment picker (`EquipmentPicker`): a signed-in
  // person's « Mon matériel » then « Matériel par défaut » (empty while the
  // space hides it), and every profile the plan may name (`known`, the hidden
  // defaults too, so that a closed select still names its value); a
  // visitor's are the default lists, without a heading.
  const equipmentPickers = useMemo(() => {
    const signedIn = Boolean(auth.authenticated);
    const shown = (list) => (shownDefaults ? list : emptyProfiles);
    const withoutNone = (list) =>
      list.filter((profile) => profile.id !== "none");
    const lists = (mine, defaults, known) => ({
      mine,
      defaults,
      known,
      defaultsLabelled: signedIn,
      hidden: signedIn && !shownDefaults,
    });
    const knownModifiers = modifierChoices(locale, plannerModifiers);
    return signedIn
      ? {
          telescope: lists(
            plannerTelescopes,
            shown(commonTelescopes),
            plannerTelescopeOptions,
          ),
          camera: lists(
            inventoryProfiles.cameras,
            shown(defaultProfiles.cameras),
            plannerCameras,
          ),
          eyepiece: lists(
            inventoryProfiles.eyepieces,
            shown(defaultProfiles.eyepieces),
            plannerEyepieces,
          ),
          modifier: lists(
            modifierChoices(locale, withoutNone(inventoryProfiles.modifiers)),
            modifierChoices(locale, shown(defaultProfiles.modifiers)),
            knownModifiers,
          ),
          mount: lists(
            inventoryProfiles.mounts,
            shown(defaultProfiles.mounts),
            plannerMounts,
          ),
        }
      : {
          telescope: lists(emptyProfiles, plannerTelescopes, plannerTelescopes),
          camera: lists(emptyProfiles, plannerCameras, plannerCameras),
          eyepiece: lists(emptyProfiles, plannerEyepieces, plannerEyepieces),
          modifier: lists(
            emptyProfiles,
            modifierChoices(locale, withoutNone(plannerModifiers)),
            knownModifiers,
          ),
          mount: lists(emptyProfiles, plannerMounts, plannerMounts),
        };
  }, [
    auth.authenticated,
    shownDefaults,
    locale,
    plannerTelescopes,
    commonTelescopes,
    plannerTelescopeOptions,
    inventoryProfiles,
    defaultProfiles,
    plannerCameras,
    plannerEyepieces,
    plannerModifiers,
    plannerMounts,
  ]);
  // « Définir mon matériel »: « Mon espace » → « Matériel » for a person
  // signed in to a space (noting the equipment known, so that the return
  // picks the piece just declared); the sign-in page for a visitor of a
  // service with spaces.
  const defineEquipment = useMemo(
    () =>
      auth.authenticated || (auth.checked && auth.enabled)
        ? {
            href: defineEquipmentHref({
              locale,
              signedIn: Boolean(auth.authenticated),
              auth,
            }),
            inventory: auth.authenticated ? inventory : null,
          }
        : null,
    [auth, locale, inventory],
  );
  // Which pickers find nothing for their search: the section's own link
  // gives way to theirs meanwhile (one link on screen).
  const [equipmentNoMatch, setEquipmentNoMatch] = useState({});
  const equipmentNoMatchReporters = useMemo(
    () =>
      Object.fromEntries(
        ["telescope", "camera", "eyepiece", "modifier", "mount"].map(
          (category) => [
            category,
            (noMatch) =>
              setEquipmentNoMatch((current) =>
                Boolean(current[category]) === noMatch
                  ? current
                  : { ...current, [category]: noMatch },
              ),
          ],
        ),
      ),
    [],
  );
  const equipmentSectionNoMatch = Object.values(equipmentNoMatch).some(Boolean);
  // The props of the picker of one field: its lists, « Aucun » / « Aucune »
  // first for the reducer and the mount, the notice of the defaults hidden
  // with nothing of one's own (the section keeps its one link), and
  // « Définir mon matériel » when nothing matches.
  const equipmentPickerProps = (category, value) => {
    const lists = equipmentPickers[category];
    const hiddenEmpty =
      category !== "modifier" &&
      category !== "mount" &&
      !value &&
      equipmentHiddenAndEmpty({ hidden: lists.hidden, mine: lists.mine });
    return {
      locale,
      category,
      value: value ?? null,
      mine: lists.mine,
      defaults: lists.defaults,
      known: lists.known,
      defaultsLabelled: lists.defaultsLabelled,
      leading:
        category === "modifier"
          ? [{ id: "none", label: message(locale, "plannerModifierNone") }]
          : category === "mount"
            ? [{ id: "none", label: message(locale, "plannerMountNone") }]
            : [],
      hiddenEmpty,
      define: hiddenEmpty ? null : defineEquipment,
    };
  };
  // The return from « Définir mon matériel »: the equipment is read again,
  // and a piece that is the only new one of its kind becomes the plan's.
  const returnedInventoryRef = useRef([]);
  useEquipmentReturn({
    enabled: Boolean(auth.authenticated) && serverReady,
    reload: async () => {
      const response = await fetch("/api/equipment", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Equipment loading failed.");
      const items = payload.equipment || [];
      returnedInventoryRef.current = items;
      setInventory(items);
      setDefaultEquipment(
        Array.isArray(payload.defaults) ? payload.defaults : null,
      );
      setHideDefaultEquipment(payload.hideDefaultEquipment === true);
      return items;
    },
    onChosen: (chosen) => {
      // The framing editor open (reopened on its note): the telescope, the
      // camera, the eyepiece and the reducer go into its own equipment.
      let forPlan = chosen;
      if (framingEditorStateRef.current) {
        const { telescope, camera, eyepiece, lens, ...rest } = chosen;
        const editorPieces = Object.fromEntries(
          Object.entries({ telescope, camera, eyepiece, lens }).filter(
            ([, id]) => id,
          ),
        );
        if (Object.keys(editorPieces).length)
          setFramingEditorReturned({ chosen: editorPieces });
        forPlan = rest;
      }
      const patch = {};
      if (forPlan.telescope) patch.telescopeId = forPlan.telescope;
      if (forPlan.camera) patch.cameraId = forPlan.camera;
      if (forPlan.lens) patch.modifierId = forPlan.lens;
      if (forPlan.mount) patch.mountId = forPlan.mount;
      if (forPlan.eyepiece) {
        const eyepiece = equipmentProfilesFromInventory(
          returnedInventoryRef.current,
        ).eyepieces.find((profile) => profile.id === forPlan.eyepiece);
        eyepieceFocalLengthDraftRef.current = null;
        setEyepieceFocalLengthDraft(null);
        patch.eyepieceId = forPlan.eyepiece;
        patch.eyepieceFocalLengthMm = eyepiece?.focalLengthMm || "";
      }
      if (forPlan.filter) {
        const filterIds = stateRef.current.equipment.filterIds || [];
        if (!filterIds.includes(forPlan.filter))
          patch.filterIds = [...filterIds, forPlan.filter];
      }
      if (Object.keys(patch).length) updateEquipmentPatch(patch);
    },
  });
  const equipment = useMemo(
    () => resolveEquipment(state.equipment, plannerProfiles),
    [state.equipment, plannerProfiles],
  );
  // The telescope, the camera and the eyepiece the plan names, or nothing
  // while none is chosen (« Choisir… »): never the first of a list.
  const selectedTelescope = plannerTelescopeOptions.find(
    (profile) => profile.id === state.equipment.telescopeId,
  );
  // A connected telescope's camera is built in and fixed.
  const connectedTelescope = selectedTelescope?.integratedCamera
    ? selectedTelescope
    : null;
  const selectedCamera = plannerCameras.find(
    (profile) => profile.id === state.equipment.cameraId,
  );
  const selectedEyepiece = plannerEyepieces.find(
    (profile) => profile.id === state.equipment.eyepieceId,
  );
  const eyepieceZoomMinimum = Number(selectedEyepiece?.minFocalLengthMm);
  const eyepieceZoomMaximum = Number(selectedEyepiece?.maxFocalLengthMm);
  const hasVariableEyepieceFocalLength =
    eyepieceZoomMinimum > 0 && eyepieceZoomMaximum >= eyepieceZoomMinimum;
  const selectedEyepieceFocalLength = hasVariableEyepieceFocalLength
    ? Math.max(
        eyepieceZoomMinimum,
        Math.min(
          eyepieceZoomMaximum,
          Number(state.equipment.eyepieceFocalLengthMm) ||
            Number(selectedEyepiece?.focalLengthMm),
        ),
      )
    : Number(selectedEyepiece?.focalLengthMm);
  // A range input fires continuously while it is dragged. Keeping this
  // transient value outside the saved plan prevents the full planner,
  // recommendation calculation and map from being rebuilt on every half mm.
  const [eyepieceFocalLengthDraft, setEyepieceFocalLengthDraft] =
    useState(null);
  const eyepieceFocalLengthDraftRef = useRef(null);
  const updateEyepieceFocalLengthDraft = (value) => {
    eyepieceFocalLengthDraftRef.current = value;
    setEyepieceFocalLengthDraft(value);
  };
  const displayedEyepieceFocalLength = Number.isFinite(eyepieceFocalLengthDraft)
    ? eyepieceFocalLengthDraft
    : selectedEyepieceFocalLength;
  useEffect(() => {
    eyepieceFocalLengthDraftRef.current = null;
    setEyepieceFocalLengthDraft(null);
  }, [eyepieceZoomMaximum, eyepieceZoomMinimum, state.equipment.eyepieceId]);
  const selectedModifier =
    plannerModifiers.find(
      (profile) => profile.id === state.equipment.modifierId,
    ) || plannerModifiers[0];
  // The mount profile is inventory information only ("this plan occupies
  // this mount") — mount safety (zenith avoidance, cable/obstacle azimuth
  // sector) is a plan-level setting, available regardless of which mount
  // (if any) is selected. It stays user-activated and off by default via
  // `normaliseMountSafety`'s own defaults.
  const mountSafetyHasZenithOrCable =
    state.mountSafety.zenithAvoidanceDegrees > 0 ||
    (state.mountSafety.azimuthStart !== "" &&
      state.mountSafety.azimuthEnd !== "" &&
      Number.isFinite(Number(state.mountSafety.azimuthStart)) &&
      Number.isFinite(Number(state.mountSafety.azimuthEnd)));
  // MERIDIAN-LIMIT-02a: the plan's mount, when it can flip at the meridian
  // (equatorial, hybrid, a kind not said): « Couper au méridien » is offered
  // for it, free like the rest of the restrictions (protection of the gear).
  const planMount =
    state.equipment.mountId && state.equipment.mountId !== "none"
      ? plannerMounts.find(
          (profile) => profile.id === state.equipment.mountId,
        ) || null
      : null;
  const meridianCutOffered =
    Boolean(planMount) && mountFlipsAtMeridian(planMount);
  const meridianPlanLimit = normaliseMeridianLimit(
    state.mountSafety.meridianLimitMinutes,
  );
  const meridianMountLimit = normaliseMeridianLimit(
    planMount?.meridianLimitMinutes,
  );
  const meridianCutOn = state.mountSafety.meridianCut !== false;
  const mountSafetyConfigured =
    mountSafetyHasZenithOrCable ||
    (meridianCutOffered &&
      (meridianPlanLimit !== null || meridianMountLimit !== null));
  // With no zenith or cable value, the switch commands the cut alone: it
  // shows what the cut is doing.
  const mountSafetySwitchOn =
    state.mountSafety.enabled ||
    (meridianCutOffered && !mountSafetyHasZenithOrCable && meridianCutOn);
  const effectiveMountSafety = useMemo(
    () => normaliseMountSafety(state.mountSafety),
    [state.mountSafety],
  );
  useEffect(() => {
    if (!auth.authenticated || !serverReady) return;
    // With "Ma configuration par défaut" set, a new plan starts from it and
    // nothing is adopted in silence (the owner's equipment is adopted
    // only when no configuration is set).
    if (defaultConfiguration) return;
    setState((current) => {
      const active = current.plans.find(
        (plan) => plan.id === current.activePlanId,
      );
      if (active && planStatus(active) !== "pending") return current;
      const has = (profiles, id) =>
        profiles.some((profile) => profile.id === id);
      // The signed-in owner's inventory (`newPlanEquipment`). A common
      // telescope, camera or eyepiece the owner picked is a choice, not a seed:
      // it stays beside the inventory's own (the eyepiece was put back on
      // "Personnalisé" at every load, and the plan written back to the service
      // that way).
      const start = ownerStartEquipment(current.equipment, inventory, {
        telescopes: instrumentProfiles,
        cameras: cameraProfiles,
        eyepieces: eyepieceProfiles,
      });
      const nextTelescopeId = start.telescopeId;
      const nextCameraId = start.cameraId;
      const nextEyepieceId = start.eyepieceId;
      const nextModifierId = has(
        inventoryProfiles.modifiers,
        current.equipment.modifierId,
      )
        ? current.equipment.modifierId
        : inventoryProfiles.modifiers[0]?.id || "none";
      const nextMountId =
        current.equipment.mountId === "none" ||
        has(inventoryProfiles.mounts, current.equipment.mountId)
          ? current.equipment.mountId
          : inventoryProfiles.mounts[0]?.id || "none";
      const nextFilterIds = current.equipment.filterIds || [];
      if (
        nextTelescopeId === current.equipment.telescopeId &&
        nextCameraId === current.equipment.cameraId &&
        nextEyepieceId === current.equipment.eyepieceId &&
        nextModifierId === current.equipment.modifierId &&
        nextMountId === current.equipment.mountId &&
        nextFilterIds.length === (current.equipment.filterIds || []).length
      )
        return current;
      const next = {
        ...current,
        equipment: {
          ...current.equipment,
          telescopeId: nextTelescopeId,
          cameraId: nextCameraId,
          eyepieceId: nextEyepieceId,
          modifierId: nextModifierId,
          mountId: nextMountId,
          filterIds: nextFilterIds,
        },
      };
      return applyActivePlanSnapshot(next, planSnapshot(next));
    });
  }, [
    auth.authenticated,
    defaultConfiguration,
    inventory,
    inventoryProfiles,
    serverReady,
    state.activePlanId,
  ]);
  const activeHorizonMask = useMemo(
    () => normaliseHorizonMask(state.location.horizonMask),
    [state.location.horizonMask],
  );
  const activeHorizonMaskLabel = activeHorizonMask.enabled
    ? state.location.name?.trim() || message(locale, "plannerHorizonCurrent")
    : "";
  const savedTargetSignature = JSON.stringify(
    (state.plans.find((plan) => plan.id === state.activePlanId)?.items || [])
      .map((item) => item.target)
      .filter(Boolean),
  );
  const framingTargetSignature = JSON.stringify(
    state.plans
      .flatMap((plan) => plan.items || [])
      .map((item) => item.target)
      .filter(
        (target) => target?.framing || target?.plannerSource === "framing",
      ),
  );
  const activePlanSavedTargets = useMemo(
    () =>
      (state.plans.find((plan) => plan.id === state.activePlanId)?.items || [])
        .map((item) => item.target)
        .filter(
          (target) =>
            target?.id &&
            Number.isFinite(Number(target.coordinate?.ra)) &&
            Number.isFinite(Number(target.coordinate?.dec)),
        )
        .map((target) =>
          target.plannerSource === "framing" || target.framing
            ? { ...target, plannerSource: "framing" }
            : target,
        ),
    [savedTargetSignature],
  );
  // Framing is a reusable, coordinate-based target rather than a transient
  // item on the plan that created it.  Surface every saved framing on the
  // current night so the dedicated recommendation source can assess it again
  // with today's location, equipment and constraints.
  const savedFramingTargets = useMemo(() => {
    const byId = new Map();
    for (const plan of state.plans) {
      for (const item of plan.items || []) {
        const target = item?.target;
        if (
          !(target?.plannerSource === "framing" || target?.framing) ||
          !target.id ||
          !Number.isFinite(Number(target.coordinate?.ra)) ||
          !Number.isFinite(Number(target.coordinate?.dec))
        )
          continue;
        byId.set(target.id, { ...target, plannerSource: "framing" });
      }
    }
    // The recommendation source lists the whole account library (non-archived,
    // locked included — that is the stacking use case), not only framings
    // already embedded in a currently loaded plan. The library's own state
    // (name/revision/framingState) wins over whatever a plan's own copy still
    // carries.
    for (const target of libraryFramingTargets) {
      byId.set(target.id, {
        ...(byId.get(target.id) || {}),
        ...target,
        plannerSource: "framing",
      });
    }
    return [...byId.values()];
  }, [framingTargetSignature, libraryFramingTargets]);
  const savedTargetsById = useMemo(
    () =>
      new Map(
        [...activePlanSavedTargets, ...savedFramingTargets].map((target) => [
          target.id,
          target,
        ]),
      ),
    [activePlanSavedTargets, savedFramingTargets],
  );
  useEffect(() => {
    const saved = surfaceModel?.savedSurface(
      savedTargetsById.get(mapSelectedTargetId)?.framing,
    );
    if (saved) setFrameSurface(surfaceModel.normalize(saved));
  }, [mapSelectedTargetId, savedTargetsById]);
  const activeTargetsFor = (sourceTargets) => [
    ...sourceTargets.map((target) => {
      const savedTarget = savedTargetsById.get(target.id);
      return savedTarget
        ? { ...target, ...savedTarget, coordinate: savedTarget.coordinate }
        : target;
    }),
    ...activePlanSavedTargets.filter(
      (target) =>
        !sourceTargets.some((candidate) => candidate.id === target.id),
    ),
    ...savedFramingTargets.filter(
      (target) =>
        !sourceTargets.some((candidate) => candidate.id === target.id) &&
        !activePlanSavedTargets.some((candidate) => candidate.id === target.id),
    ),
  ];
  const allActiveNightTargets = useMemo(
    () => activeTargetsFor(availableTargets),
    [
      activePlanSavedTargets,
      availableTargets,
      savedFramingTargets,
      savedTargetsById,
    ],
  );
  const selectionActiveNightTargets = useMemo(
    () => activeTargetsFor(selectionFilteredTargets),
    [
      activePlanSavedTargets,
      savedFramingTargets,
      savedTargetsById,
      selectionFilteredTargets,
    ],
  );
  const activeNightTargets = useMemo(() => {
    if (!state.equipment.restrictToEquipment)
      return selectionActiveNightTargets;
    return selectionActiveNightTargets.filter(
      (target) =>
        target.plannerSource !== "catalogue" ||
        savedTargetsById.has(target.id) ||
        (targetMatchesEquipmentGuide(target, equipment) &&
          targetFilterCompatibility(target, equipment) !== false),
    );
  }, [
    equipment,
    savedTargetsById,
    selectionActiveNightTargets,
    state.equipment.restrictToEquipment,
  ]);
  const activeDarkness = planDarkness(
    state.plans.find((plan) => plan.id === state.activePlanId),
  );
  const darknessEffectRows = useMemo(
    () => darknessEffects({ date: state.date, location: state.location }),
    [state.date, state.location],
  );
  // "Effet sur ce soir" when the night shown begins this very evening.
  // The night the place is in (from its zone, else its longitude), never
  // the browser's civil date.
  const darknessEffectIsTonight =
    state.date === tonightDate({ place: state.location });
  const nightGeometry = useMemo(
    () =>
      planNightGeometry({
        date: state.date,
        location: state.location,
        targets: allActiveNightTargets,
        locale,
        planetReferences,
        darkness: activeDarkness,
      }),
    [
      activeDarkness,
      allActiveNightTargets,
      locale,
      planetReferences,
      state.date,
      state.location,
    ],
  );
  // The span of the night of the active plan: the sky the "Durée de la
  // nuit" timeline draws, and the custom span, if any, that placement and
  // the review reason read. The plan's minutes still count from the start
  // of the dark night (`nightGeometry`).
  const activeNightSpanSource = state.plans.find(
    (plan) => plan.id === state.activePlanId,
  )?.nightSpan;
  const activeNightSpanKey = JSON.stringify(activeNightSpanSource ?? null);
  const nightSpanSky = useMemo(
    () =>
      planNightSpanSky(
        {
          date: state.date,
          darkness: activeDarkness,
          nightSpan: activeNightSpanSource,
        },
        state.location,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeDarkness, activeNightSpanKey, state.date, state.location],
  );
  const activeNightSpan = customSpanOfWindow(nightSpanSky);
  // The forecast's hours across the timeline's scale, an hour more on each
  // side so the cloud curve reaches both ends.
  const nightSpanHourly = useMemo(
    () =>
      nightSpanSky && forecast.status === "ready" && forecast.value?.rawHourly
        ? hourlyAstronomyForecast({
            hourly: forecast.value.rawHourly,
            night: {
              start: new Date(
                Date.parse(nightSpanSky.scaleStart) - 3600000,
              ).toISOString(),
              end: new Date(
                Date.parse(nightSpanSky.scaleEnd) + 3600000,
              ).toISOString(),
            },
            moon: forecastMoonOfNight(nightSpanSky),
          })
        : [],
    [forecast, nightSpanSky],
  );
  const planCustomNightSpan = (plan) =>
    customSpanOfWindow(
      planNightWindow(
        {
          date: state.date,
          darkness: plan?.darkness,
          nightSpan: plan?.nightSpan,
        },
        state.location,
      ),
    );
  const scoreSkyQuality =
    skyQuality.status === "ready" ? skyQuality.value : null;
  // The night's place shows its measured or typed value when it has one;
  // the estimate alone keeps its rendering.
  const plannerSkyBrightness = placeSkyBrightness({
    place: (() => {
      const known = knownPlaces?.find(
        (entry) => entry?.id && entry.id === state.location?.id,
      );
      return known
        ? { ...state.location, skyEntered: known.skyEntered }
        : state.location;
    })(),
    model: scoreSkyQuality,
    measures: placeSkyMeasures,
  });
  // The sky the note reads is the one shown (TARGET-STATS-SKY-PLACE-01, Q4):
  // read by its numbers and source, so the scores are computed again only when
  // they change.
  const scoreSkyChoice = plannerSkyBrightness.choice;
  const scoreSkySource = scoreSkyChoice?.source ?? null;
  const scoreSkySqm = scoreSkyChoice?.shown?.sqm ?? null;
  const scoreSkyBortle = scoreSkyChoice?.shown?.bortleClass ?? null;
  const scoreSky = useMemo(
    () => scoreSkyOfChoice(scoreSkyChoice),
    // The choice is read by the three values above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoreSkySource, scoreSkySqm, scoreSkyBortle],
  );
  const plannerSkyObserved =
    plannerSkyBrightness.choice?.source === "measured" ||
    plannerSkyBrightness.choice?.source === "entered";
  // The place's sky as the sky-brightness rule shows it (measured, typed,
  // else estimated), for the visual limit of the cards
  // (`visualSuitability`); read by its two numbers so the night is computed
  // again only when they change, and in visual mode only.
  const visualSkySqm =
    equipment.mode === "visual"
      ? (plannerSkyBrightness.choice?.shown?.sqm ?? null)
      : null;
  const visualSkyBortle =
    equipment.mode === "visual"
      ? (plannerSkyBrightness.choice?.shown?.bortleClass ?? null)
      : null;
  const visualSkyQuality = useMemo(
    () =>
      visualSkySqm === null && visualSkyBortle === null
        ? null
        : { sqm: visualSkySqm, bortleClass: visualSkyBortle },
    [visualSkySqm, visualSkyBortle],
  );
  // VISUAL-SIM-02a: the eyepieces and filters of « Mon matériel », which the
  // preview tries too, judge the visual cards before the generic ones.
  const visualInventory = useMemo(
    () => visualInventoryOf(inventoryProfiles),
    [inventoryProfiles],
  );
  const rawNight = useMemo(
    () =>
      planNight({
        date: state.date,
        location: state.location,
        targets: activeNightTargets,
        profile: equipment,
        locale,
        minAltitude: Number(state.minAltitude),
        moonSeparationMinimum: Number(state.moonSeparationMinimum),
        planetReferences,
        moonSeparationMinimumForTarget: ({ filter }) =>
          state.moonSeparationMinimumByFilter?.[filter] ??
          Number(state.moonSeparationMinimum),
        geometry: nightGeometry,
        retainedTargetIds: activePlanSavedTargets.map((target) => target.id),
        skyQuality: visualSkyQuality,
        visualInventory,
      }),
    [
      visualSkyQuality,
      visualInventory,
      activeNightTargets,
      equipment,
      nightGeometry,
      locale,
      planetReferences,
      state.date,
      state.location,
      state.minAltitude,
      state.moonSeparationMinimumByFilter,
      state.moonSeparationMinimum,
      activePlanSavedTargets,
    ],
  );
  const hasRecommendationRestriction = Boolean(
    state.catalogueSelection !== "all" || state.equipment.restrictToEquipment,
  );
  const unrestrictedRawNight = useMemo(() => {
    if (!hasRecommendationRestriction) return rawNight;
    return planNight({
      date: state.date,
      location: state.location,
      targets: allActiveNightTargets,
      profile: equipment,
      locale,
      minAltitude: Number(state.minAltitude),
      moonSeparationMinimum: Number(state.moonSeparationMinimum),
      planetReferences,
      moonSeparationMinimumForTarget: ({ filter }) =>
        state.moonSeparationMinimumByFilter?.[filter] ??
        Number(state.moonSeparationMinimum),
      geometry: nightGeometry,
      retainedTargetIds: activePlanSavedTargets.map((target) => target.id),
      skyQuality: visualSkyQuality,
      visualInventory,
    });
  }, [
    visualSkyQuality,
    visualInventory,
    allActiveNightTargets,
    equipment,
    hasRecommendationRestriction,
    locale,
    nightGeometry,
    planetReferences,
    rawNight,
    state.date,
    state.location,
    state.minAltitude,
    state.moonSeparationMinimum,
    state.moonSeparationMinimumByFilter,
    activePlanSavedTargets,
  ]);
  const night = useMemo(
    () =>
      rawNight
        ? {
            ...rawNight,
            cards: withHorizonMask(
              rawNight.cards,
              activeHorizonMask,
              Number(state.minAltitude),
              Number(state.moonSeparationMinimum),
              effectiveMountSafety,
            ),
          }
        : null,
    [
      activeHorizonMask,
      rawNight,
      state.minAltitude,
      state.moonSeparationMinimum,
      effectiveMountSafety,
    ],
  );
  const unrestrictedNight = useMemo(
    () =>
      unrestrictedRawNight
        ? {
            ...unrestrictedRawNight,
            cards: withHorizonMask(
              unrestrictedRawNight.cards,
              activeHorizonMask,
              Number(state.minAltitude),
              Number(state.moonSeparationMinimum),
              effectiveMountSafety,
            ),
          }
        : null,
    [
      activeHorizonMask,
      effectiveMountSafety,
      state.minAltitude,
      state.moonSeparationMinimum,
      unrestrictedRawNight,
    ],
  );
  // The forecast's ten days count from the night the place is in, not from the
  // UTC date.
  const forecastAvailability = useMemo(
    () =>
      placeForecastAvailability({ date: state.date, place: state.location }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.date,
      state.location?.latitude,
      state.location?.longitude,
      state.location?.timeZone,
    ],
  );
  // A night 11 to 15 days out reads its weather, as a
  // trend (the score card says so).
  const forecastIsRelevant =
    forecastAvailability === "available" || forecastAvailability === "trend";
  const forecastIsTrend = forecastAvailability === "trend";
  const forecastIsBeyondRange = forecastAvailability === "beyond-range";
  const rawExclusions = rawNight?.exclusions || [];
  const moonExcludedCount = rawExclusions.filter(
    (entry) => entry.reason === "moon",
  ).length;
  const altitudeExcludedCount = rawExclusions.filter(
    (entry) => entry.reason === "altitude",
  ).length;
  useEffect(() => {
    const coordinates = locationCoordinates(state.location);
    if (!coordinates) {
      setSkyQuality({ status: "idle", value: null });
      return undefined;
    }
    const controller = new AbortController();
    setSkyQuality({ status: "loading", value: null });
    requestPlannerSkyQuality(coordinates, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted)
          setSkyQuality({ status: "ready", value });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setSkyQuality({ status: "unavailable", value: null });
          reportClientLog({
            event: "planner.sky_quality_unavailable",
            message: error.message || "Sky-quality estimate unavailable",
            context: { service: "LightPollutionMap" },
          });
        }
      });
    return () => controller.abort();
  }, [state.location.latitude, state.location.longitude]);
  useEffect(() => {
    const coordinates = locationCoordinates(state.location);
    setSkyDirection(null);
    if (!coordinates) return undefined;
    const controller = new AbortController();
    requestPlannerSkyDirection(coordinates, { signal: controller.signal })
      .then((grid) => {
        if (!controller.signal.aborted) setSkyDirection(grid);
      })
      .catch(() => {
        // Without the grid the ranking reads the zenith sky alone.
      });
    return () => controller.abort();
  }, [state.location.latitude, state.location.longitude]);
  useEffect(() => {
    const coordinates = locationCoordinates(state.location);
    if (!night || !forecastIsRelevant || !coordinates) {
      setForecast({ status: "idle", value: null });
      forecastContextRef.current = null;
      return undefined;
    }
    // A manual refresh of the *same* place/night keeps whatever is already on
    // screen while it re-fetches -- only the hourly section's own refresh icon
    // spins (`HourlyForecast`'s `refreshing` prop) -- instead of flashing back
    // to the plain "Loading…" line. A genuine place or date change is a
    // different context entirely, so the previous night's numbers must not
    // linger on screen even briefly.
    const contextKey = `${state.location.latitude}|${state.location.longitude}|${night.start}|${night.end}`;
    const sameContext = forecastContextRef.current === contextKey;
    forecastContextRef.current = contextKey;
    const controller = new AbortController();
    setForecast((current) => ({
      status: "loading",
      value: sameContext ? current.value : null,
    }));
    requestAstronomyWeather(coordinates, {
      signal: controller.signal,
      refresh: forecastRetry > 0,
    })
      .then((data) => {
        const value = summarizeAstronomyForecast({
          hourly: data.hourly,
          night,
          moon: forecastMoonOfNight(night),
        });
        if (!controller.signal.aborted && value)
          lastGoodForecastRef.current = {
            context: contextKey,
            at: data.fetchedAt ?? null,
          };
        if (!controller.signal.aborted)
          setForecast({
            status: value ? "ready" : "unavailable",
            value: value
              ? {
                  ...value,
                  fetchedAt: data.fetchedAt,
                  stale: data.stale,
                  source: data.source,
                  fallback: Boolean(data.fallback),
                  missingFields: data.missingFields || [],
                  hourly: hourlyAstronomyForecast({
                    hourly: data.hourly,
                    night,
                    moon: forecastMoonOfNight(night),
                  }),
                  // The whole response, for "Durée de la nuit", whose
                  // timeline reaches beyond the night.
                  rawHourly: data.hourly,
                }
              : null,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          // The score card says why, as on "Cette nuit" — nothing answered
          // (no connection), or the service answered with an error.
          const offline =
            error instanceof TypeError ||
            (typeof navigator !== "undefined" && navigator.onLine === false);
          setForecast({
            status: "unavailable",
            value: null,
            error: error.code,
            failure: offline ? "network_error" : error?.code || "service_error",
            lastGoodAt:
              lastGoodForecastRef.current.context === contextKey
                ? lastGoodForecastRef.current.at
                : null,
          });
          reportClientLog({
            event: "planner.forecast_unavailable",
            message: error.message || "Weather forecasts unavailable",
            context: {
              service: "Open-Meteo + MET Norway",
              date: state.date,
            },
          });
        }
      });
    return () => controller.abort();
  }, [
    forecastIsRelevant,
    forecastRetry,
    night?.end,
    night?.start,
    state.location.latitude,
    state.location.longitude,
  ]);
  const plansForDate = plansForNight(state.plans, state.activeNightId);
  // The plans a very distant place moves with the night, as the tabs name them
  // (the far-place dialog says, for each, from where to where).
  const planNamesOf = (plans) =>
    plans.map((plan) =>
      plan.name
        ? localizedPlanName(locale, plan.name, plan.date)
        : message(locale, "plannerUntitledPlan"),
    );
  // Rule "une nuit = un lieu": the date has plans still to plan at
  // another place than the one chosen — the band, with its two choices;
  // the tabs are closed and nothing is editable while it shows.
  const nightConflict = nightPlaceConflict(state);
  // The tabs hold only the plans still to plan; a plan that ran is not the
  // one the page edits.
  const tabPlans = plannerTabPlans(plansForDate);
  const activePlan =
    tabPlans.find((plan) => plan.id === state.activePlanId) || null;
  // A plan may only be created once a place and a date are chosen -- `night` is
  // the shared astronomy computation for both, so its presence is the single
  // source of truth for that prerequisite. Whether the profile allows one more
  // plan is a separate question (`gates`): the button stays usable and says so
  // when it is refused.
  const canCreatePlanNow = Boolean(night);
  // The plan whose night runs on a phone is read here, not edited.
  const activePlanExecution = planExecutionOf(executionByPlanId, activePlan);
  const activePlanEditable =
    !activePlan ||
    (planStatus(activePlan) === "pending" && !activePlanExecution);
  const addDisabledReason = targetAddDisabledReason({
    hasActivePlan: Boolean(activePlan),
    planCount: plansForDate.length,
  });
  const activePlanIsReadOnly = Boolean(activePlan && !activePlanEditable);
  const canEditActivePlan = (current = stateRef.current) => {
    // A night that has two places is not edited until it has one.
    if (nightPlaceConflict(current)) return false;
    const plan = current.plans.find(
      (entry) => entry.id === current.activePlanId,
    );
    return (
      !plan ||
      (planStatus(plan) === "pending" &&
        !planExecutionOf(executionRef.current, plan))
    );
  };
  const activeItems = activePlan?.items || [];
  // The night's wind against the active plan's own copy of its mount's
  // tolerance: an interval in a gusty hour is flagged. Only a plan that
  // has a mount has a limit to be near.
  const activeWindAssessment = equipmentHasMount(activePlan?.equipment)
    ? windAssessment({
        hourly: forecast.value?.hourly,
        tolerance: planWindTolerance(activePlan),
        window: night,
      })
    : null;
  // What the "Tolérance au vent" section shows: the tolerance this browser
  // keeps for the plan's mount, else the plan's own copy, against the night.
  const windShownTolerance = normalizeWindTolerance(
    windPreferences[windToleranceKey(state.equipment)] ??
      state.equipment.windTolerance,
  );
  const windShownAssessment = windAssessment({
    hourly: forecast.value?.hourly,
    tolerance: windShownTolerance,
    window: night,
  });
  const windMountName =
    state.equipment.mountId && state.equipment.mountId !== "none"
      ? plannerMounts.find((profile) => profile.id === state.equipment.mountId)
          ?.name || null
      : null;
  // The filters the observer owns (the inventory's, read only, then this
  // browser's) and the Moon's advice on them for the night.
  const ownedFilters = plannerOwnedFilters({
    signedIn: Boolean(auth.authenticated),
    inventory: inventoryProfiles.filters,
    local: localFilters,
  });
  const filterAdvice = filterAdviceForNight({
    ownedFilters,
    moonSeries: night?.moonSeries,
    night: night && {
      start: night.start,
      end: night.end,
      moonIllumination: night.moonIllumination,
    },
  });
  // The score of every card for the night (docs/PLANNER_SCORE.md), against the
  // plan's span of the night, the forecast, the place's sky quality and horizon
  // mask, the plan's field and filters, the filters owned (the device's
  // included) and the wind tolerance shown for the mount.
  const scoreHourly = forecast.value?.hourly;
  // The plan's night as "Cette nuit" tells it — the same overview
  // (`tonightOverview`: the verdict, the tiles, the Moon) and the same
  // words (`tonightWords`), fed by this page's own reads of the night.
  const plannerNight = useMemo(() => {
    const hourly =
      forecast.status === "ready" || forecast.status === "loading"
        ? (forecast.value?.hourly ?? [])
        : [];
    const overview = tonightOverview({
      place: state.location,
      date: state.date,
      night: nightSpanSky,
      hourly,
      moonIllumination: night?.moonIllumination ?? null,
      skyQuality:
        plannerSkyBrightness.choice?.shown ??
        (skyQuality.status === "ready" ? skyQuality.value : null),
      darkness: activeDarkness,
      forecast: forecast.value ?? null,
    });
    const words = tonightWords(overview, {
      locale,
      timeZone: validTimeZone(state.location.timeZone),
      verdictStatus: tonightVerdictStatus(
        forecast.value
          ? { status: "ready" }
          : { status: forecast.status, failure: forecast.failure },
        {
          date: state.date,
          availability: forecastAvailability,
          // A plan whose night is over gets its reason, no retry; the
          // planner's rule for "il y a 4 jours".
          past:
            planDaysAgo({
              date: state.date,
              location: state.location,
              darkness: activeDarkness,
            }) !== null,
        },
      ),
      verdictHours: hourly,
      forecastUpdated: forecast.value?.fetchedAt
        ? {
            fetchedAt: forecast.value.fetchedAt,
            stale: forecast.value.stale === true,
          }
        : null,
      skySource: plannerSkyBrightness.choice?.source ?? null,
      lastGoodAt: forecast.lastGoodAt ?? null,
      loading: {
        weather: forecast.status === "loading" && !forecast.value,
        skyQuality: skyQuality.status === "loading",
      },
    });
    return { overview, words, hourly };
  }, [
    activeDarkness,
    forecast,
    locale,
    night?.moonIllumination,
    nightSpanSky,
    plannerSkyBrightness,
    skyQuality,
    state.date,
    state.location,
  ]);
  // The eyepiece view's setting -- the plan's visual equipment and the
  // place's sky as the sky-brightness rule shows it -- for every visual
  // image of the page (`EyepieceViewContext`).
  const eyepieceSkyShown = plannerSkyBrightness.choice?.shown ?? null;
  // « Prévisualiser » says whose sky the disc is seen under: the plan's place,
  // or, for a place picked in the catalogue's dialog, its own.
  const plannerPreviewSky = previewSkyProps({
    choice: plannerSkyBrightness.choice,
    place: state.location,
    loading: placeSkyLoading({
      choice: plannerSkyBrightness.choice,
      measures: placeSkyMeasures,
      modelStatus: skyQuality.status,
    }),
  });
  const plannerPreviewSkyFor = (place) =>
    previewSkyProps({
      choice: placeSkyBrightness({
        place: (() => {
          const known = knownPlaces?.find(
            (entry) => entry?.id && entry.id === place?.id,
          );
          return known ? { ...place, skyEntered: known.skyEntered } : place;
        })(),
        // The estimate is read for the plan's place only.
        model:
          place?.id && place.id === state.location?.id ? scoreSkyQuality : null,
        measures: placeSkyMeasures,
      }).choice,
      place,
    });
  const eyepieceContext = useMemo(
    () => ({
      locale,
      // The plan's mode is the one decision; a missing value draws the
      // disc at a default field and the equipment says so.
      visual: equipment.mode === "visual",
      setting: eyepieceViewSetting(
        {
          mode: equipment.mode,
          apertureMm: equipment.apertureMm,
          focalLengthMm: equipment.focalLengthMm,
          eyepieceFocalLengthMm: equipment.eyepieceFocalLengthMm,
          apparentFieldDegrees: equipment.apparentFieldDegrees,
        },
        eyepieceSkyShown,
      ),
    }),
    // The setting depends on these numbers only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      locale,
      equipment.mode,
      equipment.apertureMm,
      equipment.focalLengthMm,
      equipment.eyepieceFocalLengthMm,
      equipment.apparentFieldDegrees,
      eyepieceSkyShown?.sqm,
      eyepieceSkyShown?.bortleClass,
    ],
  );
  const scoreOwnedFiltersKey = JSON.stringify(ownedFilters);
  const scoreToleranceKey = JSON.stringify(windShownTolerance);
  const tonightScores = useMemo(() => {
    const scores = new Map();
    if (!night) return scores;
    const window = {
      start: nightSpanSky?.start ?? night.start,
      end: nightSpanSky?.end ?? night.end,
      darkStart: nightSpanSky?.darkStart ?? night.start,
      darkEnd: nightSpanSky?.darkEnd ?? night.end,
      moonIllumination: night.moonIllumination,
    };
    const minAltitude = Number(state.minAltitude);
    const field = fieldOfView(equipment);
    for (const card of night.cards || []) {
      scores.set(
        card.target.id,
        targetTonightScore({
          card,
          window,
          hourly: scoreHourly,
          moonSeries: night.moonSeries,
          skyQuality: scoreSky,
          skyDirection,
          maskPath: targetNightPath({
            series: card.series || [],
            mask: activeHorizonMask,
            minAltitude,
            moonSeparationMinimum: card.constraints?.moonSeparationMinimum ?? 0,
            mountSafety: effectiveMountSafety,
          }),
          equipment: {
            field,
            mode: equipment.mode,
            filters: equipment.filters,
          },
          ownedFilters,
          windTolerance: windShownTolerance,
          minAltitude,
        }),
      );
    }
    return scores;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    night,
    nightSpanSky?.start,
    nightSpanSky?.end,
    scoreHourly,
    scoreSky,
    skyDirection,
    activeHorizonMask,
    effectiveMountSafety,
    equipment,
    scoreOwnedFiltersKey,
    scoreToleranceKey,
    state.minAltitude,
  ]);
  const activePlanCards = (night?.cards || [])
    .filter((card) => activeItems.some((item) => item.id === card.target.id))
    .map((card) =>
      activePlanCardReviewReasons({
        card,
        equipment,
        restrictToEquipment: state.equipment.restrictToEquipment,
        catalogueSelection: state.catalogueSelection,
        favoritesReady: plannerFavoritesStatus === "ready",
        isFavoriteTarget: plannerFavoriteTargetIds.has(card.target.id),
        windReason: scheduleItemWindReason({
          item: activeItems.find((item) => item.id === card.target.id),
          nightStart: night?.start,
          assessment: activeWindAssessment,
        }),
        // An interval outside the chosen span of the night stays in the plan,
        // flagged "Hors de la durée choisie".
        nightSpanReason: scheduleItemNightSpanReason({
          item: activeItems.find((item) => item.id === card.target.id),
          nightStart: night?.start,
          span: activeNightSpan,
        }),
        // An interval that covers hours where the target is not usable stays
        // in the plan, flagged "Hors du créneau utile".
        usableWindowReason: scheduleItemUsableWindowReason({
          item: activeItems.find((item) => item.id === card.target.id),
          nightStart: night?.start,
          windows: card.visibilityWindows,
        }),
      }),
    );
  const selectedIds = new Set(activeItems.map((item) => item.id));
  // "Répartir les cibles": what spreading would do to the active plan, worked
  // out only while its targets overlap.
  const overlapSpread = useMemo(
    () =>
      night && planItemOverlaps(activeItems).length
        ? spreadOverlappingItems({
            items: activeItems,
            cards: spreadCardsByTarget(night.cards),
            night,
            span: activeNightSpan,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [night, activeItems, activeNightSpan?.start, activeNightSpan?.end],
  );
  // "Prise de vue par cible": the effective pose, gain and filter of each
  // target of the active plan, read through the acquisition rule against the
  // plan's equipment, the place's sky as the sky-brightness rule shows it and
  // the Moon of its night; nothing in visual mode. A chosen value is never
  // rewritten; the launched plan's lines are frozen at launch and shown as they
  // are (read-only).
  const acquisitionBasis = activePlan
    ? acquisitionBasisOf({
        plan: activePlan,
        profileSets: plannerProfiles,
        ownedFilters,
        sqm: skySqmOf(plannerSkyBrightness.choice),
      })
    : null;
  const [acquisitionDialog, setAcquisitionDialog] = useState(null);
  // A change of a plan's acquisition lines: one edit of the plan, undoable like
  // any other, for a pending plan only (the library's dialog writes through
  // here too, for a plan that is not the active one).
  const changeAcquisition = (planId, change) => {
    const plan = stateRef.current.plans.find((entry) => entry.id === planId);
    if (!plan || planStatus(plan) !== "pending") return false;
    rememberPlanChange(planId);
    setSaved(false);
    setState((current) =>
      selectPlannerPlan(
        {
          ...current,
          plans: current.plans.map((entry) =>
            entry.id === planId ? change(entry) : entry,
          ),
        },
        current.activePlanId,
      ),
    );
    return true;
  };
  // The last defaults chosen are kept in this browser: the defaults of the
  // next new plan.
  const writeAcquisitionDefaults = (planId, line) => {
    const written = changeAcquisition(planId, (plan) =>
      planWithAcquisitionDefaults(plan, line),
    );
    if (!written) return;
    const kept = line && Object.keys(line).length ? line : null;
    acquisitionPreferenceRef.current = kept;
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage refused: the choice still applies to the plan.
    }
    writeAcquisitionDefaultsPreference(storage, kept);
  };
  const writeAcquisitionItemLine = (planId, itemId, line) =>
    changeAcquisition(planId, (plan) => planWithItemLine(plan, itemId, line));
  const openPlanAcquisition = () => {
    if (!acquisitionBasis?.photo || !activePlan) return;
    setAcquisitionDialog(
      planDialogModel({
        locale,
        basis: acquisitionBasis,
        editable: activePlanEditable,
        nameOf: (item) => plannerTimelineLabel(item.target),
        planName: activePlan.name
          ? localizedPlanName(locale, activePlan.name, activePlan.date)
          : message(locale, "plannerUntitledPlan"),
        writeDefaults: (line) => writeAcquisitionDefaults(activePlan.id, line),
      }),
    );
  };
  const openItemAcquisition = (itemId) => {
    if (!acquisitionBasis?.photo || !activePlan) return;
    const row = night
      ? timelinePlanTargets({
          cards: activePlanCards,
          items: activePlan.items,
          night,
        }).find((entry) => entry.itemId === itemId)
      : null;
    const minuteClock = (minute) =>
      time(
        new Date(new Date(night.start).getTime() + minute * 60000),
        locale,
        state.location.timeZone,
      );
    const item = activePlan.items.find((entry) => entry.id === itemId);
    const model = targetDialogModel({
      locale,
      basis: acquisitionBasis,
      itemId,
      editable: activePlanEditable,
      targetName: item?.target ? plannerTimelineLabel(item.target) : itemId,
      slot: row ? `${minuteClock(row.start)} → ${minuteClock(row.end)}` : null,
      minutes: row ? row.end - row.start : null,
      writeItemLine: (id, line) =>
        writeAcquisitionItemLine(activePlan.id, id, line),
    });
    if (model) setAcquisitionDialog(model);
  };
  // What the stage-5 schedule and the plan's target cards read of it.
  const acquisitionForSchedule = acquisitionBasis?.photo
    ? {
        viewOf: (item, slot = null) =>
          acquisitionItemView(acquisitionBasis, item, slot),
        open: openItemAcquisition,
      }
    : null;
  // The plan's targets in the plan's order, as the night's cards — the
  // chips of the horizon map's path mode.
  const horizonPathCards = activeItems
    .map((item) =>
      (night?.cards || []).find((card) => card.target.id === item.id),
    )
    .filter(Boolean);
  // Bloc 4 step 6: "Versions précédentes" — refetched whenever the observer
  // switches plans, and after this plan's own fusion modal resolves (the
  // `mergePlanId` dependency below). The service knows a plan only once a save
  // has reached it; asking for the versions of one made a moment ago answered
  // `404 GET /api/plans/{id}/versions` in the console. The ask waits for the
  // save (the screen re-renders when it lands) and the list stays empty
  // meanwhile: a plan nobody has saved has no previous version.
  const activePlanServed = Boolean(
    activePlan?.id && serviceRevisionsRef.current.has(activePlan.id),
  );
  useEffect(() => {
    if (!auth.authenticated || !activePlan?.id || !activePlanServed) {
      setActivePlanVersions(null);
      return undefined;
    }
    let cancelled = false;
    fetchPlanVersions(activePlan.id)
      .then((data) => {
        if (!cancelled) setActivePlanVersions(data);
      })
      .catch(() => {
        if (!cancelled) setActivePlanVersions(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.id, auth.authenticated, mergePlanId, activePlanServed]);
  const scrollToRecommendations = () => {
    setState((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === current.activePlanId
          ? {
              ...plan,
              view: {
                ...planViewForTargetSelection(plan.view),
                // "Choisir les cibles" folds stage 1 along with stages 2 and 3.
                // The fold is applied here rather than inside
                // `planViewForTargetSelection` because that function is a
                // shared contract
                // (packages/astro-contracts/fixtures/planner-plan-view-
                // selection.json).
                placeCollapsed: true,
              },
            }
          : plan,
      ),
    }));
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const list = recommendationListRef.current;
        if (!list) return;
        list.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "start",
        });
        list.focus({ preventScroll: true });
      });
    });
  };
  const profileSetsForPlans = () => ({
    ...plannerProfiles,
    telescopes: auth.authenticated
      ? inventoryProfiles.telescopes
      : guestTelescopes,
  });
  // "Prise de vue par cible" in the exports: the effective acquisition lines of
  // a plan (what its launch froze, else the rule's answer under the plan's
  // choices) and their text in the words of the page, read with the context the
  // screens read for it: the plan's equipment, the filters owned, the place's
  // sky (for the plan on screen) and the Moon of its night. Nothing in visual
  // mode.
  const exportAcquisitionFor = (plan, context) => {
    const empty = { byItem: {}, text: {} };
    if (!plan) return empty;
    const byItem = exportAcquisitionByItem(plan, {
      context: exportAcquisitionContext({
        plan,
        profileSets: profileSetsForPlans(),
        resolvedEquipment: context?.equipment,
        ownedFilters,
        sqm:
          plan.id === activePlan?.id
            ? plannerSkyBrightness.choice?.shown?.sqm
            : null,
        moonIllumination: planMoonIllumination(plan),
      }),
    });
    return {
      byItem,
      text: acquisitionTextByItem(
        byItem,
        acquisitionExportWords(locale, message),
      ),
    };
  };
  const contextForPlan = (plan) => {
    if (!plan?.location) return { cards: [], night: null };
    const location = { ...state.location, ...(plan.location || {}) };
    const equipmentForPlan = resolveEquipment(
      plan.equipment || state.equipment,
      profileSetsForPlans(),
    );
    const minAltitude = Number.isFinite(Number(plan.minAltitude))
      ? Number(plan.minAltitude)
      : Number(state.minAltitude);
    const moonSeparationMinimum = Number.isFinite(
      Number(plan.moonSeparationMinimum),
    )
      ? Number(plan.moonSeparationMinimum)
      : Number(state.moonSeparationMinimum);
    const moonSeparationMinimumByFilter =
      plan.moonSeparationMinimumByFilter ||
      state.moonSeparationMinimumByFilter ||
      {};
    const mountSafety = normaliseMountSafety(
      plan.mountSafety || state.mountSafety,
    );
    // A framing or suggested target with a saved coordinate lives on its plan
    // item. Its J2000 centre cannot drift when the public catalogue refreshes.
    const savedPlanTargets = (plan.items || [])
      .map((item) => item.target)
      .filter(
        (target) =>
          target?.id &&
          Number.isFinite(Number(target.coordinate?.ra)) &&
          Number.isFinite(Number(target.coordinate?.dec)),
      );
    const savedPlanTargetsById = new Map(
      savedPlanTargets.map((target) => [target.id, target]),
    );
    const targetsForPlan = [
      ...availableTargets.map((target) => {
        const savedTarget = savedPlanTargetsById.get(target.id);
        return savedTarget
          ? { ...target, ...savedTarget, coordinate: savedTarget.coordinate }
          : target;
      }),
      ...savedPlanTargets.filter(
        (target) =>
          !availableTargets.some((candidate) => candidate.id === target.id),
      ),
    ];
    const rawNightForPlan = planNight({
      darkness: planDarkness(plan),
      date: plan.date,
      location,
      targets: targetsForPlan,
      profile: equipmentForPlan,
      locale,
      minAltitude,
      moonSeparationMinimum,
      planetReferences,
      moonSeparationMinimumForTarget: ({ filter }) =>
        moonSeparationMinimumByFilter[filter] ?? moonSeparationMinimum,
      retainedTargetIds: (plan.items || []).map((item) => item.id),
      // The visual limit reads the plan's place's sky: the one the page shows
      // for the plan on screen, else the place's measured or typed value.
      skyQuality:
        equipmentForPlan.mode !== "visual"
          ? null
          : plan.id === activePlan?.id
            ? placeVisualSky({
                place: location,
                model: scoreSkyQuality,
                measures: placeSkyMeasures,
                knownPlaces,
              })
            : placeVisualSky({
                place: location,
                measures: placeSkyMeasures,
                knownPlaces,
              }),
      visualInventory: visualInventoryOf(inventoryProfiles),
    });
    const nightForPlan = rawNightForPlan
      ? {
          ...rawNightForPlan,
          cards: withHorizonMask(
            rawNightForPlan.cards,
            normaliseHorizonMask(location.horizonMask),
            minAltitude,
            moonSeparationMinimum,
            mountSafety,
          ),
        }
      : null;
    const selectedPlanIds = new Set((plan.items || []).map((item) => item.id));
    return {
      cards: (nightForPlan?.cards || []).filter((card) =>
        selectedPlanIds.has(card.target.id),
      ),
      equipment: equipmentForPlan,
      location,
      minAltitude,
      moonSeparationMinimum,
      mountSafety,
      night: nightForPlan,
    };
  };
  const printablePlan =
    state.plans.find((plan) => plan.id === printPlanId) || activePlan;
  // The active plan shares the already calculated night with the editor. In
  // particular, moving a schedule handle must not recompute all astronomical
  // positions merely because a plan item changed.
  const printableContext =
    printablePlan?.id === activePlan?.id
      ? {
          cards: (night?.cards || []).filter((card) =>
            activeItems.some((item) => item.id === card.target.id),
          ),
          equipment,
          location: state.location,
          minAltitude: Number(state.minAltitude),
          moonSeparationMinimum: Number(state.moonSeparationMinimum),
          mountSafety: normaliseMountSafety(state.mountSafety),
          night,
        }
      : contextForPlan(printablePlan);
  // EXPO-E: the shooting line of each target on the printed sheet.
  const printableAcquisitionText =
    printablePlan && printableContext.night
      ? exportAcquisitionFor(printablePlan, printableContext).text
      : {};
  // EXPO-E: what the plan's export dialog says it carries, read when the
  // dialog opens: the line to copy into ASIAIR for each target, and whether
  // the plan has shooting lines at all (photo mode).
  const exportDialogAcquisition = useMemo(() => {
    const plan = exportPlanId
      ? state.plans.find((entry) => entry.id === exportPlanId)
      : null;
    if (!plan) return null;
    const context = contextForPlan(plan);
    const { byItem, text } = exportAcquisitionFor(plan, context);
    return {
      available: Object.keys(byItem).length > 0,
      copyLines: asiairCopyLines({
        plan,
        targets: context.cards,
        expandTarget: plannerExtension("planner.export.asiair"),
        acquisitionText: text,
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportPlanId, state.plans, locale]);
  const plannedTargetIds = plansForDate.flatMap((plan) =>
    (plan.items || []).map((item) => item.id),
  );
  // "Options du catalogue", folded: the editorial tier, then
  // "restreint au matériel" when the suggestions are restricted.
  const catalogueOptionsSummary = [
    message(
      locale,
      {
        all: "plannerTargetCatalogueAllTargets",
        extended: "plannerTargetCatalogueExtended",
        favorites: "plannerTargetCatalogueFavorites",
      }[state.catalogueSelection] || "plannerTargetCatalogueEssential",
    ),
    ...(state.equipment.restrictToEquipment
      ? [message(locale, "plannerCatalogueOptionsRestricted")]
      : []),
  ].join(" · ");
  const sourceCards = recommendationSourceCards({
    cards: night?.cards || [],
    source: recommendationSource,
    plannedTargetIds,
    favoriteTargetIds: [...plannerFavoriteTargetIds],
    restrictToEquipment: state.equipment.restrictToEquipment,
    equipment,
  });
  const typeOptions = recommendationTypeOptions(sourceCards);
  const catalogueOptions = recommendationCatalogueOptions(sourceCards);
  const filteredCards = recommendationFilteredCards({
    cards: sourceCards,
    type: typeFilter,
    catalogue: catalogueFilter,
    query: recommendationQuery,
    locale,
  });
  const planFilterCounts = recommendationPlanFilterCounts({
    plans: plansForDate,
    sourceCards,
    filteredCards,
  });
  const planFilterHasTopFilters = Boolean(
    typeFilter || catalogueFilter || recommendationQuery.trim(),
  );
  const activePlanFilter = plansForDate.some((plan) => plan.id === planFilter)
    ? planFilter
    : "";
  const recommendedCards = recommendationVisibleCards({
    // "Score de ce soir" sorts on the score; the default sort is unchanged.
    cards:
      recommendationSort === "score"
        ? filteredCards.map((card) => ({
            ...card,
            tonightScore: tonightScores.get(card.target.id) || null,
          }))
        : filteredCards,
    plans: plansForDate,
    planFilter,
    sort: recommendationSort,
  });
  const recommendationTotal = sourceCards.length;
  const [suggestionInputs, setSuggestionInputs] = useState({
    history: [],
    continuing: [],
  });
  // The instant the suggestion dialog was opened at: what is proposed, and
  // what is applied, is read at that moment.
  const suggestAtRef = useRef(Date.now());
  const openSuggestions = async () => {
    if (!activePlanEditable || !night) return;
    suggestAtRef.current = Date.now();
    let history = [],
      continuing = [];
    if (auth.authenticated) {
      history = await loadSuggestionHistory().catch(() => []);
      if (projectsExtension?.loadContinuingSuggestions)
        continuing = await projectsExtension
          .loadContinuingSuggestions({ plans: state.plans, today: state.date })
          .catch(() => []);
    }
    setSuggestionInputs({ history, continuing });
    setSuggestOpen(true);
  };
  const suggestAvailable = Boolean(activePlan && activePlanEditable && night);
  // « Observation confortable », in visual only,
  // kept in this browser; read through a ref so that the list made again
  // right after a change (and the apply) is made with the new choice.
  const suggestComfortFamily = observationComfortFamily({
    mode: equipment.mode,
    telescope: selectedTelescope ?? null,
    mount:
      state.equipment.mountId && state.equipment.mountId !== "none"
        ? plannerMounts.find(
            (profile) => profile.id === state.equipment.mountId,
          ) || { id: state.equipment.mountId }
        : null,
  });
  const suggestComfortRef = useRef(null);
  if (suggestComfortRef.current === null)
    suggestComfortRef.current = readObservationComfort(
      typeof window === "undefined" ? null : window.localStorage,
    );
  const chooseSuggestComfort = (on) => {
    suggestComfortRef.current = on;
    writeObservationComfort(
      typeof window === "undefined" ? null : window.localStorage,
      on,
    );
  };
  // SUGGEST-FILTERS-01: the filters of the suggestions kept in this browser,
  // shared with « Cette nuit »: the catalogues and types the night's cards
  // pass (the planner's own pool, never widened), the mask ignored (each card
  // made again without it, with the time it spends behind it), the periods
  // the engine places in. Read through a ref: the dialog's next proposal
  // reads the filters just chosen.
  const [suggestFilters, setSuggestFilters] = useState(() =>
    normalizeSuggestFilters(null),
  );
  const suggestFiltersRef = useRef(suggestFilters);
  suggestFiltersRef.current = suggestFilters;
  useEffect(() => {
    setSuggestFilters(readSuggestFilters());
    return subscribeSuggestFilters(setSuggestFilters);
  }, []);
  const [suggestFiltersOpen, setSuggestFiltersOpen] = useState(false);
  const [suggestDialogKey, setSuggestDialogKey] = useState(0);
  const chooseSuggestFilters = (next) => {
    const value = normalizeSuggestFilters(next);
    writeSuggestFilters(value);
    suggestFiltersRef.current = value;
    setSuggestFilters(value);
    // The dialog opens again on the list made with them.
    setSuggestDialogKey((key) => key + 1);
  };
  const suggestionCardsFor = (filters) => {
    const kept = (night.cards || []).filter((card) =>
      suggestionTargetMatches(card.target, filters),
    );
    if (!filters.ignoreMask) return kept;
    const constraints = {
      minAltitude: Number(state.minAltitude),
      moonSeparationMinimum: Number(state.moonSeparationMinimum),
      mountSafety: normaliseMountSafety(state.mountSafety),
    };
    return withMaskHidden(
      withHorizonMask(
        kept,
        {},
        constraints.minAltitude,
        constraints.moonSeparationMinimum,
        constraints.mountSafety,
      ),
      kept,
      state.location.horizonMask,
      constraints,
    );
  };
  const proposeSuggestions = (options = {}) => {
    const filters = suggestFiltersRef.current;
    const pool = recommendationSourceCards({
      cards: suggestionCardsFor(filters),
      source: "catalogue",
      restrictToEquipment: state.equipment.restrictToEquipment,
      equipment,
    });
    const spans = suggestionPeriodSpans(
      { start: night.start, end: night.end },
      filters.periods,
    );
    return suggestNight({
      ...(spans ? { spans } : {}),
      candidates: pool.map((card) => ({
        card,
        score: tonightScores.get(card.target.id) || null,
      })),
      night: { start: night.start, end: night.end },
      // A night that is running is suggested from the moment the dialog was
      // opened, never from its dusk.
      span: suggestionSpanAt(
        activeNightSpan,
        { start: night.start, end: night.end },
        suggestAtRef.current,
      ),
      items: activeItems,
      hourly: scoreHourly,
      moonSeries: night.moonSeries,
      ownedFilters,
      mode: equipment.mode,
      count: visualMode ? 8 : 3,
      // The dialog opens on the plan's mode default (visual
      // "Rapproché", photo "Idéal"): the first proposal is made with it.
      placement: suggestionDefaults(visualMode).placement,
      ...suggestionInputs,
      // The note of the night suggested for, against which the targets
      // already done are compared (the chosen slot's when the plan has one).
      noteNow: suggestionNoteNow({
        summary: forecast.value,
        hourly: scoreHourly,
        span: activeNightSpan,
      }),
      comfort: suggestComfortRef.current
        ? observationComfortRange(suggestComfortFamily)
        : null,
      ...options,
      // The targets another plan of this night holds, of the same nature as
      // this one (photo with photo, visual with visual), are not proposed
      // again.
      excluded: [
        ...targetIdsTakenOnNight(state.plans, {
          date: activePlan?.date,
          visual: visualMode,
          exceptPlanId: activePlan?.id,
        }),
        ...(options.excluded || []),
      ],
      // The same ids, so that an empty list can say the other plans took
      // every target (`suggestNight`).
      takenByOtherPlans: targetIdsTakenOnNight(state.plans, {
        date: activePlan?.date,
        visual: visualMode,
        exceptPlanId: activePlan?.id,
      }),
    });
  };
  const initialSuggestions = useMemo(() => {
    if (!suggestOpen || !night || !activePlan) return null;
    return proposeSuggestions();
    // The dialog is modal: the plan remains fixed until apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    suggestOpen,
    night,
    scoreHourly,
    tonightScores,
    suggestionInputs,
    suggestDialogKey,
  ]);
  const recommendationHelp = message(
    locale,
    "plannerRecommendationHelp",
  ).replace(
    "{minimumAltitude}",
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
      Number(state.minAltitude),
    ),
  );
  const equipmentField = fieldOfView(equipment);
  // The sentence is only written when every number in it is known -- a plan
  // whose equipment is not chosen yet said "frames a field of NaN° × NaN°" --
  // and says nothing otherwise.
  const recommendationEquipmentSummary = equipmentCapabilityLine({
    equipment,
    field: equipmentField,
    visualMode,
    locale,
  });

  const syncActivePlanSnapshot = (current) => {
    return applyActivePlanSnapshot(current, planSnapshot(current));
  };
  const rememberPlanChange = (id) => {
    const plan = stateRef.current.plans.find((entry) => entry.id === id);
    if (!plan) return;
    const history = recordPlanHistory(planHistoryRef.current[id], plan);
    if (!history) return;
    planHistoryRef.current[id] = history;
    setHistoryVersion((version) => version + 1);
  };
  // The slot editor writes each retouch as soon
  // as it is let go; the first one of an opening of the editor records one
  // undo step, the next ones of the same opening join it -- unless the
  // plan's history moved in between (an undo, a redo, another edit).
  const scheduleRetouchRef = useRef(null);
  const rememberScheduleRetouch = (planId, session) => {
    const last = scheduleRetouchRef.current;
    if (
      session &&
      last?.planId === planId &&
      last.session === session &&
      last.history === planHistoryRef.current[planId]
    )
      return;
    rememberPlanChange(planId);
    scheduleRetouchRef.current = {
      planId,
      session,
      history: planHistoryRef.current[planId],
    };
  };
  const rememberActivePlanChange = () => {
    if (!canEditActivePlan()) return;
    if (stateRef.current.activePlanId)
      rememberPlanChange(stateRef.current.activePlanId);
  };
  const replacePlanFromHistory = (id, replacement) => {
    setSaved(false);
    setState((current) =>
      selectPlannerPlan(
        restorePlanHistoryState(current, id, replacement),
        current.activePlanId,
      ),
    );
  };
  const travelPlanHistory = (id, direction) => {
    const step = stepPlanHistory({
      history: planHistoryRef.current[id],
      plan: stateRef.current.plans.find((plan) => plan.id === id),
      direction,
    });
    if (!step) return;
    planHistoryRef.current[id] = step.history;
    replacePlanFromHistory(id, step.restored);
    setHistoryVersion((version) => version + 1);
  };
  const undoPlan = (id) => travelPlanHistory(id, "undo");
  const redoPlan = (id) => travelPlanHistory(id, "redo");
  // The twilight threshold: the choice is a preference of this browser, the
  // default of new plans, and is written to every pending plan that has no
  // session and whose night has not started, each recorded for undo like any
  // other edit of the plan.
  const chooseDarkness = (value) => {
    darknessPreferenceRef.current = value;
    setDarknessPreference(value);
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage refused: the choice still applies to the plans.
    }
    writeDarknessPreference(storage, value);
    const { changedIds } = applyDarknessToPlans(stateRef.current.plans, value, {
      now: Date.now(),
    });
    if (!changedIds.length) return;
    changedIds.forEach(rememberPlanChange);
    setSaved(false);
    setState((current) => {
      const applied = applyDarknessToPlans(current.plans, value, {
        now: Date.now(),
      });
      return applied.changedIds.length
        ? selectPlannerPlan(
            { ...current, plans: applied.plans },
            current.activePlanId,
          )
        : current;
    });
  };

  // A night made for a new date starts at the current place of
  // "Cette nuit", not at the place of the last plan opened. A night that
  // exists keeps its own place (`choosePlannerDate` joins it).
  const stateForNewNight = (current, date) => {
    if (current.nights?.some((night) => night.date === date)) return current;
    const place = newPlanPlace({
      document: current,
      darkness: darknessPreferenceRef.current,
    });
    return place ? { ...current, location: normalizePlace(place) } : current;
  };
  // Plans that ran at another place do not count for the night (they keep the
  // place they were observed at): a plan made for the chosen place gets a
  // night of its own beside theirs.
  const stateForDate = (current, date) => {
    const base = stateForNewNight(current, date);
    return locationCoordinates(base.location)
      ? nightBesideFinishedPlans(base, date, base.location)
      : base;
  };
  const update = (key, value) => {
    if (key !== "date" && !canEditActivePlan()) return;
    const id = key === "date" ? planId() : null;
    if (key === "date") {
      // The date holds plans still to plan at another place than the one
      // chosen — the planner opens the night of the chosen place, empty, and
      // shows the band; no plan is made.
      const held = chooseDateAtPlace(
        stateForNewNight(stateRef.current, value),
        value,
        stateForNewNight(stateRef.current, value).location,
      );
      if (held) {
        setSaved(false);
        setState(held);
        setEditingItemId(null);
        return;
      }
      // Choosing a night that has no plan yet starts one: a profile that holds
      // several plans back refuses it, and the night does not change -- never a
      // silent no-op. Choosing a night that already holds its plan makes none:
      // it is navigation, whatever the night left behind, and no offer is shown
      // (the limit is one plan PER NIGHT).
      const current = stateRef.current;
      const creation = planCreationGate({
        capabilities,
        plans: spacePlansOf(current.plans),
        date: value,
        signedIn: Boolean(auth.authenticated),
      });
      if (
        !creation.allowed &&
        createsPendingPlan(
          current.plans,
          choosePlannerDate(stateForDate(current, value), value, {
            id,
            name: `${message(locale, "plannerPlan")} 1`,
            ...newPlanDarkness(darknessPreferenceRef.current),
            ...newPlanStart(current),
          }).plans,
        )
      ) {
        refuseCapability(creation.refusal, { date: value });
        return;
      }
    }
    setSaved(false);
    if (key !== "date") rememberActivePlanChange();
    setState((current) =>
      key === "date"
        ? choosePlannerDate(stateForDate(current, value), value, {
            id,
            name: `${message(locale, "plannerPlan")} 1`,
            ...newPlanDarkness(darknessPreferenceRef.current),
            ...newPlanStart(current),
          })
        : syncActivePlanSnapshot({ ...current, [key]: value }),
    );
    if (key === "date") setEditingItemId(null);
  };
  const updateEquipmentPatch = (patch) => {
    if (!canEditActivePlan()) return;
    setSaved(false);
    rememberActivePlanChange();
    setState((current) => {
      const merged = { ...current.equipment, ...patch };
      // A new mount brings the wind tolerance this browser keeps for it, or
      // none ("Standard").
      const equipment =
        "mountId" in patch && patch.mountId !== current.equipment.mountId
          ? equipmentWithWindTolerance(merged, windPreferencesRef.current)
          : merged;
      return syncActivePlanSnapshot({ ...current, equipment });
    });
  };
  // The wind tolerance: kept for the active plan's mount on this browser, and
  // written to every plan of that mount that has no session and whose night has
  // not started, each recorded for undo like any other edit of the plan. "Durée
  // de la nuit" writes the active plan's span. The intervals are untouched
  // (they count from the dark night); one that falls outside the span is
  // flagged, never removed.
  const chooseNightSpan = (nightSpan) => {
    const planId = stateRef.current.activePlanId;
    if (!planId || !canEditActivePlan()) return;
    rememberPlanChange(planId);
    setSaved(false);
    setSlotNotices((previous) => {
      const next = { ...previous };
      delete next[planId];
      return next;
    });
    setState((current) =>
      selectPlannerPlan(
        {
          ...current,
          plans: current.plans.map((plan) =>
            plan.id === planId ? planWithNightSpan(plan, nightSpan) : plan,
          ),
        },
        current.activePlanId,
      ),
    );
  };
  const chooseWindTolerance = (value) => {
    const key = windToleranceKey(stateRef.current.equipment);
    const tolerance = normalizeWindTolerance(value);
    const preferences = { ...windPreferencesRef.current, [key]: tolerance };
    windPreferencesRef.current = preferences;
    setWindPreferences(preferences);
    let storage = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage refused: the choice still applies to the plans.
    }
    writeWindTolerancePreferences(storage, preferences);
    const { changedIds } = applyWindToleranceToPlans(
      stateRef.current.plans,
      key,
      tolerance,
      { now: Date.now() },
    );
    if (!changedIds.length) return;
    changedIds.forEach(rememberPlanChange);
    setSaved(false);
    setState((current) => {
      const applied = applyWindToleranceToPlans(current.plans, key, tolerance, {
        now: Date.now(),
      });
      return applied.changedIds.length
        ? selectPlannerPlan(
            { ...current, plans: applied.plans },
            current.activePlanId,
          )
        : current;
    });
  };
  const updateEquipment = (key, value) =>
    updateEquipmentPatch({ [key]: value });
  // The two links of stage 2. "Reprendre ma
  // configuration par défaut": the plan's equipment goes back to it, one
  // edit of the plan (undoable like any other); "Enregistrer comme
  // configuration par défaut": the configuration becomes this plan's
  // equipment, no plan changes. Each is confirmed by a notice with
  // "Annuler", never a dialog.
  const configurationKeysOf = (equipment) =>
    Object.fromEntries(
      defaultConfigurationKeys.map((key) => [key, equipment?.[key]]),
    );
  const restoreDefaultConfiguration = () => {
    const configuration = defaultConfigurationRef.current;
    if (!configuration) return;
    const previous = configurationKeysOf(stateRef.current.equipment);
    updateEquipmentPatch(
      configurationKeysOf(
        planStartEquipment(stateRef.current.equipment, configuration),
      ),
    );
    setConfigurationNotice({
      id: randomUuid(),
      text: message(locale, "plannerConfigurationRestored"),
      undo: () => updateEquipmentPatch(previous),
    });
  };
  const writeDefaultConfiguration = async (configuration) => {
    const response = await fetch("/api/v1/manage/default-configuration", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-astro-csrf": csrfCookieValue() || "",
        // This page's own write: its change signal does not make it read
        // its plans again over an edit not yet saved.
        ...clientInstanceHeaders(),
      },
      body: JSON.stringify({ configuration }),
    });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null);
    setDefaultConfiguration(body?.configuration ?? null);
    return true;
  };
  const saveAsDefaultConfiguration = async () => {
    const previous = defaultConfigurationRef.current;
    const written = await writeDefaultConfiguration(
      normalizeDefaultConfiguration(stateRef.current.equipment),
    ).catch(() => false);
    if (!written) return;
    setConfigurationNotice({
      id: randomUuid(),
      text: message(locale, "plannerConfigurationSaved"),
      undo: () => void writeDefaultConfiguration(previous).catch(() => false),
    });
  };
  const selectEyepiece = (nextId) => {
    const nextEyepiece = plannerEyepieces.find(
      (profile) => profile.id === nextId,
    );
    eyepieceFocalLengthDraftRef.current = null;
    setEyepieceFocalLengthDraft(null);
    updateEquipmentPatch({
      eyepieceId: nextId,
      eyepieceFocalLengthMm: nextEyepiece?.focalLengthMm || "",
    });
  };
  const updateMountSafety = (key, value) => {
    if (!canEditActivePlan()) return;
    setSaved(false);
    rememberActivePlanChange();
    setState((current) =>
      syncActivePlanSnapshot({
        ...current,
        mountSafety: normaliseMountSafety({
          ...current.mountSafety,
          [key]: value,
          // MERIDIAN-LIMIT-02a: « Appliquer les restrictions » also commands
          // the cut at the meridian: the one switch writes both.
          ...(key === "enabled" && meridianCutOffered
            ? { meridianCut: Boolean(value) }
            : {}),
        }),
      }),
    );
  };
  const updateMoonFilterThreshold = (filter, value) => {
    if (!canEditActivePlan()) return;
    setSaved(false);
    rememberActivePlanChange();
    setState((current) => {
      const next = { ...(current.moonSeparationMinimumByFilter || {}) };
      if (value === "") delete next[filter];
      else next[filter] = clamp(Number(value), 10, 60);
      return syncActivePlanSnapshot({
        ...current,
        moonSeparationMinimumByFilter: next,
      });
    });
  };
  const selectedFilterIds = state.equipment.filterIds || [];
  const activeFilterNames = plannerFilters
    .filter((profile) => selectedFilterIds.includes(profile.id))
    .map((profile) => profile.name);
  const advancedFilterThresholdRange = plannerFilterThresholdRange({
    activeFilterNames,
    moonSeparationMinimumByFilter: state.moonSeparationMinimumByFilter,
  });
  const advancedConstraintsActive = plannerAdvancedConstraintsActive({
    mountSafety: effectiveMountSafety,
    activeFilterNames,
    moonSeparationMinimumByFilter: state.moonSeparationMinimumByFilter,
  });
  // The filters of a signed-in person in two groups, "Mon matériel" then
  // "Matériel par défaut" (the
  // filters of "Mon matériel" are ticked in a plan and count in the
  // score); a visitor's have no group. The list is what the plan's
  // telescope and camera offer (`filtersOfferedFor`): the filters attached to
  // them -- a smart telescope's built-in ones -- and the generic ones unless
  // one of them offers its own filters only; a default filter already ticked,
  // or attached to the plan's equipment, stays shown while the space hides
  // the group.
  const filterOwners = planFilterOwners({
    telescope: selectedTelescope,
    camera: selectedCamera,
    mode: state.equipment.mode,
  });
  const offeredFilters = planOfferedFilters({
    pool: plannerFilters,
    owners: filterOwners,
    selectedIds: selectedFilterIds,
  });
  const filterGroups = offeredFilterGroups(locale, {
    offered: offeredFilters,
    owners: filterOwners,
    selectedIds: selectedFilterIds,
    authenticated: auth.authenticated,
    defaultFilters: defaultProfiles.filters,
    hideDefaults: !shownDefaults,
  });
  // The equipment a list that mixes equipment names beside a filter; inside
  // the plan's own list a filter is written bare.
  const filterEquipment = [
    ...inventoryProfiles.telescopes,
    ...inventoryProfiles.cameras,
  ];
  const filterLabel = (profile) =>
    filterDisplayName(profile, undefined, {
      equipment: filterEquipment,
      within: [filterOwners.telescope, filterOwners.camera].filter(Boolean),
    });
  const filtersOwnOnlyNote = ownFiltersOnlyNote(
    filterOwners,
    filterEquipment.map((piece) => piece.id),
  );
  const filtersOwnOnly = filtersOwnOnlyNote
    ? {
        name: filtersOwnOnlyNote.name,
        href: filtersOwnOnlyNote.owned ? mySpaceEquipmentPath(locale) : null,
      }
    : null;
  // The mount field: the space's own mounts, then the default ones unless
  // the space hides them (a visitor has none).
  const mountChoicesShown = auth.authenticated
    ? inventoryProfiles.mounts.length > 0 ||
      (shownDefaults && defaultProfiles.mounts.length > 0)
    : plannerMounts.length > 0;
  const commitEyepieceFocalLength = () => {
    const draft = eyepieceFocalLengthDraftRef.current;
    if (!Number.isFinite(draft)) return;
    const nextValue = Math.max(
      eyepieceZoomMinimum,
      Math.min(eyepieceZoomMaximum, draft),
    );
    eyepieceFocalLengthDraftRef.current = null;
    setEyepieceFocalLengthDraft(null);
    if (nextValue !== selectedEyepieceFocalLength)
      updateEquipment("eyepieceFocalLengthMm", String(nextValue));
  };
  // Plan IDs are assigned by the device, before any request is made. They are
  // therefore stable primary keys for a plan created while completely offline.
  const planId = () => randomUuid();
  // The pending plan of the open night that the free offer's one plan per
  // night is in the way of, if that is what `creation` refused.
  const planExistingForRefusal = (creation) => {
    if (
      creation.allowed ||
      (creation.refusal !== "planLimit" &&
        creation.refusal !== "planLimitLocal")
    )
      return null;
    return (
      stateRef.current.plans.find(
        (plan) =>
          plan.date === stateRef.current.date && planStatus(plan) === "pending",
      ) ?? null
    );
  };
  const addPlan = () => {
    if (!canCreatePlanNow) return;
    // Nothing is made on a night that has two places.
    if (nightPlaceConflict(stateRef.current)) return;
    const creation = planCreationGate({
      capabilities,
      plans: spacePlansOf(stateRef.current.plans),
      date: stateRef.current.date,
      signedIn: Boolean(auth.authenticated),
    });
    if (!creation.allowed) {
      // A night that already holds its pending plan says so and names it -- one
      // click opens it -- before the offer of several plans.
      const existing = planExistingForRefusal(creation);
      if (existing) {
        setPlanExistsDialog({ planId: existing.id, kind: creation.refusal });
        return;
      }
      refuseCapability(creation.refusal);
      return;
    }
    const id = planId();
    setSaved(false);
    // A plan added from the tabs of the editor leaves the page
    // on the tabs with stage 1 "Lieu et date" as it was (folded stays
    // folded): a new plan's view starts from the defaults, stage 1 open,
    // which would unfold it under the tabs. From the library, a new plan keeps
    // stage 1 open.
    const keepPlaceFold = plannerView === "editor";
    setState((current) => {
      const folded = Boolean(
        current.plans.find((plan) => plan.id === current.activePlanId)?.view
          ?.placeCollapsed,
      );
      const next = addPlannerPlan(current, {
        id,
        // The first number no plan of the night carries.
        name: nextNumberedPlanName(
          message(locale, "plannerPlan"),
          current.plans
            .filter((plan) => plan.nightId === current.activeNightId)
            .map((plan) => plan.name),
        ),
        ...newPlanDarkness(darknessPreferenceRef.current),
        ...newPlanStart(current),
      });
      if (!keepPlaceFold || !folded) return next;
      return {
        ...next,
        plans: next.plans.map((plan) =>
          plan.id === id
            ? {
                ...plan,
                view: {
                  ...defaultPlanView,
                  ...plan.view,
                  placeCollapsed: true,
                },
              }
            : plan,
        ),
      };
    });
    setEditingItemId(null);
  };
  // Once the night of "Cette nuit" is open (its astronomy computed),
  // "Nouveau plan" makes the plan there and selects its tab.
  useEffect(() => {
    if (!newPlanOnOpening.current || !night) return;
    if (state.date !== newPlanOnOpening.current) return;
    newPlanOnOpening.current = null;
    addPlan();
  });
  const commitPlaceChange = (place, save = false) => {
    // Completed sessions are immutable: choosing a new geographic context
    // starts a separate night context, even when the civil date is the same.
    // That night starts a plan, which a profile that holds several plans back
    // refuses: the place is then only kept, when it was to be saved, and the
    // night stays as it was.
    const isLocked = (candidate) =>
      candidate.plans.some(
        (plan) =>
          plan.nightId === candidate.activeNightId &&
          planStatus(plan) !== "pending",
      );
    // The plans still to do follow the place even when the night also holds
    // one that ran; only those that ran stay where they were observed. A
    // night starts (and asks for a plan) only when nothing is left to move.
    const pendingIdsOf = (candidate) =>
      candidate.plans
        .filter(
          (plan) =>
            plan.nightId === candidate.activeNightId &&
            planStatus(plan) === "pending",
        )
        .map((plan) => plan.id);
    const before = stateRef.current;
    const startsNight =
      isLocked(before) &&
      placeFingerprint(before.location) !== placeFingerprint(place) &&
      pendingIdsOf(before).length === 0;
    const creation = planCreationGate({
      capabilities,
      plans: spacePlansOf(before.plans),
      date: before.date,
      signedIn: Boolean(auth.authenticated),
    });
    const refused = startsNight && !creation.allowed;
    if (refused) refuseCapability(creation.refusal);
    setSaved(false);
    // A plan keeps its own copy of the place, without the note and the type,
    // which belong to my places.
    const planPlace = planCopyOfPlace(place);
    if (save && placesFromSpace) spacePlaces.save(place);
    setState((current) => {
      let next = current;
      if (save)
        next = {
          ...next,
          ...(placesFromSpace
            ? {}
            : {
                knownLocations: [
                  ...next.knownLocations.filter(
                    (entry) => entry.id !== place.id,
                  ),
                  structuredClone(place),
                ],
              }),
          unassignedHorizonProfiles: (
            next.unassignedHorizonProfiles || []
          ).filter((profile) => profile.id !== place.sourceProfileId),
        };
      if (refused) return next;
      const locked = isLocked(next);
      const moving =
        locked && placeFingerprint(next.location) !== placeFingerprint(place);
      const pendingIds = pendingIdsOf(next);
      if (moving && pendingIds.length === 0) {
        const night = {
          id: randomUuid(),
          date: next.date,
          location: structuredClone(planPlace),
        };
        next = addPlannerPlan(
          {
            ...next,
            activeNightId: night.id,
            nights: [...next.nights, night],
            location: planPlace,
          },
          {
            id: randomUuid(),
            name: `${message(locale, "plannerPlan")} 1`,
            ...newPlanDarkness(darknessPreferenceRef.current),
            ...newPlanStart(next),
          },
        );
      } else {
        next = withLocationReviewReason(
          next,
          applyNightPlace(
            moving
              ? movePendingPlansToNight(next, planPlace, pendingIds)
              : next,
            planPlace,
          ),
        );
        // A chosen slot follows the place's local hours,
        // within its new night; one that does not fit goes back to the
        // astronomical night and says so (the notice, below the timeline).
        const moved = transposeNightSpansOfPlaceChange(current, next);
        next = moved.state;
        slotNoticeChange.current = moved;
        // A place chosen where the date already has a night leaves one
        // night at that place, not two.
        next = mergeNightsAtSamePlace(next);
        // The first place of the planner gives the night its place: the one in
        // progress until dawn there, when the date is still the browser's own
        // default and no plan holds it.
        if (!locationCoordinates(current.location)) {
          const date = openingNightDate({
            date: next.date,
            place: planPlace,
            zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
            planDates: next.plans.map((plan) => plan.date),
          });
          if (date !== next.date)
            next = choosePlannerDate(next, date, {
              id: randomUuid(),
              name: `${message(locale, "plannerPlan")} 1`,
              seed: false,
            });
        } else if (
          placeFingerprint(current.location) !== placeFingerprint(planPlace) &&
          current.date === tonightDate({ place: current.location })
        ) {
          // On the night the old place was living, the night follows the new
          // place's local time (Lac Noir in the small hours of the 20th, a
          // place nine hours east already in the 21st's).
          next =
            nightFollowingPlace(next, tonightDate({ place: planPlace })) ??
            next;
        }
      }
      return next;
    });
    setPlaceDialog(null);
    setPlaceChange(null);
    setEditingItemId(null);
  };
  // The place chosen in the picker: the night of that place if the plans
  // already hold one for this date, else the place of the night.
  const choosePlace = (place) => {
    const existingNight = state.nights.find(
      (night) =>
        night.date === state.date &&
        placeFingerprint(night.location) === placeFingerprint(place) &&
        state.plans.some((plan) => plan.nightId === night.id),
    );
    if (existingNight && existingNight.id !== state.activeNightId) {
      selectPlan(
        state.plans.find((plan) => plan.nightId === existingNight.id).id,
      );
    } else requestPlaceChange(place);
  };
  // A place kept among mine without becoming the place of the night: what the
  // "Lieux" view adds and edits.
  const saveKnownPlace = (place) => {
    setSaved(false);
    if (placesFromSpace) spacePlaces.save(place);
    setState((current) => ({
      ...current,
      ...(placesFromSpace
        ? {}
        : {
            knownLocations: [
              ...current.knownLocations.filter(
                (entry) => entry.id !== place.id,
              ),
              structuredClone(place),
            ],
          }),
      unassignedHorizonProfiles: (
        current.unassignedHorizonProfiles || []
      ).filter((profile) => profile.id !== place.sourceProfileId),
    }));
    setPlaceDialog(null);
  };
  // "Retirer de mes lieux" (the sheet of the place, the only place that
  // deletes): refused when a plan to execute still uses it — from the usage the
  // space reads with the place, then said again by the service; a visitor's
  // plans are read here. Answers `{ ok }` or `{ inUse, pendingPlans }`.
  const deleteKnownPlace = async (id) => {
    if (placesFromSpace) return spacePlaces.remove(id);
    const { pendingPlans } = localPlaceUsage(id, stateRef.current.plans);
    if (pendingPlans.length) return { inUse: true, pendingPlans };
    setSaved(false);
    setState((current) => ({
      ...current,
      knownLocations: current.knownLocations.filter((place) => place.id !== id),
    }));
    return { ok: true };
  };
  // "Détacher" of the section "Fiche OpenStreetMap": the place stays
  // as it is, with its type; only the link to the record goes.
  const detachKnownPlace = (place) => {
    const { knownPlace: _link, ...kept } = place;
    saveKnownPlace({ ...kept, kind: placeKindOf(place) });
  };
  const placeUsageOf = (place) =>
    placesFromSpace
      ? (place.usage ?? { pendingPlans: [], pastPlans: [] })
      : localPlaceUsage(place.id, state.plans);
  // "Ajouter" of a suggested place: the place becomes one of mine — its name
  // and position copied, the link to the known place — with its time zone
  // resolved like any new place. Answers the place, or `null` when the zone
  // could not be resolved (nothing is saved then).
  const addSuggestedPlace = async (suggestion) => {
    const existing = alreadyMinePlace(suggestion, knownPlacesRef.current);
    if (existing) return existing;
    const draft = personalPlaceFromSuggestion(suggestion, {
      linkedAt: Date.now(),
      id: randomUuid(),
    });
    try {
      const { elevationSource, ...resolved } = await locationRequest({
        operation: "resolve",
        latitude: draft.latitude,
        longitude: draft.longitude,
        ...(draft.elevation ? { elevation: draft.elevation } : {}),
        reverse: false,
        locale,
      });
      if (!resolved.timeZone) return null;
      const place = normalizePlace({
        ...draft,
        timeZone: resolved.timeZone,
        elevation:
          elevationSource === "unavailable"
            ? (draft.elevation ?? "")
            : String(resolved.elevation ?? draft.elevation ?? ""),
      });
      if (!place) return null;
      saveKnownPlace(place);
      return place;
    } catch {
      return null;
    }
  };
  // The place is kept first, whatever the night then says; the question
  // is only whether the night's plans follow it, and only when the new place
  // is very distant (200 km) from the night's current one.
  const requestPlaceChange = (place, save = false) => {
    const changed =
      placeFingerprint(place) !== placeFingerprint(state.location);
    if (save) saveKnownPlace(place);
    if (
      changed &&
      placeIsVeryFar(state.location, place) &&
      plansForDate.some(
        (plan) => plan.items.length || planStatus(plan) !== "pending",
      )
    ) {
      setPlaceChange({ place, current: state.location });
      setPlaceDialog(null);
    } else commitPlaceChange(place, false);
  };
  // The two choices of the band "Les plans … ont pour lieu …". "Utiliser
  // {lieu choisi}" moves the night's plans to the chosen place; "Revenir à
  // {lieu des plans}" takes the plans' place back — a plan already at the
  // chosen place moves too, after the same distance dialog. Nothing moves
  // before the dialog's "Remplacer le lieu".
  const resolveNightPlace = (place) => {
    setSaved(false);
    setState((current) => {
      const before = nightPlaceConflict(current);
      const unified = unifyNightPlace(current, place);
      // A chosen slot follows the place's local hours; the plans moved
      // come from the place the others had.
      const moved = transposeNightSpansOfPlaceChange(
        {
          ...current,
          location:
            before &&
            placeFingerprint(place) === placeFingerprint(before.chosenPlace)
              ? before.plansPlace
              : current.location,
        },
        withLocationReviewReason(current, unified),
      );
      slotNoticeChange.current = moved;
      return moved.state;
    });
    setNightPlaceChoice(null);
    setEditingItemId(null);
  };
  const chooseNightPlace = (kind) => {
    if (!nightConflict) return;
    const place =
      kind === "use" ? nightConflict.chosenPlace : nightConflict.plansPlace;
    const current =
      kind === "use" ? nightConflict.plansPlace : nightConflict.chosenPlace;
    const somethingMoves =
      plansMovedToPlace(state, place).length > 0 &&
      (kind === "use" ||
        nightConflict.tabPlanIds.some(
          (id) => !nightConflict.otherPlanIds.includes(id),
        ));
    if (somethingMoves) setNightPlaceChoice({ place, current });
    else resolveNightPlace(place);
  };
  // A plan that ran is not a tab — the first tab takes its place.
  useEffect(() => {
    if (activePlan || !tabPlans.length) return;
    setState((current) => selectPlannerPlan(current, tabPlans[0].id));
  }, [activePlan, tabPlans]);
  const handlePlanTabKey = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const index = tabPlans.findIndex((plan) => plan.id === activePlan?.id);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabPlans.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabPlans.length) %
            tabPlans.length;
    const plan = tabPlans[next];
    if (!plan) return;
    event.preventDefault();
    selectPlan(plan.id);
    requestAnimationFrame(() =>
      document.getElementById(`planner-tab-${plan.id}`)?.focus(),
    );
  };
  const selectPlan = (id, { openEditor = false } = {}) => {
    setSaved(false);
    setEditingItemId(null);
    setState((current) => selectPlannerPlan(current, id));
    if (openEditor) {
      changePlannerView("editor");
      // A plan opened to be edited arrives with stage 1 "Lieu
      // et date" folded and the page scrolled so that the plan tabs stand
      // right under the sticky bar, the requested plan's tab selected; the
      // observer unfolds stage 1 as usual. Selecting a tab (no `openEditor`)
      // and creating a plan keep the page where it is.
      setState((current) => ({
        ...current,
        plans: current.plans.map((plan) =>
          plan.id === id && !plan.view?.placeCollapsed
            ? {
                ...plan,
                view: {
                  ...defaultPlanView,
                  ...plan.view,
                  placeCollapsed: true,
                },
              }
            : plan,
        ),
      }));
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      let frames = 0;
      const land = () => {
        const heading = planTabsHeadingRef.current;
        if (heading) {
          heading.scrollIntoView({
            behavior: reduce ? "auto" : "smooth",
            block: "start",
          });
        } else if ((frames += 1) < 30) window.requestAnimationFrame(land);
      };
      window.requestAnimationFrame(() => window.requestAnimationFrame(land));
    }
  };
  // "Nouveau plan": when the multi-night plans are shown, the question
  // "What do you want to prepare?" first; else, and for "A one-night plan",
  // the plan of this night as always.
  const requestNewPlan = () => {
    if (multiNightEntries === "absent") {
      addPlan();
      return;
    }
    if (!canCreatePlanNow) return;
    // The limit is said in advance: a night that already holds its plan, in a
    // space that has one plan per night, says so at once -- "Un plan existe
    // déjà" -- not two screens later, after "What do you want to prepare?"
    // and "Continue".
    if (
      planExistingForRefusal(
        planCreationGate({
          capabilities,
          plans: spacePlansOf(stateRef.current.plans),
          date: stateRef.current.date,
          signedIn: Boolean(auth.authenticated),
        }),
      )
    ) {
      addPlan();
      return;
    }
    setPlanKindChoice(true);
  };
  // A multi-night entry asked for: the shell's dialog when the profile
  // carries the plans; the words of the offers when it holds them back; the
  // multi-night side of the library for a visitor, where it says that a
  // multi-night plan lives in a space.
  const enterMultiNight = (open) => {
    if (multiNight === "open") open();
    else if (multiNight === "heldBack") {
      // Where the offers are sold, the entry leads to them ("Vous venez de
      // : Plans sur plusieurs nuits"); the neutral sentence stays where
      // nothing is sold.
      if (lockedOffersHref(locale, "planning", "multiNight"))
        setPurchaseBoxFor({ offer: "planning", feature: "multiNight" });
      else refuseCapability("multiNight");
    } else if (multiNight === "visitor") {
      setPlanKind("multi");
      changePlannerView("library");
    }
  };
  // What the planner hands the multi-night views of a shell
  // (`planner.projects`): what it holds (the plans, the places, the
  // framings, the targets it knows), and the few things they may ask of it
  // -- open a plan, start one for a night, change a plan's items. Nothing
  // here knows what a multi-night plan is.
  const offersExtension = plannerExtension("planner.offers");
  // The light-pollution map of the "Lieux" view is a shell's, registered at
  // `planner.places.lightMap`; the core draws its entry, held back without
  // `planner.mosaic` (`places-light-map-access.js`).
  const lightMapExtension = plannerExtension("planner.places.lightMap");
  const lightMapAccess = placesLightMapAccess({
    registered: Boolean(lightMapExtension),
    hosted: isHostedService(auth),
    capabilities,
  });
  const placesLightMap =
    lightMapAccess === "absent"
      ? null
      : {
          access: lightMapAccess,
          View: lightMapExtension.View,
          label: lightMapExtension.copy(locale).entry,
          place: locationCoordinates(state.location) ? state.location : null,
        };
  const multiNightHost = {
    locale,
    access: multiNight,
    // Whether the multi-night plans are sold at all: what the views read before
    // a capability.
    hosted: isHostedService(auth),
    // The person's capabilities (`null` signed out): what a view reads to
    // tell a feature held back, never a name typed in a condition.
    capabilities: capabilities || null,
    // The last refused link and the way to forget it.
    linkRefusal,
    dismissLinkRefusal: () => setLinkRefusal(null),
    signedIn: Boolean(auth.authenticated),
    signInHref: plannerSignInHref({
      locale,
      signInPath: auth.signInPath,
      method: auth.method,
    }),
    offersHref: offersExtension
      ? offersExtension.href({
          locale,
          signedIn: Boolean(auth.authenticated),
        })
      : null,
    plans: state.plans,
    activePlanId: state.activePlanId,
    knownLocations: knownPlaces || [],
    framings: framingsLibrary,
    targets,
    equipment: state.equipment,
    constraints: {
      minAltitude: state.minAltitude,
      moonSeparationMinimum: state.moonSeparationMinimum,
      moonSeparationMinimumByFilter: state.moonSeparationMinimumByFilter,
    },
    equipmentName: (selection) =>
      resolveEquipment(selection || {}, plannerProfiles)?.name || "",
    timeZone: state.location?.timeZone || null,
    night: night ? { start: night.start, end: night.end } : null,
    // The open plan's card of a target, and what tonight gives it (minutes
    // from the night's start): what "Transformer" weighs.
    cardFor: (itemId) =>
      activePlanCards.find((card) => card.target?.id === itemId) || null,
    tonightFor: (itemId) => {
      const card = activePlanCards.find((entry) => entry.target?.id === itemId);
      return card && night
        ? { ...availabilityWindow(card, night), total: nightMinutes(night) }
        : null;
    },
    // The integration the planner suggests for a target with the open
    // plan's equipment, or with `selection` (`suggestedIntegration`).
    integrationFor: (target, selection = null) => {
      try {
        return suggestedIntegration(
          target,
          selection ? resolveEquipment(selection, plannerProfiles) : equipment,
          null,
        );
      } catch {
        return null;
      }
    },
    openPlan: (id) => selectPlan(id, { openEditor: true }),
    showLibrary: (kind = "multi") => {
      setPlanKind(kind);
      changePlannerView("library");
    },
    // A plan for `date` at `location`, with the plan settings and the items
    // given, made the active plan, and the planner opened on it — or, with
    // `{ open: false }`, left on the screen that asked (several drafts
    // written at once). `null` when the profile has no room for one more
    // plan (the notice says why).
    addPlanForNight: (
      { date, location, name, settings = {}, items = [] },
      { open = true } = {},
    ) => {
      const creation = planCreationGate({
        capabilities,
        plans: spacePlansOf(stateRef.current.plans),
        date,
        signedIn: Boolean(auth.authenticated),
      });
      if (!creation.allowed) {
        refuseCapability(creation.refusal);
        return null;
      }
      const place = normalizePlace(location);
      if (!place) return null;
      const id = planId();
      const darkness = newPlanDarkness(darknessPreferenceRef.current);
      setSaved(false);
      setEditingItemId(null);
      setState((current) => {
        const start = newPlanStart(current);
        let next = choosePlannerDate(
          { ...current, location: structuredClone(place) },
          date,
          { id, name, ...darkness, ...start },
        );
        if (next.activePlanId !== id)
          next = addPlannerPlan(next, { id, name, ...darkness, ...start });
        next = {
          ...next,
          plans: next.plans.map((plan) =>
            plan.id === id
              ? { ...plan, ...structuredClone(settings), items }
              : plan,
          ),
        };
        return selectPlannerPlan(next, id);
      });
      if (open) changePlannerView("editor");
      return id;
    },
    // Rewrites the items of plan `id` (`update(items) -> items`): how a
    // multi-night plan's links (`projectId`) are set or taken away.
    updatePlanItems: (id, update) => {
      setLinkRefusal(null);
      setSaved(false);
      setState((current) => ({
        ...current,
        plans: current.plans.map((plan) =>
          plan.id === id ? { ...plan, items: update(plan.items || []) } : plan,
        ),
      }));
    },
  };
  const multiNightBadge = offersExtension?.gateCopy(locale)?.advancedPlanning;
  // "Une nuit | Multi-nuits", first in the plans library when the multi-night
  // plans are shown. "Multi-nuits" while the purchase is missing goes where
  // "Nouveau plan multi-nuits" goes (`enterMultiNight`, the one guard): the
  // offers. Owned, signed out or read-only where nothing restricts them, the
  // side opens as before; "Une nuit" is always a plain choice.
  const choosePlanKind = (kind) => {
    if (planKindChoiceOutcome(multiNight, kind) === "offers") {
      enterMultiNight(() => setPlanKind("multi"));
      return;
    }
    setPlanKind(kind);
  };
  const planKindSwitch =
    multiNight === "absent" ? null : (
      <div className="plan-kind-switch-row">
        <PlanKindSwitch
          locale={locale}
          value={planKind}
          onChange={choosePlanKind}
          badge={multiNightBadgeFor(multiNight, multiNightBadge)}
        />
      </div>
    );
  // The plans the service refused to delete come back on the screen,
  // and are no longer named for deletion.
  const restoreRefusedDeletions = (ids) => {
    const back = [];
    for (const id of ids) {
      deletedPlanIdsRef.current.delete(id);
      const plan = removedPlansRef.current.get(id);
      removedPlansRef.current.delete(id);
      if (plan) back.push(plan);
    }
    if (!back.length) return;
    setState((current) => ({
      ...current,
      plans: [
        ...current.plans,
        ...back.filter(
          (plan) => !current.plans.some((entry) => entry.id === plan.id),
        ),
      ],
    }));
  };
  // The plans the service refused to mark executed, in part or
  // abandoned — their night has not begun — are planned again.
  const revertRefusedClosures = (ids) => {
    if (!ids.length) return;
    setState((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        ids.includes(plan.id) ? planWithStatus(plan, "pending") : plan,
      ),
    }));
  };
  // "Supprimer" on a plan whose night runs on a phone is refused in words,
  // before anything is sent; the plan stays as it is.
  const refuseRunningDeletion = (plan) =>
    setDeletionRefusal([
      {
        id: plan.id,
        name: plan.name || message(locale, "plannerUntitledPlan"),
        inProgress: true,
      },
    ]);
  const removePlan = (id) => {
    if (planIsExecuting(executionRef.current, id)) {
      const running = stateRef.current.plans.find((plan) => plan.id === id);
      if (running) refuseRunningDeletion(running);
      return;
    }
    setSaved(false);
    setEditingItemId(null);
    setPlanNameEdit((current) => (current?.id === id ? null : current));
    setState((current) => {
      const removedPlan = current.plans.find((plan) => plan.id === id);
      if (
        !removedPlan ||
        !["pending", "abandoned"].includes(planStatus(removedPlan))
      )
        return current;
      // A plan kept in this browser was never in the space: there is nothing
      // to delete there.
      if (!isBrowserPlan(removedPlan)) {
        deletedPlanIdsRef.current.add(id);
        removedPlansRef.current.set(id, removedPlan);
      }
      const plans = current.plans.filter((plan) => plan.id !== id);
      const nextActive = plans.find(
        (plan) =>
          plan.nightId === current.activeNightId &&
          planStatus(plan) === "pending",
      );
      return selectPlannerPlan({
        ...current,
        plans,
        activePlanId:
          current.activePlanId === id
            ? nextActive?.id || null
            : current.activePlanId,
      });
    });
  };
  const setPlanStatus = (id, status) => {
    if (!plannerPlanStatuses.has(status)) return;
    // A plan whose night runs on a phone is not closed from here.
    if (planIsExecuting(executionRef.current, id)) return;
    rememberPlanChange(id);
    setSaved(false);
    setState((current) => {
      const plans = current.plans.map((plan) =>
        plan.id === id ? planWithStatus(plan, status) : plan,
      );
      const changedPlan = plans.find((plan) => plan.id === id);
      const replacement = plans.find(
        (plan) =>
          plan.id !== id &&
          plan.nightId === changedPlan?.nightId &&
          planStatus(plan) === "pending",
      );
      return selectPlannerPlan({
        ...current,
        plans,
        activePlanId:
          current.activePlanId === id && status !== "pending"
            ? replacement?.id || null
            : current.activePlanId,
      });
    });
  };
  const archivePlan = (id) => {
    const plan = stateRef.current.plans.find((entry) => entry.id === id);
    // Any plan not archived yet may be put aside — planned, given
    // up or executed (the only way to put an executed plan aside, since it is
    // never deleted).
    if (!plan || planStatus(plan) === "archived") return;
    if (planIsExecuting(executionRef.current, id)) return;
    rememberPlanChange(id);
    setSaved(false);
    setEditingItemId(null);
    setState((current) => {
      const plans = current.plans.map((entry) =>
        entry.id === id ? planWithStatus(entry, "archived") : entry,
      );
      const nextActive =
        current.activePlanId === id
          ? plans.find(
              (entry) =>
                entry.id !== id &&
                entry.nightId === current.activeNightId &&
                planStatus(entry) === "pending",
            )
          : null;
      return selectPlannerPlan({
        ...current,
        plans,
        activePlanId:
          current.activePlanId === id
            ? nextActive?.id || null
            : current.activePlanId,
      });
    });
  };
  const renamePlan = (id, name) => {
    const plan = stateRef.current.plans.find((entry) => entry.id === id);
    if (!plan || planStatus(plan) !== "pending") return;
    if (planIsExecuting(executionRef.current, id)) return;
    rememberPlanChange(id);
    setSaved(false);
    setState((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === id ? { ...plan, name } : plan,
      ),
    }));
  };
  const beginPlanNameEdit = (plan) => {
    if (planStatus(plan) !== "pending") return;
    if (planIsExecuting(executionRef.current, plan.id)) return;
    setPlanNameEdit({ id: plan.id, value: plan.name || "" });
  };
  const cancelPlanNameEdit = () => setPlanNameEdit(null);
  const confirmPlanNameEdit = () => {
    if (!planNameEdit) return;
    renamePlan(planNameEdit.id, planNameEdit.value.trim());
    setPlanNameEdit(null);
  };
  useLayoutEffect(() => {
    const anchor = recommendationScrollAnchorRef.current;
    if (!anchor) return;
    recommendationScrollAnchorRef.current = null;
    if (!anchor.element?.isConnected) return;
    const delta = anchor.element.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 0.5)
      window.scrollBy({ top: delta, left: 0, behavior: "instant" });
  }, [state]);

  // Every plan edit made from a target's own card changes the height of the
  // schedule stage, which sits above the recommendations: without this the
  // card under the observer's finger slides by exactly one timeline row.
  // Chrome's native scroll anchoring happens to absorb it today, but WebKit
  // implements none, so the compensation is made explicitly here -- for the
  // removal exactly as for the addition.
  const anchorRecommendationScroll = (anchorElement) => {
    const scrollAnchor = anchorElement?.closest?.(
      ".planner-target-card, .planner-night-map-target-preview",
    );
    recommendationScrollAnchorRef.current = scrollAnchor
      ? {
          element: scrollAnchor,
          top: scrollAnchor.getBoundingClientRect().top,
        }
      : null;
  };

  const add = (card, anchorElement = null) => {
    if (!activePlan || !activePlanEditable || selectedIds.has(card.target.id))
      return;
    anchorRecommendationScroll(anchorElement);
    // A fresh target is placed where it is actually worth observing rather
    // than at the head of its own availability window: the recommended
    // integration time, centred on culmination inside the target's quality
    // window, moved aside to whatever the plan leaves free, shortened when
    // that is all that fits, and only overlapping as a last resort. The
    // placement's `reason` is deliberately not stored on the item -- the
    // synced plan schema stays as it is.
    // Inside the plan's chosen span of the night, when there is one. A target
    // that finds no room never lands on the hours of another: the plan is
    // spread over the night when that places every target, and otherwise the
    // newcomer is the one that yields ("plus le temps ce soir", a zero-length
    // slot that stays in the plan).
    const added = placeAddedItem({
      card,
      item: plannedPlanItem({ card, night }),
      items: activeItems,
      cards: spreadCardsByTarget(night?.cards),
      night,
      span: activeNightSpan,
    });
    rememberPlanChange(activePlan.id);
    setSaved(false);
    const planId = activePlan.id;
    setState((current) => ({
      ...current,
      activePlanId: planId,
      plans: current.plans.map((plan) =>
        plan.id === planId
          ? clearLocationReview({
              ...plan,
              // A plain add is appended to the plan as it is now; only a
              // spread rewrites the slots of the others.
              items: added.spreadCount
                ? added.items
                : [...plan.items, added.item],
            })
          : plan,
      ),
    }));
    setAddNotice({
      id: `${Date.now()}-${card.target.id}`,
      itemId: added.item.id,
      text: flow(locale, "added"),
      // The timeline column's add line says where the target landed; the
      // reason is never stored on the item.
      placement: {
        designation: plannerTimelineLabel(card.target),
        reason: added.reason,
        minutes: added.item.durationMinutes,
        spreadCount: added.spreadCount,
      },
    });
  };
  // "Répartir les cibles": the targets of the active plan that overlap are
  // put one after the other, each in its window of visibility, in one
  // undoable edit; nothing is deleted, a target with no room becomes "plus le
  // temps ce soir".
  const spreadActivePlan = () => {
    if (!activePlan || !activePlanEditable || !overlapSpread?.slots.length)
      return;
    const result = overlapSpread;
    const planId = activePlan.id;
    rememberPlanChange(planId);
    setSaved(false);
    setState((current) => ({
      ...current,
      activePlanId: planId,
      plans: current.plans.map((plan) =>
        plan.id === planId
          ? { ...plan, items: itemsWithSpread(plan.items, result) }
          : plan,
      ),
    }));
    // How many found their place; a target with no room is still on the
    // frise, "plus le temps ce soir".
    const placed = result.slots.filter((slot) => !slot.noTime).length;
    setAddNotice({
      id: `${Date.now()}-spread`,
      itemId: result.slots[0].id,
      text: spreadDoneLine(locale, placed || result.slots.length),
    });
  };
  // Re-run the cascade over the ticked ids, then append in one undoable edit.
  // `placement` is the one the dialog showed: what is added is what
  // was drawn.
  const applySuggestions = (ids, placement = "ideal") => {
    setSuggestOpen(false);
    if (!activePlan || !activePlanEditable || !night || !ids.length) return;
    const applied = proposeSuggestions({
      count: ids.length,
      only: ids,
      placement,
    });
    const created = applied.items
      .filter((entry) => ids.includes(entry.target.id))
      .flatMap((entry) => {
        const card = night.cards?.find(
          (candidate) => candidate.target.id === entry.target.id,
        );
        if (!card || selectedIds.has(entry.target.id)) return [];
        return [
          {
            ...plannedPlanItem({ card, night }),
            startMinute: entry.startMinute,
            endMinute: entry.endMinute,
            durationMinutes: entry.durationMinutes,
          },
        ];
      });
    if (!created.length) return;
    rememberPlanChange(activePlan.id);
    setSaved(false);
    const planId = activePlan.id;
    setState((current) => ({
      ...current,
      activePlanId: planId,
      plans: current.plans.map((plan) =>
        plan.id === planId
          ? clearLocationReview({
              ...plan,
              items: [...plan.items, ...created],
            })
          : plan,
      ),
    }));
    setAddNotice({
      id: `${Date.now()}-autofill`,
      itemId: created[0].id,
      text: autoFillAppliedNotice(created.length, locale),
    });
  };
  // A mosaic is an account resource the service only lets a profile with
  // `planner.mosaic` write or restore: every way to one says so instead of
  // opening a tool whose saving would be refused. A framing of a single field
  // never asks.
  const mosaicHeld = () => {
    if (mosaicAvailable) return false;
    refuseCapability("mosaic");
    return true;
  };
  // What a refused write of the service (`capability_required`, its answer
  // when the screen was stale or bypassed) shows: the same sentence, never
  // the service's English one.
  const reportFramingError = (error) => {
    if (error?.code === "capability_required")
      refuseCapability("mosaic", { fromService: true });
    else setFramingSaveError(error?.message || "framing_write_failed");
  };
  const openFraming = (framing) => {
    if (!activePlan || !activePlanEditable) return;
    const objects = Array.isArray(framing?.objects) ? framing.objects : [];
    // Amendment A2: what the map's surface computes to draw itself is
    // display machinery only -- the framing stores what the surface says
    // (`surfaceDraftFields`: for a mosaic, the requested sky AREA, never a
    // grid, and the field that keeps the marker and ASIAIR sizing accurate).
    setFramingDraft({
      ...framing,
      objects,
      ...surfaceDraftFields(surfaceModel, liveFrameSurface, night?.field),
      name: framingDraftName(
        { objects, center: framing?.center },
        message(locale, "plannerUseFramingDefault"),
      ),
    });
  };
  const framingEquipmentSnapshot = (field) => ({
    schemaVersion: 1,
    mode: equipment.mode,
    telescope: {
      id: state.equipment.telescopeId,
      name: selectedTelescope?.name || null,
      apertureMm: Number(selectedTelescope?.apertureMm) || null,
      focalLengthMm: Number(selectedTelescope?.focalLengthMm) || null,
    },
    modifier: {
      id: state.equipment.modifierId,
      name: selectedModifier?.name || null,
      multiplier: Number(selectedModifier?.multiplier) || 1,
    },
    effectiveFocalLengthMm: Number(equipment.focalLengthMm) || null,
    field: field ? { ...field } : null,
    ...(equipment.mode === "visual"
      ? {
          eyepiece: {
            id: state.equipment.eyepieceId,
            name: selectedEyepiece?.name || null,
            focalLengthMm: Number(equipment.eyepieceFocalLengthMm) || null,
            apparentFieldDegrees:
              Number(equipment.apparentFieldDegrees) || null,
          },
          magnification: Number(equipment.magnification) || null,
          exitPupilMm: Number(equipment.exitPupilMm) || null,
        }
      : {
          camera: {
            id: state.equipment.cameraId,
            name: selectedCamera?.name || null,
            sensorWidthMm: Number(selectedCamera?.sensorWidthMm) || null,
            sensorHeightMm: Number(selectedCamera?.sensorHeightMm) || null,
          },
        }),
  });
  const recordFramingEquipment = (planId, itemId, target) => {
    const plan = stateRef.current.plans.find((entry) => entry.id === planId);
    if (!plan || planStatus(plan) !== "pending" || !target?.framing) return;
    const snapshot = framingEquipmentSnapshot(target.framing.field);
    rememberPlanChange(planId);
    setSaved(false);
    setState((current) => ({
      ...current,
      plans: current.plans.map((entry) =>
        entry.id !== planId
          ? entry
          : {
              ...entry,
              items: entry.items.map((item) =>
                item.id !== itemId
                  ? item
                  : {
                      ...item,
                      target: {
                        ...item.target,
                        framing: {
                          ...item.target.framing,
                          equipment: snapshot,
                        },
                      },
                    },
              ),
            },
      ),
    }));
  };
  const addFraming = async (name) => {
    if (!framingDraft || !activePlan || !activePlanEditable) return;
    const center = framingDraft.center;
    if (
      !Number.isFinite(Number(center?.ra)) ||
      !Number.isFinite(Number(center?.dec))
    )
      return;
    const id = newFramingId();
    const savedAt = new Date().toISOString();
    const saved = savedFramingTarget({
      draft: framingDraft,
      id,
      name,
      savedAt,
      framingLabel: message(locale, "plannerFraming"),
    });
    if (!saved) return;
    const target = {
      ...saved,
      framing: {
        ...saved.framing,
        equipment: framingEquipmentSnapshot(framingDraft.field),
      },
    };
    // For a signed-in person the framing is an account resource first — created
    // here, then referenced by the plan item below. `catalogueTargetId` is the
    // nearest recognised catalogue object, or `null`. A visitor has no space to
    // keep one in (the framing is theirs all the same): it stays in the plan of
    // this browser, as the item's own target (`isSavedFraming`, read wherever a
    // plan is).
    const inBrowser = !auth.authenticated;
    if (!inBrowser) {
      let resource;
      try {
        resource = await putFraming({
          id,
          name,
          payload: {
            target,
            catalogueTargetId: framingDraft.matches?.[0]?.id || null,
            // 0° unless the frame was turned.
            angleDegrees: normalizeFramingAngle(framingDraft.angleDegrees),
          },
          ifMatch: '"0"',
        });
      } catch (error) {
        reportFramingError(error);
        return;
      }
      setFramingsLibrary((list) => [resource, ...list]);
      target.framingId = id;
      target.framingRevision = resource.revision;
      target.framingState = resource.state;
    }
    const preview = contextForPlan({
      ...activePlan,
      items: [...activePlan.items, { id, target }],
    });
    const card = preview.cards.find((candidate) => candidate.target.id === id);
    // A framing has no recommended integration time of its own -- 60 minutes
    // stays the default, exactly as before -- but it goes through the same
    // placement cascade as any other added target: `card`, computed above
    // through the very same `planNight`/`withHorizonMask` pipeline that
    // produces every other card's quality window, is what lets it land on
    // its own best window and steer clear of whatever the plan already
    // holds, instead of always starting at availability's head.
    const placement = card
      ? plannedItemPlacement({
          card: cardWithinNightSpan(card, activeNightSpan),
          night: preview.night,
          items: activeItems,
        })
      : null;
    const startMinute = placement ? placement.startMinute : 0;
    const endMinute = placement ? placement.endMinute : 60;
    rememberPlanChange(activePlan.id);
    setSaved(false);
    const planId = activePlan.id;
    setState((current) => ({
      ...current,
      // The framing dialog belongs to this specific plan.  Do not rely on a
      // potentially stale activePlanId while another state update is being
      // persisted in the background.
      activePlanId: planId,
      plans: current.plans.map((plan) =>
        plan.id === planId
          ? clearLocationReview({
              ...plan,
              items: [
                ...plan.items,
                {
                  id,
                  target,
                  ...(inBrowser ? {} : { framingId: id }),
                  durationMinutes: Math.max(0, endMinute - startMinute),
                  startMinute,
                  endMinute,
                  filter: card?.filter || "",
                },
              ],
            })
          : plan,
      ),
    }));
    setAddNotice({
      id: `${Date.now()}-${id}`,
      itemId: id,
      text: flow(locale, "added"),
    });
    setMapSelectedTargetId(id);
    selectRecommendationSource("framing");
    setFramingDraft(null);
  };

  // The "+" fullscreen editor (a framing created here has no plan) and every
  // rule sheet it can lead to.
  // `packages/astro-contracts/schemas/api/framing.schema.json` requires the
  // resource `id` to be a bare UUID (unlike a plan item's own free-form id).
  const newFramingId = () => randomUuid();
  const openNewFramingEditor = (forPlanId = null) => {
    setFramingEditorState({
      mode: "create",
      forPlanId,
      editingResourceId: null,
      editingRevision: null,
      editingTarget: null,
      initialFrameSurface: null,
      initialEquipmentSelection: { ...state.equipment },
    });
  };
  // FRAMING-FROM-PREVIEW-01: « Créer un cadrage » of a target's photo
  // preview: a new framing, the map on the target at the preview's square,
  // the equipment the preview shows (the app's default one included).
  const openFramingFromPreview = ({
    center,
    fovDegrees,
    equipment,
    defaultEquipment = false,
  }) => {
    setFramingEditorState({
      mode: "create",
      forPlanId: null,
      editingResourceId: null,
      editingRevision: null,
      editingTarget: null,
      initialFrameSurface: null,
      initialEquipmentSelection: { ...equipment },
      initialView: { center, fovDegrees },
      initialDefaultEquipment: Boolean(defaultEquipment),
    });
  };
  const openFramingEditorFor = (resource, { mode, forPlanId = null }) => {
    const target = resource.payload.target;
    if (framingNeedsMosaic(target) && mosaicHeld()) return;
    setFramingEditorState({
      mode,
      forPlanId,
      editingResourceId: resource.id,
      editingRevision: resource.revision,
      editingTarget: { ...target, id: resource.id, framingId: resource.id },
      initialFrameSurface: surfaceModel?.savedSurface(target?.framing) || null,
      initialEquipmentSelection: equipmentSelectionFromSnapshot(
        target?.framing?.equipment,
        state.equipment,
      ),
    });
  };
  // The editor left for « Définir mon matériel » reopens on what it noted,
  // once the page knows who is there.
  const framingEditorRestored = useRef(false);
  useEffect(() => {
    if (!serverReady || framingEditorRestored.current) return;
    framingEditorRestored.current = true;
    const draft = takeFramingEditorDraft(tabSessionStorage());
    if (!draft) return;
    const restored = framingEditorStateFromDraft(draft);
    framingEditorStateRef.current = restored;
    setFramingEditorState(restored);
  }, [serverReady]);
  const rememberFramingEditor = (snapshot) =>
    rememberFramingEditorDraft(tabSessionStorage(), {
      ...snapshot,
      editor: framingEditorStateRef.current || {},
    });
  // `?plan=<id>`: « Modifier le plan » of « Mon espace » (tab Plans) opens
  // that plan in the editor, once the document is read; the parameter is
  // then taken out of the address.
  const planFromAddressOpened = useRef(false);
  useEffect(() => {
    if (!loaded || planFromAddressOpened.current) return;
    const url = new URL(window.location.href);
    const wanted = url.searchParams.get("plan");
    if (!wanted) return;
    planFromAddressOpened.current = true;
    url.searchParams.delete("plan");
    window.history.replaceState({}, "", url);
    if (state.plans.some((plan) => plan.id === wanted))
      selectPlan(wanted, { openEditor: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, state.plans]);
  // Opened once, on a new framing, for the night that asked.
  useEffect(() => {
    if (!framingForNight || !auth.authenticated) return;
    if (framingForNightOpened.current) return;
    framingForNightOpened.current = true;
    setPlannerView("framings");
    openNewFramingEditor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framingForNight, auth.authenticated]);
  const [framingEditorDraft, setFramingEditorDraft] = useState(null);
  const handleFramingEditorConfirm = (draft) => {
    const editing = framingEditorState;
    const objects = Array.isArray(draft.objects) ? draft.objects : [];
    const fallback = framingDraftName(
      { objects, center: draft.center },
      message(locale, "plannerUseFramingDefault"),
    );
    const defaultName =
      editing?.mode === "editCopy"
        ? `${editing.editingTarget?.title || editing.editingTarget?.designation || fallback} ${message(locale, "plannerFramingCopySuffix")}`
        : editing?.mode === "editFree"
          ? editing.editingTarget?.title ||
            editing.editingTarget?.designation ||
            fallback
          : fallback;
    setFramingEditorDraft({ ...draft, objects, name: defaultName });
  };
  const removeFramingReferenceFromPlan = (planId, framingId) => {
    rememberPlanChange(planId);
    setSaved(false);
    setState((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id !== planId
          ? plan
          : {
              ...plan,
              items: plan.items.filter((item) => item.framingId !== framingId),
            },
      ),
    }));
  };
  const replaceFramingReferenceInPlan = (planId, oldFramingId, resource) => {
    rememberPlanChange(planId);
    setSaved(false);
    setState((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id !== planId
          ? plan
          : {
              ...plan,
              items: plan.items.map((item) =>
                item.framingId !== oldFramingId
                  ? item
                  : {
                      ...item,
                      framingId: resource.id,
                      target: {
                        ...resource.payload.target,
                        framingId: resource.id,
                        framingRevision: resource.revision,
                        framingState: resource.state,
                      },
                    },
              ),
            },
      ),
    }));
  };
  const commitFramingEditor = async (name) => {
    const editing = framingEditorState;
    const draft = framingEditorDraft;
    if (!editing || !draft) return;
    const savedAt = new Date().toISOString();
    const id =
      editing.mode === "editFree" ? editing.editingResourceId : newFramingId();
    const target = savedFramingTarget({
      draft,
      id,
      name,
      savedAt,
      framingLabel: message(locale, "plannerFraming"),
    });
    if (!target) return;
    target.framing.equipment = draft.referenceEquipment || null;
    const payload = {
      target,
      catalogueTargetId: draft.matches?.[0]?.id || null,
      // The angle the frame was turned to in the editor.
      angleDegrees: normalizeFramingAngle(draft.angleDegrees),
    };
    const finish = () => {
      setFramingEditorState(null);
      setFramingEditorDraft(null);
    };
    // A visitor has no library of their own: the framing they make goes
    // into the plan it was made for, else the active plan of this browser,
    // as that item's own target -- like "Utiliser ce cadrage".
    if (!auth.authenticated) {
      const planId =
        editing.forPlanId || (activePlanEditable ? activePlan?.id : null);
      if (editing.mode !== "create" || !planId) {
        setFramingSaveError("framing_write_failed");
        finish();
        return;
      }
      addFramingReferenceToPlan(planId, id, target);
      finish();
      changePlannerView("editor");
      return;
    }
    try {
      const resource = await putFraming({
        id,
        name,
        payload,
        ifMatch:
          editing.mode === "editFree" ? `"${editing.editingRevision}"` : '"0"',
      });
      setFramingsLibrary((list) => [
        resource,
        ...list.filter((entry) => entry.id !== resource.id),
      ]);
      // From a specific plan's target card, a copy replaces the reference in
      // that plan only; from the library, it stays unattached.
      if (editing.mode === "editCopy" && editing.forPlanId) {
        replaceFramingReferenceInPlan(
          editing.forPlanId,
          editing.editingResourceId,
          resource,
        );
      }
      if (editing.mode === "create" && editing.forPlanId) {
        const hydrated = {
          ...target,
          framingId: id,
          framingRevision: resource.revision,
          framingState: resource.state,
        };
        addFramingReferenceToPlan(editing.forPlanId, id, hydrated);
      }
      finish();
      // Made for a night: the target it frames joins the night, and the
      // person is back on the night's page, which says what happened.
      if (editing.mode === "create" && framingForNight) {
        const note = {
          name: resource.name || name,
          target: null,
          failed: false,
        };
        try {
          await addFramingTargetToNight({
            sessionId: framingForNight.sessionId,
            catalogueTargetId: payload.catalogueTargetId,
          });
          if (payload.catalogueTargetId)
            note.target =
              draft.matches?.[0]?.designation ||
              draft.matches?.[0]?.title ||
              null;
        } catch {
          note.failed = true;
        }
        rememberNightFraming(framingForNight.sessionId, note);
        window.location.assign(
          nightPagePath({ locale, sessionId: framingForNight.sessionId }),
        );
      }
    } catch (error) {
      // A conflict or a lock discovered on write never loses or overwrites
      // anything -- the local content becomes an unattached, named copy, and a
      // notice explains it.
      if (
        error?.code === "framing_conflict" ||
        error?.code === "framing_locked"
      ) {
        const copyId = newFramingId();
        const copyName = `${name} ${message(locale, "plannerFramingCopySuffix")}`;
        const copyTarget = savedFramingTarget({
          draft,
          id: copyId,
          name: copyName,
          savedAt,
          framingLabel: message(locale, "plannerFraming"),
        });
        if (copyTarget) {
          copyTarget.framing.equipment = draft.referenceEquipment || null;
          try {
            const copyResource = await putFraming({
              id: copyId,
              name: copyName,
              payload: {
                target: copyTarget,
                catalogueTargetId: draft.matches?.[0]?.id || null,
                angleDegrees: normalizeFramingAngle(draft.angleDegrees),
              },
              ifMatch: '"0"',
            });
            setFramingsLibrary((list) => [copyResource, ...list]);
            setFramingCopyNotice({
              name,
              reason: error.code === "framing_locked" ? "locked" : "concurrent",
            });
          } catch {
            setFramingSaveError("framing_write_failed");
          }
        }
        finish();
        return;
      }
      reportFramingError(error);
    }
  };
  // Shared by `addFraming` (the classic in-plan capture) and the new "+"
  // editor's `create` path: places the reference exactly like any other
  // added target (same cascade), in the given plan.
  const addFramingReferenceToPlan = (planId, id, target) => {
    const plan = stateRef.current.plans.find((entry) => entry.id === planId);
    if (!plan) return;
    const preview = contextForPlan({
      ...plan,
      items: [...plan.items, { id, target }],
    });
    const card = preview.cards.find((candidate) => candidate.target.id === id);
    const placement = card
      ? plannedItemPlacement({
          card: cardWithinNightSpan(card, planCustomNightSpan(plan)),
          night: preview.night,
          items: plan.items,
        })
      : null;
    const startMinute = placement ? placement.startMinute : 0;
    const endMinute = placement ? placement.endMinute : 60;
    rememberPlanChange(planId);
    setSaved(false);
    setState((current) => ({
      ...current,
      plans: current.plans.map((entry) =>
        entry.id !== planId
          ? entry
          : clearLocationReview({
              ...entry,
              items: [
                ...entry.items,
                {
                  id,
                  target,
                  ...(target.framingId ? { framingId: id } : {}),
                  durationMinutes: Math.max(0, endMinute - startMinute),
                  startMinute,
                  endMinute,
                  filter: card?.filter || "",
                },
              ],
            }),
      ),
    }));
    setAddNotice({
      id: `${Date.now()}-${id}`,
      itemId: id,
      text: flow(locale, "added"),
    });
  };
  // The library grid's and a plan target card's single action dispatcher:
  // decides, from the resource's own state, whether an action applies directly
  // or needs the rule sheet first.
  const handleFramingAction = (resource, action, { forPlanId = null } = {}) => {
    // Exporting and deleting or archiving one's own framing never need
    // `planner.mosaic` (the service says the same: reading, exporting and
    // clearing up stay open); renaming, editing, copying and restoring a
    // mosaic do -- never a framing of a single field.
    if (
      ["rename", "restore", "edit", "editFree", "editCopy"].includes(action) &&
      framingNeedsMosaic(resource.payload?.target) &&
      mosaicHeld()
    )
      return;
    switch (action) {
      case "export":
        // The two files of a framing (ASIAIR, N.I.N.A.) are chosen in a
        // dialog that says why a row cannot be used.
        setExportFramingResource(resource);
        return;
      case "rename":
        setFramingRenameTarget(resource);
        return;
      case "restore":
        restoreFraming(resource.id)
          .then((updated) =>
            setFramingsLibrary((list) =>
              list.map((entry) => (entry.id === updated.id ? updated : entry)),
            ),
          )
          .catch((error) => reportFramingError(error));
        return;
      case "edit":
        if (resource.state === "free") {
          openFramingEditorFor(resource, { mode: "editFree", forPlanId });
        } else if (resource.state === "shared") {
          setFramingRuleSheet({ kind: "shared", resource, forPlanId });
        } else {
          setFramingRuleSheet({ kind: "locked", resource, forPlanId });
        }
        return;
      case "editFree":
        setFramingRuleSheet(null);
        openFramingEditorFor(resource, { mode: "editFree", forPlanId });
        return;
      case "editCopy":
        setFramingRuleSheet(null);
        openFramingEditorFor(resource, { mode: "editCopy", forPlanId });
        return;
      case "delete":
        if (resource.state === "free") {
          setFramingRuleSheet({ kind: "deleteFree", resource, forPlanId });
        } else if (resource.state === "shared") {
          setFramingRuleSheet({ kind: "deleteShared", resource, forPlanId });
        } else if (resource.state === "locked") {
          setFramingRuleSheet({ kind: "deleteLocked", resource, forPlanId });
        }
        return;
      default:
        return;
    }
  };
  const performFramingRuleAction = async (actionKey) => {
    const context = framingRuleSheet;
    if (!context) return;
    const { resource, forPlanId } = context;
    try {
      if (
        actionKey === "rename" ||
        actionKey === "editFree" ||
        actionKey === "editCopy"
      ) {
        handleFramingAction(resource, actionKey, { forPlanId });
        return;
      }
      if (actionKey === "archive" || actionKey === "delete") {
        const result = await deleteFraming({
          id: resource.id,
          ifMatch: `"${resource.revision}"`,
        });
        setFramingsLibrary((list) =>
          result?.archived
            ? list.map((entry) =>
                entry.id === result.framing.id ? result.framing : entry,
              )
            : list.filter((entry) => entry.id !== resource.id),
        );
        setFramingRuleSheet(null);
        return;
      }
      if (actionKey === "removeAndDelete") {
        // v1.md: the server refuses `DELETE` on a shared framing with
        // `409 framing_in_use` -- the client removes the item from every
        // pending plan first (ordinary plan writes), then replays `DELETE`.
        const pendingPlans = resource.usage?.pendingPlans || [];
        const updatedPlans = stateRef.current.plans.map((plan) =>
          pendingPlans.some((ref) => ref.planId === plan.id)
            ? {
                ...plan,
                items: plan.items.filter(
                  (item) => item.framingId !== resource.id,
                ),
              }
            : plan,
        );
        pendingPlans.forEach((ref) =>
          removeFramingReferenceFromPlan(ref.planId, resource.id),
        );
        try {
          await persistToServer({ ...stateRef.current, plans: updatedPlans });
        } catch {
          // The local removal and its own autosave still apply; the delete
          // below simply retries against whatever the server currently has.
        }
        const result = await deleteFraming({
          id: resource.id,
          ifMatch: `"${resource.revision}"`,
        });
        setFramingsLibrary((list) =>
          result?.archived
            ? list.map((entry) =>
                entry.id === result.framing.id ? result.framing : entry,
              )
            : list.filter((entry) => entry.id !== resource.id),
        );
        setFramingRuleSheet(null);
        return;
      }
    } catch (error) {
      reportFramingError(error);
      setFramingRuleSheet(null);
    }
  };
  const commitFramingRename = async (name) => {
    const resource = framingRenameTarget;
    if (!resource) return;
    try {
      const resource2 = await putFraming({
        id: resource.id,
        name,
        payload: resource.payload,
        ifMatch: `"${resource.revision}"`,
      });
      setFramingsLibrary((list) =>
        list.map((entry) => (entry.id === resource2.id ? resource2 : entry)),
      );
    } catch (error) {
      reportFramingError(error);
    }
    setFramingRenameTarget(null);
  };

  const remove = (id, anchorElement = null) => {
    if (!activePlanEditable) return;
    anchorRecommendationScroll(anchorElement);
    if (activePlan) rememberPlanChange(activePlan.id);
    setSaved(false);
    setEditingItemId(null);
    setState((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === current.activePlanId
          ? clearLocationReview({
              ...plan,
              items: plan.items.filter((item) => item.id !== id),
            })
          : plan,
      ),
    }));
  };
  // Stable entry points for the memoised recommendation list. They always call
  // this render's `add`/`remove`, refreshed after commit and only ever invoked
  // from a click, so no card re-renders merely because the page did.
  const recommendationListActionsRef = useRef(null);
  useLayoutEffect(() => {
    recommendationListActionsRef.current = {
      add,
      remove,
      selectMap: (id) => {
        setMapSelectedTargetId(id);
        // `setTargetView` lands the swap on the map itself and remembers
        // this offset for the way back.
        setTargetView("map");
      },
      showScore: (card) => setScoreCard(card),
    };
  });
  const recommendationListActions = useMemo(
    () => ({
      add: (card, anchor) =>
        recommendationListActionsRef.current.add(card, anchor),
      remove: (id, anchor) =>
        recommendationListActionsRef.current.remove(id, anchor),
      selectMap: (id) => recommendationListActionsRef.current.selectMap(id),
      showScore: (card) => recommendationListActionsRef.current.showScore(card),
    }),
    [],
  );
  const updateItem = (id, patch, { recordHistory = true } = {}) => {
    if (!activePlanEditable) return;
    if (activePlan && recordHistory) rememberPlanChange(activePlan.id);
    setSaved(false);
    setState((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === current.activePlanId
          ? clearLocationReview({
              ...plan,
              items: plan.items.map((item) =>
                item.id === id ? { ...item, ...patch } : item,
              ),
            })
          : plan,
      ),
    }));
  };
  // The schedule banner's own closing "x": clears the flag on its own, without
  // touching any interval, recorded for undo exactly like an interval edit that
  // clears it is, so an "undo" right after dismissing the banner brings it
  // straight back.
  const dismissLocationReview = () => {
    if (!activePlan || !activePlanEditable) return;
    rememberPlanChange(activePlan.id);
    setSaved(false);
    setState((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === current.activePlanId ? clearLocationReview(plan) : plan,
      ),
    }));
  };
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z")
        return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!activePlan?.id || !activePlanEditable) return;
      event.preventDefault();
      if (event.shiftKey) redoPlan(activePlan.id);
      else undoPlan(activePlan.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePlan?.id, activePlanEditable, historyVersion]);
  const exportPlan = (plan = activePlan) => {
    if (!plan) return;
    downloadText(
      planExportFilename(plan, "archive"),
      planArchiveDocument({ plan }),
      "application/json;charset=utf-8",
    );
    setExportStatus(message(locale, "plannerExported"));
  };
  const exportPlanForAsiair = (plan = activePlan) => {
    if (!plan) return;
    const context = contextForPlan(plan);
    const exportResult = planAsiairCsv({
      plan,
      targets: context.cards,
      expandTarget: plannerExtension("planner.export.asiair"),
    });
    if (!exportResult.exportedCount) {
      setExportStatus(message(locale, "plannerAsiairNoTargets"));
      return;
    }
    downloadText(
      planExportFilename(plan, "asiair"),
      exportResult.content,
      "text/csv;charset=utf-8",
    );
    setExportStatus(message(locale, "plannerAsiairExported"));
  };
  const exportPlanForNina = (plan = activePlan) => {
    if (!plan) return;
    const context = contextForPlan(plan);
    const exportResult = planNinaCsv({
      plan,
      targets: context.cards,
      expandTarget: plannerExtension("planner.export.asiair"),
    });
    if (!exportResult.exportedCount) {
      setExportStatus(message(locale, "plannerNinaNoTargets"));
      return;
    }
    downloadText(
      planExportFilename(plan, "nina"),
      exportResult.content,
      "text/csv;charset=utf-8",
    );
    setExportStatus(message(locale, "plannerNinaExported"));
  };
  // The target set (`.ninaTargetSet`) next to the CSV: the targets with the
  // capture lines of their effective acquisition (photo mode).
  const exportPlanForNinaTargetSet = (plan = activePlan) => {
    if (!plan) return;
    const context = contextForPlan(plan);
    const exportResult = planNinaTargetSet({
      plan,
      targets: context.cards,
      expandTarget: plannerExtension("planner.export.asiair"),
      acquisition: exportAcquisitionFor(plan, context).byItem,
    });
    if (!exportResult.exportedCount) {
      setExportStatus(message(locale, "plannerNinaNoTargets"));
      return;
    }
    downloadText(
      planExportFilename(plan, "ninaTargetSet"),
      exportResult.content,
      "application/xml;charset=utf-8",
    );
    setExportStatus(message(locale, "expoENinaSetExported"));
  };
  // "Exporter ce cadrage": the two files, written from the framing's own
  // target (a mosaic through the existing `planner.export.asiair` point).
  const framingExports = (resource) => {
    const target = resource?.payload?.target;
    const options = { expandTarget: plannerExtension("planner.export.asiair") };
    return {
      target,
      asiair: framingAsiairCsv(target, options),
      nina: framingNinaCsv(target, options),
    };
  };
  const exportFramingFile = (resource, kind) => {
    const { target, asiair, nina } = framingExports(resource);
    const result = kind === "nina" ? nina : asiair;
    if (!result.exportedCount) return;
    downloadText(
      `${safeFilename(target.title || target.designation)}-${kind}.csv`,
      result.content,
      "text/csv;charset=utf-8",
    );
    setExportStatus(
      message(
        locale,
        kind === "nina" ? "plannerNinaExported" : "plannerAsiairExported",
      ),
    );
  };
  const exportCalendar = (plan = activePlan) => {
    const context = contextForPlan(plan);
    if (!plan || !context.night) return;
    const content = planCalendarIcs({
      plan,
      night: context.night,
      targets: context.cards,
      locale,
      acquisitionText: exportAcquisitionFor(plan, context).text,
    });
    if (!content) return;
    downloadText(
      planExportFilename(plan, "calendar"),
      content,
      "text/calendar;charset=utf-8",
    );
    setExportStatus(message(locale, "plannerCalendarExported"));
  };
  const exportWeatherReminder = (plan = activePlan) => {
    const context = contextForPlan(plan);
    if (!plan || !context.night) return;
    const content = weatherReminderIcs({
      plan,
      night: context.night,
      locale,
    });
    if (!content) return;
    downloadText(
      planExportFilename(plan, "weather"),
      content,
      "text/calendar;charset=utf-8",
    );
    setExportStatus(message(locale, "plannerWeatherReminderExported"));
  };
  const sharePlan = async (plan = activePlan) => {
    const context = contextForPlan(plan);
    if (!plan || !context.night) return;
    const text = planShareText({
      plan,
      night: context.night,
      targets: context.cards,
      locale,
    });
    const outcome = await sharePlanText(
      typeof navigator === "undefined" ? null : navigator,
      { title: plan.name, text },
    );
    // A closed share sheet is the person's choice: no word. Anything else is
    // said, a browser that can neither share nor copy included.
    if (outcome === "shared") setExportStatus(message(locale, "plannerShared"));
    else if (outcome === "copied")
      setExportStatus(message(locale, "plannerShareCopied"));
    else if (outcome === "unavailable")
      setExportStatus(message(locale, "plannerShareUnavailable"));
  };
  const printPlan = (plan) => {
    if (!plan) return;
    setPrintPlanId(plan.id);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };
  const printCurrentSkyMap = (mode = "realistic", projectionState = null) => {
    setPrintPlanId(null);
    setPrintSkyMap({ mode, projectionState });
    window.addEventListener("afterprint", () => setPrintSkyMap(null), {
      once: true,
    });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };
  // The "sky map only" branch of the single print entry point in the schedule
  // stage's tool row. The map/horizon views (`PlannerNightSkyMap`,
  // `PlannerHorizonProjection`) already call `printCurrentSkyMap` themselves
  // from their own print buttons, which this consolidation removes -- this
  // reproduces the projection view's own defaulting
  // (`savedHorizonControls`/`planView.horizon`/`closestCurrentTimeIndex`,
  // exactly as `PlannerHorizonProjection` computes it) so the toolbar entry
  // point can trigger the same print without that component's own local state.
  const printActiveSkyMap = () => {
    if (skyMapView !== "projection") {
      printCurrentSkyMap("realistic");
      return;
    }
    const values = { ...savedHorizonControls(), ...planView.horizon };
    const series = recommendedCards[0]?.series || [];
    const sampleIndex = Math.max(
      0,
      Math.min(
        series.length - 1,
        values.sampleIndex ??
          closestCurrentTimeIndex(series, state.location.timeZone),
      ),
    );
    printCurrentSkyMap("projection", {
      projection: values.projection,
      rotation: values.rotation,
      showLabels: values.showLabels,
      sampleIndex,
    });
  };

  const selectedLocationCoordinates = locationCoordinates(state.location);

  // `placeCollapsed` is a view key the folded stage owns; unlike
  // `equipmentCollapsed` and `constraintsCollapsed` it is deliberately absent
  // from `defaultPlanView` (packages/portal/src/planner/state.js), which is a
  // shared contract (packages/astro-contracts/fixtures/
  // planner-plan-view-selection.json and its three siblings). The normalizers
  // copy an unlisted view key through untouched, so a plan folded on one device
  // stays folded on another. An absent key reads as false: every plan saved
  // before today opens with stage 1 unfolded, as it always was.
  const placeCollapsed = Boolean(planView.placeCollapsed);
  // A horizon is drawn when the mask is on and something rises above 0°; a
  // flat default is no horizon (the open stage then shows a badge where it
  // would show the link to see it).
  const placeHorizonDrawn =
    activeHorizonMask.enabled &&
    activeHorizonMask.points.some((point) => point.altitude > 0);
  const foldedPlaceLine = foldedPlaceSummary({
    placeLabel: selectedLocationCoordinates
      ? placeSummaryLabel({
          name: state.location.name,
          locality: state.location.locality,
          coordinates: `${decimal(selectedLocationCoordinates.latitude, locale, 2)}°, ${decimal(selectedLocationCoordinates.longitude, locale, 2)}°`,
        })
      : "",
    dateLabel: nightDateLabel(state.date, locale),
    // The same test the open stage's row of actions uses to separate a real
    // mask from a flat default, so the folded and open stages never disagree.
    horizonLabel: flow(
      locale,
      placeHorizonDrawn ? "horizonSaved" : "horizonClear",
    ),
    noPlaceLabel: flow(locale, "noPlace"),
  });

  // The page's sticky bar (`StageCrumbs`). It follows the scroll by itself;
  // which stages exist, and which of them are folded, moves their titles: the
  // bar is measured again when that changes (and whenever the page changes
  // size).
  const stageCrumbKey = [
    auth.checked,
    auth.authenticated,
    plannerView,
    Boolean(night),
    activePlan?.id ?? "",
    placeCollapsed,
    Boolean(planView.equipmentCollapsed),
    Boolean(planView.constraintsCollapsed),
    locale,
  ].join("|");
  useEffect(() => observeStageCrumbs(), [stageCrumbKey]);

  const accessCopy = plannerAccessCopy(locale, {
    hosted: isHostedService(auth),
  });
  // A plan the profile has no room for is said in the words of the offers
  // when a shell registered them (`planner.offers`), else in the core's own.
  const offers = plannerExtension("planner.offers");
  const browserCopy = {
    ...browserPlansCopy(locale, { hosted: isHostedService(auth) }),
    ...(offers
      ? {
          held: offers.browserPlanHeld(locale),
          seeOffers: offers.gateCopy(locale).seeOffers,
        }
      : {}),
  };
  // A signed-in person who kept no copy of their space waits for it: the
  // browser's own plans are not to be shown in its place.
  if (!auth.checked || holdForSpace)
    return (
      <main className="planner-page">
        <p>{accessCopy.loading}</p>
      </main>
    );
  if (auth.enabled && !auth.authenticated && accessMode !== "guest")
    return (
      <>
        <header className="site-header planner-access-header">
          <h1>{accessCopy.title}</h1>
          <p>{accessCopy.intro}</p>
        </header>
        <main className="planner-access-page">
          <div className="planner-access-options">
            <button
              className="btn-tertiary planner-access-option"
              type="button"
              onClick={() => setAccessMode("guest")}
            >
              <span>{accessCopy.guestLabel}</span>
              <small>{accessCopy.guestHelp}</small>
            </button>
            {/* The sign-in page of the service — whichever sign-in method the
                server offers — and back to the planner. The sign-in page opens in the
                language of this page, which it reads from the cookie the
                header sets the same way. */}
            <a
              className="btn-primary planner-access-option"
              href={plannerSignInHref({
                locale,
                signInPath: auth.signInPath,
                method: auth.method,
              })}
              onClick={() => {
                document.cookie = `astro-portal-locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
              }}
            >
              <span>{accessCopy.signInLabel}</span>
              <small>{accessCopy.signInHelp}</small>
            </a>
          </div>
        </main>
      </>
    );

  // Where "Demander cet objet" exists; what a visitor is told, and the way in.
  const missingObjectRequest = {
    available: missingObjectAvailable(auth),
    signedIn: Boolean(auth.authenticated),
    signInHref: plannerSignInHref({
      locale,
      signInPath: auth.signInPath,
      method: auth.method,
    }),
    signInLabel: accessCopy.signInLabel,
  };
  // The eyepiece view's setting reaches every visual image of the page
  // through its context.
  const page = (
    <MissingObjectContext.Provider value={missingObjectRequest}>
      <PlaceSkyMeasuresContext.Provider value={placeSkyMeasures}>
        {purchaseBoxFor && (
          <PurchaseBoxDialog
            locale={locale}
            offer={purchaseBoxFor.offer}
            feature={purchaseBoxFor.feature}
            onClose={() => setPurchaseBoxFor(null)}
          />
        )}
        <h1 className="visually-hidden">{message(locale, "plannerTitle")}</h1>
        <div className="page-navigation planner-page-navigation">
          <p className="page-navigation-intro">
            {message(locale, "plannerIntro")}
          </p>
          <div
            className={`session-view-switch planner-page-view-switch${plannerView === "library" ? " is-library" : plannerView === "framings" ? " is-framings" : plannerView === "catalogue" ? " is-catalogue" : plannerView === "places" ? " is-places" : ""}`}
            role="tablist"
            aria-label={message(locale, "plannerTitle")}
          >
            <button
              className={plannerView === "editor" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={plannerView === "editor"}
              onClick={() => changePlannerView("editor")}
            >
              {message(locale, "plannerEditor")}
            </button>
            <button
              className={plannerView === "library" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={plannerView === "library"}
              onClick={() => changePlannerView("library")}
            >
              {message(locale, "plannerLibrary")}
            </button>
            <button
              className={plannerView === "framings" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={plannerView === "framings"}
              onClick={() => changePlannerView("framings")}
            >
              {message(locale, "plannerFramingLibrary")}
            </button>
            <button
              className={plannerView === "catalogue" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={plannerView === "catalogue"}
              onClick={() => changePlannerView("catalogue")}
            >
              {message(locale, "plannerTargetCatalogue")}
            </button>
            <button
              className={plannerView === "places" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={plannerView === "places"}
              onClick={() => changePlannerView("places")}
            >
              {message(locale, "plannerPlaces")}
            </button>
          </div>
          {persistenceError && (
            <p role="alert">{localizedServerError(locale, persistenceError)}</p>
          )}
          {deletionRefusal?.length ? (
            <section
              className="planner-refusal-notice"
              role="status"
              data-testid="plan-deletion-refused"
            >
              <p>
                {deletionRefusal.some((plan) => !plan.inProgress) ? (
                  <>
                    <strong>
                      {message(locale, "plannerPlanNotDeletable")}
                    </strong>{" "}
                  </>
                ) : null}
                {deletionRefusal
                  .map((plan) =>
                    message(
                      locale,
                      plan.inProgress
                        ? "planDeletionRefusedInProgress"
                        : "planDeletionRefusedExecutedDetail",
                    ).replace("{name}", plan.name),
                  )
                  .join(" ")}
              </p>
              <div className="planner-refusal-actions">
                {deletionRefusal.some((plan) => !plan.inProgress) ? (
                  <button
                    type="button"
                    className="btn-tertiary"
                    data-action="archive-refused"
                    onClick={() => {
                      for (const plan of deletionRefusal)
                        if (!plan.inProgress) archivePlan(plan.id);
                      setDeletionRefusal(null);
                    }}
                  >
                    {message(locale, "planDeletionRefusedArchive")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setDeletionRefusal(null)}
                >
                  {message(locale, "planDeletionRefusedClose")}
                </button>
              </div>
            </section>
          ) : null}
        </div>
        {plannerView === "library" ? (
          <>
            {multiNight !== "absent" && planKind === "multi" ? (
              multiNight === "readOnly" ? (
                <MultiNightReadOnlyView
                  locale={locale}
                  projects={readOnlyMultiNight.projects}
                  plans={state.plans}
                  kindSwitch={planKindSwitch}
                  selectedId={readOnlyProjectId}
                  onSelect={setReadOnlyProjectId}
                  onOpenPlan={(id) => selectPlan(id, { openEditor: true })}
                />
              ) : (
                <projectsExtension.LibraryView
                  host={{ ...multiNightHost, kindSwitch: planKindSwitch }}
                />
              )
            ) : (
              <PlannerLibrary
                kindSwitch={planKindSwitch}
                locale={locale}
                plans={state.plans}
                unsyncedLabel={browserCopy.badge}
                bandFor={
                  multiNight === "absent"
                    ? null
                    : (plan) => planBandText(locale, plan)
                }
                rigFor={(plan) => {
                  try {
                    return plan.equipment
                      ? resolveEquipment(plan.equipment, plannerProfiles)
                          ?.name || ""
                      : "";
                  } catch {
                    return "";
                  }
                }}
                profileSets={plannerProfiles}
                ownedFilters={ownedFilters}
                visualSkyFor={(plan) =>
                  placeVisualSky({
                    place: plan.location ?? state.location,
                    model: plan.id === activePlan?.id ? scoreSkyQuality : null,
                    measures: placeSkyMeasures,
                    knownPlaces,
                  })
                }
                skySqmFor={(place, model) => {
                  const known = knownPlaces?.find(
                    (entry) => entry?.id && entry.id === place?.id,
                  );
                  return skySqmOf(
                    placeSkyBrightness({
                      place: known
                        ? { ...place, skyEntered: known.skyEntered }
                        : place,
                      model,
                      measures: placeSkyMeasures,
                    }).choice,
                  );
                }}
                onAcquisitionDefaults={writeAcquisitionDefaults}
                onAcquisitionItem={writeAcquisitionItemLine}
                sessions={auth.authenticated ? planSessions : undefined}
                onSessionsChanged={() =>
                  setPlanSessionsStamp((current) => current + 1)
                }
                onArchive={archivePlan}
                onDelete={removePlan}
                executionByPlanId={executionByPlanId}
                onRunningRefusal={refuseRunningDeletion}
                onEdit={(id) => selectPlan(id, { openEditor: true })}
                onExport={setExportPlanId}
                onSetStatus={setPlanStatus}
              />
            )}
          </>
        ) : plannerView === "framings" ? (
          <PlannerFramingLibrary
            locale={locale}
            loaded={framingsLibraryLoaded}
            resources={framingsLibrary}
            highlightedId={highlightedFramingId}
            mosaicAllowed={mosaicAvailable}
            onNew={() => openNewFramingEditor(null)}
            onAction={(resource, action) =>
              handleFramingAction(resource, action)
            }
          />
        ) : plannerView === "conditions" ? (
          (() => {
            const place =
              conditionsOf?.place ||
              (knownPlaces || []).find(
                (entry) => entry.id === conditionsOf?.placeId,
              ) ||
              null;
            return place ? (
              <ConditionsPage
                locale={locale}
                place={place}
                date={conditionsOf?.date || null}
                pastAllowed={conditionsPastAllowed({
                  hosted: isHostedService(auth),
                  capabilities,
                })}
                offersHref={(() => {
                  const offers = plannerExtension("planner.offers");
                  return offers
                    ? offers.href({
                        locale,
                        signedIn: Boolean(auth.authenticated),
                      })
                    : null;
                })()}
                onBack={() => changePlannerView("places")}
              />
            ) : (
              <p className="conditions-muted">
                {message(locale, "conditionsLegendMoonOnly")}
              </p>
            );
          })()
        ) : plannerView === "places" ? (
          <PlacesView
            onConditions={(place) => openConditions(place)}
            locale={locale}
            places={knownPlaces}
            client={placesClient}
            onAddSuggestion={addSuggestedPlace}
            onEditPlace={(place) => setPlaceDialog({ place, fromPlaces: true })}
            onNewPlace={() =>
              setPlaceDialog({ place: null, fromPlaces: true, locate: false })
            }
            onViewHorizon={setHorizonViewer}
            onRemovePlace={deleteKnownPlace}
            onDetachPlace={detachKnownPlace}
            usageOf={placeUsageOf}
            onOpenPlan={(planId) => selectPlan(planId, { openEditor: true })}
            showPlaceId={placeToShow}
            onShown={() => setPlaceToShow(null)}
            visitor={Boolean(
              auth.checked && auth.enabled && !auth.authenticated,
            )}
            defaultPlaceId={placesFromSpace ? spacePlaces.defaultId : undefined}
            onSetDefault={placesFromSpace ? spacePlaces.setDefault : undefined}
            lightMap={placesLightMap}
          />
        ) : plannerView === "catalogue" ? (
          <PlannerTargetCatalogue
            locale={locale}
            visualMode={visualMode}
            auth={auth}
            preview={{
              planEquipment: null,
              configuration: defaultConfiguration,
              profiles: plannerProfiles,
              ...plannerPreviewSky,
              skyForPlace: plannerPreviewSkyFor,
              onCreateFraming: openFramingFromPreview,
              // The eyepieces, filters and telescopes of « Mon matériel »
              // the best pair and the photo advice try (VISUAL-SIM-02b).
              visualInventory: visualInventoryOf(inventoryProfiles),
              pickers: {
                props: equipmentPickerProps,
                define: defineEquipment,
              },
            }}
            onAddPlace={() => setPlacePicker(true)}
            onFavoritesChanged={(payload) => {
              setPlannerFavoriteTargetIds(
                favoriteTargetIdsFromPayload(payload),
              );
              setPlannerFavoritesStatus("ready");
            }}
          />
        ) : (
          <main
            className={`planner-page planner-flow${printSkyMap ? " is-printing-sky-map" : ""}`}
          >
            {/* The page's sticky bar: one bar per stage the page has, the one
              being read shown by `observeStageCrumbs`. Fixed, it takes no
              room in the page's grid. */}
            <StageCrumbs
              locale={locale}
              stages={[
                { step: 1, title: flow(locale, "where") },
                ...(activePlan
                  ? [
                      { step: 2, title: flow(locale, "materialTitle") },
                      { step: 3, title: flow(locale, "constraintsTitle") },
                      ...(night
                        ? [{ step: 4, title: flow(locale, "targets") }]
                        : []),
                      { step: 5, title: flow(locale, "schedule") },
                    ]
                  : []),
              ]}
            />
            {/* Stage 1 folds like stages 2 and 3,
              through the same <details>/<summary> the other two already use,
              and shows a real summary once folded. */}
            <details
              className="planner-flow-stage planner-location-stage"
              open={!placeCollapsed}
            >
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  updatePlanView("placeCollapsed", !placeCollapsed);
                }}
              >
                <h2 id="planner-location-step" data-stage-crumb-step="1">
                  <span className="planner-step-number">1</span>
                  {flow(locale, "where")}
                </h2>
                <span className="planner-place-stage-summary">
                  {foldedPlaceLine}
                </span>
              </summary>
              <div className="planner-flow-heading">
                <p>{flow(locale, "whereHelp")}</p>
              </div>
              {/* « One line, then ⓘ »: without a place the stage says it once
                — one sentence, one primary « Choisir un lieu », the star in
                filigree — instead of the instruction it used to repeat under
                the date and in the plan area. The date stays at hand under
                it. */}
              {!selectedLocationCoordinates && (
                <EmptyState
                  className="planner-place-empty"
                  sentence={message(locale, "plannerNoPlaceSentence")}
                  actionLabel={flow(locale, "pickPlace")}
                  actionIcon={
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
                      <circle cx="12" cy="10" r="2" />
                    </svg>
                  }
                  actionTestId="planner-place-empty-action"
                  onAction={() => setPlacePicker(true)}
                />
              )}
              <div className="planner-setting-fields">
                {/* The place is chosen in a sheet (« Choisir
                  un lieu »), not a dropdown. */}
                {selectedLocationCoordinates && (
                  <div className="planner-date-picker planner-place-picker">
                    <span id="planner-place-label">
                      {message(locale, "plannerLocation")}
                    </span>
                    <button
                      className="btn-tertiary"
                      type="button"
                      aria-haspopup="dialog"
                      aria-labelledby="planner-place-label planner-place-value"
                      onClick={() => setPlacePicker(true)}
                    >
                      <strong id="planner-place-value">
                        {state.location.id
                          ? state.location.name ||
                            state.location.locality ||
                            message(locale, "plannerLocation")
                          : flow(locale, "pickPlace")}
                      </strong>
                      <span aria-hidden="true">⌄</span>
                    </button>
                    {/* Right under the place, the link that goes to see its
                      horizon (with the horizon glyph) and the tertiary that
                      edits the place:
                      the link first, the strongest on the right. A place
                      with no horizon drawn has nothing to see: an inert
                      badge stands where the link would be, and « Éditer ce
                      lieu » stays the one way to draw one. */}
                    <div className="planner-place-actions">
                      {placeHorizonDrawn ? (
                        <button
                          className="btn-link"
                          type="button"
                          onClick={() => setHorizonViewer(state.location)}
                        >
                          <HorizonGlyph />
                          {flow(locale, "viewHorizon")}
                        </button>
                      ) : (
                        <PlannerHorizonBadge
                          label={flow(
                            locale,
                            state.location.horizonStatus === "unverified"
                              ? "horizonUnknown"
                              : "horizonNone",
                          )}
                        />
                      )}
                      <button
                        className="btn-tertiary"
                        type="button"
                        onClick={() =>
                          setPlaceDialog({ place: state.location })
                        }
                      >
                        {flow(locale, "editPlace").replace(/…$/, "")}
                      </button>
                    </div>
                  </div>
                )}
                <PlannerDatePicker
                  locale={locale}
                  value={state.date}
                  place={state.location}
                  pastAllowed={conditionsPastAllowed({
                    hosted: isHostedService(auth),
                    capabilities,
                  })}
                  retry={forecastRetry}
                  latitude={state.location.latitude}
                  onChange={(value) => update("date", value)}
                  onRetry={() => setForecastRetry((value) => value + 1)}
                />
              </div>
              {selectedLocationCoordinates && (
                <p className="planner-location-summary">
                  <>
                    {decimal(state.location.latitude, locale, 5)}° ·{" "}
                    {decimal(state.location.longitude, locale, 5)}° ·{" "}
                    {knownElevation(state.location.elevation) !== null && (
                      <>
                        {message(locale, "plannerElevation")}{" "}
                        {decimal(state.location.elevation, locale, 0)} m ·{" "}
                      </>
                    )}
                    {state.location.timeZone}
                  </>
                </p>
              )}
              {activePlan && slotNotices[activePlan.id] && (
                <p
                  className="planner-night-slot-notice"
                  data-testid="night-slot-notice"
                  role="status"
                >
                  {message(locale, "tonightSlotFellBack")}
                </p>
              )}
              {selectedLocationCoordinates && nightSpanSky && (
                <NightSpanTimeline
                  locale={locale}
                  night={nightSpanSky}
                  hourly={nightSpanHourly}
                  forecastStatus={
                    forecastIsBeyondRange || !forecastIsRelevant
                      ? "beyond-range"
                      : forecast.status === "unavailable"
                        ? "unavailable"
                        : forecast.status === "ready"
                          ? "ready"
                          : "loading"
                  }
                  date={state.date}
                  darknessLabel={message(
                    locale,
                    darknessLabelKey(activeDarkness),
                  )}
                  editable={Boolean(activePlan) && activePlanEditable}
                  utcOffsetMinutes={zoneOffsetMinutes(
                    nightSpanSky.scaleStart,
                    validTimeZone(state.location.timeZone),
                  )}
                  clock={(value) =>
                    value ? time(value, locale, state.location.timeZone) : "—"
                  }
                  shortClock={(value) =>
                    value
                      ? new Intl.DateTimeFormat("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hourCycle: "h23",
                          timeZone: validTimeZone(state.location.timeZone),
                        }).format(new Date(value))
                      : "—"
                  }
                  onChange={chooseNightSpan}
                />
              )}
              {activePlan && (
                <section
                  className="planner-flow-stage planner-shared-forecast"
                  aria-labelledby="planner-shared-forecast-title"
                >
                  <header className="planner-shared-forecast-heading">
                    <h2 id="planner-shared-forecast-title">
                      {flow(locale, "forecast")}
                    </h2>
                    <span>{nightDateLabel(state.date, locale)}</span>
                  </header>
                  {night ? (
                    <>
                      {/* The plan's night told by « Cette nuit »'s parts —
                          the card « Note de la nuit » (its states, its
                          filigree, its sheet), the forecast's warnings in
                          one line under it, the night in one line and the
                          four tiles, the hourly strip with each hour's
                          score, the two sky cards with their dialogs; the
                          sources last. */}
                      {plannerNight.overview.state === "ready" && (
                        <div className="planner-night-detail">
                          <VerdictSection
                            words={plannerNight.words}
                            locale={locale}
                            onRetry={() =>
                              setForecastRetry((value) => value + 1)
                            }
                          />
                          {forecastIsTrend && forecast.value && (
                            <p
                              className="planner-weather-trend"
                              role="status"
                              data-testid="planner-forecast-trend"
                            >
                              {message(locale, "conditionsTrendNotice")}
                            </p>
                          )}
                          {forecast.value?.fallback && (
                            <p
                              className="planner-weather-fallback"
                              role="status"
                            >
                              <span aria-hidden="true">↪</span>
                              {message(locale, "plannerForecastFallbackActive")}
                            </p>
                          )}
                          {forecast.value?.stale && (
                            <p className="planner-weather-stale" role="status">
                              {flow(locale, "weatherStale").replace(
                                "{time}",
                                time(
                                  forecast.value.fetchedAt,
                                  locale,
                                  state.location.timeZone,
                                ),
                              )}
                            </p>
                          )}
                          {forecast.status === "unavailable" &&
                            forecast.error === "rate_limit" && (
                              <p
                                className="planner-weather-stale"
                                role="status"
                              >
                                {flow(locale, "weatherRateLimited")}
                              </p>
                            )}
                          <NightZone
                            words={plannerNight.words}
                            overview={plannerNight.overview}
                            timeline={false}
                          >
                            {plannerNight.hourly.length ? (
                              <HourlyForecast
                                className="tonight-card tonight-hourly"
                                forecast={{
                                  hourly: plannerNight.hourly,
                                  fetchedAt: forecast.value?.fetchedAt,
                                }}
                                locale={locale}
                                night={night}
                                onRefresh={() =>
                                  setForecastRetry((value) => value + 1)
                                }
                                refreshing={forecast.status === "loading"}
                                timeZone={state.location.timeZone}
                                title={message(
                                  locale,
                                  "tonightHourlyForecastTitle",
                                )}
                                hourScores
                              />
                            ) : null}
                          </NightZone>
                          <SkyQualityCards
                            locale={locale}
                            sky={plannerSkyBrightness}
                            words={plannerNight.words.skyQuality}
                          />
                        </div>
                      )}
                      {/* A collapsible disclosure instead of a standing
                      footer -- the source list is credits, not something
                      most observers need open by default. */}
                      <details className="planner-forecast-sources">
                        <summary>
                          {message(locale, "plannerForecastSources")}
                        </summary>
                        <p>
                          <a
                            href="https://github.com/cosinekitty/astronomy"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Astronomy Engine
                          </a>
                          <span aria-hidden="true">·</span>
                          <a
                            href="https://open-meteo.com/"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open-Meteo
                          </a>
                          <span aria-hidden="true">·</span>
                          <a
                            href="https://docs.api.met.no/doc/License.html"
                            target="_blank"
                            rel="noreferrer"
                            title={message(locale, "plannerMetNorwayCredit")}
                          >
                            MET Norway
                          </a>
                          <small>
                            {message(locale, "plannerMetNorwayCredit")}
                          </small>
                          <span aria-hidden="true">·</span>
                          <a
                            href="https://eogdata.mines.edu/products/vnl/"
                            target="_blank"
                            rel="noreferrer"
                            title={message(locale, "eogVnlCredit")}
                          >
                            VIIRS Nighttime Lights
                          </a>
                          <small>{message(locale, "eogVnlCredit")}</small>
                          <span aria-hidden="true">·</span>
                          <small>
                            {message(locale, "skyQualityCalibrationCredit")}
                          </small>
                        </p>
                      </details>
                    </>
                  ) : (
                    <p className="planner-empty-copy">
                      {flow(locale, "noPlace")}
                    </p>
                  )}
                </section>
              )}
            </details>
            <div
              className="planner-night-tabs-heading"
              ref={planTabsHeadingRef}
            >
              <div>
                <h2>{flow(locale, "plans")}</h2>
                {/* The line « Chaque montage… » and its ⓘ are gone: they
                  said the same thing twice. */}
              </div>
              <div className="planner-night-tabs-heading-actions">
                <p
                  className={`planner-sync-status is-${syncStatus}`}
                  role="status"
                >
                  {/* The line is a button (44 px high) that opens the
                    detail: what waits, the last attempt, the reason of a
                    failure, « Réessayer maintenant » and the ⓘ. */}
                  <button
                    type="button"
                    className="planner-sync-status-open"
                    data-testid="planner-sync-status-open"
                    aria-haspopup="dialog"
                    aria-label={`${message(
                      locale,
                      `plannerSync${syncStatus[0].toUpperCase()}${syncStatus.slice(1)}`,
                    )}. ${message(locale, "plannerSyncDetailOpen")}`}
                    onClick={() => setSyncDetailOpen(true)}
                  >
                    <PlannerSyncIcon status={syncStatus} />
                    {message(
                      locale,
                      `plannerSync${syncStatus[0].toUpperCase()}${syncStatus.slice(1)}`,
                    )}
                  </button>
                </p>
                {syncDetailOpen && (
                  <SyncStatusDialog
                    locale={locale}
                    status={syncStatus}
                    edits={Boolean(spaceRecordRef.current?.dirty)}
                    browserPlans={
                      Object.values(spaceRecordRef.current?.held || {}).filter(
                        (reason) => reason === "waiting",
                      ).length
                    }
                    attempt={syncAttempt}
                    online={
                      typeof navigator === "undefined" ||
                      navigator.onLine !== false
                    }
                    retrying={syncRetrying}
                    signedIn={Boolean(auth.authenticated)}
                    onRetry={retrySynchronization}
                    onClose={() => setSyncDetailOpen(false)}
                  />
                )}
                {saving && (
                  <p className="planner-save-status" role="status">
                    <span className="planner-save-spinner" aria-hidden="true" />
                    {message(locale, "plannerSaving")}
                  </p>
                )}
              </div>
            </div>
            {/* A night with no plan has one way to make one, the labelled
                button of the empty card below; the strip of tabs and its
                « ＋ » only appear with a first plan. */}
            {nightConflict && (
              <NightPlaceBand
                locale={locale}
                conflict={nightConflict}
                plans={state.plans}
                onChoose={chooseNightPlace}
              />
            )}
            {tabPlans.length > 0 && !nightConflict && (
              <div className="planner-night-tabs-row">
                <div
                  className="planner-night-tabs"
                  role="tablist"
                  aria-label={flow(locale, "plans")}
                  onKeyDown={handlePlanTabKey}
                >
                  {tabPlans.map((plan) => (
                    <button
                      type="button"
                      role="tab"
                      id={`planner-tab-${plan.id}`}
                      aria-controls="planner-night-panel"
                      aria-selected={plan.id === activePlan?.id}
                      tabIndex={plan.id === activePlan?.id ? 0 : -1}
                      className={plan.id === activePlan?.id ? "is-active" : ""}
                      key={plan.id}
                      onClick={() => selectPlan(plan.id)}
                    >
                      <span
                        className="planner-tab-mode"
                        aria-label={message(
                          locale,
                          plan.equipment?.mode === "visual"
                            ? "plannerVisual"
                            : "plannerImaging",
                        )}
                      >
                        <ObservationModeIcon
                          mode={
                            plan.equipment?.mode === "visual"
                              ? "visual"
                              : "imaging"
                          }
                        />
                      </span>
                      <span>
                        {plan.name
                          ? localizedPlanName(locale, plan.name, plan.date)
                          : message(locale, "plannerUntitledPlan")}
                      </span>
                      <output>
                        {planTabCount(locale, planTargetCount(plan))}
                      </output>
                      {planStatus(plan) !== "pending" && (
                        <PlannerPlanStatus
                          locale={locale}
                          status={planStatus(plan)}
                        />
                      )}
                      {planExecutionOf(executionByPlanId, plan) && (
                        <span
                          className="planner-plan-status is-planned is-executing"
                          data-plan-execution={
                            planExecutionOf(executionByPlanId, plan).state
                          }
                        >
                          {message(
                            locale,
                            planExecutionOf(executionByPlanId, plan).state ===
                              "paused"
                              ? "debriefStatusPaused"
                              : "planExecutionRunning",
                          )}
                        </span>
                      )}
                      {isBrowserPlan(plan) && (
                        <span className="planner-plan-status is-unsynced">
                          {browserCopy.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {/* Place 1 (`AdvancedBadge` § 7): the night already has a
                  plan and « Planification avancée » is not there; the chip
                  says why the « + » leads to the offers. */}
                {!gates.planCreation.allowed &&
                  (gates.planCreation.refusal === "planLimit" ||
                    gates.planCreation.refusal === "planLimitLocal") && (
                    <span className="locked-chip-slot">
                      <LockedChip locale={locale} feature="multiple" />
                    </span>
                  )}
                <button
                  className="planner-add-plan-tab"
                  type="button"
                  onClick={requestNewPlan}
                  disabled={!canCreatePlanNow}
                  aria-label={message(locale, "plannerAddPlan")}
                  title={message(locale, "plannerAddPlan")}
                >
                  <span aria-hidden="true">＋</span>
                  <span className="planner-add-plan-label">
                    {message(locale, "plannerAddPlan")}
                  </span>
                </button>
              </div>
            )}
            {plansForDate
              .filter((plan) => divergentPlanIds.includes(plan.id))
              .map((plan) => (
                <div
                  className="planner-merge-trigger"
                  role="status"
                  key={plan.id}
                >
                  <span>
                    {message(locale, "planMergeDivergenceBanner").replace(
                      "{name}",
                      plan.name || message(locale, "plannerUntitledPlan"),
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn-tertiary"
                    onClick={() => {
                      selectPlan(plan.id);
                      setMergeCompareVersion(null);
                      setMergePlanId(plan.id);
                    }}
                  >
                    {message(locale, "planMergeCompareAction")}
                  </button>
                </div>
              ))}
            {activePlan && isBrowserPlan(activePlan) && (
              <div
                className="planner-merge-trigger planner-browser-plan-notice"
                role="status"
              >
                <span>
                  {activePlan.notSynced === "limit"
                    ? browserCopy.held
                    : browserCopy.waiting}
                </span>
                {activePlan.notSynced === "limit" ? (
                  offers && (
                    <a
                      className="btn-link"
                      href={offers.href({ locale, signedIn: true })}
                    >
                      {browserCopy.seeOffers}
                    </a>
                  )
                ) : (
                  <button
                    className="btn-link"
                    type="button"
                    onClick={retryBrowserPlans}
                  >
                    {browserCopy.retry}
                  </button>
                )}
              </div>
            )}
            <div
              id="planner-night-panel"
              className={activePlan ? "has-timeline-column" : undefined}
              data-night-place-held={nightConflict ? "" : undefined}
              inert={nightConflict ? true : undefined}
              role="tabpanel"
              aria-labelledby={
                activePlan ? `planner-tab-${activePlan.id}` : undefined
              }
            >
              {!activePlan && night && !nightConflict && (
                <section className="planner-plan-prerequisite" role="status">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 3.5v3M18 3.5v3M4 9h16" />
                    <rect x="3" y="5.5" width="18" height="15" rx="2" />
                    <path d="M12 12.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z" />
                    <path d="M12 10.6v1.6M12 17.4V19M8.6 14.8h.8M14.6 14.8h.8" />
                  </svg>
                  <div>
                    <strong>{flow(locale, "noPlans")}</strong>
                    {plansForDate.length > 0 && (
                      <p>{message(locale, "plannerNightPlansElsewhere")}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary planner-plan-empty-add"
                    onClick={requestNewPlan}
                    disabled={!canCreatePlanNow}
                  >
                    <span aria-hidden="true">＋</span>{" "}
                    {message(locale, "plannerAddPlan")}
                  </button>
                </section>
              )}
              {activePlan &&
                (() => {
                  const plan = activePlan,
                    isEditingName = planNameEdit?.id === plan.id;
                  return (
                    <div className="planner-plan-toolbar">
                      {" "}
                      <div className="planner-plan-card-heading">
                        <div className="planner-plan-title">
                          {isEditingName ? (
                            <div className="planner-plan-name-editor">
                              <input
                                aria-label={message(locale, "plannerPlanName")}
                                autoFocus
                                value={planNameEdit.value}
                                onChange={(event) =>
                                  setPlanNameEdit((current) => ({
                                    ...current,
                                    value: event.target.value,
                                  }))
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    confirmPlanNameEdit();
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelPlanNameEdit();
                                  }
                                }}
                              />
                              <button
                                className="planner-plan-name-cancel"
                                type="button"
                                onClick={cancelPlanNameEdit}
                                aria-label={message(locale, "plannerCancel")}
                                title={message(locale, "plannerCancel")}
                              >
                                ×
                              </button>
                              <button
                                className="planner-plan-name-confirm"
                                type="button"
                                onClick={confirmPlanNameEdit}
                                aria-label={message(locale, "plannerConfirm")}
                                title={message(locale, "plannerConfirm")}
                              >
                                ✓
                              </button>
                              <small>{dateLabel(plan.date, locale)}</small>
                            </div>
                          ) : (
                            <>
                              <div className="planner-plan-title-row">
                                <button
                                  className="planner-plan-select"
                                  type="button"
                                  onClick={() => selectPlan(plan.id)}
                                >
                                  <span>
                                    {plan.name ||
                                      message(locale, "plannerUntitledPlan")}
                                  </span>
                                </button>
                                {planStatus(plan) === "pending" && (
                                  <>
                                    {!activePlanExecution && (
                                      <button
                                        className="planner-plan-edit-name"
                                        type="button"
                                        onClick={() => beginPlanNameEdit(plan)}
                                        aria-label={message(
                                          locale,
                                          "plannerEditPlanName",
                                        )}
                                        title={message(
                                          locale,
                                          "plannerEditPlanName",
                                        )}
                                      >
                                        <svg
                                          viewBox="0 0 24 24"
                                          aria-hidden="true"
                                        >
                                          <path d="m4 16.5-.8 4.3 4.3-.8L19.3 8.2l-3.5-3.5L4 16.5Z" />
                                          <path d="m13.8 6.7 3.5 3.5" />
                                        </svg>
                                      </button>
                                    )}
                                    <button
                                      className="planner-plan-delete"
                                      type="button"
                                      onClick={() =>
                                        // The night runs on a phone: the
                                        // refusal is read in words, there is
                                        // nothing to confirm.
                                        activePlanExecution
                                          ? refuseRunningDeletion(plan)
                                          : setPlanDeleteConfirmation(plan)
                                      }
                                      aria-label={message(
                                        locale,
                                        "plannerDeletePlan",
                                      )}
                                      title={message(
                                        locale,
                                        "plannerDeletePlan",
                                      )}
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        aria-hidden="true"
                                      >
                                        <path d="M5 7h14M10 11v5M14 11v5M8 7l.8-3h6.4l.8 3M7 7l.8 13h8.4L17 7" />
                                      </svg>
                                    </button>
                                  </>
                                )}
                                {/* « Actions du plan », the multi-night plan's
                                  ways in from a plan -- the shell's menu, or
                                  the same entries held back. */}
                                {multiNightEntries !== "absent" &&
                                  planStatus(plan) === "pending" &&
                                  !activePlanExecution &&
                                  (multiNight === "open" ? (
                                    <projectsExtension.PlanMenu
                                      host={multiNightHost}
                                      plan={plan}
                                    />
                                  ) : (
                                    <PlanActionsMenu
                                      locale={locale}
                                      label={
                                        multiNightCoreCopy(locale).planActions
                                      }
                                      items={["turnInto", "attach"].map(
                                        (key) => ({
                                          key,
                                          label:
                                            multiNightCoreCopy(locale)[key],
                                          badge: multiNightBadge,
                                          onSelect: () =>
                                            enterMultiNight(() => {}),
                                        }),
                                      )}
                                    />
                                  ))}
                              </div>
                              <small className="planner-plan-date">
                                <span>{dateLabel(plan.date, locale)}</span>
                                {planStatus(plan) !== "pending" && (
                                  <PlannerPlanStatus
                                    locale={locale}
                                    status={planStatus(plan)}
                                  />
                                )}
                              </small>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              {activePlan &&
                (multiNight === "open" || multiNight === "heldBack") && (
                  <projectsExtension.PlanBand
                    host={multiNightHost}
                    plan={activePlan}
                  />
                )}
              {activePlanExecution ? (
                // "Nuit en cours" — the launched slots, read-only, and
                // where the night runs; no control below it is live.
                <div
                  className="planner-plan-readonly is-executing"
                  role="status"
                  data-testid="plan-executing-banner"
                >
                  <PlanExecutionCard
                    locale={locale}
                    plan={activePlan}
                    execution={activePlanExecution}
                    place={activePlan.location ?? null}
                    timeZone={activePlan.location?.timeZone}
                    clock={(iso) =>
                      placeClock(iso, locale, activePlan.location?.timeZone)
                    }
                  />
                </div>
              ) : (
                activePlanIsReadOnly && (
                  <p className="planner-plan-readonly" role="status">
                    {flow(locale, "readOnly")}
                  </p>
                )
              )}
              {activePlan?.migrationReview && (
                <p className="planner-plan-review" role="status">
                  {flow(locale, "review")}
                  <button
                    type="button"
                    className="btn-tertiary"
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        plans: current.plans.map((plan) =>
                          plan.id === current.activePlanId
                            ? { ...plan, migrationReview: false }
                            : plan,
                        ),
                      }))
                    }
                  >
                    {flow(locale, "reviewDone")}
                  </button>
                </p>
              )}
              {activePlan && (
                <>
                  <div
                    className="planner-plan-settings"
                    inert={activePlanIsReadOnly}
                  >
                    <details
                      className="planner-flow-stage planner-equipment-stage"
                      open={!planView.equipmentCollapsed}
                    >
                      <summary
                        onClick={(event) => {
                          event.preventDefault();
                          updatePlanView(
                            "equipmentCollapsed",
                            !planView.equipmentCollapsed,
                          );
                        }}
                      >
                        <h2 data-stage-crumb-step="2">
                          <span className="planner-step-number">2</span>
                          {flow(locale, "materialTitle")}
                        </h2>
                        <span>
                          {equipmentStageName(
                            equipment,
                            connectedTelescope,
                            plannerModifiers.find(
                              (profile) =>
                                profile.id === state.equipment.modifierId,
                            ),
                            visualMode,
                          )}
                        </span>
                      </summary>
                      <fieldset className="planner-setting-group planner-equipment-group planner-observation-mode-group">
                        <legend>
                          {message(locale, "plannerObservationMode")}
                        </legend>
                        <div className="planner-observation-mode" role="group">
                          <button
                            className={!visualMode ? "is-active" : ""}
                            type="button"
                            aria-pressed={!visualMode}
                            onClick={() => updateEquipment("mode", "imaging")}
                          >
                            <ObservationModeIcon mode="imaging" />
                            {message(locale, "plannerImaging")}
                          </button>
                          <button
                            className={visualMode ? "is-active" : ""}
                            type="button"
                            aria-pressed={visualMode}
                            onClick={() => updateEquipment("mode", "visual")}
                          >
                            <ObservationModeIcon mode="visual" />
                            {message(locale, "plannerVisual")}
                          </button>
                        </div>
                      </fieldset>
                      {guestWithPrivateInventory && (
                        <p
                          className="planner-equipment-login-notice"
                          role="status"
                        >
                          {message(locale, "plannerEquipmentLoginRequired")}
                        </p>
                      )}
                      <div className="planner-settings">
                        {" "}
                        <fieldset className="planner-setting-group planner-equipment-group">
                          <legend>{message(locale, "plannerTelescope")}</legend>
                          <EquipmentPicker
                            {...equipmentPickerProps(
                              "telescope",
                              state.equipment.telescopeId,
                            )}
                            onNoMatchChange={
                              equipmentNoMatchReporters.telescope
                            }
                            onChange={(value) =>
                              updateEquipment("telescopeId", value)
                            }
                          />
                          <p className="planner-equipment-readout">
                            {telescopeOpticsLine(locale, selectedTelescope)}
                          </p>
                          {/* A value the maker does not publish is an
                              estimate. */}
                          {selectedTelescope &&
                            equipmentProfileIsEstimated(selectedTelescope) && (
                              <p
                                className="planner-equipment-readout"
                                data-equipment-estimated="true"
                              >
                                {message(
                                  locale,
                                  "equipmentEstimatedValuesNote",
                                )}
                              </p>
                            )}
                        </fieldset>
                        {visualMode ? (
                          <fieldset className="planner-setting-group planner-equipment-group">
                            <legend>
                              {message(locale, "plannerEyepiece")}
                            </legend>
                            <EquipmentPicker
                              {...equipmentPickerProps(
                                "eyepiece",
                                state.equipment.eyepieceId,
                              )}
                              onNoMatchChange={
                                equipmentNoMatchReporters.eyepiece
                              }
                              onChange={selectEyepiece}
                            />
                            {eyepieceContext.visual &&
                              !eyepieceContext.setting && (
                                <p
                                  className="planner-equipment-readout"
                                  data-eyepiece-incomplete="true"
                                >
                                  {message(locale, "planThumbnailIncomplete")}
                                </p>
                              )}
                            <>
                              {hasVariableEyepieceFocalLength && (
                                <label className="planner-eyepiece-zoom">
                                  <span className="planner-eyepiece-zoom-label">
                                    {message(
                                      locale,
                                      "plannerEyepieceFocalLength",
                                    )}{" "}
                                    · {decimal(eyepieceZoomMinimum, locale, 1)}–
                                    {decimal(eyepieceZoomMaximum, locale, 1)} mm
                                  </span>
                                  <span className="planner-eyepiece-zoom-control">
                                    <input
                                      type="range"
                                      min={eyepieceZoomMinimum}
                                      max={eyepieceZoomMaximum}
                                      step="0.5"
                                      value={displayedEyepieceFocalLength}
                                      onInput={(event) =>
                                        updateEyepieceFocalLengthDraft(
                                          Number(event.currentTarget.value),
                                        )
                                      }
                                      onPointerUp={commitEyepieceFocalLength}
                                      onBlur={commitEyepieceFocalLength}
                                      onKeyUp={(event) => {
                                        if (
                                          [
                                            "ArrowDown",
                                            "ArrowLeft",
                                            "ArrowRight",
                                            "ArrowUp",
                                            "End",
                                            "Home",
                                            "PageDown",
                                            "PageUp",
                                          ].includes(event.key)
                                        )
                                          commitEyepieceFocalLength();
                                      }}
                                    />
                                    <output>
                                      {decimal(
                                        displayedEyepieceFocalLength,
                                        locale,
                                        1,
                                      )}{" "}
                                      mm
                                    </output>
                                  </span>
                                </label>
                              )}
                              <p className="planner-equipment-readout">
                                {decimal(equipment.magnification, locale, 0)}× ·{" "}
                                {decimal(equipment.exitPupilMm, locale, 1)} mm ·{" "}
                                {decimal(
                                  equipment.visualFieldDiameterDegrees,
                                  locale,
                                  2,
                                )}
                                °
                              </p>
                              {magnificationAdviceLine(
                                locale,
                                equipment.apertureMm,
                                equipment.magnification,
                              ) && (
                                <p
                                  className="planner-equipment-advice"
                                  role="note"
                                >
                                  {magnificationAdviceLine(
                                    locale,
                                    equipment.apertureMm,
                                    equipment.magnification,
                                  )}
                                </p>
                              )}
                            </>
                          </fieldset>
                        ) : connectedTelescope ? (
                          <fieldset className="planner-setting-group planner-equipment-group">
                            <legend>{message(locale, "plannerCamera")}</legend>
                            <label className="planner-equipment-choice">
                              <select
                                aria-label={message(locale, "plannerCamera")}
                                disabled
                                value="integrated"
                              >
                                <option value="integrated">
                                  {integratedCameraLine(
                                    locale,
                                    connectedTelescope,
                                  )}
                                </option>
                              </select>
                            </label>
                            <p className="planner-equipment-readout">
                              {integratedCameraNote(locale, connectedTelescope)}
                            </p>
                          </fieldset>
                        ) : (
                          <fieldset className="planner-setting-group planner-equipment-group">
                            <legend>{message(locale, "plannerCamera")}</legend>
                            <EquipmentPicker
                              {...equipmentPickerProps(
                                "camera",
                                state.equipment.cameraId,
                              )}
                              onNoMatchChange={equipmentNoMatchReporters.camera}
                              onChange={(value) =>
                                updateEquipment("cameraId", value)
                              }
                            />
                            <p className="planner-equipment-readout">
                              {selectedCamera
                                ? `${selectedCamera.sensorWidthMm} × ${selectedCamera.sensorHeightMm} mm`
                                : "—"}
                            </p>
                          </fieldset>
                        )}
                        {/* A smart
                            telescope's built-in mount, right under it with
                            its built-in camera. */}
                        {connectedTelescope && (
                          <fieldset className="planner-setting-group planner-equipment-group planner-mount-group">
                            <legend>{message(locale, "plannerMount")}</legend>
                            <label className="planner-equipment-choice">
                              <select
                                aria-label={message(locale, "plannerMount")}
                                disabled
                                value="integrated"
                              >
                                <option value="integrated">
                                  {integratedMountName(
                                    locale,
                                    connectedTelescope,
                                  )}
                                </option>
                              </select>
                            </label>
                          </fieldset>
                        )}
                        {/* Behind a smart telescope the reducer leaves the
                            sheet too, and the plan's modifier is not applied. */}
                        {!connectedTelescope && (
                          <fieldset className="planner-setting-group planner-equipment-group">
                            <legend>
                              {message(locale, "plannerOpticalModifier")}
                            </legend>
                            <EquipmentPicker
                              {...equipmentPickerProps(
                                "modifier",
                                state.equipment.modifierId,
                              )}
                              onNoMatchChange={
                                equipmentNoMatchReporters.modifier
                              }
                              onChange={(value) =>
                                updateEquipment("modifierId", value)
                              }
                            />
                            <p className="planner-equipment-readout">
                              {message(locale, "plannerEffectiveFocalLength")} ·{" "}
                              {effectiveFocalLengthText(
                                locale,
                                equipment.focalLengthMm,
                              )}
                            </p>
                          </fieldset>
                        )}
                        {/* The filters are a field that opens a dialog
                            of check boxes; the chosen ones are recalled as
                            tags under it. */}
                        <FiltersField
                          locale={locale}
                          define={defineEquipment}
                          groups={filterGroups}
                          selectedIds={selectedFilterIds}
                          labelOf={filterLabel}
                          ownOnly={filtersOwnOnly}
                          onApply={(ids) => updateEquipment("filterIds", ids)}
                        />
                        {/* A signed-in person's filters are the « Filtres »
                            of « Mon matériel » (the chips above); the
                            browser's list is a visitor's only. */}
                        {!auth.authenticated && (
                          <OwnedFilters
                            locale={locale}
                            filters={ownedFilters}
                            onAdd={(filter) =>
                              keepLocalFilters(
                                addOwnedFilter(
                                  localFiltersRef.current,
                                  filter,
                                  {
                                    now: Date.now(),
                                  },
                                ).filters,
                              )
                            }
                            onRename={(id, name) =>
                              keepLocalFilters(
                                renameOwnedFilter(
                                  localFiltersRef.current,
                                  id,
                                  name,
                                ),
                              )
                            }
                            onRemove={(id) =>
                              keepLocalFilters(
                                removeOwnedFilter(localFiltersRef.current, id),
                              )
                            }
                          />
                        )}
                        <FilterAdvice
                          locale={locale}
                          advice={filterAdvice}
                          tonight={darknessEffectIsTonight}
                          timeZone={state.location.timeZone}
                        />
                        {/* « Prise de vue par cible »: the pose, the gain and
                            the filter of the plan's targets by default, in photo
                            mode only. */}
                        <AcquisitionDefaultsBlock
                          locale={locale}
                          basis={acquisitionBasis}
                          editable={activePlanEditable}
                          onChange={(line) =>
                            writeAcquisitionDefaults(activePlan?.id, line)
                          }
                          onOpenDialog={openPlanAcquisition}
                        />
                        {/* The mount comes last, after the filters; its
                            wind tolerance is a row of stage 3. */}
                        {!connectedTelescope && mountChoicesShown && (
                          <fieldset className="planner-setting-group planner-equipment-group planner-mount-group">
                            <legend>{message(locale, "plannerMount")}</legend>
                            <EquipmentPicker
                              {...equipmentPickerProps(
                                "mount",
                                state.equipment.mountId ?? "none",
                              )}
                              onNoMatchChange={equipmentNoMatchReporters.mount}
                              onChange={(value) =>
                                updateEquipment("mountId", value)
                              }
                            />
                          </fieldset>
                        )}
                        {/* « Diffère de / Identique à ma configuration par
                            défaut » and its two links, for a person signed
                            in to a space (a visitor has none). */}
                        {auth.authenticated ? (
                          <DefaultConfigurationLine
                            locale={locale}
                            equipment={state.equipment}
                            configuration={defaultConfiguration}
                            smartTelescopeIds={plannerTelescopeOptions
                              .filter((profile) => profile.integratedCamera)
                              .map((profile) => profile.id)}
                            editable={activePlanEditable}
                            onRestore={restoreDefaultConfiguration}
                            onSaveAs={() => void saveAsDefaultConfiguration()}
                          />
                        ) : null}
                        {/* « Définir mon matériel », once under the last
                            field; a picker that finds nothing shows its own
                            meanwhile. */}
                        {defineEquipment && !equipmentSectionNoMatch ? (
                          <DefineEquipmentLink
                            locale={locale}
                            {...defineEquipment}
                          />
                        ) : null}
                        {/* « Gérer mon matériel », permanent, for a
                            person signed in to a space. */}
                        {auth.authenticated ? (
                          <EquipmentManageLink
                            locale={locale}
                            href={mySpaceEquipmentPath(locale)}
                          />
                        ) : null}
                      </div>
                    </details>
                    <details
                      className="planner-flow-stage planner-constraints-stage"
                      open={!planView.constraintsCollapsed}
                    >
                      <summary
                        onClick={(event) => {
                          event.preventDefault();
                          updatePlanView(
                            "constraintsCollapsed",
                            !planView.constraintsCollapsed,
                          );
                        }}
                      >
                        <h2 data-stage-crumb-step="3">
                          <span className="planner-step-number">3</span>
                          {flow(locale, "constraintsTitle")}
                        </h2>
                        <span className="planner-constraints-summary">
                          <span>
                            {message(locale, "plannerMinAltitude")} ≥{" "}
                            {state.minAltitude}° ·{" "}
                            {message(locale, "plannerMoonSeparation")} ≥{" "}
                            {state.moonSeparationMinimum}° ·{" "}
                            {
                              windSectionLabels({
                                locale,
                                tolerance: windShownTolerance,
                              }).summary
                            }
                          </span>
                          {advancedConstraintsActive && (
                            <AdvancedConstraintSummary
                              filterThresholdRange={
                                advancedFilterThresholdRange
                              }
                              locale={locale}
                              mountSafety={effectiveMountSafety}
                            />
                          )}
                        </span>
                      </summary>
                      <p
                        className="planner-horizon-constraint-info"
                        role="note"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="8.5" />
                          <path d="M12 10.5v5M12 7.2h.01" />
                        </svg>
                        <span>{flow(locale, "horizonConstraintInfo")}</span>
                      </p>
                      <div className="planner-setting-fields planner-constraint-fields">
                        {" "}
                        <label className="planner-altitude-field">
                          <span>{message(locale, "plannerMinAltitude")}</span>
                          <select
                            value={state.minAltitude}
                            onChange={(event) =>
                              update("minAltitude", Number(event.target.value))
                            }
                          >
                            {[20, 25, 30, 35, 40].map((value) => (
                              <option key={value} value={value}>
                                {value}°
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="planner-altitude-field planner-moon-separation-field">
                          <span>
                            {message(locale, "plannerMoonSeparation")}
                          </span>
                          <select
                            value={state.moonSeparationMinimum}
                            onChange={(event) =>
                              update(
                                "moonSeparationMinimum",
                                Number(event.target.value),
                              )
                            }
                          >
                            {[15, 20, 25, 30, 35, 40, 45].map((value) => (
                              <option key={value} value={value}>
                                {value}°
                              </option>
                            ))}
                          </select>
                          <small>
                            {message(locale, "plannerMoonSeparationHelp")}
                          </small>
                        </label>
                        {/* « Tolérance au vent » is read and set where it
                          acts, after the Moon separation (it left stage 2);
                          the row opens the dialog. */}
                        <WindToleranceRow
                          locale={locale}
                          tolerance={windShownTolerance}
                          mountName={windMountName}
                          assessment={windShownAssessment}
                          tonight={darknessEffectIsTonight}
                          timeZone={state.location.timeZone}
                          onOpen={() => setWindDialogOpen(true)}
                        />
                        <fieldset className="planner-setting-group planner-darkness-group">
                          <legend>
                            {message(locale, "plannerDarknessTitle")}
                          </legend>
                          <p className="planner-darkness-description">
                            {message(locale, "plannerDarknessDescription")}
                          </p>
                          <div
                            className="planner-darkness-options"
                            role="radiogroup"
                            aria-label={message(locale, "plannerDarknessTitle")}
                          >
                            {darknessChoices.map((choice) => (
                              <label
                                className={
                                  darknessPreference === choice.darkness
                                    ? "is-selected"
                                    : ""
                                }
                                key={choice.darkness}
                              >
                                <input
                                  type="radio"
                                  name="planner-darkness"
                                  value={choice.darkness}
                                  checked={
                                    darknessPreference === choice.darkness
                                  }
                                  onChange={() =>
                                    chooseDarkness(choice.darkness)
                                  }
                                />
                                <span>
                                  <strong>
                                    {message(locale, choice.label)}
                                  </strong>
                                  <span>
                                    {message(
                                      locale,
                                      "plannerDarknessSun",
                                    ).replace(
                                      "{altitude}",
                                      String(choice.altitude),
                                    )}
                                  </span>
                                  <small>{message(locale, choice.hint)}</small>
                                </span>
                              </label>
                            ))}
                          </div>
                          <section
                            className="planner-darkness-effect"
                            aria-labelledby="planner-darkness-effect-title"
                          >
                            <h3 id="planner-darkness-effect-title">
                              {message(
                                locale,
                                darknessEffectIsTonight
                                  ? "plannerDarknessEffectTonight"
                                  : "plannerDarknessEffectNight",
                              )}
                            </h3>
                            {darknessEffectRows ? (
                              <ul>
                                {darknessEffectRows.map((row) => (
                                  <li key={row.darkness}>
                                    <strong>
                                      {message(
                                        locale,
                                        darknessChoices.find(
                                          (choice) =>
                                            choice.darkness === row.darkness,
                                        ).short,
                                      )}
                                    </strong>
                                    <span>
                                      {durationText(row.minutes, locale)}
                                    </span>
                                    <span>
                                      {time(
                                        row.start,
                                        locale,
                                        state.location.timeZone,
                                      )}{" "}
                                      →{" "}
                                      {time(
                                        row.end,
                                        locale,
                                        state.location.timeZone,
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p>{message(locale, "plannerDarknessNoPlace")}</p>
                            )}
                          </section>
                          <small className="planner-darkness-note" role="note">
                            {message(locale, "plannerDarknessExecutedNote")}
                          </small>
                        </fieldset>
                      </div>
                      <details className="planner-advanced-constraints">
                        <summary>{flow(locale, "advanced")}</summary>{" "}
                        <section className="planner-mount-safety">
                          {/* The values used to
                        sit beside the enable switch, reading as if the switch
                        gated access to fields drawn above it. The values now
                        come first, full width and stacked, under their own
                        "Restriction values" heading; the switch and its help
                        text follow in their own "Apply restrictions" section,
                        which explains what the switch does with the values
                        above it instead of only gating them silently. */}
                          <div className="planner-mount-safety-values">
                            <strong>
                              {message(
                                locale,
                                "plannerMountRestrictionsValuesTitle",
                              )}
                            </strong>
                            <p>{message(locale, "plannerMountSafetyHelp")}</p>
                            <div className="planner-mount-safety-fields">
                              <label>
                                <span>
                                  {message(locale, "plannerMountZenith")}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max="30"
                                  step="1"
                                  value={
                                    state.mountSafety.zenithAvoidanceDegrees ||
                                    ""
                                  }
                                  onChange={(event) =>
                                    updateMountSafety(
                                      "zenithAvoidanceDegrees",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <label>
                                <span>
                                  {message(locale, "plannerMountCableStart")}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max="359"
                                  step="1"
                                  value={state.mountSafety.azimuthStart}
                                  onChange={(event) =>
                                    updateMountSafety(
                                      "azimuthStart",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <label>
                                <span>
                                  {message(locale, "plannerMountCableEnd")}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max="359"
                                  step="1"
                                  value={state.mountSafety.azimuthEnd}
                                  onChange={(event) =>
                                    updateMountSafety(
                                      "azimuthEnd",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                            </div>
                          </div>
                          {meridianCutOffered && (
                            <div
                              className="planner-meridian-cut"
                              data-planner-meridian-cut=""
                            >
                              <div className="planner-mount-safety-heading">
                                <strong>
                                  {message(locale, "constraintsMeridianTitle")}
                                </strong>
                                <label className="planner-toggle">
                                  <input
                                    type="checkbox"
                                    aria-label={message(
                                      locale,
                                      "constraintsMeridianTitle",
                                    )}
                                    data-planner-meridian-cut-switch=""
                                    checked={meridianCutOn}
                                    onChange={(event) =>
                                      updateMountSafety(
                                        "meridianCut",
                                        event.target.checked,
                                      )
                                    }
                                  />
                                </label>
                              </div>
                              <small className="planner-mount-safety-help">
                                {message(locale, "constraintsMeridianHelp")}
                              </small>
                              <label>
                                <span>
                                  {message(
                                    locale,
                                    "constraintsMeridianMinutes",
                                  )}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max="120"
                                  step="1"
                                  data-planner-meridian-limit=""
                                  value={
                                    meridianPlanLimit ??
                                    meridianMountLimit ??
                                    ""
                                  }
                                  onChange={(event) =>
                                    updateMountSafety(
                                      "meridianLimitMinutes",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <small className="planner-mount-safety-help">
                                {meridianMountLimit === null
                                  ? message(
                                      locale,
                                      "constraintsMeridianNoMountValue",
                                    ).replace("{mount}", planMount.name)
                                  : message(
                                      locale,
                                      "constraintsMeridianFromMount",
                                    ).replace("{mount}", planMount.name)}{" "}
                                {meridianMountLimit !== null &&
                                  meridianPlanLimit !== null &&
                                  meridianPlanLimit !== meridianMountLimit && (
                                    <button
                                      type="button"
                                      className="btn-link"
                                      data-planner-meridian-restore=""
                                      onClick={() =>
                                        updateMountSafety(
                                          "meridianLimitMinutes",
                                          "",
                                        )
                                      }
                                    >
                                      {message(
                                        locale,
                                        "constraintsMeridianRestore",
                                      ).replace(
                                        "{minutes}",
                                        meridianMountLimit,
                                      )}
                                    </button>
                                  )}
                              </small>
                            </div>
                          )}
                          <div className="planner-mount-safety-apply">
                            <div className="planner-mount-safety-heading">
                              <strong>
                                {message(locale, "plannerMountSafety")}
                              </strong>
                              <label className="planner-toggle">
                                <input
                                  type="checkbox"
                                  // The switch has the name of the heading
                                  // beside it.
                                  aria-label={message(
                                    locale,
                                    "plannerMountSafety",
                                  )}
                                  checked={mountSafetySwitchOn}
                                  disabled={!mountSafetyConfigured}
                                  onChange={(event) =>
                                    updateMountSafety(
                                      "enabled",
                                      event.target.checked,
                                    )
                                  }
                                />
                              </label>
                            </div>
                            <small className="planner-mount-safety-help">
                              {message(
                                locale,
                                mountSafetyConfigured
                                  ? "plannerMountSafetyEnable"
                                  : "plannerMountSafetyNeedsLimits",
                              )}
                            </small>
                          </div>
                        </section>
                        {plannerFilters.filter((profile) =>
                          selectedFilterIds.includes(profile.id),
                        ).length > 0 && (
                          <div className="planner-filter-moon-thresholds">
                            <strong>
                              {message(locale, "plannerMoonSeparationByFilter")}
                            </strong>
                            {plannerFilters
                              .filter((profile) =>
                                selectedFilterIds.includes(profile.id),
                              )
                              .map((profile) => (
                                <label key={profile.id}>
                                  <span title={profile.name}>
                                    {profile.name}
                                  </span>
                                  <select
                                    value={
                                      state.moonSeparationMinimumByFilter?.[
                                        profile.name
                                      ] ?? ""
                                    }
                                    onChange={(event) =>
                                      updateMoonFilterThreshold(
                                        profile.name,
                                        event.target.value,
                                      )
                                    }
                                  >
                                    <option value="">
                                      {message(
                                        locale,
                                        "plannerUseGlobalThreshold",
                                      )}{" "}
                                      ({state.moonSeparationMinimum}°)
                                    </option>
                                    {[15, 20, 25, 30, 35, 40, 45].map(
                                      (value) => (
                                        <option key={value} value={value}>
                                          {value}°
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>
                              ))}
                          </div>
                        )}
                      </details>
                    </details>
                  </div>
                  {night ? (
                    <>
                      {" "}
                      <section
                        className="planner-recommendations planner-flow-stage"
                        aria-labelledby="planner-target-step"
                      >
                        <div className="planner-section-heading">
                          <div>
                            <p className="eyebrow">
                              {message(locale, "plannerRecommendations")}
                            </p>
                            <h2
                              id="planner-target-step"
                              data-stage-crumb-step="4"
                            >
                              <span className="planner-step-number">4</span>
                              {flow(locale, "targets")}
                            </h2>
                            {/* The count of suitable targets opens the
                              stage that holds them -- « 48 cibles adaptées
                              à ce plan · … ». */}
                            <p
                              className="planner-eligibility-summary"
                              aria-live="polite"
                            >
                              <strong>
                                {`${sourceCards.length} ${flow(locale, "available")}${night.field ? " ·" : ""}`}
                              </strong>
                              {night.field && (
                                <span>
                                  {fieldLabel(night.field, locale)} ·{" "}
                                  {equipment.name}
                                </span>
                              )}
                            </p>
                            <p className="planner-active-target-context">
                              {activePlan?.name
                                ? localizedPlanName(
                                    locale,
                                    activePlan.name,
                                    activePlan.date,
                                  )
                                : message(locale, "plannerNoPlan")}{" "}
                              ·{" "}
                              {visualMode
                                ? message(locale, "plannerVisual")
                                : message(locale, "plannerImaging")}
                            </p>
                            {/* A secondary, full
                              width — the stage has no primary any more. */}
                            <button
                              type="button"
                              className="btn-secondary planner-suggest-entry"
                              disabled={!suggestAvailable}
                              onClick={openSuggestions}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
                              </svg>
                              {suggestMessage(locale, "suggestAction")}
                            </button>
                            {recommendationEquipmentSummary && (
                              <p className="planner-equipment-capability">
                                {recommendationEquipmentSummary}
                              </p>
                            )}
                          </div>
                          <div className="planner-recommendation-heading-actions">
                            <p>{recommendationHelp}</p>
                            <div
                              className={`planner-source-switch is-${recommendationSource}`}
                              role="tablist"
                              aria-label={message(
                                locale,
                                "plannerRecommendationSource",
                              )}
                            >
                              <button
                                className={
                                  recommendationSource === "catalogue"
                                    ? "is-active"
                                    : ""
                                }
                                type="button"
                                role="tab"
                                aria-selected={
                                  recommendationSource === "catalogue"
                                }
                                onClick={() =>
                                  selectRecommendationSource("catalogue")
                                }
                              >
                                {message(locale, "plannerCatalogues")}
                              </button>
                              <button
                                className={
                                  recommendationSource === "capture"
                                    ? "is-active"
                                    : ""
                                }
                                type="button"
                                role="tab"
                                aria-selected={
                                  recommendationSource === "capture"
                                }
                                onClick={() =>
                                  selectRecommendationSource("capture")
                                }
                              >
                                {message(locale, "plannerOwnCaptures")}
                              </button>
                              <button
                                className={
                                  recommendationSource === "plans"
                                    ? "is-active"
                                    : ""
                                }
                                type="button"
                                role="tab"
                                aria-selected={recommendationSource === "plans"}
                                onClick={() =>
                                  selectRecommendationSource("plans")
                                }
                              >
                                {message(locale, "plannerPlans")}
                              </button>
                              <button
                                className={
                                  recommendationSource === "framing"
                                    ? "is-active"
                                    : ""
                                }
                                type="button"
                                role="tab"
                                aria-selected={
                                  recommendationSource === "framing"
                                }
                                onClick={() =>
                                  selectRecommendationSource("framing")
                                }
                              >
                                {message(locale, "plannerFramings")}
                              </button>
                            </div>
                            {/* The catalogue's own options, for the
                              « Catalogues » source only; folded by
                              default, the fold kept in the plan's view. */}
                            {recommendationSource === "catalogue" && (
                              <details
                                className="planner-catalogue-options"
                                data-testid="planner-catalogue-options"
                                open={planView.catalogueOptionsOpen === true}
                              >
                                <summary
                                  onClick={(event) => {
                                    event.preventDefault();
                                    updatePlanView(
                                      "catalogueOptionsOpen",
                                      planView.catalogueOptionsOpen !== true,
                                    );
                                  }}
                                >
                                  <span className="planner-catalogue-options-text">
                                    <span className="planner-catalogue-options-title">
                                      {message(
                                        locale,
                                        "plannerCatalogueOptions",
                                      )}
                                    </span>
                                    {planView.catalogueOptionsOpen !== true && (
                                      <span className="planner-catalogue-options-summary">
                                        {catalogueOptionsSummary}
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className="planner-catalogue-options-chevron"
                                    role="img"
                                    aria-label={message(
                                      locale,
                                      planView.catalogueOptionsOpen === true
                                        ? "plannerCatalogueOptionsCollapse"
                                        : "plannerCatalogueOptionsExpand",
                                    )}
                                  >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="M6 9l6 6 6-6" />
                                    </svg>
                                  </span>
                                </summary>
                                {planView.catalogueOptionsOpen === true && (
                                  <div className="planner-catalogue-options-body">
                                    <fieldset className="planner-catalogue-selection-field">
                                      <legend>
                                        {message(
                                          locale,
                                          "plannerTargetCatalogueSelection",
                                        )}
                                      </legend>
                                      <div
                                        className="planner-catalogue-selection has-favorites"
                                        role="group"
                                        aria-label={message(
                                          locale,
                                          "plannerTargetCatalogueSelection",
                                        )}
                                      >
                                        {[
                                          [
                                            "all",
                                            "plannerTargetCatalogueAllTargets",
                                          ],
                                          [
                                            "best",
                                            "plannerTargetCatalogueEssential",
                                          ],
                                          [
                                            "extended",
                                            "plannerTargetCatalogueExtended",
                                          ],
                                          [
                                            "favorites",
                                            "plannerTargetCatalogueFavorites",
                                          ],
                                        ].map(([selection, label]) => (
                                          <button
                                            className={
                                              state.catalogueSelection ===
                                              selection
                                                ? "is-active"
                                                : ""
                                            }
                                            type="button"
                                            key={selection || "all"}
                                            aria-pressed={
                                              state.catalogueSelection ===
                                              selection
                                            }
                                            disabled={
                                              selection === "favorites" &&
                                              plannerFavoritesStatus !== "ready"
                                            }
                                            onClick={() =>
                                              updateCatalogueSelection(
                                                selection,
                                              )
                                            }
                                          >
                                            {message(locale, label)}
                                          </button>
                                        ))}
                                      </div>
                                    </fieldset>
                                    <fieldset className="planner-catalogue-selection-field planner-equipment-restriction">
                                      <legend>
                                        {message(
                                          locale,
                                          "plannerEquipmentRestriction",
                                        )}
                                      </legend>
                                      <div
                                        className="planner-catalogue-selection"
                                        role="group"
                                        aria-label={message(
                                          locale,
                                          "plannerEquipmentRestriction",
                                        )}
                                      >
                                        <button
                                          className={
                                            !state.equipment.restrictToEquipment
                                              ? "is-active"
                                              : ""
                                          }
                                          type="button"
                                          aria-pressed={
                                            !state.equipment.restrictToEquipment
                                          }
                                          onClick={() =>
                                            updateEquipment(
                                              "restrictToEquipment",
                                              false,
                                            )
                                          }
                                        >
                                          {message(
                                            locale,
                                            "plannerEquipmentRestrictionAll",
                                          )}
                                        </button>
                                        <button
                                          className={
                                            state.equipment.restrictToEquipment
                                              ? "is-active"
                                              : ""
                                          }
                                          type="button"
                                          aria-pressed={
                                            state.equipment.restrictToEquipment
                                          }
                                          onClick={() =>
                                            updateEquipment(
                                              "restrictToEquipment",
                                              true,
                                            )
                                          }
                                        >
                                          {message(
                                            locale,
                                            "plannerEquipmentRestrictionEnabled",
                                          )}
                                        </button>
                                      </div>
                                      <small>
                                        {message(
                                          locale,
                                          "plannerEquipmentRestrictionHelp",
                                        )}
                                      </small>
                                    </fieldset>
                                  </div>
                                )}
                              </details>
                            )}
                          </div>
                        </div>
                        <div className="planner-recommendation-filters">
                          <div className="planner-recommendation-primary-controls">
                            <label className="planner-recommendation-search">
                              <span>{message(locale, "searchTarget")}</span>
                              <input
                                type="search"
                                value={recommendationQuery}
                                onChange={(event) =>
                                  setRecommendationQuery(event.target.value)
                                }
                                placeholder={message(locale, "searchTarget")}
                              />
                            </label>
                            <label className="planner-recommendation-sort">
                              <span>{message(locale, "plannerSort")}</span>
                              <select
                                value={recommendationSort}
                                onChange={(event) =>
                                  setRecommendationSort(event.target.value)
                                }
                              >
                                <option value="altitude">
                                  {message(locale, "plannerSortAltitude")}
                                </option>
                                <option value="margin">
                                  {message(locale, "plannerSortMargin")}
                                </option>
                                <option value="window">
                                  {message(locale, "plannerSortWindow")}
                                </option>
                                <option value="early">
                                  {message(locale, "plannerSortEarly")}
                                </option>
                                <option value="score">
                                  {message(locale, "plannerSortScore")}
                                </option>
                              </select>
                            </label>
                          </div>

                          <div className="planner-recommendation-secondary-controls">
                            <label>
                              <span>
                                {message(locale, "plannerObjectType")}
                              </span>
                              <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                              >
                                <option value="">
                                  {message(locale, "plannerAll")} (
                                  {recommendationTotal})
                                </option>
                                {typeOptions.map(({ type, count }) => (
                                  <option key={type} value={type}>
                                    {type === "framing"
                                      ? message(locale, "plannerFraming")
                                      : taxonomyLabel(
                                          type,
                                          locale,
                                          plannerReferences.taxonomy,
                                        )}{" "}
                                    ({count})
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>{message(locale, "plannerCatalogue")}</span>
                              <select
                                value={catalogueFilter}
                                onChange={(e) =>
                                  setCatalogueFilter(e.target.value)
                                }
                              >
                                <option value="">
                                  {message(locale, "plannerAll")} (
                                  {recommendationTotal})
                                </option>
                                {catalogueOptions.map(
                                  ({ catalogue, count }) => (
                                    <option key={catalogue} value={catalogue}>
                                      {targetCatalogueLabel(catalogue, locale)}{" "}
                                      ({count})
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                          </div>
                          {recommendationSource === "plans" && (
                            <div>
                              <span>{message(locale, "plannerPlans")}</span>
                              <div className="planner-filter-chips">
                                <button
                                  className={
                                    !activePlanFilter ? "is-active" : ""
                                  }
                                  type="button"
                                  onClick={() => setPlanFilter("")}
                                >
                                  {message(locale, "plannerAll")}
                                  <output>{recommendationTotal}</output>
                                </button>
                                {plansForDate.map((plan) => {
                                  const counts = planFilterCounts.find(
                                    (entry) => entry.id === plan.id,
                                  );
                                  const label =
                                    plan.title ||
                                    plan.name ||
                                    message(locale, "plannerPlans");
                                  return (
                                    <button
                                      className={
                                        activePlanFilter === plan.id
                                          ? "is-active"
                                          : ""
                                      }
                                      type="button"
                                      key={plan.id}
                                      onClick={() =>
                                        setPlanFilter((current) =>
                                          current === plan.id ? "" : plan.id,
                                        )
                                      }
                                    >
                                      {label}
                                      <output>
                                        {planFilterHasTopFilters
                                          ? `${counts?.visible || 0}/${counts?.total || 0}`
                                          : counts?.total || 0}
                                      </output>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="planner-target-view-toolbar">
                          <div
                            className="planner-target-view-switch"
                            role="group"
                            aria-label={flow(locale, "targets")}
                          >
                            <button
                              type="button"
                              aria-pressed={targetView === "list"}
                              className={
                                targetView === "list" ? "is-active" : ""
                              }
                              onClick={() => setTargetView("list")}
                            >
                              <TargetViewIcon view="list" />
                              {flow(locale, "list")}
                            </button>
                            <button
                              type="button"
                              aria-pressed={targetView === "map"}
                              className={
                                targetView === "map" ? "is-active" : ""
                              }
                              onClick={() => setTargetView("map")}
                            >
                              <TargetViewIcon view="map" />
                              {flow(locale, "map")}
                            </button>
                          </div>
                          <output
                            className="planner-recommendation-count"
                            aria-label={message(
                              locale,
                              "plannerVisibleTargets",
                            )}
                          >
                            {recommendedCards.length} / {recommendationTotal}
                          </output>
                        </div>
                        {addNotice &&
                          typeof document !== "undefined" &&
                          createPortal(
                            <aside
                              className="planner-add-notice planner-target-added-notice"
                              key={addNotice.id}
                              role="status"
                              aria-live="polite"
                            >
                              <span
                                className="planner-add-notice-icon"
                                aria-hidden="true"
                              >
                                <svg viewBox="0 0 24 24">
                                  <path d="m5 12.5 4.2 4.2L19 7" />
                                </svg>
                              </span>
                              <span>{addNotice.text}</span>
                              <button
                                type="button"
                                className="btn-link"
                                onClick={() => {
                                  setAddNotice(null);
                                  revealPlanTimeline(
                                    activePlan?.id,
                                    addNotice.itemId,
                                  );
                                }}
                              >
                                {flow(locale, "showSchedule")}
                              </button>
                            </aside>,
                            document.body,
                          )}
                        <section
                          className="planner-sky-map-section"
                          hidden={targetView !== "map"}
                        >
                          <div className="planner-sky-map-heading">
                            <p className="eyebrow planner-recommendation-subsection">
                              {message(locale, "plannerSkyMap")}
                            </p>
                          </div>
                          {skyMapView === "realistic" && (
                            <MapControlsRow>{skyMapViewChip}</MapControlsRow>
                          )}
                          {(mapHasOpened || targetView === "map") &&
                            (skyMapView === "realistic" ? (
                              <PlannerNightSkyMap
                                addDisabledReason={addDisabledReason}
                                cards={recommendedCards}
                                visualMode={visualMode}
                                // The naming/matching pool is the full compact
                                // catalogue already loaded by the page, not the
                                // night's own cards (which a source/type/visibility
                                // filter can thin out) -- "en se basant sur le
                                // catalogue complet".
                                framingTargets={fullCatalogueFramingTargets}
                                savedFramingTargets={
                                  recommendationSource === "framing"
                                    ? savedFramingTargets
                                    : []
                                }
                                locale={locale}
                                location={state.location}
                                night={night}
                                field={night?.field}
                                // The light-pollution estimate the "Astronomical
                                // forecast" section already shows for this place,
                                // so the map's own star field is the sky the
                                // observer is standing under rather than a fixed
                                // class 4. The map falls back to 4 while the
                                // estimate is loading or unavailable.
                                placeBortleClass={
                                  skyQuality.status === "ready"
                                    ? (skyQuality.value?.bortleClass ?? null)
                                    : null
                                }
                                equipmentLabel={[
                                  selectedTelescope?.name,
                                  visualMode
                                    ? selectedEyepiece?.name
                                    : selectedCamera?.name,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                                equipmentControls={[
                                  {
                                    key: "telescope",
                                    icon: "telescope",
                                    label: message(locale, "plannerTelescope"),
                                    value: state.equipment.telescopeId,
                                    placeholder: message(
                                      locale,
                                      "plannerEquipmentChoose",
                                    ),
                                    options: plannerTelescopeOptions,
                                    picker: equipmentPickerProps(
                                      "telescope",
                                      state.equipment.telescopeId,
                                    ),
                                    onChange: (value) =>
                                      updateEquipment("telescopeId", value),
                                  },
                                  visualMode
                                    ? {
                                        key: "eyepiece",
                                        icon: "eyepiece",
                                        label: message(
                                          locale,
                                          "plannerEyepiece",
                                        ),
                                        value: state.equipment.eyepieceId,
                                        placeholder: message(
                                          locale,
                                          "plannerEquipmentChoose",
                                        ),
                                        options: plannerEyepieces,
                                        picker: equipmentPickerProps(
                                          "eyepiece",
                                          state.equipment.eyepieceId,
                                        ),
                                        onChange: selectEyepiece,
                                      }
                                    : {
                                        key: "camera",
                                        icon: "camera",
                                        label: message(locale, "plannerCamera"),
                                        value: state.equipment.cameraId,
                                        placeholder: message(
                                          locale,
                                          "plannerEquipmentChoose",
                                        ),
                                        options: plannerCameras,
                                        picker: equipmentPickerProps(
                                          "camera",
                                          state.equipment.cameraId,
                                        ),
                                        onChange: (value) =>
                                          updateEquipment("cameraId", value),
                                      },
                                  {
                                    key: "modifier",
                                    icon: "modifier",
                                    label: message(
                                      locale,
                                      "plannerOpticalModifier",
                                    ),
                                    value: state.equipment.modifierId,
                                    options: modifierChoices(
                                      locale,
                                      plannerModifiers,
                                    ),
                                    picker: equipmentPickerProps(
                                      "modifier",
                                      state.equipment.modifierId,
                                    ),
                                    onChange: (value) =>
                                      updateEquipment("modifierId", value),
                                  },
                                ]}
                                selectedIds={selectedIds}
                                canAdd={
                                  Boolean(activePlan) && activePlanEditable
                                }
                                editable={activePlanEditable}
                                onAdd={add}
                                onRemove={remove}
                                onUseFraming={openFraming}
                                frameSurface={liveFrameSurface}
                                onConfigureFrameSurface={() =>
                                  setFrameSurfaceSheetOpen(true)
                                }
                                selectedTargetId={mapSelectedTargetId}
                                onTargetSelect={setMapSelectedTargetId}
                                showSectionHeading={false}
                              />
                            ) : (
                              <>
                                <PlannerHorizonProjection
                                  viewChip={skyMapViewChip}
                                  controls={planView.horizon}
                                  onControlsChange={(patch) =>
                                    updatePlanView("horizon", {
                                      ...planView.horizon,
                                      ...patch,
                                    })
                                  }
                                  addDisabledReason={addDisabledReason}
                                  cards={recommendedCards}
                                  latitude={state.location.latitude}
                                  longitude={state.location.longitude}
                                  locale={locale}
                                  mask={activeHorizonMask}
                                  maskLabel={activeHorizonMaskLabel}
                                  minAltitude={Number(state.minAltitude)}
                                  mountSafety={effectiveMountSafety}
                                  timeZone={state.location.timeZone}
                                  canAdd={
                                    Boolean(activePlan) && activePlanEditable
                                  }
                                  editable={activePlanEditable}
                                  onAdd={add}
                                  onRemove={remove}
                                  onTargetSelect={setMapSelectedTargetId}
                                  selectedIds={selectedIds}
                                  selectedTargetId={mapSelectedTargetId}
                                  visualMode={visualMode}
                                  planCards={horizonPathCards}
                                  scores={tonightScores}
                                />
                              </>
                            ))}
                        </section>
                        <p
                          hidden={targetView !== "list"}
                          className="eyebrow planner-recommendation-subsection is-list"
                        >
                          {message(locale, "plannerList")}
                        </p>
                        <div
                          hidden={targetView !== "list"}
                          className="planner-target-list"
                          ref={recommendationListRef}
                          tabIndex={-1}
                        >
                          <RecommendationTargetList
                            addDisabledReason={addDisabledReason}
                            cards={recommendedCards}
                            locale={locale}
                            timeZone={state.location.timeZone}
                            field={night.field}
                            selectedIds={selectedIds}
                            canAdd={Boolean(activePlan) && activePlanEditable}
                            editable={activePlanEditable}
                            onAddCard={recommendationListActions.add}
                            onRemoveCard={recommendationListActions.remove}
                            onShowOnMap={recommendationListActions.selectMap}
                            onShowScore={recommendationListActions.showScore}
                            scores={tonightScores}
                            mapSelectedTargetId={mapSelectedTargetId}
                            visualMode={visualMode}
                          />
                          {!recommendedCards.length && (
                            <p className="planner-empty-copy">
                              {message(locale, "notFound")}
                            </p>
                          )}
                        </div>
                        {rawExclusions.length > 0 && (
                          <p className="planner-exclusion-summary">
                            {message(locale, "plannerExcludedSummary").replace(
                              "{items}",
                              [
                                moonExcludedCount > 0
                                  ? `${moonExcludedCount} ${message(locale, "plannerExcludedMoon")}`
                                  : null,
                                altitudeExcludedCount > 0
                                  ? `${altitudeExcludedCount} ${message(locale, "plannerExcludedAltitude")}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(
                                  message(locale, "plannerExcludedSeparator"),
                                ),
                            )}
                          </p>
                        )}
                      </section>
                    </>
                  ) : (
                    <section className="planner-flow-stage">
                      <h2>
                        <span className="planner-step-number">4</span>
                        {flow(locale, "targets")}
                      </h2>
                      <p>{flow(locale, "noPlace")}</p>
                    </section>
                  )}
                  <section
                    className="planner-flow-stage planner-schedule-stage"
                    aria-labelledby="planner-schedule-step"
                  >
                    <h2 id="planner-schedule-step" data-stage-crumb-step="5">
                      <span className="planner-step-number">5</span>
                      {flow(locale, "schedule")}
                    </h2>
                    {/* From 761 px the stage is a column beside the others,
                      headed by its actions — undo, redo, share, the
                      totals line and, after an add, the line that says where the
                      target landed. Below that width the stage stays as it was
                      (`portal.css`). */}
                    <div className="planner-timeline-column-header">
                      <div
                        className="planner-timeline-column-actions"
                        role="group"
                        aria-label={flow(locale, "schedule")}
                      >
                        <button
                          className="planner-plan-history"
                          type="button"
                          data-timeline-action="undo"
                          disabled={
                            planStatus(activePlan) !== "pending" ||
                            !planHistoryRef.current[activePlan.id]?.past.length
                          }
                          onClick={() => undoPlan(activePlan.id)}
                          aria-label={message(locale, "plannerUndo")}
                          title={message(locale, "plannerUndo")}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M9 13 5 9l4-4" />
                            <path d="M5 9h7a4 4 0 1 1 0 8h-1" />
                          </svg>
                        </button>
                        <button
                          className="planner-plan-history"
                          type="button"
                          data-timeline-action="redo"
                          disabled={
                            planStatus(activePlan) !== "pending" ||
                            !planHistoryRef.current[activePlan.id]?.future
                              .length
                          }
                          onClick={() => redoPlan(activePlan.id)}
                          aria-label={message(locale, "plannerRedo")}
                          title={message(locale, "plannerRedo")}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M15 13l4-4-4-4" />
                            <path d="M19 9h-7a4 4 0 1 0 0 8h1" />
                          </svg>
                        </button>
                        <button
                          className="planner-plan-history"
                          type="button"
                          data-timeline-action="share"
                          onClick={() => setExportPlanId(activePlan.id)}
                          aria-label={message(locale, "plannerTimelineShare")}
                          title={message(locale, "plannerTimelineShare")}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 15V4" />
                            <path d="m8 8 4-4 4 4" />
                            <path d="M6 12v7h12v-7" />
                          </svg>
                        </button>
                      </div>
                      {addNotice?.placement &&
                        activePlan.items.some(
                          (item) => item.id === addNotice.itemId,
                        ) && (
                          <p
                            className="planner-timeline-add-line"
                            role="status"
                          >
                            {timelineAddLine(locale, addNotice.placement)}
                          </p>
                        )}
                      <div className="planner-timeline-totals-row">
                        <p className="planner-timeline-totals">
                          {timelineTotalsLine(
                            locale,
                            timelineTotals({
                              cards: activePlanCards,
                              items: activePlan.items,
                              night,
                            }),
                          )}
                        </p>
                        {activePlan.items.length > 0 && (
                          <ScheduleDisplaySwitch
                            locale={locale}
                            value={scheduleDisplay}
                            onChange={setScheduleDisplay}
                          />
                        )}
                      </div>
                      {(() => {
                        // The line of the timeline counts the overlaps; under
                        // it, the notice: the count with its pairs folded,
                        // "Répartir les cibles", "Modifier le plan" and
                        // "Valider sans pouvoir lancer".
                        const overlaps = night
                          ? planItemOverlaps(activePlan.items)
                          : [];
                        if (!overlaps.length) return null;
                        const keptKey = `${activePlan.id}|${overlaps
                          .map(
                            (overlap) =>
                              `${overlap.firstId}:${overlap.secondId}`,
                          )
                          .join(",")}`;
                        if (keptOverlaps.has(keptKey)) return null;
                        const nameOf = (id) => {
                          const item = activePlan.items.find(
                            (candidate) => String(candidate.id) === id,
                          );
                          return item?.target
                            ? plannerTimelineLabel(item.target)
                            : id;
                        };
                        const clock = (minute) =>
                          time(
                            new Date(
                              new Date(night.start).getTime() + minute * 60000,
                            ),
                            locale,
                            state.location.timeZone,
                          );
                        return (
                          <PlanOverlapNotice
                            locale={locale}
                            overlaps={overlaps}
                            nameOf={nameOf}
                            clock={clock}
                            editable={activePlanEditable}
                            canSpread={Boolean(overlapSpread?.slots.length)}
                            onSpread={spreadActivePlan}
                            onEdit={() =>
                              revealPlanTimeline(
                                activePlan.id,
                                overlaps[0].firstId,
                              )
                            }
                            onKeep={() =>
                              setKeptOverlaps((current) =>
                                new Set(current).add(keptKey),
                              )
                            }
                          />
                        );
                      })()}
                    </div>
                    {activePlan?.locationReview && (
                      <div className="planner-location-review" role="status">
                        <p>
                          {flow(locale, "review")}{" "}
                          {message(
                            locale,
                            locationReviewCauseKey(
                              activePlan.locationReviewReason,
                            ),
                          )}
                        </p>
                        <button
                          className="planner-location-review-close"
                          type="button"
                          aria-label={flow(locale, "close")}
                          title={flow(locale, "close")}
                          disabled={!activePlanEditable}
                          onClick={dismissLocationReview}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    {exportStatus && (
                      <p className="planner-export-status" role="status">
                        {exportStatus}
                      </p>
                    )}
                    {activePlan?.items.some(
                      (item) =>
                        !activePlanCards.some(
                          (card) => card.target.id === item.id,
                        ),
                    ) && (
                      <p className="planner-plan-review" role="status">
                        {flow(locale, "unresolvedTargets")}
                        {" : "}
                        {activePlan.items
                          .filter(
                            (item) =>
                              !activePlanCards.some(
                                (card) => card.target.id === item.id,
                              ),
                          )
                          .map(
                            (item) =>
                              item.target?.title ||
                              item.target?.source ||
                              item.id,
                          )
                          .join(", ")}
                      </p>
                    )}
                    {activePlan && night ? (
                      <>
                        {activePlanCards.some(
                          (card) => card.reviewReasons?.length,
                        ) && (
                          <p className="planner-plan-review">
                            {flow(locale, "review")}{" "}
                            {activePlanCards
                              .filter((card) => card.reviewReasons?.length)
                              .map(
                                (card) =>
                                  `${plannerTimelineLabel(card.target)} (${card.reviewReasons.map((reason) => flow(locale, `review_${reason}`)).join(", ")})`,
                              )
                              .join(", ")}
                          </p>
                        )}
                        <div
                          ref={(element) => {
                            if (element)
                              planTimelineRefs.current.set(
                                activePlan.id,
                                element,
                              );
                            else if (activePlan)
                              planTimelineRefs.current.delete(activePlan.id);
                          }}
                        >
                          <PlanSchedule
                            key={activePlan.id}
                            cards={activePlanCards}
                            darkness={activeDarkness}
                            nightSpan={activeNightSpan}
                            display={scheduleDisplay}
                            editingId={editingItemId}
                            highlightedId={highlightedScheduleItemId}
                            items={activePlan.items}
                            locale={locale}
                            night={night}
                            onEdit={setEditingItemId}
                            onWindowEditStart={(itemId, session) =>
                              rememberScheduleRetouch(activePlan.id, session)
                            }
                            onRemove={remove}
                            onScrollToRecommendations={scrollToRecommendations}
                            readOnly={!activePlanEditable}
                            onWindowChange={updateItem}
                            timeZone={state.location.timeZone}
                            visualMode={visualMode}
                            framingResourcesById={framingResourcesById}
                            planEquipment={state.equipment}
                            meridianCutContext={{
                              mount:
                                state.equipment.mountId &&
                                state.equipment.mountId !== "none"
                                  ? plannerMounts.find(
                                      (profile) =>
                                        profile.id === state.equipment.mountId,
                                    ) || null
                                  : null,
                              safety: effectiveMountSafety,
                            }}
                            acquisition={acquisitionForSchedule}
                            onModifyFraming={modifyFramingFromTarget}
                            onViewFramingInLibrary={viewFramingInLibrary}
                            renderEditorExtra={
                              multiNightEntries === "absent"
                                ? null
                                : (editor) =>
                                    multiNight === "open" ? (
                                      <projectsExtension.TimelineAction
                                        host={multiNightHost}
                                        plan={activePlan}
                                        readOnly={!activePlanEditable}
                                        {...editor}
                                      />
                                    ) : activePlanEditable &&
                                      !editor.item.projectId ? (
                                      multiNightBadge ? (
                                        <projectsExtension.TimelineAction
                                          host={multiNightHost}
                                          plan={activePlan}
                                          held
                                          {...editor}
                                        />
                                      ) : (
                                        <HeldFollowAction
                                          locale={locale}
                                          badge={multiNightBadge}
                                          onPress={() =>
                                            enterMultiNight(() => {})
                                          }
                                        />
                                      )
                                    ) : null
                            }
                          />
                        </div>
                        {!activePlan.items.some(
                          (item) => item.id === editingItemId,
                        ) && (
                          // With no target open, the plan's targets under the
                          // timeline, in the order of the night, as the stage-4
                          // cards; a click opens its slot editing, ✕ removes
                          // it.
                          <PlanTargetList
                            rows={timelinePlanTargets({
                              cards: activePlanCards,
                              items: activePlan.items,
                              night,
                            })}
                            locale={locale}
                            timeZone={state.location.timeZone}
                            night={night}
                            editable={activePlanEditable}
                            onOpen={setEditingItemId}
                            onRemove={remove}
                            onShowScore={recommendationListActions.showScore}
                            scores={tonightScores}
                            visualMode={visualMode}
                            acquisition={acquisitionForSchedule}
                          />
                        )}
                        <div className="planner-autofill-row">
                          <button
                            type="button"
                            className="btn-tertiary"
                            disabled={!suggestAvailable}
                            onClick={openSuggestions}
                          >
                            {suggestMessage(locale, "suggestAction")}
                          </button>
                        </div>
                        {(() => {
                          const plan = activePlan;
                          return (
                            <>
                              {" "}
                              <div
                                className="planner-plan-tools"
                                role="group"
                                aria-label={`${message(locale, "plannerPlan")} — ${plan.name ? localizedPlanName(locale, plan.name, plan.date) : message(locale, "plannerUntitledPlan")}`}
                              >
                                <PlanToolButton
                                  icon="calendar"
                                  label={message(locale, "plannerToolCalendar")}
                                  onClick={() => exportCalendar(plan)}
                                  title={message(
                                    locale,
                                    "plannerAddToCalendar",
                                  )}
                                />
                                <PlanToolButton
                                  icon="weather"
                                  label={message(locale, "plannerToolWeather")}
                                  onClick={() => exportWeatherReminder(plan)}
                                  title={message(
                                    locale,
                                    "plannerWeatherReminder",
                                  )}
                                />
                                <PlanToolButton
                                  icon="print"
                                  label={message(locale, "plannerToolPrint")}
                                  onClick={() => setPrintChoicePlanId(plan.id)}
                                  title={message(locale, "plannerPrint")}
                                />
                                <PlanToolButton
                                  icon="share"
                                  label={message(locale, "plannerToolShare")}
                                  onClick={() => sharePlan(plan)}
                                  title={message(locale, "plannerShare")}
                                />
                                <PlanToolButton
                                  icon="export"
                                  label={message(locale, "plannerToolExport")}
                                  onClick={() => setExportPlanId(plan.id)}
                                  title={message(locale, "plannerExport")}
                                />
                              </div>
                              {activePlanVersions?.previous?.length > 0 && (
                                <div className="planner-previous-versions">
                                  <h3>
                                    {message(
                                      locale,
                                      "planPreviousVersionsTitleCount",
                                    ).replace(
                                      "{count}",
                                      String(
                                        activePlanVersions.previous.length,
                                      ),
                                    )}
                                  </h3>
                                  <ul>
                                    {activePlanVersions.previous.map(
                                      (version) => (
                                        <li key={version.versionId}>
                                          <span className="planner-previous-version-meta">
                                            {new Intl.DateTimeFormat(locale, {
                                              dateStyle: "medium",
                                              timeStyle: "short",
                                              hourCycle: "h23",
                                            }).format(
                                              new Date(version.createdAt),
                                            )}
                                            {" · "}
                                            {message(
                                              locale,
                                              "planPreviousVersionsOriginWeb",
                                            )}
                                            {" · "}
                                            {(version.payload?.items || [])
                                              .map((item) => {
                                                const card = (
                                                  night?.cards || []
                                                ).find(
                                                  (entry) =>
                                                    entry.target.id === item.id,
                                                );
                                                return card
                                                  ? plannerTimelineLabel(
                                                      card.target,
                                                    )
                                                  : null;
                                              })
                                              .filter(Boolean)
                                              .join(" · ")}
                                          </span>
                                          <span className="planner-previous-version-actions">
                                            <button
                                              type="button"
                                              className="btn-link"
                                              onClick={() => {
                                                setMergeCompareVersion(version);
                                                setMergePlanId(plan.id);
                                              }}
                                            >
                                              {message(
                                                locale,
                                                "planPreviousVersionsCompareAction",
                                              )}
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-tertiary"
                                              onClick={() => {
                                                postPlanVersionRestore(
                                                  plan.id,
                                                  version.versionId,
                                                )
                                                  .then(
                                                    applyResolvedPlanResource,
                                                  )
                                                  .catch((error) =>
                                                    setPersistenceError(
                                                      error.message ||
                                                        "The version could not be restored.",
                                                    ),
                                                  );
                                              }}
                                            >
                                              {message(
                                                locale,
                                                "planPreviousVersionsRestoreAction",
                                              )}
                                            </button>
                                          </span>
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
                    ) : (
                      <p className="planner-empty-copy">
                        {activePlan
                          ? flow(locale, "noPlace")
                          : message(locale, "plannerNoPlan")}
                      </p>
                    )}
                  </section>
                </>
              )}
            </div>
            {printablePlan && printableContext.night && (
              <PrintablePlan
                activePlan={printablePlan}
                darkness={planDarkness(printablePlan)}
                equipment={printableContext.equipment}
                forecast={
                  printablePlan.id === activePlan?.id
                    ? forecast
                    : { status: "idle", value: null }
                }
                locale={locale}
                location={printableContext.location}
                minAltitude={printableContext.minAltitude}
                night={printableContext.night}
                timeZone={printableContext.location.timeZone}
                acquisitionText={printableAcquisitionText}
              />
            )}
            {printSkyMap && (
              <section className="planner-sky-map-print-sheet">
                <header className="planner-print-heading">
                  <div>
                    <p className="planner-print-eyebrow">
                      {productName().toUpperCase()} · CARTE
                    </p>
                    <h2>
                      {printSkyMap.mode === "projection"
                        ? message(locale, "plannerSkyMapProjection")
                        : message(locale, "plannerSkyMap")}
                    </h2>
                    <p>{dateLabel(state.date, locale)}</p>
                  </div>
                  <div className="planner-print-heading-targets">
                    <strong>{recommendedCards.length}</strong>
                    <span>{message(locale, "plannerVisibleTargets")}</span>
                  </div>
                </header>
                {printSkyMap.mode === "projection" ? (
                  <PrintableHorizonProjection
                    cards={recommendedCards}
                    latitude={state.location.latitude}
                    locale={locale}
                    mask={activeHorizonMask}
                    minAltitude={Number(state.minAltitude)}
                    projectionState={printSkyMap.projectionState}
                  />
                ) : (
                  <PrintableNightSkyMap
                    cards={recommendedCards}
                    locale={locale}
                    subtitle={message(locale, "plannerSuitableTargets")}
                  />
                )}
              </section>
            )}
          </main>
        )}
        {horizonViewer && (
          <PlannerHorizonViewer
            locale={locale}
            place={horizonViewer}
            onClose={() => setHorizonViewer(null)}
          />
        )}
        {placeDialog && (
          <PlannerPlaceDialog
            locale={locale}
            place={placeDialog.place}
            places={knownPlaces}
            unassignedProfiles={state.unassignedHorizonProfiles || []}
            autoLocate={placeDialog.locate !== false}
            duplicatesOf={(written) => duplicatesOfPlace(written, knownPlaces)}
            onOpenPlace={(other) => {
              setPlaceDialog(null);
              setPlaceToShow(other.id);
              changePlannerView("places");
            }}
            IdealPlaces={PlaceIdealDialog}
            idealPlacesProps={{
              client: placesClient,
              defaultPlaceId: (
                defaultPlaceOf(
                  knownPlaces,
                  placesFromSpace
                    ? spacePlaces.defaultId
                    : readDefaultPlaceId(),
                ) ?? null
              )?.id,
            }}
            onSave={(place) =>
              placeDialog.fromPlaces && place.id !== state.location.id
                ? saveKnownPlace(place)
                : requestPlaceChange(place, true)
            }
            onClose={() => setPlaceDialog(null)}
          />
        )}
        {placePicker && (
          <PlacePickerSheet
            locale={locale}
            places={knownPlaces}
            selectedId={state.location.id || null}
            defaultId={
              defaultPlaceOf(
                knownPlaces,
                placesFromSpace ? spacePlaces.defaultId : readDefaultPlaceId(),
              )?.id ?? null
            }
            usageOf={placeUsageOf}
            client={placesClient}
            onChoose={(place) => {
              setPlacePicker(false);
              choosePlace(place);
            }}
            onUsePosition={() => {
              setPlacePicker(false);
              setPlaceDialog({ place: null });
            }}
            onAddByHand={() => {
              setPlacePicker(false);
              setPlaceDialog({ place: null, locate: false });
            }}
            onOpenMine={() => {
              setPlacePicker(false);
              changePlannerView("places");
            }}
            onAddSuggestion={addSuggestedPlace}
            onViewHorizon={(place) => {
              setPlacePicker(false);
              setHorizonViewer(place);
            }}
            onClose={() => setPlacePicker(false)}
          />
        )}
        {placeChange && (
          <PlaceFarDialog
            locale={locale}
            current={placeChange.current}
            next={placeChange.place}
            onCancel={() => setPlaceChange(null)}
            onConfirm={() => commitPlaceChange(placeChange.place, false)}
            planNames={planNamesOf(
              plansForDate.filter((plan) => planStatus(plan) === "pending"),
            )}
          />
        )}
        {nightPlaceChoice && (
          <PlaceFarDialog
            locale={locale}
            current={nightPlaceChoice.current}
            next={nightPlaceChoice.place}
            onCancel={() => setNightPlaceChoice(null)}
            onConfirm={() => resolveNightPlace(nightPlaceChoice.place)}
            planNames={planNamesOf(
              state.plans.filter((plan) =>
                plansMovedToPlace(state, nightPlaceChoice.place).includes(
                  plan.id,
                ),
              ),
            )}
          />
        )}
        {planDeleteConfirmation && (
          <ConfirmationDialog
            locale={locale}
            title={message(locale, "plannerPlanDeleteTitle")}
            description={plannerPlanDeleteDescription(
              planDeleteConfirmation,
              locale,
            )}
            confirmLabel={message(locale, "plannerDeletePlan")}
            destructive
            onCancel={() => setPlanDeleteConfirmation(null)}
            onConfirm={() => {
              removePlan(planDeleteConfirmation.id);
              setPlanDeleteConfirmation(null);
            }}
          />
        )}
        {exportPlanId &&
          state.plans.find((plan) => plan.id === exportPlanId) && (
            <PlanExportDialog
              locale={locale}
              onClose={() => setExportPlanId(null)}
              onExportAsiair={() => {
                exportPlanForAsiair(
                  state.plans.find((plan) => plan.id === exportPlanId),
                );
                setExportPlanId(null);
              }}
              onExportNina={() => {
                exportPlanForNina(
                  state.plans.find((plan) => plan.id === exportPlanId),
                );
                setExportPlanId(null);
              }}
              acquisition={exportDialogAcquisition}
              onExportNinaTargetSet={() => {
                exportPlanForNinaTargetSet(
                  state.plans.find((plan) => plan.id === exportPlanId),
                );
                setExportPlanId(null);
              }}
              onExportPortal={() => {
                exportPlan(
                  state.plans.find((plan) => plan.id === exportPlanId),
                );
                setExportPlanId(null);
              }}
            />
          )}
        {exportFramingResource && (
          <FramingExportDialog
            locale={locale}
            asiairReady={Boolean(
              framingExports(exportFramingResource).asiair.exportedCount,
            )}
            ninaReady={Boolean(
              framingExports(exportFramingResource).nina.exportedCount,
            )}
            onClose={() => setExportFramingResource(null)}
            onExportAsiair={() => {
              exportFramingFile(exportFramingResource, "asiair");
              setExportFramingResource(null);
            }}
            onExportNina={() => {
              exportFramingFile(exportFramingResource, "nina");
              setExportFramingResource(null);
            }}
          />
        )}
        {printChoicePlanId &&
          state.plans.find((plan) => plan.id === printChoicePlanId) && (
            <PrintChoiceDialog
              locale={locale}
              onClose={() => setPrintChoicePlanId(null)}
              onPrintPlan={() => {
                printPlan(
                  state.plans.find((plan) => plan.id === printChoicePlanId),
                );
                setPrintChoicePlanId(null);
              }}
              onPrintSkyMap={() => {
                printActiveSkyMap();
                setPrintChoicePlanId(null);
              }}
            />
          )}
        {mergePlanId && state.plans.find((plan) => plan.id === mergePlanId) && (
          <PlanMergeModal
            compareVersion={mergeCompareVersion}
            fetchPlanVersions={fetchPlanVersions}
            locale={locale}
            night={night}
            onClose={() => {
              setMergePlanId(null);
              setMergeCompareVersion(null);
            }}
            onResolved={applyResolvedPlanResource}
            plan={state.plans.find((plan) => plan.id === mergePlanId)}
            postPlanVersionsResolve={postPlanVersionsResolve}
            postPlanVersionRestore={postPlanVersionRestore}
            profiles={plannerProfiles}
            timeZone={state.location.timeZone}
          />
        )}
        {framingDraft && (
          <FramingDialog
            draft={framingDraft}
            locale={locale}
            onCancel={() => setFramingDraft(null)}
            onConfirm={addFraming}
          />
        )}
        {scoreCard && tonightScores.get(scoreCard.target.id) && (
          <TargetScoreExplained
            score={tonightScores.get(scoreCard.target.id)}
            card={scoreCard}
            date={state.date}
            locale={locale}
            placeName={state.location.name?.trim() || ""}
            timeZone={state.location.timeZone}
            // The night and the season of the target, at the plan's
            // place, from its minimum height.
            night={{
              place: state.location,
              constraints: { minAltitude: Number(state.minAltitude) || 30 },
              darkness: activeDarkness,
            }}
            visualMode={visualMode}
            // « Prévisualiser »: the browser's preference, else « Mon
            // matériel »; the plan's equipment is only named.
            preview={{
              planEquipment: state.equipment,
              configuration: defaultConfiguration,
              profiles: plannerProfiles,
              ...plannerPreviewSky,
              skyForPlace: plannerPreviewSkyFor,
              onCreateFraming: openFramingFromPreview,
              // The eyepieces, filters and telescopes of « Mon matériel »
              // the best pair and the photo advice try (VISUAL-SIM-02b).
              visualInventory: visualInventoryOf(inventoryProfiles),
              pickers: {
                props: equipmentPickerProps,
                define: defineEquipment,
              },
            }}
            onClose={() => setScoreCard(null)}
            // "Régler la tolérance au vent": the equipment stage, open, at
            // its "Tolérance au vent" section. "Régler la tolérance au
            // vent": the "Tolérance au vent" dialog of stage 3.
            onWindSettings={() => {
              setScoreCard(null);
              setWindDialogOpen(true);
            }}
          />
        )}
        {acquisitionDialog && (
          <AcquisitionDialog
            key={`${acquisitionDialog.scope}-${acquisitionDialog.item?.id ?? "plan"}`}
            locale={locale}
            model={acquisitionDialog}
            onClose={() => setAcquisitionDialog(null)}
          />
        )}
        {windDialogOpen && (
          <WindToleranceDialog
            locale={locale}
            closeLabel={flow(locale, "close")}
            onClose={() => setWindDialogOpen(false)}
            tolerance={windShownTolerance}
            mountName={windMountName}
            assessment={windShownAssessment}
            tonight={darknessEffectIsTonight}
            timeZone={state.location.timeZone}
            onChoose={chooseWindTolerance}
          />
        )}
        {suggestOpen && suggestFiltersOpen && (
          <SuggestFiltersDialog
            locale={locale}
            filters={suggestFilters}
            periods={nightPeriods({ start: night.start, end: night.end })}
            clock={(iso) => placeClock(iso, locale, state.location.timeZone)}
            hasMask={
              activeHorizonMask.enabled &&
              horizonMaskHasProfile(state.location.horizonMask)
            }
            countOf={(draft) =>
              suggestionFilteredCount({
                candidates: suggestionCardsFor(draft).map((card) => ({ card })),
                spans: suggestionPeriodSpans(
                  { start: night.start, end: night.end },
                  draft.periods,
                ),
                minimumMinutes: visualMode ? 20 : 45,
              })
            }
            onApply={(next) => {
              setSuggestFiltersOpen(false);
              chooseSuggestFilters(next);
            }}
            onClose={() => setSuggestFiltersOpen(false)}
          />
        )}
        {suggestOpen && initialSuggestions && (
          <SuggestNightDialog
            key={suggestDialogKey}
            filters={{
              badges: suggestFilterBadges(
                locale,
                suggestFilters,
                chooseSuggestFilters,
              ),
              onOpen: () => setSuggestFiltersOpen(true),
              onReset: () => chooseSuggestFilters(null),
            }}
            proposal={initialSuggestions}
            propose={proposeSuggestions}
            locale={locale}
            timeZone={state.location.timeZone}
            contextLine={suggestMessage(locale, "suggestContext", {
              place: state.location.name?.trim() || "",
              date: new Intl.DateTimeFormat(locale, {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              }).format(new Date(`${state.date}T12:00:00Z`)),
            })}
            equipmentLine={equipment.name}
            renderVisual={(entry) => (
              <TargetVisual
                target={
                  night.cards.find((card) => card.target.id === entry.target.id)
                    ?.target || entry.target
                }
                visualMode={visualMode}
                className="planner-suggest-visual"
                locale={locale}
                namedPictogram
                caption={false}
              />
            )}
            visualNote={
              visualMode && eyepieceContext.setting
                ? eyepieceViewCaption(locale)
                : null
            }
            filterAdviceFor={(entry) =>
              visualCardAdviceText(
                locale,
                night.cards.find((card) => card.target.id === entry.target.id),
              )
            }
            visual={visualMode}
            seedInputs={{
              date: state.date,
              latitude: state.location.latitude,
              longitude: state.location.longitude,
            }}
            onApply={applySuggestions}
            comfort={
              observationComfortRange(suggestComfortFamily)
                ? {
                    family: suggestComfortFamily,
                    on: suggestComfortRef.current,
                  }
                : null
            }
            onComfort={chooseSuggestComfort}
            onClose={() => setSuggestOpen(false)}
            onChange={() => {
              setSuggestOpen(false);
              updatePlanView("placeCollapsed", false);
              updatePlanView("equipmentCollapsed", false);
              setTimeout(
                () =>
                  document
                    .querySelector(".planner-location-stage")
                    ?.scrollIntoView({ block: "start" }),
                0,
              );
            }}
            // The plan whose items fill the night is the open one; its
            // schedule is where a target is removed or moved.
            planCount={activeItems.length > 0 ? 1 : 0}
            alreadyInPlanIds={activeItems.map((item) => `${item.id}`)}
            onOpenPlans={() => {
              setSuggestOpen(false);

              setTimeout(
                () =>
                  document
                    .querySelector(".planner-schedule-stage")
                    ?.scrollIntoView({ block: "start" }),
                0,
              );
            }}
          />
        )}
        {frameSurfaceSheetOpen && (
          <FrameSettingsSheet
            // The live surface while one is active, otherwise the last one
            // configured -- never a bare default once the observer has set
            // something of their own.
            initial={frameSurface ?? lastFrameSurface}
            enabled={Boolean(liveFrameSurface)}
            mosaicAllowed={gates.mosaic.allowed}
            signedIn={Boolean(auth.authenticated)}
            field={night?.field}
            equipmentLabel={[
              selectedTelescope?.name,
              visualMode ? selectedEyepiece?.name : selectedCamera?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
            locale={locale}
            onCancel={() => setFrameSurfaceSheetOpen(false)}
            onConfirm={({ enabled, surface: settings }) => {
              setLastFrameSurface(settings);
              setFrameSurface(enabled ? settings : null);
              setFrameSurfaceSheetOpen(false);
            }}
          />
        )}
        {framingEditorState && (
          <FramingEditorDialog
            fullCatalogueTargets={fullCatalogueFramingTargets}
            initialEquipmentSelection={
              framingEditorState.initialEquipmentSelection
            }
            initialFrameSurface={framingEditorState.initialFrameSurface}
            initialAngleDegrees={framingEditorState.initialAngleDegrees ?? null}
            initialHighlightedTarget={
              framingEditorState.initialHighlightedTarget ?? null
            }
            initialView={framingEditorState.initialView ?? null}
            defaultEquipment={Boolean(
              framingEditorState.initialDefaultEquipment,
            )}
            returnedEquipment={framingEditorReturned}
            onReturnedUsed={(used) =>
              setFramingEditorReturned((current) =>
                current === used ? null : current,
              )
            }
            onLeaveForEquipment={rememberFramingEditor}
            mosaicAllowed={gates.mosaic.allowed}
            signedIn={Boolean(auth.authenticated)}
            editingTarget={framingEditorState.editingTarget}
            locale={locale}
            location={state.location}
            mode={framingEditorState.mode === "create" ? "create" : "edit"}
            night={night}
            onCancel={() => setFramingEditorState(null)}
            onConfirm={handleFramingEditorConfirm}
            plannerCameras={plannerCameras}
            plannerEyepieces={plannerEyepieces}
            plannerModifiers={plannerModifiers}
            plannerProfiles={plannerProfiles}
            plannerTelescopes={plannerTelescopeOptions}
            pickerProps={equipmentPickerProps}
          />
        )}
        {framingEditorDraft && (
          <FramingDialog
            confirmLabelKey="plannerFramingSaveToLibrary"
            draft={framingEditorDraft}
            locale={locale}
            onCancel={() => setFramingEditorDraft(null)}
            onConfirm={commitFramingEditor}
          />
        )}
        {framingRuleSheet && (
          <FramingRuleSheet
            framingName={framingRuleSheet.resource.name}
            kind={framingRuleSheet.kind}
            locale={locale}
            onAction={performFramingRuleAction}
            onClose={() => setFramingRuleSheet(null)}
            plans={
              framingRuleSheet.kind === "deleteLocked"
                ? []
                : framingRuleSheet.kind === "shared" ||
                    framingRuleSheet.kind === "deleteShared"
                  ? framingRuleSheet.resource.usage?.pendingPlans || []
                  : []
            }
          />
        )}
        {framingRenameTarget && (
          <FramingRenameDialog
            initialName={framingRenameTarget.name}
            locale={locale}
            onCancel={() => setFramingRenameTarget(null)}
            onConfirm={commitFramingRename}
          />
        )}
        <FramingCopyNotice
          locale={locale}
          notice={framingCopyNotice}
          onDismiss={() => setFramingCopyNotice(null)}
        />
        {browserPlansQuestion && (
          <BrowserPlansDialog
            copy={browserCopy}
            count={browserPlansQuestion.count}
            locale={locale}
            onAnswer={answerBrowserPlans}
            onDismiss={dismissBrowserPlansQuestion}
          />
        )}
        <BrowserPlansNotice
          copy={browserCopy}
          locale={locale}
          notice={browserPlansNotice}
          onDismiss={() => setBrowserPlansNotice(null)}
          onRetry={retryBrowserPlans}
          signedIn={Boolean(auth.authenticated)}
        />
        {planExistsDialog &&
          (() => {
            const plan = state.plans.find(
              (entry) => entry.id === planExistsDialog.planId,
            );
            if (!plan) return null;
            return (
              <PlannerPlanExistsDialog
                plan={{
                  name: plan.name
                    ? localizedPlanName(locale, plan.name, plan.date)
                    : message(locale, "plannerUntitledPlan"),
                  date: plan.date,
                  count: plan.items?.length || 0,
                }}
                locale={locale}
                tonight={
                  plan.date === tonightDate({ place: plan.location || null })
                }
                onClose={() => setPlanExistsDialog(null)}
                onOpen={() => {
                  setPlanExistsDialog(null);
                  selectPlan(plan.id, { openEditor: true });
                }}
                onOffers={() => {
                  setPlanExistsDialog(null);
                  refuseCapability(planExistsDialog.kind);
                }}
              />
            );
          })()}
        {planKindChoice && (
          <NewPlanChoiceDialog
            locale={locale}
            badge={multiNightBadgeFor(multiNight, multiNightBadge)}
            onClose={() => setPlanKindChoice(false)}
            onChoose={(kind) => {
              setPlanKindChoice(false);
              if (kind === "one") addPlan();
              else enterMultiNight(() => setMultiNightCreate(true));
            }}
          />
        )}
        {multiNightCreate && multiNight === "open" && (
          <projectsExtension.CreateDialog
            host={multiNightHost}
            onClose={() => setMultiNightCreate(false)}
          />
        )}
        <ConfigurationNotice
          locale={locale}
          notice={configurationNotice}
          onUndo={() => {
            const undo = configurationNotice?.undo;
            setConfigurationNotice(null);
            undo?.();
          }}
        />
        <CapabilityNotice
          locale={locale}
          refusal={capabilityRefusal}
          signedIn={Boolean(auth.authenticated)}
          onDismiss={() => setCapabilityRefusal(null)}
        />
        {framingSaveError && (
          <div className="planner-copy-notice-banner is-error" role="alert">
            <p>{localizedServerError(locale, framingSaveError)}</p>
            <button
              aria-label={message(locale, "plannerFramingClose")}
              onClick={() => setFramingSaveError(null)}
              type="button"
            >
              ×
            </button>
          </div>
        )}
      </PlaceSkyMeasuresContext.Provider>
    </MissingObjectContext.Provider>
  );
  // Who is looking, for the purchase boxes the locked places draw — whether
  // there is a session to pay from, and the way to the sign-in page and back
  // to this planner.
  const purchaseSession = {
    signedIn: Boolean(auth.authenticated),
    signInHref: missingObjectRequest.signInHref,
  };
  return (
    <OffersSession value={purchaseSession}>
      <EyepieceViewContext.Provider value={eyepieceContext}>
        {page}
        {pastNightOffer && (
          <PastNightDebriefDialog
            locale={locale}
            hasSpace
            href={pastNightOffer.href}
            onClose={() => setPastNightOffer(null)}
          />
        )}
      </EyepieceViewContext.Provider>
    </OffersSession>
  );
}
