import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import { type Actor, businessDate } from "@dinerdost/core";
import * as s from "@dinerdost/services";
import { publicMenu } from "../packages/services/src/public-menu";
let db: Database, owner: Actor, foreign: Actor, w: any;
const key = () => randomUUID(),
  future = (hours = 2) => new Date(Date.now() + hours * 3600000).toISOString();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  await db.migrate();
  for (const i of [0, 1]) {
    const a = await s.signup(
      db,
      {
        name: "Ready QA",
        email: `ready-${i}@example.test`,
        password: "ready-food-test-password",
        restaurant: "Ready QA " + i,
        outlet: "Main",
        demo: true,
        qrEnabled: true,
      },
      "ready-" + i,
    );
    const actor = await s.authenticate(db, a.token);
    if (i) foreign = actor;
    else owner = actor;
  }
  w = await s.workspace(db, owner);
});
after(async () => {
  await db?.close();
});
async function dish() {
  const ingredient = await s.addIngredient(db, owner, key(), {
    outletId: w.outletId,
    name: "Prepared ingredient " + key().slice(0, 6),
    unit: "kg",
  });
  const batch = await s.receiveStock(
    db,
    owner,
    key(),
    {
      ingredientId: ingredient.id,
      batchNumber: key(),
      quantityMilli: 10000,
      unitCost: 101,
      reference: "Ready QA receipt",
      expiresAt: future(48),
    },
    true,
  );
  const item = await s.saveMenu(db, owner, key(), {
    outletId: w.outletId,
    name: "Ready dish " + key().slice(0, 6),
    category: "Food",
    price: 20000,
    taxBps: 0,
    station: "Main kitchen",
    recipe: [{ id: ingredient.id, quantityMilli: 1000 }],
  });
  return { ingredientId: ingredient.id, batchId: batch.id, itemId: item.id };
}
async function order(itemId: string, quantity = 2, web = true) {
  return s.createRound(
    db,
    owner,
    key(),
    {
      outletId: w.outletId,
      type: "TAKEAWAY",
      customer: { name: "Ready Guest", phone: "9123456790" },
      items: [{ itemId, quantity }],
    },
    web,
  );
}
async function detail(id: string) {
  return s.getOrder(db, owner, id);
}
async function ready(itemId: string, quantity = 2) {
  let o = await order(itemId, quantity);
  for (const t of (await s.workspace(db, owner)).tickets.filter(
    (t: any) => t.order_id === o.id,
  )) {
    await s.kitchenDecision(db, owner, key(), t.id, { state: "PREPARING" });
    await s.kitchenDecision(db, owner, key(), t.id, { state: "READY" });
  }
  return detail(o.id);
}
async function reallocate(o: any, useBy = future()) {
  const input = {
      version: o.rounds[0].version,
      reason: "Guest cancelled; prepared portions retained",
      reallocate: true,
      useBy,
    },
    k = key();
  const a = await s.cancelPreparedRound(
    db,
    owner,
    k,
    o.id,
    o.rounds[0].id,
    input,
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        await s.cancelPreparedRound(db, owner, k, o.id, o.rounds[0].id, input),
      ),
    ),
    JSON.parse(JSON.stringify(a)),
  );
  return a;
}
async function rows(table: string, where: string, params: any[]) {
  return db
    .transaction(owner.restroId, (tx) =>
      tx.query(`SELECT * FROM ${table} WHERE ${where}`, params),
    )
    .then((r) => r.rows as any[]);
}

test("prepared food cancellation retains exact stock/cost history, publishes ready stock once and counts source orders only", async () => {
  const d = await dish(),
    o = await ready(d.itemId);
  const rawBefore = await rows("stock_movements", "round_id=$1", [
      o.rounds[0].id,
    ]),
    costBefore = await rows("order_item_costs", "round_id=$1", [
      o.rounds[0].id,
    ]);
  const cancelled = await reallocate(o);
  assert.equal(cancelled.status, "VOIDED");
  assert.equal(cancelled.rounds[0].kot_status, "CANCELLED");
  assert.deepEqual(
    await rows("stock_movements", "round_id=$1", [o.rounds[0].id]),
    rawBefore,
  );
  assert.deepEqual(
    await rows("order_item_costs", "round_id=$1", [o.rounds[0].id]),
    costBefore,
  );
  const b = (
    await rows("prepared_food_batches", "source_round_id=$1", [o.rounds[0].id])
  )[0];
  assert.equal(Number(b.on_hand), 2000);
  assert.equal(Number(b.remaining_value), 202);
  const catalog = await db.transaction(owner.restroId, (tx) =>
    publicMenu(tx, w.outletId),
  );
  assert.equal(catalog.items[0].ready_to_serve, true);
  assert.ok(
    catalog.items.some(
      (i) => i.ready_to_serve && Number(i.ready_quantity) === 2000,
    ),
  );
  const view = await s.workspace(db, owner);
  assert.equal(view.orders.find((x: any) => x.id === o.id).reallocated, true);
  assert.ok(Number(view.orderCounts.Reallocated) > 0);
  assert.equal(
    view.tickets.some((x: any) => x.order_id === o.id),
    false,
  );
  await assert.rejects(
    () =>
      s.cancelPreparedRound(db, owner, key(), o.id, o.rounds[0].id, {
        version: cancelled.rounds[0].version,
        reason: "Try duplicate transfer",
        reallocate: true,
        useBy: future(),
      }),
    { code: "CANCELLATION_BLOCKED" },
  );
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});

