import { planCreationGate } from "./capability-gates.js";
import { suggestNight } from "./suggest-night.js";
import { plannedPlanItem } from "./recommendations.js";
import { migratePlannerState } from "portal/planner/state.js";

// inputsFor reads the destination's place and equipment, never the open plan.
export class QuickPlanAction {
  constructor({
    document,
    date,
    location,
    name,
    newSettings,
    capabilities,
    signedIn = false,
    inputsFor,
    persist,
    remove,
    // The placement a suggestion dialog showed — the plan gets the slots
    // that were drawn; without a dialog it stays "Idéal".
    placement = "ideal",
    // The part of the night the targets are placed in -- from now on a night
    // that is running (`suggestionSpanFromNow`); without
    // it, the whole night.
    span = null,
    // the « Confort » the dialog showed its slots
    // with (`comfort` of `autoFillNight`), `null` without.
    comfort = null,
    id = () => crypto.randomUUID(),
  }) {
    Object.assign(this, {
      document,
      date,
      location,
      name,
      newSettings,
      capabilities,
      signedIn,
      inputsFor,
      persist,
      remove,
      placement,
      span,
      comfort,
      id,
    });
  }
  get existing() {
    return this.document.plans.find(
      (p) => p.date === this.date && p.status === "pending",
    );
  }
  // The night's pending plan that holds no target -- a
  // draft nobody filled. It never blocks a quick plan and never counts for the
  // free offer's one plan per night: the quick plan's targets go into it,
  // silently, instead of the sheet "Un plan existe déjà". Only when it is the
  // one plan in the way (a night that also holds a plan that ran keeps
  // refusing).
  get emptyDraft() {
    const draft = this.document.plans.find(
      (p) =>
        p.date === this.date &&
        p.status === "pending" &&
        !(p.items || []).length,
    );
    if (!draft) return undefined;
    const rest = planCreationGate({
      capabilities: this.capabilities,
      plans: this.document.plans.filter((p) => p.id !== draft.id),
      signedIn: this.signedIn,
      date: this.date,
    });
    return rest.allowed ? draft : undefined;
  }
  // The refusal of the night's rule as a result. A night taken by a pending
  // plan answers "exists" (merge into it, erase it, or the offers); a night
  // taken only by a plan that was run (executed, partial) has nothing to
  // merge into or erase: "taken" -- several plans for one night are Advanced
  // Planning.
  refusal(gate, existing) {
    if (gate.refusal === "planGuard")
      return {
        kind: "refused",
        refusal: gate.refusal,
        plan: existing,
        placed: 0,
      };
    return {
      kind: existing ? "exists" : "taken",
      refusal: gate.refusal,
      plan: existing,
      placed: 0,
    };
  }
  async create(ids) {
    if (!ids.size) return { kind: "cancelled", placed: 0 };
    const gate = planCreationGate({
      capabilities: this.capabilities,
      plans: this.document.plans,
      signedIn: this.signedIn,
      date: this.date,
    });
    if (!gate.allowed) {
      const draft = this.emptyDraft;
      if (draft) return this.place(draft, ids, true);
      return this.refusal(gate, this.existing);
    }
    const plan = {
      ...structuredClone(this.newSettings),
      id: this.id(),
      name: this.name,
      date: this.date,
      location: structuredClone(this.location),
      status: "pending",
      items: [],
    };
    return this.place(plan, ids, false);
  }
  async proposal(plan, ids) {
    const inputs = await this.inputsFor(plan);
    return {
      inputs,
      result: suggestNight({
        ...inputs,
        items: plan.items || [],
        count: ids.size,
        only: [...ids],
        layout: "night",
        placement: this.placement,
        comfort: this.comfort,
        ...(this.span ? { span: this.span } : {}),
      }),
    };
  }
  async place(plan, ids, merging) {
    const { inputs, result } = await this.proposal(plan, ids);
    if (!result?.items?.length) return { kind: "empty", plan, placed: 0 };
    const added = result.items.map((entry) => {
      const card = inputs.candidates.find(
        (c) => c.card.target.id === entry.target.id,
      )?.card;
      return {
        ...plannedPlanItem({ card, night: inputs.night }),
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        durationMinutes: entry.durationMinutes,
      };
    });
    const nextPlan = { ...plan, items: [...(plan.items || []), ...added] };
    const plans = merging
      ? this.document.plans.map((p) => (p.id === plan.id ? nextPlan : p))
      : [...this.document.plans, nextPlan];
    const next = migratePlannerState(
      { ...this.document, plans, activePlanId: plan.id },
      this.document,
    );
    await this.persist(next);
    this.document = next;
    return {
      kind: merging ? "merged" : "created",
      plan: next.plans.find((p) => p.id === plan.id),
      placed: added.length,
    };
  }
  async merge(ids) {
    return this.existing
      ? this.place(this.existing, ids, true)
      : this.create(ids);
  }
  async eraseAndCreate(ids, { running = false, debrief = false } = {}) {
    if (running || debrief) return { kind: "eraseDisabled", placed: 0 };
    const plan = this.existing;
    if (plan) {
      // Refused before anything is erased: a night that keeps a plan that was
      // run once this one is gone still refuses the new plan.
      const gate = planCreationGate({
        capabilities: this.capabilities,
        plans: this.document.plans.filter((p) => p.id !== plan.id),
        signedIn: this.signedIn,
        date: this.date,
      });
      if (!gate.allowed) return this.refusal(gate, plan);
      await this.remove(plan.id);
      this.document = {
        ...this.document,
        plans: this.document.plans.filter((p) => p.id !== plan.id),
      };
    }
    return this.create(ids);
  }
}
