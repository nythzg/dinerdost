import { NextRequest } from "next/server";
import { z } from "zod";
import * as service from "@dinerdost/services";
import { DomainError } from "@dinerdost/core";
import { body, context, csrf, failure, response } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    csrf(request);
    const { db, actor } = await context();
    actor.ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    actor.deviceId = request.headers.get("x-device-id")?.slice(0, 80);
    const data = z
      .object({
        action: z.string(),
        id: z.uuid().optional(),
        orderId: z.uuid().optional(),
        roundId: z.uuid().optional(),
        kind: z.string().optional(),
        input: z.unknown().optional(),
      })
      .strict()
      .parse(await body(request));
    const key = z.uuid().parse(request.headers.get("idempotency-key"));
    await service.requireApplicationCommand(db, actor, data);
    await service.expireActorTables(db, actor);
    const recordId = () => z.uuid().parse(data.id),
      orderId = () => z.uuid().parse(data.orderId),
      roundId = () => z.uuid().parse(data.roundId);
    let result: unknown;
    switch (data.action) {
      case 'paidReplacement':
        result=await service.replacePaidOrder(db,actor,key,orderId(),data.input);
        break;
      case "materialSetup":
        result=await service.saveMaterialSetup(db,actor,key,data.input);
        break;
      case "dismissAlert":
        result=await service.dismissAlert(db,actor,key,data.input);
        break;
      case "stockValue":
        result = await service.changeStockValue(db, actor, key, data.input);
        break;
      case "ingredientArchive":
        result = await service.archiveIngredient(db, actor, key, data.input);
        break;
      case "kotPrint":
        result = await service.requestKotPrint(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
        );
        break;
      case "receiptSettings":
        result = await service.saveReceiptSettings(db, actor, key, data.input);
        break;
      case "receivePurchase":
        result = await service.receivePurchase(
          db,
          actor,
          key,
          data.input,
          !actor.application || actor.application === "MASTER",
        );
        break;
      case "storefront":
        result = await service.saveStorefront(db, actor, key, data.input);
        break;
      case "employeeProfile":
        result = await service.updateEmployeeProfile(
          db,
          actor,
          key,
          recordId(),
          data.input,
        );
        break;
      case "staffInvite":
        result = await service.createStaffInvitation(
          db,
          actor,
          key,
          data.input,
        );
        break;
      case "revokeStaffInvite":
        result = await service.revokeStaffInvitation(
          db,
          actor,
          key,
          recordId(),
        );
        break;
      case "employeeRole":
        result = await service.updateEmployeeRole(
          db,
          actor,
          key,
          recordId(),
          data.input,
        );
        break;
      case "orderAdjustments":
        result = await service.changeRoundAdjustments(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
          !actor.application || actor.application === "MASTER",
        );
        break;
      case "orderCharges":
        result = await service.changeRoundCharges(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
          !actor.application || actor.application === "MASTER",
        );
        break;
      case "orderTax":
        result = await service.changeOrderTax(
          db,
          actor,
          key,
          orderId(),
          data.input,
        );
        break;
      case "recordPayment":
        result = await service.recordPayment(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
          !actor.application || actor.application === "MASTER",
        );
        break;
      case "tableActivity":
        result = await service.touchTableActivity(db, actor, data.input);
        break;
      case "removeTable":
        result = await service.removeTable(db, actor, key, data.input);
        break;
      case "floorPlan":
        result = await service.saveFloorPlan(db, actor, key, data.input);
        break;
      case "floor":
        result = await service.saveFloor(db, actor, key, data.input);
        break;
      case "shift":
        result = await service.saveShift(db, actor, key, data.input);
        break;
      case "attendance":
        result = await service.markAttendance(db, actor, key, data.input);
        break;
      case "exchangeTables":
        result = await service.exchangeTables(db, actor, key, data.input);
        break;
      case "closeTable":
        result = await service.closeTable(db, actor, key, data.input);
        break;
      case "menuCategory":
        result = await service.changeMenuCategory(db, actor, key, data.input);
        break;
      case "paymentMethods":
        result = await service.setPaymentMethods(db, actor, key, data.input);
        break;
      case "deviceBan":
        result = await service.setCustomerDeviceBan(
          db,
          actor,
          key,
          orderId(),
          data.input,
        );
        break;
      case "qrPolicy":
        result = await service.setQrPolicy(db, actor, key, data.input);
        break;
      case "createRound":
        result = await service.createRound(
          db,
          actor,
          key,
          data.input,
          !actor.application || actor.application === "MASTER",
        );
        break;
      case "editRound":
        result = await service.editRound(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
          !actor.application || actor.application === "MASTER",
        );
        break;
      case "decideRound":
        result = await service.decideRound(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
          !actor.application || actor.application === "MASTER",
        );
        break;
      case "identity":
        result = await service.identityGate(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
        );
        break;
      case "reward":
        result = await service.applyEntitlement(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
          !actor.application || actor.application === "MASTER",
        );
        break;
      case "orderPin":
        result = await service.setOrderPin(db, actor, key, orderId(), data.input);
        break;
      case "reviewRewards":
        result = await service.reviewRewards(
          db,
          actor,
          key,
          orderId(),
          roundId(),
        );
        break;
      case "zeroTotal":
        result = await service.releaseZeroTotal(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
        );
        break;
      case "initiatePayment":
        result = await service.initiatePayment(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
        );
        break;
      case "verifyPayment":
        result = await service.verifyPayment(
          db,
          actor,
          key,
          recordId(),
          data.input,
        );
        break;
      case "postpaid":
        result = await service.authorizePostpaid(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
          !actor.application || actor.application === "MASTER",
        );
        break;
      case "bill":
        result = await service.generateBill(
          db,
          actor,
          key,
          orderId(),
          data.input,
        );
        break;
      case "recordPrint":
        result = await service.recordPrint(db, actor, key, orderId(), data.input);
        break;
      case "tableCapacity":
        result = await service.updateTableCapacity(db, actor, key, data.input);
        break;
      case "customerProfile":
        result = await service.updateCustomerProfile(
          db,
          actor,
          key,
          data.input,
        );
        break;
      case "taxSettings":
        result = await service.saveTaxSettings(db, actor, key, data.input);
        break;
      case "kitchenBulk":
        result=await service.kitchenBulk(db,actor,key,data.input);
        break;
      case "kitchen":
        result = await service.kitchenDecision(
          db,
          actor,
          key,
          recordId(),
          data.input,
        );
        break;
      case "serve":
        result = await service.serveRound(db, actor, key, orderId(), roundId());
        break;
      case "serveSelected":
        result=await service.serveSelected(db,actor,key,data.input);
        break;
      case "webRefund":
        result=await service.submitWebRefund(db,actor,key,orderId(),data.input);
        break;
      case "webRefundDecision":
        result=await service.decideWebRefund(db,actor,key,recordId(),data.input);
        break;
      case "loyaltyCap":
        result=await service.savePlatformLoyaltyCap(db,actor,key,data.input);
        break;
      case "billDefaults":
        result=await service.saveBillDefaults(db,actor,key,data.input);
        break;
      case "kitchenStages":
        result=await service.saveKitchenStages(db,actor,key,data.input);
        break;
      case "completePreparedService":
        result=await service.completePreparedService(db,actor,key,orderId(),roundId(),data.input);
        break;
      case "cancelPrepared":
        result = await service.cancelPreparedRound(db, actor, key, orderId(), roundId(), data.input);
        break;
      case "void":
        result = await service.voidRound(
          db,
          actor,
          key,
          orderId(),
          roundId(),
          data.input,
        );
        break;
      case "openSession":
        result = await service.openSession(db, actor, key, data.input);
        break;
      case "closeSession":
        result = await service.closeSession(
          db,
          actor,
          key,
          recordId(),
          data.input,
        );
        break;
      case "pair":
        result = await service.pairingCode(db, actor, key, recordId());
        break;
      case "merge":
        result = await service.sessionMerge(db, actor, key, data.input);
        break;
      case "demerge":
        result = await service.sessionDemerge(db, actor, key, data.input);
        break;
      case "service":
        result = await service.serviceTask(db, actor, key, data.input);
        break;
      case "menu":
        result = await service.saveMenu(db, actor, key, data.input);
        break;
      case "ingredientEdit":
        result = await service.updateIngredient(db, actor, key, data.input);
        break;
      case "table":
        result = await service.saveTable(db, actor, key, data.input,!actor.application||actor.application==='MASTER');
        break;
      case "renameTable":
        result=await service.renameTable(db,actor,key,data.input);
        break;
      case "outlet":
        result = await service.saveOutlet(db, actor, key, data.input);
        break;
      case "employee":
        result = await service.addEmployee(db, actor, key, data.input);
        break;
      case "employeeAccess":
        result = await service.employeeAccess(
          db,
          actor,
          key,
          recordId(),
          data.input,
        );
        break;
      case "recipe":
        result = await service.saveRecipe(db, actor, key, data.input);
        break;
      case "ingredient":
        result = await service.addIngredient(db, actor, key, data.input);
        break;
      case "stockCounts":
        result = await service.recordStockCounts(db, actor, key, data.input);
        break;
      case "receipt":
        result = await service.receiveStock(
          db,
          actor,
          key,
          data.input,
          !actor.application || actor.application === "MASTER",
        );
        break;
      case "wastage":
        result = await service.wasteStock(db, actor, key, data.input);
        break;
      case "record":
        result = await service.saveRecord(
          db,
          actor,
          key,
          z.string().parse(data.kind),
          data.input,
        );
        break;
      case "recordDecision":
        result = await service.recordDecision(
          db,
          actor,
          key,
          recordId(),
          data.input,
        );
        break;
      case "verifyAudit":
        result = await service.verifyAudit(db, actor);
        break;
      default:
        throw new DomainError("UNKNOWN_ACTION", "Unknown action.", 404);
    }
    return response(result);
  } catch (error) {
    return failure(error);
  }
}