test("web customers cannot see or order synthetic ready food while staff and legacy contracts retain availability and immutable stock", async () => {
 const d=await dish(),original=await ready(d.itemId);await reallocate(original);
 const item=(await s.workspace(db,owner)).menu.find((m:any)=>m.ready_food_batch_id&&m.name===original.rounds[0].items[0].name);
 const created=await s.saveTable(db,owner,key(),{outletId:w.outletId,label:'Web ready policy',seats:2,floor:'Main floor'}),table=(await s.workspace(db,owner)).tables.find((t:any)=>t.id===created.id);
 await s.openSession(db,owner,key(),{tableId:table.id,guests:1});
 const device='web-ready-device',grant=await s.connectGuest(db,table.public_key,device,'web-ready-ip');
 const legacy=await s.guestCatalog(db,table.public_key,grant.token,device),web=await s.guestCatalog(db,table.public_key,grant.token,device,true);
 assert(legacy.menu.some((m:any)=>m.id===item.id));assert(!web.menu.some((m:any)=>m.ready_to_serve));assert(web.menu.some((m:any)=>m.id===d.itemId));
 const brand=await s.saveRecord(db,owner,key(),'brands',{outletId:w.outletId,title:'Ready policy kitchen',data:{description:'Synthetic QA',active:true}}),slug='ready-policy-'+key().slice(0,8);
 await s.saveStorefront(db,owner,key(),{outletId:w.outletId,brandId:brand.id,slug,published:true});
 assert(!(await s.storefrontCatalog(db,slug)).menu.some((m:any)=>m.ready_to_serve));
 const visitor=await s.connectStorefront(db,slug,device,'web-ready-store-ip');
 const snapshot=async()=>db.transaction(owner.restroId,async tx=>({orders:(await tx.query('SELECT * FROM orders ORDER BY id')).rows,rounds:(await tx.query('SELECT * FROM order_rounds ORDER BY id')).rows,stock:(await tx.query('SELECT * FROM prepared_food_batches ORDER BY id')).rows,raw:(await tx.query('SELECT * FROM stock_movements ORDER BY id')).rows,invoices:(await tx.query('SELECT * FROM invoices ORDER BY id')).rows})),before=await snapshot();
 const input={name:'Web Ready Guest',phone:'9123456799',items:[{itemId:item.id,quantity:1}]};
 await assert.rejects(s.guestSubmit(db,table.public_key,grant.token,device,key(),input,true),{code:'ITEM_UNAVAILABLE'});
 await assert.rejects(s.submitStorefrontOrder(db,slug,visitor.token,device,key(),input),{code:'ITEM_UNAVAILABLE'});
 assert.deepEqual(await snapshot(),before);
 const staff=await order(item.id,1);assert.equal(staff.rounds[0].kot_status,'READY');assert.equal(Number(staff.rounds[0].cogs),101);
});

