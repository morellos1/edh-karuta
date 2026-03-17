import { createExtraResourceRepo } from "./extraResourceRepo.js";

const repo = createExtraResourceRepo("extraCommanderDrop");

export const getExtraCommanderDropCount = repo.getCount;
export const getExtraCommanderDropCountTx = repo.getCountTx;
export const consumeExtraCommanderDropTx = repo.consumeTx;
export const grantExtraCommanderDrops = repo.grant;
