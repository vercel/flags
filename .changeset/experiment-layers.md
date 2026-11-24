---
'@vercel/flags-core': minor
---

Support experiment layers. A layer makes sure that a unit is in at most one running experiment of the layer.

- When the experiment definition has a `layer`, the SDK puts the unit in one of 1,000 slots with the layer salt. If the experiment owns the slot, the SDK assigns a variant as before. If not, the SDK serves control with the new assignment reason `not-in-layer`. The ramp check does not apply in a layer, because the owned slots are the ramp.
- If the layer data is not valid, the SDK serves control with reason `not-in-layer`. It never enrolls the unit.
- `experimental_ExperimentAssignment` and `experimental_Exposure` have a new optional `layerId` field.