test("prepared resale is ready immediately, consumes no second raw ingredients, preserves cost and settles through normal rules", async () => {
  const d = await dish(),
    original = await ready(d.itemId);
  await reallocate(original);
  let current = await s.workspace(db, owner);
  const item = current.menu.find(
    (m: any) =>
      m.ready_food_batch_id && m.name === original.rounds[0].items[0].name,
  );
  const rawBefore = await rows("stock_movements", "ingredient_id=$1", [
    d.ingredientId,
  ]);
  await assert.rejects(()=>s.saveRecipe(db,owner,key(),{itemId:item.id,ingredients:[{id:d.ingredientId,quantityMilli:1000}]}),{code:'PREPARED_MENU_READ_ONLY'});
  let resale = await order(item.id, 1);
  assert.equal(resale.rounds[0].kot_status, "READY");
  assert.equal(Number(resale.rounds[0].cogs), 101);
  assert.deepEqual(
    await rows("stock_movements", "ingredient_id=$1", [d.ingredientId]),
    rawBefore,
  );
  assert.equal(
    Number(
      (await rows("order_item_costs", "round_id=$1", [resale.rounds[0].id]))[0]
        .cost,
    ),
    101,
  );
  await s.reviewRewards(db, owner, key(), resale.id, resale.rounds[0].id);
  resale = await detail(resale.id);
  await s.recordPayment(db, owner, key(), resale.id, resale.rounds[0].id, {
    version: resale.rounds[0].version,
    method: "CASH",
    amount: Number(resale.rounds[0].payable),
  });
  resale = await detail(resale.id);
  await assert.rejects(
    () =>
      s.cancelPreparedRound(db, owner, key(), resale.id, resale.rounds[0].id, {
        version: resale.rounds[0].version,
        reason: "Paid food cannot transfer",
        reallocate: true,
        useBy: future(),
      }),
    { code: "UNPAID_ORDER_REQUIRED" },
  );
  await s.serveRound(db, owner, key(), resale.id, resale.rounds[0].id);
  const invoice = await s.generateBill(db, owner, key(), resale.id, {
    final: true,
  });
  assert.equal(invoice.document_type, "FINAL_TAX_INVOICE");
  assert.equal((await detail(resale.id)).customerVisits, 1);
  const b = (
    await rows("prepared_food_batches", "id=$1", [item.ready_food_batch_id])
  )[0];
  assert.equal(Number(b.on_hand), 1000);
  assert.equal(Number(b.reserved), 0);
  assert.equal(Number(b.remaining_value), 101);
});

