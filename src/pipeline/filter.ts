/**
 * Two-stage noise control. "Electrical" is one of the noisiest search terms
 * there is, and "AI" is close behind, without this the inbox fills with
 * electricians and data-annotation gigs and stops being usable.
 *
 * Stage one (here) is cheap keyword rejection before anything is stored or any
 * Firecrawl credit is spent. Stage two is Claude classification, which catches
 * what keywords cannot.
 */

export const DEFAULT_NEGATIVE_KEYWORDS = [
  // Trades mis-matching "electrical"
  "electrician",
  "electrical technician",
  "electrical installer",
  "electrical installation",
  "apprentice electrician",
  "maintenance electrician",
  "industrial electrician",
  "auto electrician",
  "electrical fitter",
  "electrical mate",
  "electrical labourer",
  "cable puller",
  "cable jointer",
  "panel wirer",
  "panel wiring",
  "electrical estimator",
  "electrical supervisor",
  "site supervisor",
  "field service technician",
  "hvac",
  "plumbing",
  "solar installer",
  "pat testing",
  "domestic installer",

  // Sales / recruiting wearing an engineering hat
  "sales engineer",
  "technical sales",
  "business development",
  "account executive",
  "recruiter",
  "recruitment consultant",
  "talent acquisition",

  // Low-quality "AI" postings
  "ai trainer",
  "ai tutor",
  "data annotator",
  "data annotation",
  "data labeler",
  "data labeller",
  "image annotation",
  "prompt writer",
  "content writer",
  "survey taker",
  "freelance writer",
];

export interface FilterDecision {
  rejected: boolean;
  reason?: string;
}

