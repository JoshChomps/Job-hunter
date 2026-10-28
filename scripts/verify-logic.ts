import { assessUk, assessSg, assessVisa, matchSponsor } from "@/pipeline/visa";
import { canonicaliseUrl, buildDedupeKey, parseSalaryText, toMonthly } from "@/pipeline/normalize";
import { applyNegativeKeywords, classifyDiscipline, inferSeniority } from "@/pipeline/filter";

let pass = 0, fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n         got ${a}\n         want ${e}`); }
}

console.log("\nUK gate");
check("no sponsor licence -> no",
  assessUk({ salary: { max: 50000, currency: "GBP", period: "year" }, ukSponsorLicence: false }).feasibility, "no");
check("licensed + 45k -> yes",
  assessUk({ salary: { max: 45000, currency: "GBP", period: "year" }, ukSponsorLicence: true }).feasibility, "yes");
check("licensed + 30k below floor -> no",
  assessUk({ salary: { max: 30000, currency: "GBP", period: "year" }, ukSponsorLicence: true }).feasibility, "no");
check("band 30k-38k uses top, clears -> yes",
  assessUk({ salary: { min: 30000, max: 38000, currency: "GBP", period: "year" }, ukSponsorLicence: true }).feasibility, "yes");
check("no salary + licensed -> yes (unverified)",
  assessUk({ salary: {}, ukSponsorLicence: true }).feasibility, "yes");
check("no salary, licence unresolved -> unknown (never 'no')",
  assessUk({ salary: {}, ukSponsorLicence: null }).feasibility, "unknown");
check("explicit no-sponsorship statement wins -> no",
  assessUk({ salary: { max: 90000, currency: "GBP" }, ukSponsorLicence: true, sponsorshipSignal: "no" }).feasibility, "no");
check("going rate raises floor above base",
  assessUk({ salary: { max: 35000, currency: "GBP", period: "year" }, ukSponsorLicence: true, ukGoingRate: 60000 }).feasibility, "no");

console.log("\nSG gate");
const now2026 = new Date("2026-08-08T00:00:00Z");
check("5000/mo below EP min -> no",
  assessSg({ salary: { max: 5000, currency: "SGD", period: "month" }, now: now2026 }).feasibility, "no");
check("5800/mo clears now, not 2027 -> threshold_risk",
  assessSg({ salary: { max: 5800, currency: "SGD", period: "month" }, now: now2026 }).feasibility, "threshold_risk");
check("6500/mo clears both -> yes",
  assessSg({ salary: { max: 6500, currency: "SGD", period: "month" }, now: now2026 }).feasibility, "yes");
check("no salary -> unknown",
  assessSg({ salary: {}, now: now2026 }).feasibility, "unknown");
check("financial services higher floor",
  assessSg({ salary: { max: 6000, currency: "SGD", period: "month" }, isFinancialServices: true, now: now2026 }).feasibility, "no");
check("annual 84000 SGD = 7000/mo -> yes",
  assessSg({ salary: { max: 84000, currency: "SGD", period: "year" }, now: now2026 }).feasibility, "yes");

console.log("\nMarket routing");
check("Canada never gated", assessVisa({ country: "CA", salary: { max: 60000, currency: "CAD" } }), { uk: "unknown", sg: "unknown" });
check("GB routes to UK gate only", assessVisa({ country: "GB", salary: { max: 20000, currency: "GBP" }, ukSponsorLicence: true }).sg, "unknown");

console.log("\nSponsor matching");
const sponsors = [{ name: "Graphcore Limited", normalisedName: "graphcore" }];
check("exact after suffix strip", matchSponsor("Graphcore", sponsors)?.name, "Graphcore Limited");
check("short name guarded", matchSponsor("Arm", [{ name: "Armitage Foods Ltd", normalisedName: "armitage foods" }]), undefined);
check("ambiguous -> no match", matchSponsor("Acme Tech", [
  { name: "Acme Tech Systems Ltd", normalisedName: "acme tech systems" },
  { name: "Acme Tech Services Ltd", normalisedName: "acme tech services" }]), undefined);

console.log("\nURL + dedupe");
check("tracking params stripped",
  canonicaliseUrl("https://www.reed.co.uk/jobs/x?utm_source=a&gh_jid=42&ref=b"), "https://reed.co.uk/jobs/x?gh_jid=42");
check("job id in query preserved",
  canonicaliseUrl("https://boards.greenhouse.io/x?gh_jid=99").includes("gh_jid=99"), true);
check("same role different boards collapses",
  buildDedupeKey("Arm Ltd", "Senior RTL Design Engineer (Remote)", "Cambridge, UK") ===
  buildDedupeKey("ARM Limited", "Senior RTL Design Engineer - Full-time", "Cambridge"), true);
check("different roles stay distinct",
  buildDedupeKey("Arm", "RTL Engineer", "Cambridge") === buildDedupeKey("Arm", "Analog Engineer", "Cambridge"), false);

console.log("\nSalary parsing");
check("GBP range", parseSalaryText("£35,000 - £45,000 per annum"), { min: 35000, max: 45000, currency: "GBP", period: "year" });
check("monthly SGD", parseSalaryText("S$6,000 per month"), { min: 6000, currency: "SGD", period: "month" });
check("annual->monthly", toMonthly(72000, "year"), 6000);

console.log("\nFilters");
check("electrician rejected", applyNegativeKeywords("Maintenance Electrician").rejected, true);
check("electrical engineer kept", applyNegativeKeywords("Electrical Engineer").rejected, false);
check("data annotation rejected", applyNegativeKeywords("AI Data Annotation Specialist").rejected, true);
check("ML engineer kept", applyNegativeKeywords("Machine Learning Engineer").rejected, false);
check("RTL -> electrical", classifyDiscipline("RTL Design Engineer").discipline, "electrical");
check("CV -> ai", classifyDiscipline("Computer Vision Engineer").discipline, "ai");
check("edge ML flagged hardware_ai", classifyDiscipline("Edge AI Accelerator Engineer").isHardwareAi, true);
check("grad scheme detected", inferSeniority("Graduate Engineer", "Our graduate scheme starts in September").isGradScheme, true);
check("5 years -> mid not excluded", inferSeniority("Engineer", "requires 5 years experience").seniority, "mid");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