test("prepared-food availability prevents overselling and expired held portions cannot be released or served", async () => {
  const d = await dish(),
    o = await ready(d.itemId);
  await reallocate(o);
  const item = (await s.workspace(db, owner)).menu.find(
    (m: any) => m.ready_food_batch_id && m.name === o.rounds[0].items[0].name,
  );
  const results = await Promise.allSettled([
    order(item.id, 2),
    order(item.id, 2),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(results.filter((x) => x.status === "rejected").length, 1);
  const sold = (
    results.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<any>
  ).value;
  await db.query(
    "UPDATE prepared_food_batches SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [item.ready_food_batch_id],
  );
  await assert.rejects(
    () => s.serveRound(db, owner, key(), sold.id, sold.rounds[0].id),
    { code: "FOOD_EXPIRED" },
  );
  assert.equal(
    Number(
      (
        await rows("prepared_food_batches", "id=$1", [item.ready_food_batch_id])
      )[0].on_hand,
    ),
    0,
  );
});

test("prepared reallocation checks manager, web application, tenant, version, kitchen readiness and original food deadline", async () => {
  const d = await dish();
  let o = await order(d.itemId);
  let input = {
    version: o.rounds[0].version,
    reason: "Ready QA cancellation",
    reallocate: true,
    useBy: future(),
  };
  await assert.rejects(
    () =>
      s.cancelPreparedRound(
        db,
        { ...owner, role: "CASHIER" },
        key(),
        o.id,
        o.rounds[0].id,
        input,
      ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.cancelPreparedRound(
        db,
        { ...owner, application: "POS" },
        key(),
        o.id,
        o.rounds[0].id,
        input,
      ),
    { code: "APPLICATION_FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.cancelPreparedRound(db, foreign, key(), o.id, o.rounds[0].id, input),
    { code: "NOT_FOUND" },
  );
  await assert.rejects(
    () => s.cancelPreparedRound(db, owner, key(), o.id, o.rounds[0].id, input),
    { code: "FOOD_NOT_READY" },
  );
  for (const t of (await s.workspace(db, owner)).tickets.filter(
    (t: any) => t.order_id === o.id,
  )) {
    await s.kitchenDecision(db, owner, key(), t.id, { state: "PREPARING" });
    await s.kitchenDecision(db, owner, key(), t.id, { state: "READY" });
  }
  o = await detail(o.id);
  input = { ...input, version: o.rounds[0].version };
  await assert.rejects(
    () =>
      s.cancelPreparedRound(db, owner, key(), o.id, o.rounds[0].id, {
        ...input,
        version: 0,
      }),
    { name: "ZodError" },
  );
  await assert.rejects(
    () =>
      s.cancelPreparedRound(db, owner, key(), o.id, o.rounds[0].id, {
        ...input,
        useBy: new Date(Date.now() - 1000).toISOString(),
      }),
    { code: "USE_BY_REQUIRED" },
  );
  await reallocate(o, future(1));
  const item = (await s.workspace(db, owner)).menu.find(
      (m: any) => m.ready_food_batch_id && m.name === o.rounds[0].items[0].name,
    ),
    resale = await order(item.id, 1);
  await assert.rejects(
    () =>
      s.cancelPreparedRound(db, owner, key(), resale.id, resale.rounds[0].id, {
        ...input,
        version: resale.rounds[0].version,
        useBy: future(2),
      }),
    { code: "USE_BY_EXTENSION_BLOCKED" },
  );
});

test("unpaid cooked cancellation records waste without restoring raw stock or offering ready portions", async () => {
  const d = await dish(),
    o = await order(d.itemId);
  const raw = await rows("stock_batches", "id=$1", [d.batchId]);
  await s.cancelPreparedRound(db, owner, key(), o.id, o.rounds[0].id, {
    version: o.rounds[0].version,
    reason: "Guest cancelled during preparation",
    reallocate: false,
  });
  assert.deepEqual(await rows("stock_batches", "id=$1", [d.batchId]), raw);
  assert.equal(
    (
      await rows("prepared_food_batches", "source_round_id=$1", [
        o.rounds[0].id,
      ])
    ).length,
    0,
  );
  const waste = (
    await rows("prepared_food_movements", "round_id=$1 AND kind='WASTAGE'", [
      o.rounds[0].id,
    ])
  )[0];
  assert.equal(Number(waste.cost), 202);
  assert.equal(Number(waste.delta_milli), -2000);
});

test("automatic raw expiry writes remaining value once and preserves held needs so a payment cannot release missing ingredients", async () => {
  const d = await dish();
  let held = await order(d.itemId, 2, false);
  held = await s.decideRound(db, owner, key(), held.id, held.rounds[0].id, {
    version: held.rounds[0].version,
    decision: "ACCEPT",
  });
  assert.equal(held.rounds[0].kot_status, "HELD");
  await db.query(
    "UPDATE stock_batches SET expires_at=now()-interval '1 minute',remaining_value=777 WHERE id=$1",
    [d.batchId],
  );
  await s.workspace(db, owner);
  await s.workspace(db, owner);
  const batch = (await rows("stock_batches", "id=$1", [d.batchId]))[0];
  assert.equal(Number(batch.on_hand), 0);
  assert.equal(Number(batch.reserved), 0);
  assert.equal(Number(batch.remaining_value), 0);
  const waste = await rows(
    "stock_movements",
    "batch_id=$1 AND kind='WASTAGE'",
    [d.batchId],
  );
  assert.equal(waste.length, 1);
  assert.equal(Number(waste[0].cost), 777);
  assert.equal(Number(waste[0].delta_milli), -10000);
  await s.reviewRewards(db, owner, key(), held.id, held.rounds[0].id);
  held = await detail(held.id);
  await assert.rejects(
    () =>
      s.recordPayment(db, owner, key(), held.id, held.rounds[0].id, {
        version: held.rounds[0].version,
        method: "CASH",
        amount: Number(held.rounds[0].payable),
      }),
    { code: "STOCK_EXPIRED" },
  );
  assert.equal(
    (await rows("payment_attempts", "order_id=$1", [held.id])).length,
    0,
  );
  assert.equal(
    (await rows("order_item_costs", "round_id=$1", [held.rounds[0].id])).length,
    0,
  );
  assert.equal((await detail(held.id)).rounds[0].kot_status, "HELD");
});

test("expired prepared stock moves to cooked waste once, releases held portions, and retains unknown cost instead of inventing it", async () => {
  const item = w.menu.find(
    (m: any) => !w.recipes.some((r: any) => r.item_id === m.id),
  );
  const original = await ready(item.id, 1);
  await reallocate(original);
  const sku = (await s.workspace(db, owner)).menu.find(
    (m: any) =>
      m.ready_food_batch_id && m.name === original.rounds[0].items[0].name,
  );
  let held = await order(sku.id, 1, false);
  held = await s.decideRound(db, owner, key(), held.id, held.rounds[0].id, {
    version: held.rounds[0].version,
    decision: "ACCEPT",
  });
  await db.query(
    "UPDATE prepared_food_batches SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [sku.ready_food_batch_id],
  );
  await s.workspace(db, owner);
  await s.workspace(db, owner);
  const waste = await rows(
    "prepared_food_movements",
    "batch_id=$1 AND kind='WASTAGE'",
    [sku.ready_food_batch_id],
  );
  assert.equal(waste.length, 1);
  assert.equal(waste[0].cost, null);
  assert.equal(Number(waste[0].delta_milli), 1000 * -1);
  assert.equal(
    (await s.workspace(db, owner)).menu.some((m: any) => m.id === sku.id),
    false,
  );
  await s.reviewRewards(db, owner, key(), held.id, held.rounds[0].id);
  held = await detail(held.id);
  await assert.rejects(
    () =>
      s.recordPayment(db, owner, key(), held.id, held.rounds[0].id, {
        version: held.rounds[0].version,
        method: "CASH",
        amount: Number(held.rounds[0].payable),
      }),
    { code: "READY_FOOD_UNAVAILABLE" },
  );
});

test("customer listing sorts complete outlet visits, searches full phone server-side with masked responses, and paginates beyond 50", async () => {
  const ids: string[] = [];
  await db.transaction(owner.restroId, async (tx) => {
    for (let i = 0; i < 53; i++) {
      const id = key();
      ids.push(id);
      await tx.query(
        "INSERT INTO customers(id,restro_id,name,phone) VALUES($1,$2,$3,$4)",
        [
          id,
          owner.restroId,
          "Visit QA " + String(i).padStart(2, "0"),
          "+91800000" + String(i).padStart(4, "0"),
        ],
      );
      for (let n = 0; n < (i === 52 ? 3 : 1); n++)
        await tx.query(
          "INSERT INTO orders(id,restro_id,outlet_id,customer_id,customer_snapshot,source,type,status) VALUES($1,$2,$3,$4,jsonb_build_object('name','Visit QA','phone','+918000000000'),'CASHIER_POS','TAKEAWAY','SETTLED')",
          [key(), owner.restroId, w.outletId, id],
        );
    }
  });
  const first = await s.listCustomers(db, owner, {
    outletId: w.outletId,
    query: "Visit QA",
    page: 0,
  });
  assert.equal(first.items.length, 50);
  assert.equal(first.items[0].id, ids[52]);
  assert.equal(Number(first.items[0].visits), 3);
  assert.equal(first.hasMore, true);
  const second = await s.listCustomers(db, owner, {
    outletId: w.outletId,
    query: "Visit QA",
    page: 1,
  });
  assert.equal(second.items.length, 3);
  assert.equal(second.hasMore, false);
  const phone = await s.listCustomers(db, owner, {
    outletId: w.outletId,
    query: "8000000052",
  });
  assert.equal(phone.items.length, 1);
  assert.equal(phone.items[0].id, ids[52]);
  assert.notEqual(phone.items[0].phone, "+918000000052");
  assert.equal(
    (
      await s.listCustomers(db, foreign, {
        outletId: (await s.workspace(db, foreign)).outletId,
        query: "Visit QA",
      })
    ).total,
    0,
  );
  await assert.rejects(
    () =>
      s.listCustomers(
        db,
        { ...owner, role: "KITCHEN" },
        { outletId: w.outletId, query: "" },
      ),
    { code: "FORBIDDEN" },
  );
});

test("report chart distribution reconciles issued invoices and obeys period, tenant and outlet scope", async () => {
  const report = await s.financialReport(db, owner, {
    outletId: w.outletId,
    from: businessDate(),
    to: businessDate(),
  });
  assert.equal(report.distribution.length, 6);
  assert.equal(
    report.distribution.reduce((sum, row) => sum + Number(row.orders), 0),
    report.orders,
  );
  const widths = report.distribution.map(
    (row) => Number(row.upper) - Number(row.lower),
  );
  assert.ok(widths.every((width) => width === widths[0] && width > 0));
  const foreignReport = await s.financialReport(db, foreign, {
    from: businessDate(),
    to: businessDate(),
  });
  assert.equal(foreignReport.orders, 0);
  assert.equal(
    foreignReport.distribution.reduce(
      (sum, row) => sum + Number(row.orders),
      0,
    ),
    0,
  );
});

test("historical provisional print records an audited reprint without issuing a new provisional document", async () => {
  const d = await dish(),
    o = await ready(d.itemId),
    bill = await s.generateBill(db, owner, key(), o.id, { final: false });
  const before = await rows("invoices", "order_id=$1", [o.id]);
  await s.recordPrint(db, owner, key(), o.id, { invoiceId: bill.id });
  assert.deepEqual(await rows("invoices", "order_id=$1", [o.id]), before);
  const other = await order(d.itemId, 1);
  await assert.rejects(
    () => s.recordPrint(db, owner, key(), other.id, { invoiceId: bill.id }),
    { code: "NOT_FOUND" },
  );
});