export function applyNegativeKeywords(
  title: string,
  keywords: string[] = DEFAULT_NEGATIVE_KEYWORDS,
): FilterDecision {
  const haystack = ` ${title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
  for (const keyword of keywords) {
    if (haystack.includes(` ${keyword.toLowerCase()} `)) {
      return { rejected: true, reason: `negative keyword: "${keyword}"` };
    }
  }
  return { rejected: false };
}

/* --------------------------------------------------- discipline detection */

const ELECTRICAL_TERMS: Array<[RegExp, string]> = [
  [/\b(analog|analogue|mixed[- ]signal)\b/i, "analog & mixed-signal"],
  [/\b(rf|radio frequency|microwave|antenna)\b/i, "RF & microwave"],
  [/\b(rtl|verilog|systemverilog|vhdl|fpga|digital design)\b/i, "digital design / RTL"],
  [/\b(asic|vlsi|physical design|soc design|tapeout|synthesis)\b/i, "ASIC & VLSI"],
  [/\b(design verification|dv engineer|uvm|formal verification)\b/i, "verification"],
  [/\b(embedded|firmware|bare[- ]metal|rtos|microcontroller|mcu)\b/i, "embedded & firmware"],
  [/\b(power electronics|inverter|converter|motor drive|bms|battery management)\b/i, "power electronics"],
  [/\b(pcb|schematic capture|altium|hardware design|board design)\b/i, "PCB & hardware"],
  [/\b(semiconductor|wafer|fab|lithography|etch|yield|process integration|metrology)\b/i, "semiconductor process"],
  [/\b(test engineer|validation|characterisation|characterization|ate)\b/i, "test & validation"],
  [/\b(control systems?|instrumentation|plc|scada)\b/i, "controls & instrumentation"],
  [/\b(dsp|signal processing)\b/i, "DSP"],
  [/\b(photonic|optoelectronic|laser|optical engineer)\b/i, "photonics"],
  [/\b(electrical engineer|electronics engineer|hardware engineer)\b/i, "electrical engineering"],
];

const AI_TERMS: Array<[RegExp, string]> = [
  [/\b(mlops|ml infrastructure|ml platform|model serving)\b/i, "MLOps & infrastructure"],
  [/\b(computer vision|image recognition|object detection)\b/i, "computer vision"],
  [/\b(nlp|natural language|llm|large language model|transformer)\b/i, "NLP & LLMs"],
  [/\b(robotics|autonomy|autonomous|slam|motion planning)\b/i, "robotics & autonomy"],
  [/\b(data scientist|data science)\b/i, "data science"],
  [/\b(research scientist|research engineer|ml research)\b/i, "ML research"],
  [/\b(ml compiler|mlir|tvm|kernel engineer|cuda|triton)\b/i, "AI compilers"],
  [/\b(machine learning|ml engineer|ai engineer|deep learning|applied ai)\b/i, "ML engineering"],
];

/**
 * The overlap this search is really aimed at: silicon and systems built *for*
 * machine learning, or machine learning running on constrained hardware.
 */
const HARDWARE_AI_TERMS =
  /\b(ai accelerator|ml accelerator|npu|tpu|tensor core|edge ai|edge ml|tinyml|on[- ]device (ml|ai|inference)|neuromorphic|inference engine|hardware[- ]aware|ml compiler|mlir|tvm|systolic|dataflow architecture|ai chip|ai silicon|accelerator architect)\b/i;

export interface DisciplineResult {
  discipline: "electrical" | "ai" | "other" | "unknown";
  subDiscipline?: string;
  isHardwareAi: boolean;
}

export function classifyDiscipline(
  title: string,
  description?: string | null,
): DisciplineResult {
  // Title is weighted far above description, a JD mentioning "machine
  // learning" once does not make a power electronics role an AI role.
  const titleText = title;
  const body = `${title} ${description?.slice(0, 4000) ?? ""}`;

  const eeTitle = ELECTRICAL_TERMS.find(([re]) => re.test(titleText));
  const aiTitle = AI_TERMS.find(([re]) => re.test(titleText));
  const isHardwareAi = HARDWARE_AI_TERMS.test(body);

  if (eeTitle && aiTitle) {
    return {
      discipline: isHardwareAi ? "ai" : "electrical",
      subDiscipline: isHardwareAi ? aiTitle[1] : eeTitle[1],
      isHardwareAi: true,
    };
  }
  if (eeTitle) return { discipline: "electrical", subDiscipline: eeTitle[1], isHardwareAi };
  if (aiTitle) return { discipline: "ai", subDiscipline: aiTitle[1], isHardwareAi };

  const eeBody = ELECTRICAL_TERMS.find(([re]) => re.test(body));
  const aiBody = AI_TERMS.find(([re]) => re.test(body));
  if (aiBody) return { discipline: "ai", subDiscipline: aiBody[1], isHardwareAi };
  if (eeBody) return { discipline: "electrical", subDiscipline: eeBody[1], isHardwareAi };

  return { discipline: "unknown", isHardwareAi };
}

/* ----------------------------------------------------- seniority detection */

const GRAD_SCHEME =
  /\b(graduate (scheme|programme|program)|new grad|new graduate|early careers?|campus hire|university hire|rotational (scheme|programme|program)|apprenticeship degree)\b/i;

export type Seniority =
  | "intern"
  | "new_grad"
  | "early"
  | "mid"
  | "senior"
  | "staff"
  | "unknown";

export interface SeniorityResult {
  seniority: Seniority;
  isGradScheme: boolean;
}

/**
 * Years of experience is a *soft* signal here, never a filter. Plenty of
 * postings ask for five years and hire on demonstrated capability, so this
 * classifies for ranking rather than exclusion.
 */
export function inferSeniority(
  title: string,
  description?: string | null,
): SeniorityResult {
  const body = `${title} ${description?.slice(0, 3000) ?? ""}`;
  const isGradScheme = GRAD_SCHEME.test(body);

  if (/\b(intern|internship|placement year|industrial placement|co[- ]op student)\b/i.test(title))
    return { seniority: "intern", isGradScheme };
  if (/\b(principal|distinguished|fellow|staff engineer|architect)\b/i.test(title))
    return { seniority: "staff", isGradScheme };
  if (/\b(senior|snr|sr\.?|lead|head of)\b/i.test(title))
    return { seniority: "senior", isGradScheme };
  if (/\b(junior|jnr|jr\.?|entry[- ]level|graduate|associate)\b/i.test(title))
    return { seniority: "new_grad", isGradScheme };
  if (isGradScheme) return { seniority: "new_grad", isGradScheme };

  const years = body.match(/(\d+)\+?\s*(?:-\s*\d+\s*)?years?(?:'|\s+of)?\s+(?:relevant\s+)?experience/i);
  if (years) {
    const n = Number(years[1]);
    if (n <= 1) return { seniority: "new_grad", isGradScheme };
    if (n <= 3) return { seniority: "early", isGradScheme };
    if (n <= 7) return { seniority: "mid", isGradScheme };
    return { seniority: "senior", isGradScheme };
  }

  return { seniority: "unknown", isGradScheme };
}
