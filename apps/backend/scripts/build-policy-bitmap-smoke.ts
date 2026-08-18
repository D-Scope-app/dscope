import { buildPredicatePolicyBitmapV1 } from "../src/domain/predicate/policy-bitmap.v1";

function printCase(
  name: string,
  selection: Parameters<typeof buildPredicatePolicyBitmapV1>[0],
) {
  console.log(`\n--- ${name} ---`);
  console.log(JSON.stringify(buildPredicatePolicyBitmapV1(selection), null, 2));
}

printCase("ANY / ANY / ANY", {
  ageBuckets: "ANY",
  countries: "ANY",
  regions: "ANY",
});

printCase("age only", {
  ageBuckets: ["31_35", "36_45"],
  countries: "ANY",
  regions: "ANY",
});

printCase("countries only", {
  ageBuckets: "ANY",
  countries: ["RU", "DE", "FR", "USA"],
  regions: "ANY",
});

printCase("mixed policy", {
  ageBuckets: ["18_25", "26_30", "31_35"],
  countries: ["RUS", "DEU", "FRA"],
  regions: ["EECA", "EUROPE"],
});
