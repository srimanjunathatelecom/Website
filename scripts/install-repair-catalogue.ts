// Dev helper: run the idempotent repair-catalogue installer directly.
import { installRepairCatalogue } from "../src/lib/repair/catalogue";

installRepairCatalogue()
  .then((r) => {
    console.log(JSON.stringify(r, null, 1));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
