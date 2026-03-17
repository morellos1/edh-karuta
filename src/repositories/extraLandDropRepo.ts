import { createExtraResourceRepo } from "./extraResourceRepo.js";

const repo = createExtraResourceRepo("extraLandDrop");

export const getExtraLandDropCount = repo.getCount;
export const getExtraLandDropCountTx = repo.getCountTx;
export const consumeExtraLandDropTx = repo.consumeTx;
export const grantExtraLandDrops = repo.grant;
