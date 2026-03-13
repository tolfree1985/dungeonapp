import { type BudgetExceeded429Payload } from "../../../app/api/turn/deterministic429";

export class Usage429Error extends Error {
  readonly payload: BudgetExceeded429Payload;
  constructor(payload: BudgetExceeded429Payload) {
    super("USAGE_429");
    this.name = "Usage429Error";
    this.payload = payload;
  }
}
