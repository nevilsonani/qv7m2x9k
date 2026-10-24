// Friendly aliases over the types generated from the backend's OpenAPI schema.
// Regenerate with `npm run gen:api` after changing backend/app/api/schemas.py.
import type { components } from "./schema";

type Schemas = components["schemas"];

export type Meta = Schemas["Meta"];
export type Gate = Schemas["Gate"];
export type GateId = Gate["id"];
export type DecisionView = Schemas["DecisionView"];
export type DecisionPoint = Schemas["DecisionPoint"];
export type Vintage = Schemas["Vintage"];
export type ErrorStats = Schemas["ErrorStats"];
export type CalendarDay = Schemas["CalendarDay"];
export type Accuracy = Schemas["Accuracy"];
export type AccuracyPoint = Schemas["AccuracyPoint"];
export type DailyAccuracy = Schemas["DailyAccuracy"];
export type HistogramBin = Schemas["HistogramBin"];
export type HourProfile = Schemas["HourProfile"];
export type LevelProfile = Schemas["LevelProfile"];
export type LeadTimeCurve = Schemas["LeadTimeCurve"];
export type LeadTimePoint = Schemas["LeadTimePoint"];
export type Insight = Schemas["Insight"];
export type Basis = Accuracy["basis"];
export type Variant = Accuracy["variant"];
