'use server';

import * as dealCore from './actions-deal-core';
import * as quotations from './actions-quotations';
import * as orders from './actions-orders';
import * as activity from './actions-activity';
import * as selection from './actions-selection';

export async function getDealById(
  ...args: Parameters<typeof dealCore.getDealById>
) {
  return dealCore.getDealById(...args);
}

export async function getDealProducts(
  ...args: Parameters<typeof dealCore.getDealProducts>
) {
  return dealCore.getDealProducts(...args);
}

export async function updateDealProducts(
  ...args: Parameters<typeof dealCore.updateDealProducts>
) {
  return dealCore.updateDealProducts(...args);
}

export async function uploadFileToStorageAction(
  ...args: Parameters<typeof dealCore.uploadFileToStorageAction>
) {
  return dealCore.uploadFileToStorageAction(...args);
}

export async function createQuotationAction(
  ...args: Parameters<typeof quotations.createQuotationAction>
) {
  return quotations.createQuotationAction(...args);
}

export async function deleteQuotationCascadeAction(
  ...args: Parameters<typeof quotations.deleteQuotationCascadeAction>
) {
  return quotations.deleteQuotationCascadeAction(...args);
}

export async function getQuotationsForDeal(
  ...args: Parameters<typeof quotations.getQuotationsForDeal>
) {
  return quotations.getQuotationsForDeal(...args);
}

export async function updateQuotationStatusAction(
  ...args: Parameters<typeof quotations.updateQuotationStatusAction>
) {
  return quotations.updateQuotationStatusAction(...args);
}

export async function createDealOrderAction(
  ...args: Parameters<typeof orders.createDealOrderAction>
) {
  return orders.createDealOrderAction(...args);
}

export async function getOrdersForDeal(
  ...args: Parameters<typeof orders.getOrdersForDeal>
) {
  return orders.getOrdersForDeal(...args);
}

export async function addCpdAction(
  ...args: Parameters<typeof activity.addCpdAction>
) {
  return activity.addCpdAction(...args);
}

export async function addMeasurementAction(
  ...args: Parameters<typeof activity.addMeasurementAction>
) {
  return activity.addMeasurementAction(...args);
}

export async function addVisitAction(
  ...args: Parameters<typeof activity.addVisitAction>
) {
  return activity.addVisitAction(...args);
}

export async function getCpdsForDeal(
  ...args: Parameters<typeof activity.getCpdsForDeal>
) {
  return activity.getCpdsForDeal(...args);
}

export async function getMeasurementsForDeal(
  ...args: Parameters<typeof activity.getMeasurementsForDeal>
) {
  return activity.getMeasurementsForDeal(...args);
}

export async function getVisitsForDeal(
  ...args: Parameters<typeof activity.getVisitsForDeal>
) {
  return activity.getVisitsForDeal(...args);
}

export async function startVisitAction(
  ...args: Parameters<typeof activity.startVisitAction>
) {
  return activity.startVisitAction(...args);
}

export async function addReceiptAction(
  ...args: Parameters<typeof selection.addReceiptAction>
) {
  return selection.addReceiptAction(...args);
}

export async function createSelectionAction(
  ...args: Parameters<typeof selection.createSelectionAction>
) {
  return selection.createSelectionAction(...args);
}

export async function getMeasurementById(
  ...args: Parameters<typeof selection.getMeasurementById>
) {
  return selection.getMeasurementById(...args);
}

export async function getProductsByIds(
  ...args: Parameters<typeof selection.getProductsByIds>
) {
  return selection.getProductsByIds(...args);
}

export async function getReceiptsForDeal(
  ...args: Parameters<typeof selection.getReceiptsForDeal>
) {
  return selection.getReceiptsForDeal(...args);
}

export async function getSelectionById(
  ...args: Parameters<typeof selection.getSelectionById>
) {
  return selection.getSelectionById(...args);
}

export async function getSelectionsForDeal(
  ...args: Parameters<typeof selection.getSelectionsForDeal>
) {
  return selection.getSelectionsForDeal(...args);
}

export async function inventoryLookupAction(
  ...args: Parameters<typeof selection.inventoryLookupAction>
) {
  return selection.inventoryLookupAction(...args);
}

export async function saveMeasurementToDeal(
  ...args: Parameters<typeof selection.saveMeasurementToDeal>
) {
  return selection.saveMeasurementToDeal(...args);
}

export async function updateBlindsAction(
  ...args: Parameters<typeof selection.updateBlindsAction>
) {
  return selection.updateBlindsAction(...args);
}

export async function updateItemsAction(
  ...args: Parameters<typeof selection.updateItemsAction>
) {
  return selection.updateItemsAction(...args);
}

export async function updateSelectionStatusAction(
  ...args: Parameters<typeof selection.updateSelectionStatusAction>
) {
  return selection.updateSelectionStatusAction(...args);
}

export async function updateSofasAction(
  ...args: Parameters<typeof selection.updateSofasAction>
) {
  return selection.updateSofasAction(...args);
}
