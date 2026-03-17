import { createExtraResourceRepo } from "./extraResourceRepo.js";

const repo = createExtraResourceRepo("extraClaim");

export const getExtraClaimCount = repo.getCount;
export const getExtraClaimCountTx = repo.getCountTx;
export const consumeExtraClaimTx = repo.consumeTx;
export const grantExtraClaims = repo.grant;
